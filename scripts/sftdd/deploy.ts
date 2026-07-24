// /deploy substrate: ship a built feature to a target and verify it is
// reachable. Targets are declared in the project's deploy-targets.yaml, each
// carrying a `type` discriminator. Only `type: local` is implemented today
// (run the app on this machine, poll until it answers); remote types
// (databricks-app, vercel) are recognized but refused with a clear message
// until they land.
//
// Local deploy is the per-sprint "working software" target: it starts the app
// and waits until base_url+health_path returns ANY HTTP response (the server is
// up; a 404 still proves liveness), so each iteration ends as running,
// reachable software the HIL can use. The started process is left running (pid
// recorded under .tdd/deploy/<target>.pid) so feature verification can hit it;
// `stopLocal` tears it down.

import { execSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readTargets } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { pollUntil } from "@databricks-solutions/lakebase-scm-utils/util";
import { resolveSftddDir, findFeatureDir } from "./sftdd-paths.js";
import { writeEscalation } from "./escalation.js";
import {
  parseFailedNodeIds,
  classifyDeployVerifyFailure,
  writeDeployVerifyAssessMarker,
  readDeployVerifyAssessMarker,
  clearDeployVerifyAssessMarker,
} from "./deploy-verify-assess.js";
import { checkE2eRegexClean, summarizeE2eRegexViolations, E2E_REGEX_REMEDIATION } from "./e2e-regex-clean.js";
import { emitAgentLogEvent, type AgentLogIoOpts } from "./agent-log.js";
import type { AgentLogEventName } from "./agent-log-events.js";
import { withEphemeralVerifyBranch, ephemeralVerifyBranchName } from "./ephemeral-verify.js";
import { sftddEnv } from "./sftdd-env.js";

/** Read the Lakebase project id from the project's .env (LAKEBASE_PROJECT_ID). */
function readProjectInstance(projectDir: string): string | undefined {
  try {
    const m = readFileSync(join(projectDir, ".env"), "utf8").match(/^\s*LAKEBASE_PROJECT_ID\s*=\s*(.+?)\s*$/m);
    return m ? m[1].replace(/^["']|["']$/g, "").trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The database the app is CONFIGURED to connect to, read from the project's
 * .env so the ephemeral verify runs against the SAME database the app ships
 * against (not a silent `databricks_postgres` fallback). This closes a
 * test-what-ships hole: an app misconfigured to a database the substrate never
 * provisioned (e.g. a domain-named `stockflow` that no one CREATE DATABASE'd)
 * would otherwise pass verify against `databricks_postgres` while the shipped
 * app cannot connect at all.
 *
 * Authoritative source is the DATABASE_URL path segment (what the app actually
 * connects with; the last non-commented occurrence wins , the post-checkout
 * hook appends a fresh line on each switch), then DB_NAME. Returns undefined
 * when neither is set, so callers fall back to the substrate default.
 */
export function readAppDatabaseName(projectDir: string): string | undefined {
  let env: string;
  try {
    env = readFileSync(join(projectDir, ".env"), "utf8");
  } catch {
    return undefined;
  }
  const urlLine = env
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^DATABASE_URL\s*=\s*\S/.test(l))
    .pop();
  if (urlLine) {
    const raw = urlLine.replace(/^DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "");
    try {
      // Normalize dialect-qualified schemes (postgresql+psycopg://) so URL parses.
      const db = new URL(raw.replace(/^postgresql\+[^:]+:/, "postgresql:")).pathname.replace(/^\//, "");
      if (db) return decodeURIComponent(db);
    } catch {
      /* malformed URL , fall through to DB_NAME */
    }
  }
  const m = env.match(/^\s*DB_NAME\s*=\s*(.+?)\s*$/m);
  const name = m ? m[1].replace(/^["']|["']$/g, "").trim() : "";
  return name || undefined;
}

/**
 * Run the feature-verify, by DEFAULT on a DISPOSABLE child branch. Whenever the
 * deploy is bound to an experiment branch (`lakebaseBranch`) of a resolvable
 * Lakebase project, fork a short-lived child off that branch, point the verify
 * at it (VERIFY_DATABASE_URL), and delete it after , so the suite's migration
 * up/down fixtures mutate a throwaway DB instead of leaving the shared branch
 * half-migrated for the next story's verify (the thrash fix; Lakebase branching
 * makes the fork + teardown ~instant). Set `LAKEBASE_SFTDD_EPHEMERAL_VERIFY=0` to opt
 * OUT (plain in-place verify); also falls back in-place when there is no
 * experiment branch / instance to fork from. Always returns the pass/fail boolean.
 */
async function runVerifyMaybeEphemeral(
  runVerify: (cmd: string, cwd: string, env?: NodeJS.ProcessEnv) => boolean | { passed: boolean; output?: string },
  cmd: string,
  projectDir: string,
  env: NodeJS.ProcessEnv | undefined,
  lakebaseBranch: string | undefined,
  now: () => Date,
): Promise<VerifyRun> {
  const instance =
    lakebaseBranch && sftddEnv("EPHEMERAL_VERIFY") !== "0" ? readProjectInstance(projectDir) : undefined;
  if (!instance || !lakebaseBranch) {
    return normalizeVerifyRun(runVerify(cmd, projectDir, env));
  }
  // Unique per attempt: a time prefix (debuggable) plus a random suffix, so a
  // child leaked by a crashed prior run (reaped by its TTL) can never collide
  // with this run's fork. A bare timestamp slice can repeat under a pinned clock.
  const nonce = `${String(now().getTime()).slice(-7)}-${randomBytes(3).toString("hex")}`;
  const childName = ephemeralVerifyBranchName(lakebaseBranch, nonce);
  const database = readAppDatabaseName(projectDir);
  return withEphemeralVerifyBranch({ instance, parentBranch: lakebaseBranch, childName, database }, (childDsn) =>
    normalizeVerifyRun(runVerify(cmd, projectDir, { ...(env ?? process.env), VERIFY_DATABASE_URL: childDsn })),
  );
}

export const DEPLOY_EVIDENCE_SCHEMA_VERSION = 1;

/** Feature-verify outcome recorded in the deploy gate evidence. */
export interface VerifyResult {
  passed: boolean;
  command?: string;
  summary?: string;
}

/** The deploy-gate evidence the Release Engineer produces:
 *  features/<F>/deploy-evidence.json. The deploy gate approves only when this
 *  exists, conforms, and records reachable=true AND verify.passed=true. */
export interface DeployEvidence {
  schema_version: number;
  feature_id: string;
  /** Set for a per-story deploy (the story's experiment branch). Absent for the
   *  feature-level (merged increment) deploy. */
  story_id?: string;
  target: string;
  url: string;
  reachable: boolean;
  verify: VerifyResult;
  lakebase_branch?: string;
  deployed_at: string;
}

/** True when deploy evidence proves working software: reachable AND verify
 *  passed. The shared teeth predicate for both the feature deploy gate and the
 *  per-story acceptance. */
export function deployEvidencePasses(e: DeployEvidence | undefined): boolean {
  return e !== undefined && e.reachable === true && e.verify?.passed === true;
}

/** Read deploy-evidence.json at a path, or undefined if absent/malformed. */
export function readDeployEvidence(file: string): DeployEvidence | undefined {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as DeployEvidence;
  } catch {
    return undefined;
  }
}

/** Whether a STORY's deploy verified (reachable + verify.passed), read from
 *  features/<F>/stories/<S>/deploy-evidence.json. */
export function storyDeployVerified(sftddDir: string, featureId: string, storyId: string): boolean {
  const fdir = findFeatureDir(sftddDir, featureId);
  if (!fdir) return false;
  return deployEvidencePasses(readDeployEvidence(join(fdir, "stories", storyId, "deploy-evidence.json")));
}

export interface LocalTargetConfig {
  type: "local";
  run: string;
  baseUrl: string;
  healthPath: string;
  readyTimeoutSeconds: number;
  /**
   * Feature-verify command run against the RUNNING app after it is reachable
   * (deploy gate). Its exit code becomes deploy-evidence.json
   * verify.passed, which the deploy gate requires to be true. Optional: a target
   * with no verify produces verify.passed=false, which the (strict) deploy gate
   * refuses, so a shippable target must declare one.
   */
  verify?: string;
}

export type ResolveResult =
  | { kind: "local"; config: LocalTargetConfig }
  | { kind: "unsupported"; type: string }
  | { kind: "missing"; reason: string };

/** Resolve a target from the project's deploy-targets.yaml by name. */
export function resolveDeployTarget(projectDir: string, name: string): ResolveResult {
  const cfg = readTargets(projectDir);
  if (!cfg) return { kind: "missing", reason: "deploy-targets.yaml not found in project root" };
  const raw = cfg.targets[name] as unknown as Record<string, string> | undefined;
  if (!raw) return { kind: "missing", reason: `target '${name}' not found in deploy-targets.yaml` };
  const type = raw.type ?? "";
  if (type !== "local") return { kind: "unsupported", type: type || "(no type)" };
  return {
    kind: "local",
    config: {
      type: "local",
      run: raw.run ?? "",
      baseUrl: (raw.base_url ?? "http://localhost:8000").replace(/\/+$/, ""),
      healthPath: raw.health_path ?? "/",
      readyTimeoutSeconds: Number(raw.ready_timeout_seconds ?? "60") || 60,
      verify: raw.verify || undefined,
    },
  };
}

/** Any HTTP response (even 404) means the server is up. Connection error = not up yet. */
export async function probeReachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { method: "GET" });
    return true;
  } catch {
    return false;
  }
}

export interface DeployResult {
  ok: boolean;
  url?: string;
  pid?: number;
  reason?: string;
  /** The feature-verify outcome (when a verify command was configured + run). */
  verify?: VerifyResult;
  /** Path to the deploy-evidence.json written (when featureId + sftddDir given). */
  evidencePath?: string;
}

/** Context for code-emitting the Release Engineer's deploy lifecycle. */
export interface ReleaseEngineerLogCtx extends AgentLogIoOpts {
  featureId: string;
  storyId?: string;
  target: string;
}

/**
 * Code-emit the Release Engineer's deploy START into the central agent log.
 *
 * The deterministic deploy (`lakebase-sftdd-deploy`) is what actually starts +
 * verifies the app; the RE role model that invokes it may stay silent (a haiku
 * RE wrote zero log events while the deploy ran). So the deploy emits the RE's
 * own lifecycle , the same orchestrator-as-code logging principle , into the ONE
 * central `.tdd/agent-log.jsonl`, so the RE's work is in the stream regardless of
 * which model ran the role. Best-effort: a logging failure never blocks deploy.
 */
export function logReleaseEngineerDeployStart(ctx: ReleaseEngineerLogCtx): void {
  const scope = ctx.storyId ? `story ${ctx.storyId}` : `feature ${ctx.featureId}`;
  try {
    emitAgentLogEvent(
      {
        role: "release-engineer",
        level: "info",
        event: "deploy.start",
        feature_id: ctx.featureId,
        slots: { scope, target: ctx.target, ...(ctx.storyId ? { story: ctx.storyId } : {}) },
      },
      { sftddDir: ctx.sftddDir, now: ctx.now },
    );
  } catch {
    /* observability is not load-bearing for the deploy */
  }
}

/**
 * Code-emit the Release Engineer's deploy OUTCOME (from the real DeployResult:
 * reachable + verify + url) and a phase end into the central agent log, so the
 * RE's finish is recorded, not just its start. Pairs with
 * logReleaseEngineerDeployStart. Best-effort.
 */
export function logReleaseEngineerDeployOutcome(ctx: ReleaseEngineerLogCtx, result: DeployResult): void {
  const scope = ctx.storyId ? `story ${ctx.storyId}` : `feature ${ctx.featureId}`;
  const storyData = ctx.storyId ? { story: ctx.storyId } : {};
  const io = { sftddDir: ctx.sftddDir, now: ctx.now };
  try {
    if (result.ok) {
      emitAgentLogEvent(
        {
          role: "release-engineer",
          level: "info",
          event: "deploy.verified",
          feature_id: ctx.featureId,
          slots: {
            scope,
            url: result.url,
            verify_status: result.verify?.passed ? "passed" : "not run/failed",
            target: ctx.target,
            reachable: true,
            verify_passed: result.verify?.passed ?? false,
            ...storyData,
          },
        },
        io,
      );
    } else {
      emitAgentLogEvent(
        {
          role: "release-engineer",
          level: "error",
          event: "deploy.failed",
          feature_id: ctx.featureId,
          slots: { scope, reason: result.reason ?? "unknown", target: ctx.target, verify_passed: result.verify?.passed ?? false, ...storyData },
        },
        io,
      );
    }
    emitAgentLogEvent(
      {
        role: "release-engineer",
        level: "info",
        event: "phase.end",
        feature_id: ctx.featureId,
        phase: "deploy",
        slots: { outcome: result.ok ? "verified" : "failed", ok: result.ok, ...storyData },
      },
      io,
    );
  } catch {
    /* best-effort */
  }
}

function pidFile(projectDir: string, target: string): string {
  return join(resolveSftddDir(projectDir), "deploy", `${target}.pid`);
}

/** Resolve the feature dir under sftddDir/features by id prefix (mirrors gates.ts). */

/** Run the feature-verify command against the running app; exit 0 = passed.
 *  Captures the combined output so a failure is diagnosable: on non-zero exit
 *  the last lines are echoed to stderr (they land in the drive log). Without
 *  this a failed verify recorded only a generic summary and the actual test
 *  output was discarded, so every failure needed a manual reproduction. */
/** A verify run's outcome + its combined stdout/stderr. The output feeds the
 *  deploy-verify self-heal classifier (parse the failing node-ids). */
export interface VerifyRun {
  passed: boolean;
  output: string;
}

/** The verify runner may be injected as a plain boolean (the common test shape)
 *  or a {passed, output}. Normalize to VerifyRun so callers read one shape. */
function normalizeVerifyRun(raw: boolean | { passed: boolean; output?: string }): VerifyRun {
  return typeof raw === "boolean"
    ? { passed: raw, output: "" }
    : { passed: raw.passed, output: raw.output ?? "" };
}

/** True when the project has a React client workspace (client/package.json), whose
 *  Vitest suite is part of the authoritative full run (Finding 26). */
function hasClientWorkspace(projectDir: string): boolean {
  return existsSync(join(projectDir, "client", "package.json"));
}

function defaultRunVerify(cmd: string, cwd: string, env?: NodeJS.ProcessEnv): VerifyRun {
  try {
    const out = execSync(cmd, { cwd, stdio: "pipe", env: env ?? process.env });
    return { passed: true, output: out?.toString() ?? "" };
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer };
    const output = `${e.stdout?.toString() ?? ""}${e.stderr?.toString() ?? ""}`.trimEnd();
    const tail = output.split("\n").slice(-30).join("\n");
    process.stderr.write(`\n[deploy] feature-verify failed; last output:\n${tail}\n`);
    return { passed: false, output };
  }
}

/** Write the deploy-evidence.json. Feature scope: features/<F>/. Story scope
 *  (evidence.story_id set): features/<F>/stories/<S>/. Returns the path, or
 *  undefined when the feature dir cannot be resolved (a bare, feature-less
 *  deploy). */
function writeDeployEvidence(
  sftddDir: string,
  evidence: DeployEvidence,
): string | undefined {
  const fdir = findFeatureDir(sftddDir, evidence.feature_id);
  if (!fdir) return undefined;
  const dir = evidence.story_id ? join(fdir, "stories", evidence.story_id) : fdir;
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "deploy-evidence.json");
  writeFileSync(file, JSON.stringify(evidence, null, 2) + "\n", "utf8");
  return file;
}

function defaultStart(cmd: string, cwd: string, env?: NodeJS.ProcessEnv): number {
  // Detached process group so stopLocal can kill the whole tree (uvicorn +
  // reloader children). stdio ignored so the smoke is not blocked on output.
  const child = spawn("sh", ["-c", cmd], { cwd, detached: true, stdio: "ignore", env: env ?? process.env });
  child.unref();
  return child.pid ?? -1;
}

export interface DeployArgs {
  projectDir: string;
  targetName: string;
  /**
   * When set, the run command is started with LAKEBASE_BRANCH_ID bound to this
   * branch, so a per-story deploy runs the app against the story's
   * EXPERIMENT branch DB, the working software the PO reviews before accept.
   * Unset = the ambient env (the feature branch), the per-sprint deploy.
   */
  lakebaseBranch?: string;
  /**
   * Feature this deploy belongs to. When set together with sftddDir, the deploy
   * writes features/<F>/deploy-evidence.json (the deploy gate's artifact).
   */
  featureId?: string;
  /**
   * Story this deploy belongs to. When set (with featureId), the
   * evidence is written at story scope: features/<F>/stories/<S>/, and gates
   * the per-story acceptance. Pair with lakebaseBranch = the story's experiment
   * branch so the PO reviews the story on its own DB.
   */
  storyId?: string;
  /** Artifact root for the evidence write (default: <projectDir>/.sftdd, honors a legacy .tdd). */
  sftddDir?: string;
  /** Inject for tests: start the run command, return a pid. */
  startProcess?: (cmd: string, cwd: string, env?: NodeJS.ProcessEnv) => number;
  /** Inject for tests: reachability probe. */
  reachable?: (url: string) => Promise<boolean>;
  /** Inject for tests: run the feature-verify command; true = passed (exit 0). */
  runVerify?: (cmd: string, cwd: string, env?: NodeJS.ProcessEnv) => boolean | { passed: boolean; output?: string };
  /** Stop the running local app (default stopLocal). Injectable for hermetic tests. */
  stop?: (projectDir: string, targetName: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /**
   * Refuse to deploy when the target port is ALREADY serving before we start
   * (a foreign or stale process). A gate deploy must run + verify OUR app; if
   * something else holds the port, `make run` cannot bind and the reachability
   * probe would falsely pass against the foreign app, recording bogus evidence.
   *
   * With this set we FIRST self-heal: the per-story await-acceptance deploy
   * intentionally leaves OUR app running on the port for PO review, so a
   * re-issued gate deploy (or a resumed run) legitimately finds our own prior
   * instance there. We stop our recorded instance (pidfile) and re-probe; only
   * if the port is STILL held , a process we do NOT own (truly foreign) , does
   * the deploy fail honestly (reachable=false, verify failed) + escalate, instead
   * of false-positiving. Off by default so the per-cycle reuse path
   * (ensureDeployedAndVerify) is unaffected.
   */
  rejectForeignPort?: boolean;
}

/**
 * Best-effort emit of a deterministic deploy-step event (deploy.reachable /
 * deploy.unreachable / verify.passed / verify.failed) from the SUBSTRATE. The
 * deploy substrate computes reachability + the verify outcome itself, so it
 * emits them itself rather than depending on the Release Engineer's prose to
 * remember (the cycle.* fragility class). Observability never blocks a deploy.
 */
function logDeployEvent(sftddDir: string, event: AgentLogEventName, slots: Record<string, unknown>): void {
  try {
    emitAgentLogEvent({ role: "release-engineer", level: "info", event, slots }, { sftddDir });
  } catch {
    // swallow: logging is observability, never a reason to fail a deploy
  }
}

/**
 * Deploy a feature to its target. For `local`: start the run command, record
 * the pid, and poll base_url+health_path until reachable or timeout. Refuses
 * (does not start anything) for missing targets or unsupported types.
 */
export async function deployToTarget(args: DeployArgs): Promise<DeployResult> {
  const resolved = resolveDeployTarget(args.projectDir, args.targetName);
  if (resolved.kind === "missing") return { ok: false, reason: resolved.reason };
  if (resolved.kind === "unsupported") {
    return { ok: false, reason: `unsupported target type: ${resolved.type} (only 'local' is implemented)` };
  }
  const cfg = resolved.config;
  if (!cfg.run) return { ok: false, reason: `target '${args.targetName}' has no run command` };

  const start = args.startProcess ?? defaultStart;
  const reachable = args.reachable ?? probeReachable;
  const url = cfg.baseUrl + cfg.healthPath;

  // Foreign-port guard (gate deploys): if something is ALREADY serving the port
  // before we deploy, our app cannot bind there and verifying against the
  // squatter would record bogus evidence. But FIRST self-heal: the per-story
  // await-acceptance deploy intentionally LEAVES our app running on the port for
  // PO review (deployToTarget records its pid + does not stop it), so a re-issued
  // gate deploy , or a resumed run , legitimately finds OUR OWN prior instance
  // there. Stop our recorded instance (pidfile process group) and wait for the
  // socket to release; only refuse when the port is STILL held by a process we do
  // NOT own (truly foreign). This brings the gate deploy to parity with
  // ensureDeployedAndVerify, which already stops-first before re-binding.
  const stop = args.stop ?? ((pd, tn) => void stopLocal(pd, tn));
  if (args.rejectForeignPort && (await reachable(url))) {
    stop(args.projectDir, args.targetName);
    const released = await pollUntil<boolean>({
      probe: async () => ((await reachable(url)) ? { done: false } : { done: true, value: true }),
      timeoutMs: 5000,
      intervalMs: 250,
      sleep: args.sleep,
      now: args.now,
    });
    if (released.outcome === "done") {
      // Our own stale instance is gone and the port is free , fall through to a
      // clean deploy of this turn's code.
    } else {
    const reason = `target port still serving a foreign process at ${url} after stopping our own instance; refusing to verify against it. Stop it first (lakebase-sftdd-deploy --target ${args.targetName} --stop, or free the port).`;
    const verify: VerifyResult = { passed: false, summary: reason };
    let evidencePath: string | undefined;
    if (args.featureId) {
      const sftddDir = args.sftddDir ?? resolveSftddDir(args.projectDir);
      const at = (args.now ?? (() => new Date()))().toISOString();
      evidencePath = writeDeployEvidence(sftddDir, {
        schema_version: DEPLOY_EVIDENCE_SCHEMA_VERSION,
        feature_id: args.featureId,
        ...(args.storyId ? { story_id: args.storyId } : {}),
        target: args.targetName,
        url,
        reachable: false,
        verify,
        ...(args.lakebaseBranch ? { lakebase_branch: args.lakebaseBranch } : {}),
        deployed_at: at,
      });
      writeEscalation(sftddDir, {
        source: "deploy-verify",
        reason: `deploy of ${args.featureId}${args.storyId ? `/${args.storyId}` : ""} blocked: ${reason}`,
        feature_id: args.featureId,
        ...(args.storyId ? { story_id: args.storyId } : {}),
      });
    }
    return { ok: false, reason, verify, evidencePath };
    }
  }

  // Per-story deploy: bind the run command to the experiment
  // branch's Lakebase DB so the PO reviews the story on its own branch. Unset
  // = the ambient env (the feature branch's per-sprint deploy).
  const env = args.lakebaseBranch
    ? { ...process.env, LAKEBASE_BRANCH_ID: args.lakebaseBranch }
    : undefined;

  const pid = start(cfg.run, args.projectDir, env);
  const pf = pidFile(args.projectDir, args.targetName);
  mkdirSync(dirname(pf), { recursive: true });
  writeFileSync(pf, String(pid));

  const poll = await pollUntil<boolean>({
    probe: async () => ((await reachable(url)) ? { done: true, value: true } : { done: false }),
    timeoutMs: cfg.readyTimeoutSeconds * 1000,
    intervalMs: 1000,
    sleep: args.sleep,
    now: args.now,
  });
  const reachableNow = poll.outcome === "done";

  // Feature-verify against the RUNNING app (the deploy gate's teeth): only
  // meaningful once reachable. No verify command configured -> passed:false,
  // which the strict deploy gate refuses (a shippable target must declare one).
  let verify: VerifyResult = { passed: false };
  // The failing verify's combined output, kept for the deploy-verify self-heal
  // classifier (parse the failing node-ids to re-run in isolation).
  let verifyOutput = "";
  if (reachableNow && cfg.verify) {
    const runVerify = args.runVerify ?? defaultRunVerify;
    const result = await runVerifyMaybeEphemeral(
      runVerify,
      cfg.verify,
      args.projectDir,
      env,
      args.lakebaseBranch,
      args.now ?? (() => new Date()),
    );
    const passed = result.passed;
    verifyOutput = result.output;
    verify = {
      passed,
      command: cfg.verify,
      summary: passed
        ? "feature-verify passed against the running app"
        : "feature-verify FAILED against the running app",
    };
  } else if (reachableNow) {
    verify = { passed: false, summary: "no verify command configured for this target" };
  }

  // Record the deploy-gate evidence when a feature context is given. Written in
  // both the reachable and unreachable cases so the evidence reflects reality
  // (the gate refuses anything but reachable + verify.passed).
  let evidencePath: string | undefined;
  if (args.featureId) {
    const sftddDir = args.sftddDir ?? resolveSftddDir(args.projectDir);
    const at = (args.now ?? (() => new Date()))().toISOString();
    evidencePath = writeDeployEvidence(sftddDir, {
      schema_version: DEPLOY_EVIDENCE_SCHEMA_VERSION,
      feature_id: args.featureId,
      ...(args.storyId ? { story_id: args.storyId } : {}),
      target: args.targetName,
      url,
      reachable: reachableNow,
      verify,
      ...(args.lakebaseBranch ? { lakebase_branch: args.lakebaseBranch } : {}),
      deployed_at: at,
    });
    // Deterministic deploy-step events from the substrate (it computed these),
    // so the central log records reachability + the verify outcome without
    // relying on the Release Engineer's prose.
    const scope = args.storyId ? `story ${args.storyId}` : `feature ${args.featureId}`;
    const stepSlots = { feature_id: args.featureId, ...(args.storyId ? { story: args.storyId } : {}) };
    if (reachableNow) {
      logDeployEvent(sftddDir, "deploy.reachable", { url, pid, ...stepSlots });
    } else {
      logDeployEvent(sftddDir, "deploy.unreachable", {
        url,
        reason: `not reachable after ${cfg.readyTimeoutSeconds}s`,
        ...stepSlots,
      });
    }
    // verify.* only when a verify command actually ran (reachable + configured).
    if (reachableNow && cfg.verify) {
      logDeployEvent(
        sftddDir,
        verify.passed ? "verify.passed" : "verify.failed",
        verify.passed
          ? { scope, command: cfg.verify, ...stepSlots }
          : { scope, command: cfg.verify, summary: verify.summary ?? "feature-verify failed", ...stepSlots },
      );
    }
    // Raise to the HIL when the deploy could not prove working software
    // (unreachable, or reachable but verify FAILED). This is what turns the
    // Release Engineer's honest "1 of N ACs failed" into a clean raise-to-hil
    // halt instead of the await-acceptance spin (the live stall): the
    // deployVerified teeth stay false, so without this the driver re-issues
    // await-acceptance forever. Surface + halt; a human resolves it.
    if (!(reachableNow && verify.passed)) {
      // Deploy-verify self-heal (FEIP-7916): a reachable-but-FAILED verify on a
      // STORY deploy (where a clean child can be forked to isolate on) MIGHT be
      // shared-state contamination (a test that does not own its DB state, e.g.
      // an absolute whole-table aggregate) rather than broken software. Classify
      // by re-running the failing node-ids in ISOLATION; if they all pass alone,
      // record the one-shot deploy-verify-assess marker (the orchestrator routes
      // a Navigator scope turn + re-verify) INSTEAD of the terminal escalation.
      // Anything else (unreachable, no isolatable branch, or still-fails-alone)
      // keeps the terminal deploy-verify HIL, byte-identical to before.
      let contamination = false;
      if (reachableNow && cfg.verify && args.storyId && args.lakebaseBranch) {
        const failing = parseFailedNodeIds(verifyOutput);
        if (failing.length > 0) {
          const runVerify = args.runVerify ?? defaultRunVerify;
          const verdict = await classifyDeployVerifyFailure(failing, async (ids) =>
            (
              await runVerifyMaybeEphemeral(
                runVerify,
                `${cfg.verify} ${ids.join(" ")}`,
                args.projectDir,
                env,
                args.lakebaseBranch,
                args.now ?? (() => new Date()),
              )
            ).passed,
          );
          // One-shot: suppress the escalation into the self-heal marker ONLY on the
          // FIRST detection. If a marker is already ASSESSED (the Navigator scope
          // turn ran and the Driver's re-deploy STILL fails), the one attempt is
          // spent , do NOT re-suppress; fall through to the terminal escalation so
          // the run halts to the HIL instead of spinning assess -> scope -> re-deploy.
          if (verdict === "contamination") {
            const prior = readDeployVerifyAssessMarker(sftddDir, args.featureId, args.storyId);
            if (!prior?.assessed) {
              writeDeployVerifyAssessMarker(sftddDir, args.featureId, args.storyId, failing);
              contamination = true;
            }
          }
        }
      }
      if (!contamination) {
        writeEscalation(sftddDir, {
          source: "deploy-verify",
          reason: `deploy of ${args.featureId}${args.storyId ? `/${args.storyId}` : ""} did not prove working software: ${
            reachableNow ? verify.summary ?? "verify failed" : `app not reachable at ${url}`
          }`,
          feature_id: args.featureId,
          ...(args.storyId ? { story_id: args.storyId } : {}),
        });
      }
    } else if (args.storyId) {
      // The deploy verified. If a deploy-verify-assess marker exists, the
      // Navigator ASSESS + Driver SCOPE self-heal WORKED (the re-verify now
      // passes), so clear it , the story proceeds to acceptance with a clean slate.
      clearDeployVerifyAssessMarker(sftddDir, args.featureId, args.storyId);
    }
  }

  if (!reachableNow) {
    return {
      ok: false,
      pid,
      reason: `app not reachable at ${url} after ${cfg.readyTimeoutSeconds}s`,
      verify,
      evidencePath,
    };
  }
  return { ok: true, url, pid, verify, evidencePath };
}

export interface CycleVerifyArgs {
  projectDir: string;
  targetName?: string;
  /** Bind the run + verify to the cycle's experiment branch DB (LAKEBASE_BRANCH_ID). */
  lakebaseBranch?: string;
  startProcess?: (cmd: string, cwd: string, env?: NodeJS.ProcessEnv) => number;
  reachable?: (url: string) => Promise<boolean>;
  runVerify?: (cmd: string, cwd: string, env?: NodeJS.ProcessEnv) => boolean | { passed: boolean; output?: string };
  /** Stop the running local app (default stopLocal). Injectable for hermetic tests. */
  stop?: (projectDir: string, targetName: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

export interface CycleVerifyResult {
  passed: boolean;
  reachable: boolean;
  summary: string;
}

/**
 * Honestly confirm a cycle is GREEN by running the project's verify suite against
 * the running app , deploy-during-build (follow-up): the per-cycle GREEN
 * used to be FAKED (`recordRunnerOutcome({passed:true})`), which shipped a
 * false-green to the deploy gate. This ensures the local app is up (idempotent:
 * reuses a reachable one, else starts it + polls), then runs the SAME verify
 * command the Release Engineer uses , so a cycle whose test breaks a sibling test
 * (a contradictory test list) fails here, at GREEN, not three roles later. Does
 * NOT write deploy-evidence (that is the Release Engineer's gate artifact); it
 * only returns pass/fail for the cycle recorder.
 */
export async function ensureDeployedAndVerify(args: CycleVerifyArgs): Promise<CycleVerifyResult> {
  const targetName = args.targetName ?? "local";
  const resolved = resolveDeployTarget(args.projectDir, targetName);
  if (resolved.kind !== "local") {
    return { passed: false, reachable: false, summary: `no local deploy target to verify GREEN against (${resolved.kind})` };
  }
  const cfg = resolved.config;
  if (!cfg.run) return { passed: false, reachable: false, summary: `target '${targetName}' has no run command` };
  if (!cfg.verify) {
    return { passed: false, reachable: false, summary: `target '${targetName}' has no verify command; cannot honestly confirm GREEN` };
  }
  const reachable = args.reachable ?? probeReachable;
  const start = args.startProcess ?? defaultStart;
  const runVerify = args.runVerify ?? defaultRunVerify;
  const stop = args.stop ?? ((pd, tn) => void stopLocal(pd, tn));
  const url = cfg.baseUrl + cfg.healthPath;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BASE_URL: cfg.baseUrl,
    ...(args.lakebaseBranch ? { LAKEBASE_BRANCH_ID: args.lakebaseBranch } : {}),
  };
  // Deploy-during-build serves a FRESH app on THIS turn's code. Every build turn
  // overlays new code, so we do NOT reuse a running app (it would serve stale
  // code). Stop any prior instance first , that also frees the port, so a
  // `uvicorn --reload` caught mid-reload can't cause a double-bind race , then
  // start fresh, poll until reachable, run verify, and ALWAYS stop after, so
  // nothing lingers on the port between turns or after the run.
  stop(args.projectDir, targetName);
  const pid = start(cfg.run, args.projectDir, env);
  const pf = pidFile(args.projectDir, targetName);
  mkdirSync(dirname(pf), { recursive: true });
  writeFileSync(pf, String(pid));
  const poll = await pollUntil<boolean>({
    probe: async () => ((await reachable(url)) ? { done: true, value: true } : { done: false }),
    timeoutMs: cfg.readyTimeoutSeconds * 1000,
    intervalMs: 1000,
    sleep: args.sleep,
    now: args.now,
  });
  if (poll.outcome !== "done") {
    stop(args.projectDir, targetName);
    return {
      passed: false,
      reachable: false,
      summary: `app not reachable at ${url} after ${cfg.readyTimeoutSeconds}s; cannot run GREEN verify`,
    };
  }
  const nowFn = args.now ?? (() => new Date());
  // Python projects split the verify across TWO isolated ephemeral branches: the
  // main pass runs `not migration`, then the `migration`-marked reversibility
  // tests run on their OWN fresh branch, so a `downgrade` cannot corrupt the
  // shared suite DB for its siblings (run-tests.sh honors SFTDD_PYTEST_MARKER and
  // treats "no tests matched" as pass). Other languages have no such marker, so
  // they keep the single full pass (no double run).
  const isPython =
    existsSync(join(args.projectDir, "pyproject.toml")) || existsSync(join(args.projectDir, "requirements.txt"));
  let passed: boolean;
  let migrationFailed = false;
  let clientFailed = false;
  try {
    if (isPython) {
      const mainPassed = (await runVerifyMaybeEphemeral(
        runVerify,
        cfg.verify,
        args.projectDir,
        { ...env, SFTDD_PYTEST_MARKER: "not migration" },
        args.lakebaseBranch,
        nowFn,
      )).passed;
      // Only isolate the migration pass if the main suite is green (else the
      // failure is already surfaced; skip the extra branch cut).
      const migPassed = mainPassed
        ? (await runVerifyMaybeEphemeral(
            runVerify,
            cfg.verify,
            args.projectDir,
            { ...env, SFTDD_PYTEST_MARKER: "migration" },
            args.lakebaseBranch,
            nowFn,
          )).passed
        : true;
      migrationFailed = mainPassed && !migPassed;
      const backendPassed = mainPassed && migPassed;
      // Finding 26: the marked pytest passes are BACKEND-ONLY (run-tests.sh's
      // SFTDD_PYTEST_MARKER early-exit short-circuits before its client Vitest block),
      // so build honest-GREEN would never run the client suite on a Python + client
      // scaffold, a false GREEN the deploy feature-verify (unmarked, so it reaches the
      // client block) later caught. Run the client suite ONCE here (SFTDD_CLIENT_ONLY:
      // run-tests.sh skips the backend and runs only `cd client && npm test`) so build
      // GREEN gates on the SAME client tests. No DB, so no ephemeral branch; a failing
      // client test refuses GREEN. Only when a client/ workspace exists.
      const clientPassed =
        backendPassed && hasClientWorkspace(args.projectDir)
          ? normalizeVerifyRun(
              runVerify(cfg.verify, args.projectDir, {
                ...(env ?? process.env),
                SFTDD_CLIENT_ONLY: "1",
              }),
            ).passed
          : true;
      clientFailed = backendPassed && !clientPassed;
      passed = backendPassed && clientPassed;
    } else {
      passed = (await runVerifyMaybeEphemeral(runVerify, cfg.verify, args.projectDir, env, args.lakebaseBranch, nowFn)).passed;
    }
  } finally {
    stop(args.projectDir, targetName); // never leave the app on the port
  }
  if (passed) {
    return { passed, reachable: true, summary: "GREEN verify passed against the running app" };
  }
  // The verify failed. Run the cheap, model-independent E2E regex lint so the
  // failure (and the HIL escalation it raises) names a known structural cause
  // precisely instead of the generic "verify FAILED": a Playwright matcher built
  // from a Python inline-flag regex can never match the browser. Best-effort,
  // only enriches the message.
  const regexLint = checkE2eRegexClean({ projectDir: args.projectDir });
  const base = migrationFailed
    ? "GREEN verify FAILED on the migration pass (the migration-marked reversibility test failed on its own isolated branch)"
    : clientFailed
      ? "GREEN verify FAILED on the client pass (the client Vitest suite failed; the backend suite passed)"
      : "GREEN verify FAILED against the running app";
  const summary = regexLint.clean
    ? base
    : `${base}: e2e-inline-regex-flag , ${summarizeE2eRegexViolations(regexLint.violations)}. ${E2E_REGEX_REMEDIATION}`;
  return { passed, reachable: true, summary };
}

/** Tear down a previously-deployed local target (kills its process group). */
export function stopLocal(projectDir: string, targetName: string): { stopped: boolean } {
  const pf = pidFile(projectDir, targetName);
  if (!existsSync(pf)) return { stopped: false };
  const pid = Number(readFileSync(pf, "utf8").trim());
  if (Number.isFinite(pid) && pid > 0) {
    try {
      process.kill(-pid); // process group
    } catch {
      try {
        process.kill(pid);
      } catch {
        /* already gone */
      }
    }
  }
  rmSync(pf, { force: true });
  return { stopped: true };
}
