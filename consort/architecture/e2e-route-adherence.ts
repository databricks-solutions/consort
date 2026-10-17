// e2e-route-adherence: a deterministic scan of authored Playwright E2E specs for the
// route-glob<->module collision that dead-locks a UI build.
//
// The failure (stockflow-3-88 T20): a spec mocks an API with a BROAD glob —
// `page.route("**/api/stock**", ...)`. Under the Vite dev server the app's OWN ES
// module is served from the same origin at `/src/api/stock.ts`, and that glob matches
// the MODULE request too. Playwright fulfills the module with the mock's JSON, the
// browser rejects it ("Failed to load module script: MIME type application/json"), the
// SPA never boots, and the behavior under test (e.g. an empty-state) can NEVER render.
// The app is correct; the TEST is the defect — so no product change makes it GREEN and
// the cycle dead-locks. The fix is to scope the intercept to the API pathname:
//   page.route((url) => new URL(url).pathname === "/api/stock", ...)
//
// This check flags a `page.route` STRING glob whose Playwright match would ALSO catch a
// `client/src/**` module's dev URL. A URL-matcher FUNCTION (the correct form) is a
// non-string first arg and is never flagged. Precise, not a proxy: `**/api/stock**`
// matches `/src/api/stock.ts` and is flagged; `**/api/stock` (no trailing wildcard) does
// NOT match the `.ts` module URL and is left alone. No client tree => clean no-op.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface E2eRouteViolation {
  /** The E2E spec (project-relative) that holds the over-broad route glob. */
  spec: string;
  /** The offending glob string passed to page.route. */
  glob: string;
  /** The client/src module whose dev URL the glob also matches (the collision). */
  module: string;
  /** Actionable remediation, ready to surface to the author. */
  remediation: string;
}

export interface E2eRouteResult {
  ok: boolean;
  violations: E2eRouteViolation[];
}

const CLIENT_SRC = join("client", "src");
const E2E_DIR = join("client", "tests", "e2e");
const SKIP_DIRS = new Set(["node_modules", "dist", ".venv", "__pycache__", ".git"]);

/** Recursively collect files under `root` matching `pred` (bounded; skips vendor dirs). */
function walk(root: string, pred: (name: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(root)) return out;
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(root, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(abs, pred, out);
    else if (pred(name)) out.push(abs);
  }
  return out;
}

/** Convert a Playwright URL glob to an anchored RegExp: `**` matches any characters
 *  (incl. `/`), `*` matches any characters except `/`; everything else is literal. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
      } else {
        re += "[^/]*";
      }
    } else {
      re += c.replace(/[.+?^${}()|[\]\\/-]/g, "\\$&");
    }
  }
  return new RegExp("^" + re + "$");
}

/** Extract every STRING first-arg passed to `page.route(...)` (single/double/backtick).
 *  A matcher FUNCTION or RegExp first-arg is not a string literal and is skipped. */
function extractRouteGlobs(specSource: string): string[] {
  const globs: string[] = [];
  const re = /\bpage\s*\.\s*route\s*\(\s*(['"`])([^'"`]*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(specSource)) !== null) globs.push(m[2]);
  return globs;
}

/** Scan the project's Playwright E2E specs for a route glob that also matches a
 *  `client/src/**` module's Vite dev URL (the SPA-boot-breaking collision). */
export function checkE2eRouteCollision(projectDir: string): E2eRouteResult {
  const srcRoot = join(projectDir, CLIENT_SRC);
  const e2eRoot = join(projectDir, E2E_DIR);
  if (!existsSync(srcRoot) || !existsSync(e2eRoot)) return { ok: true, violations: [] };

  // Candidate module dev URLs Vite serves (a route glob that matches one of these
  // intercepts the module request instead of the API). Test/spec/type files excluded.
  const moduleUrls = walk(srcRoot, (n) => /\.(ts|tsx|js|jsx)$/.test(n) && !/\.(test|spec|d)\.[tj]sx?$/.test(n)).map(
    (abs) => "http://127.0.0.1:5173/src/" + relative(srcRoot, abs).split(/[\\/]/).join("/"),
  );

  const violations: E2eRouteViolation[] = [];
  for (const spec of walk(e2eRoot, (n) => /\.spec\.[tj]sx?$/.test(n))) {
    let source: string;
    try {
      source = readFileSync(spec, "utf8");
    } catch {
      continue;
    }
    const specRel = relative(projectDir, spec).split(/[\\/]/).join("/");
    for (const glob of extractRouteGlobs(source)) {
      if (!glob.includes("*")) continue; // an exact string is anchored, not a broad glob
      const rx = globToRegExp(glob);
      const hit = moduleUrls.find((u) => rx.test(u));
      if (hit) {
        const modRel = hit.replace("http://127.0.0.1:5173/", "");
        violations.push({
          spec: specRel,
          glob,
          module: modRel,
          remediation:
            `page.route("${glob}", ...) also matches the app module ${modRel} (served by Vite from the same origin): ` +
            `the mock fulfills that ES-module request with JSON, the SPA fails to boot ("MIME type application/json"), ` +
            `and the behavior under test can never render. Scope the intercept to the API pathname instead: ` +
            `page.route((url) => new URL(url).pathname === "/api/...", ...).`,
        });
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

/** One-line summaries for surfacing in a self-check / smell detail. */
export function summarizeE2eRouteViolations(r: E2eRouteResult): string {
  return r.violations.map((x) => `${x.spec}: ${x.remediation}`).join(" | ");
}

export interface E2eSeedViolation {
  /** The E2E spec + line (project-relative) with the brittle backend-URL derivation. */
  spec: string;
  /** The offending source line (trimmed). */
  snippet: string;
  remediation: string;
}
export interface E2eSeedResult {
  ok: boolean;
  violations: E2eSeedViolation[];
}

export interface E2eHelperExportViolation {
  /** The E2E spec (project-relative) with the unsatisfied import. */
  spec: string;
  /** The local helper module it imports from (as written). */
  helper: string;
  /** The imported names that the helper module does NOT export. */
  missing: string[];
  remediation: string;
}
export interface E2eHelperExportResult {
  ok: boolean;
  violations: E2eHelperExportViolation[];
}

/** Collect the names a module `export`s, by regex (deterministic, no TS parse):
 *  `export { a, b as c }` (+ re-export `... from "..."`), `export const/function/class/… NAME`,
 *  and `export default` (recorded as "default"). Good enough to catch a spec importing a name a
 *  shared helper never exports — the exact `helpers.ts` missing `export { test }` defect. */
function collectModuleExports(source: string): Set<string> {
  const names = new Set<string>();
  // export { a, b as c }  /  export { a } from "./x"
  const braceRe = /\bexport\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = braceRe.exec(source)) !== null) {
    for (const part of m[1].split(",")) {
      const token = part.trim();
      if (!token) continue;
      // `a as b` exports `b`; a bare `a` exports `a`.
      const asMatch = /\bas\s+([A-Za-z_$][\w$]*)/.exec(token);
      names.add(asMatch ? asMatch[1] : token.replace(/\s.*$/, ""));
    }
  }
  // export const/let/var/function/class/type/interface/enum NAME
  const declRe = /\bexport\s+(?:async\s+)?(?:const|let|var|function\*?|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = declRe.exec(source)) !== null) names.add(m[1]);
  if (/\bexport\s+default\b/.test(source)) names.add("default");
  if (/\bexport\s*\*/.test(source)) names.add("*"); // star re-export: treat as "exports everything" (fail-open)
  return names;
}

/** Resolve a relative import specifier from `fromFile` to a real file on disk (trying the
 *  usual TS/JS extensions + an index file). Returns undefined when it cannot be resolved (then
 *  the caller fails open — an unresolved import is not this check's business). */
function resolveLocalModule(fromFile: string, spec: string): string | undefined {
  const base = join(fromFile, "..", spec);
  const cands = [base, ...[".ts", ".tsx", ".js", ".jsx", ".mjs"].map((e) => base + e), ...["index.ts", "index.tsx", "index.js"].map((i) => join(base, i))];
  for (const c of cands) {
    try {
      if (existsSync(c) && statSync(c).isFile()) return c;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

/** Flags an E2E spec that imports a NAMED symbol from a LOCAL helper module the module does not
 *  export — the stockflow S1 defect where `client/tests/e2e/helpers.ts` re-exported `expect` but
 *  not `test`, so every `import { test, expect } from "./helpers"` spec failed at load with a
 *  SyntaxError and the whole Playwright suite could not run (surfaced only as a GREEN-failure that
 *  cost an assess+repair roundtrip). A star re-export (`export *`) or an unresolved specifier
 *  fails open. No client e2e tree => clean no-op. */
export function checkE2eHelperExports(projectDir: string): E2eHelperExportResult {
  const e2eRoot = join(projectDir, E2E_DIR);
  if (!existsSync(e2eRoot)) return { ok: true, violations: [] };
  const importRe = /\bimport\s*(?:type\s+)?\{([^}]*)\}\s*from\s*(['"`])(\.[^'"`]*)\2/g;
  const violations: E2eHelperExportViolation[] = [];
  for (const spec of walk(e2eRoot, (n) => /\.(spec|test)\.[tj]sx?$/.test(n))) {
    let source: string;
    try {
      source = readFileSync(spec, "utf8");
    } catch {
      continue;
    }
    const specRel = relative(projectDir, spec).split(/[\\/]/).join("/");
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(source)) !== null) {
      const resolved = resolveLocalModule(spec, m[3]);
      if (!resolved) continue; // unresolved relative import — not this check's concern
      let helperSrc: string;
      try {
        helperSrc = readFileSync(resolved, "utf8");
      } catch {
        continue;
      }
      const exported = collectModuleExports(helperSrc);
      if (exported.has("*")) continue; // star re-export — assume everything is re-exported
      const imported = m[1]
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        // `a as b` imports the EXTERNAL name `a`; a bare `a` imports `a`.
        .map((p) => p.replace(/\s+as\s+[\w$]+$/, "").trim())
        .filter((n) => n && n !== "type");
      const missing = imported.filter((n) => !exported.has(n));
      if (missing.length) {
        violations.push({
          spec: specRel,
          helper: m[3],
          missing,
          remediation:
            `${specRel} imports { ${missing.join(", ")} } from "${m[3]}", but that module does not export ` +
            `${missing.length > 1 ? "them" : "it"} — the spec fails at load (SyntaxError) and the Playwright suite ` +
            `cannot run. Either import { test, expect } directly from "@playwright/test" (the scaffold convention), ` +
            `or make the shared helper re-export exactly what the specs import (e.g. \`export { test, expect };\`).`,
        });
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

export interface E2eRouteAroundViolation {
  /** The E2E spec + line (project-relative) with the control-bypass fallback. */
  spec: string;
  /** The offending source (trimmed). */
  snippet: string;
  remediation: string;
}
export interface E2eRouteAroundResult {
  ok: boolean;
  violations: E2eRouteAroundViolation[];
}

/** Flags an E2E that ROUTES AROUND the shipped UI control: a control interaction
 *  (`selectOption`/`click`/`fill`/`check`/`press`/`type`/`setInputFiles`) chained to a `.catch(...)`
 *  whose handler navigates (`page.goto(...)`) — the stockflow S2 defect where
 *  `selectOption(...).catch(() => page.goto('/?location='))` made the test pass via a URL bypass
 *  regardless of whether the control worked, so a broken native-datalist filter shipped GREEN. The
 *  assertion must be reached through the control the user operates, not a query-param shortcut. The
 *  matcher requires BOTH a control method AND a `page.goto(` inside the bounded catch window, so a
 *  legitimate `.catch` (no navigation fallback) is not flagged. No client e2e tree => clean no-op. */
export function checkE2eRouteAround(projectDir: string): E2eRouteAroundResult {
  const e2eRoot = join(projectDir, E2E_DIR);
  if (!existsSync(e2eRoot)) return { ok: true, violations: [] };
  const chainRe = /\.(selectOption|click|fill|check|uncheck|press|type|setInputFiles)\s*\([\s\S]*?\)\s*\.catch\s*\(/g;
  const violations: E2eRouteAroundViolation[] = [];
  for (const spec of walk(e2eRoot, (n) => /\.spec\.[tj]sx?$/.test(n))) {
    let source: string;
    try {
      source = readFileSync(spec, "utf8");
    } catch {
      continue;
    }
    const specRel = relative(projectDir, spec).split(/[\\/]/).join("/");
    let m: RegExpExecArray | null;
    while ((m = chainRe.exec(source)) !== null) {
      // Only a navigation FALLBACK inside the catch handler is the smell. Look in a bounded
      // window after the `.catch(` for a page.goto( — fail open if the handler does not navigate.
      const window = source.slice(m.index + m[0].length, m.index + m[0].length + 300);
      if (!/page\s*\.\s*goto\s*\(/.test(window)) continue;
      const line = source.slice(0, m.index).split("\n").length;
      violations.push({
        spec: `${specRel}:${line}`,
        snippet: source.slice(m.index, m.index + m[0].length).replace(/\s+/g, " ").trim().slice(0, 160),
        remediation:
          "E2E routes around the shipped control: a control interaction falls back via `.catch(() => page.goto(...))` " +
          "to a URL/query-param path, so the test passes whether or not the control works (the native-datalist filter " +
          "that shipped broken). Drive the assertion THROUGH the control the user operates — if the control cannot " +
          "reach the asserted state, that is a UX defect to route to the ux-designer, not to bypass in the test.",
      });
    }
  }
  return { ok: violations.length === 0, violations };
}

/** Flags an E2E that derives the backend URL by string-REPLACING the client port to seed via the
 *  API — e.g. `baseURL.replace("5173", "8000")` / `.replace(":5173", ":8000")`. That hardcodes the
 *  backend port, so when a shared CI runner finds 8000 busy and bumps the backend to a free port
 *  (→ 8001), the seed still POSTs to 8000 — a stale/other server that returns 2xx and writes to a
 *  DIFFERENT database — while the app reads the resolved port. The seeded rows never render
 *  (toBeVisible times out): GREEN locally where 8000 is free (the replace is a no-op), RED in CI.
 *  Fix: POST through the app's OWN origin (`${baseURL}/api/...`), riding the same resolved Vite
 *  proxy the app uses, so seed + app always hit the same backend/DB. No client tree => clean no-op. */
export function checkE2eSeedBackendDerivation(projectDir: string): E2eSeedResult {
  const e2eRoot = join(projectDir, E2E_DIR);
  if (!existsSync(e2eRoot)) return { ok: true, violations: [] };
  // The confirmed brittle pattern: swapping the client port for the backend port (5173 -> 8000),
  // with or without a leading colon. A pathname/app-origin seed carries no such replace.
  const portSwap = /\.replace\(\s*(['"`]):?5173\1\s*,\s*(['"`]):?8000\2\s*\)/;
  const violations: E2eSeedViolation[] = [];
  for (const spec of walk(e2eRoot, (n) => /\.spec\.[tj]sx?$/.test(n))) {
    let source: string;
    try {
      source = readFileSync(spec, "utf8");
    } catch {
      continue;
    }
    const specRel = relative(projectDir, spec).split(/[\\/]/).join("/");
    source.split("\n").forEach((ln, i) => {
      if (!portSwap.test(ln)) return;
      violations.push({
        spec: `${specRel}:${i + 1}`,
        snippet: ln.trim().slice(0, 160),
        remediation:
          "E2E seed derives the backend by string-replacing the client port (5173->8000), which hardcodes the " +
          "backend port: a shared CI runner bumps the backend off a busy 8000, so the seed POSTs to a stale server / " +
          "different DB (2xx, so it does not throw) and the rows never render — GREEN locally (8000 free), RED in CI. " +
          "POST through the app's OWN origin instead — `${baseURL}/api/...` — so seed + app share the resolved backend.",
      });
    });
  }
  return { ok: violations.length === 0, violations };
}
