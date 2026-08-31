// Source resolution: which mode the dashboard is running in.
//
// Per the plan's §Phase 2 mode selection:
//   CONSORT_PROJECT_DIR → live
//   CONSORT_CORPUS_DIR  → replay
//   both set            → a mode switch in the header (default: live)
//
import { liveSource } from "./live";
import { ReplaySource, corpusDir } from "./replay";
import type { DashboardSource, SourceMode } from "../source";

export { LiveSource, liveSource } from "./live";
// No `replaySource` counterpart on purpose — see the note at the foot of ./replay.
export { ReplaySource, clearCorpusCache, corpusDir } from "./replay";

export interface Resolution {
  source: DashboardSource;
  /** Modes the environment makes available; drives the header's mode switch. */
  available: SourceMode[];
  /** Set when a requested mode could not be honoured. */
  note: string | null;
}

export function resolveSource(requested?: SourceMode): Resolution {
  // Built per call rather than module-shared: CONSORT_CORPUS_DIR is read at construction, and
  // a process-wide singleton would pin whatever the env said at import time — which breaks
  // tests and any future per-request corpus selection.
  const replay = corpusDir() ? new ReplaySource() : null;

  // A corpus counts as available only if it can actually be read. A configured-but-broken
  // corpus must not offer a mode switch that lands on an error board.
  const replayUsable = !!replay?.available();
  const available: SourceMode[] = replayUsable ? ["live", "replay"] : ["live"];

  // Honour an explicit request when we can; otherwise say why not, and fall back to live.
  // Live is the default even with a usable corpus: this app's primary job is watching a run
  // in progress, and a corpus being on disk is not a reason to stop doing that.
  if (requested === "replay") {
    if (replayUsable) return { source: replay!, available, note: null };
    return {
      source: liveSource,
      available,
      // Name the actual defect (missing dir / missing log / missing index), not just
      // "unavailable" — a corpus that ships turns but no log is a real and specific case.
      note: replay
        ? `Replay unavailable — showing live. ${replay.unavailableReason()}`
        : "CONSORT_CORPUS_DIR is not set, so there is no corpus to replay — showing live.",
    };
  }

  // Live was requested (or nothing was). Flag a broken corpus config so a typo in
  // CONSORT_CORPUS_DIR doesn't silently remove the mode switch.
  const note = replay && !replayUsable ? `Corpus configured but unusable: ${replay.unavailableReason()}` : null;

  // "Live is the default" assumed live was usable. When it isn't — a corpus-only setup, with
  // no scaffolded project — defaulting to live opens on an error page while a readable corpus
  // sits right there. Prefer replay in that case, and say why, so the board is useful on first
  // paint. An EXPLICIT live request is still honoured above... but only when nothing was asked
  // for do we get to choose, which is what this branch is.
  if (requested === undefined && replayUsable && !liveSource.available()) {
    return {
      source: replay!,
      available,
      note: `No live Consort project found (${liveSource.unavailableReason()}) — showing the recorded corpus instead.`,
    };
  }

  return { source: liveSource, available, note };
}

/** The source for this request. Convenience for callers that don't offer a mode switch. */
export function currentSource(requested?: SourceMode): DashboardSource {
  return resolveSource(requested).source;
}
