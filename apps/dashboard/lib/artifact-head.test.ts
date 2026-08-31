import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readArtifactAtHead } from "./consort";

// readArtifactAtHead is the live half of the turn drill-down: an artifact.written path, read at
// HEAD, through the shared containment + text/size guards. CONSORT_PROJECT_DIR points it at a
// temp project so the whole reader runs against real files on disk.

describe("readArtifactAtHead", () => {
  let proj: string;
  let prevDir: string | undefined;

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), "artifact-head-"));
    mkdirSync(join(proj, ".sftdd", "features", "F1"), { recursive: true });
    writeFileSync(join(proj, ".sftdd", "features", "F1", "feature-spec.json"), '{\n  "name": "F1"\n}\n');
    mkdirSync(join(proj, ".sftdd", "design"), { recursive: true });
    writeFileSync(join(proj, ".sftdd", "design", "ia.md"), "# IA\n");
    prevDir = process.env.CONSORT_PROJECT_DIR;
    process.env.CONSORT_PROJECT_DIR = proj;
  });

  afterEach(() => {
    if (prevDir === undefined) delete process.env.CONSORT_PROJECT_DIR;
    else process.env.CONSORT_PROJECT_DIR = prevDir;
    rmSync(proj, { recursive: true, force: true });
  });

  it("reads a present artifact at HEAD, classified", () => {
    const r = readArtifactAtHead("features/F1/feature-spec.json");
    expect(r.path).toBe("features/F1/feature-spec.json");
    expect(r.content).toBe('{\n  "name": "F1"\n}\n');
    expect(r.reason).toBeNull();
    // Under .sftdd/ → an artifact, not code.
    expect(r.kind).toBe("artifact");
  });

  it("classifies as-resolved (under .sftdd/), agreeing with replay on interior code paths", () => {
    // Review finding: an .sftdd/-interior path that hits a code dir/ext (scripts/, tests/, app/,
    // *.py) classified "code" in live but "artifact" in replay, because live passed the bare rel
    // and skipped classify's `.sftdd/` → artifact rule. readArtifactAtHead now classifies the
    // resolved `.sftdd/`-prefixed path, so both agree — and everything under .sftdd/ is bookkeeping.
    mkdirSync(join(proj, ".sftdd", "scripts"), { recursive: true });
    writeFileSync(join(proj, ".sftdd", "scripts", "run.py"), "print(1)\n");
    const r = readArtifactAtHead("scripts/run.py");
    expect(r.content).toBe("print(1)\n");
    expect(r.kind).toBe("artifact"); // not "code", despite scripts/ + .py
  });

  it("reports a HEAD-specific reason when the file no longer exists", () => {
    const r = readArtifactAtHead("features/F1/deleted-since.json");
    expect(r.content).toBeNull();
    expect(r.reason).toBe("(no longer present at HEAD)");
  });

  it("refuses to traverse or follow a symlink out of .sftdd", () => {
    const trav = readArtifactAtHead("../".repeat(20) + "etc/passwd");
    expect(trav.content).toBeNull();
    expect(trav.reason).toBe("(no longer present at HEAD)"); // containment miss, HEAD wording

    symlinkSync("/etc/passwd", join(proj, ".sftdd", "leak.md"));
    const link = readArtifactAtHead("leak.md");
    expect(link.content).toBeNull();
    expect(link.reason).toBe("(no longer present at HEAD)");
  });

  it("names the binary/size guard reasons rather than blanking", () => {
    // A non-text extension is refused with its own reason.
    writeFileSync(join(proj, ".sftdd", "img.png"), "\x89PNG");
    const bin = readArtifactAtHead("img.png");
    expect(bin.content).toBeNull();
    expect(bin.reason).toContain("binary/non-text");
  });
});
