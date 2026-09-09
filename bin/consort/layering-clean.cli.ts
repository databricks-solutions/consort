#!/usr/bin/env node
// CLI for the layering-clean gate: prove a service-backed feature's
// boundary/routes layer does NOT touch persistence directly (a fat controller)
// and that a repository layer exists. The deterministic, model-independent
// backstop for the `layering-violation` smell, mirroring consort-imports-clean.
//
// Exit 0 = clean (layered, or the feature is not service-backed so layering is
//          not warranted, or there is no boundary to scan).
// Exit 1 = the boundary calls the DB session directly and/or no repository
//          module exists – the fat-controller form of the layering-violation
//          smell. Prints the offending lines + remediation.
//
// Usage:
//   consort-layering-clean [--project-dir <path>] [--architecture <path>]
//                               [--boundary <rel> ...] [--repository <rel> ...]
//                               [--service-backed] [--json]
//
// With --architecture, service_backed + the boundary/repository module paths are
// read from architecture.json `layers`; explicit flags override.

import { readFileSync } from "node:fs";
import {
  checkLayeringClean,
  checkImportLayering,
  checkOrmContainment,
  checkModulePlacement,
  checkInlineRendering,
  checkCodeBudget,
  checkDuplicateClasses,
  layeringConfigFromArchitecture,
  type LayeringCleanArgs,
} from "../../consort/architecture/layering-clean.js";

interface Parsed {
  projectDir: string;
  architecture?: string;
  boundary: string[];
  repository: string[];
  serviceBacked?: boolean;
  json: boolean;
}

function parse(argv: string[]): Parsed {
  const out: Parsed = { projectDir: process.cwd(), boundary: [], repository: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--architecture" && i + 1 < argv.length) out.architecture = argv[++i];
    else if (a === "--boundary" && i + 1 < argv.length) out.boundary.push(argv[++i]);
    else if (a === "--repository" && i + 1 < argv.length) out.repository.push(argv[++i]);
    else if (a === "--service-backed") out.serviceBacked = true;
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}

function help(): never {
  process.stdout.write(
    `consort-layering-clean – prove the boundary/routes layer does not touch persistence\n\n` +
      `Usage:\n` +
      `  consort-layering-clean [--project-dir <path>] [--architecture <path>] \\\n` +
      `                              [--boundary <rel> ...] [--repository <rel> ...] \\\n` +
      `                              [--service-backed] [--json]\n\n` +
      `service_backed + module paths are read from --architecture when given; flags override.\n` +
      `Exit 0 = clean / exempt; exit 1 = boundary calls the DB session directly or no repository.\n`,
  );
  process.exit(0);
}

const p = parse(process.argv.slice(2));

// Derive config from architecture.json when provided, then let explicit flags win.
let serviceBacked = p.serviceBacked ?? false;
let boundary = p.boundary;
let repository = p.repository;
let allModules: Array<{ role: string; module: string }> = [];
let rendersVia: string | undefined;
if (p.architecture) {
  let archJson = "";
  try {
    archJson = readFileSync(p.architecture, "utf8");
  } catch {
    process.stderr.write(`layering-clean: cannot read architecture file ${p.architecture}\n`);
    process.exit(1);
  }
  const cfg = layeringConfigFromArchitecture(archJson);
  if (p.serviceBacked === undefined) serviceBacked = cfg.serviceBacked;
  if (boundary.length === 0) boundary = cfg.boundaryModules;
  if (repository.length === 0) repository = cfg.repositoryModules;
  allModules = cfg.allModules;
  rendersVia = cfg.rendersVia;
}

const callArgs: LayeringCleanArgs = { projectDir: p.projectDir, serviceBacked };
if (boundary.length > 0) callArgs.boundaryModules = boundary;
if (repository.length > 0) callArgs.repositoryModules = repository;

// The gate runs a suite of deterministic architecture checks; any failure fails
// the gate (all surface together so one run shows every violation).
const layering = checkLayeringClean(callArgs);
// Deterministic, declaration-driven layering enforcement (derived from layers[]):
// import layering = dependencies point inward per may_import; ORM containment =
// only the repository touches the session. Both gated on declared layers.
const importLayering =
  serviceBacked && allModules.length
    ? checkImportLayering(p.projectDir, allModules)
    : { ok: true, violations: [] as string[], remediation: undefined as string | undefined };
const ormContainment =
  serviceBacked && allModules.length
    ? checkOrmContainment(p.projectDir, allModules)
    : { ok: true, violations: [] as string[], remediation: undefined as string | undefined };
const placement = serviceBacked && allModules.length ? checkModulePlacement(p.projectDir, allModules) : { ok: true, violations: [] };
const rendering = serviceBacked ? checkInlineRendering(p.projectDir, boundary, rendersVia) : { ok: true, violations: [] as string[] };
// Budget over the declared layer modules (or `app` by default) – broad clean-code check.
const budgetPaths = allModules.length ? allModules.map((m) => m.module) : ["app"];
const budget = checkCodeBudget(p.projectDir, budgetPaths);
// Duplicate-class invariant: runs UNCONDITIONALLY (independent of service_backed
// and of declared layers) – a repo cannot hold the same class in two modules.
const duplicates = checkDuplicateClasses(p.projectDir);

const groups: Array<{ label: string; ok: boolean; violations: string[]; remediation?: string }> = [
  { label: "layering (boundary vs persistence)", ok: layering.clean, violations: layering.violations, remediation: layering.remediation },
  { label: "import layering (dependencies point inward per may_import)", ok: importLayering.ok, violations: importLayering.violations, remediation: importLayering.remediation },
  { label: "ORM containment (only the repository touches the session)", ok: ormContainment.ok, violations: ormContainment.violations, remediation: ormContainment.remediation },
  { label: "module placement (layers at declared paths)", ok: placement.ok, violations: placement.violations },
  { label: "rendering (templating, not inline HTML)", ok: rendering.ok, violations: rendering.violations, remediation: rendering.remediation },
  { label: "DRY + complexity budget", ok: budget.ok, violations: budget.violations },
  { label: "no duplicate class definitions", ok: duplicates.ok, violations: duplicates.violations, remediation: duplicates.remediation },
];
const ok = groups.every((g) => g.ok);

if (p.json) {
  process.stdout.write(`${JSON.stringify({ ok, scanned: layering.scanned, groups })}\n`);
} else if (ok) {
  const what = serviceBacked
    ? layering.scanned.length
      ? `layered + rendered + within budget (boundary scanned: ${layering.scanned.join(", ")})`
      : "no boundary modules to scan"
    : "feature is not service-backed (layering not required)";
  process.stdout.write(`layering-clean: OK – ${what}\n`);
} else {
  const blocks = groups
    .filter((g) => !g.ok)
    .map((g) => `  [${g.label}]\n${g.violations.map((v) => `    ${v}`).join("\n")}${g.remediation ? `\n    -> ${g.remediation}` : ""}`)
    .join("\n\n");
  process.stderr.write(`layering-clean: FAILED – architecture-quality checks did not pass.\n\n${blocks}\n`);
}

process.exit(ok ? 0 : 1);
