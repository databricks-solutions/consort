"use client";

import { useEffect, useRef, useState } from "react";
import type { DashboardState } from "@/lib/types";

// Client-side polling with exponential backoff on failure, mirroring the pipeline-app pattern.
//
// `at` drives time travel. When null the board follows the live edge; when set to an event
// index the fold is evaluated there instead. Polling continues either way, deliberately:
// a pinned board still wants a fresh `totalEventCount` so the transport's right edge keeps
// growing as the run progresses. The fold clamps `at`, so a stale index degrades to the
// live edge rather than erroring.

// Per-request timeout. Without one, a single hung/slow `/api/state` freezes the whole poll
// chain: the next tick cannot fire until the current fetch settles, so the board silently stops
// refreshing with no reconnecting signal — exactly the "event stream isn't refreshing" report.
// MUST sit ABOVE the server's own worst case: `readFeatureStatus` shells out to the lk CLI with
// a 15s timeout (lib/consort.ts), so a legitimate cold-cache request can take that long. A
// client timeout below 15s would abort healthy-but-slow requests and force needless backoff.
const REQUEST_TIMEOUT_MS = 20_000;

// Backoff ceiling. The old 30s cap meant a live board could sit 30s stale after a transient
// blip; for a monitoring view that reads as "frozen". Cap lower so a recovered server is picked
// back up quickly — hammering a truly-down local dev server a little harder is a fine trade.
const MAX_BACKOFF_MS = 8_000;

/**
 * Delay before the next poll given how many consecutive failures have occurred.
 * Exported (and pure) so the backoff curve is unit-testable without a DOM/timer harness —
 * the hook itself can't run under the node test environment this project uses.
 * failCount 0 (last poll ok) → the base interval; each further failure doubles, capped.
 */
export function pollBackoffMs(failCount: number, intervalMs: number): number {
  return Math.min(intervalMs * Math.pow(2, failCount), MAX_BACKOFF_MS);
}

export function usePolledState(
  intervalMs = 2000,
  at: number | null = null,
  mode: "live" | "replay" | null = null,
  // A pinned feature (FeatureSwitcher). Null follows the playhead's own feature. Like `at`, it
  // is a display filter — the poll continues either way, and the fold drops a stale id.
  feature: string | null = null,
) {
  const [state, setState] = useState<DashboardState | null>(null);
  const [connected, setConnected] = useState(false);
  // When the last successful poll landed (epoch ms), so the UI can surface staleness — a board
  // that stopped updating should say so rather than looking like a slow-but-live run.
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const failRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Generation guard. poll() reschedules itself, so a chain outlives the effect that began
  // it: without this, a second effect run (a scrub, or React's mount+remount in dev Strict
  // Mode) starts a SECOND self-perpetuating chain while `timerRef` tracks only the newest —
  // doubling request volume and orphaning a loop that cleanup can no longer stop. Each chain
  // checks it still owns the current generation before fetching and before rescheduling.
  const genRef = useRef(0);

  useEffect(() => {
    const myGen = ++genRef.current;

    const poll = async () => {
      if (myGen !== genRef.current) return; // superseded
      // Abort a request that outruns the timeout so it can't wedge the chain. A slow response
      // that arrives after the abort is discarded by the generation/abort guards.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const q = new URLSearchParams();
        if (at !== null) q.set("at", String(at));
        // Omitted when null so the server keeps its own default (live), rather than the
        // client asserting a mode before it knows which are available.
        if (mode !== null) q.set("mode", mode);
        if (feature !== null) q.set("feature", feature);
        const url = q.size > 0 ? `/api/state?${q}` : "/api/state";
        const r = await fetch(url, { cache: "no-store", signal: controller.signal });
        const data = (await r.json()) as DashboardState;
        if (myGen !== genRef.current) return; // don't clobber a newer chain's state
        setState(data);
        setConnected(true);
        setLastUpdatedAt(Date.now());
        failRef.current = 0;
      } catch {
        // Covers network errors, non-JSON bodies (a dev error overlay), AND the abort above.
        if (myGen !== genRef.current) return;
        failRef.current += 1;
        setConnected(false);
      } finally {
        clearTimeout(timeout);
        if (myGen === genRef.current) {
          timerRef.current = setTimeout(poll, pollBackoffMs(failRef.current, intervalMs));
        }
      }
    };

    // Runs on mount AND whenever `at`, `mode` or `feature` changes, so scrubbing or pinning a
    // feature repaints immediately instead of waiting for the next tick.
    poll();

    return () => {
      genRef.current++; // retire this chain
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [intervalMs, at, mode, feature]);

  return { state, connected, lastUpdatedAt };
}
