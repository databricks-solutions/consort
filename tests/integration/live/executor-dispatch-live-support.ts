// Shared support for the DESIGN-role executor-dispatch LIVE proofs (Stage 2 of the channel-model
// live-proof plan, task #641). Each per-role live test is a thin wrapper that names its role +
// calls runDesignExecutorDispatchLive(SPEC) so the file stays a few lines.
//
// WHAT THIS PROVES (that the hermetic perform-via-executor golden + the isolated runIntegrationChain
// tests do NOT): a REAL `claude -p` agent, dispatched THROUGH the SHIPPED performViaExecutor path
// (buildDriveEffects(cfg).performViaExecutor -> performTurnViaExecutor -> execute()), with the
// shipped manifests' input `source` strings resolving on a real `.consort` tree (the {feature}/
// {story} scope fix), lands its artifact under the provisioned `.consort` via the channel model +
// the reconciled agent-log under `.consort` (meta). This is the LIVE half of retirement-map step (2).
//
// LEAN – NO cloud. Every design role is tool-scoped to Write/Read (never runs ./scripts/lk) and
// reports via the agent-report channel; the turn runs in a throwaway project dir. We call
// performViaExecutor DIRECTLY with the design action (rather than driving the whole runDriver loop):
// that exercises the identical dispatch + input-resolution + channel-placement + validate path a
// production turn takes, without seeding the pipeline state nextTransition would need to route there
// – the routing itself is proven hermetically + by the navigator-red production-drive test.
//
// NOT a .test.ts itself (no vitest include match), so importing it adds no suite.

import { expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, existsSync, statSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { buildDriveEffects, type DriveEffectsConfig } from "../../../consort/orchestrator/drive/orchestrator-effects.js";
import { execRunner } from "../../../consort/orchestrator/drive/claude-runner.js";
import { resolveConsortSettings } from "../../../consort/orchestrator/settings/project-settings.js";
import { layDownKitAgents } from "../../../consort/orchestrator/provisioning/bundle.js";
import type { WorkflowAction, DriveState } from "../../../consort/orchestrator/drive/orchestrator-drive.js";
import type { ValidateBoundDeps } from "../../../consort/orchestrator/steps/step-contract.js";
import type { TurnKey } from "../../../consort/orchestrator/settings/project-settings.js";
import { resolveKitSingleSource } from "./kit-resolution.js";

const KIT = process.cwd();
const INTAKE = join(KIT, "tests/integration/intake");
/** The shipped reference-asset pin's recorded-artifacts – the FAITHFUL recorded upstream the
 *  equivalence tier seeds from (so a turn is fed the same inputs the corpus turn consumed, and can
 *  reproduce the feature-scoped artifact). NOT used by the dispatch proof (which seeds minimal). */
const PIN_ARTIFACTS_REL = "consort/evaluation/reference-assets/stockflow/recorded-artifacts";
const PIN_ARTIFACTS = join(KIT, PIN_ARTIFACTS_REL);
/** The camp's RECORDED PER-TURN OUTPUTS (recorded-turns/<NNNN>-<role>/...), each extracted verbatim
 *  from the corpus mine. The #705 reference model: an isolated turn is judged against the SAME turn's
 *  recorded output (matching scope by construction), never a hand-carved slice of the accreted artifact. */
const PIN_TURNS = "consort/evaluation/reference-assets/stockflow/recorded-turns";
export const FEATURE = "F1-stock-visibility";
export const STORY = "S1-file-stock";

/** One design-role live spec: the action to dispatch, the inputs to seed at their REAL scope (each
 *  a consort-relative dest + the intake source to copy from, or inline content), the artifact the
 *  agent must land (consort-relative), whether it is a directory primary, and the live prompt. */
export interface DesignLiveSpec {
  name: string;
  /** The step key this role's output is judged as (turnKeyForAction(action)); the equivalence
   *  suite resolves the reference + reads the produced artifact via the semantic gate on this key. */
  step: TurnKey;
  /** The model the CORPUS recorded this turn on (from the per-turn `turn.json` under
   *  stockflow-rerecord). The equivalence suite PINS the live turn to this model so the comparison is
   *  like-for-like – judging the current output against a same-model reference, not conflating
   *  agent/prompt quality with a model-default downgrade (e.g. test-strategist's RECOMMENDED_MODELS
   *  default is now "sonnet" but the corpus recorded it on "opus"). All 8 design turns were recorded
   *  on opus except ux (sonnet). */
  corpusModel: string;
  action: WorkflowAction;
  /** Files to seed under .consort at their REAL relative scope (the {feature}/{story} the manifest
   *  source resolves to). `from` copies the recorded intake file; `content` writes inline. */
  seed: Array<{ rel: string; from?: string; content?: string }>;
  /** The artifact the live agent must produce, consort-relative (feature/story-scoped). */
  artifactRel: string;
  /** True when artifactRel is a DIRECTORY (spec-author acs/) – assert it holds >=1 file. */
  artifactIsDir?: boolean;
  /** The live-turn prompt (the agent writes ONLY artifactRel, tool-scoped, reports, no shell). */
  prompt: string;
  /** OPTIONAL richer seed for the EQUIVALENCE suite ONLY (not the dispatch proof). The dispatch
   *  proof seeds minimal inputs (it only checks a well-formed artifact lands); the equivalence judge
   *  compares against the FULL recorded feature/sprint artifact, so a faithful comparison needs the
   *  turn seeded with the SAME upstream the corpus turn consumed (all stories' ACs, both features'
   *  proposals, etc). When present, the equivalence suite uses this instead of `seed`. The two roles
   *  that already seed faithful upstream (dba<-recorded architecture, ux<-recorded brief) scored 1.00
   *  with no equivalenceSeed – they need none. */
  equivalenceSeed?: Array<{ rel: string; from?: string; fromAbs?: string; content?: string }>;
  /** For step==="acs" in the EQUIVALENCE suite: the single recorded story the produced ACs are judged
   *  against (per-story like-for-like, not the feature-aggregate union). Omitted => feature-aggregate. */
  equivalenceStoryId?: string;
  /** OPTIONAL absolute reference-path(s) for the EQUIVALENCE judge, computed from the kit root. Used
   *  for turns whose accreted recorded artifact is a WIDER scope than the isolated turn produces.
   *  #705: the faithful reference is the RECORDED PER-TURN OUTPUT – the exact file the corresponding
   *  corpus turn wrote, extracted verbatim into the camp under recorded-turns/<NNNN>-<role>/... – NOT
   *  a hand-carved slice of the accreted artifact (see feedback_judge_against_recorded_turn_output +
   *  the camp README). Omitted => the resolved recorded reference at the step. */
  equivalenceReferencePaths?(kitRoot: string): string[];
}

/** The role's live turn is tool-scoped to Write/Read (no Bash -> never runs ./scripts/lk), matching
 *  the proven per-role chain scope; with Bash/Glob it explores the tree open-endedly + never converges. */
function scopedCfg(projectDir: string, consortDir: string): DriveEffectsConfig {
  const settings = resolveConsortSettings({ projectDir });
  const cfg: DriveEffectsConfig = {
    projectDir,
    consortDir,
    featureId: FEATURE,
    runner: { async run() {} },
    useManifestSteps: true,
    uiTrack: false,
    approver: "human-proxy",
    deployTarget: "local",
    loopGranularity: "story",
    modelForRole: (role) => settings.models[role] ?? "sonnet",
    modelForTurn: (role, turn) => settings.modelFor(role, turn),
    effortForTurn: (role, turn) => {
      const e = settings.effortFor(role, turn);
      return e === "default" ? "" : e;
    },
    allowedToolsForRole: () => ["Write", "Read"],
    disallowedToolsForRole: () => ["Bash", "Glob", "Grep", "WebFetch", "WebSearch", "Task"],
  } as DriveEffectsConfig;
  cfg.runner = execRunner(cfg);
  return cfg;
}

const routerDeps: ValidateBoundDeps = {
  allowed: () => ({ kind: "state-derived" }) as unknown as WorkflowAction,
  reviseBudgetAvailable: () => true,
  recordRetry: () => ({ sanctioned: true }),
};

/** True when a directory tree holds at least one file. */
function nonEmptyDir(dir: string): boolean {
  return existsSync(dir) && statSync(dir).isDirectory() && readdirSync(dir).length > 0;
}

/**
 * Run ONE design role's turn LIVE through the shipped performViaExecutor path + assert it produced
 * its artifact under the provisioned `.consort` (the artifact channel) + the reconciled agent-log
 * under `.consort` (meta). Seeds the role's inputs at their REAL feature/story scope so the shipped
 * manifest's {feature}/{story} source resolves on the tree. Throwaway dir, no cloud.
 *
 * This is the DISPATCH PROOF: a lean, tool-scoped (Write/Read) turn driven by a bespoke `spec.prompt`
 * to check the executor DISPATCHES + places the artifact on the right channel. It does NOT run the
 * production self-check (no Bash) and is NOT a semantic-equivalence proof – that is the scaffolded
 * design-equivalence suite (design-equivalence-support.ts), which drives the PRODUCTION buildTaskBody
 * unconstrained on a real project + judges vs the pin.
 */
export async function runDesignExecutorDispatchLive(spec: DesignLiveSpec): Promise<void> {
  const projectDir = mkdtempSync(join(tmpdir(), "design-exec-live-"));
  const consortDir = join(projectDir, ".consort");
  mkdirSync(consortDir, { recursive: true });

  // Seed the role's declared inputs at their real relative scope under .consort.
  for (const s of spec.seed) {
    const dest = join(consortDir, s.rel);
    mkdirSync(dirname(dest), { recursive: true });
    if (s.from) cpSync(join(INTAKE, s.from), dest);
    else writeFileSync(dest, s.content ?? "seed\n");
  }
  // Lay the kit's role agent defs so the live `--agent <role>` resolves (plain copy, no cloud).
  layDownKitAgents(projectDir);

  process.env.LAKEBASE_SFTDD_USE_MANIFEST_STEPS = "1";
  resolveKitSingleSource(KIT);
  const cfg = scopedCfg(projectDir, consortDir);
  // The dispatch-proof prompt is threaded through the taskSuffix seam (the executor builds the
  // production body via buildTaskBody, then buildClaudeCommandWithBody APPENDS this suffix). The lean
  // prompt only checks channel placement, so a terse write-ONLY-this-file directive keeps the
  // tool-scoped turn from exploring the tree open-endedly.
  cfg.taskSuffix = () => `\n\n${spec.prompt}`;

  const state = { phase: "feature" } as unknown as DriveState;
  try {
    const effects = buildDriveEffects(cfg);
    const bounded = await effects.performViaExecutor!(spec.action, state, routerDeps);

    // Executor-dispatched (not undefined => it took the shipped executor path).
    expect(bounded, `${spec.name} should be executor-dispatched`).toBeDefined();

    // The artifact landed under .consort at its feature/story-scoped path (the artifact channel,
    // placed by the channel model – NOT double-encoded).
    const artifactAbs = join(consortDir, spec.artifactRel);
    if (spec.artifactIsDir) {
      expect(nonEmptyDir(artifactAbs), `${spec.name} produced a non-empty ${spec.artifactRel}/ under .consort`).toBe(true);
    } else {
      expect(existsSync(artifactAbs), `${spec.name} produced ${spec.artifactRel} under .consort`).toBe(true);
    }
    expect(existsSync(join(consortDir, ".consort")), `${spec.name} must NOT double-encode .consort`).toBe(false);

    // The reconciled agent-log (meta channel) landed under .consort (planning modes skip it).
    const isPlanning = "mode" in spec.action && (spec.action.mode === "propose" || spec.action.mode === "estimate");
    if (!isPlanning) {
      expect(existsSync(join(consortDir, "agent-log.jsonl")), `${spec.name} reconciled agent-log under .consort (meta)`).toBe(true);
    }

    // A clean produce routed (no violations blocked it) – the executor returned a bounded action.
    expect(bounded!.action, `${spec.name} produced a route`).toBeDefined();
  } finally {
    delete process.env.LAKEBASE_SFTDD_USE_MANIFEST_STEPS;
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// The AC the architect + test-strategist chains seed inline (a self-contained persistence AC for
// S1); the same JSON both dispatch-live tests already used, hoisted here so the catalogue owns it.
const S1_AC = JSON.stringify({
  id: "AC1-file-stock-record", story_id: STORY, statement: "A stock record can be filed",
  layer: "persistence", given: "an empty catalog", when: "a stock record is filed", then: "it persists", status: "draft",
}) + "\n";

/**
 * The catalogue of DESIGN-role dispatch-live specs – the SINGLE source of truth for the per-role
 * executor-dispatch proofs (each `*-executor-dispatch-live.test.ts` consumes its entry) AND the
 * design-equivalence regression suite (which drives each spec, then judges the produced artifact
 * against the pin via evaluateSemanticGate on spec.step). Keeping them here (not inline in 8 test
 * files) is the one-source-of-truth discipline: a role's action/seed/prompt/step is stated once.
 *
 * Covers all 8 design steps turnKeyForAction maps: breakdown, propose, acs, architect, estimate,
 * dba, test-list, ux – the exact set hasDesignReference(step) resolves a pin reference for (a
 * Partial over TurnKey, since TurnKey also spans the build turns, which have no design reference).
 */
export const DESIGN_LIVE_SPECS: Partial<Record<TurnKey, DesignLiveSpec>> = {
  breakdown: {
    name: "spec-author-breakdown",
    step: "breakdown",
    corpusModel: "opus",
    action: { kind: "invoke-role", role: "spec-author", mode: "breakdown" },
    seed: [
      { rel: "product-overview.md", from: "product-overview.md" },
      { rel: "nfrs.md", from: "nfrs.md" },
      // The manifest resolves feature:feature-request.md to the root of .consort (like
      // product-overview), so seed it there – sourced from the feature-scoped intake file.
      { rel: "feature-request.md", from: `features/${FEATURE}/feature-request.md` },
    ],
    artifactRel: `features/${FEATURE}/feature-spec.json`,
    prompt:
      `Break feature ${FEATURE} into its stories from the provided inputs (they are in this prompt – ` +
      `do NOT search the filesystem or read other projects). WRITE exactly these files, relative to ` +
      `your current working directory:\n` +
      `  - .consort/features/${FEATURE}/feature-spec.json  (JSON: id, name, status "draft", tdd_mode, ` +
      `NON-EMPTY stories[])\n` +
      `  - a stub dir per story under .consort/features/${FEATURE}/stories/<S>/ (story.md + story.json)\n` +
      `Then STOP – run no shell command, do NOT self-verify. As the LAST thing in your reply, emit a ` +
      `fenced report block:\n` +
      "```agent-report\n" +
      `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
      "```\n",
  },
  propose: {
    name: "spec-author-propose",
    step: "propose",
    corpusModel: "opus",
    action: { kind: "invoke-role", role: "spec-author", mode: "propose" },
    seed: [
      { rel: "product-overview.md", from: "product-overview.md" },
      { rel: "nfrs.md", from: "nfrs.md" },
    ],
    artifactRel: "planning/feature-proposals.md",
    prompt:
      `In the sprint plan lane. From the provided product overview + NFR brief, propose the sprint's ` +
      `candidate features. WRITE exactly this file, relative to your current working directory:\n` +
      `  - .consort/planning/feature-proposals.md\n` +
      `One candidate feature per section (a heading + a short scope), so the Architect can size them ` +
      `and the PO can commit a backlog. Then STOP – run no shell command, do NOT self-verify. As the ` +
      `LAST thing in your reply, emit a fenced report block:\n` +
      "```agent-report\n" +
      `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
      "```\n",
  },
  acs: {
    name: "spec-author-story",
    step: "acs",
    corpusModel: "opus",
    action: { kind: "invoke-role", role: "spec-author", story: STORY },
    // EQUIVALENCE – FAITHFUL PER-ROLE COMPARABLE: judge the live spec-author's ACs against the
    // SPEC-AUTHOR's OWN recorded output (corpus turn 0006), NOT the pin's recorded-artifacts/ ACs.
    // The recorded-artifacts ACs are the ARCHITECT-AUGMENTED version – the architect-reviewer turn
    // (0007) adds `architectural_notes` per AC (task #480), so judging spec-author against them
    // penalized it for the ARCHITECT's field ("missing architectural layering per AC"). The
    // spec-author-slice holds exactly what turn 0006 wrote (id/given/when/then/status/layer
    // [+independence], NO architectural_notes) – the like-role-for-like-role reference. Proven by the
    // per-turn diff: 0006 keys lack architectural_notes; 0007 adds it.
    // #705: judge against the RECORDED PER-TURN OUTPUT – the acs the spec-author turn 0006 actually
    // wrote (extracted verbatim into the camp under recorded-turns/), NOT a hand-carved slice. Turn
    // 0006's acs/ predates the architect's per-AC architectural_notes (added by a later turn), so its
    // scope is exactly the like-role-for-like-role reference by construction.
    equivalenceReferencePaths: (kitRoot) => [
      join(kitRoot, PIN_TURNS, "0006-spec-author", "acs", "AC1-file-stock-record.json"),
      join(kitRoot, PIN_TURNS, "0006-spec-author", "acs", "AC2-retrieve-stock-record.json"),
      join(kitRoot, PIN_TURNS, "0006-spec-author", "acs", "AC3-collision-resolved-at-write.json"),
    ],
    seed: [
      { rel: `features/${FEATURE}/stories/${STORY}/story.json`, from: `features/${FEATURE}/stories/${STORY}/story.json` },
      { rel: "product-overview.md", from: "product-overview.md" },
    ],
    artifactRel: `features/${FEATURE}/stories/${STORY}/acs`,
    artifactIsDir: true,
    prompt:
      `From the provided story stub + product overview, draft the acceptance criteria for story ` +
      `${STORY}. WRITE at least one AC file, relative to your current working directory:\n` +
      `  - .consort/features/${FEATURE}/stories/${STORY}/acs/<AC-id>.json\n` +
      `Each AC file is a JSON object whose "id" equals its basename, with a story_id, statement, ` +
      `layer, given/when/then, and a status. Author real, testable criteria from the story stub. ` +
      `Then STOP – run no shell command, do NOT self-verify. As the LAST thing in your reply, emit a ` +
      `fenced report block:\n` +
      "```agent-report\n" +
      `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
      "```\n",
  },
  architect: {
    name: "architect-reviewer",
    step: "architect",
    corpusModel: "opus",
    action: { kind: "invoke-role", role: "architect-reviewer", story: STORY },
    seed: [
      { rel: `features/${FEATURE}/stories/${STORY}/acs/AC1-file-stock-record.json`, content: S1_AC },
      { rel: "nfrs.md", from: "nfrs.md" },
    ],
    artifactRel: `features/${FEATURE}/architecture.json`,
    prompt:
      `From the provided story AC + the NFR brief, author the feature architecture. WRITE exactly ` +
      `this file, relative to your current working directory:\n` +
      `  - .consort/features/${FEATURE}/architecture.json\n` +
      `It MUST declare feature_id, an explicit service_backed boolean, layers[] (each role + module), ` +
      `and – when service_backed – persistence_invariants[] (each id/type/table/brief). This feature ` +
      `persists stock records, so it is service_backed with a real schema. Then STOP – run no shell ` +
      `command, do NOT self-verify. As the LAST thing in your reply, emit a fenced report block:\n` +
      "```agent-report\n" +
      `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
      "```\n",
    // EQUIVALENCE: architect-reviewer authors the F1 feature architecture. In the recorded corpus it
    // was authored in ONE turn (0007-architect-reviewer) whose output IS the accreted architecture.json
    // byte-for-byte (verified) – F1 architecture is not accreted across stories. So seed S1's FULL
    // recorded ACs + judge against the RECORDED PER-TURN OUTPUT = the accreted architecture.json (all 5
    // PIs, incl. PI5 migration-reversible). The prior architecture.S1-slice was a hand-carved 4-PI
    // subset that DROPPED PI5 – exactly the manufactured-reference mistake #705 removes.
    equivalenceSeed: [
      { rel: `features/${FEATURE}/stories/${STORY}/acs/AC1-file-stock-record.json`, fromAbs: join(PIN_ARTIFACTS, `features/${FEATURE}/stories/${STORY}/acs/AC1-file-stock-record.json`) },
      { rel: `features/${FEATURE}/stories/${STORY}/acs/AC2-retrieve-stock-record.json`, fromAbs: join(PIN_ARTIFACTS, `features/${FEATURE}/stories/${STORY}/acs/AC2-retrieve-stock-record.json`) },
      { rel: `features/${FEATURE}/stories/${STORY}/acs/AC3-collision-resolved-at-write.json`, fromAbs: join(PIN_ARTIFACTS, `features/${FEATURE}/stories/${STORY}/acs/AC3-collision-resolved-at-write.json`) },
      { rel: "nfrs.md", from: "nfrs.md" },
    ],
    equivalenceReferencePaths: (kitRoot) => [join(kitRoot, PIN_ARTIFACTS_REL, `features/${FEATURE}/architecture.json`)],
  },
  estimate: {
    name: "architect-estimator",
    step: "estimate",
    corpusModel: "opus",
    action: { kind: "invoke-role", role: "architect-reviewer", mode: "estimate" },
    seed: [{ rel: "planning/feature-proposals.md", from: "planning/feature-proposals.md" }],
    artifactRel: "planning/estimates.json",
    prompt:
      `Estimating the sprint's candidate features. From the provided feature-proposals.md, t-shirt ` +
      `size each candidate. WRITE exactly this file, relative to your current working directory:\n` +
      `  - .consort/planning/estimates.json\n` +
      `A JSON array (or object) of per-candidate {feature_id/name, size (one of XS/S/M/L/XL), ` +
      `rationale}. Size every candidate the proposals name. Then STOP – run no shell command, do NOT ` +
      `self-verify. As the LAST thing in your reply, emit a fenced report block:\n` +
      "```agent-report\n" +
      `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
      "```\n",
    // EQUIVALENCE: the estimate turn sizes the sprint PROPOSAL candidates (FP1-5) from feature-
    // proposals.md – seed the RECORDED proposals so the candidate set matches. #705: judge against the
    // RECORDED PER-TURN OUTPUT – the estimate turn 0001 actually wrote (extracted into the camp), whose
    // scope matches by construction (the F1/F6 entries in the accreted file were added later by
    // sync-backlog, NOT this turn). NOT a hand-carved FP-slice.
    equivalenceSeed: [{ rel: "planning/feature-proposals.md", fromAbs: join(PIN_ARTIFACTS, "planning/feature-proposals.md") }],
    equivalenceReferencePaths: (kitRoot) => [join(kitRoot, PIN_TURNS, "0001-architect-reviewer-estimate", "planning", "estimates.json")],
  },
  dba: {
    name: "dba",
    step: "dba",
    corpusModel: "opus",
    action: { kind: "invoke-role", role: "dba", story: "S1-file-stock" },
    seed: [{ rel: `features/${FEATURE}/architecture.json`, from: `features/${FEATURE}/architecture.json` }],
    artifactRel: `features/${FEATURE}/db-design.json`,
    prompt:
      `From the provided architecture.json (the architect's logical contract: service_backed, ` +
      `layers, persistence_invariants), produce the PHYSICAL schema. WRITE exactly this file, ` +
      `relative to your current working directory:\n` +
      `  - .consort/features/${FEATURE}/db-design.json\n` +
      `Declare feature_id, tables[] (columns with type/nullable, primary_key, unique_constraints, ` +
      `foreign_keys, checks, indexes), this story's schema_changes[], and realizes_invariants[] as ` +
      `a FLAT array of the architecture.json persistence_invariant id STRINGS. Do NOT re-author the ` +
      `invariants; physically realize them. Then STOP – run no shell command, do NOT self-verify. ` +
      `As the LAST thing in your reply, emit a fenced report block:\n` +
      "```agent-report\n" +
      `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
      "```\n",
  },
  "test-list": {
    name: "test-strategist",
    step: "test-list",
    corpusModel: "opus",
    action: { kind: "invoke-role", role: "test-strategist", story: STORY },
    seed: [
      { rel: `features/${FEATURE}/stories/${STORY}/acs/AC1-file-stock-record.json`, content: S1_AC },
      { rel: `features/${FEATURE}/architecture.json`, from: `features/${FEATURE}/architecture.json` },
      { rel: `features/${FEATURE}/db-design.json`, from: `features/${FEATURE}/db-design.json` },
    ],
    artifactRel: `features/${FEATURE}/test-list.json`,
    prompt:
      `Invoked for story ${STORY}. From the provided ACs + architecture.json + db-design.json, ` +
      `produce the feature master test list covering EVERY provided AC. WRITE exactly this file, ` +
      `relative to your current working directory:\n` +
      `  - .consort/features/${FEATURE}/test-list.json\n` +
      `Order the story's tests; map each test's ac_id to a provided AC's EXACT id; cover each AC at ` +
      `least once. Cover EVERY architecture persistence_invariant with a real-branch fitness test ` +
      `that sets "invariant_id". Every DB-writing test must own its state (a per-run-unique key). ` +
      `Conform to test-list.schema.json. Then STOP – run no shell command, do NOT self-verify. As ` +
      `the LAST thing in your reply, emit a fenced report block:\n` +
      "```agent-report\n" +
      `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
      "```\n",
    // EQUIVALENCE: test-strategist authors the feature test-list. #705: judge against the RECORDED
    // PER-TURN OUTPUT – the test-list turn 0018-driver-repair actually wrote (extracted into the camp),
    // whose scope matches this isolated turn by construction. Seed S1's FULL recorded ACs (the dispatch
    // used one thin inline AC) + the RECORDED architecture + db-design (so it covers every recorded PI).
    // NOT a hand-carved S1 slice of the accreted master.
    equivalenceSeed: [
      { rel: `features/${FEATURE}/stories/${STORY}/acs/AC1-file-stock-record.json`, fromAbs: join(PIN_ARTIFACTS, `features/${FEATURE}/stories/${STORY}/acs/AC1-file-stock-record.json`) },
      { rel: `features/${FEATURE}/stories/${STORY}/acs/AC2-retrieve-stock-record.json`, fromAbs: join(PIN_ARTIFACTS, `features/${FEATURE}/stories/${STORY}/acs/AC2-retrieve-stock-record.json`) },
      { rel: `features/${FEATURE}/stories/${STORY}/acs/AC3-collision-resolved-at-write.json`, fromAbs: join(PIN_ARTIFACTS, `features/${FEATURE}/stories/${STORY}/acs/AC3-collision-resolved-at-write.json`) },
      { rel: `features/${FEATURE}/architecture.json`, fromAbs: join(PIN_ARTIFACTS, `features/${FEATURE}/architecture.json`) },
      { rel: `features/${FEATURE}/db-design.json`, fromAbs: join(PIN_ARTIFACTS, `features/${FEATURE}/db-design.json`) },
    ],
    equivalenceReferencePaths: (kitRoot) => [join(kitRoot, PIN_TURNS, "0018-driver-repair", "test-list.json")],
  },
  ux: {
    name: "ux-designer",
    step: "ux",
    corpusModel: "sonnet",
    action: { kind: "invoke-role", role: "ux-designer", mode: "establish" },
    seed: [
      { rel: "design/design-brief.md", from: "design-brief.md" },
      { rel: "product-overview.md", from: "product-overview.md" },
    ],
    artifactRel: "design/design-guide.json",
    prompt:
      `From the provided design brief + product overview, translate the brief into the project's ` +
      `machine-checkable design system. WRITE exactly this file, relative to your current working ` +
      `directory:\n` +
      `  - .consort/design/design-guide.json\n` +
      `Realize EVERY element the brief names: all token scales (typography, colors, spacing, radius, ` +
      `shadows, breakpoints) at every level the brief enumerates, and a "components" block with an ` +
      `entry for EACH reusable UI component the brief describes (navbar, page, card, button, form ` +
      `input, table, status badge, empty state, and any others named), each with its class + notes. ` +
      `Conform to design-guide.schema.json. Then STOP – run no shell command, do NOT self-verify. As ` +
      `the LAST thing in your reply, emit a fenced report block:\n` +
      "```agent-report\n" +
      `[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]\n` +
      "```\n",
  },
};

/** The catalogue's design steps, in dispatch order – the exact set the equivalence suite iterates
 *  and every per-role dispatch-live test names. Derived from the catalogue (never hand-listed). */
export const DESIGN_LIVE_STEPS = Object.keys(DESIGN_LIVE_SPECS) as TurnKey[];

/** Fetch a catalogue entry, asserting it exists (the catalogue is a Partial over TurnKey since the
 *  build turns share the key space but have no design spec). Call sites name a real design step. */
export function designSpec(step: TurnKey): DesignLiveSpec {
  const spec = DESIGN_LIVE_SPECS[step];
  if (!spec) throw new Error(`no DESIGN_LIVE_SPECS entry for step "${step}"`);
  return spec;
}
