// Pin the scaffolded project's runtime kit ref to THIS kit's release version.
//
// Why: `scripts/lk` resolves the kit from a cache keyed by ref
// (`~/.cache/consort/<ref>`). When the ref is the mutable `main`, a new release
// moves main's tip but the cache key never changes, so a bin run keeps serving
// the stale install it first cached (the fast path deliberately never re-checks
// the remote – freshness is `--warm`'s job). The result: a project silently runs
// a months-old kit and newly-added bins go missing.
//
// The fix mirrors what the substrate already does for `.lakebase/scm-utils-ref`
// (pinned to `v${substrateVersion()}`): pin the kit to an IMMUTABLE version tag.
// A version tag never moves, so each release is a distinct cache key that installs
// fresh on first use – deterministic, no drift. The substrate's create-project
// Step 7e writes `.lakebase/kit-ref` straight from `LAKEBASE_KIT_REF`, so the
// consort create wrapper only has to DEFAULT that env var to its own version.
//
// An explicit `LAKEBASE_KIT_REF` (dev override, or a capture that pins a working
// ref) always wins – this only fills the unset default that used to fall through
// to `main`.

import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";

const CONSORT_PKG = "@databricks-solutions/consort";

/**
 * The kit ref to pin, or `undefined` to leave `LAKEBASE_KIT_REF` unset (lk then
 * defaults to `main`, preserving old behavior). An explicit env ref wins; a
 * missing/blank version yields `undefined` (never pin to a bare `v`).
 */
export function kitRefPin(env: NodeJS.ProcessEnv, version: string | undefined): string | undefined {
  if (env.LAKEBASE_KIT_REF && env.LAKEBASE_KIT_REF.trim()) return undefined;
  const v = (version ?? "").trim();
  return v ? `v${v}` : undefined;
}

/**
 * Dev-scaffold self-heal. The kit-ref pin above is a version tag (`v${version}`); if that version
 * was never published upstream (a dev/unreleased plugin, e.g. `v0.3.73`), `lk` cannot fetch it and
 * the scaffold strands. So when scaffolding from a LOCAL kit (`LAKEBASE_KIT_DIR`), record that dir
 * as the project's `.lakebase/kit-local-dir` — `lk`'s cold-cache self-heal then symlinks the local
 * kit for the pinned ref, no fetch needed. Point `LAKEBASE_KIT_DIR` at your kit REPO with a current
 * `dist/`, NOT a stale plugin cache (which may predate a bin like consort-dashboard). The substrate
 * gets the same via `LAKEBASE_SCM_UTILS_DIR` → `scm-utils-local-dir`. Returns the files written.
 * Best-effort; never throws.
 */
export function recordDevKitLocalDirs(projectDir: string, env: NodeJS.ProcessEnv): string[] {
  const lakebaseDir = join(projectDir, ".lakebase");
  const written: string[] = [];
  for (const [envVar, file] of [
    ["LAKEBASE_KIT_DIR", "kit-local-dir"],
    ["LAKEBASE_SCM_UTILS_DIR", "scm-utils-local-dir"],
  ] as const) {
    const dir = env[envVar]?.trim();
    if (!dir) continue;
    const abs = resolve(dir);
    if (!existsSync(join(abs, "dist"))) continue; // only a BUILT kit dir is resolvable by lk
    try {
      mkdirSync(lakebaseDir, { recursive: true });
      writeFileSync(join(lakebaseDir, file), abs + "\n");
      written.push(file);
    } catch {
      /* best-effort: recording the dev dir must never fail a scaffold */
    }
  }
  return written;
}

/**
 * Read this kit's own version from the nearest ancestor `package.json` whose
 * name is `@databricks-solutions/consort`. Walks up from `fromDir` (robust to
 * the dist/bin/lakebase layout and to being invoked from a temp npx extract).
 * Returns `undefined` if it can't find a matching, versioned package.json.
 */
interface ConsortPkg {
  name?: unknown;
  version?: unknown;
  dependencies?: Record<string, unknown>;
}

/** Walk up from `fromDir` to the nearest `@databricks-solutions/consort` package.json. */
function findConsortPkg(fromDir: string): ConsortPkg | undefined {
  let d = fromDir;
  for (let i = 0; i < 8; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(d, "package.json"), "utf-8")) as ConsortPkg;
      if (pkg.name === CONSORT_PKG && typeof pkg.version === "string" && pkg.version) {
        return pkg;
      }
    } catch {
      // no package.json here (or unreadable) – keep walking up
    }
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return undefined;
}

export function readConsortVersion(fromDir: string): string | undefined {
  const v = findConsortPkg(fromDir)?.version;
  return typeof v === "string" ? v : undefined;
}

/**
 * Parse an exact X.Y.Z version from a substrate dep spec: a GitHub tag
 * (`github:databricks-solutions/lakebase-scm-utils#v0.2.3` -> `"0.2.3"`) or a bare
 * registry semver (`"0.2.3"` -> `"0.2.3"`). Returns `undefined` for unpinned specs
 * (branch/SHA/dir) and for semver RANGES (`^0.2.3` is not an exact pin).
 */
export function substrateVersionFromPinSpec(spec: string): string | undefined {
  const m = spec.match(/#v?(\d+\.\d+\.\d+)\b/) ?? spec.match(/^v?(\d+\.\d+\.\d+)$/);
  return m ? m[1] : undefined;
}

/**
 * The substrate version THIS kit declares it depends on – the version in
 * `dependencies["@databricks-solutions/lakebase-scm-utils"]`, either a GitHub tag
 * (`github:databricks-solutions/lakebase-scm-utils#v0.2.3` -> `"0.2.3"`) or a bare
 * registry semver (`"0.2.3"` -> `"0.2.3"`). This is the version the scaffold SHOULD
 * run against; compare it to the actually-installed nested substrate to catch a
 * stale-cache mismatch. Returns `undefined` if the dep is absent or not exactly
 * version-pinned (a `main`/branch/dir spec, or a semver RANGE like `^0.2.3`).
 */
export function declaredSubstrateVersion(fromDir: string): string | undefined {
  const spec = findConsortPkg(fromDir)?.dependencies?.["@databricks-solutions/lakebase-scm-utils"];
  if (typeof spec !== "string") return undefined;
  return substrateVersionFromPinSpec(spec);
}

/** Convenience: resolve the version from an ESM module URL (`import.meta.url`). */
export function consortVersionFromModule(metaUrl: string): string | undefined {
  try {
    return readConsortVersion(dirname(fileURLToPath(metaUrl)));
  } catch {
    return undefined;
  }
}

/** Convenience: resolve the declared substrate version from an ESM module URL. */
export function declaredSubstrateVersionFromModule(metaUrl: string): string | undefined {
  try {
    return declaredSubstrateVersion(dirname(fileURLToPath(metaUrl)));
  } catch {
    return undefined;
  }
}
