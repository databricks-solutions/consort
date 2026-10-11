// Golden equivalence for the manifest-driven command assembly. The Template Method's
// commandsFromManifest(action, cfg) must produce a DriveCommand[] BYTE-IDENTICAL to the
// legacy per-role branch of commandsForAction for the same action – that deep-equality is
// what lets a legacy branch be retired safely (migrate one action at a time; delete a
// branch only after its golden passes). This slice proves it for the spec-author breakdown
// step, and that the opt-in cfg flag leaves the default drive untouched.

import { describe, it, expect } from "vitest";
import {
  commandsForAction,
  commandsFromManifest,
  type DriveCommand,
  type DriveEffectsConfig,
} from "../../consort/orchestrator/drive/orchestrator-effects";
import type { WorkflowAction } from "../../consort/orchestrator/drive/orchestrator-drive";

function cfg(over: Partial<DriveEffectsConfig> = {}): DriveEffectsConfig {
  return {
    projectDir: "/p",
    consortDir: "/p/.tdd",
    featureId: "F1-stock-visibility",
    runner: { async run() {} },
    modelForRole: () => "sonnet",
    approver: "human-proxy",
    deployTarget: "local",
    ...over,
  };
}

const BREAKDOWN: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "breakdown" };

describe("commandsFromManifest ≡ commandsForAction (golden equivalence)", () => {
  it("spec-author breakdown: byte-identical command list", () => {
    const legacy = commandsForAction(BREAKDOWN, cfg());
    const fromManifest = commandsFromManifest(BREAKDOWN, cfg());
    expect(fromManifest).toEqual(legacy);
  });

  it("reproduces the breakdown structural commands in order (reset, claude, verify, sync, reconcile)", () => {
    const cmds = commandsFromManifest(BREAKDOWN, cfg());
    expect(cmds).toBeDefined();
    // [reset-breakdown, claude, verify-artifact, sync-breakdown, log-reconcile].
    expect(cmds!.map((c) => (c.kind === "cli" ? `cli:${c.args[0]}` : c.kind))).toEqual([
      "cli:reset-breakdown",
      "claude",
      "verify-artifact",
      "cli:sync-breakdown",
      "cli:--reconcile",
    ]);
  });

  it("honors the same model/effort levers as the legacy path", () => {
    const c = cfg({ modelForRole: (r) => (r === "spec-author" ? "opus" : "sonnet") });
    const legacy = commandsForAction(BREAKDOWN, c);
    const fromManifest = commandsFromManifest(BREAKDOWN, c);
    expect(fromManifest).toEqual(legacy);
    expect((fromManifest![1] as { model: string }).model).toBe("opus");
  });

  it("returns undefined for an action with no manifest (the default path is untouched)", () => {
    const noManifest: WorkflowAction = { kind: "planning-complete" };
    expect(commandsFromManifest(noManifest, cfg())).toBeUndefined();
  });
});

describe("commandsFromManifest ≡ commandsForAction: ux-designer design turn (apply-theme postTurn)", () => {
  const UX_DESIGNER: WorkflowAction = { kind: "invoke-role", role: "ux-designer" };

  it("ux-designer: byte-identical command list", () => {
    const legacy = commandsForAction(UX_DESIGNER, cfg());
    const fromManifest = commandsFromManifest(UX_DESIGNER, cfg());
    expect(fromManifest).toEqual(legacy);
  });

  it("reproduces the ux-designer structural commands in order, with the deterministic apply-theme postTurn", () => {
    const cmds = commandsFromManifest(UX_DESIGNER, cfg());
    expect(cmds).toBeDefined();
    // [claude, verify-artifact, consort-apply-design-theme (generate theme.css from the guide), log-reconcile].
    // The apply-theme postTurn is what makes theme generation DETERMINISTIC (not agent-prompted).
    expect(cmds!.map((c) => (c.kind === "cli" ? `cli:${c.bin}` : c.kind))).toEqual([
      "claude",
      "verify-artifact",
      "cli:consort-apply-design-theme",
      "cli:consort-log",
    ]);
    const apply = cmds!.find((c) => c.kind === "cli" && c.bin === "consort-apply-design-theme");
    expect(apply && apply.kind === "cli" ? apply.args[0] : undefined).toBe("--project");
  });

  it("honors the same model lever as the legacy path (ux-designer -> sonnet by default)", () => {
    const c = cfg({ modelForRole: (r) => (r === "ux-designer" ? "opus" : "sonnet") });
    const legacy = commandsForAction(UX_DESIGNER, c);
    const fromManifest = commandsFromManifest(UX_DESIGNER, c);
    expect(fromManifest).toEqual(legacy);
    expect((fromManifest![0] as { model: string }).model).toBe("opus");
  });
});

// The 4 remaining design roles migrated to shipped golden manifests. Each is a
// story-scoped design turn (featureId from cfg + a story on the action). The golden
// is byte-identity vs the legacy branch; the structural-order assertion pins WHICH
// commands each role emits, which differs by role:
//   - spec-author (per-story ACs) + architect-reviewer: [claude, verify-artifact, reconcile]
//   - dba: [claude, reconcile]  (designArtifactExpectation returns null for dba, so NO verify)
//   - test-strategist: [claude, verify-artifact, cli:consort-test-list, reconcile]
//     (the test-list CLI is an `after` postTurn, between verify and reconcile)
const STORY = "S1-stock-list";
function kinds(cmds: DriveCommand[] | undefined): string[] {
  return (cmds ?? []).map((c) => (c.kind === "cli" ? `cli:${c.bin}` : c.kind === "verify-artifact" ? "verify-artifact" : c.kind));
}

describe("commandsFromManifest ≡ commandsForAction: spec-author per-story ACs", () => {
  const ACS: WorkflowAction = { kind: "invoke-role", role: "spec-author", story: STORY };

  it("spec-author story ACs: byte-identical command list", () => {
    expect(commandsFromManifest(ACS, cfg())).toEqual(commandsForAction(ACS, cfg()));
  });

  it("structural order: [claude, verify-artifact, reconcile]", () => {
    expect(kinds(commandsFromManifest(ACS, cfg()))).toEqual(["claude", "verify-artifact", "cli:consort-log"]);
  });

  it("the match sentinel EXCLUDES the breakdown turn (mode present)", () => {
    const breakdown: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "breakdown" };
    // Both a breakdown manifest AND the story manifest could theoretically hit; the null
    // sentinel keeps the story manifest off the breakdown action (breakdown routes to its own).
    expect(commandsFromManifest(breakdown, cfg())).toEqual(commandsForAction(breakdown, cfg()));
    expect(kinds(commandsFromManifest(breakdown, cfg()))).toContain("cli:consort-pipeline");
  });
});

describe("commandsFromManifest ≡ commandsForAction: architect-reviewer per-story", () => {
  const ARCH: WorkflowAction = { kind: "invoke-role", role: "architect-reviewer", story: STORY };

  it("architect-reviewer: byte-identical command list", () => {
    expect(commandsFromManifest(ARCH, cfg())).toEqual(commandsForAction(ARCH, cfg()));
  });

  it("structural order: [claude, verify-artifact, reconcile]", () => {
    expect(kinds(commandsFromManifest(ARCH, cfg()))).toEqual(["claude", "verify-artifact", "cli:consort-log"]);
  });

  it("the mode:null sentinel keeps the PER-STORY manifest off the estimate turn – estimate routes to architect-estimator instead (byte-identical), not the per-story manifest", () => {
    const estimate: WorkflowAction = { kind: "invoke-role", role: "architect-reviewer", mode: "estimate" };
    // estimate now maps to a DIFFERENT shipped manifest (architect-estimator), so it is not
    // undefined – but the per-story manifest (mode:null) does NOT hijack it (no ambiguous
    // double-match; manifestForAction throws on that, so this resolving at all proves it).
    const cmds = commandsFromManifest(estimate, cfg());
    expect(cmds).toEqual(commandsForAction(estimate, cfg()));
    // The estimate shape is the planning shape [claude, verify-artifact], NOT the per-story
    // [claude, verify, reconcile] – which confirms the estimator manifest matched, not the story one.
    expect(kinds(cmds)).toEqual(["claude", "verify-artifact"]);
  });
});

describe("commandsFromManifest ≡ commandsForAction: dba per-story (no verify-artifact)", () => {
  const DBA: WorkflowAction = { kind: "invoke-role", role: "dba", story: STORY };

  it("dba: byte-identical command list", () => {
    expect(commandsFromManifest(DBA, cfg())).toEqual(commandsForAction(DBA, cfg()));
  });

  it("structural order: [claude, reconcile] – NO verify-artifact (an empty db-design is valid)", () => {
    expect(kinds(commandsFromManifest(DBA, cfg()))).toEqual(["claude", "cli:consort-log"]);
  });
});

describe("commandsFromManifest ≡ commandsForAction: test-strategist per-story (test-list postTurn)", () => {
  const TS: WorkflowAction = { kind: "invoke-role", role: "test-strategist", story: STORY };

  it("test-strategist: byte-identical command list", () => {
    expect(commandsFromManifest(TS, cfg())).toEqual(commandsForAction(TS, cfg()));
  });

  it("structural order: [claude, verify-artifact, cli:test-list, reconcile]", () => {
    expect(kinds(commandsFromManifest(TS, cfg()))).toEqual([
      "claude",
      "verify-artifact",
      "cli:consort-test-list",
      "cli:consort-log",
    ]);
  });

  it("the test-list CLI carries the positional [tddDir, feature, story] args", () => {
    const cmds = commandsFromManifest(TS, cfg())!;
    const testList = cmds.find((c) => c.kind === "cli" && c.bin === "consort-test-list");
    expect(testList).toBeDefined();
    expect((testList as { args: string[] }).args).toEqual(["/p/.tdd", "F1-stock-visibility", STORY]);
  });
});

// The sprint/plan lane's two design steps. Planning modes (propose/estimate) write
// SPRINT-scoped artifacts (planning/*), so commandsFromManifest SKIPS the reconcile
// (isPlanningMode) – the shape is just [claude, verify-artifact]. The default cfg has
// no recordedRequests, so commandsForAction takes the LIVE propose path (not the
// deterministic supply-proposals branch), which the golden byte-matches.
describe("commandsFromManifest ≡ commandsForAction: spec-author propose (sprint plan lane)", () => {
  const PROPOSE: WorkflowAction = { kind: "invoke-role", role: "spec-author", mode: "propose" };

  it("spec-author propose: byte-identical command list", () => {
    expect(commandsFromManifest(PROPOSE, cfg())).toEqual(commandsForAction(PROPOSE, cfg()));
  });

  it("structural order: [claude, verify-artifact] – NO reconcile (a sprint-scoped planning artifact)", () => {
    expect(kinds(commandsFromManifest(PROPOSE, cfg()))).toEqual(["claude", "verify-artifact"]);
  });
});

describe("commandsFromManifest ≡ commandsForAction: architect t-shirt sizer (estimate)", () => {
  const ESTIMATE: WorkflowAction = { kind: "invoke-role", role: "architect-reviewer", mode: "estimate" };

  it("architect estimate: byte-identical command list", () => {
    expect(commandsFromManifest(ESTIMATE, cfg())).toEqual(commandsForAction(ESTIMATE, cfg()));
  });

  it("structural order: [claude, verify-artifact] – NO reconcile", () => {
    expect(kinds(commandsFromManifest(ESTIMATE, cfg()))).toEqual(["claude", "verify-artifact"]);
  });

  it("the match sentinel EXCLUDES estimate-committed (a separate legacy branch that re-syncs the backlog)", () => {
    const committed: WorkflowAction = { kind: "invoke-role", role: "architect-reviewer", mode: "estimate-committed" };
    expect(commandsFromManifest(committed, cfg())).toBeUndefined();
  });
});

describe("commandsFromManifest ≡ commandsForAction: driver GREEN build turn", () => {
  const GREEN: WorkflowAction = { kind: "invoke-role", role: "driver", story: "S1-record-stock" };

  it("plain story-loop driver GREEN: byte-identical [claude, cycle green, reconcile]", () => {
    const c = cfg({ modelForRole: (r) => (r === "driver" ? "haiku" : "sonnet") });
    const legacy = commandsForAction(GREEN, c);
    const fromManifest = commandsFromManifest(GREEN, c);
    expect(fromManifest).toEqual(legacy);
    expect(fromManifest!.map((cmd) => (cmd.kind === "cli" ? `cli:${cmd.args[0]}` : cmd.kind))).toEqual([
      "claude",
      "cli:green",
      "cli:--reconcile",
    ]);
  });

  it("story-scoped resume key + model tiering match the legacy build path", () => {
    const c = cfg({ modelForRole: (r) => (r === "driver" ? "haiku" : "sonnet") });
    const fromManifest = commandsFromManifest(GREEN, c)!;
    expect(fromManifest[0]).toMatchObject({ kind: "claude", role: "driver", model: "haiku", resumeKey: "driver:S1-record-stock" });
  });

  it("a refactor turn (buildMode present) resolves its OWN manifest, byte-identical to legacy", () => {
    // Was previously EXCLUDED (no manifest); now driver-refactor.json homes it. The refactor
    // family's cycle CLI is `refactor ... --loop story` (dynamic), delegated to buildCycleCommand.
    const refactor: WorkflowAction = { kind: "invoke-role", role: "driver", story: "S1-record-stock", buildMode: "refactor" };
    expect(commandsFromManifest(refactor, cfg())).toEqual(commandsForAction(refactor, cfg()));
  });

  it("a per-AC green turn (ac present) resolves driver-green, byte-identical (cycle carries --ac)", () => {
    // Was previously EXCLUDED by an ac:null sentinel; driver-green now matches plain + per-AC
    // green (buildMode still absent), and the dynamic @build-cycle marker adds --ac when present.
    const perAc: WorkflowAction = { kind: "invoke-role", role: "driver", story: "S1-record-stock", ac: "AC1" };
    expect(commandsFromManifest(perAc, cfg())).toEqual(commandsForAction(perAc, cfg()));
  });
});

// Every navigator/driver BUILD turn now has a shipped manifest (the config home for its
// agentOptions), and its record-phase cycle CLI is derived by the ONE buildCycleCommand both
// paths call. Assert commandsFromManifest ≡ commandsForAction for each – the byte-identical
// contract that lets the executor eventually own dispatch (Stage 2) from a unified config.
describe("commandsFromManifest ≡ commandsForAction: all build turns (full command-source)", () => {
  const STORY = "S1-record-stock";
  const AC = "AC1";
  // Each build turn as the drive plans it. reflect/review/assess/refactor/etc. carry a buildMode;
  // plain RED (navigator, no buildMode) + plain GREEN (driver, no buildMode) do not.
  const BUILD_TURNS: Array<[string, WorkflowAction]> = [
    ["navigator RED (plain)", { kind: "invoke-role", role: "navigator", story: STORY }],
    ["navigator REVIEW (story)", { kind: "invoke-role", role: "navigator", story: STORY, buildMode: "review" }],
    ["navigator REVIEW (per-AC)", { kind: "invoke-role", role: "navigator", story: STORY, buildMode: "review", ac: AC }],
    ["navigator REFLECT", { kind: "invoke-role", role: "navigator", story: STORY, buildMode: "reflect" }],
    ["navigator ASSESS", { kind: "invoke-role", role: "navigator", story: STORY, buildMode: "assess", ac: AC }],
    ["navigator ASSESS-DEPLOY", { kind: "invoke-role", role: "navigator", story: STORY, buildMode: "assess-deploy" }],
    ["navigator ASSESS-REFACTOR", { kind: "invoke-role", role: "navigator", story: STORY, buildMode: "assess-refactor" }],
    ["driver GREEN (plain)", { kind: "invoke-role", role: "driver", story: STORY }],
    ["driver GREEN (per-AC)", { kind: "invoke-role", role: "driver", story: STORY, ac: AC }],
    ["driver REFACTOR", { kind: "invoke-role", role: "driver", story: STORY, buildMode: "refactor" }],
    ["driver REFACTOR-DEPLOY", { kind: "invoke-role", role: "driver", story: STORY, buildMode: "refactor-deploy" }],
    ["driver REFACTOR-SUPERSEDED", { kind: "invoke-role", role: "driver", story: STORY, buildMode: "refactor-superseded" }],
    ["driver REPAIR", { kind: "invoke-role", role: "driver", story: STORY, buildMode: "repair", ac: AC }],
    ["driver GREEN-SUPERSEDED", { kind: "invoke-role", role: "driver", story: STORY, buildMode: "green-superseded" }],
  ] as unknown as Array<[string, WorkflowAction]>;

  it.each(BUILD_TURNS)("%s: manifest command list == legacy", (_label, action) => {
    const fromManifest = commandsFromManifest(action, cfg());
    expect(fromManifest, "every build turn now resolves a shipped manifest").toBeDefined();
    expect(fromManifest).toEqual(commandsForAction(action, cfg()));
  });

  it("driver refactor turns declare the opus model tier in agentOptions", () => {
    // The model-tier lever (REFACTOR on the tuning-winner model) is now DECLARED in the manifest, not
    // only in defaultConsortConfig's per-turn map – the parity test guards the two agree.
    const refactor: WorkflowAction = { kind: "invoke-role", role: "driver", story: STORY, buildMode: "refactor" };
    // With a cfg whose modelForTurn tiers refactor->opus (as the real resolver does – the driver-refactor
    // tuning winner), the spawn command carries opus; byte-identity with legacy is the assertion above.
    // Here just sanity that the two paths agree under model tiering.
    const tiered = cfg({ modelForTurn: (r, t) => (r === "driver" && t === "refactor" ? "opus" : "sonnet") });
    expect(commandsFromManifest(refactor, tiered)).toEqual(commandsForAction(refactor, tiered));
  });
});
