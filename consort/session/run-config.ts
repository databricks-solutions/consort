// P0.1 (agent-loop optimization enabler): snapshot the model + option matrix for
// a driver run, so timing results across runs are COMPARABLE. A timing number is
// meaningless without the config that produced it: the per-role model, the review
// --effort, the build-session scope, the loop granularity, the kit ref, etc. are
// otherwise spread across env vars, CLI flags, and the smoke script, never
// recorded with the results. So two agent-log.jsonl streams cannot be safely
// A/B-compared (the promote3 baseline differed from the original in BOTH the
// build model and P2/P5/P6, recoverable only by reading git branches).
//
// The driver writes .consort/run-config.json ONCE at startup (the common path for
// both the interactive `/` commands and the smoke runners), capturing the
// RESOLVED matrix (not just the override list). The timing report prints it as a
// `config:` header and nests it in --json, so a comparison is a self-describing
// { config, timing } pair. When recording (LAKEBASE_CONSORT_RECORD_DIR set), a copy
// is mirrored to the corpus root so a replay carries its own provenance.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { consortEnv } from "../../consort/config/consort-env.js";
import { ARTIFACT_ROOT } from "../../consort/config/consort-paths.js";
import { join } from "path";
import { ALL_AGENT_ROLES } from "../../consort/config/agent-models.js";
import { resolveLaunchKitRef } from "../../consort/config/kit-ref.js";

/** The resolved run matrix. Additive fields default to their "off"/"default"
 *  value so an old report reading a new file (or vice versa) stays robust. */
export interface RunConfig {
  version: 1;
  /** Optional human label for the run (LAKEBASE_CONSORT_RUN_LABEL). */
  run_label?: string;
  /** ISO start timestamp of the run. */
  started_at: string;
  /** The phase bound, or "full" for an unbounded run (plan|design|build|deploy|full). */
  bound: string;
  /** Gates mode: interactive (human approves) | proxy (Human Proxy, headless). */
  gates: string;
  /** UI track on (E2E/browser stories) vs API-only. */
  ui_track: boolean;
  /** P5: build session scope (story | cycle). */
  build_session_scope: string;
  /** P6: the REVIEW turn's --effort ("" = model default). */
  review_effort: string;
  /** The build loop granularity (story | ac | hybrid-a); "story" is the default
   *  (Navigator/Driver take story-scoped turns). Override via LAKEBASE_CONSORT_LOOP. */
  loop_granularity: string;
  /** P8b: layer-batch cap, when batching. */
  batch_cap?: number;
  /** The deploy target for the deploy phase. */
  deploy_target: string;
  /** The kit ref/SHA the run resolved against (.lakebase/kit-ref), if present. */
  kit_ref?: string;
  /** The resolved model per spawnable role (override -> recommended). */
  models: Record<string, string>;
}

/** Artifact-root-relative path of the run-config snapshot. */
export const RUN_CONFIG_REL = join(ARTIFACT_ROOT, "run-config.json");

/** Inputs the snapshot needs, kept narrow so this module does not depend on the
 *  full DriveEffectsConfig (and stays trivially unit-testable). */
export interface RunConfigInputs {
  projectDir: string;
  consortDir: string;
  bound?: string;
  gates?: string;
  uiTrack?: boolean;
  buildSessionScope?: string;
  reviewEffort?: string;
  deployTarget?: string;
  /** Build loop granularity, from the resolved settings (single source). */
  loopGranularity?: string;
  /** Layer-batch cap, from the resolved settings (single source). */
  batchCap?: number;
  /** Resolve the model the driver will spawn a role with (cfg.modelForRole). */
  modelForRole: (role: string) => string;
  /** Override the start timestamp (tests); defaults to now. */
  startedAt?: string;
  /** Override env lookups (tests); defaults to process.env. */
  env?: Record<string, string | undefined>;
}

/** Build the resolved run matrix from the driver's config + the environment. */
export function buildRunConfig(inputs: RunConfigInputs): RunConfig {
  const env = inputs.env ?? process.env;
  const models: Record<string, string> = {};
  for (const role of ALL_AGENT_ROLES) models[role] = inputs.modelForRole(role);
  const cfg: RunConfig = {
    version: 1,
    started_at: inputs.startedAt ?? new Date().toISOString(),
    bound: inputs.bound ?? "full",
    gates: inputs.gates ?? "proxy",
    ui_track: Boolean(inputs.uiTrack),
    build_session_scope: inputs.buildSessionScope ?? "story",
    review_effort: inputs.reviewEffort ?? "",
    // loop + batchCap come from the RESOLVED settings (the caller passes the file
    // values); never re-read from env here, or the snapshot would record a value
    // the drive did not actually use (the resolver is now file-only).
    loop_granularity: inputs.loopGranularity ?? "story",
    deploy_target: inputs.deployTarget ?? "local",
    models,
  };
  if (inputs.batchCap !== undefined) cfg.batch_cap = inputs.batchCap;
  // RUN_LABEL is a per-invocation run-mode annotation (not a project setting), so
  // it stays an explicit env input.
  const label = consortEnv("RUN_LABEL", env);
  if (label) cfg.run_label = label;
  // Record the ref the run actually uses (Finding 28): env LAKEBASE_KIT_REF ->
  // .lakebase/kit-ref.local (the checkout-proof run pin) -> .lakebase/kit-ref, the
  // SAME precedence the lk shim + the drive's launch pin apply.
  const kitRef = resolveLaunchKitRef(inputs.projectDir, env);
  if (kitRef) cfg.kit_ref = kitRef;
  return cfg;
}

/**
 * Write the run-config snapshot to `.consort/run-config.json`, and – when recording
 * (LAKEBASE_CONSORT_RECORD_DIR set) – mirror a copy to the corpus root so a replay
 * carries its own provenance. Best-effort: a write failure never breaks a run
 * (the snapshot is observability, like the agent log).
 */
export function writeRunConfig(inputs: RunConfigInputs): RunConfig {
  const cfg = buildRunConfig(inputs);
  const body = JSON.stringify(cfg, null, 2) + "\n";
  try {
    mkdirSync(inputs.consortDir, { recursive: true });
    writeFileSync(join(inputs.consortDir, "run-config.json"), body);
    const recordDir = consortEnv("RECORD_DIR", inputs.env ?? process.env)?.trim();
    if (recordDir) {
      mkdirSync(recordDir, { recursive: true });
      writeFileSync(join(recordDir, "run-config.json"), body);
    }
  } catch {
    // swallow: the snapshot is observability, never a reason to fail a run.
  }
  return cfg;
}

/** Read `.consort/run-config.json` for a project (or undefined when absent). */
export function readRunConfig(consortDir: string): RunConfig | undefined {
  const f = join(consortDir, "run-config.json");
  if (!existsSync(f)) return undefined;
  try {
    return JSON.parse(readFileSync(f, "utf8")) as RunConfig;
  } catch {
    return undefined;
  }
}

/** A compact, human-readable one-block summary of the run matrix, for the
 *  timing report header. Roles sharing a model are grouped (opus: a, b; ...). */
export function formatRunConfig(cfg: RunConfig): string {
  const byModel = new Map<string, string[]>();
  for (const [role, model] of Object.entries(cfg.models)) {
    const list = byModel.get(model) ?? [];
    list.push(role);
    byModel.set(model, list);
  }
  const models = [...byModel.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([m, roles]) => `${m}: ${roles.sort().join(", ")}`)
    .join("  |  ");
  const opts = [
    `bound=${cfg.bound}`,
    `gates=${cfg.gates}`,
    `loop=${cfg.loop_granularity}`,
    `build-session=${cfg.build_session_scope}`,
    `review-effort=${cfg.review_effort || "default"}`,
    `ui=${cfg.ui_track ? "on" : "off"}`,
    `deploy=${cfg.deploy_target}`,
    ...(cfg.batch_cap !== undefined ? [`batch-cap=${cfg.batch_cap}`] : []),
    ...(cfg.kit_ref ? [`kit=${cfg.kit_ref}`] : []),
    ...(cfg.run_label ? [`label=${cfg.run_label}`] : []),
  ].join("  ");
  const out = [
    "config:",
    `  models   ${models}`,
    `  options  ${opts}`,
    `  started  ${cfg.started_at}`,
  ];
  return out.join("\n") + "\n";
}
