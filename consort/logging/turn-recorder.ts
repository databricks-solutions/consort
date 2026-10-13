// Universal turn recorder: a first-class capture of EVERY state-machine turn the
// deterministic driver takes (design, gates, build, deploy, accept, promote),
// recording the artifacts that turn produced as a replayable timeline.
//
// This generalizes the build-only recorder (recordBuildTurn) to the whole
// machine – the design lane in particular had no recorder, so the design corpus
// used to be hand-assembled. Wired via `withTurnRecording` (drive.cli.ts), gated
// on LAKEBASE_CONSORT_RECORD_DIR, fired AFTER each turn's effect lands.
//
// Layout under recordDir (the answer to "record every step, replayably"):
//   turns/<NNNN>-<label>/turn.json   – manifest {step, kind, role, mode, story, ac, action, produced[], deleted[]}
//   turns/<NNNN>-<label>/files/<rel> – the .consort + code DELTA this turn produced
//   turns/index.json                 – the ordered list of every recorded turn
//   recorded-artifacts/<rel under .consort> – the CUMULATIVE .consort mirror, so the
//                                          existing replayDesignTurn(replayDir=
//                                          recorded-artifacts) consumes it as-is
//   .recorder-state.json             – internal file-hash map for delta computation
//
// recorded-build/ (the per-turn code corpus replayBuildTurn reads) is populated
// by the existing recordBuildTurn, which `withTurnRecording` calls for build
// turns – so design + build replay both round-trip from one recordDir.

import { createHash } from "node:crypto";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { codeTreeFilter } from "./replay-build.js";
import type { WorkflowAction } from "../../consort/orchestrator/workflow/workflow-vocabulary.js";

/** The portable token the LIVE, ephemeral project root is rewritten to in recorded text (prompt.txt,
 *  transcript.md, tool markers). The scaffolded project dir (…/tdd-workflow-smoke/<project>) is deleted
 *  on reclaim, so an absolute path embedded in a recorded prompt DANGLES when the corpus is examined
 *  later. Rewriting it to a stable placeholder keeps the recording self-referential + portable; a reader
 *  (or a replay) resolves `<PROJECT_ROOT>` against whatever tree the corpus is rehydrated into. */
export const PROJECT_ROOT_TOKEN = "<PROJECT_ROOT>";

/** Replace every occurrence of the live absolute project root in `text` with PROJECT_ROOT_TOKEN, so the
 *  RECORDED copy never points at the ephemeral scaffold path. Applied ONLY to what is written into the
 *  corpus (never to the live prompt the agent actually receives). No-op on empty projectDir. Also
 *  collapses a trailing slash form so `<root>/` and `<root>` both normalize. */
export function relativizeProjectPaths(text: string, projectDir: string): string {
  if (!text || !projectDir) return text;
  const root = projectDir.replace(/\/+$/, "");
  if (!root) return text;
  // Replace the root (with an optional trailing slash) – longest-match first so `<root>/x` becomes
  // `<PROJECT_ROOT>/x` and a bare `<root>` becomes `<PROJECT_ROOT>`. Plain string split/join (not regex)
  // so path characters never need escaping.
  return text.split(root + "/").join(PROJECT_ROOT_TOKEN + "/").split(root).join(PROJECT_ROOT_TOKEN);
}

/** A relpath the recorder watches, keyed to its scan root (so the cumulative
 *  .consort mirror can be re-rooted under recorded-artifacts). */
interface ScannedFile {
  /** Absolute path on disk. */
  abs: string;
  /** Path relative to projectDir (the stable key across turns). */
  rel: string;
  /** Whether this file lives under .consort (-> mirrored into recorded-artifacts). */
  underConsort: boolean;
  /** Content hash. */
  sha: string;
}

/** An agent turn's outcome-level trace, persisted for the demo/visualization:
 *  the prompt the role was dispatched with, its final reasoning text, and the
 *  ordered tool list. Not the raw stream (no interstitial deltas). */
export interface RecordedTranscript {
  prompt: string;
  role?: string;
  model?: string;
  finalText: string;
  tools: string[];
}

export interface RecordTurnArgs {
  /** LAKEBASE_CONSORT_RECORD_DIR – the corpus root. */
  recordDir: string;
  /** Project working tree root (dirname of consortDir). */
  projectDir: string;
  /** The project .consort dir. */
  consortDir: string;
  /** The action just performed. */
  action: WorkflowAction;
  /** The driver loop iteration (per-process; not globally unique – the recorder
   *  assigns its own monotonic ordinal from the on-disk index). */
  step: number;
  /** The agent turn's transcript (invoke-role turns only); persisted as
   *  transcript.md + summarized into turn.json so the demo can render what each
   *  role was asked, decided, and did. Absent for non-agent turns. */
  transcript?: RecordedTranscript;
  /**
   * Whether to SNAPSHOT the content of the files this turn produced (copy them into
   * turns/<NNNN>/files/ + the recorded-artifacts mirror). Default true – a recorded corpus is
   * historically accurate and replayable. Set FALSE for the always-on LIVE record into `.consort`:
   * the turn's transcript + the INDEX of files it added/modified/removed are still written (so a
   * live board shows every turn with its prompt/tools/reasoning and its file listing), but the
   * files' content is NOT copied – clicking one reads the REAL file at HEAD, which may have changed
   * since (not historically accurate, by design). One recorder, two fidelities.
   */
  snapshotContent?: boolean;
}

export interface RecordedTurn {
  /** Globally monotonic ordinal across the whole run (index length at record time). */
  ordinal: number;
  /** turns/<NNNN>-<label> dir name. */
  dir: string;
  /** Relpaths produced (added/changed) this turn. */
  produced: string[];
  /** Relpaths deleted this turn. */
  deleted: string[];
}

/** The drive's OWN transient narration / advisory sinks under `.consort/`, which must NOT count as a
 *  turn's produced artifact – they churn every turn and are the drive's bookkeeping, not authored
 *  content. `agent-log.jsonl` (the structured trail) and `drive-live.log` (the stderr narration the
 *  tee writes DURING the turn, so it always shows up in the delta) and `next.json` (the advisory
 *  snapshot rewritten on every stop). Before this, a live record recorded `.consort/drive-live.log`
 *  as a produced artifact of the PO's intake turn – the dashboard then listed it as a deliverable. */
const NON_ARTIFACT_CONSORT = new Set(["agent-log.jsonl", "drive-live.log", "next.json"]);

/** The recorder's OWN output, which lands under `.consort/` when the LIVE record targets the project
 *  itself (recordDir === consortDir). It must never be scanned as a produced artifact – otherwise the
 *  recorder would record its own turns/ + state each turn (compounding churn). A no-op when recordDir
 *  is an external corpus (these paths don't exist under `.consort/` then). Matched on the
 *  `.consort/`-relative path: the `turns/` tree, the delta state, and the two append-only streams. */
function isRecorderOwned(relUnderConsort: string): boolean {
  const p = relUnderConsort.split("\\").join("/");
  return (
    p === ".recorder-state.json" ||
    p === "correspondence.jsonl" ||
    p === "routing-decisions.jsonl" ||
    p === "turns" ||
    p.startsWith("turns/")
  );
}

/** The build state-bag booleans/ids the router read to CHOOSE this iteration's action – the
 *  routing "why" the turn recorder does not persist. Extracted from the DriveState's active
 *  story build view (the same fields §4 of MASTER-CANONICAL-PROCESS.md graphs). All optional:
 *  a non-build phase (planning/deploy/promote) simply has no active build story. */
export interface RoutingStateBag {
  phase?: string;
  buildActive?: string | null;
  experimentCut?: boolean;
  testsWritten?: boolean;
  codeWritten?: boolean;
  reviewStoryPending?: boolean;
  refactorStoryPending?: boolean;
  reviewAc?: string | null;
  refactorAc?: string | null;
  assessGreenAc?: string | null;
  repairRegressionAc?: string | null;
  greenSupersededAc?: string | null;
  awaitingAcceptance?: boolean;
  deployVerified?: boolean;
  accepted?: boolean;
}

/** One appended routing-decision record: the action chosen this iteration, HOW it was resolved,
 *  and the state bag that produced it. Written to routing-decisions.jsonl (sibling of turns/). */
export interface RoutingDecisionRecord {
  iteration: number;
  source: "nextTransition" | "bounded" | "contract";
  action: WorkflowAction;
  stateBag: RoutingStateBag;
  at: string;
}

/** Project a RoutingStateBag from a DriveState-shaped value – the active build story's bag plus
 *  the phase. Defensive (state shapes vary across lanes); reads only what is present. */
export function projectRoutingStateBag(state: unknown): RoutingStateBag {
  const s = (state ?? {}) as Record<string, unknown>;
  const bag: RoutingStateBag = {};
  if (typeof s.phase === "string") bag.phase = s.phase;
  const active = s.buildActive as string | null | undefined;
  if (active !== undefined) bag.buildActive = active;
  const stories = (s.stories ?? {}) as Record<string, { build?: Record<string, unknown> }>;
  const b = active ? stories[active]?.build : undefined;
  if (b) {
    for (const k of [
      "experimentCut", "testsWritten", "codeWritten", "reviewStoryPending", "refactorStoryPending",
      "reviewAc", "refactorAc", "assessGreenAc", "repairRegressionAc", "greenSupersededAc",
      "awaitingAcceptance", "deployVerified", "accepted",
    ] as const) {
      if (b[k] !== undefined) (bag as Record<string, unknown>)[k] = b[k];
    }
  }
  return bag;
}

/** Append one routing-decision record to routing-decisions.jsonl under the record dir. This is the
 *  diagnostic stream the turn recorder lacks: it captures the ROUTING INPUTS (the state bag), so a
 *  recorded run can answer "why did this turn route here" – not just "what was chosen". */
export function recordRoutingDecision(
  recordDir: string,
  action: WorkflowAction,
  state: unknown,
  iteration: number,
  source: "nextTransition" | "bounded" | "contract",
): void {
  const rec: RoutingDecisionRecord = {
    iteration,
    source,
    action,
    stateBag: projectRoutingStateBag(state),
    at: new Date().toISOString(),
  };
  mkdirSync(recordDir, { recursive: true });
  appendFileSync(join(recordDir, "routing-decisions.jsonl"), JSON.stringify(rec) + "\n");
}

// ─── Correspondence: the human-proxy <-> orchestrator exchange, recorded as a faithful transcript ──
// The turn recorder captures agent turns + routing decisions, but NOT the human-in-the-loop layer:
// the orchestrator's QUESTIONS/requests (the /sprint kickoff, the intake interview, a gate
// presentation) and the HIL's ANSWERS/SUBMISSIONS (interview answers, the artifact it supplied, an
// approve/reject decision). correspondence.jsonl records BOTH sides + the outcome, so a recorded run
// reads like the interactive session it mimics – what was asked, what the (proxy) human answered, and
// whether it validated/approved. One entry per exchange, correlated to the drive iteration.

/** One question the orchestrator asked + the HIL's answer (an intake-interview Q/A pair). */
export interface CorrespondenceQA {
  question: string;
  answer: string;
}

/** What the HIL SUBMITTED in response (an artifact it authored/supplied). `contentRef` points into
 *  the turn's files/ delta (or recorded-artifacts) where the full content lives – the entry carries
 *  the reference, not a duplicate copy of the bytes. `binary: true` marks a non-text asset (e.g. the
 *  brand icon warehouse.png) recorded BY REFERENCE only – its bytes are never inlined (they are not
 *  UTF-8), so a consumer follows contentRef to the file rather than expecting content in the log. */
export interface CorrespondenceSubmission {
  artifact: string;
  from?: string;
  contentRef?: string;
  binary?: boolean;
}

/** The RICH PRESENTATION of a correspondence side – what was actually SHOWN/EXCHANGED, with its
 *  formatting preserved, so a renderer can reproduce the interactive session faithfully (not just
 *  plain text). Captures the source markdown (which carries headings/bold/lists/tables/etc.), any
 *  terminal styling as raw ANSI, and structured highlight spans (offset+length+style) over the text
 *  – whichever the surface produced. All optional: a surface fills what it has. */
export interface CorrespondencePresentation {
  /** The formatting the content is authored in (drives how a renderer reproduces it). */
  format?: "markdown" | "ansi" | "plain";
  /** The rendered/authored content WITH its formatting intact (e.g. markdown source, or ANSI text). */
  rendered?: string;
  /** Raw ANSI-styled text as printed to the terminal (colors/bold/underline preserved verbatim). */
  ansi?: string;
  /** Structured styling spans over the plain text (font/weight/color/highlight), for a non-ANSI renderer. */
  highlights?: Array<{ offset: number; length: number; style: string }>;
}

/** Which way the exchange flows. `hil-to-orch` = the HIL asked-and-answered (kickoff/intake/gate/
 *  author-requests: the orchestrator poses a request, the HIL submits/decides). `orch-to-hil` = the
 *  orchestrator NARRATES progress back to the HIL (the `progress` kind: a status notice per recorded
 *  turn, no response expected) – the running commentary a human sees scroll by in an interactive run. */
export type CorrespondenceDirection = "hil-to-orch" | "orch-to-hil";

/** One recorded exchange between the orchestrator and the HIL (human or proxy). */
export interface CorrespondenceEntry {
  /** Monotonic 0-based sequence in the correspondence stream (seq 0 = the kickoff). */
  seq: number;
  /** Which way this exchange flows (default hil-to-orch for the ask/answer kinds; progress = orch-to-hil). */
  direction?: CorrespondenceDirection;
  /** The turn this entry keys to, as an EXPLICIT foreign key into turns/index.json (not positional).
   *  For an orch->HIL `progress` entry: the ordinal of the turn it narrates (progress is 1:1 with turns).
   *  For a HIL->orch ask/answer: the ordinal of the perform-turn it ran at (author-requests IS ord2,
   *  gate-plan IS ord4). `null` for the kickoff (it precedes turn 0, so no turn exists to key to). */
  ordinal?: number | null;
  /** The drive iteration this exchange sits at (kickoff = -1, before the loop). */
  iteration: number;
  at: string;
  phase?: string;
  step?: string;
  /** What the orchestrator ASKED (hil-to-orch) or NARRATED (orch-to-hil `progress`). */
  request: {
    kind: "kickoff" | "intake" | "intake-interview" | "gate" | "author-requests" | "progress";
    /** A human-readable rendering of the ask/notice (the command, the gate presentation, the progress line). */
    prompt: string;
    /** For a `progress` notice: the role (or kind) that just completed its turn, carried as a STRUCTURED
     *  field so a reader renders it uniformly (bracketed, role-colored) without parsing it back out of
     *  `prompt`. The sole source of the role on a progress row; `prompt` carries only the detail. */
    role?: string;
    /** For an intake interview: the question set posed to the HIL. */
    questions?: string[];
    /** The RICH presentation of the ask exactly as SHOWN (formatting/fonts/highlighting preserved). */
    presentation?: CorrespondencePresentation;
  };
  /** What the HIL ANSWERED / SUBMITTED. For an orch->HIL `progress` notice there is nothing to answer,
   *  so `by` is the ORCHESTRATOR and the other fields are typically absent. */
  response: {
    by: "human-proxy" | "human" | "orchestrator";
    /** Intake-interview answers (paired to request.questions). */
    answers?: CorrespondenceQA[];
    /** The artifact(s) the HIL submitted in response. */
    submitted?: CorrespondenceSubmission[];
    /** A gate/approval decision. */
    decision?: "approved" | "rejected";
    /** The RICH presentation of the answer/submission as SHOWN (formatting/fonts/highlighting preserved). */
    presentation?: CorrespondencePresentation;
  };
  /** The outcome of the exchange (conformance + approval). */
  outcome: {
    validated: boolean;
    approved?: boolean;
    violations?: string[];
  };
}

/** Append one correspondence exchange to correspondence.jsonl under the record dir. This is the
 *  run-level HIL transcript the recorder otherwise lacks – the orchestrator's question paired with the
 *  proxy's answer/submission + outcome, so a recorded capture reads like the interactive session it
 *  mimics. Seq is the caller's monotonic counter (kickoff = 0). */
export function recordCorrespondence(recordDir: string, entry: CorrespondenceEntry): void {
  mkdirSync(recordDir, { recursive: true });
  appendFileSync(join(recordDir, "correspondence.jsonl"), JSON.stringify(entry) + "\n");
}

/**
 * The PRE-STATE + levers an agent turn needs to be replayed IN ISOLATION – the "replay set" bundled
 * per manifest step for optimization experiments. Distinct from the turn's OUTPUT delta (recordTurn):
 * this captures what the step CONSUMED, so a sweep can re-run the SAME turn under different levers.
 *
 * Written under the turn dir as `replay-set/`:
 *   pre-project/        – FULL project code tree BEFORE the agent ran (codeTreeFilter: app/tests/
 *                         migrations, NEVER .consort/junk) – the exact tree the turn starts from, so
 *                         the step replays without reconstructing it from prior turns. Agent turns are
 *                         the sole mutators of the project code tree (deploy/hooks touch only .consort
 *                         + pid), so a snapshot here is the complete code pre-state.
 *   inputs/<id>         – the resolved input CONTENTS the orchestrator handed the step (keyed by id).
 *   prompt.txt          – the FULLY ASSEMBLED prompt the agent saw (preconditions already inlined).
 *   guidelines.json     – the instruction guidelines (empty array when none).
 *   levers.json         – the RESOLVED agent levers (model/effort/session/toolScope) the turn ran
 *                         with – exactly what an optimization sweep varies.
 *   pre-consort/        – the FULL `.consort` STATE tree BEFORE the turn (cycles/features/experiments/
 *                         design/smells/workflow – everything the drive reads to DERIVE this turn's
 *                         routing), minus append-only event streams + runtime ephemera (see
 *                         preConsortKeep). A replay lays this verbatim as the starting `.consort`
 *                         instead of RECONSTRUCTING the pre-turn cycle state from prior turns' data (the
 *                         driver-repair/refactor handroll). ADDITIVE: the replay path PREFERS pre-consort
 *                         when present and falls back to the handroll when absent, so nothing that
 *                         consumes the old path is retired until a fresh recording fills this.
 * MUST be called BEFORE the agent mutates the tree (pre-state), from the record wrapper.
 */
export function recordReplaySet(args: {
  /** The turn's dir: `<recordDir>/turns/<NNNN>-<label>` (the SAME dir recordTurn will fill). */
  turnDir: string;
  projectDir: string;
  consortDir: string;
  /** Resolved input contents, keyed by logical input id (invocation.inputs). */
  inputs: Record<string, string>;
  /** The fully-assembled prompt the agent received (invocation.instructions.prompt). */
  prompt: string;
  /** Instruction guidelines, if any (invocation.instructions.guidelines). */
  guidelines?: string[];
  /** The resolved levers the turn ran with (model/effort/session/toolScope/...). */
  levers?: Record<string, unknown>;
}): void {
  const { turnDir, projectDir, consortDir, inputs, prompt, guidelines, levers } = args;
  const setDir = join(turnDir, "replay-set");
  mkdirSync(setDir, { recursive: true });

  // pre-project/ – the full code tree BEFORE the turn (codeTreeFilter excludes .consort + junk).
  const keep = codeTreeFilter(projectDir);
  const preDir = join(setDir, "pre-project");
  for (const abs of walk(projectDir, keep)) {
    const rel = relative(projectDir, abs);
    const dst = join(preDir, rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(abs, dst);
  }
  // pre-consort/ – the full `.consort` STATE tree BEFORE the turn, laid verbatim by a replay so it never
  // has to reconstruct the pre-turn cycle/review state from prior turns' data. Excludes append-only event
  // STREAMS (agent-log/correspondence – already mirrored into the corpus separately, and O(turns^2) if
  // snapshotted every turn) + runtime ephemera (pid/lock/socket + the liveness sidecar) – none of which is
  // pre-turn routing state. Same walk+cpSync primitive as pre-project.
  const preConsortDir = join(setDir, "pre-consort");
  for (const abs of walk(consortDir, preConsortKeep)) {
    const rel = relative(consortDir, abs);
    const dst = join(preConsortDir, rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(abs, dst);
  }

  // inputs/<id> – the resolved contents handed to the step.
  const inDir = join(setDir, "inputs");
  mkdirSync(inDir, { recursive: true });
  for (const [id, content] of Object.entries(inputs)) {
    // ids are logical (e.g. "product-overview", "feature-request") – filesystem-safe already, but
    // guard a path separator so an id can never escape the inputs dir.
    writeFileSync(join(inDir, id.replace(/[/\\]/g, "_")), content);
  }

  // prompt.txt + guidelines.json + levers.json – the invocation conditions. The prompt is stored with
  // the ephemeral project root rewritten to PROJECT_ROOT_TOKEN so it stays resolvable after the
  // scaffold is reclaimed (the live prompt the agent received was the real absolute path; only the
  // RECORDED copy is relativized).
  writeFileSync(join(setDir, "prompt.txt"), relativizeProjectPaths(prompt, projectDir));
  writeFileSync(join(setDir, "guidelines.json"), JSON.stringify(guidelines ?? [], null, 2) + "\n");
  writeFileSync(join(setDir, "levers.json"), JSON.stringify(levers ?? {}, null, 2) + "\n");
}

/**
 * THE TEMPLATE: the files every AGENT turn (invoke-role, dispatched through the executor + record
 * wrapper) MUST have recorded, relative to its turn dir. This is the contract the per-turn audit
 * (assertTurnComplete) hard-fails on – so a turn that silently dropped an artifact (e.g. the
 * transcript double-consume bug) aborts the capture at that turn instead of corrupting the corpus.
 *
 * An agent turn's complete set:
 *   turn.json                     – the manifest (action + produced/deleted delta) – recordTurn
 *   files/                        – the OUTPUT delta (code + .consort) this turn produced – recordTurn
 *   transcript.md                 – the prompt + final reasoning + tools – recordTurn (from takeTranscript)
 *   replay-set/pre-project/       – the code pre-state – recordReplaySet
 *   replay-set/inputs/            – the resolved inputs – recordReplaySet
 *   replay-set/prompt.txt         – the assembled prompt – recordReplaySet
 *   replay-set/guidelines.json    – the guidelines – recordReplaySet
 *   replay-set/levers.json        – the resolved levers – recordReplaySet
 * A NON-agent turn (gate / dispatch / cut-experiment: no agent ran) requires only turn.json + files/.
 *
 * `liveCapture` scopes the FULL agent bundle (transcript.md + replay-set) to a LIVE capture. The same
 * wrapper also records REPLAY agents (corpus migration) + test doubles, which have no live transcript
 * and no meaningful pre-state – they legitimately lack the bundle, so a non-live record requires only
 * the base set (turn.json + files/) even for an invoke-role turn.
 */
export function expectedTurnFiles(action: WorkflowAction, opts: { liveCapture?: boolean; liveIndex?: boolean } = {}): string[] {
  // LIVE INDEX (a live build recording into `.consort`, snapshotContent:false): NO content is
  // copied, so there is no `files/` delta + no replay-set pre-state. The turn IS still a viewable
  // timeline entry, so require its manifest + – for an agent turn – its transcript. This is the
  // always-on record's set; the clicked files are read at HEAD, not from a frozen copy.
  if (opts.liveIndex) {
    return action.kind === "invoke-role" ? ["turn.json", "transcript.md"] : ["turn.json"];
  }
  const base = ["turn.json", "files"];
  if (action.kind !== "invoke-role" || !opts.liveCapture) return base;
  return [
    ...base,
    "transcript.md",
    "replay-set/pre-project",
    "replay-set/inputs",
    "replay-set/prompt.txt",
    "replay-set/guidelines.json",
    "replay-set/levers.json",
  ];
}

/**
 * The PER-TURN AUDIT (hard-fail): after a turn is captured, assert EVERY file the template
 * (expectedTurnFiles) requires for this turn kind exists in its dir. Throws loud on the FIRST
 * missing one – naming the turn + the missing files – so a capture aborts at the defective turn
 * rather than silently producing an incomplete corpus (the failure mode that let 11/12 agent turns
 * record with no transcript.md unnoticed). Called at end-of-turn from the record wrapper.
 */
export function assertTurnComplete(turnDir: string, action: WorkflowAction, opts: { liveCapture?: boolean; liveIndex?: boolean } = {}): void {
  const missing = expectedTurnFiles(action, opts).filter((rel) => !existsSync(join(turnDir, rel)));
  if (missing.length > 0) {
    throw new Error(
      `RECORD AUDIT FAILED – turn ${turnDir} (${labelForAction(action)}) is missing required recorded ` +
        `file(s): ${missing.join(", ")}. The capture is aborting so the corpus is not silently ` +
        `incomplete. Every ${action.kind === "invoke-role" ? "agent" : ""} turn must record its full set ` +
        `(see expectedTurnFiles). Fix the recorder path that dropped it, then re-capture.`,
    );
  }
}

/** Short, filesystem-safe label for a turn dir, derived from the action. */
export function labelForAction(action: WorkflowAction): string {
  const a = action as Record<string, unknown>;
  const kind = String(a.kind ?? "turn");
  if (kind === "invoke-role") {
    const role = String(a.role ?? "role");
    const mode = a.buildMode ?? a.mode;
    return mode ? `${role}-${mode}` : role;
  }
  if (kind === "approve-gate" || kind === "approve-intake-gate" || kind === "approve-plan-gate" || kind === "approve-promote-gate") {
    // approve-gate carries the per-story spec gate; the others name their gate.
    if (kind === "approve-intake-gate") return "gate-intake";
    if (kind === "approve-plan-gate") return "gate-plan";
    if (kind === "approve-promote-gate") return "gate-promote";
    return "gate-spec";
  }
  if (kind === "approve-deploy-gate") return "gate-deploy";
  if (kind === "surface-gate") return "gate-surface";
  // cut-experiment, accept, deploy, prepare-pr, wait-ci, merge, dispatch,
  // feature-complete, deploy-complete, planning-complete, complete, ...
  return kind;
}

function sha1(abs: string): string {
  return createHash("sha1").update(readFileSync(abs)).digest("hex");
}

/** Render an agent turn's transcript as human-readable markdown for the
 *  demo/visualization: the prompt the role was dispatched with, the tools it
 *  used in order, and its final reasoning (the outcome). */
export function renderTranscriptMd(t: RecordedTranscript, label: string): string {
  const lines: string[] = [];
  lines.push(`# ${label}${t.role ? ` (${t.role})` : ""}${t.model ? ` – ${t.model}` : ""}`, "");
  lines.push("## Prompt", "", "```", t.prompt.trim() || "(empty)", "```", "");
  lines.push("## Tools used", "");
  if (t.tools.length === 0) {
    lines.push("(none)", "");
  } else {
    for (const tool of t.tools) lines.push(`- ${tool}`);
    lines.push("");
  }
  lines.push("## Final reasoning", "", t.finalText.trim() || "(no final assistant text)", "");
  return lines.join("\n");
}

/** Keep-predicate for the pre-`.consort` snapshot: the full STATE tree, minus what a replay never needs to
 *  lay and that would bloat or destabilise the corpus:
 *   - append-only event STREAMS (`agent-log.jsonl`, `correspondence.jsonl`) – not pre-turn routing state;
 *     already captured/mirrored into the corpus separately, and snapshotting a growing log at EVERY turn
 *     is O(turns^2) storage.
 *   - runtime ephemera (`*.pid`, `*.lock`, `*.sock`, the `agent-live.log` liveness sidecar) – transient +
 *     non-deterministic, never state.
 *  Everything else (cycles/features/experiments/design/architecture/planning/sprints/deploy/escalations +
 *  smells/workflow/run-config/selection-log) is kept verbatim. */
function preConsortKeep(abs: string): boolean {
  const base = abs.split(/[/\\]/).pop() ?? "";
  if (base === "agent-log.jsonl" || base === "correspondence.jsonl") return false;
  if (base === "agent-live.log" || /\.(pid|lock|sock)$/.test(base)) return false;
  return true;
}

/** Recursively list files under a dir, applying an optional path filter. */
function walk(dir: string, keep?: (abs: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (keep && !keep(abs)) continue;
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...walk(abs, keep));
    else if (st.isFile()) out.push(abs);
  }
  return out;
}

/** Scan the watched roots (.consort in full + the code tree via codeTreeFilter) into
 *  a stable relpath->ScannedFile map. The code filter also excludes .consort, so the
 *  two roots never double-count. */
function scan(projectDir: string, consortDir: string): Map<string, ScannedFile> {
  const map = new Map<string, ScannedFile>();
  // .consort in full (minus the recorder's own append-only log).
  for (const abs of walk(consortDir)) {
    const rel = relative(projectDir, abs);
    const relConsort = relative(consortDir, abs);
    if (NON_ARTIFACT_CONSORT.has(relConsort)) continue;
    if (isRecorderOwned(relConsort)) continue; // the LIVE record's own output under `.consort/` – never a turn's artifact
    map.set(rel, { abs, rel, underConsort: true, sha: sha1(abs) });
  }
  // The code tree (app/, tests/, alembic/, etc.) via the shared filter, which
  // skips scaffold-owned dirs (.consort/.git/scripts/...), junk, and secrets.
  const keep = codeTreeFilter(projectDir);
  for (const abs of walk(projectDir, keep)) {
    const rel = relative(projectDir, abs);
    if (map.has(rel)) continue;
    map.set(rel, { abs, rel, underConsort: false, sha: sha1(abs) });
  }
  return map;
}

interface RecorderState {
  /** relpath -> sha at the end of the previous turn. */
  files: Record<string, string>;
}

function writeRecorderState(recordDir: string, cur: Map<string, ScannedFile>): void {
  const files: Record<string, string> = {};
  for (const [rel, f] of cur) files[rel] = f.sha;
  mkdirSync(recordDir, { recursive: true });
  writeFileSync(join(recordDir, ".recorder-state.json"), JSON.stringify({ files }, null, 2) + "\n");
}

/**
 * Seed the delta baseline with the CURRENT project state, once, before the first
 * turn is recorded – so turn 0's delta reports only what that turn produced, not
 * the pre-existing scaffold + intake files. A no-op if a baseline already exists
 * (e.g. a later drive process in the same run, which must keep the running state
 * from the prior process). Call at recorder construction, after scaffold/intake.
 */
export function seedRecorderBaseline(args: { recordDir: string; projectDir: string; consortDir: string }): boolean {
  if (existsSync(join(args.recordDir, ".recorder-state.json"))) return false;
  writeRecorderState(args.recordDir, scan(args.projectDir, args.consortDir));
  return true;
}

function readState(recordDir: string): RecorderState {
  const f = join(recordDir, ".recorder-state.json");
  if (!existsSync(f)) return { files: {} };
  try {
    return JSON.parse(readFileSync(f, "utf8")) as RecorderState;
  } catch {
    return { files: {} };
  }
}

interface IndexEntry {
  ordinal: number;
  step: number;
  label: string;
  kind: string;
  role?: string;
  mode?: string;
  story?: string;
  ac?: string;
  dir: string;
  producedCount: number;
  deletedCount: number;
  /** True when the turn recorded an agent transcript (transcript.md present). */
  hasTranscript?: boolean;
}

function readIndex(recordDir: string): IndexEntry[] {
  const f = join(recordDir, "turns", "index.json");
  if (!existsSync(f)) return [];
  try {
    const data = JSON.parse(readFileSync(f, "utf8")) as { turns?: IndexEntry[] };
    return Array.isArray(data.turns) ? data.turns : [];
  } catch {
    return [];
  }
}

function pad(n: number): string {
  return String(n).padStart(4, "0");
}

/** The ordinal of the LAST turn recorded to `turns/index.json`, or null when none. The correspondence
 *  emitter reads this to stamp a HIL exchange's `ordinal` as an EXPLICIT FK to its turn: onCorrespondence
 *  fires AFTER perform() has recorded the turn (author-requests / gate ARE recorded turns), so the just-
 *  recorded turn is the last index entry. Kickoff precedes turn 0 => this returns null there, matching
 *  the null-ordinal contract for kickoff. */
export function lastRecordedOrdinal(recordDir: string): number | null {
  const idx = readIndex(recordDir);
  return idx.length ? idx[idx.length - 1]!.ordinal : null;
}

/**
 * The turn dir `recordTurn` WILL write for this action, computed the SAME way (next ordinal from the
 * on-disk index + labelForAction). Exported so the record wrapper can write the PRE-state replay set
 * (recordReplaySet) into the identical dir BEFORE recordTurn fills its output delta. Both read the
 * index at the same point (no turn appended yet between them), so the ordinals agree. Callers MUST
 * invoke recordReplaySet(turnDirFor(...)) then recordTurn(...) with no intervening index append.
 */
export function turnDirFor(recordDir: string, action: WorkflowAction): string {
  return join(recordDir, "turns", `${pad(readIndex(recordDir).length)}-${labelForAction(action)}`);
}

/**
 * Record one state-machine turn: write its manifest + the .consort/code delta it
 * produced under turns/<NNNN>-<label>/, refresh the cumulative recorded-artifacts
 * .consort mirror, and append to turns/index.json. The ordinal is monotonic across
 * the whole run (every drive process appends to the same on-disk index), so the
 * timeline is correct even though each feature/sprint is a separate process.
 */
export function recordTurn(args: RecordTurnArgs): RecordedTurn {
  const { recordDir, projectDir, consortDir, action, step, transcript } = args;
  const snapshotContent = args.snapshotContent !== false;
  const a = action as Record<string, unknown>;

  const prior = readState(recordDir);
  const cur = scan(projectDir, consortDir);

  const produced: string[] = [];
  for (const [rel, f] of cur) {
    if (prior.files[rel] !== f.sha) produced.push(rel);
  }
  const deleted: string[] = [];
  for (const rel of Object.keys(prior.files)) {
    if (!cur.has(rel)) deleted.push(rel);
  }
  produced.sort();
  deleted.sort();

  const ordinal = readIndex(recordDir).length;
  const label = labelForAction(action);
  const dirName = `${pad(ordinal)}-${label}`;
  const turnDir = join(recordDir, "turns", dirName);
  mkdirSync(turnDir, { recursive: true });

  // Content snapshot – recorded corpus only. The LIVE record (snapshotContent:false) keeps just the
  // produced/deleted INDEX computed above; a clicked file is read at HEAD, not from a frozen copy.
  if (snapshotContent) {
    mkdirSync(join(turnDir, "files"), { recursive: true });
    const artifactsDir = join(recordDir, "recorded-artifacts");
    // Copy each produced file into the turn's delta, and mirror .consort files into the
    // cumulative recorded-artifacts corpus (so replayDesignTurn reads it as-is).
    for (const rel of produced) {
      const f = cur.get(rel)!;
      const dst = join(turnDir, "files", rel);
      mkdirSync(dirname(dst), { recursive: true });
      cpSync(f.abs, dst);
      if (f.underConsort) {
        const mirror = join(artifactsDir, relative(consortDir, f.abs));
        mkdirSync(dirname(mirror), { recursive: true });
        cpSync(f.abs, mirror);
      }
    }
    // Remove cumulative-mirror entries for deleted .consort files.
    for (const rel of deleted) {
      const abs = join(projectDir, rel);
      if (abs.startsWith(consortDir)) {
        const mirror = join(artifactsDir, relative(consortDir, abs));
        if (existsSync(mirror)) rmSync(mirror, { force: true });
      }
    }
  }

  // Persist the agent turn's transcript (prompt + final reasoning + tool list)
  // as a human-readable transcript.md the demo/visualization renders, and a
  // compact summary in turn.json (hasTranscript + counts) so an index consumer
  // knows a transcript exists without reading it. Non-agent turns have none.
  let transcriptSummary: { role?: string; model?: string; toolCount: number; finalTextChars: number } | undefined;
  if (transcript) {
    // Rewrite the ephemeral project root to PROJECT_ROOT_TOKEN in the RECORDED transcript (prompt +
    // final reasoning + tool markers) so its paths stay resolvable after the scaffold is reclaimed ,
    // same portability rule as prompt.txt. The live transcript object is untouched (a fresh relativized
    // copy is rendered).
    const rel = (s: string): string => relativizeProjectPaths(s, projectDir);
    const portable: RecordedTranscript = {
      ...transcript,
      prompt: rel(transcript.prompt),
      finalText: rel(transcript.finalText),
      tools: transcript.tools.map(rel),
    };
    writeFileSync(join(turnDir, "transcript.md"), renderTranscriptMd(portable, label));
    transcriptSummary = {
      role: transcript.role,
      model: transcript.model,
      toolCount: transcript.tools.length,
      finalTextChars: transcript.finalText.length,
    };
  }

  const manifest = {
    ordinal,
    step,
    label,
    kind: String(a.kind ?? "turn"),
    role: a.role as string | undefined,
    mode: (a.buildMode ?? a.mode) as string | undefined,
    story: a.story as string | undefined,
    ac: a.ac as string | undefined,
    action,
    produced,
    deleted,
    // false = a LIVE record: produced/deleted are an INDEX only; read the files at HEAD, not from a
    // frozen turns/<NNNN>/files/ copy (which was not written). Omitted-as-true keeps recorded corpora
    // byte-identical to before this flag existed.
    ...(snapshotContent ? {} : { snapshotted: false }),
    ...(transcriptSummary ? { transcript: transcriptSummary } : {}),
  };
  writeFileSync(join(turnDir, "turn.json"), JSON.stringify(manifest, null, 2) + "\n");

  // Append to the ordered index.
  const index = readIndex(recordDir);
  const entry: IndexEntry = {
    ordinal,
    step,
    label,
    kind: manifest.kind,
    role: manifest.role,
    mode: manifest.mode,
    story: manifest.story,
    ac: manifest.ac,
    dir: dirName,
    producedCount: produced.length,
    deletedCount: deleted.length,
    ...(transcript ? { hasTranscript: true } : {}),
  };
  index.push(entry);
  mkdirSync(join(recordDir, "turns"), { recursive: true });
  writeFileSync(join(recordDir, "turns", "index.json"), JSON.stringify({ turns: index }, null, 2) + "\n");

  // Persist the new file-state for the next turn's delta.
  writeRecorderState(recordDir, cur);

  // orch->HIL PROGRESS (the running commentary a human sees in an interactive /sprint, made first-class
  // and recorded): one progress correspondence entry per recorded turn, keyed to THIS turn's ordinal, so
  // the correspondence stream mirrors turns/index.json and every progress entry has a STRUCTURAL FK to
  // its turn (emitted HERE, from the post-turn seam where the ordinal is finalized – not stamped after
  // the fact). Self-gated to a LIVE CAPTURE: only when correspondence.jsonl already exists (the drive
  // wrote the kickoff at start), so hermetic recordTurn unit tests – which never write a kickoff – stay
  // byte-identical (no correspondence side effect). Best-effort: progress is observability, never a gate.
  try {
    if (existsSync(join(recordDir, "correspondence.jsonl"))) {
      recordCorrespondence(recordDir, {
        seq: -1, // progress entries are keyed by ordinal (their FK), not by the HIL seq counter
        direction: "orch-to-hil",
        ordinal,
        iteration: -1,
        at: new Date().toISOString(),
        ...(manifest.step !== undefined ? { step: String(manifest.step) } : {}),
        request: {
          kind: "progress",
          role: manifest.role ?? manifest.kind,
          prompt: progressNarration(manifest, produced.length, deleted.length),
        },
        response: { by: "orchestrator" },
        outcome: { validated: true },
      });
    }
  } catch {
    /* progress is observability; a failed write must never break the turn record */
  }

  return { ordinal, dir: dirName, produced, deleted };
}

/** The DETAIL half of a recorded turn's orch->HIL progress notice: "what just happened" a human would
 *  see scroll by – the mode + story/ac scope + the size of the delta it produced. The role itself rides
 *  the correspondence's STRUCTURED `role` field (not this string), so a reader brackets/colors it
 *  uniformly; this prompt carries only the detail, never leads with the role. Built purely from the
 *  manifest so it needs no extra state. */
function progressNarration(
  m: { kind: string; role?: string; mode?: string; story?: string; ac?: string; label: string },
  producedCount: number,
  deletedCount: number,
): string {
  const scope = [m.story, m.ac].filter(Boolean).join(" / ");
  const parts = [
    m.mode ?? "",
    scope ? `(${scope})` : "",
    `${producedCount} file(s) produced${deletedCount ? `, ${deletedCount} removed` : ""}`,
  ];
  return parts.filter(Boolean).join(" ");
}
