// The per-turn TRANSCRIPT SINK — the outcome-level trace (prompt + final text + tool list) a spawn
// stashes at close for the recorder wrapper to persist. Extracted from claude-runner into its own
// dependency-free module so BOTH runners (claude-runner + copilot-runner) can record into the same
// sink WITHOUT a claude-runner ↔ copilot-runner import cycle (copilot-runner imports this, not the
// claude runner; claude-runner re-exports these names for its existing importers + the execRunner
// envelope, which now drives copilot turns too).

/** The prompt + final reasoning + tool list captured from ONE agent turn, for
 *  the recorder to persist (demo transcript). Not the raw stream (that includes
 *  every interstitial "let me check" delta); just the outcome-level trace. */
export interface TurnTranscript {
  /** The task prompt the agent was dispatched with (`claude -p <task>`). */
  prompt: string;
  role?: string;
  model?: string;
  /** The turn's FINAL assistant text (the outcome/rationale). */
  finalText: string;
  /** Each tool action in order (name + a clipped target), as they streamed. */
  tools: string[];
}

/** Set by a runner on each turn's close; read + cleared by the recorder wrapper (withTurnRecording)
 *  so it lands in that turn's dir. Module-level because the spawn and the record wrapper are separated
 *  by the effects boundary. */
let lastAgentTranscript: TurnTranscript | undefined;
/** Per-cwd (per-worktree) transcript index, set alongside the global on each turn's close. CONCURRENCY
 *  SAFETY: the bare `lastAgentTranscript` global is a RACE when candidates run in parallel (each spawn
 *  overwrites it, so a peek returns whoever flushed last – cross-candidate transcript crosstalk). A
 *  concurrent caller (the optimize sweep, one worktree per candidate) peeks BY ITS cwd to get its OWN
 *  turn, never a sibling's. The serial drive keeps using the no-arg global path unchanged. */
const lastAgentTranscriptByCwd = new Map<string, TurnTranscript>();

export function takeLastAgentTranscript(cwd?: string): TurnTranscript | undefined {
  if (cwd !== undefined) {
    const t = lastAgentTranscriptByCwd.get(cwd);
    lastAgentTranscriptByCwd.delete(cwd);
    return t;
  }
  const t = lastAgentTranscript;
  lastAgentTranscript = undefined;
  return t;
}
/** PEEK the last turn's transcript WITHOUT clearing it – for an intermediate consumer (the step agent
 *  reads finalText for its lastResult) that must NOT rob the recorder wrapper's take() of the
 *  transcript. The take()-clears contract is a single-consumer design; when TWO consumers run per turn
 *  (the agent's lastResult + the record wrapper), the earlier one MUST peek, or the wrapper gets
 *  undefined and transcript.md is silently never written. The record wrapper remains the sole
 *  take()-clearer, at end of turn. Pass `cwd` for the concurrency-safe per-worktree read. */
export function peekLastAgentTranscript(cwd?: string): TurnTranscript | undefined {
  return cwd !== undefined ? lastAgentTranscriptByCwd.get(cwd) : lastAgentTranscript;
}
/** Record a turn's transcript as both the global last AND the per-cwd entry. Exported so the crosstalk
 *  safety (peek-by-cwd returns THIS cwd's turn, never a concurrent sibling's) is unit-testable without
 *  spawning a CLI. Called by each runner's backend on the turn's close. */
export function recordAgentTranscript(cwd: string, tx: TurnTranscript): void {
  lastAgentTranscript = tx;
  lastAgentTranscriptByCwd.set(cwd, tx);
}
