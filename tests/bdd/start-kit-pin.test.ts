// Guard: /consort:start must pin the create-project to THIS release's version.
//
// The create command resolves `npx github:consort#<ref>`. If <ref> is unpinned
// (bare `github:consort`), npx serves whatever it cached or the mutable `main`
// branch – so a fresh plugin install can scaffold a project from the WRONG
// create-project (stale launcher name, mismatched scm-utils-ref, etc.). start.md
// therefore stamps a release version as the reliable floor:
//   KIT_REF="${KIT_REF:-vX.Y.Z}"
// This test asserts that stamped version exists and equals package.json's version,
// so a release can never ship start.md pinned to a stale (or placeholder) version.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("/consort:start pins create-project to the release version", () => {
  const startMd = fs.readFileSync(path.join(repoRoot, "commands", "start.md"), "utf8");
  const pkgVersion = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ).version as string;

  it("does NOT invoke create-project with an unpinned (bare) github:consort spec", () => {
    // The bare spec (no #ref) is the bug: npx would resolve cache/main, not the
    // installed plugin version.
    expect(startMd).not.toMatch(/github:databricks-solutions\/consort"\s*$/m);
    expect(startMd).not.toMatch(/github:databricks-solutions\/consort\$\{LAKEBASE_KIT_REF:\+#/);
  });

  it("stamps a real semver release version as the KIT_REF floor", () => {
    const m = startMd.match(/KIT_REF="\$\{KIT_REF:-v([0-9]+\.[0-9]+\.[0-9]+)\}"/);
    expect(m, "start.md must stamp KIT_REF=\"${KIT_REF:-vX.Y.Z}\" (placeholder not substituted?)").not.toBeNull();
    expect(m![1]).toBe(pkgVersion);
  });

  it("still honors an explicit LAKEBASE_KIT_REF override", () => {
    expect(startMd).toMatch(/KIT_REF="\$\{LAKEBASE_KIT_REF:-\}"/);
  });
});

describe("/consort:start Part 2 (kit install) uses install-if-cold, never a forced reinstall", () => {
  const startMd = fs.readFileSync(path.join(repoRoot, "commands", "start.md"), "utf8");

  it("runs the Part-2 toolkit step as `lk --install` (warm-cache skip), NOT `lk --refresh`", () => {
    // `--refresh` is an alias for --rewarm, which force-reinstalls UNCONDITIONALLY:
    // Part 2 re-downloaded the toolkit even when the bootstrap pre-warm had already
    // installed this version's cache. `--install` skips when the cache is complete
    // at the pinned tag (bin-completeness + tag-sha checks) and still repairs a
    // cold / incomplete / tag-moved cache.
    expect(startMd).toContain("./scripts/lk --install --detach");
    expect(startMd).not.toContain("./scripts/lk --refresh --detach   # Part 2");
    expect(startMd).not.toContain("Part 2 – the kit install (`./scripts/lk --refresh --detach`)");
  });

  it("keeps --refresh only on the deliberate upgrade / rollback paths", () => {
    // The remaining --refresh sites are the explicit kit-upgrade ritual and its
    // rollback, where a forced fresh download is the point.
    const refreshSites = startMd.match(/\.\/scripts\/lk --refresh/g) ?? [];
    expect(refreshSites.length).toBeLessThanOrEqual(4);
    expect(startMd).toContain("consort-upgrade --rollback");
  });
});
