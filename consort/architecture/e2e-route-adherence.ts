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
