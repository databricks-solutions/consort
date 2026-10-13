// P0.1: the run-config snapshot – the model + option matrix written once per
// driver run so timing reports are self-describing and A/B-comparable. These
// pin: buildRunConfig resolves the matrix (models + the perf knobs + kit ref);
// writeRunConfig persists to .tdd/run-config.json and mirrors to the corpus root
// when recording; the timing CLI prints a `config:` header / nests it in --json.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  buildRunConfig,
  writeRunConfig,
  readRunConfig,
  formatRunConfig,
  type RunConfigInputs,
} from "../../consort/session/run-config.js";
import { runTimingCli } from "../../bin/consort/timing-report.cli.js";

let proj: string;
let tdd: string;

// A model resolver that mimics the P5-adjusted promote3 matrix: opus design
// roles, sonnet build roles.
const modelForRole = (role: string): string =>
  ["navigator", "driver", "test-strategist", "ux-designer", "release-engineer"].includes(role) ? "sonnet" : "opus";

function inputs(over: Partial<RunConfigInputs> = {}): RunConfigInputs {
  return {
    projectDir: proj,
    consortDir: tdd,
    bound: "full",
    gates: "proxy",
    uiTrack: true,
    buildSessionScope: "story",
    reviewEffort: "low",
    deployTarget: "local",
    modelForRole,
    startedAt: "2026-06-10T18:00:00.000Z",
    env: {},
    ...over,
  };
}

beforeEach(() => {
  proj = mkdtempSync(join(tmpdir(), "tdd-runcfg-"));
  tdd = join(proj, ".tdd");
  mkdirSync(tdd, { recursive: true });
});
afterEach(() => rmSync(proj, { recursive: true, force: true }));

describe("run-config: buildRunConfig resolves the model + option matrix", () => {
  it("captures the resolved model per role + the perf option knobs", () => {
    const cfg = buildRunConfig(inputs());
    expect(cfg.version).toBe(1);
    expect(cfg.models.navigator).toBe("sonnet");
    expect(cfg.models.driver).toBe("sonnet");
    expect(cfg.models["test-strategist"]).toBe("sonnet");
    expect(cfg.models["spec-author"]).toBe("opus");
    expect(cfg.models["product-owner"]).toBe("opus");
    expect(cfg.bound).toBe("full");
    expect(cfg.gates).toBe("proxy");
    expect(cfg.build_session_scope).toBe("story");
    expect(cfg.review_effort).toBe("low");
    expect(cfg.ui_track).toBe(true);
    expect(cfg.deploy_target).toBe("local");
    // Defaults when the env knobs are unset (story-scoped Navigator/Driver turns).
    expect(cfg.loop_granularity).toBe("story");
    expect(cfg.batch_cap).toBeUndefined();
  });

  it("takes loop + batchCap from the resolved settings (inputs); RUN_LABEL stays env (run-mode)", () => {
    const cfg = buildRunConfig(
      inputs({ loopGranularity: "hybrid-a", batchCap: 3, env: { LAKEBASE_SFTDD_RUN_LABEL: "8b-vs-ac" } }),
    );
    expect(cfg.loop_granularity).toBe("hybrid-a"); // from inputs (single source)
    expect(cfg.batch_cap).toBe(3);
    expect(cfg.run_label).toBe("8b-vs-ac"); // RUN_LABEL is a run-mode annotation, env
  });

  it("ignores LAKEBASE_SFTDD_LOOP / _BATCH_CAP env (the resolved settings are the single source)", () => {
    const cfg = buildRunConfig(inputs({ env: { LAKEBASE_SFTDD_LOOP: "ac", LAKEBASE_SFTDD_BATCH_CAP: "9" } }));
    expect(cfg.loop_granularity).toBe("story"); // inputs default; env ignored, no lying snapshot
    expect(cfg.batch_cap).toBeUndefined();
  });

  it("captures the kit ref from .lakebase/kit-ref when present", () => {
    mkdirSync(join(proj, ".lakebase"), { recursive: true });
    writeFileSync(join(proj, ".lakebase", "kit-ref"), "github:databricks-solutions/consort#abc123\n");
    const cfg = buildRunConfig(inputs());
    expect(cfg.kit_ref).toBe("github:databricks-solutions/consort#abc123");
  });
});

describe("run-config: write / read / mirror", () => {
  it("writeRunConfig persists to .tdd/run-config.json and readRunConfig round-trips", () => {
    const written = writeRunConfig(inputs());
    expect(existsSync(join(tdd, "run-config.json"))).toBe(true);
    const read = readRunConfig(tdd);
    expect(read).toEqual(written);
    expect(read?.models.driver).toBe("sonnet");
  });

  it("mirrors a copy to LAKEBASE_CONSORT_RECORD_DIR when recording", () => {
    const recordDir = join(proj, "_recorded");
    writeRunConfig(inputs({ env: { LAKEBASE_CONSORT_RECORD_DIR: recordDir } }));
    expect(existsSync(join(recordDir, "run-config.json"))).toBe(true);
    const mirrored = JSON.parse(readFileSync(join(recordDir, "run-config.json"), "utf8"));
    expect(mirrored.models.navigator).toBe("sonnet");
  });

  it("readRunConfig returns undefined when absent", () => {
    expect(readRunConfig(tdd)).toBeUndefined();
  });
});

describe("run-config: formatRunConfig groups roles by model", () => {
  it("renders a compact config block with models grouped + the option line", () => {
    const text = formatRunConfig(buildRunConfig(inputs()));
    expect(text).toMatch(/^config:/);
    // Build roles grouped under sonnet, design under opus.
    expect(text).toMatch(/sonnet: .*driver/);
    expect(text).toMatch(/opus: .*spec-author/);
    expect(text).toMatch(/loop=story/);
    expect(text).toMatch(/review-effort=low/);
  });
});

describe("run-config: the timing CLI surfaces it", () => {
  it("prints a config: header (text) when run-config.json exists", () => {
    writeRunConfig(inputs());
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((c: string | Uint8Array) => {
      chunks.push(typeof c === "string" ? c : c.toString());
      return true;
    });
    try {
      expect(runTimingCli(["--tdd-dir", tdd])).toBe(0);
    } finally {
      spy.mockRestore();
    }
    const out = chunks.join("");
    expect(out).toMatch(/config:/);
    expect(out).toMatch(/sonnet: .*driver/);
  });

  it("--json nests { config, timing } with the resolved matrix", () => {
    writeRunConfig(inputs());
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((c: string | Uint8Array) => {
      chunks.push(typeof c === "string" ? c : c.toString());
      return true;
    });
    try {
      expect(runTimingCli(["--tdd-dir", tdd, "--json"])).toBe(0);
    } finally {
      spy.mockRestore();
    }
    const parsed = JSON.parse(chunks.join("")) as { config: { models: Record<string, string> } | null };
    expect(parsed.config?.models.driver).toBe("sonnet");
  });
});
