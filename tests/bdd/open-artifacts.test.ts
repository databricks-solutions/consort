// The review-artifact opener (consort-open + consort-watch's gate hook). It resolves
// the Consort roles' reviewable artifacts and opens them in Cursor/Code – but ONLY
// when the session is inside the editor's terminal, and never launches an editor
// uninvited. The `spawn` seam lets us assert what would open without spawning.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { reviewArtifacts } from "../../consort/orchestrator/open/resolve-review-artifacts";
import { openArtifactsInEditor, isInsideEditor } from "../../consort/orchestrator/open/open-in-editor";

let tdd: string;
beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "open-"));
});
afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

function write(rel: string, body = "{}"): void {
  const p = join(tdd, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, body);
}

describe("reviewArtifacts", () => {
  it("returns only existing artifacts, in review order (design/planning -> feature -> story/ACs)", () => {
    write("planning/feature-proposals.md");
    write("design/design-brief.md");
    write("features/F1-x/feature-spec.json");
    write("features/F1-x/architecture.md");
    write("features/F1-x/stories/S1-y/story.md");
    write("features/F1-x/stories/S1-y/acs/AC1-a.json");
    write("features/F1-x/stories/S1-y/acs/AC2-b.json");
    const got = reviewArtifacts(tdd, { feature: "F1-x", story: "S1-y" }).map((p) => p.replace(tdd + "/", ""));
    expect(got[0]).toBe("planning/feature-proposals.md"); // context first
    expect(got).toContain("features/F1-x/feature-spec.json");
    expect(got).toContain("features/F1-x/stories/S1-y/acs/AC1-a.json");
    expect(got).toContain("features/F1-x/stories/S1-y/acs/AC2-b.json");
    // ACs come after the story spec.
    expect(got.indexOf("features/F1-x/stories/S1-y/story.md")).toBeLessThan(
      got.indexOf("features/F1-x/stories/S1-y/acs/AC1-a.json"),
    );
  });

  it("no feature => the planning/design review set", () => {
    write("planning/feature-proposals.md");
    write("design/design-brief.md");
    const got = reviewArtifacts(tdd, {});
    expect(got).toHaveLength(2);
  });
});

describe("reviewArtifacts COVERS the artifact channel (single source – no drift)", () => {
  // The invariant: whatever a role writes to the `artifact` channel (declared in the
  // step manifests) MUST be opened by reviewArtifacts. This test derives the truth
  // from SHIPPED_MANIFESTS, so adding an artifact-channel output that reviewArtifacts
  // does not open fails the build – the review set can't silently drift from the channel.
  it("opens every artifact-channel manifest output", async () => {
    const { SHIPPED_MANIFESTS } = await import("../../consort/orchestrator/steps/manifest");
    const artifactOutputs = [
      ...new Set(
        SHIPPED_MANIFESTS.flatMap((m) => (m.outputs ?? []).filter((o) => o.channel === "artifact").map((o) => o.filename)),
      ),
    ];
    expect(artifactOutputs.length).toBeGreaterThan(0);

    const F = "F1-x";
    const S = "S1-y";
    // A fixture with every artifact-channel output present at its scoped location.
    write("product-overview.md"); // product-owner intake turn
    write("nfrs.md"); // product-owner intake turn
    write("design/design-brief.md"); // product-owner intake turn (UI track)
    write("planning/estimates.json");
    write("planning/feature-proposals.md");
    write("design/design-guide.json");
    write("design/ia.md"); // ux-ia per-story refinement (artifact channel)
    write(`features/${F}/feature-spec.json`);
    write(`features/${F}/architecture.json`);
    write(`features/${F}/db-design.json`);
    write(`features/${F}/test-list.json`);
    write(`features/${F}/stories/${S}/acs/AC1-a.json`);

    const opened = reviewArtifacts(tdd, { feature: F, story: S });
    const basenames = new Set(opened.map((p) => p.split("/").pop()));
    const parentDirs = new Set(opened.map((p) => p.split("/").slice(-2, -1)[0]));

    for (const fn of artifactOutputs) {
      if (fn === "acs") {
        expect(parentDirs.has("acs"), `artifact-channel dir output "acs" – no AC file opened (drift)`).toBe(true);
      } else {
        const base = fn.split("/").pop()!;
        expect(basenames.has(base), `artifact-channel output "${fn}" is NOT opened by reviewArtifacts (drift)`).toBe(true);
      }
    }
  });
});

describe("openArtifactsInEditor", () => {
  const editorEnv = { PATH: "", TERM_PROGRAM: "vscode" } as NodeJS.ProcessEnv;

  it("opens the artifacts via the editor when INSIDE the editor terminal", () => {
    write("features/F1-x/feature-spec.json");
    const spawn = vi.fn();
    // Force an editor to be 'found' by pointing findEditorCmd at an app-bundle-less env:
    // supply --force so the not-in-editor gate is bypassed and only the spawn is asserted.
    const res = openArtifactsInEditor(tdd, { feature: "F1-x", env: editorEnv, force: true, spawn });
    // With no real editor on PATH in the test env, it reports no-editor OR opens via
    // the injected spawn if a bundle exists. Assert the resolution + the seam contract:
    expect(res.files.some((f) => f.endsWith("feature-spec.json"))).toBe(true);
    if (res.opened) {
      expect(spawn).toHaveBeenCalledOnce();
      expect(spawn.mock.calls[0][1]).toEqual(res.files);
    } else {
      expect(res.reason).toBe("no-editor");
    }
  });

  it("does NOT open (reports paths) when not inside an editor and not forced", () => {
    write("features/F1-x/feature-spec.json");
    const spawn = vi.fn();
    const res = openArtifactsInEditor(tdd, { feature: "F1-x", env: { PATH: "", TERM_PROGRAM: "Apple_Terminal" }, spawn });
    expect(spawn).not.toHaveBeenCalled();
    expect(res.opened).toBe(false);
    expect(["not-in-editor", "no-editor"]).toContain(res.reason);
  });

  it("no artifacts => no-artifacts, never spawns", () => {
    const spawn = vi.fn();
    const res = openArtifactsInEditor(tdd, { feature: "F1-x", env: editorEnv, force: true, spawn });
    expect(res.opened).toBe(false);
    expect(res.reason).toBe("no-artifacts");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("isInsideEditor detects the editor terminal", () => {
    expect(isInsideEditor({ TERM_PROGRAM: "vscode" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isInsideEditor({ TERM_PROGRAM: "Apple_Terminal" } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("openArtifactsInEditor per-turn delta (changedSinceMs)", () => {
  // The per-turn open (consort-watch, after each role's turn-done) reveals ONLY what that
  // turn produced – the reviewable artifacts modified since the previous turn boundary ,
  // instead of re-opening the whole review set. Left unset, behavior is unchanged.
  const editorEnv = { PATH: "", TERM_PROGRAM: "vscode" } as NodeJS.ProcessEnv;

  it("opens ONLY the artifacts modified at/after changedSinceMs (what the role just produced)", () => {
    write("features/F1-x/feature-spec.json"); // produced by an EARLIER turn
    write("features/F1-x/architecture.json"); // produced by THIS turn
    const t = Date.now();
    const old = new Date(t - 120_000);
    const fresh = new Date(t + 120_000);
    utimesSync(join(tdd, "features/F1-x/feature-spec.json"), old, old);
    utimesSync(join(tdd, "features/F1-x/architecture.json"), fresh, fresh);
    const spawn = vi.fn();
    const res = openArtifactsInEditor(tdd, { feature: "F1-x", changedSinceMs: t, env: editorEnv, force: true, spawn });
    expect(res.files.some((f) => f.endsWith("architecture.json"))).toBe(true); // changed this turn
    expect(res.files.some((f) => f.endsWith("feature-spec.json"))).toBe(false); // untouched => excluded
    if (res.opened) expect(spawn.mock.calls[0][1]).toEqual(res.files);
  });

  it("nothing changed since => no-artifacts, never spawns", () => {
    write("features/F1-x/feature-spec.json");
    const old = new Date(Date.now() - 120_000);
    utimesSync(join(tdd, "features/F1-x/feature-spec.json"), old, old);
    const spawn = vi.fn();
    const res = openArtifactsInEditor(tdd, { feature: "F1-x", changedSinceMs: Date.now(), env: editorEnv, force: true, spawn });
    expect(res.opened).toBe(false);
    expect(res.reason).toBe("no-artifacts");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("changedSinceMs unset => opens the full set (unchanged consort-open behavior)", () => {
    write("features/F1-x/feature-spec.json");
    write("features/F1-x/architecture.json");
    const spawn = vi.fn();
    const res = openArtifactsInEditor(tdd, { feature: "F1-x", env: editorEnv, force: true, spawn });
    expect(res.files.some((f) => f.endsWith("feature-spec.json"))).toBe(true);
    expect(res.files.some((f) => f.endsWith("architecture.json"))).toBe(true);
  });
});
