"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePolledState } from "./usePolledState";
import { fold } from "@/lib/reducer";
import type { AgentLogEvent, DashboardState, SnapshotInputs, SourceMeta } from "@/lib/types";

// Everything the fold needs that the log cannot supply, EMPTY. The client only ever folds the
// SCRUBBED path (`at !== null`), where `atLive` is false — and every branch of `fold()` that reads
// `snap.next` / `snap.status` / `snap.handbacks` / `snap.driveAlive` / `snap.sessionAgeMs` is
// `atLive`-guarded (see lib/reducer.ts), so none of them fire. The two view-meta fields the fold
// reads UNconditionally — `projectDir` and `generatedAt` — are carried from the live state so the
// header reads the same project/time it does at the edge. Everything durable (gates, stories,
// topology, the lit gate) then comes PURELY from the folded log slice, which is the whole point:
// the scrubbed board is reconstructed from the log, never from a live snapshot describing "now".
function snapFor(live: DashboardState | null): SnapshotInputs {
  return {
    projectDir: live?.projectDir ?? "",
    next: null,
    status: null,
    handbacks: [],
    sessionAgeMs: Number.POSITIVE_INFINITY,
    driveAlive: false,
    pendingPermission: null,
    generatedAt: live?.generatedAt ?? new Date().toISOString(),
  };
}

interface EventsFeed {
  events: AgentLogEvent[];
  totalEventCount: number;
}

/**
 * The board state, folded to the scrubber IN REAL TIME.
 *
 * Replaces `usePolledState` in the page. At the live edge (`at === null`) it IS `usePolledState`:
 * the server `/api/state` fold, which needs the disk snapshot (test counts, the feature-status CLI)
 * the browser doesn't have. When SCRUBBED (`at !== null`) it folds on the CLIENT — `fold(events,
 * snap, at, feature)` synchronously each render, no round-trip — so the board repaints every frame
 * of a drag instead of only when the drag STOPS (the old bug: each in-flight `/api/state` fetch was
 * superseded via the poll's generation guard, so mid-drag the board held the stale full-run state).
 *
 * The live poll runs continuously regardless of the playhead, so (a) `source` meta + capabilities
 * are always current, (b) the live snapshot is warm the instant the user returns to the edge, and
 * (c) `connected` / `lastUpdatedAt` stay honest. The events feed polls on its own 2s cadence so a
 * live run's new events arrive and the scrubbed fold can reach them.
 *
 * `at` / `mode` / `feature` wiring is identical to `usePolledState` — a drop-in swap in the page.
 */
export function useFoldedState(
  intervalMs = 1000,
  at: number | null = null,
  mode: "live" | "replay" | null = null,
  feature: string | null = null,
) {
  // The live edge: ALWAYS folded by the server (at=null), whatever the scrubber is doing. Pinning is
  // a server-side filter at the edge, so pass `feature` through — when scrubbed we re-apply the same
  // pin in the client fold. Carries the authoritative snapshot + `source` meta.
  const live = usePolledState(intervalMs, null, mode, feature);

  // The raw event log, polled on the activity-timeline cadence so a live run's new events reach the
  // client fold. One fetch is enough even while scrubbing — the array only GROWS; a stale-by-2s tail
  // just means the scrubber's far-right edge lags one tick, which `at` (clamped in the fold) tolerates.
  const [feed, setFeed] = useState<EventsFeed | null>(null);
  const feedGen = useRef(0);
  useEffect(() => {
    const myGen = ++feedGen.current;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pull = async () => {
      if (myGen !== feedGen.current) return;
      try {
        const q = mode ? `?mode=${mode}` : "";
        const r = await fetch(`/api/events${q}`, { cache: "no-store" });
        const d = (await r.json()) as { available?: boolean } & EventsFeed;
        if (myGen !== feedGen.current) return;
        if (d.available && Array.isArray(d.events)) {
          // Keep the prior reference when the log hasn't grown, so a static run never re-renders the
          // board on the poll (the whole-board re-fold is expensive) — matching the timeline poll.
          setFeed((prev) => (prev && prev.totalEventCount === d.totalEventCount ? prev : { events: d.events, totalEventCount: d.totalEventCount }));
        } else {
          setFeed((prev) => (prev === null ? prev : null));
        }
      } catch {
        /* best-effort; the live poll owns `connected` */
      } finally {
        if (myGen === feedGen.current) timer = setTimeout(pull, 2000);
      }
    };
    pull();
    return () => {
      feedGen.current++;
      if (timer) clearTimeout(timer);
    };
  }, [mode]);

  // The playhead-scoped `source` the client CANNOT fold itself: `correlation.recentTurns` and
  // `correspondence.recent` are corpus-derived (they pair the log against `turns/` + read
  // `correspondence.jsonl`), so only the SERVER can produce them for a given playhead. Fetch the
  // server's scrubbed state keyed on the exact playhead it describes; the client fold bridges the
  // gap until it lands. WITHOUT this the event-ticker would render the LIVE edge's turn ordinals +
  // HIL/orchestrator beats on a scrubbed slice — the rows track the playhead but their ordinals and
  // the interleaved conversation stay pinned to "now" (the "event log doesn't track" defect).
  const scrubKey = at === null ? null : `${at}|${feature ?? ""}|${mode ?? ""}`;
  const [scrub, setScrub] = useState<{ key: string; state: DashboardState } | null>(null);
  const scrubGen = useRef(0);
  useEffect(() => {
    if (scrubKey === null) {
      setScrub((prev) => (prev === null ? prev : null));
      return;
    }
    const myGen = ++scrubGen.current;
    const controller = new AbortController();
    // DEBOUNCE + ABORT. Rapid back-and-forth scrubbing changes `scrubKey` every frame; firing one
    // full-log `/api/state?at=` re-fold per change saturated the single server process, queueing the
    // live poll's own /api/state past its 20s timeout → the board flipped to a stuck "reconnecting".
    // So fetch the scoped source only once scrubbing SETTLES (the client fold bridges the board + the
    // ticker meanwhile), and abort an in-flight/superseded request so it never ties the server up.
    const timer = setTimeout(async () => {
      try {
        const p = new URLSearchParams({ at: String(at) });
        if (feature) p.set("feature", feature);
        if (mode) p.set("mode", mode);
        const r = await fetch(`/api/state?${p.toString()}`, { cache: "no-store", signal: controller.signal });
        const d = (await r.json()) as DashboardState & { ok?: boolean };
        if (myGen !== scrubGen.current || d?.ok === false) return;
        setScrub({ key: scrubKey, state: d });
      } catch {
        /* abort/network: the client fold bridges; the live poll owns `connected` */
      }
    }, 250);
    return () => {
      scrubGen.current++;
      controller.abort();
      clearTimeout(timer);
    };
    // scrubKey folds in at/feature/mode, so the fetch re-fires on any playhead change.
  }, [scrubKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const state = useMemo<DashboardState | null>(() => {
    // Following the live edge → the server's state verbatim (it has the disk snapshot).
    if (at === null) return live.state;
    // The server's scrubbed fold has LANDED for exactly this playhead → authoritative: the board AND
    // the corpus-scoped `source` (ticker turn ordinals + conversation) are both correct for `at`.
    if (scrub && scrub.key === scrubKey) {
      return scrub.state.source ? scrub.state : (live.state?.source ? { ...scrub.state, source: live.state.source } : scrub.state);
    }
    // Bridge (mid-drag, before the scoped source lands): fold the board on the CLIENT so it repaints
    // every frame, but BLANK the playhead-scoped `source` bits so the ticker shows the scrubbed events
    // with NO misattributed ordinals/beats — never the live edge's, which is the bug being fixed.
    if (!feed) return live.state;
    const folded = fold(feed.events, snapFor(live.state), at, feature);
    const bridged = live.state?.source ? scrubBridgeSource(live.state.source) : undefined;
    return bridged ? { ...folded, source: bridged } : folded;
  }, [at, feature, feed, live.state, scrub, scrubKey]);

  return { state, connected: live.connected, lastUpdatedAt: live.lastUpdatedAt };
}

/** The live `source` with its PLAYHEAD-SCOPED, corpus-derived fields blanked — for the brief bridge
 *  while the server's scrubbed `source` is in flight. Keeps the playhead-INDEPENDENT meta (mode,
 *  capabilities, note, fidelity, pairing health) but drops `recentTurns` / `latestTurn*` / the
 *  correspondence tail, all of which describe "now" and would misattribute to the scrubbed slice. */
function scrubBridgeSource(live: SourceMeta): SourceMeta {
  return {
    ...live,
    correlation: live.correlation
      ? { ...live.correlation, recentTurns: [], latestTurnByRole: {}, latestTurnByStep: {} }
      : live.correlation,
    correspondence: live.correspondence ? { recent: [] } : live.correspondence,
  };
}
