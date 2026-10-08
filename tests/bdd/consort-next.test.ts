// FEIP-8017: consort-next, the authoritative, strictly read-only "what
// next" surface. These tests pin the decision-MENU builder (the real HIL choices
// per stop, each with its CORRECT enact CLI), the reconciled state + blockers,
// the truthful phase-complete messaging, and the DRY invariant that the gate
// enact map is the SAME one the drive's approve hint uses (so they can never
// drift, subsuming Findings 10/12/13).

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildNextOptions,
  buildNextSnapshot,
  buildStoryReview,
  readFeatureNextSnapshot,
  emitNextJson,
  type NextContext,
} from "../../consort/orchestrator/status/next";
import {
  approveHint,
  gateEnactCommand,
} from "../../consort/logging/orchestrator-logging";
import type { DriveState, WorkflowAction } from "../../consort/orchestrator/drive/orchestrator-drive";

const CTX: NextContext = { featureId: "F1-checkout", approver: "po@example.com", version: "0.3.0-test", now: "2026-07-15T00:00:00.000Z" };

/** A minimal DriveState; the transition is injected in most tests, so only the
 *  summary-facing fields (phase, escalation) matter. */
function baseState(over: Partial<DriveState> = {}): DriveState {
  return { phase: "feature", breakdownDone: true, storyOrder: [], stories: {}, buildActive: null, ...over };
}
const fixed = (action: WorkflowAction) => () => action;

describe("gateEnactCommand: the ONE gate -> CLI mapping (DRY, subsumes Findings 10/12)", () => {
  it("routes each gate to its correct substrate door", () => {
    expect(gateEnactCommand({ kind: "approve-plan-gate" }, { sprint: "S1", approver: "you" })).toEqual({
      bin: "consort-approve-gate",
      args: ["--sprint", "S1", "--approver", "you"],
    });
    // per-story spec gate is pipeline-scoped (--feature --story), NOT feature gates.json
    expect(gateEnactCommand({ kind: "approve-gate", story: "S2" }, { featureId: "F1", approver: "you" })).toEqual({
      bin: "consort-approve-gate",
      args: ["--feature", "F1", "--story", "S2", "--approver", "you"],
    });
    expect(gateEnactCommand({ kind: "approve-deploy-gate" }, { featureId: "F1", approver: "you" })).toEqual({
      bin: "consort-approve-gate",
      args: ["--feature", "F1", "--gate", "deploy", "--approver", "you"],
    });
    // promote REQUIRES --promote-ref (FEIP-8019): defaults to the feature id, or
    // the feature branch when supplied.
    expect(gateEnactCommand({ kind: "approve-promote-gate" }, { featureId: "F1", approver: "you" })).toEqual({
      bin: "consort-approve-gate",
      args: ["--feature", "F1", "--gate", "promote", "--promote-ref", "F1", "--approver", "you"],
    });
    expect(gateEnactCommand({ kind: "approve-promote-gate" }, { featureId: "F1", featureBranch: "feat/orders", approver: "you" })).toEqual({
      bin: "consort-approve-gate",
      args: ["--feature", "F1", "--gate", "promote", "--promote-ref", "feat/orders", "--approver", "you"],
    });
    // acceptance routes through the pipeline accept (which owns the experiment merge)
    expect(gateEnactCommand({ kind: "accept", story: "S3" }, { featureId: "F1", approver: "you" })).toEqual({
      bin: "consort-pipeline",
      args: ["accept", "--feature", "F1", "--story", "S3", "--approver", "you"],
    });
    expect(gateEnactCommand({ kind: "deploy" }, {})).toBeNull(); // non-gate
  });

  it("approveHint is a projection of gateEnactCommand (the two can never drift)", () => {
    for (const gate of [
      { kind: "approve-plan-gate" } as const,
      { kind: "approve-gate", story: "S2" } as const,
      { kind: "approve-deploy-gate" } as const,
      { kind: "approve-promote-gate" } as const,
      { kind: "accept", story: "S3" } as const,
    ]) {
      const cmd = gateEnactCommand(gate, { featureId: "F1", sprint: "SP" })!;
      expect(approveHint(gate, { featureId: "F1", sprint: "SP" })).toBe(`${cmd.bin} ${cmd.args.join(" ")}`);
    }
  });
});

describe("buildNextOptions: the decision menu per stop", () => {
  it("acceptance offers accept / discard / revise / hold, each with its real CLI", () => {
    const opts = buildNextOptions({ kind: "accept", story: "S3" }, CTX);
    expect(opts.map((o) => o.id)).toEqual(["acceptance.accept", "acceptance.discard", "acceptance.revise", "hold"]);
    const accept = opts.find((o) => o.id === "acceptance.accept")!;
    expect(accept.kind).toBe("gate");
    expect(accept.enact).toEqual({
      bin: "consort-pipeline",
      args: ["accept", "--feature", "F1-checkout", "--story", "S3", "--approver", "po@example.com"],
    });
    expect(opts.find((o) => o.id === "acceptance.discard")!.enact).toEqual({
      bin: "consort-pipeline",
      args: ["discard", "--feature", "F1-checkout", "--story", "S3", "--approver", "po@example.com", "--reason", "<reason>"],
    });
    expect(opts.find((o) => o.id === "acceptance.revise")!.enact).toEqual({
      bin: "consort-pipeline",
      args: ["revise", "--feature", "F1-checkout", "--story", "S3", "--approver", "po@example.com", "--reason", "<reason>"],
    });
    // every option poses a question to the human
    expect(opts.every((o) => o.hil_prompt.length > 0)).toBe(true);
    // the accept gate offers a working-software review before the decision (run-dev.sh)
    const acc = opts.find((o) => o.id === "acceptance.accept")!;
    expect(acc.note).toMatch(/run-dev\.sh/);
    expect(acc.note).toMatch(/working-software|curl|client URL|Postman/i);
    expect(acc.note).toMatch(/seed_dev\.py|SEED DATA/i); // offers to seed the review
  });

  it("the backlog gate surfaces the exact consort-sync-backlog command (no kit-scanning to find it)", () => {
    // The backlog SELECTION is the approve-backlog-gate. consort-next must NAME the command that
    // commits it (consort-sync-backlog --features), so a session reads it off the menu instead of
    // grepping the kit to rediscover how the backlog is recorded.
    const opts = buildNextOptions(
      { kind: "approve-backlog-gate" } as WorkflowAction,
      { sprint: "stockflow-s1", approver: "po@example.com" },
    );
    const commit = opts.find((o) => o.id === "backlog.commit")!;
    expect(commit).toBeDefined();
    expect(commit.kind).toBe("gate");
    expect(commit.enact).toEqual({
      bin: "consort-sync-backlog",
      args: ["--sprint", "stockflow-s1", "--features", "<id[,id...]>"],
    });
    expect(commit.note).toContain("feature-proposals.md"); // points at the project's proposal for the ids
    expect(opts.some((o) => o.id === "hold")).toBe(true); // hold is still offered
    // NOT the bare resume default
    expect(opts.some((o) => o.id === "resume")).toBe(false);
  });

  it("each approval gate offers approve + hold with the correct enact command", () => {
    for (const [action, id] of [
      [{ kind: "approve-plan-gate" }, "plan.approve"],
      [{ kind: "approve-gate", story: "S1" }, "spec.approve"],
      [{ kind: "approve-deploy-gate" }, "deploy.approve"],
      [{ kind: "approve-promote-gate" }, "promote.approve"],
    ] as const) {
      const opts = buildNextOptions(action, CTX);
      expect(opts.map((o) => o.id)).toEqual([id, "hold"]);
      expect(opts[0].kind).toBe("gate");
      expect(opts[0].enact).toEqual(gateEnactCommand(action, CTX));
    }
  });

  it("the promote option carries the required --promote-ref (feature branch), not a no-op (FEIP-8019)", () => {
    const opts = buildNextOptions({ kind: "approve-promote-gate" }, { ...CTX, featureBranch: "feat/orders" });
    const promote = opts.find((o) => o.id === "promote.approve")!;
    expect(promote.enact).toEqual({
      bin: "consort-approve-gate",
      args: ["--feature", "F1-checkout", "--gate", "promote", "--promote-ref", "feat/orders", "--approver", "po@example.com"],
    });
  });

  it("promote-phase merge/prepare-pr are flagged outward-facing", () => {
    for (const action of [{ kind: "prepare-pr" }, { kind: "merge" }] as const) {
      const resume = buildNextOptions(action, CTX)[0];
      expect(resume.outward_facing).toBe(true);
      expect(resume.enact).toEqual({ bin: "consort-drive", args: ["--feature", "F1-checkout"] });
    }
  });

  it("a blocker (raise-to-hil) offers resume-after-resolve + hold, not a fabricated fix", () => {
    const opts = buildNextOptions({ kind: "raise-to-hil", reason: "boom", source: "smell:x" }, CTX);
    expect(opts.map((o) => o.id)).toEqual(["resume", "hold"]);
    expect(opts[0].note).toMatch(/escalation/i);
  });

  it("done offers a single terminal noop (no fabricated action)", () => {
    const opts = buildNextOptions({ kind: "done" }, CTX);
    expect(opts).toHaveLength(1);
    expect(opts[0].kind).toBe("noop");
    expect(opts[0].enact).toBeNull();
  });
});

describe("api-only stories offer the Swagger UI at the acceptance gate", () => {
  it("api-only + a live deploy: the accept prompt offers the Swagger UI at the docs URL", () => {
    const accept = buildNextOptions(
      { kind: "accept", story: "S3" },
      { ...CTX, storyReview: { S3: { apiOnly: true, docsUrl: "http://127.0.0.1:8000/docs" } } },
    ).find((o) => o.id === "acceptance.accept")!;
    expect(accept.hil_prompt).toMatch(/API-ONLY/i);
    expect(accept.hil_prompt).toMatch(/Swagger/);
    expect(accept.hil_prompt).toContain("http://127.0.0.1:8000/docs");
    expect(accept.note).toMatch(/Swagger/);
  });

  it("api-only but no live docs URL yet: STILL always offers Swagger via run-dev.sh + /docs", () => {
    const accept = buildNextOptions(
      { kind: "accept", story: "S3" },
      { ...CTX, storyReview: { S3: { apiOnly: true } } },
    ).find((o) => o.id === "acceptance.accept")!;
    expect(accept.hil_prompt).toMatch(/Swagger/);
    expect(accept.hil_prompt).toMatch(/\/docs/);
    expect(accept.hil_prompt).toMatch(/run-dev\.sh/);
  });

  it("a UI story (not api-only) gets NO Swagger offer", () => {
    const accept = buildNextOptions(
      { kind: "accept", story: "S3" },
      { ...CTX, storyReview: { S3: { apiOnly: false } } },
    ).find((o) => o.id === "acceptance.accept")!;
    expect(accept.hil_prompt).not.toMatch(/Swagger/);
  });

  it("buildStoryReview: a backend-only test list is apiOnly with a live /docs URL; a client test is not", () => {
    const consortDir = mkdtempSync(join(tmpdir(), "next-review-"));
    const mk = (story: string, items: Array<{ kind: string }>, evidence?: object): void => {
      const sdir = join(consortDir, "features", "F1-checkout", "stories", story);
      mkdirSync(sdir, { recursive: true });
      writeFileSync(join(sdir, "test-list-per-story.json"), JSON.stringify({ items }));
      if (evidence) writeFileSync(join(sdir, "deploy-evidence.json"), JSON.stringify(evidence));
    };
    mk("S1", [{ kind: "behavior" }, { kind: "fitness" }], {
      schema_version: 1, feature_id: "F1-checkout", story_id: "S1", target: "local",
      url: "http://127.0.0.1:8000/", reachable: true, verify: { passed: true }, deployed_at: "2026-01-01T00:00:00Z",
    });
    mk("S2", [{ kind: "behavior" }, { kind: "client" }]); // has a UI test -> not api-only
    const review = buildStoryReview(consortDir, "F1-checkout");
    expect(review.S1).toEqual({ apiOnly: true, docsUrl: "http://127.0.0.1:8000/docs" });
    expect(review.S2.apiOnly).toBe(false);
    expect(review.S2.docsUrl).toBeUndefined();
    rmSync(consortDir, { recursive: true, force: true });
  });
});

describe("buildNextSnapshot: reconciled state, blockers, truthful summary", () => {
  it("done reads as SHIPPED, not a 0-action no-op (subsumes Finding 13)", () => {
    const snap = buildNextSnapshot("feature", baseState({ phase: "done" }), CTX, fixed({ kind: "done" }));
    expect(snap.primary_action.kind).toBe("done");
    expect(snap.summary).toMatch(/complete/i);
    expect(snap.summary).not.toMatch(/0 actions/);
    expect(snap.state.open_gates).toEqual([]);
  });

  it("feature-complete frames the next step as deploy, not silence", () => {
    const snap = buildNextSnapshot("feature", baseState(), CTX, fixed({ kind: "feature-complete" }));
    expect(snap.summary).toMatch(/deploy/i);
    expect(snap.options.map((o) => o.id)).toEqual(["resume", "hold"]);
  });

  it("surfaces open_gates for a gate stop", () => {
    const snap = buildNextSnapshot("feature", baseState(), CTX, fixed({ kind: "accept", story: "S3" }));
    expect(snap.state.open_gates).toEqual(["acceptance"]);
    expect(snap.summary).toMatch(/acceptance gate/);
  });

  it("derives feature phase from the injected per-story rows (reuses feature-status)", () => {
    const snap = buildNextSnapshot("feature", baseState({ phase: "feature" }), {
      ...CTX,
      stories: [
        { story_id: "S1", status: "done", gate_status: "approved", accepted: true },
        { story_id: "S2", status: "done", gate_status: "approved", accepted: true },
      ],
    }, fixed({ kind: "done" }));
    expect(snap.state.derived_phase).toBe("complete");
    expect(snap.state.stories).toEqual({ S1: "done", S2: "done" });
  });

  it("awaiting_human is the SOLE human-needed signal – TRUE for the backlog gate (the human's feature selection)", () => {
    // The backlog SELECTION is now its own HITL gate (approve-backlog-gate): the human picks which
    // proposed features enter the sprint. It surfaces a backlog.commit option (kind gate) + carries
    // "backlog" in open_gates, so awaiting_human catches it directly.
    const backlog = buildNextSnapshot(
      "sprint",
      baseState(),
      { ...CTX, sprint: "s1" },
      fixed({ kind: "approve-backlog-gate" } as WorkflowAction),
    );
    expect(backlog.primary_action.kind).toBe("approve-backlog-gate");
    expect(backlog.state.open_gates).toEqual(["backlog"]);
    expect(backlog.awaiting_human).toBe(true); // a human IS needed (option: backlog.commit)
    expect(backlog.options.map((o) => o.id)).toContain("backlog.commit");

    // The metered author-requests PO turn that FOLLOWS the gate is an ordinary agent turn the drive
    // RESUMES (it authors each committed feature-request.md) – NOT a human decision.
    const authorRequests = buildNextSnapshot(
      "sprint",
      baseState(),
      { ...CTX, sprint: "s1" },
      fixed({ kind: "invoke-role", role: "product-owner", mode: "author-requests" } as WorkflowAction),
    );
    expect(authorRequests.options.map((o) => o.id)).toContain("resume");
    expect(authorRequests.awaiting_human).toBe(false);

    // The planning INTAKE step is now a metered PO agent turn (it DRAFTS the intake docs from the
    // human's gathered answers), so consort-next treats it like any other agent turn: it offers
    // `resume` and does NOT await a human (the coordinating session gathered the answers before /plan;
    // the human's review is at the drafts, not a consort-next pause).
    const intake = buildNextSnapshot(
      "sprint",
      baseState(),
      { ...CTX, sprint: "s1" },
      fixed({ kind: "invoke-role", role: "product-owner", mode: "intake" } as WorkflowAction),
    );
    expect(intake.options.map((o) => o.id)).toContain("resume");
    expect(intake.awaiting_human).toBe(false);

    // The INTAKE gate (after the PO drafts the intake, before propose) is a HITL gate: it surfaces
    // an intake.approve option and awaits the human (review/edit/approve before the Spec Author).
    const intakeGate = buildNextSnapshot(
      "sprint",
      baseState(),
      { ...CTX, sprint: "s1" },
      fixed({ kind: "approve-intake-gate" } as WorkflowAction),
    );
    expect(intakeGate.awaiting_human).toBe(true);
    expect(intakeGate.options.map((o) => o.id)).toContain("intake.approve");
    expect(intakeGate.options.find((o) => o.id === "intake.approve")?.kind).toBe("gate");

    // A gate + a per-story accept both require the human.
    expect(buildNextSnapshot("feature", baseState(), CTX, fixed({ kind: "accept", story: "S3" })).awaiting_human).toBe(true);

    // An autonomous role turn offers `resume` => the session drives on, no human needed.
    const roleTurn = buildNextSnapshot("feature", baseState(), CTX, fixed({ kind: "invoke-role", role: "driver" } as WorkflowAction));
    expect(roleTurn.options.map((o) => o.id)).toContain("resume");
    expect(roleTurn.awaiting_human).toBe(false);

    // Terminal states are not "awaiting a human".
    expect(buildNextSnapshot("feature", baseState({ phase: "done" }), CTX, fixed({ kind: "done" })).awaiting_human).toBe(false);
  });

  it("an escalation surfaces a blocker whose resolver is the resolve VERB (never a hand-edit hint)", () => {
    const snap = buildNextSnapshot(
      "feature",
      baseState({ escalation: { id: "e1", source: "smell:fragility", reason: "flaky aggregate", story_id: "S2" } }),
      CTX,
    );
    expect(snap.primary_action.kind).toBe("raise-to-hil");
    expect(snap.state.blockers).toHaveLength(1);
    // The deterministic clear is the resolve verb (clears the escalation AND any blocking smell), not a
    // null resolver + "rm the files" hint – the old hint that led sessions to hand-edit state on disk.
    expect(snap.state.blockers[0]).toMatchObject({
      source: "smell:fragility",
      reason: "flaky aggregate",
      story: "S2",
      resolver: { bin: "consort-resolve-escalation", args: ["--id", "e1", "--resolution", "<what you fixed>"] },
    });
    expect(snap.state.blockers[0].resolver_hint).toMatch(/consort-resolve-escalation --id e1/);
    expect(snap.state.blockers[0].resolver_hint).toMatch(/do NOT hand-edit/i);
    expect(snap.summary).toMatch(/BLOCKED/);
  });

  it("stamps scope, version, and generated_at; feature id echoes", () => {
    const snap = buildNextSnapshot("feature", baseState(), CTX, fixed({ kind: "done" }));
    expect(snap.scope).toBe("feature");
    expect(snap.feature).toBe("F1-checkout");
    expect(snap.authoritative_playbook_version).toBe("0.3.0-test");
    expect(snap.generated_at).toBe("2026-07-15T00:00:00.000Z");
  });
});

describe("on-disk: read is side-effect-free; the drive auto-emit writes next.json", () => {
  const F = "F1-checkout";
  let tdd: string;

  function fileSet(dir: string): string[] {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => join(String((d as unknown as { parentPath?: string }).parentPath ?? dir), d.name))
      .sort();
  }

  function stageCompleted(): void {
    tdd = mkdtempSync(join(tmpdir(), "next-"));
    mkdirSync(join(tdd, "features", F), { recursive: true });
    // Coarse workflow phase stale at the scaffold default; the pipeline is the truth.
    writeFileSync(join(tdd, "workflow-state.json"), JSON.stringify({ phase: "discovery", feature_id: null }) + "\n");
    writeFileSync(
      join(tdd, "features", F, "pipeline.json"),
      JSON.stringify({
        version: 1,
        feature_id: F,
        build_queue: [],
        build_active: null,
        stories: {
          S1: { status: "done", gate: { status: "approved", history: [] }, acceptance: { decision: "accepted", history: [] } },
          S2: { status: "done", gate: { status: "approved", history: [] }, acceptance: { decision: "accepted", history: [] } },
        },
      }) + "\n",
    );
  }

  it("readFeatureNextSnapshot reflects the on-disk pipeline and writes NOTHING", () => {
    stageCompleted();
    const before = fileSet(tdd);
    // Non-UI reconciliation test: uiTrack:false so a fully-accepted feature's next step is
    // feature-complete, not a pending UX Designer step (uiTrack defaults ON in production).
    const snap = readFeatureNextSnapshot(tdd, F, tdd, { version: "v-test", uiTrack: false });
    // reconciled: derived phase = complete even though the coarse phase is stale
    expect(snap.state.derived_phase).toBe("complete");
    expect(snap.state.stories).toEqual({ S1: "done", S2: "done" });
    // a fully accepted feature's next step is deploy, not a no-op
    expect(snap.primary_action.kind).toBe("feature-complete");
    // strictly read-only: not a single file changed, and NO next.json was written
    expect(fileSet(tdd)).toEqual(before);
    expect(existsSync(join(tdd, "next.json"))).toBe(false);
    rmSync(tdd, { recursive: true, force: true });
  });

  it("emitNextJson writes an advisory next.json without mutating the pipeline", () => {
    stageCompleted();
    const pipelineBefore = readFileSync(join(tdd, "features", F, "pipeline.json"), "utf8");
    emitNextJson(tdd, F, tdd, { version: "v-test" });
    const nextPath = join(tdd, "next.json");
    expect(existsSync(nextPath)).toBe(true);
    const snap = JSON.parse(readFileSync(nextPath, "utf8"));
    expect(snap.scope).toBe("feature");
    expect(snap.feature).toBe(F);
    expect(snap.state.derived_phase).toBe("complete");
    expect(Array.isArray(snap.options)).toBe(true);
    // the workflow artifact is untouched (the emit is read-only w.r.t. state)
    expect(readFileSync(join(tdd, "features", F, "pipeline.json"), "utf8")).toBe(pipelineBefore);
    rmSync(tdd, { recursive: true, force: true });
  });
});
