// layering-clean gate: prove a service-backed feature's boundary/routes layer does
// NOT touch persistence directly (a fat controller), and that a repository layer
// exists.
//
// Why this exists: a build agent that puts `db.add(...)` / `db.commit()` /
// `db.query(...)` straight in a FastAPI route handler greens its behavior tests
// (the behavior is correct) but violates the layered-architecture contract the
// architect declared in architecture.json `layers` (boundary -> service ->
// repository -> ORM). Behavior tests never catch that; this gate does,
// deterministically + model-independently, by scanning the boundary module's
// source for SQLAlchemy session operations and confirming a repository module
// exists. The fix the agent should have written is to extract a service +
// repository and have the route delegate. This is the `layering-violation` smell.
//
// Static (no interpreter needed): read the boundary source, regex the session
// ops, check the repository path. Scoped to service-backed features (the YAGNI
// guard); a non-service-backed feature is exempt.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { ALL_ARTIFACT_ROOTS } from "../../consort/config/consort-paths.js";

// ─── A4: no duplicate class definitions (declaration-independent) ──
// A repo-wide invariant: a top-level class name is defined in exactly one module.
// Two modules defining the same top-level class (e.g. `Recipe` in both a leftover
// flat app/models.py and the app/models/recipe.py package) is the flat->package
// migration orphan in its most general form. Unlike checkModulePlacement, this does
// NOT depend on the architect declaring a `models` layer (models is an optional
// role), so it catches the duplicate even when placement cannot inspect that path.
// Duplicate ORM model classes also risk a double SQLAlchemy table registration.
// Nested classes (Pydantic `Config`, Django `Meta`) are intentionally ignored ,
// only column-0 `class` defs count, so common nested helpers never false-positive.

/** Directory names that are never application source (vendor / test / migration).
 *  The workflow bookkeeping roots (.consort + legacy) come from the single source
 *  of truth, never hardcoded here. */
const SOURCE_SKIP_DIRS = new Set<string>([
  "node_modules", "__pycache__", ".venv", "venv", ".git", "build", "dist",
  ...ALL_ARTIFACT_ROOTS, ".lakebase", "alembic", "migrations", "tests", "test",
  ".mypy_cache", ".pytest_cache", ".ruff_cache",
]);

/** A test module (its classes legitimately repeat names across files). */
function isTestFile(name: string): boolean {
  return /^test_.*\.py$/.test(name) || /_test\.py$/.test(name) || name === "conftest.py";
}

/** Recursively collect application source *.py files under `dir`, skipping
 *  vendor/test/migration dirs and test files. */
function sourcePyFilesRec(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SOURCE_SKIP_DIRS.has(e.name)) sourcePyFilesRec(join(dir, e.name), out);
    } else if (e.isFile() && e.name.endsWith(".py") && !isTestFile(e.name)) {
      out.push(join(dir, e.name));
    }
  }
}

export interface DuplicateClassResult {
  ok: boolean;
  violations: string[];
  remediation?: string;
}

const DUP_CLASS_REMEDIATION =
  "The same class is defined in more than one module. Keep ONE canonical definition " +
  "(usually the package that owns the layer) and delete the duplicate; re-export from the " +
  "package __init__ if a stable import path is needed. Duplicate ORM model classes also risk " +
  "a double table registration. See the `layering-violation` smell + DRY (one source of truth).";

// Column-0 `class Name:` or `class Name(Base):` – a top-level definition only
// (no leading whitespace, so nested Config/Meta classes are excluded).
const TOP_LEVEL_CLASS = /^class\s+([A-Za-z_]\w*)\s*[:(]/;

/**
 * Flag any top-level class name defined in 2+ source modules across the project.
 * Declaration-independent (does not read architecture.json): a repo-wide DRY/clean
 * invariant. Scans `roots` (default the existing of ["app", "src"]) recursively,
 * skipping vendor/test/migration dirs and test files. Only column-0 `class` defs
 * count, so nested Config/Meta classes never false-positive.
 */
export function checkDuplicateClasses(projectDir: string, roots: string[] = ["app", "src"]): DuplicateClassResult {
  const files: string[] = [];
  for (const r of roots) {
    const abs = join(projectDir, r);
    if (!existsSync(abs)) continue;
    try {
      if (statSync(abs).isDirectory()) sourcePyFilesRec(abs, files);
      else if (abs.endsWith(".py") && !isTestFile(r)) files.push(abs);
    } catch {
      /* skip unreadable root */
    }
  }
  // class name -> set of project-relative modules that define it at top level.
  const defs = new Map<string, Set<string>>();
  for (const file of files) {
    const shown = file.startsWith(projectDir) ? file.slice(projectDir.length).replace(/^\//, "") : file;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = TOP_LEVEL_CLASS.exec(line);
      if (!m) continue;
      const set = defs.get(m[1]) ?? new Set<string>();
      set.add(shown);
      defs.set(m[1], set);
    }
  }
  const violations: string[] = [];
  for (const [name, modules] of [...defs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (modules.size > 1) {
      violations.push(
        `class ${name} is defined in ${modules.size} modules: ${[...modules].sort().join(", ")} (keep one canonical definition, delete the duplicate)`,
      );
    }
  }
  return violations.length === 0 ? { ok: true, violations: [] } : { ok: false, violations, remediation: DUP_CLASS_REMEDIATION };
}

export interface LayeringCleanArgs {
  projectDir: string;
  /** From architecture.json `service_backed`. A false/absent value exempts the
   *  feature (layering is not required where it is not warranted). */
  serviceBacked: boolean;
  /** Boundary module paths (project-relative) from architecture.json `layers`
   *  (role=boundary). Defaults to the Python convention: app/main.py + app/routes. */
  boundaryModules?: string[];
  /** Repository module paths (role=repository) whose existence proves the
   *  persistence layer was extracted. Defaults to app/repositories +
   *  app/repository.py. */
  repositoryModules?: string[];
}

export interface LayeringCleanResult {
  clean: boolean;
  /** Boundary files that were scanned. */
  scanned: string[];
  /** "file:line  <code>" for each boundary line doing a session op (the violation). */
  violations: string[];
  remediation?: string;
}

// SQLAlchemy session operations: persistence happening in THIS file. `db.`,
// `session.`, or `self._session.` prefix + a session method. (`.get(` is omitted
// to avoid dict.get false positives; the create/read/update/delete verbs below
// are unambiguous SQLAlchemy session calls.)
const SESSION_OP =
  /\b(?:db|session|_session|self\._?session)\s*\.\s*(query|add|add_all|commit|delete|merge|flush|execute|refresh|scalars|scalar)\s*\(/;

const REMEDIATION =
  "The boundary/routes layer calls the DB session directly (a fat controller). " +
  "Extract a service (business logic) + a repository (the ONLY layer that touches " +
  "the ORM/session); the route handler validates input + delegates to the service. " +
  "See the `layering-violation` smell + @architectural-design-principles layered-architecture.";

const DEFAULT_BOUNDARY = ["app/main.py", "app/routes"];
const DEFAULT_REPOSITORY = ["app/repositories", "app/repository.py"];

/** Collect *.py files for a project-relative path (a file -> itself; a dir ->
 *  its .py files, one level deep). Missing paths contribute nothing. */
function pyFilesFor(projectDir: string, rel: string): string[] {
  const abs = join(projectDir, rel);
  if (!existsSync(abs)) return [];
  let isDir = false;
  try {
    isDir = statSync(abs).isDirectory();
  } catch {
    return [];
  }
  if (!isDir) return rel.endsWith(".py") ? [abs] : [];
  const out: string[] = [];
  for (const f of readdirSync(abs)) {
    if (f.endsWith(".py") && f !== "__init__.py") out.push(join(abs, f));
  }
  return out;
}

/** Does any repository module path exist? (the persistence layer was extracted) */
function repositoryExists(projectDir: string, repositoryModules: string[]): boolean {
  return repositoryModules.some((rel) => existsSync(join(projectDir, rel)));
}

/** Project-relative display path for an absolute file under projectDir. */
function relTo(projectDir: string, file: string): string {
  return file.startsWith(projectDir) ? file.slice(projectDir.length).replace(/^\/+/, "") : file;
}

/** A declared `layers[].module` -> its Python dotted import prefix. `app/routes/`
 *  -> `app.routes`; `app/repository.py` -> `app.repository`. */
function dottedPrefix(module: string): string {
  return module
    .replace(/\.py$/, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\//g, ".");
}

/** Application source *.py files that make up a declared layer's module (a
 *  directory -> its tree, recursively, skipping vendor/test/migration dirs and
 *  test files; a file -> itself; a bare path -> `<base>.py` if that is the file).
 *  Unlike pyFilesFor this recurses and KEEPS __init__.py (imports live there too). */
function layerSourceFiles(projectDir: string, module: string): string[] {
  const base = module.replace(/\/+$/, "");
  const out: string[] = [];
  const abs = join(projectDir, base);
  const tryFile = (p: string): void => {
    try {
      if (existsSync(p) && !statSync(p).isDirectory()) out.push(p);
    } catch {
      /* skip */
    }
  };
  if (existsSync(abs)) {
    let isDir = false;
    try {
      isDir = statSync(abs).isDirectory();
    } catch {
      /* treat as missing */
    }
    if (isDir) sourcePyFilesRec(abs, out);
    else if (abs.endsWith(".py")) out.push(abs);
    else tryFile(join(projectDir, `${base}.py`));
  } else {
    tryFile(join(projectDir, `${base}.py`));
  }
  return out;
}

/** Resolve a relative import (`from ..pkg import x`) to its absolute dotted
 *  module, given the importing file. One leading dot = the file's own package;
 *  each extra dot climbs one package. Returns null if it climbs past the root. */
function resolveRelativeImport(fileAbs: string, projectDir: string, dots: number, tail: string): string | null {
  const rel = relTo(projectDir, fileAbs);
  const parts = rel.split("/");
  parts.pop(); // drop the filename -> the file's package parts
  const up = dots - 1;
  if (up > parts.length) return null;
  const basePkg = parts.slice(0, parts.length - up);
  const tailParts = tail ? tail.split(".").filter(Boolean) : [];
  const full = [...basePkg, ...tailParts].join(".");
  return full || null;
}

/** The absolute dotted module a single import line brings in, or null if the line
 *  is not an import. Handles `from X import ...`, `import X`/`import X as y`, and
 *  relative `from .X import ...` (resolved against the importing file). Multi-name
 *  `import a, b` collapses to its first module (sufficient for layer detection). */
function importedModule(line: string, fileAbs: string, projectDir: string): string | null {
  const from = /^\s*from\s+(\.*)([\w.]*)\s+import\b/.exec(line);
  if (from) {
    const dots = from[1].length;
    const tail = from[2] ?? "";
    if (dots === 0) return tail || null;
    return resolveRelativeImport(fileAbs, projectDir, dots, tail);
  }
  const imp = /^\s*import\s+([\w.]+)/.exec(line);
  return imp ? imp[1] : null;
}

/** Is `mod` the layer at `prefix`, or a submodule of it? (`app.services` matches
 *  `app.services` and `app.services.foo`, but never `app.services_util`.) */
function underPrefix(mod: string, prefix: string): boolean {
  return mod === prefix || mod.startsWith(`${prefix}.`);
}

/**
 * Check the layering contract statically. Returns clean=true when the feature is
 * not service-backed (exempt), or when no boundary file does a session op AND a
 * repository module exists. Python-focused (the kit's persistence stack); a
 * project with no boundary files to scan is treated as clean (nothing to check).
 */
export function checkLayeringClean(args: LayeringCleanArgs): LayeringCleanResult {
  if (!args.serviceBacked) {
    return { clean: true, scanned: [], violations: [] };
  }
  const boundary = args.boundaryModules?.length ? args.boundaryModules : DEFAULT_BOUNDARY;
  const repository = args.repositoryModules?.length ? args.repositoryModules : DEFAULT_REPOSITORY;

  const scanned: string[] = [];
  const violations: string[] = [];
  for (const rel of boundary) {
    for (const file of pyFilesFor(args.projectDir, rel)) {
      scanned.push(file.startsWith(args.projectDir) ? file.slice(args.projectDir.length).replace(/^\//, "") : file);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (SESSION_OP.test(line)) {
          const shown = file.startsWith(args.projectDir) ? file.slice(args.projectDir.length).replace(/^\//, "") : file;
          violations.push(`${shown}:${i + 1}  ${line.trim()}`);
        }
      });
    }
  }

  // A service-backed feature with no repository module is itself a violation (the
  // persistence layer was never extracted), even if the boundary happens to be clean.
  if (scanned.length > 0 && !repositoryExists(args.projectDir, repository)) {
    violations.push(`no repository module found (expected one of: ${repository.join(", ")})`);
  }

  if (violations.length > 0) {
    return { clean: false, scanned, violations, remediation: REMEDIATION };
  }
  return { clean: true, scanned, violations: [] };
}

// ─── A5: may_import-derived inward-dependency scan (declaration-driven) ──
// The architect declares, per layer, which layer ROLES it is allowed to depend on
// (`layers[].may_import`), encoding the inward-dependency rule (boundary -> service
// -> repository -> models). This scan proves the SOURCE honors it: for each declared
// layer it reads that layer's module and flags any import of ANOTHER declared layer
// whose role is NOT in this layer's `may_import`. It is fully derived from the
// declaration (no hardcoded direction) and model-independent; "an import is an
// import", so it needs no interpreter, only the import syntax of the kit's stack
// (Python absolute/relative `import` / `from ... import`). This is the deterministic
// backstop for the "dependencies point inward" family of NFRs, so the Navigator's
// reflect need not demand a separate fitness test per inward edge.
//
// A side-effect-only registration import (`import app.models  # noqa: F401`, used to
// force ORM table registration at the composition root) is assembly, not a layer
// dependency, and is exempt (lines carrying a `# noqa` marker are skipped).

export interface ImportLayeringResult {
  ok: boolean;
  /** Layer files that were scanned. */
  scanned: string[];
  /** "file:line  <code>  (role may not import role)" per offending import. */
  violations: string[];
  remediation?: string;
}

const IMPORT_LAYERING_REMEDIATION =
  "A layer imports another layer it is not allowed to depend on. Dependencies must " +
  "point inward, per the architect's layers[].may_import (boundary -> service -> " +
  "repository -> models). Route the dependency through the allowed inner layer (the " +
  "boundary calls the service, the service calls the repository) instead of reaching " +
  "across or around it. See the `layering-violation` smell + " +
  "@architectural-design-principles layered-architecture.";

/**
 * Flag any declared layer that imports another declared layer its `may_import`
 * does not permit. Derived entirely from `layers[]` (role, module, may_import); a
 * layer with no `may_import` may depend on no other layer (schema: empty/omitted =
 * nothing inward). Same-role sibling layers never constrain each other, and imports
 * of non-layer modules (utils, framework) are never flagged. Clean when no layer
 * (or a single layer) is declared.
 */
export function checkImportLayering(
  projectDir: string,
  layers: Array<{ role: string; module: string; may_import?: string[] }>,
): ImportLayeringResult {
  const decls = layers
    .filter((l) => typeof l.role === "string" && typeof l.module === "string" && l.module.length > 0)
    .map((l) => ({ role: l.role, module: l.module, allowed: new Set(l.may_import ?? []), prefix: dottedPrefix(l.module) }));

  const scanned: string[] = [];
  const violations: string[] = [];
  for (const layer of decls) {
    // Forbidden targets: every OTHER declared layer (different prefix AND different
    // role) whose role this layer's may_import does not list.
    const forbidden = decls.filter((k) => k.prefix !== layer.prefix && k.role !== layer.role && !layer.allowed.has(k.role));
    if (forbidden.length === 0) continue;
    for (const file of layerSourceFiles(projectDir, layer.module)) {
      const shown = relTo(projectDir, file);
      scanned.push(shown);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (/#\s*noqa/i.test(line)) return; // side-effect-only registration import (assembly, not a dependency)
        const mod = importedModule(line, file, projectDir);
        if (!mod) return;
        const hit = forbidden.find((t) => underPrefix(mod, t.prefix));
        if (hit) violations.push(`${shown}:${i + 1}  ${line.trim()}  (${layer.role} may not import ${hit.role})`);
      });
    }
  }
  return violations.length === 0
    ? { ok: true, scanned, violations: [] }
    : { ok: false, scanned, violations, remediation: IMPORT_LAYERING_REMEDIATION };
}

// ─── A6: ORM / persistence containment (only the repository owns the session) ──
// "Only the repository layer touches the persistence mechanism." checkLayeringClean
// already proves the BOUNDARY is not a fat controller; this generalizes the
// containment to EVERY other declared layer that must not touch the ORM (service,
// models, policy, ...), leaving `repository` (which owns persistence) and
// `infrastructure` (which owns the engine / session factory) exempt. The scan token
// is the persistence stack's session-operation signature, passed in so it can be
// parameterized per detected stack (SQLAlchemy today, `SESSION_OP`; a Prisma / JPA
// stack would pass its own). Gated on a repository layer being declared (containment
// is only meaningful when there is a repository to contain persistence to). This is
// the deterministic backstop for the "only the repository owns the ORM" NFR, so the
// Navigator need not demand a per-layer containment fitness test.
//
// The boundary is scanned here too (it is a non-repo layer), so a fat controller
// surfaces under both this check and checkLayeringClean; both point at the same fix.

const ORM_CONTAINMENT_EXEMPT_ROLES = new Set<string>(["repository", "infrastructure"]);

const ORM_CONTAINMENT_REMEDIATION =
  "A layer other than the repository calls the persistence session/ORM directly. Only " +
  "the repository layer may touch the ORM session; move the persistence call into the " +
  "repository and have this layer delegate to it. See the `layering-violation` smell + " +
  "@architectural-design-principles layered-architecture.";

export interface OrmContainmentResult {
  ok: boolean;
  /** Non-repo layer files that were scanned. */
  scanned: string[];
  violations: string[];
  remediation?: string;
}

/**
 * Flag any declared non-repository, non-infrastructure layer that calls the ORM
 * session directly. Derived from `layers[]`; gated on a declared repository layer.
 * `sessionOp` defaults to the kit's SQLAlchemy signature but is a parameter so a
 * different persistence stack can pass its own token.
 */
export function checkOrmContainment(
  projectDir: string,
  layers: Array<{ role: string; module: string }>,
  sessionOp: RegExp = SESSION_OP,
): OrmContainmentResult {
  const hasRepository = layers.some((l) => l.role === "repository");
  if (!hasRepository) return { ok: true, scanned: [], violations: [] };

  const scanned: string[] = [];
  const violations: string[] = [];
  for (const layer of layers) {
    if (typeof layer.module !== "string" || !layer.module || ORM_CONTAINMENT_EXEMPT_ROLES.has(layer.role)) continue;
    for (const file of layerSourceFiles(projectDir, layer.module)) {
      const shown = relTo(projectDir, file);
      scanned.push(shown);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (sessionOp.test(line)) {
          violations.push(`${shown}:${i + 1}  ${line.trim()}  (${layer.role} layer must not touch the ORM session)`);
        }
      });
    }
  }
  return violations.length === 0
    ? { ok: true, scanned, violations: [] }
    : { ok: false, scanned, violations, remediation: ORM_CONTAINMENT_REMEDIATION };
}

/** Read `service_backed` + the layer module paths + the boundary `renders_via`
 *  out of an architecture.json string, for the CLI. Tolerant of absent/invalid JSON. */
export function layeringConfigFromArchitecture(architectureJson: string): {
  serviceBacked: boolean;
  boundaryModules: string[];
  repositoryModules: string[];
  /** Every declared layer's role + module + may_import (for the placement, import
   *  layering, and ORM-containment checks). */
  allModules: Array<{ role: string; module: string; may_import?: string[] }>;
  /** The boundary layer's `renders_via` (templating framework), if declared. */
  rendersVia?: string;
} {
  let parsed: {
    service_backed?: boolean;
    layers?: Array<{ role?: string; module?: string; renders_via?: string; may_import?: string[] }>;
  };
  try {
    parsed = JSON.parse(architectureJson);
  } catch {
    return { serviceBacked: false, boundaryModules: [], repositoryModules: [], allModules: [] };
  }
  const layers = parsed.layers ?? [];
  const modulesByRole = (role: string): string[] =>
    layers.filter((l) => l.role === role && typeof l.module === "string").map((l) => l.module as string);
  const allModules = layers
    .filter((l) => typeof l.role === "string" && typeof l.module === "string")
    .map((l) => ({
      role: l.role as string,
      module: l.module as string,
      ...(Array.isArray(l.may_import) ? { may_import: l.may_import.filter((r): r is string => typeof r === "string") } : {}),
    }));
  const boundaryLayer = layers.find((l) => l.role === "boundary" && typeof l.renders_via === "string");
  return {
    serviceBacked: parsed.service_backed === true,
    boundaryModules: modulesByRole("boundary"),
    repositoryModules: modulesByRole("repository"),
    allModules,
    ...(boundaryLayer?.renders_via ? { rendersVia: boundaryLayer.renders_via } : {}),
  };
}

// ─── A1: module placement ────────────────────────────────────────
// The architect's `layers[].module` is the contract for WHERE each layer's code
// lives. Honor exactly what is declared (no imposed directory convention): a
// module ending in "/" must be a package directory; one ending in ".py" must be
// that file; a bare path may be either. A declared module the build put elsewhere
// (e.g. a flat `app/services.py` where `app/services/` was declared) is a
// layering-violation – the layering exists only on paper.

export interface PlacementResult {
  ok: boolean;
  violations: string[];
}

/** Each declared `layers[].module` must exist as declared. */
export function checkModulePlacement(projectDir: string, allModules: Array<{ role: string; module: string }>): PlacementResult {
  const violations: string[] = [];
  const kindOf = (abs: string): "dir" | "file" | "missing" => {
    if (!existsSync(abs)) return "missing";
    try {
      return statSync(abs).isDirectory() ? "dir" : "file";
    } catch {
      return "missing";
    }
  };
  for (const { role, module } of allModules) {
    const base = module.replace(/\/$/, "");
    const wantDir = module.endsWith("/");
    const wantFile = module.endsWith(".py");
    const here = kindOf(join(projectDir, base));
    if (wantDir) {
      if (here === "dir") {
        // The package exists as declared, but a stale flat `<base>.py` ALONGSIDE
        // it is a shadow-duplicate: an orphan from a flat->package migration that
        // was never deleted (e.g. v1's app/models.py left behind when a later
        // feature introduced the app/models/ package). Python shadows the flat
        // module with the package, so it is dead code, but it can re-register a
        // duplicate ORM table if imported directly and it confuses the build.
        // Flag it so the Driver deletes the orphan.
        if (kindOf(join(projectDir, `${base}.py`)) === "file") {
          violations.push(`declared ${role} layer "${module}" is a package, but a stale flat ${base}.py also exists alongside it (an orphan from a flat->package migration, shadowed + duplicating this layer); delete ${base}.py so only the package defines this layer`);
        }
        continue;
      }
      // The telling case: declared a package dir but the build made a flat
      // `<base>.py` (e.g. app/services/ declared, app/services.py built).
      if (kindOf(join(projectDir, `${base}.py`)) === "file") {
        violations.push(`declared ${role} layer "${module}" is a package directory but the build created a flat file ${base}.py (organize this layer under ${module})`);
      } else {
        violations.push(`declared ${role} layer module "${module}" not found (the build placed this layer's code elsewhere)`);
      }
    } else if (wantFile) {
      if (here === "file") continue;
      if (here === "dir") violations.push(`declared ${role} layer module "${module}" is a file but a directory exists there`);
      else violations.push(`declared ${role} layer module "${module}" not found (the build placed this layer's code elsewhere)`);
    } else {
      // bare path: a directory, the file itself, or a `<base>.py` all satisfy it.
      if (here !== "missing" || kindOf(join(projectDir, `${base}.py`)) === "file") continue;
      violations.push(`declared ${role} layer module "${module}" not found (the build placed this layer's code elsewhere)`);
    }
  }
  return { ok: violations.length === 0, violations };
}

// ─── A2: inline rendering ────────────────────────────────────────
// The boundary must render through a templating framework (design-guide "UI
// Framework"), not hand-assemble HTML in a route handler. An inline HTML document
// returned from the boundary is unmaintainable + bypasses the design system.

const INLINE_HTML = /<!DOCTYPE\b|<html[\s>]|HTMLResponse\s*\(\s*(?:content\s*=\s*)?["'`]\s*<|return\s+f?["'`]{1,3}\s*<(?:html|!DOCTYPE)/i;
const TEMPLATE_SEAM = /\b(?:Jinja2Templates|TemplateResponse|render_template|templates\.TemplateResponse)\b/;
const INLINE_RENDER_REMEDIATION =
  "The boundary renders HTML inline instead of through a templating framework. " +
  "Render via the declared framework (e.g. Jinja2 TemplateResponse + a templates/ dir) " +
  "with stable data-testid seams; the route returns a rendered template, never an inline HTML string. " +
  "See the design-guide `UI Framework` section + @ui-ux-design-principles/testable-ui.";

export interface InlineRenderResult {
  ok: boolean;
  violations: string[];
  remediation?: string;
}

/**
 * Flag a boundary module that emits inline HTML without using a templating seam.
 * Scoped to UI features: runs when `rendersVia` is declared, or when inline HTML
 * is actually present (its presence is itself the signal). A boundary that uses a
 * TemplateResponse/Jinja2 seam is clean even if a stray tag appears in a string.
 */
export function checkInlineRendering(
  projectDir: string,
  boundaryModules: string[],
  rendersVia?: string,
): InlineRenderResult {
  const boundary = boundaryModules.length ? boundaryModules : DEFAULT_BOUNDARY;
  const violations: string[] = [];
  for (const rel of boundary) {
    for (const file of pyFilesFor(projectDir, rel)) {
      const src = readFileSync(file, "utf8");
      const hasInline = INLINE_HTML.test(src);
      const hasSeam = TEMPLATE_SEAM.test(src);
      if (hasInline && !hasSeam) {
        const shown = file.startsWith(projectDir) ? file.slice(projectDir.length).replace(/^\//, "") : file;
        violations.push(`${shown}: boundary emits inline HTML with no templating seam (use ${rendersVia ?? "the declared templating framework"})`);
      }
    }
  }
  return violations.length === 0 ? { ok: true, violations: [] } : { ok: false, violations, remediation: INLINE_RENDER_REMEDIATION };
}

// ─── A3: DRY + complexity budget ─────────────────────────────────
// Heuristic (not a contract): flag copy-paste duplication + over-long functions
// across the feature's source. Catches the DRY/clean-code smells the Navigator
// REVIEW would otherwise have to eyeball. Budgets are conservative to avoid noise.

export interface CodeBudgetOptions {
  /** A def/function body longer than this many lines is flagged. Default 60. */
  maxFunctionLines?: number;
  /** A run of >= this many identical non-trivial lines appearing 2+ times is a dup. Default 6. */
  dupWindow?: number;
}

export interface CodeBudgetResult {
  ok: boolean;
  violations: string[];
}

function nontrivial(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && !t.startsWith("#") && t !== "}" && t !== "{" && t !== "return" && t !== "pass";
}

/** DRY + function-length budget over the given source files (project-relative shown). */
export function checkCodeBudget(projectDir: string, sourcePaths: string[], opts: CodeBudgetOptions = {}): CodeBudgetResult {
  const maxFn = opts.maxFunctionLines ?? 60;
  const dupWin = opts.dupWindow ?? 6;
  const violations: string[] = [];
  const files: string[] = [];
  for (const rel of sourcePaths) files.push(...pyFilesFor(projectDir, rel));

  // Function length: a `def ` line, then count body lines until the indent returns
  // to <= the def's indent (a blank-tolerant Python heuristic).
  for (const file of files) {
    const shown = file.startsWith(projectDir) ? file.slice(projectDir.length).replace(/^\//, "") : file;
    const lines = readFileSync(file, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = /^(\s*)def\s+(\w+)/.exec(lines[i]);
      if (!m) continue;
      const indent = m[1].length;
      let body = 0;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === "") continue;
        const ind = (/^(\s*)/.exec(lines[j]) as RegExpExecArray)[1].length;
        if (ind <= indent) break;
        body++;
      }
      if (body > maxFn) violations.push(`${shown}:${i + 1}  def ${m[2]} is ${body} lines (> ${maxFn}); extract helpers (clean-code / single responsibility)`);
    }
  }

  // Duplication: hash each window of `dupWin` consecutive non-trivial lines; a
  // window appearing in 2+ places is copy-paste (DRY).
  const seen = new Map<string, string>();
  const reported = new Set<string>();
  for (const file of files) {
    const shown = file.startsWith(projectDir) ? file.slice(projectDir.length).replace(/^\//, "") : file;
    const lines = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(nontrivial);
    for (let i = 0; i + dupWin <= lines.length; i++) {
      const key = lines.slice(i, i + dupWin).join("");
      if (key.length < dupWin * 3) continue; // skip trivially short windows
      const first = seen.get(key);
      if (first === undefined) {
        seen.set(key, shown);
      } else if (!reported.has(key)) {
        reported.add(key);
        violations.push(`duplicated ${dupWin}-line block in ${first} and ${shown} (DRY: extract one shared helper)`);
      }
    }
  }
  return { ok: violations.length === 0, violations };
}
