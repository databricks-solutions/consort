// replay-recorder-wrapper: a StepAgent DECORATOR that records what a turn produced into a corpus
// – the mirror of the step-aware replay agent. Replay READS the corpus by step (makeStepReplayAgent);
// Record WRAPS whatever agent ran (claude live, contained, or even a replay for corpus migration),
// lets it produce its delta, then WRITES that delta + the recorded transcript into the corpus keyed
// by the step's action. Both sit on the ONE buildAgent seam: recording a NEW live scenario is just
// wrapping the live `claude` agent. Same corpus format out (turns/NNNN-<label>/{turn.json,files/} +
// recorded-build/.../turns/NNN), so a recorded run is directly replayable.
//
// It REUSES the existing corpus writers verbatim (recordTurn + recordBuildTurn), never reinventing
// them – the recorder is the single source of the corpus format, shared by the drive.cli effects
// wrappers and this decorator. The only difference is WHERE it fires: this wraps the agent's invoke()
// (so it's selected per-step via buildAgent), the effects wrappers wrap perform() (whole-turn).
//
// Baseline: recordTurn diffs the workspace against a delta baseline seeded once per corpus. The
// wrapper seeds it lazily on the first wrapped invoke (guarded), mirroring withTurnRecording.

import { join } from "node:path";
import { seedRecorderBaseline, recordTurn, recordReplaySet, turnDirFor, assertTurnComplete, type RecordedTranscript } from "../../logging/turn-recorder.js";
import { recordBuildTurn, nextBuildTurnNumber } from "../../pipeline/record-build.js";
import type { StepAgent, AgentInvocation } from "./agent-types.js";
import type { WorkflowAction } from "../workflow/workflow-vocabulary.js";

/** What the recorder decorator needs from the run (the paths the corpus writers key on). */
export interface RecorderContext {
  /** LAKEBASE_CONSORT_RECORD_DIR – the corpus root the turns/ timeline is written under. */
  recordDir: string;
  /** LAKEBASE_CONSORT_RECORD_BUILD_DIR – the build-corpus root (recorded-build/); when set, a
   *  navigator/driver turn also snapshots its code tree there. Absent => design-only recording. */
  recordBuildDir?: string;
  /** The project working tree root. */
  projectDir: string;
  /** The project `.consort` dir. */
  consortDir: string;
  /** The feature id the run is building (the build corpus is feature-scoped). */
  featureId: string;
  /** OPTIONAL: capture the just-completed turn's transcript (prompt + final reasoning + tools) to
   *  persist alongside the delta. The live drive supplies takeLastAgentTranscript; a hermetic test
   *  omits it. */
  takeTranscript?: () => RecordedTranscript | undefined;
  /** OPTIONAL: the RESOLVED agent levers (model/effort/session/toolScope) for this invocation – the
   *  levers.json of the replay set. Supplied by the live wiring where the ClaudeStepAgent + its
   *  levers are constructed (the levers are private on the agent + off the StepAgent interface, so
   *  they cannot be read off `inner`). Absent (test doubles) => levers.json is `{}`. */
  resolveLevers?: (invocation: AgentInvocation) => Record<string, unknown>;
  /** LIVE INDEX mode (recordDir === the project's own `.consort`, always-on): record the turn's
   *  transcript + the produced/deleted file INDEX, but SNAPSHOT NO content – no `files/` copy, no
   *  recorded-artifacts mirror, no replay-set pre-state, no build-corpus snapshot. A clicked file is
   *  read at HEAD (may have changed since; not historically accurate, by design). Absent/false =>
   *  a CAPTURE: snapshot everything (historically accurate + replayable), as before. */
  liveIndex?: boolean;
}

/**
 * Wrap a StepAgent so that, after the inner agent produces its turn's delta in the workspace, the
 * turn is RECORDED into the corpus: recordTurn writes turns/<NNNN>-<label>/{turn.json,files/} (the
 * step-aware replay agent's source), and – for a navigator/driver turn – recordBuildTurn snapshots
 * the code tree into recorded-build/. Keyed by the invocation's action, so the recorded corpus is
 * step-addressable. Reuses the recorder primitives verbatim.
 */
export function wrapWithRecorder(inner: StepAgent, ctx: RecorderContext): StepAgent {
  let seeded = false;

  // The wrapped invoke: pass the invocation THROUGH to the inner agent untouched, then record.
  const recordingInvoke = async (invocation: AgentInvocation): Promise<void> => {
      // Seed the delta baseline ONCE (lazily), so the first recorded turn reports only what it
      // produced, not the pre-existing scaffold. A no-op once a baseline exists (later turns / a
      // resumed run). Mirrors withTurnRecording's seed.
      if (!seeded) {
        seedRecorderBaseline({ recordDir: ctx.recordDir, projectDir: ctx.projectDir, consortDir: ctx.consortDir });
        seeded = true;
      }

      // PRE-STATE replay set – captured BEFORE the agent mutates the tree, into the SAME turn dir
      // recordTurn will fill after (turnDirFor computes the identical next-ordinal name; no index
      // append happens between here and recordTurn below, so they agree). Bundles the full project
      // code pre-state + the resolved inputs/prompt/levers – everything an optimization sweep needs
      // to replay THIS step in isolation under swept levers. `.consort` is delta-tracked by
      // recordTurn (not snapshotted here). Only agent turns get a replay set (this decorator only
      // wraps agent invokes).
      const turnDir = turnDirFor(ctx.recordDir, invocation.action);
      // The replay-set pre-state (full code tree + inputs/prompt/levers) is a CAPTURE artifact for
      // offline replay/optimization – heavy, and pointless for the always-on LIVE index (which reads
      // files at HEAD, never replays). Skip it in live-index mode.
      if (!ctx.liveIndex) {
        recordReplaySet({
          turnDir,
          projectDir: ctx.projectDir,
          consortDir: ctx.consortDir,
          inputs: invocation.inputs,
          prompt: invocation.instructions.prompt,
          ...(invocation.instructions.guidelines ? { guidelines: invocation.instructions.guidelines } : {}),
          ...(ctx.resolveLevers ? { levers: ctx.resolveLevers(invocation) } : {}),
        });
      }

      // Let the inner agent (live claude / contained / replay) produce its delta first. The
      // invocation is forwarded verbatim – the wrapper NEVER alters the inner agent's inputs.
      await inner.invoke(invocation);

      const action: WorkflowAction = invocation.action;
      const transcript = ctx.takeTranscript?.();

      // 1) The per-turn timeline slice (turns/NNNN-<label>/): the artifact + meta delta this turn
      //    produced, plus the transcript. This is exactly what makeStepReplayAgent reads back.
      const rec = recordTurn({
        recordDir: ctx.recordDir,
        projectDir: ctx.projectDir,
        consortDir: ctx.consortDir,
        action,
        step: 0,
        ...(transcript ? { transcript } : {}),
        ...(ctx.liveIndex ? { snapshotContent: false } : {}),
      });

      // 2) A navigator/driver turn ALSO snapshots its full code tree into the build corpus
      //    (recorded-build/.../turns/NNN), the per-story build-ordinal replayBuildTurn consumes.
      //    CAPTURE only: the live index reads code at HEAD, so it snapshots no build corpus.
      if (!ctx.liveIndex && ctx.recordBuildDir && action.kind === "invoke-role" && (action.role === "navigator" || action.role === "driver") && "story" in action && typeof action.story === "string") {
        const turn = nextBuildTurnNumber(ctx.recordBuildDir, ctx.featureId, action.story);
        recordBuildTurn({
          recordBuildDir: ctx.recordBuildDir,
          projectDir: ctx.projectDir,
          consortDir: ctx.consortDir,
          featureId: ctx.featureId,
          story: action.story,
          turn,
          role: action.role,
          ...("ac" in action && typeof action.ac === "string" ? { ac: action.ac } : {}),
          ...("buildMode" in action && typeof action.buildMode === "string" ? { mode: action.buildMode } : {}),
        });
      }

      // 3) PER-TURN AUDIT (hard-fail): the turn is now fully captured – assert EVERY file the
      //    template requires is present. Throws loud + aborts the capture if any is missing, so an
      //    incomplete turn can never silently enter the corpus (the transcript-drop bug). turnDir is
      //    the SAME dir recordReplaySet + recordTurn wrote (turnDirFor, computed pre-invoke).
      //    SCOPE: the full agent-turn bundle (transcript.md + replay-set) is a LIVE-CAPTURE artifact.
      //    This wrapper also records REPLAY agents (corpus migration) + test doubles, which have no
      //    live transcript + no meaningful pre-state – they legitimately lack the bundle. The signal
      //    for a live capture is ctx.takeTranscript being supplied (the live drive supplies it;
      //    replay/migration/tests do not). So enforce the FULL bundle only for a live capture; for a
      //    non-live record still require the base set (turn.json + files/).
      //    AUDIT THE DIR recordTurn ACTUALLY WROTE (rec.dir), not the pre-invoke turnDir: recordTurn
      //    re-reads turns/index.json at write time, so if the index grew during inner.invoke() the two
      //    diverge and auditing the stale turnDir false-fails on a dir that was never written. Under
      //    the single-drive invariant (no concurrent writer – enforced by the drive's pid mutex) they
      //    normally agree, but auditing the real write target is correct regardless. (In capture mode
      //    recordReplaySet wrote the pre-state into the pre-invoke turnDir; that invariant is what keeps
      //    it in the same dir, so the mutex is what makes capture-mode replay-set placement sound.)
      const writtenDir = join(ctx.recordDir, "turns", rec.dir);
      assertTurnComplete(writtenDir, action, ctx.liveIndex ? { liveIndex: true } : { liveCapture: ctx.takeTranscript !== undefined });
  };

  // Return a TRUE PASS-THROUGH: every property/method of the inner agent is visible unchanged
  // (buildCommand, lastResult, sessionId, ...) so the executor + Step + manifest-runner read the
  // inner agent's telemetry (e.g. lastResult for the phase-6 record / recorded transcript) exactly
  // as if unwrapped. Only `invoke` is intercepted – to record after the inner turn produces its
  // delta. A Proxy (not an object spread) so live getters like `lastResult`, set DURING invoke,
  // reflect through to whoever reads them afterward.
  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === "invoke") return recordingInvoke;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
