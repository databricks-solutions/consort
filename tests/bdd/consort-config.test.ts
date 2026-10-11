// Unified Consort config (.lakebase/consort-config.json): one declarative source for
// the per-role/turn model+effort matrix + build/plan/project knobs. Resolution is
// consort-config.json -> code default, per setting. The file is the SINGLE source of
// truth for project settings; there is NO env override at read time (the env door
// is what let a UI project silently run with the UX lane off).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { resolveConsortSettings, loadConsortConfig, defaultConsortConfig, writeConsortConfig, applyProjectOverrides, TDD_CONFIG_REL, CONSORT_CONFIG_REL, SFTDD_CONFIG_REL, LEGACY_CONFIG_RELS, LEGACY_TDD_CONFIG_REL } from "../../consort/orchestrator/settings/project-settings.js";
import { consortEnv } from "../../consort/config/consort-env.js";

let proj: string;
const writeConfig = (obj: unknown): void => {
  mkdirSync(join(proj, ".lakebase"), { recursive: true });
  writeFileSync(join(proj, TDD_CONFIG_REL), JSON.stringify(obj, null, 2));
};

beforeEach(() => {
  proj = mkdtempSync(join(tmpdir(), "tdd-config-"));
});
afterEach(() => rmSync(proj, { recursive: true, force: true }));

// Consort rename back-compat: the config file is now `.lakebase/consort-config.json`
// (env vars are `LAKEBASE_SFTDD_*`), but pre-rename projects/shells still use the
// legacy `sftdd-config.json` / older `tdd-config.json` / `LAKEBASE_TDD_*`. All must
// keep working (new name preferred, newest legacy first).
describe("Consort rename back-compat (config file + env prefix)", () => {
  it("canonical path is consort-config.json; deprecated aliases point at it; legacy read chain is newest-first", () => {
    expect(CONSORT_CONFIG_REL).toBe(join(".lakebase", "consort-config.json"));
    expect(SFTDD_CONFIG_REL).toBe(CONSORT_CONFIG_REL);
    expect(TDD_CONFIG_REL).toBe(CONSORT_CONFIG_REL);
    expect(LEGACY_CONFIG_RELS).toEqual([
      join(".lakebase", "sftdd-config.json"),
      join(".lakebase", "tdd-config.json"),
    ]);
    expect(LEGACY_TDD_CONFIG_REL).toBe(join(".lakebase", "sftdd-config.json"));
  });

  it("loadConsortConfig reads the older legacy tdd-config.json when only it exists", () => {
    mkdirSync(join(proj, ".lakebase"), { recursive: true });
    writeFileSync(join(proj, LEGACY_CONFIG_RELS[1]), JSON.stringify({ version: 1, roles: { navigator: { model: "haiku" } } }));
    expect(loadConsortConfig(proj)?.roles?.navigator?.model).toBe("haiku");
  });

  it("reads the legacy sftdd-config.json over the older tdd-config.json", () => {
    mkdirSync(join(proj, ".lakebase"), { recursive: true });
    writeFileSync(join(proj, LEGACY_CONFIG_RELS[1]), JSON.stringify({ version: 1, roles: { navigator: { model: "haiku" } } }));
    writeFileSync(join(proj, LEGACY_CONFIG_RELS[0]), JSON.stringify({ version: 1, roles: { navigator: { model: "sonnet" } } }));
    expect(loadConsortConfig(proj)?.roles?.navigator?.model).toBe("sonnet");
  });

  it("prefers consort-config.json over any legacy file when they coexist", () => {
    mkdirSync(join(proj, ".lakebase"), { recursive: true });
    writeFileSync(join(proj, LEGACY_CONFIG_RELS[0]), JSON.stringify({ version: 1, roles: { navigator: { model: "haiku" } } }));
    writeFileSync(join(proj, CONSORT_CONFIG_REL), JSON.stringify({ version: 1, roles: { navigator: { model: "opus" } } }));
    expect(loadConsortConfig(proj)?.roles?.navigator?.model).toBe("opus");
  });

  it("consortEnv reads LAKEBASE_SFTDD_* and falls back to legacy LAKEBASE_TDD_*", () => {
    expect(consortEnv("LOOP", { LAKEBASE_SFTDD_LOOP: "ac" })).toBe("ac");
    expect(consortEnv("LOOP", { LAKEBASE_TDD_LOOP: "story" })).toBe("story"); // legacy fallback
    expect(consortEnv("LOOP", { LAKEBASE_SFTDD_LOOP: "ac", LAKEBASE_TDD_LOOP: "story" })).toBe("ac"); // new wins
    expect(consortEnv("LOOP", {})).toBeUndefined();
  });

  // NOTE: env vars no longer drive project settings (single-source refactor). The
  // consortEnv accessor's legacy fallback (above) still matters for run-mode knobs;
  // that a project setting is NOT env-driven is asserted in the single-source block.
});

describe("resolveConsortSettings: defaults when no file + no env", () => {
  it("uses recommended models + P6 default (navigator REVIEW low, else model-default)", () => {
    const s = resolveConsortSettings({ projectDir: proj });
    expect(s.models.navigator).toBe("sonnet");
    expect(s.models["spec-author"]).toBe("opus");
    expect(s.effortFor("navigator", "review")).toBe("low");
    // navigator RED is the sonnet-e-low tuning winner (panel + confirm: ~29% faster than the opus
    // default, ~half the cost, holds test coverage). Manifest-declared, no file/overlay – the single
    // per-turn config home. RED is mechanical test-authoring, so the cheaper model holds.
    expect(s.modelFor("navigator", "red")).toBe("sonnet");
    expect(s.effortFor("navigator", "red")).toBe("low");
    expect(s.effortFor("driver", "green")).toBe("medium"); // driver-green tuning winner (opus + medium + ctx-test) is the promoted default
    expect(s.modelFor("driver", "green")).toBe("opus"); //  ,, its model half (manifest-declared, no file needed)
    expect(s.modelFor("navigator", "assess")).toBe("opus"); // assess winner: opus holds the assessment, ~18% faster (manifest-declared)
    expect(s.modelFor("driver", "repair")).toBe("sonnet"); // repair UNTUNED (base): the haiku flip was reverted – it was judged by code-equivalence, which the two-turn QUALITY method (next-turn determination, actual navigator model) did not support; 0053 is a recorded-CLEAN sample that live repairs rarely hold, so tuning needs a recorded-smelly sample
    // spec-author's effort is keyed on the STEP, not the role: the optimize sweep
    // measured the BREAKDOWN step faster at low effort, so ONLY breakdown defaults
    // low; the per-story AC-authoring step (a different task) keeps the model default
    // until its own sweep. "Apply to the step, not the role."
    expect(s.effortFor("spec-author", "breakdown")).toBe("low");
    expect(s.effortFor("spec-author", "acs")).toBe("default");
    expect(s.effortFor("spec-author")).toBe("default"); // no key -> scalar default
    // test-strategist's TEST-LIST step runs at DEFAULT effort. An earlier #556 quality-gated sweep
    // had set it low (-89% wall at "quality 0.90") — but that quality metric scored the ARTIFACT's
    // conformance, which a solo-authored list satisfies just as well as a fanned-out one, so the sweep
    // was rewarding cheap-but-conformant SOLO authoring and could not see the coverage-depth loss from
    // skipping the per-kind analyst fan-out. The supervise+reconcile+order turn is multi-step; it runs
    // at default effort, and the fan-out is now enforced deterministically (testStrategistDispatchedAnalysts).
    expect(s.effortFor("test-strategist", "test-list")).toBe("default");
    expect(s.build.loopGranularity).toBe("story"); // default is story-scoped Navigator/Driver turns
    expect(s.build.sessionScope).toBe("story");
    expect(s.plan.sizing).toBe(true);
    expect(s.fallbackModels.navigator).toBeUndefined();
    expect(s.budgets.navigator).toBeUndefined();
  });

  // Regression: loopGranularity must be honored for EVERY granularity, not just
  // hybrid-a. The drive reads s.build.loopGranularity (this resolver); when a
  // granularity was dropped, a `loop=story` run silently fell back to per-test "ac"
  // and the story-level cadence never engaged live (the hermetic commandsForAction
  // tests missed it because their cfg() left loopGranularity undefined).
  it("loopGranularity honors story | ac | hybrid-a from the FILE (not just hybrid-a)", () => {
    for (const v of ["story", "ac", "hybrid-a"] as const) {
      writeConfig({ version: 1, build: { loopGranularity: v } });
      expect(resolveConsortSettings({ projectDir: proj }).build.loopGranularity).toBe(v);
    }
  });
});

describe("resolveConsortSettings: the file drives the per-role/turn matrix", () => {
  it("model + per-turn effort + fallbackModel + maxBudgetUsd from the file", () => {
    writeConfig({
      version: 1,
      roles: {
        navigator: { model: "opus", fallbackModel: "sonnet", maxBudgetUsd: 2.5, effort: { red: "high", review: "low" } },
        driver: { model: "sonnet", effort: "medium" },
      },
      build: { loopGranularity: "hybrid-a", batchCap: 2, sessionScope: "cycle" },
      plan: { sizing: false },
      project: { uiTrack: true },
    });
    const s = resolveConsortSettings({ projectDir: proj });
    expect(s.models.navigator).toBe("opus");
    expect(s.fallbackModels.navigator).toBe("sonnet");
    expect(s.budgets.navigator).toBe(2.5);
    expect(s.effortFor("navigator", "red")).toBe("high"); // per-turn map
    expect(s.effortFor("navigator", "review")).toBe("low");
    expect(s.effortFor("driver", "green")).toBe("medium"); // scalar applies to all turns
    expect(s.effortFor("driver", "refactor")).toBe("medium");
    expect(s.build.loopGranularity).toBe("hybrid-a");
    expect(s.build.batchCap).toBe(2);
    expect(s.build.sessionScope).toBe("cycle");
    expect(s.plan.sizing).toBe(false);
    expect(s.project.uiTrack).toBe(true);
  });
});

describe("resolveConsortSettings: per-turn model tiering (driver GREEN/REFACTOR cheaper)", () => {
  it("a per-turn `model` map resolves per turn; the base falls to the recommended model", () => {
    writeConfig({
      version: 1,
      roles: { driver: { model: { red: "sonnet", green: "haiku", refactor: "haiku" } } },
    });
    const s = resolveConsortSettings({ projectDir: proj });
    expect(s.modelFor("driver", "red")).toBe("sonnet");
    expect(s.modelFor("driver", "green")).toBe("haiku");
    expect(s.modelFor("driver", "refactor")).toBe("haiku");
    // base (no turn) + a turn absent from the map fall through to the recommended
    // default, NOT to a map entry.
    expect(s.models.driver).toBe("sonnet");
    expect(s.modelFor("driver")).toBe("sonnet");
    expect(s.modelFor("driver", "review")).toBe("sonnet");
  });

  it("a scalar `model` applies to every turn", () => {
    writeConfig({ version: 1, roles: { driver: { model: "opus" } } });
    const s = resolveConsortSettings({ projectDir: proj });
    expect(s.models.driver).toBe("opus");
    expect(s.modelFor("driver", "green")).toBe("opus");
    expect(s.modelFor("driver")).toBe("opus");
  });

  it("with no file, modelFor returns the recommended base for every turn (driver-green is the tuned opus default)", () => {
    const s = resolveConsortSettings({ projectDir: proj });
    expect(s.modelFor("driver", "green")).toBe("opus"); // manifest-declared promoted default (tuning winner)
    expect(s.modelFor("driver", "red")).toBe("sonnet"); // other driver turns keep the recommended base
    expect(s.modelFor("spec-author")).toBe("opus");
  });

  it("defaultConsortConfig seeds the tuned driver tier: RED recommended, GREEN opus+medium, REFACTOR opus", () => {
    writeConsortConfig(proj, defaultConsortConfig());
    const s = resolveConsortSettings({ projectDir: proj });
    expect(s.modelFor("driver", "red")).toBe("sonnet");
    // GREEN runs on OPUS at MEDIUM effort – the driver-green tuning winner (faster-while-holding:
    // reliably reaches the clean-code + superseded-shift milestone at ~237s). See DRIVER-GREEN-LEVERS.md.
    expect(s.modelFor("driver", "green")).toBe("opus");
    expect(s.effortFor("driver", "green")).toBe("medium");
    // REFACTOR runs on OPUS – the driver-refactor tuning winner (5-lever x3-replica panel, turn 0039):
    // opus ties for the best clean-in-one-step rate (2/3) AND is the FASTEST holder (~334s), and its
    // efficiency makes it cheaper than sonnet (~$0.36 vs $0.41). The prior haiku default was the WORST
    // (1/3, thrashing to ~1142s). Judgment-heavy turn => the strongest tier wins, like ASSESS. See
    // DRIVER-REPAIR-TURN-REPLAY.md.
    expect(s.modelFor("driver", "refactor")).toBe("opus");
    // navigator is model-tiered per turn (all manifest-declared, the single per-turn config home):
    // RED is the sonnet-e-low tuning winner (mechanical test authoring – cheaper model holds
    // coverage); ASSESS runs on opus (deep root-cause reasoning); REVIEW falls through to the sonnet
    // base. Design roles keep their scalar recommended model.
    expect(s.modelFor("navigator", "red")).toBe("sonnet");
    expect(s.modelFor("navigator", "assess")).toBe("opus");
    expect(s.modelFor("navigator", "review")).toBe("sonnet"); // base, not opus
    expect(s.modelFor("architect-reviewer")).toBe("opus");
  });

  it("defaultConsortConfig applies a PER-STEP lever: breakdown sonnet+low, AC-authoring untouched", () => {
    // The breakdown step carries its own per-step model/effort (sonnet+low), keyed to `breakdown`
    // ONLY – the per-story AC-authoring step is a different task and keeps the recommended model +
    // default effort. This is the "apply to the step, not the role" invariant. (The optimize sweep's
    // speed winner was haiku, but haiku malformed the story schema, so the shipped model is sonnet.)
    writeConsortConfig(proj, defaultConsortConfig());
    const s = resolveConsortSettings({ projectDir: proj });
    // breakdown step: its per-step model.
    expect(s.modelFor("spec-author", "breakdown")).toBe("sonnet");
    expect(s.effortFor("spec-author", "breakdown")).toBe("low");
    // AC-authoring step: NOT the breakdown winner – recommended model, default effort.
    expect(s.modelFor("spec-author", "acs")).toBe("opus");
    expect(s.effortFor("spec-author", "acs")).toBe("default");
    // base (no key) also stays recommended – the breakdown lever does not leak.
    expect(s.modelFor("spec-author")).toBe("opus");
  });
});

// Single-source-of-truth contract: the config file is the ONLY door for project
// settings. Env vars (loop / batchCap / sessionScope / review-effort / uiTrack) do
// NOT override the file at read time; that env door is exactly what let a UI
// project silently run with the UX lane off. The conformance guard test enforces
// this structurally; here we prove it behaviorally with real env vars set.
const PROJECT_SETTING_ENV = [
  "LAKEBASE_SFTDD_LOOP",
  "LAKEBASE_SFTDD_BATCH_CAP",
  "LAKEBASE_SFTDD_BUILD_SESSION",
  "LAKEBASE_SFTDD_REVIEW_EFFORT",
  "LAKEBASE_SFTDD_UI",
] as const;

describe("resolveConsortSettings: the file is the single source (env does NOT override)", () => {
  it("ignores the project-setting env vars entirely; every value comes from the file", () => {
    writeConfig({
      version: 1,
      roles: { navigator: { effort: { review: "high" } } },
      build: { loopGranularity: "ac", batchCap: 5, sessionScope: "story" },
      project: { uiTrack: false },
    });
    const saved = PROJECT_SETTING_ENV.map((k) => [k, process.env[k]] as const);
    Object.assign(process.env, {
      LAKEBASE_SFTDD_LOOP: "hybrid-a",
      LAKEBASE_SFTDD_BATCH_CAP: "3",
      LAKEBASE_SFTDD_BUILD_SESSION: "cycle",
      LAKEBASE_SFTDD_REVIEW_EFFORT: "low",
      LAKEBASE_SFTDD_UI: "1",
    });
    try {
      const s = resolveConsortSettings({ projectDir: proj });
      expect(s.build.loopGranularity).toBe("ac"); // file, not env "hybrid-a"
      expect(s.build.batchCap).toBe(5); // file, not env 3
      expect(s.build.sessionScope).toBe("story"); // file, not env "cycle"
      expect(s.effortFor("navigator", "review")).toBe("high"); // file, not env "low"
      expect(s.project.uiTrack).toBe(false); // file, not env "1"
    } finally {
      for (const [k, v] of saved) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("review effort 'default' in the FILE drops the flag to model-default", () => {
    writeConfig({ version: 1, roles: { navigator: { effort: { review: "default" } } } });
    expect(resolveConsortSettings({ projectDir: proj }).effortFor("navigator", "review")).toBe("default");
  });
});

describe("applyProjectOverrides: deployTarget / sizing write THROUGH; gates never does", () => {
  it("persists deployTarget / sizing into the config, then the resolver reads them", () => {
    applyProjectOverrides(proj, { deployTarget: "cloud", sizing: false });
    // the file is the single source: resolution reflects the written-through values.
    const s = resolveConsortSettings({ projectDir: proj });
    expect(s.project.deployTarget).toBe("cloud");
    expect(s.plan.sizing).toBe(false);
    expect(loadConsortConfig(proj)?.project?.deployTarget).toBe("cloud");
  });

  it("is a no-op when no override is given (a plain run never mutates the file)", () => {
    applyProjectOverrides(proj, {});
    expect(loadConsortConfig(proj)).toBeUndefined(); // no file written
  });

  it("preserves unrelated fields when writing through onto an existing config", () => {
    writeConfig({ version: 1, roles: { navigator: { model: "opus" } }, project: { uiTrack: true } });
    applyProjectOverrides(proj, { deployTarget: "cloud" });
    const loaded = loadConsortConfig(proj);
    expect(loaded?.project?.deployTarget).toBe("cloud"); // written through
    expect(loaded?.project?.uiTrack).toBe(true); // preserved
    expect(loaded?.roles?.navigator?.model).toBe("opus"); // preserved
  });

  it("NEVER writes gates: the HITL policy is run-scoped, so a flag can't flip persisted policy", () => {
    // A project that declares interactive must stay interactive on disk no matter
    // how a headless run is invoked (the --gates flag lives in run-config, not here).
    writeConfig({ version: 1, roles: {}, project: { gates: "interactive" } });
    // applyProjectOverrides has no `gates` channel at all; a deployTarget write
    // must leave project.gates untouched.
    applyProjectOverrides(proj, { deployTarget: "cloud" });
    expect(loadConsortConfig(proj)?.project?.gates).toBe("interactive");
  });
});

describe("gates: HITL-first default", () => {
  it("defaults project.gates to interactive when unset (headless is opt-in)", () => {
    writeConfig({ version: 1, roles: {} });
    expect(resolveConsortSettings({ projectDir: proj }).project.gates).toBe("interactive");
    expect(defaultConsortConfig().project?.gates).toBe("interactive");
  });
});

describe("legacy agent-config.json is honored below the new file", () => {
  it("falls back to agent-config model override when sftdd-config.json is absent", () => {
    mkdirSync(join(proj, ".lakebase"), { recursive: true });
    writeFileSync(
      join(proj, ".lakebase", "agent-config.json"),
      JSON.stringify({ version: 1, roles: { navigator: { recommended: "sonnet", override: "opus" } } }),
    );
    const s = resolveConsortSettings({ projectDir: proj });
    expect(s.models.navigator).toBe("opus"); // legacy override
  });
});

describe("defaultConsortConfig + write/load round-trip", () => {
  it("seeds PROJECT settings only – no per-turn model/effort in the file (that is the manifest's job)", () => {
    const wrote = writeConsortConfig(proj, defaultConsortConfig());
    expect(wrote).toBe(true);
    const loaded = loadConsortConfig(proj);
    expect(loaded?.version).toBe(1);
    // The single per-turn config home is the step-manifest agentOptions – the scaffolded config file no
    // longer carries a SECOND copy of per-turn model/effort (which used to shadow the manifest). So the
    // seeded roles are empty; per-turn model/effort resolves from the manifests, and a project overrides
    // a turn by ADDING roles.<role>.model/effort to its own file.
    expect(loaded?.roles?.navigator?.model).toBeUndefined();
    expect(loaded?.roles?.navigator?.effort).toBeUndefined();
    // Project-level settings DO round-trip.
    expect(loaded?.build?.loopGranularity).toBe("story");
    expect(loaded?.project?.uiTrack).toBe(true);
    // Does not overwrite without force.
    expect(writeConsortConfig(proj, defaultConsortConfig())).toBe(false);
  });
});
