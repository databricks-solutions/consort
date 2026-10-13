// P2a optimization-harness seams: the small, additive, DEFAULT-OFF hooks the
// per-handoff optimize harness needs to inject content/scope levers into a single
// forked turn WITHOUT changing normal-drive behavior. The contract each test pins:
// with none of the hooks set, the produced claude command's task + tool args are
// BYTE-IDENTICAL to today's (zero behavior change); with a hook set, exactly that
// injection appears, appended at a stable site.

import { describe, expect, it } from "vitest";

import {
  commandsForAction,
  type DriveCommand,
  type DriveEffectsConfig,
} from "../../consort/orchestrator/drive/orchestrator-effects";
import { claudeToolArgs } from "../../consort/orchestrator/drive/claude-runner.js";

function cfg(over: Partial<DriveEffectsConfig> = {}): DriveEffectsConfig {
  return {
    projectDir: "/p",
    consortDir: "/p/.tdd",
    featureId: "F1",
    runner: { async run() {} },
    modelForRole: () => "sonnet",
    approver: "human-proxy",
    deployTarget: "local",
    instance: "inst-x",
    ...over,
  };
}

function claudeOf(cmds: DriveCommand[]): Extract<DriveCommand, { kind: "claude" }> {
  const c = cmds.find((x) => x.kind === "claude");
  if (!c) throw new Error("no claude command");
  return c as Extract<DriveCommand, { kind: "claude" }>;
}

describe("P2a seam: taskSuffix (per-turn task injection)", () => {
  it("default-off => task is byte-identical to a config with no taskSuffix", () => {
    const base = claudeOf(commandsForAction({ kind: "invoke-role", role: "driver", story: "S1" }, cfg())).task;
    const withUndefined = claudeOf(
      commandsForAction({ kind: "invoke-role", role: "driver", story: "S1" }, cfg({ taskSuffix: undefined })),
    ).task;
    expect(withUndefined).toBe(base);
  });

  it("appends the suffix at the very end of the task (after the terse suffix)", () => {
    const base = claudeOf(commandsForAction({ kind: "invoke-role", role: "driver", story: "S1" }, cfg())).task;
    const injected = claudeOf(
      commandsForAction(
        { kind: "invoke-role", role: "driver", story: "S1" },
        cfg({ taskSuffix: () => " EXTRA-DIRECTIVE." }),
      ),
    ).task;
    expect(injected).toBe(base + " EXTRA-DIRECTIVE.");
  });

  it("passes role + build turn to the resolver (driver GREEN)", () => {
    const seen: Array<[string, string | undefined]> = [];
    claudeOf(
      commandsForAction(
        { kind: "invoke-role", role: "driver", story: "S1" },
        cfg({
          taskSuffix: (role, turn) => {
            seen.push([role, turn]);
            return "";
          },
        }),
      ),
    );
    expect(seen).toContainEqual(["driver", "green"]);
  });

  it("an empty-string suffix is a no-op (no trailing junk)", () => {
    const base = claudeOf(commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1" }, cfg())).task;
    const injected = claudeOf(
      commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1" }, cfg({ taskSuffix: () => "" })),
    ).task;
    expect(injected).toBe(base);
  });
});

describe("P2a seam: contextPackSuffix (inject-more/scan-less)", () => {
  it("default-off => task byte-identical", () => {
    const base = claudeOf(commandsForAction({ kind: "invoke-role", role: "driver", story: "S1" }, cfg())).task;
    const withUndefined = claudeOf(
      commandsForAction({ kind: "invoke-role", role: "driver", story: "S1" }, cfg({ contextPackSuffix: undefined })),
    ).task;
    expect(withUndefined).toBe(base);
  });

  it("injects the extra context BEFORE the terse suffix + taskSuffix (so it reads as context, not a trailing order)", () => {
    const injected = claudeOf(
      commandsForAction(
        { kind: "invoke-role", role: "driver", story: "S1" },
        cfg({
          contextPackSuffix: () => " PRE-INJECTED: module map + snippets.",
          taskSuffix: () => " TAIL.",
        }),
      ),
    ).task;
    const ctxIdx = injected.indexOf("PRE-INJECTED");
    const tailIdx = injected.indexOf("TAIL.");
    expect(ctxIdx).toBeGreaterThan(-1);
    expect(tailIdx).toBeGreaterThan(ctxIdx);
  });

  it("empty-string is a no-op", () => {
    const base = claudeOf(commandsForAction({ kind: "invoke-role", role: "driver", story: "S1" }, cfg())).task;
    const injected = claudeOf(
      commandsForAction({ kind: "invoke-role", role: "driver", story: "S1" }, cfg({ contextPackSuffix: () => "" })),
    ).task;
    expect(injected).toBe(base);
  });
});

describe("P2a seam: allowed/disallowed tool scope on the claude command", () => {
  it("default-off => command carries no tool-scope fields", () => {
    const c = claudeOf(commandsForAction({ kind: "invoke-role", role: "driver", story: "S1" }, cfg()));
    expect(c.allowedTools).toBeUndefined();
    expect(c.disallowedTools).toBeUndefined();
  });

  it("carries allowed/disallowed tool lists resolved per role", () => {
    const c = claudeOf(
      commandsForAction(
        { kind: "invoke-role", role: "driver", story: "S1" },
        cfg({
          allowedToolsForRole: (r) => (r === "driver" ? ["Read", "Edit", "Bash"] : undefined),
          disallowedToolsForRole: (r) => (r === "driver" ? ["WebFetch"] : undefined),
        }),
      ),
    );
    expect(c.allowedTools).toEqual(["Read", "Edit", "Bash"]);
    expect(c.disallowedTools).toEqual(["WebFetch"]);
  });
});

describe("P2a seam: claudeToolArgs (pure, exported for the harness + this guard)", () => {
  // Every spawn pre-approves the full Bash tool + Task (so a drive-spawned role agent can run its
  // self-check, parse/transform, kit calls, logging, and subagent fan-out headlessly). It is ADDITIVE —
  // it merges with the project settings allow-list (./scripts/lk, run-tests, npm …), it does not replace it.
  it("default-off => the universal Bash + Task pre-approval (nothing role-specific)", () => {
    expect(claudeToolArgs({ kind: "claude", role: "driver", model: "sonnet", task: "t" })).toEqual([
      "--allowed-tools",
      "Bash,Task",
    ]);
  });

  it("emits --allowed-tools with a comma-joined list (Bash + Task first, then the role's)", () => {
    expect(
      claudeToolArgs({ kind: "claude", role: "driver", model: "sonnet", task: "t", allowedTools: ["Read", "Edit"] }),
    ).toEqual(["--allowed-tools", "Bash,Task,Read,Edit"]);
  });

  it("emits --disallowed-tools with a comma-joined list (allowed still carries the Bash + Task baseline)", () => {
    expect(
      claudeToolArgs({ kind: "claude", role: "driver", model: "sonnet", task: "t", disallowedTools: ["WebFetch", "WebSearch"] }),
    ).toEqual(["--allowed-tools", "Bash,Task", "--disallowed-tools", "WebFetch,WebSearch"]);
  });

  it("emits both when both set, allowed first", () => {
    expect(
      claudeToolArgs({
        kind: "claude",
        role: "driver",
        model: "sonnet",
        task: "t",
        allowedTools: ["Read"],
        disallowedTools: ["Bash"],
      }),
    ).toEqual(["--allowed-tools", "Bash,Task,Read", "--disallowed-tools", "Bash"]);
  });

  it("empty lists still carry the Bash + Task baseline (never fully empty)", () => {
    expect(
      claudeToolArgs({ kind: "claude", role: "driver", model: "sonnet", task: "t", allowedTools: [], disallowedTools: [] }),
    ).toEqual(["--allowed-tools", "Bash,Task"]);
  });
});
