// Deterministic contract-completeness check (the contract half of expand/contract,
// software-design-principles hard rule 9). When a migration DROPS or RENAMES a
// column/table, the running code must stop referencing it in the SAME change (ORM
// models, repositories/queries, serializers/DTOs, templates), or the app emits SQL
// for something the database no longer has and crashes at runtime ("column ... does
// not exist") even though the migration "succeeded".
//
// This catches that DETERMINISTICALLY, with no model judgment: parse the project's
// migrations for the net set of dropped symbols (dropped and not later re-added, so
// an expand/contract that re-adds is not flagged), then grep the production code tree
// for residual references. A finding is a precise file:line list the Driver can
// repair directly – the self-heal that removes model variance from the contract loop
// (the Navigator assess used to have to both notice AND localize it). Mirrors the
// `layering-clean` / `imports-clean` deterministic gates.
//
// Static + hermetic by design: it reads the migration files + the code tree, never
// the live database (the migration's own drop/add statements ARE the contract delta).

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { splitPyBlocks, blockDefName } from "../experiment/py-source.js";

import { artifactRootsRegexAlternation } from "../../consort/config/consort-paths.js";
import { netDroppedColumns } from "./migration-columns.js";

// The workflow bookkeeping roots (.consort + legacy), as a regex fragment derived
// from the single source of truth – never hardcoded here.
const ARTIFACT_ROOTS_RE = artifactRootsRegexAlternation();

export interface ContractCleanArgs {
  /** Project working-tree root. */
  projectDir: string;
  /** Migration dirs to scan (relative to projectDir). Default: common locations. */
  migrationDirs?: string[];
  /** Production code dirs to scan for residual references (relative to projectDir).
   *  Default: app, src, templates, lib. Tests + migrations are always excluded. */
  codeDirs?: string[];
  /** Test dirs to scan for prior tests referencing a dropped symbol (relative to
   *  projectDir). Default: tests, test. Used by supersededTestCandidates. */
  testDirs?: string[];
}

export interface ContractViolation {
  /** Project-relative file path. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** The dropped symbol still referenced. */
  symbol: string;
  /** The offending source line (trimmed). */
  text: string;
}

export interface ContractCleanResult {
  clean: boolean;
  /** Net-dropped symbols (dropped by a migration, not re-added by a later one). */
  droppedSymbols: string[];
  /** Production-code references to a net-dropped symbol. */
  violations: ContractViolation[];
  /** A precise, Driver-actionable repair directive (the file:line list + hard rule 9),
   *  or undefined when clean. This is what gets recorded as the green-failure fixDirective. */
  remediation?: string;
}

const DEFAULT_MIGRATION_DIRS = ["alembic/versions", "migrations", "db/migrations", "src/migrations"];
const DEFAULT_CODE_DIRS = ["app", "src", "lib", "templates"];
const DEFAULT_TEST_DIRS = ["tests", "test"];
const CLIENT_TEST_DIRS = ["client/tests"];
const CODE_EXTS = new Set([".py", ".ts", ".tsx", ".js", ".jsx", ".html", ".jinja", ".jinja2", ".sql"]);
// Never scan these for residual refs (the migration legitimately names the dropped
// symbol; tests are refactored via supersession, not this gate; junk dirs).
const EXCLUDE_DIR = new RegExp(
  `(^|/)(node_modules|\\.git|\\.venv|venv|__pycache__|${ARTIFACT_ROOTS_RE}|\\.lakebase|dist|build|tests?|alembic|migrations)(/|$)`,
);
// Junk/vendor dirs to skip even when the caller WANTS to descend into tests (the
// supersession-candidate scan): everything above EXCEPT tests?/alembic/migrations.
const EXCLUDE_DIR_JUNK = new RegExp(
  `(^|/)(node_modules|\\.git|\\.venv|venv|__pycache__|${ARTIFACT_ROOTS_RE}|\\.lakebase|dist|build)(/|$)`,
);

function walk(dir: string, keep: (abs: string) => boolean, out: string[] = [], excludeDir: RegExp = EXCLUDE_DIR): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = join(dir, e);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (!excludeDir.test(abs)) walk(abs, keep, out, excludeDir);
    } else if (st.isFile() && keep(abs)) {
      out.push(abs);
    }
  }
  return out;
}

/**
 * The net set of columns a migration dropped and did NOT re-add — the "dropped
 * symbols" of a contract delta. Delegates to the shared migration-columns parser so
 * this check and test-smell-clean's `collectDroppedColumns` read migrations the SAME
 * way (one source of truth for the drop/add regexes + forward-region extraction).
 */
export function netDroppedSymbols(projectDir: string, migrationDirs = DEFAULT_MIGRATION_DIRS): string[] {
  return netDroppedColumns(projectDir, migrationDirs);
}

/** A word-boundary matcher for a symbol used as an identifier (not a substring). */
function symbolRefRegex(symbol: string): RegExp {
  return new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
}

/** Scan `dirs` (relative to projectDir) for source lines that reference any of the
 *  `dropped` symbols, returning one ContractViolation per matching line. Shared by
 *  the production-code check (checkContractClean) and the prior-test scan
 *  (supersededTestCandidates) so both localize refs the identical way. */
function scanSymbolRefs(projectDir: string, dirs: string[], dropped: string[], excludeDir: RegExp = EXCLUDE_DIR): ContractViolation[] {
  const matchers = dropped.map((s) => ({ symbol: s, re: symbolRefRegex(s) }));
  const hits: ContractViolation[] = [];
  for (const cd of dirs) {
    const abs = join(projectDir, cd);
    if (!existsSync(abs)) continue;
    for (const file of walk(abs, (p) => CODE_EXTS.has(extname(p)), [], excludeDir)) {
      let lines: string[];
      try {
        lines = readFileSync(file, "utf8").split("\n");
      } catch {
        continue;
      }
      lines.forEach((text, i) => {
        for (const { symbol, re } of matchers) {
          if (re.test(text)) {
            hits.push({ file: relative(projectDir, file), line: i + 1, symbol, text: text.trim().slice(0, 200) });
          }
        }
      });
    }
  }
  return hits;
}

export function checkContractClean(args: ContractCleanArgs): ContractCleanResult {
  const { projectDir } = args;
  const dropped = netDroppedSymbols(projectDir, args.migrationDirs);
  if (dropped.length === 0) return { clean: true, droppedSymbols: [], violations: [] };

  const violations = scanSymbolRefs(projectDir, args.codeDirs ?? DEFAULT_CODE_DIRS, dropped);
  if (violations.length === 0) return { clean: true, droppedSymbols: dropped, violations: [] };

  const list = violations.map((v) => `  ${v.file}:${v.line}  [${v.symbol}]  ${v.text}`).join("\n");
  const syms = [...new Set(violations.map((v) => v.symbol))].join(", ");
  const remediation =
    `CONTRACT-INCOMPLETENESS (software-design-principles hard rule 9): a migration DROPPED ${syms}, but the` +
    ` running code still references it, so the app emits SQL for a column the database no longer has and crashes` +
    ` ("${syms} does not exist") even though the migration succeeded. Remove or replace EVERY reference below in` +
    ` the SAME change – the ORM model field, every query/repository, every serializer/DTO, and every template/view` +
    ` – so the code matches the migrated schema. Do NOT edit the migration or any test to hide this; fix the` +
    ` production code:\n${list}`;
  return { clean: false, droppedSymbols: dropped, violations, remediation };
}

export interface SupersededTestCandidatesResult {
  /** Net-dropped symbols (same source as checkContractClean). */
  droppedSymbols: string[];
  /** Prior-test lines that still reference a dropped symbol (the supersession candidates). */
  candidates: ContractViolation[];
  /** A Navigator-actionable advisory naming those test files, or undefined when none. */
  advisory?: string;
}

/**
 * Pre-compute the PRIOR TESTS that reference a migration-dropped symbol, so the
 * Navigator's assess turn does not have to SEARCH the test tree for supersession
 * candidates: it is handed the exact file:line list (the test-side counterpart to
 * checkContractClean's production-code localization). A column drop supersedes the
 * prior tests that asserted that column; the Navigator flags EXACTLY these
 * (path (a)) and the Driver permissively refactors them alongside the code fix.
 * Deterministic, advisory. Empty when nothing was dropped or no test references it.
 */
/** A dropped snake_case DB column surfaces on the CLIENT under other casings – the
 *  kebab-case test id (`data-testid="inventory-code"`) and the camelCase field
 *  (`row.inventoryCode`) – which a plain `\binventory_code\b` scan never matches.
 *  Return the snake form plus those variants so a client test asserting the dropped
 *  column in ANY casing is pre-localized (the F6/S2 sku-detail.spec.ts gap the
 *  backend-only, exact-snake scan missed). A single-word symbol has no variants. */
function clientCaseVariants(symbol: string): string[] {
  const parts = symbol.split("_").filter(Boolean);
  if (parts.length < 2) return [symbol];
  const kebab = parts.join("-");
  const camel = parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  return [...new Set([symbol, kebab, camel])];
}

/** Scan the CLIENT test dirs for prior tests asserting a dropped symbol in ANY
 *  casing (snake / kebab / camel). Separate from the backend scan so exact-snake
 *  matching stays precise there (a Python test never uses kebab/camel column names),
 *  while a client e2e/Vitest spec – which does – is still pre-localized. Reports the
 *  ORIGINAL dropped symbol so the advisory stays coherent. */
function scanClientSupersededRefs(projectDir: string, dropped: string[]): ContractViolation[] {
  const matchers = dropped.flatMap((s) => clientCaseVariants(s).map((v) => ({ symbol: s, re: symbolRefRegex(v) })));
  const hits: ContractViolation[] = [];
  for (const cd of CLIENT_TEST_DIRS) {
    const abs = join(projectDir, cd);
    if (!existsSync(abs)) continue;
    for (const file of walk(abs, (p) => CODE_EXTS.has(extname(p)), [], EXCLUDE_DIR_JUNK)) {
      let lines: string[];
      try {
        lines = readFileSync(file, "utf8").split("\n");
      } catch {
        continue;
      }
      lines.forEach((text, i) => {
        for (const { symbol, re } of matchers) {
          if (re.test(text)) {
            hits.push({ file: relative(projectDir, file), line: i + 1, symbol, text: text.trim().slice(0, 200) });
          }
        }
      });
    }
  }
  return hits;
}

export function supersededTestCandidates(args: ContractCleanArgs): SupersededTestCandidatesResult {
  const { projectDir } = args;
  const dropped = netDroppedSymbols(projectDir, args.migrationDirs);
  if (dropped.length === 0) return { droppedSymbols: [], candidates: [] };
  // Descend INTO the test dirs (the default EXCLUDE_DIR skips tests?/ for the
  // production scan; here they are exactly what we want), still skipping vendor junk.
  // Backend tests: exact snake_case (precise). Client tests: ALSO the kebab/camel
  // casings the column surfaces as on the frontend (the sku-detail e2e gap).
  const candidates = [
    ...scanSymbolRefs(projectDir, args.testDirs ?? DEFAULT_TEST_DIRS, dropped, EXCLUDE_DIR_JUNK),
    ...scanClientSupersededRefs(projectDir, dropped),
  ];
  if (candidates.length === 0) return { droppedSymbols: dropped, candidates: [] };
  const syms = [...new Set(candidates.map((c) => c.symbol))].join(", ");
  const list = candidates.map((c) => `  ${c.file}:${c.line}  [${c.symbol}]  ${c.text}`).join("\n");
  const advisory =
    `SUPERSEDED-TEST CANDIDATES (pre-localized; you do NOT need to search): the migration DROPPED ${syms}, and` +
    ` these PRIOR test lines still assert it, so the new AC supersedes them. Flag EXACTLY these test file(s) as` +
    ` superseded (path (a)) so the Driver may permissively refactor them in the SAME repair turn as the code fix.` +
    ` Do NOT hand-edit them to force green:\n${list}`;
  return { droppedSymbols: dropped, candidates, advisory };
}

export interface SupersededPartition {
  /** PURE: a `.py` test file where EVERY test function references a dropped symbol, so the whole file
   *  is about the now-dropped feature. Deterministically retireable (deleted) WITHOUT the LLM sweep —
   *  the surviving behavior, if any, is re-covered by the current story's own ACs. */
  pureRemovable: string[];
  /** MIXED: the file has at least one SURVIVING test function (one that does not reference a dropped
   *  symbol), OR it is not Python (client TS/e2e — not block-classified here). These need the LLM
   *  sweep's per-assertion judgment ("update OR remove the stale lines, keep the valid ones"). */
  mixed: string[];
}

/**
 * Deterministically split superseded-test files into PURE (whole-file-superseded Python test files,
 * safe to retire without an LLM) and MIXED (need the LLM's surgical per-assertion retarget). This is
 * the first half of the sweep HYBRID: the LLM only has to touch the mixed files, so a run whose
 * superseded set is mostly dedicated-feature test files (the common case for a dropped column) skips
 * most — or all — of the minutes-long sweep turn.
 *
 * A file is PURE only when EVERY test function in it references a dropped symbol — a conservative,
 * file-level rule: if even one test function survives, the file is MIXED and goes to the LLM (which can
 * remove the stale tests while keeping the survivors). A file with no recognizable test function, or a
 * read error, is MIXED (fail safe toward the LLM). NOTE the residual judgment this trades away: a PURE
 * file's tests are REMOVED, not RETARGETED — correct when the dropped feature is gone for good, but it
 * does not rewrite a test onto the surviving columns. That rewrite, when the behavior persists, is the
 * current story's ACs' job (they author the batch/serial tests), not a retarget of the prior test.
 */
export function partitionSupersededFiles(
  projectDir: string,
  candidates: { file: string }[],
  droppedSymbols: string[],
): SupersededPartition {
  const files = [...new Set(candidates.map((c) => c.file))];
  const pureRemovable: string[] = [];
  const mixed: string[] = [];
  if (droppedSymbols.length === 0) return { pureRemovable, mixed: files };
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const symRe = new RegExp(`\\b(${droppedSymbols.map(esc).join("|")})\\b`);
  for (const f of files) {
    if (!f.endsWith(".py")) {
      mixed.push(f); // client TS/e2e — not block-classified; the LLM handles any casing variants
      continue;
    }
    let src: string;
    try {
      src = readFileSync(join(projectDir, f), "utf8");
    } catch {
      mixed.push(f); // unreadable -> fail safe to the LLM
      continue;
    }
    const testFns = splitPyBlocks(src).blocks.filter((b) => blockDefName(b)?.startsWith("test"));
    if (testFns.length === 0) {
      mixed.push(f); // no recognizable test fn -> let the LLM decide
      continue;
    }
    const everyTestTouches = testFns.every((b) => symRe.test(b.lines.join("\n")));
    (everyTestTouches ? pureRemovable : mixed).push(f);
  }
  return { pureRemovable, mixed };
}
