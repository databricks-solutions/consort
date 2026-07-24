// imports-clean gate: prove the app entry module imports WITHOUT an optional
// build artifact (client/dist) present.
//
// Why this exists: a build agent that mounts the compiled client at module load
// time , e.g. FastAPI `app.mount("/assets", StaticFiles(directory=client/dist/assets))`
// at import scope , greens its tests on a machine where the client is already
// built, then crashes at import the moment the app runs anywhere the client
// has not been built (a backend-only test run, CI before the client build, a
// fresh clone). The app becomes unimportable and every downstream step fails
// with an opaque stack trace far from the cause.
//
// This is the "import-time coupling to an optional build artifact" smell. The
// fix the agent should have written is to guard the mount (mount only when the
// directory exists) and serve a clear 503 when it does not. This gate catches
// the unguarded form deterministically, before deploy, by importing the entry
// with the build artifact hidden.
//
// Deterministic + model-independent: detect the entry by convention, hide any
// present build-artifact dirs, run the language's import, restore. A non-zero
// import is the smell (or a genuine import bug); either way the build is not
// clean.

import { execSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { detectLanguage, type SchemaMigrationLanguage } from "@databricks-solutions/lakebase-scm-utils/lakebase";

/** Result of running an import in a subprocess. */
export interface ImportOutcome {
  code: number;
  stderr: string;
}

/** Injectable importer (test seam). Runs the import for `entry` in `projectDir`. */
export type Importer = (args: {
  projectDir: string;
  lang: SchemaMigrationLanguage;
  entry: string;
}) => ImportOutcome;

export interface ImportsCleanArgs {
  projectDir: string;
  /** Override language detection (test seam / explicit caller). */
  lang?: SchemaMigrationLanguage;
  /**
   * Project-relative build-artifact dirs that must NOT be required at import
   * time. Each present one is hidden for the duration of the import so the
   * check exercises the "artifact absent" path. Defaults to `client/dist`.
   */
  buildArtifacts?: string[];
  /** Inject for tests; defaults to the real subprocess importer. */
  importer?: Importer;
}

export interface ImportsCleanResult {
  clean: boolean;
  /**
   * The entry the check imported, e.g. "app.main" (python). `null` when no
   * conventional entry was found , nothing to check, treated as clean.
   */
  entry: string | null;
  lang: SchemaMigrationLanguage | null;
  /** Build-artifact dirs that were present and hidden during the check. */
  hiddenArtifacts: string[];
  /** Importer stderr when `clean` is false. */
  error?: string;
  /** Remediation pointing at the smell when `clean` is false. */
  remediation?: string;
}

const DEFAULT_BUILD_ARTIFACTS = ["client/dist"];

const REMEDIATION =
  "App entry imports an optional build artifact (e.g. client/dist) at module load time. " +
  "Guard the coupling so the module imports without the artifact: mount the compiled " +
  "client ONLY when its directory exists, and serve a clear 503 (\"client not built\") " +
  "from the SPA route when index.html is absent. See the `import-time-build-coupling` " +
  "bad smell + the dev/prod-parity rule in software-design-principles.";

/**
 * The conventional import entry for a language, or null when none is found.
 * - python: `app/main.py` -> "app.main"; else `main.py` -> "main".
 * - nodejs: package.json `main`, else `server/index.js`/`index.js` (best effort).
 * - java: not supported (no module-load SPA-mount class); returns null.
 */
export function detectEntry(projectDir: string, lang: SchemaMigrationLanguage): string | null {
  if (lang === "python") {
    if (existsSync(join(projectDir, "app", "main.py"))) return "app.main";
    if (existsSync(join(projectDir, "main.py"))) return "main";
    return null;
  }
  if (lang === "nodejs") {
    try {
      const pkg = JSON.parse(
        execSync("cat package.json", { cwd: projectDir }).toString(),
      ) as { main?: string };
      if (pkg.main && existsSync(join(projectDir, pkg.main))) return `./${pkg.main}`;
    } catch {
      // fall through to convention
    }
    for (const cand of ["server/index.js", "index.js", "src/index.js"]) {
      if (existsSync(join(projectDir, cand))) return `./${cand}`;
    }
    return null;
  }
  return null;
}

const defaultImporter: Importer = ({ projectDir, lang, entry }) => {
  // Run the import in the project's own interpreter so its dependencies resolve
  // (uv-managed venv for python, matching pr.yml's `uv run pytest`). A failure
  // here, with deps present, means the module cannot be imported , the gate's
  // whole point.
  let command: string;
  if (lang === "python") {
    const py = hasUv(projectDir) ? "uv run python" : "python3";
    command = `${py} -c "import ${entry}"`;
  } else if (lang === "nodejs") {
    // CommonJS require covers the kit's node template; ESM-only entries would
    // need dynamic import , out of scope until a node SPA-mount case appears.
    command = `node -e "require('${entry}')"`;
  } else {
    return { code: 0, stderr: "" };
  }
  try {
    execSync(command, { cwd: projectDir, stdio: ["ignore", "ignore", "pipe"] });
    return { code: 0, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stderr?: Buffer | string };
    return {
      code: typeof e.status === "number" ? e.status : 1,
      stderr: e.stderr ? e.stderr.toString() : String(err),
    };
  }
};

function hasUv(projectDir: string): boolean {
  try {
    execSync("uv --version", { cwd: projectDir, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Import the app entry with build artifacts hidden. Returns `clean: true` when
 * the entry imports (or there is no conventional entry to check). Restores any
 * hidden artifact even when the import throws.
 */
export function checkImportsClean(args: ImportsCleanArgs): ImportsCleanResult {
  const { projectDir } = args;
  const buildArtifacts = args.buildArtifacts ?? DEFAULT_BUILD_ARTIFACTS;
  const importer = args.importer ?? defaultImporter;

  let lang: SchemaMigrationLanguage;
  try {
    lang = args.lang ?? detectLanguage(projectDir);
  } catch {
    return { clean: true, entry: null, lang: null, hiddenArtifacts: [] };
  }

  const entry = detectEntry(projectDir, lang);
  if (!entry) {
    return { clean: true, entry: null, lang, hiddenArtifacts: [] };
  }

  // Hide present build artifacts so the import exercises the "absent" path.
  const hidden: Array<{ from: string; to: string }> = [];
  for (const rel of buildArtifacts) {
    const from = join(projectDir, rel);
    if (existsSync(from)) {
      const to = `${from}.imports-clean-bak`;
      renameSync(from, to);
      hidden.push({ from, to });
    }
  }

  try {
    const outcome = importer({ projectDir, lang, entry });
    if (outcome.code === 0) {
      return { clean: true, entry, lang, hiddenArtifacts: hidden.map((h) => h.from) };
    }
    return {
      clean: false,
      entry,
      lang,
      hiddenArtifacts: hidden.map((h) => h.from),
      error: outcome.stderr.trim(),
      remediation: REMEDIATION,
    };
  } finally {
    // Restore in reverse so nested renames unwind cleanly.
    for (const h of hidden.reverse()) {
      if (existsSync(h.to)) renameSync(h.to, h.from);
    }
  }
}
