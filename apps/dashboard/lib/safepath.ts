// One audited answer to "resolve this request-supplied relative path under this root, without
// letting it escape." Extracted from replay.ts's readFileContent, which grew this guard the hard
// way — a review found the first version served /etc/passwd through a symlink. Both the replay
// turn-file reader and the live HEAD-artifact reader now route through here, so the security-
// critical bytes live in exactly one place rather than two that can drift.

import { realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

/**
 * Resolve `rel` under `root`, returning the real (symlink-followed) path only when it is truly
 * contained. Returns null in every unsafe or unresolvable case — the caller cannot tell "escaped"
 * from "does not exist", which is deliberate: it must not leak whether a path outside the root is.
 *
 * `rel` is treated as ATTACKER-CONTROLLED (it reaches here from a request parameter). Two escapes
 * have to be defeated, and were each observed in the wild on the replay reader:
 *
 *   1. Lexical — `"../".repeat(30) + "etc/passwd"`, or an absolute path. `resolve()` collapses
 *      those, so the resolved candidate can be compared against the resolved root.
 *   2. Symlink — `resolve()` is purely lexical and does NOT follow links, so `files/leak -> /etc/passwd`
 *      passed a lexical check and served the real file. Only `realpathSync` catches it, so BOTH
 *      the root and the candidate are realpath'd and the prefix test runs on the real paths.
 *
 * The root is realpath'd too, so a root reached through a symlinked parent (a plausible layout)
 * still passes its own containment check. The `sep` suffix stops `/files-evil` passing a bare
 * `startsWith("/files")`. realpath throws for a non-existent path, which is folded into the null
 * return rather than surfaced.
 */
export function resolveContained(root: string, rel: string): string | null {
  const lexicalRoot = resolve(root);
  const lexicalTarget = resolve(lexicalRoot, rel);

  let realRoot: string;
  let realTarget: string;
  try {
    realRoot = realpathSync(lexicalRoot);
    realTarget = realpathSync(lexicalTarget);
  } catch {
    return null; // non-existent (or unresolvable) — indistinguishable from escaped, on purpose
  }
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) return null;
  return realTarget;
}
