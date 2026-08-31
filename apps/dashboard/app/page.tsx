"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { usePolledState } from "./usePolledState";
import { AgentBubble } from "./AgentBubble";
import { Transport } from "./Transport";
import { WorkflowGraph } from "./WorkflowGraph";
import { LaneGraph } from "./LaneGraph";
import { DrilldownPanel, type DrilldownTarget } from "./DrilldownPanel";
import { BacklogPanel } from "./BacklogPanel";
import { DriftBanner, EventTicker, FidelityBanner, modeFromUrl } from "./board-parts";
import { useTheme } from "./useTheme";
import type { DashboardState, StoryProgress } from "@/lib/types";
import { colorForRole, font, radius } from "@/lib/theme";

type CostMode = "show" | "hidden";

export default function Home() {
  // `at` drives time travel: null follows the live edge, a number pins the fold there.
  const [at, setAt] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  // null = let the server pick. Otherwise an explicit choice, from the mode switch or from
  // `?mode=` on the page URL — the latter so a replay board is linkable and screenshottable,
  // which is how this gap was noticed: driving the page with ?mode=replay silently showed live.
  // Read once as the initial value rather than kept in sync, since the switch owns it after.
  // Lazy initializer, so `window` is touched on first render rather than at module import.
  const [mode, setMode] = useState<"live" | "replay" | null>(() =>
    typeof window === "undefined" ? null : modeFromUrl(window.location.search),
  );

  // The pinned feature (FeatureSwitcher). Null follows the playhead's own feature. A FILTER,
  // not a seek: pinning never moves `at`, so the transport stays put and the pin just re-scopes
  // which feature the board shows.
  const [pinned, setPinned] = useState<string | null>(null);

  const { state, connected, lastUpdatedAt } = usePolledState(1000, at, mode, pinned);
  const [costMode, setCostMode] = useState<CostMode>("show");
  const showCost = costMode === "show";
  // The ONE open drill-down, if any. Null = closed. A tagged union over the three things a click
  // can open — a recorded turn (transcript + files), a live artifact (one file at HEAD), or a
  // lifecycle step's deliverables — so there is one open-state and one panel instead of three. All
  // are mutually exclusive now: opening any closes the others, which is the "one surface" the merge
  // was missing (before, a step panel and a turn panel could be open at once, in two places).
  const [drilldown, setDrilldown] = useState<DrilldownTarget | null>(null);
  // The single panel is a FIXED right-side drawer (see its render below), so it's already in the
  // viewport wherever you are — clicking a lifecycle node up top or a ticker row far down both
  // answer in place, next to what you clicked. No scroll-into-view: that used to yank the page to a
  // panel docked under the event stream, which is exactly the awkward jump we're removing.

  // Scrubbing closes a turn/artifact drill-down, but NOT a step one.
  //
  // A turn/artifact panel is a window onto a MOMENT in the run, so it must obey the reducer's rule
  // "a scrubbed-back board cannot leak state from the future". Left open across a scrub it broke
  // exactly that: with turn 113 open, dragging to event 40 left the header reading "viewing event
  // 40 of 421" while the panel still showed turn 113's prompt and its 12 produced files. Closing on
  // ANY scrub rather than only when out of range: "still in range" is decidable only from the
  // 40-event tail's pairings, empty at many playheads, so the precise rule would sometimes hide a
  // turn legitimately in the past. Reopening is one click from a ticker row, offered only when honest.
  //
  // A STEP target is timeline-INDEPENDENT — a recorded deliverable is the same at every playhead —
  // so it deliberately survives a scrub, preserving StepOutputsPanel's old behavior now that the
  // three panels share one open-state.
  const scrubTo = (next: number | null) => {
    setAt(next);
    setDrilldown((cur) => (cur && cur.kind === "step" ? cur : null));
  };
  // Gate on the CAPABILITY, not on `mode === "replay"`, so a future source with a turns corpus
  // gets the panel for free and a replay source that somehow lacks one doesn't offer dead rows.
  const canDrillDown = state?.source?.capabilities.includes("transcripts") ?? false;
  // Gate on the capability, not the mode: both live and replay declare planningBacklog, and a
  // future source that has planning artifacts gets the panel for free.
  const canShowBacklog = state?.source?.capabilities.includes("planningBacklog") ?? false;
  // Live's shallower drill-down: HEAD content for an artifact.written path. Only offered when the
  // source can't do the richer turn panel — otherwise a replay board would show both affordances.
  const canOpenArtifact = !canDrillDown && (state?.source?.capabilities.includes("artifactContent") ?? false);
  // Step-output drill-down on the WorkflowGraph. Capability-gated like the others, so a source
  // without recorded deliverables simply renders non-clickable nodes.
  const canShowStepOutputs = state?.source?.capabilities.includes("stepOutputs") ?? false;

  return (
    <main style={{ minHeight: "100vh", background: "var(--surface-page)", padding: "24px 28px", fontFamily: font.sans }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes softpulse { 0%,100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); } 50% { box-shadow: 0 0 18px 2px currentColor; opacity: 0.92; } }
      `}</style>

      <Header
        state={state}
        connected={connected}
        lastUpdatedAt={lastUpdatedAt}
        costMode={costMode}
        setCostMode={setCostMode}
        pinned={pinned}
        onPin={setPinned}
        onMode={(m) => {
          // Switching source resets the playhead: an event index means nothing across two
          // different runs, and carrying it over would silently show a corpus at a live run's
          // position. Stop playback too, so the board doesn't start scrubbing a new source.
          setAt(null);
          setPlaying(false);
          // ...and close any open drill-down: a turn ordinal / artifact path / recorded step
          // deliverable is all as source-specific as an event index.
          setDrilldown(null);
          // ...and drop any feature pin: a feature id is as run-specific as an event index, so
          // carrying F1 from a live run onto a replay corpus would pin nothing (or the wrong
          // thing). The fold would drop a stale id anyway; clearing it keeps the control honest.
          setPinned(null);
          setMode(m);
        }}
      />

      {!state ? (
        <Placeholder message="Connecting to /api/state…" />
      ) : !state.ok ? (
        <Placeholder message={state.error || "No Consort run found."} error />
      ) : (
        <>
          {state.waiting ? <WaitingBanner waiting={state.waiting} /> : null}
          <DriftBanner correlation={state.source?.correlation ?? null} />
          {/* A live build not capturing the full record-lane corpus says so, and how to fix it —
              turning a silently-missing drill-down into an actionable message. Null in replay. */}
          <FidelityBanner source={state.source} />

          <SectionHeader>Lifecycle</SectionHeader>
          <WorkflowGraph
            state={state}
            // Clicking a node opens its step deliverables in the ONE drill-down panel (below the
            // event stream, scrolled into view). Same-node click closes it. Scoped to the board's
            // current feature so the outputs match the rest of the board's context.
            onSelectNode={
              canShowStepOutputs
                ? (id) =>
                    setDrilldown((cur) => (cur && cur.kind === "step" && cur.node === id ? null : { kind: "step", node: id }))
                : undefined
            }
            // The node's selection ring reflects the open step target (and nothing when a turn or
            // artifact is open instead).
            selectedNode={drilldown?.kind === "step" ? drilldown.node : null}
          />

          <div style={{ marginTop: 12 }}>
            <Transport
              at={at}
              total={state.totalEventCount}
              onChange={scrubTo}
              playing={playing}
              onPlayingChange={setPlaying}
              speed={speed}
              onSpeedChange={setSpeed}
              atTimestamp={state.topology.atTimestamp}
            />
          </div>

          <SectionHeader>Lanes · inter-agent sub-workflows</SectionHeader>
          <LaneGraph state={state} />

          <SectionHeader>Status</SectionHeader>
          <StatusBar state={state} showCost={showCost} />

          {/* Planning / backlog — proposals, t-shirt sizes, sprint commit, plan gate. Fetched on
              its own route (not folded), so it does not rewind with the transport. */}
          {canShowBacklog ? (
            <>
              <SectionHeader>Planning · backlog</SectionHeader>
              <BacklogPanel mode={state.source?.mode ?? null} />
            </>
          ) : null}

          <SectionHeader>Current State</SectionHeader>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
            {state.agents.map((a) => (
              <AgentBubble key={a.role} agent={a} showCost={showCost} />
            ))}
          </section>

          {state.blockers.length > 0 ? <Blockers state={state} /> : null}

          <SectionHeader>Event Stream · {state.eventCount} events</SectionHeader>
          <EventTicker
            state={state}
            onOpenTurn={canDrillDown ? (ord) => setDrilldown({ kind: "turn", ord }) : undefined}
            onOpenArtifact={canOpenArtifact ? (path) => setDrilldown({ kind: "artifact", path }) : undefined}
          />
          {/* The ONE drill-down surface: whatever you clicked — a ticker row (turn or artifact) or
              a WorkflowGraph node (step) — opens here. It sits under the stream and scrolls itself
              into view (see the effect above) so a graph click up top still lands somewhere visible.
              Pass the board's ACTUAL mode rather than assuming replay: the openers are gated on the
              right capability precisely so a future non-replay source with the data works, and a
              hardcoded mode would silently serve it the wrong source. `feature` is passed LIVE (not
              baked into a step target) so switching the FeatureSwitcher re-scopes an open step panel.

              No capability re-check here even though the render isn't gated on one: `drilldown` is
              only ever SET through the capability-gated openers above, and the sole capability-
              changing action — a mode switch — clears it (see onMode). So an open target's source
              can always still satisfy it. */}
          {drilldown ? (
            // A FIXED right-side drawer: it floats over the right of the page and stays in view as
            // you scroll, so whatever you clicked (a lifecycle node at the top, a ticker row at the
            // bottom) is answered right where you are — no jump to a panel docked below the fold.
            // Caps its own height to the viewport and scrolls internally for a long transcript; on a
            // narrow screen it becomes near-full-width. z-index over the board; the shadow lifts it
            // off the content it overlays. The ✕ (and any scrub, per scrubTo) closes it.
            <div
              style={{
                position: "fixed",
                top: 12,
                right: 12,
                zIndex: 60,
                width: "min(460px, calc(100vw - 24px))",
                maxHeight: "calc(100dvh - 24px)",
                overflowY: "auto",
                borderRadius: radius.panel,
                boxShadow: "0 10px 40px rgba(0,0,0,0.28)",
              }}
            >
              <DrilldownPanel
                target={drilldown}
                mode={state.source?.mode ?? null}
                feature={state.feature ?? null}
                onClose={() => setDrilldown(null)}
              />
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}

function Header({ state, connected, lastUpdatedAt, costMode, setCostMode, onMode, pinned, onPin }: { state: DashboardState | null; connected: boolean; lastUpdatedAt: number | null; costMode: CostMode; setCostMode: (m: CostMode) => void; onMode: (m: "live" | "replay") => void; pinned: string | null; onPin: (f: string | null) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "var(--text-strong)" }}>Consort · Agent Mission Control</h1>
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
          {state?.feature ? (
            <>
              <strong>{state.feature}</strong> · phase: {state.phase ?? "—"}
              {state.atLive ? null : ` · viewing event ${state.atEventIndex} of ${state.totalEventCount}`}
              {/* A divergent pin means the board is FILTERED to a feature the run has moved past.
                  Say so, in the run's own terms, so it can't be mistaken for a rewind — the
                  playhead is still where the transport shows it. */}
              {state.pinnedFeature && state.features.find((f) => f.active) ? (
                <span style={{ color: "var(--text-faint)" }}>
                  {" "}
                  · run is on <strong>{state.features.find((f) => f.active)!.id}</strong>
                </span>
              ) : null}
            </>
          ) : "waiting for a run…"}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <FeatureSwitcher features={state?.features ?? []} pinned={pinned} onPin={onPin} />
        {/* Source mode. A switch when the environment offers both live and a readable corpus,
            otherwise a plain badge — a control that can only be pressed one way is noise. The
            warning tint carries `note`, which is how a misconfigured CONSORT_CORPUS_DIR
            becomes visible instead of silently removing the replay option. */}
        {state?.source ? (
          <span
            title={`${state.source.describe}${state.source.note ? ` — ${state.source.note}` : ""}`}
            style={{
              display: "flex",
              gap: 2,
              padding: 2,
              background: "var(--surface-inset)",
              border: `1px solid ${state.source.note ? "var(--status-warning)" : "var(--border-default)"}`,
              borderRadius: radius.chip,
            }}
          >
            {(state.source.availableModes.length > 1 ? state.source.availableModes : [state.source.mode]).map((m) => {
              const on = m === state.source!.mode;
              return (
                <button
                  key={m}
                  onClick={() => onMode(m)}
                  disabled={state.source!.availableModes.length < 2}
                  style={{
                    fontSize: "0.66rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: on ? "var(--text-strong)" : "var(--text-faint)",
                    background: on ? "var(--surface-card)" : "transparent",
                    border: "none",
                    borderRadius: radius.chip,
                    padding: "2px 7px",
                    cursor: state.source!.availableModes.length < 2 ? "default" : "pointer",
                    font: "inherit",
                  }}
                >
                  {m}
                </button>
              );
            })}
            {state.source.note ? <span style={{ fontSize: "0.66rem", padding: "2px 4px" }}>⚠</span> : null}
          </span>
        ) : null}
        <ConnectionStatus connected={connected} lastUpdatedAt={lastUpdatedAt} />
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.72rem" }}>
          <span style={{ color: "var(--text-faint)" }}>cost:</span>
          {(["show", "hidden"] as CostMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setCostMode(m)}
              style={{
                border: `1px solid var(--border-default)`,
                // Selected = inverted chip. Uses text-strong (not surface-terminal) as the bg so
                // it inverts in BOTH themes: in light text-strong == surface-terminal (#111827,
                // unchanged), in dark it flips to #fff so the surface-card label stays legible.
                background: costMode === m ? "var(--text-strong)" : "var(--surface-card)",
                color: costMode === m ? "var(--surface-card)" : "var(--text-muted)",
                borderRadius: 6,
                padding: "3px 8px",
                fontSize: "0.7rem",
                cursor: "pointer",
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}

// ☀️/🌙 toggle. Flipping data-theme on <html> re-themes the board via CSS (see app/useTheme.ts);
// the choice persists to localStorage. Shows a neutral glyph until mounted so it doesn't
// hydrate-mismatch the viewer's stored preference.
function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const label = theme === null ? "Toggle theme" : dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      style={{
        border: `1px solid var(--border-default)`,
        background: "var(--surface-card)",
        color: "var(--text-muted)",
        borderRadius: 6,
        padding: "3px 8px",
        fontSize: "0.85rem",
        lineHeight: 1,
        cursor: "pointer",
        minWidth: 30,
      }}
    >
      {theme === null ? "◐" : dark ? "☀" : "☾"}
    </button>
  );
}

// Connection health, with a staleness clock. `connected` flips false only when a poll actively
// FAILS — but a wedged poll chain (a request that never settles) leaves it stuck true while the
// board silently stops updating, which is the "event stream isn't refreshing" report. So this
// runs its OWN 1s tick and measures the age of the last successful update: even with zero poll
// re-renders, the age keeps climbing and the badge turns amber, making a frozen board obvious.
function ConnectionStatus({ connected, lastUpdatedAt }: { connected: boolean; lastUpdatedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ageSec = lastUpdatedAt === null ? null : Math.max(0, Math.round((now - lastUpdatedAt) / 1000));
  // A live board polls every ~1s; anything past a few seconds means updates have stopped, even
  // if the last poll technically succeeded. 5s is comfortably past normal jitter.
  const stale = ageSec !== null && ageSec > 5;
  const color = !connected ? "var(--status-critical)" : stale ? "var(--status-warning)" : "var(--status-good)";
  const label = !connected ? "reconnecting" : stale ? `no update · ${ageSec}s` : "live";
  return (
    <div
      title={lastUpdatedAt === null ? "waiting for first update" : `last update ${ageSec}s ago`}
      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem", color }}
    >
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
          animation: stale && connected ? "softpulse 1.6s ease-in-out infinite" : undefined,
        }}
      />
      {label}
    </div>
  );
}

// The sprint/feature selector. A multi-feature run scopes the board to one feature at a time
// (correctly — see the reducer), which leaves earlier features unreachable except by scrubbing
// the transport back past the sprint boundary, which no viewer discovers. This names every
// feature the run has touched and lets one be pinned.
//
// Two deliberate rules:
//   - Shown only when the run has MORE than one feature. On a single-feature run it is a control
//     that can only be pressed one way — noise — matching the mode switch's own rule.
//   - Pinning is a FILTER, not a seek: it sets `pinned` and never touches the playhead. "Live"
//     (null pin) follows the playhead's own feature, distinct from pinning that same feature,
//     so a viewer who wants "just track whatever's active" isn't stuck on a stale pin.
function FeatureSwitcher({ features, pinned, onPin }: { features: DashboardState["features"]; pinned: string | null; onPin: (f: string | null) => void }) {
  if (features.length < 2) return null;
  const dot = (f: DashboardState["features"][number]) =>
    f.done ? "var(--status-good)" : f.active ? "var(--status-warning-amber)" : "var(--border-default)";
  const chipStyle = (on: boolean): CSSProperties => ({
    fontSize: "0.66rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: on ? "var(--text-strong)" : "var(--text-faint)",
    background: on ? "var(--surface-card)" : "transparent",
    border: "none",
    borderRadius: radius.chip,
    padding: "2px 8px",
    cursor: "pointer",
    font: "inherit",
    display: "flex",
    alignItems: "center",
    gap: 5,
  });
  return (
    <span
      title="Filter the board to one feature. A filter, not a seek — the transport stays where it is."
      style={{ display: "flex", gap: 2, padding: 2, background: "var(--surface-inset)", border: `1px solid var(--border-default)`, borderRadius: radius.chip }}
    >
      {/* "Live" = follow the playhead's own feature (no pin). It is also highlighted when the
          pin is STALE — the client still holds a feature id, but it names nothing in this
          window (scrubbed back before it appears), so the fold dropped it and the board is in
          fact following the playhead. Highlighting the held-but-inert chip would misrepresent
          the filter's real state, so a pin that matches no chip reads as "follow". */}
      <button onClick={() => onPin(null)} style={chipStyle(pinned === null || !features.some((f) => f.id === pinned))}>
        follow
      </button>
      {features.map((f) => (
        <button key={f.id} onClick={() => onPin(f.id)} style={chipStyle(pinned === f.id)} title={`${f.id}${f.done ? " · done" : f.active ? " · active" : ""}`}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot(f), display: "inline-block" }} />
          {f.id}
        </button>
      ))}
    </span>
  );
}

function StatusBar({ state, showCost }: { state: DashboardState; showCost: boolean }) {
  const gateColor = (s: string) => (s === "approved" ? "var(--status-good)" : s === "open" ? "var(--border-default)" : "var(--status-warning-amber)");
  const designActive = state.lane === "design";
  // A complete run has no active lane — neither bar should claim "in progress".
  const buildActive = state.lane === "build";
  return (
    <div style={{ background: "var(--surface-card)", borderRadius: radius.card, padding: "16px 20px", border: `1px solid var(--border-default)`, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* DESIGN lane → BUILD lane → per-story rows → Stories/gates → (optional) COST at bottom. */}
      <DesignLane phases={state.designPhases} active={designActive} />
      <BuildLane state={state} active={buildActive} complete={state.lane === "complete"} />

      {state.stories.length > 0 ? <StoryTracks stories={state.stories} /> : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 28, alignItems: "center", borderTop: `1px solid var(--border-default)`, paddingTop: 12 }}>
        <Metric label="Stories" value={`${state.progress.storiesDone}/${state.progress.storiesTotal}`} />
        <div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Sprint gates</div>
          <div style={{ display: "flex", gap: 6 }}>
            {state.gates.length === 0 ? <span style={{ fontSize: "0.75rem", color: "var(--text-faint)" }}>—</span> : state.gates.map((g) => (
              <span key={g.name} title={`${g.name}: ${g.status}`} style={{ fontSize: "0.65rem", padding: "3px 8px", borderRadius: 6, border: `1px solid ${gateColor(g.status)}`, color: g.status === "approved" ? "var(--status-good)" : "var(--text-muted)", background: g.status === "approved" ? "var(--status-good-tint-soft)" : "var(--surface-card)", textTransform: "uppercase" }}>
                {g.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {showCost ? <CostBar state={state} /> : null}
    </div>
  );
}

function CostBar({ state }: { state: DashboardState }) {
  const total = state.totalCost;
  const contributors = state.agents.filter((a) => a.cost > 0).sort((a, b) => b.cost - a.cost);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", marginBottom: 6 }}>
        <span style={{ color: "var(--text-strong)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
          Cost · <span style={{ fontVariantNumeric: "tabular-nums" }}>${total.toFixed(2)}</span>
        </span>
        <span style={{ color: "var(--text-faint)" }}>relative contribution by agent</span>
      </div>
      <div style={{ display: "flex", height: 12, borderRadius: 6, background: "var(--surface-inset)", overflow: "hidden" }}>
        {total === 0
          ? null
          : contributors.map((a) => (
              <div
                key={a.role}
                title={`${a.role}: $${a.cost.toFixed(2)} (${Math.round((a.cost / total) * 100)}%)`}
                style={{ width: `${(a.cost / total) * 100}%`, height: "100%", background: colorForRole(a.role), transition: "width 0.5s ease" }}
              />
            ))}
      </div>
      {/* compact legend for the top contributors */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 6 }}>
        {contributors.map((a) => (
          <span key={a.role} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.64rem", color: "var(--text-muted)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: colorForRole(a.role) }} />
            {a.role} ${a.cost.toFixed(2)}
          </span>
        ))}
      </div>
    </div>
  );
}

const PHASE_CFG = {
  "not-started": { bg: "var(--surface-inset)", border: "var(--border-default)", text: "var(--text-faint)" },
  "in-progress": { bg: "var(--status-accent-tint)", border: "var(--status-accent)", text: "var(--status-accent-text)" },
  complete: { bg: "var(--status-good-tint)", border: "var(--status-good)", text: "var(--status-good-text)" },
} as const;

function DesignLane({ phases, active }: { phases: DashboardState["designPhases"]; active: boolean }) {
  return (
    <div style={{ opacity: active ? 1 : 0.55 }}>
      <div style={{ fontSize: "0.7rem", color: active ? "var(--text-strong)" : "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, fontWeight: 700 }}>
        Design {active ? "· in progress" : "· complete"}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {phases.map((p) => {
          const cfg = PHASE_CFG[p.status];
          return (
            <div
              key={p.name}
              title={`${p.name}: ${p.status}${p.looping ? " (design⇄reflect loop)" : ""}`}
              style={{
                flex: 1,
                padding: "7px 6px",
                borderRadius: 7,
                background: cfg.bg,
                border: `2px solid ${p.current ? "var(--status-accent)" : cfg.border}`,
                boxShadow: p.current ? `0 0 12px var(--status-accent-glow)` : "none",
                textAlign: "center",
                position: "relative",
                animation: p.looping ? "softpulse 2s ease-in-out infinite" : undefined,
                color: p.looping ? "var(--status-accent)" : undefined,
                transition: "all 0.4s ease",
              }}
            >
              <span style={{ fontSize: "0.68rem", fontWeight: 600, color: cfg.text, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                {p.name}
              </span>
              {p.looping && p.name === "reflect" ? (
                <span style={{ position: "absolute", right: 4, top: 2, fontSize: "0.6rem", color: "var(--status-accent)" }}>↺</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BuildLane({ state, active, complete }: { state: DashboardState; active: boolean; complete?: boolean }) {
  const { testTotal, testByStatus: t, testPct, testsHistorical } = state.progress;
  const seg = (n: number, color: string, label: string) =>
    n > 0 ? <div title={`${label}: ${n}`} style={{ width: `${(n / testTotal) * 100}%`, height: "100%", background: color, transition: "width 0.5s ease" }} /> : null;

  // No honest count for this position. Rather than show current counts under a past playhead
  // — or a zeroed bar implying no tests existed — say plainly that the number isn't knowable.
  // Everything else on the board does rewind.
  //
  // Two different situations reach this, so the wording can't name just one: in LIVE mode the
  // counts come from the feature-status CLI and never rewind at all; in REPLAY they do rewind
  // (from the corpus's per-turn test-list snapshots) but only from the first snapshot onward,
  // so an early playhead genuinely predates any test list.
  if (!testsHistorical) {
    const replay = state.source?.mode === "replay";
    return (
      <div style={{ opacity: 0.75 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", marginBottom: 6, gap: 12 }}>
          <span style={{ color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
            Build
          </span>
          <span
            style={{ color: "var(--text-faint)" }}
            title={
              replay
                ? "This corpus snapshots test-list.json inside individual turns, so counts rewind — but only from the first snapshot onward. The playhead is before any test list existed."
                : "Test counts come from `lk lakebase-feature-status`, which reports only the current state. The event log doesn't record the full test list, so there is no historical count for this point in the run."
            }
          >
            {replay ? "no test list recorded yet at this point" : "test counts unavailable when scrubbed back"}
          </span>
        </div>
        <div
          style={{
            height: 12,
            borderRadius: 6,
            background: `repeating-linear-gradient(45deg, var(--surface-inset), var(--surface-inset) 5px, var(--surface-card) 5px, var(--surface-card) 10px)`,
            border: `1px dashed var(--border-default)`,
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ opacity: active || complete ? 1 : 0.55 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", marginBottom: 6 }}>
        <span style={{ color: active || complete ? "var(--text-strong)" : "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
          Build {complete ? "· run complete" : active ? "· in progress" : testTotal === 0 ? "· not started" : "· pending"}
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          {testTotal > 0 ? (
            <>
              <span style={{ color: "var(--status-critical)" }}>{t.red} red</span> · <span style={{ color: "var(--status-good)" }}>{t.green + t.refactored} green</span> · {testTotal} tests · <strong style={{ color: "var(--text-strong)" }}>{testPct}%</strong>
              {/* A finished run with tests still pending never wrote them — say so, rather
                  than leaving a half-full bar looking like work in flight. */}
              {complete && t.pending > 0 ? <span style={{ color: "var(--text-faint)" }}> · {t.pending} never written</span> : null}
            </>
          ) : "—"}
        </span>
      </div>
      <div style={{ height: 12, borderRadius: 6, background: "var(--surface-inset)", overflow: "hidden", display: "flex" }}>
        {/* order: green (done) → red (test written, failing) → pending (grey remainder) */}
        {seg(t.green + t.refactored, `linear-gradient(90deg,var(--status-good),var(--status-good-light))`, "green (code written)")}
        {seg(t.red, "var(--status-critical)", "red (test written, failing)")}
        {seg(t.skipped, "var(--text-faint)", "skipped")}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.7rem", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--text-strong)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

// Per-story lifecycle: each row is a Design → Build → Done mini-track. Design & build
// iterate per story, so this shows e.g. "S1 done · S2 building · S3 still in design".
function StoryTracks({ stories }: { stories: StoryProgress[] }) {
  return (
    <div>
      <div style={{ fontSize: "0.7rem", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, fontWeight: 700 }}>
        Stories
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {stories.map((s) => (
          <StoryRow key={s.id} s={s} />
        ))}
      </div>
    </div>
  );
}

function StoryRow({ s }: { s: StoryProgress }) {
  // three steps; each is done / current / pending / discarded
  const discarded = s.status === "discarded";
  const designState = s.stage === "design" && !s.designComplete ? "current" : "done"; // design always reached
  const buildState = s.stage === "build" ? "current" : s.stage === "done" ? "done" : s.designComplete ? "pending" : "pending";
  // A story in the done stage is FINISHED — the done step settles to static green (or gold
  // for a discard), never "current" (which pulses, misreading as still-working).
  const doneState = discarded ? "discarded" : s.stage === "done" ? "done" : "pending";
  const steps: { label: string; state: "done" | "current" | "pending" | "discarded"; note?: string | null }[] = [
    { label: "design", state: designState, note: s.designPhase ? `→ ${s.designPhase}` : null },
    { label: "build", state: buildState },
    { label: discarded ? "discarded" : "done", state: doneState },
  ];
  const stepColor = (st: string) =>
    st === "done" ? { bg: "var(--status-good-tint)", border: "var(--status-good)", text: "var(--status-good-text)" }
    : st === "discarded" ? { bg: "var(--status-discarded-tint)", border: "var(--status-discarded)", text: "var(--status-discarded-text)" }
    : st === "current" ? { bg: "var(--status-accent-tint)", border: "var(--status-accent)", text: "var(--status-accent-text)" }
    : { bg: "var(--surface-inset)", border: "var(--border-default)", text: "var(--text-faint)" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: s.stage === "done" ? 0.7 : 1 }}>
      <span style={{ width: 168, fontSize: "0.72rem", color: s.active ? "var(--text-strong)" : "var(--text-muted)", fontWeight: s.active ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {s.active ? "▸ " : ""}{s.id}
      </span>
      <div style={{ display: "flex", gap: 4, flex: 1 }}>
        {steps.map((step) => {
          const c = stepColor(step.state);
          return (
            <div
              key={step.label}
              title={`${step.label}: ${step.state}${step.note ? " " + step.note : ""}`}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "4px 6px", borderRadius: 6, background: c.bg, border: `1.5px solid ${c.border}`, animation: step.state === "current" ? "softpulse 2s ease-in-out infinite" : undefined, color: step.state === "current" ? c.border : undefined }}
            >
              <span style={{ fontSize: "0.62rem", fontWeight: 600, color: c.text, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                {step.label}{step.state === "current" && step.note ? ` ${step.note}` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Log↔corpus pairing drift. The §6 risk table promises this is surfaced rather than silently
// mis-mapped: correlation is positional and cannot detect its own failure, so an off-by-one
// shows the wrong transcript and the wrong code for every later turn of a role, with no error.
//
// Renders NOTHING when healthy — including in live mode, where `correlation` is null because
// there is no corpus to disagree with. A permanent "pairing OK" chip would train the eye to
// ignore the one place it must not.

function WaitingBanner({ waiting }: { waiting: NonNullable<DashboardState["waiting"]> }) {
  const isPerm = waiting.kind === "permission";
  const isEsc = waiting.kind === "escalation";
  // amber = Claude Code permission prompt · red = Consort escalation (failure) · purple = HITL gate
  const c = isPerm
    ? { border: "var(--status-warning)", bgA: "var(--status-warning-tint)", bgB: "var(--status-warning-tint-faint)", head: "var(--status-warning-text)", chipBorder: "var(--status-warning-soft)", chipText: "var(--status-warning-text-deep)" }
    : isEsc
    ? { border: "var(--status-critical)", bgA: "var(--status-critical-tint)", bgB: "var(--status-critical-tint-faint)", head: "var(--status-critical-text-deep)", chipBorder: "var(--status-critical-soft)", chipText: "var(--status-critical-text-deep)" }
    : { border: "var(--status-gate)", bgA: "var(--status-gate-tint)", bgB: "var(--status-gate-tint-faint)", head: "var(--status-gate-text)", chipBorder: "var(--status-gate-soft)", chipText: "var(--status-gate-text-deep)" };
  // A session (a Consort role, or a human/proxy auto-resolving the escalation) is writing
  // its transcript right now → an agent is actively working this, not idle-waiting on you.
  const active = !isPerm && waiting.sessionActive === true;
  const headline = isPerm
    ? "⚠ Permission required in the Consort terminal"
    : isEsc
    ? active
      ? `⚠ Escalation · being worked on${waiting.role ? ` · raised by ${waiting.role}` : ""}`
      : `⚠ Consort escalated to you${waiting.role ? ` · raised by ${waiting.role}` : ""}`
    : active
    ? `⏸ Paused · being worked on${waiting.gate ? ` · ${waiting.gate} gate` : ""}${waiting.role ? ` · surfaced by ${waiting.role}` : ""}`
    : `⏸ Consort is waiting on you${waiting.gate ? ` · ${waiting.gate} gate` : ""}${waiting.role ? ` · surfaced by ${waiting.role}` : ""}`;
  return (
    <div style={{ background: `linear-gradient(90deg, ${c.bgA}, ${c.bgB})`, border: `2px solid ${c.border}`, borderRadius: radius.card, padding: "14px 18px", marginBottom: 16, animation: "softpulse 2.2s ease-in-out infinite", color: c.border }}>
      <div style={{ fontWeight: 800, fontSize: "0.85rem", color: c.head, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {headline}
      </div>
      <div style={{ fontSize: "0.9rem", color: "var(--text-body)", marginTop: 5 }}>{waiting.prompt}</div>
      {!isPerm && waiting.sessionActive !== undefined ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: "0.76rem", color: active ? "var(--status-good-text)" : "var(--text-muted)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: active ? "var(--status-good)" : "var(--text-faint)", animation: active ? "softpulse 1.2s ease-in-out infinite" : undefined }} />
          {active
            ? "A session is actively working on this now — no action needed unless it stalls."
            : `Idle — waiting on you${waiting.sessionActiveAgeSec != null ? ` · no session activity for ${waiting.sessionActiveAgeSec}s` : ""}.`}
        </div>
      ) : null}
      {isPerm && waiting.permission ? (
        <div style={{ marginTop: 10 }}>
          {waiting.permission.description ? (
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 4 }}>{waiting.permission.description}</div>
          ) : null}
          {waiting.permission.command ? (
            <code style={{ display: "block", fontFamily: font.mono, fontSize: "0.74rem", background: "var(--surface-code)", color: "var(--status-warning-soft)", padding: "8px 10px", borderRadius: 8, overflowX: "auto", whiteSpace: "nowrap" }}>
              $ {waiting.permission.command}
            </code>
          ) : null}
        </div>
      ) : null}
      {waiting.options.length > 0 ? (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {waiting.options.map((o) => (
            <span key={o.id} style={{ fontSize: "0.75rem", padding: "4px 10px", borderRadius: 8, background: "var(--surface-card)", border: `1px solid ${c.chipBorder}`, color: c.chipText }}>{o.title}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Blockers({ state }: { state: DashboardState }) {
  return (
    <div style={{ marginTop: 18 }}>
      <SectionTitle>Open issues → resolver</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {state.blockers.map((b, i) => (
          <div key={i} style={{ background: "var(--surface-card)", border: `1px solid var(--status-critical-soft)`, borderLeft: `4px solid var(--status-critical)`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--status-critical)", textTransform: "uppercase" }}>{b.source}</span>
              {b.story ? <span style={{ fontSize: "0.68rem", color: "var(--text-faint)" }}>{b.story}</span> : null}
              {b.resolverRole ? (
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginLeft: "auto" }}>
                  → fix by <strong style={{ color: "var(--status-critical-text)", textTransform: "uppercase" }}>{b.resolverRole}</strong>
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-body)", marginTop: 6, lineHeight: 1.4 }}>{truncate(b.reason, 320)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}



function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: "0.72rem", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{children}</div>;
}

// Top-level section label: Status / Current State / Event Stream.
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ margin: "24px 0 10px", fontSize: "0.82rem", fontWeight: 800, color: "var(--text-heading)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
      {children}
    </h2>
  );
}

// `message`, not `text` — the latter would shadow the imported theme token.
function Placeholder({ message, error }: { message: string; error?: boolean }) {
  return (
    <div style={{ background: "var(--surface-card)", border: `1px solid ${error ? "var(--status-critical-soft)" : "var(--border-default)"}`, borderRadius: radius.card, padding: "40px 24px", textAlign: "center", color: error ? "var(--status-critical-text)" : "var(--text-muted)", fontSize: "0.9rem" }}>
      {message}
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
