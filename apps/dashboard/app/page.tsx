"use client";

import { useEffect, useState } from "react";
import { usePolledState } from "./usePolledState";
import { Transport } from "./Transport";
import { WorkflowGraph } from "./WorkflowGraph";
import { LaneGraph } from "./LaneGraph";
import { DrilldownPanel, type DrilldownTarget } from "./DrilldownPanel";
import { BacklogPanel } from "./BacklogPanel";
import { FeatureStatusSection } from "./FeatureStatusSection";
import { OrchestratorLane } from "./OrchestratorLane";
import { DriftBanner, LogPane, SidePane, modeFromUrl } from "./board-parts";
import { useTheme } from "./useTheme";
import type { DashboardState } from "@/lib/types";
import { colorForRole, font, radius } from "@/lib/theme";
import { latestTurnOrdinalForRole } from "@/lib/derive";
import { latestTurnOrdinalForStep } from "@/lib/topology";

// The usage UNIT shown for the run's compute: token counts (default) or dollar cost. Toggled by
// the header "usage:" control; drives both the run-vitals metric and the per-agent contribution bar.
type CostMode = "tokens" | "cost";

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
  const [costMode, setCostMode] = useState<CostMode>("tokens");
  // The ONE open drill-down, if any. Null = closed. A tagged union over the three things a click
  // can open — a recorded turn (transcript + files), a live artifact (one file at HEAD), or a
  // lifecycle step's deliverables — so there is one open-state and one panel instead of three. All
  // are mutually exclusive now: opening any closes the others, which is the "one surface" the merge
  // was missing (before, a step panel and a turn panel could be open at once, in two places).
  const [drilldown, setDrilldown] = useState<DrilldownTarget | null>(null);
  // The drawer is ALWAYS mounted (offscreen when closed) so it can slide in on transform, matching
  // the reference dashboard's `#panel` → `.open`. `shownTarget` trails `drilldown` so the panel's
  // content stays rendered THROUGH the slide-out animation instead of vanishing the instant it's
  // closed — it only clears when a new target replaces it.
  const [shownTarget, setShownTarget] = useState<DrilldownTarget | null>(null);
  useEffect(() => {
    if (drilldown) setShownTarget(drilldown);
  }, [drilldown]);
  // The event-log pane (right side) is collapsible: open = shares space with the board (the main
  // column flexes narrower), collapsed = a slim rail so the board reclaims the width. Never an
  // overlay — it's a flex sibling of the board, not a floating layer.
  const [logOpen, setLogOpen] = useState(true);
  // The planning backlog is the LEFT-side collapsible pull-out (mirrors the event log on the right).
  // Default collapsed — it's reference material you pull out when planning, not always-on like the log.
  const [backlogOpen, setBacklogOpen] = useState(false);
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
  // recentTurns pairings, empty at many playheads, so the precise rule would sometimes hide a
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
  // Opening a lane STEP's drill-down: the LATEST turn credited to THAT step within the scrubber
  // window (a role spans several steps — navigator does red/review/assess/reflect — so this opens
  // the step you clicked, not the role's latest turn overall). Resolvable within RECENT_EVENT_TAIL.
  // When the step owns no turn in the window — an EARLY step viewed from a late playhead, e.g. the
  // product-owner's intake/author-requests turns (ordinals 0/3/13) seen from the live edge, well
  // outside the tail — fall back to the role's latest turn (latestTurnByRole is whole-corpus, so it
  // still finds it). For a single-purpose role like the product-owner that IS the step's turn; only
  // a multi-step role clicked far out of window can land on a sibling step, which still beats a
  // blank shell. Last resort is the ROLE shell (its lifecycle-step deliverables).
  const onOpenRole = (role: string, stepId: string) => {
    if (!state) return;
    const recentTurns = state.source?.correlation?.recentTurns ?? [];
    const ord =
      latestTurnOrdinalForStep(state.recentEvents, recentTurns, stepId) ??
      state.source?.correlation?.latestTurnByRole?.[role] ??
      latestTurnOrdinalForRole(state.recentEvents, recentTurns, role);
    const target: DrilldownTarget = ord != null && canDrillDown ? { kind: "turn", ord } : { kind: "role", role };
    // TOGGLE, mirroring the workflow-graph nodes: clicking the SAME card whose panel is already open
    // slides it back out. Same target = the same turn ordinal, or the same role's shell.
    setDrilldown((cur) => {
      const same =
        cur != null &&
        ((target.kind === "turn" && cur.kind === "turn" && cur.ord === target.ord) ||
          (target.kind === "role" && cur.kind === "role" && cur.role === target.role));
      return same ? null : target;
    });
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--surface-page)", padding: "24px 28px 96px", fontFamily: font.sans }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes softpulse { 0%,100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); } 50% { box-shadow: 0 0 18px 2px currentColor; opacity: 0.92; } }
        /* A pure-opacity flash for the active lane-header dot — box-shadow glows get clipped by the
           lane card's overflow:hidden, but opacity is never clipped, so the light actually blinks. */
        @keyframes lightflash { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
        /* SVG elements ignore box-shadow, so the lane-step cards pulse via an animatable drop-shadow
           (glows in currentColor). Stacked drop-shadows at the peak make the glow read strongly; it
           is the ONLY cue for the active step, so it must be unmistakable. Visible on SVG. */
        @keyframes glowpulse {
          0%,100% { filter: drop-shadow(0 0 1px currentColor); }
          50% { filter: drop-shadow(0 0 3px currentColor) drop-shadow(0 0 5px currentColor); }
        }
      `}</style>

      <Header
        state={state}
        connected={connected}
        lastUpdatedAt={lastUpdatedAt}
        costMode={costMode}
        setCostMode={setCostMode}
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
          {/* Three-column flex row: the planning-backlog pull-out (left), the board (centre, flex:1),
              and the event-log pane (right). Both side panes are collapsible flex siblings — never
              overlays — so opening either makes the board share horizontal space. `stretch` runs
              each pane the full length of the board column. */}
          <div style={{ display: "flex", alignItems: "stretch" }}>
            {canShowBacklog ? (
              <SidePane side="left" title="Backlog · planning · status" open={backlogOpen} onToggle={() => setBacklogOpen((o) => !o)}>
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 18 }}>
                  <BacklogPanel mode={state.source?.mode ?? null} />
                  {/* Status rollup — folded board state (features + their stories), separated from the
                      static planning sections above by a divider. Also the feature SELECTOR: pin the
                      board to a feature (or follow the run) from here — moved off the header. */}
                  <div style={{ borderTop: `1px solid var(--border-default)`, paddingTop: 16 }}>
                    <FeatureStatusSection state={state} pinned={pinned} onPin={setPinned} />
                  </div>
                </div>
              </SidePane>
            ) : null}
            <div style={{ flex: 1, minWidth: 0 }}>
          {state.waiting ? <WaitingBanner waiting={state.waiting} /> : null}
          <DriftBanner correlation={state.source?.correlation ?? null} />
          {/* The scrum-master / orchestrator coordination status — its latest dispatch + recent gate
              activity — replacing the old fidelity ("not recording") banner. */}
          {/* Two-card row in a fixed 2-column space: the orchestrator (left) and the run vitals —
              active tests + completed stories + turns (right). Grid stretch keeps both cards level. */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)", gap: 12, marginBottom: 12 }}>
            <OrchestratorLane state={state} />
            <div style={{ background: "var(--surface-card)", borderRadius: radius.card, padding: "16px 20px", border: `1px solid var(--border-default)`, display: "flex", flexDirection: "column", gap: 16, justifyContent: "center", containerType: "inline-size", minWidth: 0 }}>
              {/* Active tests (red vs green) — the run's live test health. */}
              <BuildLane state={state} active={state.lane === "build"} complete={state.lane === "complete"} />
              {/* Completed · Turns · Tokens vitals. The row wraps + each metric shrinks (minWidth:0),
                  and the fonts are container-reactive (cqi off the card above) so they never spill out
                  of the card when the window narrows. */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(8px, 2cqi, 28px)", borderTop: `1px solid var(--border-default)`, paddingTop: 12, minWidth: 0 }}>
                <Metric label="Completed" value={`${state.progress.storiesDone}/${state.progress.storiesTotal}`} />
                <Metric label="Turns" value={`${state.agents.reduce((sum, a) => sum + a.turns, 0)}`} />
                {/* Compute usage next to turns: token count (default) or $ cost, per the usage toggle. */}
                <Metric label={costMode === "cost" ? "Cost" : "Tokens"} value={costMode === "cost" ? `$${state.totalCost.toFixed(2)}` : fmtTokens(state.totalTokens)} />
              </div>
            </div>
          </div>

          {/* Per-agent contribution bar — tokens (default) or $ cost, matching the usage toggle. */}
          <div style={{ background: "var(--surface-card)", border: `1px solid var(--border-default)`, borderRadius: radius.card, padding: "12px 16px", marginBottom: 12 }}>
            <CostBar state={state} mode={costMode} />
          </div>

          <SectionHeader>Current sprint</SectionHeader>
          {/* The lifecycle graph now carries the sprint's feature + current state in its own header
              band (see WorkflowGraph), mirroring the lane panels below. */}
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

          <SectionHeader>Lanes</SectionHeader>
          <LaneGraph state={state} onOpenRole={onOpenRole} />

          {/* Planning / backlog moved to the LEFT-side pull-out pane (see the flex row above). */}
          {/* The "Current State" role-card grid was removed: the lanes + lifecycle graph already show
              each role's activity, and a role's turn opens from the lane's role-bearing steps. */}
          {/* The bottom "Open issues" section was removed as redundant with the Orchestrator status
              card, which now folds the top blocker's source/reason/resolver in on an escalation. */}
            </div>

            {/* The event log lives here now: a collapsible right-side pane that SHARES space with
                the board (the main column above flexes narrower when it's open) rather than sitting
                as an overlay — the reference's `#logpane`. Collapsed, it's a slim rail and the board
                reclaims the width. */}
            <LogPane
              state={state}
              open={logOpen}
              onToggle={() => setLogOpen((o) => !o)}
              onOpenTurn={canDrillDown ? (ord) => setDrilldown({ kind: "turn", ord }) : undefined}
              onOpenArtifact={canOpenArtifact ? (path) => setDrilldown({ kind: "artifact", path }) : undefined}
            />
          </div>
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
          {/* A FIXED, full-height right-edge drawer that SLIDES in — flush to the top/right, ending
              just above the play band — exactly like the reference dashboard's `#panel`. It's always
              mounted and parked offscreen at translateX(105%) (105% so its own left shadow is hidden
              too); opening a target animates it to translateX(0) over .28s. z-index over the board;
              the left shadow lifts it off the content it overlays. The ✕ (and any scrub, per scrubTo)
              closes it, sliding it back out. `shownTarget` keeps the content up through the slide-out. */}
          <div
            aria-hidden={drilldown === null}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 72,
              zIndex: 60,
              width: "min(760px, 64vw)",
              background: "var(--surface-panel)",
              borderLeft: "1px solid var(--border-default)",
              boxShadow: "-12px 0 40px rgba(0,0,0,0.35)",
              transform: drilldown ? "translateX(0)" : "translateX(105%)",
              transition: "transform 0.28s ease",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {shownTarget ? (
              <DrilldownPanel
                target={shownTarget}
                mode={state.source?.mode ?? null}
                feature={state.feature ?? null}
                onClose={() => setDrilldown(null)}
              />
            ) : null}
          </div>

          {/* The play band: an always-on transport pinned to the bottom of the page, full width,
              like the reference dashboard. Scrub + playback stay reachable no matter how far the
              board is scrolled; `<main>` carries matching bottom padding so nothing hides behind it. */}
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 40,
              background: "var(--surface-card)",
              borderTop: "1px solid var(--border-default)",
              padding: "8px 28px",
              boxShadow: "0 -4px 20px rgba(0,0,0,0.10)",
            }}
          >
            <Transport
              at={at}
              total={state.totalEventCount}
              onChange={scrubTo}
              playing={playing}
              onPlayingChange={setPlaying}
              speed={speed}
              onSpeedChange={setSpeed}
              atTimestamp={state.topology.atTimestamp}
              awaitingGate={state.focus.kind === "gate"}
              escalated={state.focus.kind === "escalation"}
              replay={state.source?.mode === "replay"}
            />
          </div>
        </>
      )}
    </main>
  );
}

function Header({ state, connected, lastUpdatedAt, costMode, setCostMode, onMode }: { state: DashboardState | null; connected: boolean; lastUpdatedAt: number | null; costMode: CostMode; setCostMode: (m: CostMode) => void; onMode: (m: "live" | "replay") => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "var(--text-strong)" }}>Consort · Agent Delivery Radiator</h1>
        {/* No run loaded → no subtitle at all. The top-right feed dot already carries the
            connecting/running state, so a placeholder line here would just repeat it (and the old
            "waiting for a run…" wrongly read as a human-wait). It appears once a feature is known. */}
        {state?.feature ? (
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
            {/* Project name (basename of the watched dir) leads the subtitle, then the feature. */}
            {(() => {
              const proj = state.projectDir ? state.projectDir.replace(/\/+$/, "").split("/").pop() : null;
              return proj ? <><strong>{proj}</strong>{" · "}</> : null;
            })()}
            <strong>{state.feature}</strong> · phase: {state.phase ?? "—"}
            {/* Only a LIVE run at its newest event is "live"; a recorded run is never live (you're
                reviewing it), so it always reads "viewing event N of M". */}
            {state.atLive && state.source?.mode === "live" ? (
              <>
                {` · viewing event ${state.atEventIndex} · `}
                <span style={{ color: "var(--status-good)", fontWeight: 700 }}>live</span>
              </>
            ) : (
              ` · viewing event ${state.atEventIndex} of ${state.totalEventCount}`
            )}
            {/* A divergent pin means the board is FILTERED to a feature the run has moved past.
                Say so, in the run's own terms, so it can't be mistaken for a rewind — the
                playhead is still where the transport shows it. */}
            {state.pinnedFeature && state.features.find((f) => f.active) ? (
              <span style={{ color: "var(--text-faint)" }}>
                {" "}
                · run is on <strong>{state.features.find((f) => f.active)!.id}</strong>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* Feature selection moved to the left-pane Status section (FeatureStatusSection). */}
        {/* Source mode. A switch when the environment offers both live and a readable corpus,
            otherwise a plain badge — a control that can only be pressed one way is noise. The
            warning tint carries `note`, which is how a misconfigured CONSORT_CORPUS_DIR
            becomes visible instead of silently removing the replay option. */}
        {state?.source ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem" }}>
          <span style={{ color: "var(--text-faint)" }}>event source:</span>
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
            {/* The CURRENT event source only — a status, not a switcher. Showing the other mode (e.g.
                "LIVE" on a recorded run) read as an offer to switch and was misleading. Flashing dot:
                  LIVE (green) — a live run · RECORDING (red) — live + explicit record dir, in progress
                  · RECORDED (amber) — replaying a recorded corpus. */}
            {(() => {
              const m = state.source.mode;
              const recording = m === "live" && state.source.fidelity?.explicit === true && state.lane !== "complete";
              const label = m === "replay" ? "RECORDED" : recording ? "RECORDING" : "LIVE";
              const dotColor = m === "replay" ? "var(--status-warning)" : recording ? "var(--status-critical)" : "var(--status-good)";
              return (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-strong)", background: "var(--surface-card)", borderRadius: radius.chip, padding: "2px 7px" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, animation: "softpulse 1.6s ease-in-out infinite", flex: "none" }} />
                  {label}
                </span>
              );
            })()}
            {state.source.note ? <span style={{ fontSize: "0.66rem", padding: "2px 4px" }}>⚠</span> : null}
          </span>
          </div>
        ) : null}
        {/* Feed health, meaningful only for a live run. In replay there is no feed to be stale, so
            the source toggle (REPLAY) is the honest signal and this dot is hidden. */}
        {state?.source?.mode === "replay" ? null : <ConnectionStatus connected={connected} lastUpdatedAt={lastUpdatedAt} />}
        {/* "usage:" toggle — the unit for the run's compute: token counts (default) or $ cost. Click
            flips it; "cost" is the inverted (filled) state — text-strong bg / surface-card text so it
            holds in both themes. minWidth stops it jiggling as the word changes. */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.72rem" }}>
          <span style={{ color: "var(--text-faint)" }}>usage:</span>
          <button
            onClick={() => setCostMode(costMode === "cost" ? "tokens" : "cost")}
            title={costMode === "cost" ? "Showing $ cost — click for token counts" : "Showing token counts — click for $ cost"}
            style={{
              border: `1px solid var(--border-default)`,
              background: costMode === "cost" ? "var(--text-strong)" : "var(--surface-card)",
              color: costMode === "cost" ? "var(--surface-card)" : "var(--text-muted)",
              borderRadius: 6,
              padding: "3px 8px",
              fontSize: "0.7rem",
              cursor: "pointer",
              minWidth: 52,
            }}
          >
            {costMode === "cost" ? "cost" : "tokens"}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.72rem" }}>
          <span style={{ color: "var(--text-faint)" }}>mode:</span>
          <ThemeToggle />
        </div>
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
  const label = theme === null ? "Toggle theme" : dark ? "Dark mode — switch to light" : "Light mode — switch to dark";
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
      {/* Glyph shows the CURRENT mode (not the target action): moon = dark, sun = light. ◐ until
          mounted. The tooltip still says what a click does. */}
      {theme === null ? "◐" : dark ? "☾" : "☀"}
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
  // Feed/connection health, NOT the run's state: is the board polling + getting fresh updates.
  // A muted "feed" caption names WHAT this measures (was a bare "connected"/"running", which read
  // as the run's state — and "running" collided with the transport's RUNNING label); the colored
  // status word then reads as the feed's health: healthy / no update · Ns / reconnecting.
  const status = !connected ? "reconnecting" : stale ? `no update · ${ageSec}s` : "healthy";
  // The colored status word carries the health, so the healthy state needs NO dot — a green dot
  // here just doubled the LIVE RUN badge's own green dot on the same row. Show a dot ONLY as an
  // alarm (stale/reconnecting), pulsing, so a frozen board still announces itself.
  const alarm = !connected || stale;
  return (
    <div
      title={lastUpdatedAt === null ? "waiting for first update" : `last update ${ageSec}s ago`}
      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem" }}
    >
      {alarm ? (
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
      ) : null}
      <span style={{ color: "var(--text-faint)" }}>feed:</span>
      <span style={{ color, fontWeight: 600 }}>{status}</span>
    </div>
  );
}

// The sprint/feature selector moved to the left-pane Status section — see FeatureStatusSection,
// which lists the run's features and pins the board to one (a FILTER, not a seek). It lives there so
// selection is reachable in every mode + right where the features are shown, instead of the header.

// Compact token count: 1_234_567 → "1.2M", 69_000 → "69k", 420 → "420".
function fmtTokens(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

function CostBar({ state, mode }: { state: DashboardState; mode: CostMode }) {
  // One value function drives the bar + legend in whichever unit is selected.
  const val = (a: DashboardState["agents"][number]) => (mode === "cost" ? a.cost : a.tokens);
  const fmt = (n: number) => (mode === "cost" ? `$${n.toFixed(2)}` : fmtTokens(n));
  const total = mode === "cost" ? state.totalCost : state.totalTokens;
  const contributors = state.agents.filter((a) => val(a) > 0).sort((a, b) => val(b) - val(a));
  return (
    <div>
      {/* Title on the LEFT (was a right-aligned caption); the total moved to the run-vitals card. */}
      <div style={{ fontSize: "0.7rem", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        relative contribution by agent
      </div>
      <div style={{ display: "flex", height: 12, borderRadius: 6, background: "var(--surface-inset)", overflow: "hidden" }}>
        {total === 0
          ? null
          : contributors.map((a) => (
              <div
                key={a.role}
                title={`${a.role}: ${fmt(val(a))} (${Math.round((val(a) / total) * 100)}%)`}
                style={{ width: `${(val(a) / total) * 100}%`, height: "100%", background: colorForRole(a.role), transition: "width 0.5s ease" }}
              />
            ))}
      </div>
      {/* compact legend for the top contributors */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 6 }}>
        {contributors.map((a) => (
          <span key={a.role} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.64rem", color: "var(--text-muted)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: colorForRole(a.role) }} />
            {a.role} {fmt(val(a))}
          </span>
        ))}
      </div>
    </div>
  );
}

function BuildLane({ state, active, complete }: { state: DashboardState; active: boolean; complete?: boolean }) {
  const { testTotal, testByStatus: t, testPct, testsHistorical, testsUnavailable } = state.progress;
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
    // Why the counts can't be shown here: a replay before its first snapshot; else (live) the view
    // isn't at the live edge — either scrubbed back, or PINNED to a past feature (whose per-feature
    // historical count the snapshot can't supply). Name the actual reason so it isn't mistaken.
    const reason = replay
      ? "no test list recorded yet at this point"
      : state.pinnedFeature
        ? "test counts unavailable while pinned to a past feature"
        : "test counts unavailable when scrubbed back";
    return (
      <div style={{ opacity: 0.75 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", marginBottom: 6, gap: 12 }}>
          <span style={{ color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
            Tests
          </span>
          <span
            style={{ color: "var(--text-faint)" }}
            title={
              replay
                ? "This corpus snapshots test-list.json inside individual turns, so counts rewind — but only from the first snapshot onward. The playhead is before any test list existed."
                : state.pinnedFeature
                  ? "The test counts come from a single snapshot of the run's active feature, not per-feature — so they can't be shown for a pinned past feature. Follow the run (clear the pin) to see them."
                  : "Test counts come from `lk lakebase-feature-status`, which reports only the current state. The event log doesn't record the full test list, so there is no historical count for this point in the run."
            }
          >
            {reason}
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

  // The view CAN show counts (live edge / historical snapshot, no divergent pin) but the source gave
  // none: live, the feature-status CLI (`./scripts/lk lakebase-feature-status`) hasn't answered or
  // errored — say so, rather than an empty bar that looks like a zero-test feature.
  if (testsUnavailable) {
    const replay = state.source?.mode === "replay";
    return (
      <div style={{ opacity: 0.85 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", marginBottom: 6, gap: 12 }}>
          <span style={{ color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
            Tests
          </span>
          <span
            style={{ color: "var(--status-warning-text)" }}
            title={
              replay
                ? "The recorded snapshot at this point carries no test-list."
                : "No test list from the feature-status CLI. `./scripts/lk lakebase-feature-status <feature> --json` (run from the watched project dir) returned nothing — it may be missing, not authenticated to Lakebase, still starting up, or the feature has no test list yet. The event log alone can't supply the counts."
            }
          >
            {replay ? "no test list in this snapshot" : "unavailable — feature-status not responding"}
          </span>
        </div>
        <div
          style={{
            height: 12,
            borderRadius: 6,
            background: `repeating-linear-gradient(45deg, var(--status-warning-tint), var(--status-warning-tint) 5px, var(--surface-card) 5px, var(--surface-card) 10px)`,
            border: `1px dashed var(--status-warning-soft)`,
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ opacity: active || complete ? 1 : 0.55 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", marginBottom: 6 }}>
        {/* No run-state suffix (· run complete / · in progress): the run's state is already on the
            orchestrator card + the Current-sprint graph. This bar's value is the CURRENT red/green
            test health, so it just labels itself. */}
        <span style={{ color: active || complete ? "var(--text-strong)" : "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
          Tests
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
    <div style={{ flex: "1 1 auto", minWidth: 0 }}>
      <div style={{ fontSize: "clamp(0.55rem, 2cqi, 0.7rem)", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontSize: "clamp(0.85rem, 6cqi, 1.3rem)", fontWeight: 800, color: "var(--text-strong)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</div>
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

// A compact one-liner under the sprint header: WHERE the run is right now. It surfaces the active
// feature and, when a story is being worked, that story (emphasized). With no active story — still
// designing/planning the feature — it falls back to the feature + coarse phase, so the line is
// never empty while a feature is in flight, and renders nothing at all before the first feature.
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

