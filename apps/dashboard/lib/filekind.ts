// File-kind rules shared by both sources: what counts as code vs. a process artifact, which
// extensions are text, and the size cap for embedding a file in a response. Ported from Kevin's
// build_dashboard.py:47-56; lived in replay.ts until the live HEAD-artifact reader needed the
// same rules, at which point duplicating them (or importing replay into live) was the wrong
// trade. One definition here, so the two readers can never disagree about "is this text?".

import { readFileSync, statSync } from "node:fs";

// The caps keep a 1.5 MB payload from becoming a 50 MB one, and avoid embedding lock files.
export const MAX_FILE_BYTES = 64 * 1024;
export const SKIP_FILE_NAMES = new Set(["uv.lock"]);
export const TEXT_EXTS = new Set([
  ".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".txt", ".yaml",
  ".yml", ".toml", ".ini", ".cfg", ".html", ".css", ".sql", ".feature",
  ".env", ".sh", ".gitignore",
]);
const CODE_EXTS = new Set([".py", ".ts", ".tsx", ".js", ".jsx", ".sql", ".css", ".html"]);
const CODE_DIR_PREFIXES = ["app/", "client/src", "client/tests", "alembic/", "tests/", "scripts/"];

/** `.ext` of a path's basename, or "" when it has none. Shared so the rules can't drift. */
export function extOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i);
}

/**
 * Is a path code, or a process artifact?
 *
 * The artifact-root rule is not cosmetic: a `.consort/features/…/test-list.json` is the workflow's
 * own bookkeeping, and showing it in a "code produced" view would drown the actual diff. All the
 * root names Consort has used are matched — v0.3.7 renamed `.sftdd/` → `.consort/` but recorded
 * corpora and legacy projects still carry the old prefixes, so a corpus must classify the same way
 * whichever root its logged paths were captured under.
 */
const ARTIFACT_ROOT_PREFIXES = [".consort/", ".sftdd/", ".tdd/"];

export function classify(path: string): "code" | "artifact" {
  if (ARTIFACT_ROOT_PREFIXES.some((p) => path.startsWith(p))) return "artifact";
  const isCode = CODE_DIR_PREFIXES.some((p) => path.startsWith(p)) || CODE_EXTS.has(extOf(path));
  return isCode ? "code" : "artifact";
}

/**
 * Read an ALREADY-CONTAINED absolute path as text, applying the skip/size/binary guards, and
 * report why when it can't. `rel` is passed only for its basename and extension (the skip-list
 * and text-ext checks); `abs` is the resolveContained() output that the read actually uses, so
 * the thing that was security-checked is the thing that gets read.
 */
export function readTextFile(abs: string, rel: string): { content: string | null; reason: string | null } {
  const name = rel.split("/").pop() ?? rel;
  if (SKIP_FILE_NAMES.has(name)) return { content: null, reason: "(skipped: lock file)" };

  let size: number;
  try {
    const st = statSync(abs);
    if (!st.isFile()) return { content: null, reason: "(not a file)" };
    size = st.size;
  } catch {
    return { content: null, reason: "(unreadable)" };
  }
  if (size > MAX_FILE_BYTES) return { content: null, reason: `(too large to embed: ${size} bytes)` };

  const ext = extOf(rel);
  if (ext && !TEXT_EXTS.has(ext)) return { content: null, reason: `(binary/non-text: ${ext})` };
  try {
    return { content: readFileSync(abs, "utf8"), reason: null };
  } catch {
    return { content: null, reason: "(unreadable)" };
  }
}
