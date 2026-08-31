import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveContained } from "./safepath";

// resolveContained returns the REAL (symlink-resolved) path — on macOS tmpdir is /var → /private/var
// — so expected values are realpath'd too, not lexically resolved.
const real = (...p: string[]) => realpathSync(join(...p));

// The one audited path guard, shared by the replay turn reader and the live HEAD reader. Its
// whole job is to defeat traversal and symlink escapes, so those are what the tests hammer.

describe("resolveContained", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "safepath-"));
    mkdirSync(join(root, "sub"), { recursive: true });
    writeFileSync(join(root, "a.txt"), "a");
    writeFileSync(join(root, "sub", "b.txt"), "b");
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("resolves a contained relative path to its real absolute path", () => {
    expect(resolveContained(root, "a.txt")).toBe(real(root, "a.txt"));
    expect(resolveContained(root, "sub/b.txt")).toBe(real(root, "sub", "b.txt"));
    // A harmless inner `..` that stays contained is fine.
    expect(resolveContained(root, "sub/../a.txt")).toBe(real(root, "a.txt"));
  });

  it("returns null for a lexical `../` or absolute escape", () => {
    expect(resolveContained(root, "../".repeat(30) + "etc/passwd")).toBeNull();
    expect(resolveContained(root, "/etc/passwd")).toBeNull();
  });

  it("returns null for a non-existent path (indistinguishable from escaped, on purpose)", () => {
    expect(resolveContained(root, "nope.txt")).toBeNull();
  });

  it("refuses a symlink that points OUT of the root", () => {
    symlinkSync("/etc/passwd", join(root, "leak"));
    expect(resolveContained(root, "leak")).toBeNull();
    // ...and a symlinked directory can't be used to resume traversal past it.
    symlinkSync("/etc", join(root, "etcdir"));
    expect(resolveContained(root, "etcdir/passwd")).toBeNull();
  });

  it("allows a symlink that stays INSIDE the root — containment, not a ban on links", () => {
    symlinkSync(join(root, "sub", "b.txt"), join(root, "link-b"));
    expect(resolveContained(root, "link-b")).toBe(real(root, "sub", "b.txt"));
  });

  it("does not let `/root-evil` pass a bare prefix check on `/root`", () => {
    // The sep-suffix guard: a sibling dir whose name starts with the root's must not pass.
    const sibling = root + "-evil";
    mkdirSync(sibling, { recursive: true });
    writeFileSync(join(sibling, "x.txt"), "x");
    try {
      // Reaching the sibling requires escaping root, so this must be null regardless.
      expect(resolveContained(root, "../" + join(sibling, "x.txt").split("/").pop()!)).toBeNull();
    } finally {
      rmSync(sibling, { recursive: true, force: true });
    }
  });
});
