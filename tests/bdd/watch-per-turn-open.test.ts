// The per-turn artifact open must fire in the POLL-ONCE `--since` relay – the path the design
// lane actually runs (start.md rule 73) – not only in the blocking-tail/--monitor loop the
// normal run never enters. And it must reveal exactly what the FINISHED role produced, never
// silently (a design-role skip says WHY). These lock the three pieces: the role->artifact map,
// the editor-guarded open, pollOnce surfacing finished roles, and the relay report line.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, chmodSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { roleArtifacts, DESIGN_ROLES, resolveScope } from "../../consort/orchestrator/open/resolve-review-artifacts";
import { openRoleArtifacts } from "../../consort/orchestrator/open/open-in-editor";
import { pollOnce, reportRoleOpen } from "../../bin/consort/watch.cli";

/** A consort dir with F1/S1 designed + product/design context + a fake editor CLI on PATH. */
function fixture(): { dir: string; binDir: string } {
  const dir = mkdtempSync(join(tmpdir(), "open-role-"));
  const fdir = join(dir, "features", "F1");
  mkdirSync(fdir, { recursive: true });
  for (const [n, c] of [
    ["architecture.md", "# arch"], ["architecture.json", "{}"],
    ["db-design.md", "# db"], ["db-design.json", "{}"],
    ["feature-spec.md", "# spec"], ["feature-spec.json", "{}"],
    ["test-list.md", "# tl"], ["test-list.json", "{}"],
  ]) writeFileSync(join(fdir, n), c);
  const sdir = join(fdir, "stories", "S1");
  mkdirSync(join(sdir, "acs"), { recursive: true });
  writeFileSync(join(sdir, "story.md"), "# story");
  writeFileSync(join(sdir, "story.json"), "{}");
  writeFileSync(join(sdir, "test-list.json"), "{}");
  writeFileSync(join(sdir, "acs", "AC1.json"), "{}");
  writeFileSync(join(sdir, "acs", "AC2.json"), "{}");
  writeFileSync(join(dir, "product-overview.md"), "# po");
  writeFileSync(join(dir, "nfrs.md"), "# nfr");
  mkdirSync(join(dir, "planning"), { recursive: true });
  writeFileSync(join(dir, "planning", "feature-proposals.md"), "# fp");
  mkdirSync(join(dir, "design"), { recursive: true });
  for (const [n, c] of [["design-guide.md", "# dg"], ["design-guide.json", "{}"], ["ia.md", "# ia"], ["design-brief.md", "# brief"]])
    writeFileSync(join(dir, "design", n), c);
  writeFileSync(join(dir, "workflow-state.json"), JSON.stringify({ feature_id: "F1", story_id: "S1" }));
  // A fake `cursor` CLI so findEditorCmd resolves off PATH (checked before app bundles).
  const binDir = join(dir, "bin");
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(binDir, "cursor"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(binDir, "cursor"), 0o755); // executable, so the force-open path can really spawn it
  return { dir, binDir };
}

const SCOPE = { feature: "F1", story: "S1" } as const;

describe("roleArtifacts (role -> exactly what that role produced)", () => {
  let dir: string;
  beforeEach(() => { dir = fixture().dir; });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("architect-reviewer -> the architecture, not db-design or spec", () => {
    const a = roleArtifacts(dir, "architect-reviewer", SCOPE);
    expect(a.some((p) => p.endsWith("architecture.md"))).toBe(true);
    expect(a.some((p) => p.endsWith("architecture.json"))).toBe(true);
    expect(a.some((p) => p.endsWith("db-design.md"))).toBe(false);
    expect(a.some((p) => p.endsWith("feature-spec.md"))).toBe(false);
  });
  it("dba -> the db design only", () => {
    const a = roleArtifacts(dir, "dba", SCOPE);
    expect(a.some((p) => p.endsWith("db-design.md"))).toBe(true);
    expect(a.some((p) => p.endsWith("db-design.json"))).toBe(true);
    expect(a.some((p) => p.includes("architecture"))).toBe(false);
  });
  it("spec-author -> feature spec + the story's md/json + every AC", () => {
    const a = roleArtifacts(dir, "spec-author", SCOPE);
    expect(a.some((p) => p.endsWith("feature-spec.json"))).toBe(true);
    expect(a.some((p) => p.endsWith(join("stories", "S1", "story.json")))).toBe(true);
    expect(a.filter((p) => p.includes(join("acs", "AC")))).toHaveLength(2);
  });
  it("ux-designer -> the design guide + ia + brief", () => {
    const a = roleArtifacts(dir, "ux-designer", SCOPE);
    expect(a.some((p) => p.endsWith(join("design", "design-guide.md")))).toBe(true);
    expect(a.some((p) => p.endsWith(join("design", "ia.md")))).toBe(true);
  });
  it("test-strategist -> the feature test list", () => {
    const a = roleArtifacts(dir, "test-strategist", SCOPE);
    expect(a.some((p) => p.endsWith("test-list.md"))).toBe(true);
    expect(a.some((p) => p.endsWith("test-list.json"))).toBe(true);
  });
  it("product-owner -> its intake deliverables (overview + nfrs + design-brief), NOT the spec-author's proposals", () => {
    const a = roleArtifacts(dir, "product-owner", SCOPE);
    expect(a.some((p) => p.endsWith("product-overview.md"))).toBe(true);
    expect(a.some((p) => p.endsWith("nfrs.md"))).toBe(true);
    expect(a.some((p) => p.endsWith(join("design", "design-brief.md")))).toBe(true);
    // feature-proposals.md is the SPEC-AUTHOR's propose output, not the PO's intake.
    expect(a.some((p) => p.endsWith("feature-proposals.md"))).toBe(false);
  });
  it("navigator (reflect) -> the story under review", () => {
    const a = roleArtifacts(dir, "navigator", SCOPE);
    expect(a.some((p) => p.endsWith(join("stories", "S1", "story.json")))).toBe(true);
  });
  it("driver (build turn) -> NOTHING (code, not a reviewable design artifact)", () => {
    expect(roleArtifacts(dir, "driver", SCOPE)).toEqual([]);
  });
  it("DESIGN_ROLES covers the design lane but not the driver", () => {
    expect(DESIGN_ROLES.has("spec-author")).toBe(true);
    expect(DESIGN_ROLES.has("dba")).toBe(true);
    expect(DESIGN_ROLES.has("driver")).toBe(false);
  });
});

describe("openRoleArtifacts (editor-guarded, role-scoped)", () => {
  let f: { dir: string; binDir: string };
  beforeEach(() => { f = fixture(); });
  afterEach(() => rmSync(f.dir, { recursive: true, force: true }));

  it("opens the role's files when inside the editor's terminal", () => {
    const spawned: { cmd: string; files: string[] } = { cmd: "", files: [] };
    const res = openRoleArtifacts(f.dir, "architect-reviewer", {
      ...SCOPE,
      env: { PATH: f.binDir, TERM_PROGRAM: "vscode" },
      spawn: (cmd, files) => { spawned.cmd = cmd; spawned.files = files; },
    });
    expect(res.opened).toBe(true);
    expect(spawned.cmd).toBe("cursor");
    expect(spawned.files.some((p) => p.endsWith("architecture.md"))).toBe(true);
  });
  it("does NOT open (reason not-in-editor) outside the editor terminal", () => {
    const res = openRoleArtifacts(f.dir, "architect-reviewer", { ...SCOPE, env: { PATH: f.binDir } });
    expect(res.opened).toBe(false);
    expect(res.reason).toBe("not-in-editor");
    expect(res.files.length).toBeGreaterThan(0);
  });
  it("a build-turn role resolves no artifacts (reason no-artifacts)", () => {
    const res = openRoleArtifacts(f.dir, "driver", { ...SCOPE, env: { PATH: f.binDir, TERM_PROGRAM: "vscode" } });
    expect(res.opened).toBe(false);
    expect(res.reason).toBe("no-artifacts");
  });
});

describe("pollOnce surfaces finished roles (turnsDone) for the relay to open", () => {
  let dir: string;
  let log: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "poll-turns-"));
    log = join(dir, "drive-live.log");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("records one role per `[drive] <role> turn Ns` line, in order", () => {
    writeFileSync(
      log,
      [
        "[drive] 042 dispatch spec-author for design",
        "[drive] spec-author turn 12.3s (opus)",
        "[drive] 043 dispatch dba for design",
        "[drive] dba turn 3.0s (sonnet)",
        "",
      ].join("\n"),
    );
    expect(pollOnce(log, 0).turnsDone).toEqual(["spec-author", "dba"]);
  });
  it("no finished turn this batch => empty", () => {
    writeFileSync(log, "[drive] 044 dispatch driver for build\n");
    expect(pollOnce(log, 0).turnsDone).toEqual([]);
  });
});

describe("reportRoleOpen (never silent for a design role; silent for a build turn)", () => {
  let f: { dir: string; binDir: string };
  beforeEach(() => { f = fixture(); });
  afterEach(() => rmSync(f.dir, { recursive: true, force: true }));

  it("a design role that can't open (not in editor) reports WHY, not silence", () => {
    const line = reportRoleOpen(f.dir, "architect-reviewer", { PATH: f.binDir });
    expect(line).toContain("architect-reviewer");
    expect(line).toContain("NOT opened");
  });
  it("a driver build turn reports nothing (null) – opening nothing is expected", () => {
    expect(reportRoleOpen(f.dir, "driver", { PATH: f.binDir, TERM_PROGRAM: "vscode" })).toBeNull();
  });
  it("LAKEBASE_CONSORT_OPEN=1 force-opens from a NON-editor (background monitor) context", () => {
    // No TERM_PROGRAM (a background monitor), but the opt-in forces the open – the editor CLI
    // surfaces the file in the running instance regardless of the caller's terminal. INJECT the
    // spawn so the test asserts the open WITHOUT launching the real editor (a real spawnSync
    // resolves the editor against the process PATH, not this fixture's – so it would open the
    // temp fixture files in the developer's actual editor; never do that from a test).
    const spawn = vi.fn();
    const line = reportRoleOpen(f.dir, "architect-reviewer", { PATH: f.binDir, LAKEBASE_CONSORT_OPEN: "1" }, spawn);
    expect(line).toContain("opened");
    expect(line).not.toContain("NOT opened");
    expect(spawn).toHaveBeenCalledOnce();
    expect(spawn.mock.calls[0][1].some((p: string) => p.endsWith("architecture.md"))).toBe(true);
  });
});

describe("resolveScope (LIVE feature/story from next.json, not the stale workflow-state)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "scope-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("reads next.json's feature + the FRESHEST mid-design story (the one the role just wrote)", () => {
    writeFileSync(join(dir, "next.json"), JSON.stringify({
      feature: "F4-outbound-pick",
      state: { stories: { "S1-done": "done", "S3-a": "designing", "S4-b": "designing" } },
    }));
    for (const s of ["S3-a", "S4-b"]) mkdirSync(join(dir, "features", "F4-outbound-pick", "stories", s), { recursive: true });
    const old = new Date("2020-01-01T00:00:00Z"), recent = new Date("2020-06-01T00:00:00Z");
    utimesSync(join(dir, "features", "F4-outbound-pick", "stories", "S4-b"), old, old);
    utimesSync(join(dir, "features", "F4-outbound-pick", "stories", "S3-a"), recent, recent);
    expect(resolveScope(dir)).toEqual({ feature: "F4-outbound-pick", story: "S3-a" });
  });

  it("picks the actively-WORKED story over one we're PAST, even when the past story's mtime is fresher (the stale-open bug)", () => {
    // S1 is design-complete (ready) and happens to have the FRESHEST mtime (a later
    // checkout / rehydrate rewrote its timestamps); S2 is the one being designed now.
    writeFileSync(join(dir, "next.json"), JSON.stringify({
      feature: "F1",
      state: { stories: { "S1-ready": "ready", "S2-designing": "designing" } },
    }));
    for (const s of ["S1-ready", "S2-designing"]) mkdirSync(join(dir, "features", "F1", "stories", s), { recursive: true });
    const older = new Date("2020-01-01T00:00:00Z"), newer = new Date("2020-09-01T00:00:00Z");
    utimesSync(join(dir, "features", "F1", "stories", "S1-ready"), newer, newer); // past story, freshest on disk
    utimesSync(join(dir, "features", "F1", "stories", "S2-designing"), older, older); // current story, older mtime
    // work-status priority wins: the designing story is current despite the older mtime
    expect(resolveScope(dir)).toEqual({ feature: "F1", story: "S2-designing" });
  });

  it("next.json with a feature but no existing story dirs => feature only (no bogus story)", () => {
    writeFileSync(join(dir, "next.json"), JSON.stringify({ feature: "F4", state: { stories: { "S1": "done" } } }));
    expect(resolveScope(dir)).toEqual({ feature: "F4" });
  });

  it("falls back to workflow-state.json when there is no next.json", () => {
    writeFileSync(join(dir, "workflow-state.json"), JSON.stringify({ feature_id: "F2", story_id: "S9" }));
    expect(resolveScope(dir)).toEqual({ feature: "F2", story: "S9" });
  });

  it("null feature_id/story_id in workflow-state (the real-run bug) resolves to empty, not a false scope", () => {
    writeFileSync(join(dir, "workflow-state.json"), JSON.stringify({ feature_id: null, story_id: null, phase_feature_id: "F3-stale" }));
    expect(resolveScope(dir)).toEqual({});
  });
});
