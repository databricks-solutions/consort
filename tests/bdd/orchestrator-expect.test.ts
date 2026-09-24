// The handoff EXPECTATION protocol: every role handoff records the non-null
// artifact its responder owes, and the queue aborts (ProtocolViolationError)
// when that artifact is absent/null/empty – the precise, attributed failure
// that replaces a silent re-dispatch / generic stall. The S2 live stall (a
// test-strategist that left an EMPTY per-story test list) is the canonical case.

import { describe, it, expect } from "vitest";
import {
  expectationFor,
  ExpectationLedger,
  ProtocolViolationError,
  UnexpectedCallbackError,
  handbackMessage,
} from "../../consort/gates/orchestrator-expect";
import type { DriveState, WorkflowAction } from "../../consort/orchestrator/drive/orchestrator-drive";

function baseState(over: Partial<DriveState> = {}): DriveState {
  return {
    phase: "feature",
    breakdownDone: true,
    storyOrder: ["S2-submit-create-bug"],
    stories: {
      "S2-submit-create-bug": {
        gateApproved: false,
        gateSurfaced: false,
        design: { hasAcs: true, architectAnnotated: true, architectProjectable: false, dbaDesigned: false, testListReady: false, testListConforms: true, reflectionPassed: false, reflectionVerdictWritten: false },
        build: {
          experimentCut: false,
          testsWritten: false,
          codeWritten: false,
          awaitingAcceptance: false,
          deployVerified: false,
          accepted: false,
        },
      },
    },
    buildActive: null,
    ...over,
  };
}

describe("expectationFor: each role handoff declares its non-null return contract", () => {
  it("non-role actions (the driver's own substrate) carry no expectation", () => {
    expect(expectationFor({ kind: "cut-experiment", story: "S2-submit-create-bug" } as unknown as WorkflowAction)).toBeNull();
    expect(expectationFor({ kind: "surface-gate", gate: "spec", story: "S2-submit-create-bug" } as unknown as WorkflowAction)).toBeNull();
    expect(expectationFor({ kind: "await-acceptance", story: "S2-submit-create-bug" } as unknown as WorkflowAction)).toBeNull();
    expect(expectationFor({ kind: "done" } as WorkflowAction)).toBeNull();
  });

  it("per-cycle RED (navigator) + GREEN (driver) build turns carry NO contract (coarse story booleans would false-abort mid-story)", () => {
    // Regression: codeWritten/testsWritten are story-level (all-green / all-written),
    // so a single GREEN turn while later tests are pending leaves codeWritten=false.
    // Enforcing it false-aborted a healthy build right after the first GREEN. The
    // per-cycle loop is covered by the stall detector instead.
    expect(expectationFor({ kind: "invoke-role", role: "navigator", story: "S2-submit-create-bug" } as WorkflowAction)).toBeNull();
    expect(expectationFor({ kind: "invoke-role", role: "driver", story: "S2-submit-create-bug" } as WorkflowAction)).toBeNull();
    // ...but the per-AC review/refactor turns DO keep their precise contracts.
    expect(expectationFor({ kind: "invoke-role", role: "navigator", story: "S2-submit-create-bug", buildMode: "review", ac: "AC1" } as unknown as WorkflowAction)).toBeTruthy();
    expect(expectationFor({ kind: "invoke-role", role: "driver", story: "S2-submit-create-bug", buildMode: "refactor", ac: "AC1" } as unknown as WorkflowAction)).toBeTruthy();
  });

  it("test-strategist owes a non-empty per-story test list (the S2 contract)", () => {
    const h = expectationFor({ kind: "invoke-role", role: "test-strategist", story: "S2-submit-create-bug" } as WorkflowAction);
    expect(h).toBeTruthy();
    expect(h!.responder).toBe("test-strategist");
    expect(h!.story).toBe("S2-submit-create-bug");
    // Empty list -> testListReady false -> contract UNMET.
    expect(h!.satisfiedBy(baseState())).toBe(false);
    // A real list -> testListReady true -> contract met.
    const ready = baseState();
    ready.stories["S2-submit-create-bug"].design.testListReady = true;
    expect(h!.satisfiedBy(ready)).toBe(true);
  });

  it("navigator reflect owes a written verdict (pass OR fail); a turn that writes nothing is UNMET", () => {
    // The S3 stall: the critic narrated a passed:false verdict it never wrote to
    // disk, so reflectionPassed stayed false and the driver re-invoked reflect
    // forever. The contract is only that a verdict WAS produced.
    const h = expectationFor({ kind: "invoke-role", role: "navigator", story: "S2-submit-create-bug", buildMode: "reflect" } as unknown as WorkflowAction);
    expect(h).toBeTruthy();
    expect(h!.responder).toBe("navigator");
    // No verdict on disk -> UNMET (aborts loudly instead of looping).
    expect(h!.satisfiedBy(baseState())).toBe(false);
    // A written FAILING verdict still satisfies the contract (it drives the
    // smell -> revise-route; it is a valid deliverable, not a violation).
    const failed = baseState();
    failed.stories["S2-submit-create-bug"].design.reflectionVerdictWritten = true;
    failed.stories["S2-submit-create-bug"].design.reflectionPassed = false;
    expect(h!.satisfiedBy(failed)).toBe(true);
  });

  it("spec-author / architect-reviewer per-story contracts map to their DriveState advance", () => {
    const noAcs = baseState();
    noAcs.stories["S2-submit-create-bug"].design = { hasAcs: false, architectAnnotated: false, architectProjectable: false, dbaDesigned: false, testListReady: false, testListConforms: true, reflectionPassed: false, reflectionVerdictWritten: false };
    const spec = expectationFor({ kind: "invoke-role", role: "spec-author", story: "S2-submit-create-bug" } as WorkflowAction)!;
    expect(spec.satisfiedBy(noAcs)).toBe(false);
    expect(spec.satisfiedBy(baseState())).toBe(true); // hasAcs true in base

    const arch = expectationFor({ kind: "invoke-role", role: "architect-reviewer", story: "S2-submit-create-bug" } as WorkflowAction)!;
    const noLayer = baseState();
    noLayer.stories["S2-submit-create-bug"].design.architectAnnotated = false;
    expect(arch.satisfiedBy(noLayer)).toBe(false);
    expect(arch.satisfiedBy(baseState())).toBe(true);
  });

  it("architect-reviewer PLANNING modes (estimate + estimate-committed) expect a t-shirt size, NOT per-AC design notes", () => {
    // Regression (J2 planning drive): estimate-committed is a sprint-scoped PLANNING turn (no story)
    // that writes planning/estimates.json. It must inherit the ESTIMATE expectation (satisfied by
    // planning.estimated), not the per-story DESIGN expectation – else the ledger fails it right after
    // the plan gate (it wrote no ACs) and aborts the planning drive.
    for (const mode of ["estimate", "estimate-committed"]) {
      const exp = expectationFor({ kind: "invoke-role", role: "architect-reviewer", mode } as unknown as WorkflowAction)!;
      expect(exp, `expectationFor architect-reviewer/${mode}`).toBeTruthy();
      expect(exp.expected).toBe("a t-shirt size estimate");
      const estimated = baseState(); estimated.planning = { proposed: true, estimated: true, requestsAuthored: true };
      const notYet = baseState(); notYet.planning = { proposed: true, estimated: false, requestsAuthored: true };
      expect(exp.satisfiedBy(estimated), `${mode} satisfied when planning.estimated`).toBe(true);
      expect(exp.satisfiedBy(notYet), `${mode} unmet when not estimated`).toBe(false);
    }
  });

  it("architect-reviewer's hand-back names the per-AC architectural_notes gap (the S2 abort: architecture.json already existed from S1)", () => {
    // Regression: architectAnnotated requires architectural_notes on EVERY AC, but
    // the directive only emphasized the feature-level architecture.json. On S2 that
    // file already existed (S1 wrote it), so the role produced 0 and the generic
    // hand-back never named the real gap. The remediation must name architectural_notes.
    const arch = expectationFor({ kind: "invoke-role", role: "architect-reviewer", story: "S2-split-columns-migration" } as WorkflowAction)!;
    expect(arch.remediation).toBeDefined();
    expect(arch.remediation).toMatch(/architectural_notes/);
    expect(arch.remediation).toMatch(/every/i); // per-AC, every AC
    expect(arch.remediation).toMatch(/already exist/i); // even when architecture.json already exists
  });

  it("per-AC review/refactor contracts clear when the AC flag advances", () => {
    const review = expectationFor({ kind: "invoke-role", role: "navigator", story: "S2-submit-create-bug", buildMode: "review", ac: "AC1" } as unknown as WorkflowAction)!;
    const pending = baseState();
    pending.stories["S2-submit-create-bug"].build.reviewAc = "AC1";
    expect(review.satisfiedBy(pending)).toBe(false); // still awaiting AC1's review
    const reviewed = baseState();
    reviewed.stories["S2-submit-create-bug"].build.reviewAc = null;
    expect(review.satisfiedBy(reviewed)).toBe(true);
  });
});

describe("ExpectationLedger: pop on a met contract, abort on a null return", () => {
  it("reconcile pops the head + reports `met` when the responder delivered", () => {
    const q = new ExpectationLedger();
    q.push(expectationFor({ kind: "invoke-role", role: "test-strategist", story: "S2-submit-create-bug" } as WorkflowAction)!);
    expect(q.pending).toBe(true);
    const ready = baseState();
    ready.stories["S2-submit-create-bug"].design.testListReady = true;
    expect(q.reconcile(ready).kind).toBe("met");
    expect(q.pending).toBe(false);
  });

  it("reconcile RETRIES once (hand-back detail) then ABORTS naming the responder on a null/empty return", () => {
    const q = new ExpectationLedger(); // default maxRetries = 1
    q.push(expectationFor({ kind: "invoke-role", role: "test-strategist", story: "S2-submit-create-bug" } as WorkflowAction)!);
    // testListReady stays false (the empty-list bug). First reconcile -> retry,
    // with a hand-back describing exactly what is missing; head stays outstanding.
    const first = q.reconcile(baseState());
    expect(first.kind).toBe("retry");
    if (first.kind === "retry") {
      expect(first.detail).toMatch(/per-story test list/);
      expect(first.detail).toMatch(/HANDBACK/);
    }
    expect(q.pending).toBe(true);
    // Still unmet on the retry -> abort with the attributed ProtocolViolationError.
    let thrown: unknown;
    try {
      q.reconcile(baseState());
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ProtocolViolationError);
    expect((thrown as Error).message).toMatch(/test-strategist/);
    expect((thrown as Error).message).toMatch(/Aborting workflow/);
  });

  it("reconcile reports `idle` when nothing is outstanding", () => {
    const q = new ExpectationLedger();
    expect(q.reconcile(baseState()).kind).toBe("idle");
  });
});

describe("handbackMessage: filesystem-grounded, anti-rationalization retry note", () => {
  // The F4-draft-recipes live failure: the (opus) spec-author emitted PROSE
  // claiming it wrote the breakdown, wrote nothing, and on the informed retry
  // declared "the breakdown already exists on disk, no further artifacts needed."
  // The hand-back must forbid that rationalization and ground the role in disk.
  const breakdown = expectationFor({
    kind: "invoke-role",
    role: "spec-author",
    mode: "breakdown",
  } as unknown as WorkflowAction)!;

  it("forbids the 'already exists / no work needed' rationalization", () => {
    const note = handbackMessage(breakdown, 1);
    expect(note).toMatch(/HANDBACK/);
    expect(note).toMatch(/already exist/i);
    expect(note).toMatch(/prose .* is NOT the artifact/i);
    expect(note).toMatch(/WRITE the artifact this turn/i);
  });

  it("appends a handoff's concrete remediation when present (breakdown names feature-spec.json + stories)", () => {
    expect(breakdown.remediation).toBeTruthy();
    const note = handbackMessage(breakdown, 1);
    expect(note).toMatch(/feature-spec\.json/);
    expect(note).toMatch(/stories/);
  });

  it("omits the remediation clause cleanly when a handoff carries none", () => {
    const noRemediation = {
      signature: "x",
      responder: "driver" as const,
      expected: "something",
      satisfiedBy: () => false,
    };
    const note = handbackMessage(noRemediation, 1);
    expect(note).toMatch(/HANDBACK/);
    // No dangling whitespace artifacts from an absent remediation.
    expect(note).not.toMatch(/ {2,}/);
  });
});

describe("ExpectationLedger.processCallback: caller-identity intake (multi-threaded-ready)", () => {
  const ts = (story: string) =>
    expectationFor({ kind: "invoke-role", role: "test-strategist", story } as WorkflowAction)!;
  const spec = (story: string) =>
    expectationFor({ kind: "invoke-role", role: "spec-author", story } as WorkflowAction)!;

  /** Two stories outstanding at once (concurrent dispatch). */
  function twoStoryState(over: { s1HasAcs?: boolean; s2ListReady?: boolean } = {}): DriveState {
    const s = baseState();
    s.storyOrder = ["S1", "S2-submit-create-bug"];
    s.stories["S1"] = {
      gateApproved: false,
      gateSurfaced: false,
      design: { hasAcs: over.s1HasAcs ?? false, architectAnnotated: false, architectProjectable: false, dbaDesigned: false, testListReady: false, testListConforms: true, reflectionPassed: false, reflectionVerdictWritten: false },
      build: { experimentCut: false, testsWritten: false, codeWritten: false, awaitingAcceptance: false, deployVerified: false, accepted: false },
    };
    s.stories["S2-submit-create-bug"].design.testListReady = over.s2ListReady ?? false;
    return s;
  }

  it("matches the callback to the awaited responder + scope, and pops THAT one (not blindly the head)", () => {
    const q = new ExpectationLedger();
    q.push(spec("S1")); // head
    q.push(ts("S2-submit-create-bug")); // second outstanding
    const r = q.processCallback("test-strategist", twoStoryState({ s2ListReady: true }), { story: "S2-submit-create-bug" });
    expect(r.kind).toBe("met");
    expect(q.awaiting()).toEqual(["spec-author"]); // S1 still outstanding
  });

  it("ABORTS (UnexpectedCallbackError) on a callback from a role we are not awaiting", () => {
    const q = new ExpectationLedger();
    q.push(ts("S2-submit-create-bug"));
    let thrown: unknown;
    try {
      q.processCallback("navigator", twoStoryState(), { story: "S2-submit-create-bug" });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(UnexpectedCallbackError);
    expect((thrown as Error).message).toMatch(/unexpected callback from navigator/);
    expect((thrown as Error).message).toMatch(/awaiting: test-strategist/);
  });

  it("ABORTS on a callback whose scope (story) matches no outstanding handoff", () => {
    const q = new ExpectationLedger();
    q.push(ts("S2-submit-create-bug"));
    expect(() => q.processCallback("test-strategist", twoStoryState(), { story: "S9-ghost" })).toThrow(UnexpectedCallbackError);
  });

  it("a matched-but-unmet callback retries-then-aborts (the contract path), keyed to that entry", () => {
    const q = new ExpectationLedger();
    q.push(spec("S1"));
    q.push(ts("S2-submit-create-bug"));
    const st = twoStoryState({ s2ListReady: false });
    const first = q.processCallback("test-strategist", st, { story: "S2-submit-create-bug" });
    expect(first.kind).toBe("retry");
    expect(q.awaiting()).toEqual(["spec-author", "test-strategist"]); // still outstanding
    expect(() => q.processCallback("test-strategist", st, { story: "S2-submit-create-bug" })).toThrow(ProtocolViolationError);
  });
});
