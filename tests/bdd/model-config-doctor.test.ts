// Coverage for the model-config DOCTOR: it validates a project's per-role / per-step model + effort
// overrides in .lakebase/consort-config.json against the kit's known aliases + step keys, and
// suggests the closest replacement for a typo/stale value. Grounded in the KIT's vocabularies (the
// claude harness exposes no model-list to probe), so a fully-qualified id is passed through.

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintModelConfig, formatFindings } from "../../consort/config/model-config-doctor";
import { KNOWN_MODEL_ALIASES, RECOMMENDED_MODELS } from "../../consort/config/agent-models";
import { COPILOT_MODEL_ALIASES } from "../../consort/orchestrator/agents/copilot-step-agent";

const dirs: string[] = [];
afterEach(() => { while (dirs.length) try { rmSync(dirs.pop()!, { recursive: true, force: true }); } catch { /* */ } });

function projectWith(roles: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "model-doctor-"));
  dirs.push(dir);
  mkdirSync(join(dir, ".lakebase"), { recursive: true });
  writeFileSync(join(dir, ".lakebase", "consort-config.json"), JSON.stringify({ roles }));
  return dir;
}

describe("lintModelConfig: a clean config yields no findings", () => {
  it("no config file at all -> [] (the Default path writes no overrides)", () => {
    const dir = mkdtempSync(join(tmpdir(), "model-doctor-")); dirs.push(dir);
    expect(lintModelConfig(dir)).toEqual([]);
  });
  it("known aliases + valid effort + valid step keys -> []", () => {
    const dir = projectWith({
      driver: { model: { green: "sonnet", refactor: "opus" }, effort: { green: "low" } },
      "spec-author": { model: "opus", effort: "high" },
    });
    expect(lintModelConfig(dir)).toEqual([]);
  });
  it("a fully-qualified id and the inherit/default sentinels pass through", () => {
    const dir = projectWith({
      dba: { model: "system.ai.claude-opus-5-5" },
      navigator: { model: "anthropic/claude-sonnet-4" },
      driver: { model: "inherit", effort: "default" },
      "test-strategist": { model: "claude-haiku-5-5" },
    });
    expect(lintModelConfig(dir)).toEqual([]);
  });
});

describe("lintModelConfig: it flags mismatches and offers the closest replacement", () => {
  it("an unknown bare model alias is flagged with the nearest known alias", () => {
    const f = lintModelConfig(projectWith({ "spec-author": { model: "opos" } }));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ role: "spec-author", field: "model", value: "opos", suggestion: "opus" });
    expect(f[0].step).toBeUndefined();
  });
  it("an unknown model inside a per-step map carries the step it was under", () => {
    const f = lintModelConfig(projectWith({ driver: { model: { green: "sonet" } } }));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ role: "driver", step: "green", field: "model", value: "sonet", suggestion: "sonnet" });
  });
  it("a typo'd STEP KEY is flagged (the override would be silently ignored) with the nearest key", () => {
    const f = lintModelConfig(projectWith({ driver: { model: { grreen: "sonnet" } } }));
    // The bad step key is flagged; the model value itself (sonnet) is valid so no model finding.
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ role: "driver", step: "grreen", field: "step-key", suggestion: "green" });
  });
  it("an invalid effort level is flagged with the nearest level", () => {
    const f = lintModelConfig(projectWith({ "spec-author": { effort: "hgih" } }));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ role: "spec-author", field: "effort", value: "hgih", suggestion: "high" });
  });
  it("formatFindings renders a readable line naming the location and the fix", () => {
    const out = formatFindings(lintModelConfig(projectWith({ driver: { model: { green: "sonet" } } })));
    expect(out).toContain('roles.driver.model["green"]');
    expect(out).toContain('did you mean "sonnet"?');
  });
});

describe("single-source guards: the known-alias vocabulary has one home", () => {
  it("COPILOT_MODEL_ALIASES's keys ARE exactly KNOWN_MODEL_ALIASES", () => {
    expect(Object.keys(COPILOT_MODEL_ALIASES).sort()).toEqual([...KNOWN_MODEL_ALIASES].sort());
  });
  it("every RECOMMENDED_MODELS value is a KNOWN_MODEL_ALIAS (no role ships a model the doctor would flag)", () => {
    for (const model of Object.values(RECOMMENDED_MODELS)) {
      expect(KNOWN_MODEL_ALIASES).toContain(model);
    }
  });
});
