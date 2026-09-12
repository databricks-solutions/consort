/**
 * Appearance-equivalence harness for the token refactor (Phase 1 item 6).
 *
 * The plan calls that refactor "a refactor of plumbing, not of appearance". lib/theme.test.ts
 * pins each token to the literal it replaced, but that alone can't prove the right token
 * reached the right element — mapping `#111827` to `text.strong` is correct for a heading and
 * wrong for the ticker's background, and both compile.
 *
 * So render the real components against a real captured DashboardState and snapshot the
 * resulting markup, inline styles included. Regenerated from `main` before the refactor, the
 * snapshot is byte-identical after it — which is the actual claim being made.
 *
 * page.tsx is a client component whose board never renders server-side (the SSR output is
 * just a loading shell), so this bypasses the polling hook and renders the exported pieces
 * directly against fixed data. Date.now() is pinned because the lane step cards show elapsed time.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WorkflowGraph } from "./WorkflowGraph";
import { Transport } from "./Transport";
import { LaneGraph } from "./LaneGraph";
import { DrilldownPanel, TranscriptView, turnMetaFields, turnUrl, type TurnPayload } from "./DrilldownPanel";
import { DriftBanner, EventTicker, FidelityBanner, modeFromUrl } from "./board-parts";
import { FeatureStatusSection } from "./FeatureStatusSection";
import type { DashboardState, StoryProgress } from "@/lib/types";
import { focusOf } from "@/lib/reducer";

// Fixtures predate the `focus` field; derive it the same way the fold does so components that read
// state.focus work, and so a test that overrides topology gets a focus matching that override.
const withFocus = (s: DashboardState): DashboardState => ({ ...s, focus: focusOf(s) });

const fixture = (name: string): DashboardState =>
  withFocus(JSON.parse(readFileSync(join(__dirname, "..", "lib", "__fixtures__", name), "utf8")));

// React escapes &, <, > in text nodes; renderToStaticMarkup emits the escaped form. Mirror that so
// a `toContain` on raw corpus text stays correct if the text ever carries an HTML-special char.
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const state = fixture("render-state.json");
// The same run pinned at event 40 — atLive false, so snapshot-fenced panels must differ.
const scrubbed = fixture("render-state-scrubbed.json");

// The active lane step card renders elapsed from Date.now() - turnStartTs; pin it so the markup is
// deterministic. Chosen well after the fixture's timestamps so elapsed values are stable.
const FIXED_NOW = Date.parse("2026-08-05T00:00:00.000Z");

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Item 5: the topology graph and transport. These have no pre-refactor baseline — they're
// new — so the snapshots pin them going forward rather than proving equivalence.

describe("render — WorkflowGraph", () => {
  it("renders the finished run: nodes reached, nothing active", () => {
    // The real log ends with phase.end, so a completed run must show no active node.
    expect(state.topology.activeNode).toBeNull();
    expect(renderToStaticMarkup(<WorkflowGraph state={state} />)).toMatchSnapshot();
  });

  it("renders the same run scrubbed back to event 40, with design active", () => {
    expect(scrubbed.topology.activeNode).toBe("design");
    expect(renderToStaticMarkup(<WorkflowGraph state={scrubbed} />)).toMatchSnapshot();
  });

  it("lights the active node differently from a merely-reached one", () => {
    const markup = renderToStaticMarkup(<WorkflowGraph state={scrubbed} />);
    // the active node gets the accent + a 3px stroke; reached nodes get green at 1.5px
    expect(markup).toContain("active now");
    expect(markup).toContain("stroke-width=\"3\"");
    expect(markup).toContain("· reached");
    expect(markup).toContain("· not reached");
  });

  it("highlights the awaited gate diamond in the gate colour when parked at a gate", () => {
    // Parked at the intake gate: the phase node beside it AND the gate diamond itself both glow in
    // the gate colour (status-gate). The diamond (gateForNode intakegate = intake) reads "active now"
    // at a 3px stroke, not merely the thin surfaced border.
    const parked: DashboardState = {
      ...state,
      blockers: [],
      focus: { kind: "gate", gate: "intake" },
      topology: { ...state.topology, activeNode: "intake" },
    };
    const markup = renderToStaticMarkup(<WorkflowGraph state={parked} />);
    expect(markup).toMatch(/intake gate · gate[^<]*· active now/); // the diamond is active, not just reached
    expect(markup).toContain("var(--status-gate)"); // highlighted in the gate colour
    expect(markup).toContain("stroke-width=\"3\""); // active-strength stroke
  });

  it("marks gates as diamonds, not phases", () => {
    // A human decision point must never read as just another phase node.
    const markup = renderToStaticMarkup(<WorkflowGraph state={state} />);
    expect((markup.match(/<polygon/g) ?? []).length).toBe(6); // intake/plan/spec/acceptance/deploy/promote gates
  });

  it("lights the PHASE node feeding the awaited gate (deploy gate → the Deploy / release-engineer node)", () => {
    // At the deploy gate with NO active phase, the Deploy phase node must STILL glow purple because it
    // feeds the awaited gate — so the agent whose work is under review (release-engineer) reads as
    // parked, not only the gate diamond. activeNode:null proves this is the feed-the-gate logic, not
    // an independently-active phase.
    const parked: DashboardState = {
      ...state,
      blockers: [],
      focus: { kind: "gate", gate: "deploy" },
      topology: { ...state.topology, activeNode: null },
    };
    const markup = renderToStaticMarkup(<WorkflowGraph state={parked} />);
    expect(markup).toMatch(/Deploy · active now · release-engineer/); // the Deploy PHASE node (roles present), not just the diamond
    expect(markup).toContain("var(--status-gate)"); // in the gate colour
  });
});

// The terminal Shipped node maps to no phase, so it is inert in the fold; WorkflowGraph lights it as
// the merge's destination. `state` (render-state.json) has reached promote (passedNodes ⊇ promote).
describe("render — WorkflowGraph shipped terminal", () => {
  // Shipped is the last node, so its <g> runs from the "<g" before its title to the SVG end.
  const shippedGroup = (m: string): string => m.slice(m.lastIndexOf("<g", m.indexOf("<title>Shipped")));

  it("merging → Shipped lights in the merge agent's (release-engineer) colour; Promote reads reached", () => {
    const merging: DashboardState = {
      ...state,
      blockers: [],
      focus: { kind: "step", lane: "deploy", step: "dp-merge" },
      topology: { ...state.topology, activeNode: "promote" },
    };
    const g = shippedGroup(renderToStaticMarkup(<WorkflowGraph state={merging} />));
    expect(g).toContain("Shipped · active now");
    expect(g).toContain("var(--role-release-engineer)"); // the merge agent's colour
    expect(g).toContain("animation:softpulse"); // in-progress → pulses
    // the merge advanced the active node off Promote onto Shipped, so Promote now reads reached
    expect(renderToStaticMarkup(<WorkflowGraph state={merging} />)).toContain("<title>Promote · reached · release-engineer</title>");
  });

  it("shipped/done → Shipped stays lit STEADILY in the orchestrator slate (no pulse)", () => {
    const done: DashboardState = {
      ...state,
      blockers: [],
      focus: { kind: "idle" },
      topology: { ...state.topology, activeNode: null },
    };
    const g = shippedGroup(renderToStaticMarkup(<WorkflowGraph state={done} />));
    expect(g).toContain("Shipped · shipped"); // titled shipped, not "active now"
    expect(g).toContain("var(--role-orchestrator)"); // orchestrator slate
    expect(g).not.toContain("animation:softpulse"); // at rest — the run is done, no pulse
  });

  it("ship-stage escalation → Shipped turns red and pulses", () => {
    const issue: DashboardState = {
      ...state,
      blockers: [{ source: "promote", reason: "merge conflict", story: null, resolverRole: null, resolverHint: null }],
      focus: { kind: "escalation", step: "dp-promote-hil" },
      topology: { ...state.topology, activeNode: "promote" },
    };
    const g = shippedGroup(renderToStaticMarkup(<WorkflowGraph state={issue} />));
    expect(g).toContain("Shipped · active now");
    expect(g).toContain("var(--status-critical)"); // red
    expect(g).toContain("animation:softpulse");
  });
});

// ---------------------------------------------------------------------------
// LaneGraph: the per-lane sub-workflows (Kevin's Figure 2). New, so these snapshots pin
// behavior going forward rather than proving equivalence with anything.

// A single lane's header markup, so an assertion about one lane can't be satisfied by
// another lane's text. Slices from this lane's uppercase name label to the next panel.
function laneHeader(markup: string, laneId: string): string {
  // Combined lanes render a split heading, not the bare lane id: plan -> "intake / plan",
  // deploy -> "deploy / promote". Match the rendered heading text for those.
  const heading = laneId === "plan" ? "intake / plan" : laneId === "deploy" ? "deploy / promote" : laneId;
  const start = markup.indexOf(`>${heading}<`);
  if (start === -1) throw new Error(`lane ${laneId} not rendered`);
  const end = markup.indexOf("margin-left:auto", start);
  return markup.slice(start, end === -1 ? start + 400 : end);
}

const renderLane = (s: DashboardState) => <LaneGraph state={s} />;

describe("render — LaneGraph", () => {
  // Corpus-shaped states, which is where the single-feature fixtures above can't reach. All
  // three of these are real playhead positions in stockflow-rerecord (see reducer.test.ts).
  const withTopology = (over: Partial<DashboardState["topology"]>, rest: Partial<DashboardState> = {}) =>
    withFocus({ ...state, ...rest, topology: { ...state.topology, ...over } } as DashboardState);

  it("does not claim a lane is not-started when the lifecycle has passed it", () => {
    // Reported: at corpus events 20/90/230/260, passedNodes contains "plan" — the lifecycle
    // graph directly above lights Plan green — while laneSteps.plan is empty, because no plan
    // step predicate matches `breakdown` (the only plan phase attributed to a named feature
    // after the PR #13 scoping). The header read "0/3 steps · not started" under a green Plan
    // node. Two panels must not assert opposite things about the same phase.
    const markup = renderToStaticMarkup(
      renderLane(withTopology({ laneCurrent: null, passedNodes: ["intake", "plan", "design"], laneSteps: { plan: [], design: ["d-spec"], build: [] } })),
    );
    const plan = laneHeader(markup, "plan");
    expect(plan).not.toContain("not started");
    // It ran, we just can't see which steps — say so rather than denying it happened.
    expect(plan).toContain("complete");
  });

  it("never pairs a step ratio with 'complete'", () => {
    // Reported: passedNodes reaching deploy made the build lane read "1/7 steps · complete" —
    // self-contradicting. The ratio is the misleading half, not the status: steps that never
    // light (`b-perm` only on a supersession) are invisible to it, so it under-reports a lane
    // that really did finish. Sweeping "complete only when every step is lit" across every
    // prefix fold of both real logs refuted it — the corpus's SHIPPED run sits at plan 1/3,
    // live at 0/3. So the lane stays complete and the ratio goes away.
    const markup = renderToStaticMarkup(
      renderLane(
        withTopology(
          { laneCurrent: null, activeNode: null, passedNodes: ["intake", "plan", "design", "build", "deploy"], laneSteps: { plan: [], design: ["d-spec"], build: ["b-red"] } },
          { lane: "build" },
        ),
      ),
    );
    const build = laneHeader(markup, "build");
    expect(build).toContain("complete");
    expect(build).not.toContain("1/7");
    expect(build).not.toContain("steps");
  });

  it("keeps a lane in progress while the lifecycle is still inside its own node", () => {
    // The mid-flight signal is `activeNode`, not step counts: a back-edge can send the run
    // around a lane again after a later node was already reached, and only the lifecycle
    // knows. Here build has been reached and deploy passed, but the playhead is back in
    // `build` — so build must not read complete.
    const markup = renderToStaticMarkup(
      renderLane(
        withTopology(
          { laneCurrent: null, activeNode: "build", passedNodes: ["intake", "plan", "design", "build", "deploy"], laneSteps: { plan: [], design: ["d-spec"], build: ["b-red"] } },
          { lane: "build" },
        ),
      ),
    );
    const build = laneHeader(markup, "build");
    expect(build).toContain("in progress");
    expect(build).not.toContain("complete");
    // ...and while it's in progress the ratio is actionable, so it stays.
    expect(build).toContain("1/8 steps");
  });

  it("renders every lane even when laneCurrent names an unknown one", () => {
    // topology.laneCurrent.lane is typed `string`, not LaneId; an unrecognised value must not
    // mark any lane active, but ALL lanes still render (all-open, no accordion). A Phase 2 replay
    // source emitting a different vocabulary is the realistic trigger.
    const markup = renderToStaticMarkup(
      renderLane(withTopology({ laneCurrent: { lane: "nonexistent", step: "x" } })),
    );
    expect((markup.match(/<svg/g) ?? []).length).toBe(4); // all four lanes render
    // ...and no lane claims to be active on the strength of a bogus name
    expect(markup).not.toContain("· active");
  });

  it("renders all lanes expanded, with the playhead's lane marked active", () => {
    // No accordion: every lane's graph renders; the playhead's lane (design) is the one
    // highlighted active.
    expect(scrubbed.topology.laneCurrent).toEqual({ lane: "design", step: "d-spec" });
    const markup = renderToStaticMarkup(<LaneGraph state={scrubbed} />);
    expect((markup.match(/<svg/g) ?? []).length).toBe(4); // all lanes expanded
    expect(markup).toContain("· active"); // design is highlighted active
    expect(markup).toMatchSnapshot();
  });

  it("renders all lanes even when nothing is active (finished run)", () => {
    // The finished-run fixture has laneCurrent = null (the log ends on phase.end). With no
    // accordion, every lane still renders — nothing is marked active.
    expect(state.topology.laneCurrent).toBeNull();
    const markup = renderToStaticMarkup(<LaneGraph state={state} />);
    expect((markup.match(/<svg/g) ?? []).length).toBe(4); // all lanes render
    expect(markup).toContain("honest-GREEN"); // build lane content present
    expect(markup).toMatchSnapshot();
  });

  it("counts only lightable steps, so a lane can actually reach 100%", () => {
    // Gates never light from events (match: null), so they are excluded from the ratio —
    // counting them would cap design at 6/7 forever, reading as permanently unfinished.
    //
    // Held at a playhead that has passed no lifecycle node, so no lane counts as complete and
    // every ratio is on screen: a complete lane suppresses its ratio (see the test above), and
    // this fixture is a shipped run where all three would otherwise be hidden. The lit-step
    // sets are the shipped run's, which is what makes the denominators worth asserting.
    const markup = renderToStaticMarkup(
      <LaneGraph state={withTopology({ passedNodes: [], activeNode: null, laneCurrent: null })} />,
    );
    expect(markup).toContain("6/7 steps"); // design: 7 lightable (d-gate + d-hil excluded; d-breakdown is a new lightable step this pre-breakdown fixture doesn't light), 6 lit
    expect(markup).toContain("7/8 steps"); // build: 8 lightable (b-verify, an automated role-owned gate, still counts); lit 7
    // Plan reads 2/4: p-intake, p-propose, p-size, p-req (the PO authoring turn) — the Backlog gate is
    // excluded (human gate), and breakdown is now a DESIGN-lane step (d-breakdown), not plan. This
    // pre-p-intake render-state snapshot lit only p-propose + p-size.
    expect(markup).toContain("2/4 steps");
  });

  it("a gate's colour comes from the parked-gate focus, not its gate state", () => {
    // The unified model: a gate is purple ONLY while it is the gate the run is currently PARKED at
    // (the ONE focus). Its gates.json status (open/approved) no longer colours it — a passed or
    // merely-open gate that isn't the focus is neutral, so purple never lingers past the parked
    // moment. Isolate the SPEC gate's own node stroke (title → rect).
    const specStroke = (m: string): string | null =>
      m.match(/Spec gate[\s\S]*?<rect[^>]*?stroke:(var\(--status-[a-z]+\))/)?.[1] ?? null;

    // Not the parked gate → neutral, regardless of gate status (border-default is not a status-* var).
    const idleOpen = renderToStaticMarkup(<LaneGraph state={{ ...state, gates: [{ name: "spec", status: "open" }], focus: { kind: "idle" } }} />);
    expect(specStroke(idleOpen)).toBeNull();
    const idleApproved = renderToStaticMarkup(<LaneGraph state={{ ...state, gates: [{ name: "spec", status: "approved" }], focus: { kind: "idle" } }} />);
    expect(specStroke(idleApproved)).toBeNull();

    // Parked at the spec gate → purple, from the ONE focus.
    const parked = renderToStaticMarkup(<LaneGraph state={{ ...state, gates: [{ name: "spec", status: "open" }], focus: { kind: "gate", gate: "spec" } }} />);
    expect(specStroke(parked)).toBe("var(--status-gate)");
  });

  it("PULSES only the gate the run is PARKED at (pendingGate), glowing purple — not every open gate", () => {
    // A human gate never lights from an event, so it is never the `current` step — but the ONE gate
    // the drive is stopped at (`pendingGate`) IS the active locus. Like the bubble cards, it gets a
    // thick purple border and a WHITE pulse. The pulse (glowpulse) rides on the OPAQUE backing rect
    // (glow outside-only), which is the FIRST rect after the title; the purple border is on the box
    // rect after it. Other gates that merely sit `open` stay quiet.
    const backingRectFor = (m: string): string =>
      m.match(/<title>Spec gate[\s\S]*?<rect[^>]*style="([^"]*)"/)?.[1] ?? "";

    // Parked at the spec gate (focus): it pulses WHITE and wears a purple border.
    const parked = renderToStaticMarkup(
      <LaneGraph state={{ ...state, gates: [{ name: "spec", status: "open" }], focus: { kind: "gate", gate: "spec" } }} />,
    );
    expect(backingRectFor(parked)).toContain("glowpulse"); // the live wait → pulses (SVG-visible glow)
    expect(backingRectFor(parked)).toContain("var(--text-strong)"); // glows WHITE, like the bubble cards
    expect(parked).toMatch(/<title>Spec gate[\s\S]*?stroke:var\(--status-gate\)/); // purple border retained

    // Spec gate still `open` but the drive is parked ELSEWHERE (acceptance): spec must NOT pulse.
    const elsewhere = renderToStaticMarkup(
      <LaneGraph state={{ ...state, gates: [{ name: "spec", status: "open" }], focus: { kind: "gate", gate: "acceptance" } }} />,
    );
    expect(backingRectFor(elsewhere)).not.toContain("glowpulse"); // open but not the live wait → quiet

    // Cleared: no pulse.
    const approved = renderToStaticMarkup(
      <LaneGraph state={{ ...state, gates: [{ name: "spec", status: "approved" }], focus: { kind: "idle" } }} />,
    );
    expect(backingRectFor(approved)).not.toContain("glowpulse"); // cleared → quiet, no pulse
  });

  it("renders the per-step 'model·effort·turns' metric on the step it credits (no cost)", () => {
    const markup = renderToStaticMarkup(
      <LaneGraph state={{ ...state, laneStepMeta: { "p-propose": { model: "opus", effort: "low", cost: 1.5, turns: 2 } } }} />,
    );
    expect(markup).toContain("opus·low·2 turns"); // model·effort·turns, one tight line (bare middot, no gaps)
    expect(markup).not.toContain("$1.50"); // cost is summarized in the run-vitals card, not per step
  });

  it("abbreviates the wide effort labels so the metric fits the card (medium → med)", () => {
    const markup = renderToStaticMarkup(
      <LaneGraph state={{ ...state, laneStepMeta: { "p-propose": { model: "sonnet", effort: "medium", cost: 0, turns: 1 } } }} />,
    );
    expect(markup).toContain("sonnet·med·1 turn");
    expect(markup).not.toContain("medium");
  });

  it("drops effort from the step metric when absent: 'model·turns'", () => {
    const markup = renderToStaticMarkup(
      <LaneGraph state={{ ...state, laneStepMeta: { "p-propose": { model: "opus", effort: null, cost: 0, turns: 3 } } }} />,
    );
    expect(markup).toContain("opus·3 turns");
    expect(markup).not.toContain("opus·null");
  });

  it("draws back-edges as labelled branches, not happy path", () => {
    // The build lane's assess fan-out back-edges are the honest-GREEN recovery paths; they must be
    // visually distinct (dashed + amber + labelled) or the cycle reads as linear. (The repair/perm
    // → GREEN re-verify risers were intentionally dropped, so their label no longer appears.)
    const markup = renderToStaticMarkup(<LaneGraph state={state} />);
    expect(markup).toContain("verify fails");
    expect(markup).toContain("regression");
    expect(markup).toContain("supersession");
    expect(markup).toContain("genuine"); // assess → raise-to-HIL
  });

  it("survives an empty board without throwing", () => {
    // A run with no events: every lane not started, nothing current, no gates.
    const empty = {
      ...state,
      gates: [],
      topology: { ...state.topology, passedNodes: [], laneSteps: { plan: [], design: [], build: [], deploy: [] }, laneCurrent: null },
    };
    const markup = renderToStaticMarkup(<LaneGraph state={empty} />);
    expect((markup.match(/<svg/g) ?? []).length).toBe(4); // all lanes render even when empty
    expect(markup).toContain("not started");
    expect(markup).toContain("0/4 steps"); // plan: 4 lightable steps (p-intake/propose/size/req; Backlog gate excluded, breakdown moved to design), none reached
  });
});

describe("render — Transport", () => {
  const noop = () => {};

  it("renders RUNNING at the newest event", () => {
    const markup = renderToStaticMarkup(
      <Transport at={null} total={380} onChange={noop} playing={false} onPlayingChange={noop} speed={5} onSpeedChange={noop} atTimestamp="2026-08-04T15:09:36.000Z" />,
    );
    expect(markup).toContain("RUNNING");
    expect(markup).not.toContain("REVIEWING");
    expect(markup).toMatchSnapshot();
  });

  it("renders REVIEWING (not PAUSED — the run keeps going) when scrubbed back off the newest event", () => {
    const markup = renderToStaticMarkup(
      <Transport at={40} total={380} onChange={noop} playing={false} onPlayingChange={noop} speed={5} onSpeedChange={noop} atTimestamp="2026-08-04T19:39:11.000Z" />,
    );
    expect(markup).toContain("REVIEWING");
    expect(markup).not.toContain("PAUSED");
    expect(markup).not.toContain("WORKING");
    expect(markup).toMatchSnapshot();
  });

  it("a recorded run is always REVIEWING — even at the newest event (never RUNNING/RAISED/WAITING)", () => {
    const markup = renderToStaticMarkup(
      <Transport at={null} total={380} onChange={noop} playing={false} onPlayingChange={noop} speed={5} onSpeedChange={noop} escalated awaitingGate replay />,
    );
    expect(markup).toContain("REVIEWING");
    expect(markup).not.toContain("RUNNING");
    expect(markup).not.toContain("RAISED");
    expect(markup).not.toContain("WAITING");
  });

  it("shows RAISED (red) at the newest event when a problem is escalated to a human", () => {
    const markup = renderToStaticMarkup(
      <Transport at={null} total={380} onChange={noop} playing={false} onPlayingChange={noop} speed={5} onSpeedChange={noop} escalated />,
    );
    expect(markup).toContain("RAISED");
    expect(markup).not.toContain("WORKING");
    expect(markup).not.toContain("WAITING");
  });

  it("shows WAITING (purple) at the newest event when parked on a normal gate decision", () => {
    const markup = renderToStaticMarkup(
      <Transport at={null} total={380} onChange={noop} playing={false} onPlayingChange={noop} speed={5} onSpeedChange={noop} awaitingGate />,
    );
    expect(markup).toContain("WAITING");
    expect(markup).not.toContain("RAISED");
    expect(markup).not.toContain("WORKING");
  });

  it("an escalation outranks a gate — RAISED wins when both are set", () => {
    const markup = renderToStaticMarkup(
      <Transport at={null} total={380} onChange={noop} playing={false} onPlayingChange={noop} speed={5} onSpeedChange={noop} awaitingGate escalated />,
    );
    expect(markup).toContain("RAISED");
    expect(markup).not.toContain("WAITING");
  });

  it("disables step-back at the start, and step-forward + jump-to-end at the live edge", () => {
    const atStart = renderToStaticMarkup(
      <Transport at={0} total={380} onChange={noop} playing={false} onPlayingChange={noop} speed={1} onSpeedChange={noop} />,
    );
    // at event 0 (not live): only step-back is disabled — you can still step forward + jump to end.
    expect((atStart.match(/disabled=""/g) ?? []).length).toBe(1);
    const atEnd = renderToStaticMarkup(
      <Transport at={null} total={380} onChange={noop} playing={false} onPlayingChange={noop} speed={1} onSpeedChange={noop} />,
    );
    // following the live edge (at=null): BOTH end controls are inert — step-forward AND jump-to-end
    // (jump-to-end == go-live, and you're already live).
    expect((atEnd.match(/disabled=""/g) ?? []).length).toBe(2);
  });

  it("handles an empty log without producing a broken range input", () => {
    const markup = renderToStaticMarkup(
      <Transport at={null} total={0} onChange={noop} playing={false} onPlayingChange={noop} speed={1} onSpeedChange={noop} />,
    );
    expect(markup).toContain('max="0"');
    expect(markup).toContain("0 / 0");
  });
});

// ---------------------------------------------------------------------------
// Phase 3: the drill-down surfaces. TurnPanel fetches on mount, so SSR markup only shows its
// loading shell — which is exactly what should be asserted here (the fetch paths are covered by
// app/api/turn/route.test.ts against the real corpus). The interesting logic that IS testable
// server-side is the ticker's zip of recentEvents against recentTurns, where an off-by-one
// would open the wrong turn.

const withSource = (over: Partial<NonNullable<DashboardState["source"]>>): DashboardState =>
  ({
    ...state,
    source: {
      mode: "replay",
      describe: "stockflow-rerecord (replay)",
      capabilities: ["timeline", "transport", "transcripts", "artifactContent"],
      availableModes: ["live", "replay"],
      note: null,
      correlation: null,
      ...over,
    },
  }) as DashboardState;

const health = (over: Partial<NonNullable<NonNullable<DashboardState["source"]>["correlation"]>> = {}) => ({
  healthy: true,
  severity: "ok" as "ok" | "info" | "warning",
  message: null,
  paired: 71,
  structural: 10,
  unpairedEvents: 0,
  kitVersionMatch: true as boolean | null,
  recentTurns: [],
  ...over,
});

describe("render — EventTicker turn affordance", () => {
  it("marks only the rows that begin a recorded turn", () => {
    // One openable row among several, positioned to catch a shift: recentTurns is aligned to
    // recentEvents by index, so marking row 1 must mark the SECOND event, not the first.
    const s = withSource({
      correlation: health({ recentTurns: state.recentEvents.map((_, i) => (i === 1 ? 7 : null)) }),
    });
    const markup = renderToStaticMarkup(<EventTicker state={s} onOpenTurn={() => {}} />);
    // A turn-starting row leads with a blue "#<ord>" prefix (the reference's `.tnum`).
    expect(markup).toContain(">#7 </span>");
    // ...and no other row claims a turn.
    expect((markup.match(/>#\d+ <\/span>/g) ?? []).length).toBe(1);
  });

  it("shows no affordance when the source cannot drill down", () => {
    // Live mode: correlation is null, so no row is clickable and the ticker looks as it always
    // has. A dead "turn N" chip would invite clicks that 409.
    const markup = renderToStaticMarkup(<EventTicker state={state} />);
    expect(markup).not.toContain("›");
  });

  it("does not offer rows when onOpenTurn is absent even if turns are known", () => {
    // Belt and braces: the capability gate lives in page.tsx, so the ticker must not render an
    // affordance it cannot honour.
    const s = withSource({ correlation: health({ recentTurns: state.recentEvents.map(() => 3) }) });
    expect(renderToStaticMarkup(<EventTicker state={s} />)).not.toContain(">#3 </span>");
  });

  // Kevin's parity ask: the agent's own reasoning must be visible in the stream, not buried in a
  // drill-down. In the reference row format every message WRAPS (pre-wrap) instead of ellipsis-
  // clipping, so a reasoning event's full narration reads at a glance like any other row.
  it("renders a reasoning event's full narration inline, wrapping rather than clipping", () => {
    // EventTicker renders only the last MERGED_TAIL (60) rows of the merged events+correspondence
    // stream. Pin the premises that make this exact for THIS fixture — no correspondence and ≤ 60
    // events — so the reasoning event is actually drawn.
    expect(state.source?.correspondence?.recent?.length ?? 0).toBe(0);
    expect(state.recentEvents.length).toBeLessThanOrEqual(60);
    const reasoningCount = state.recentEvents.filter((e) => e.event === "reasoning").length;
    expect(reasoningCount).toBeGreaterThan(0); // fixture guard: the assertions below are vacuous otherwise
    const markup = renderToStaticMarkup(<EventTicker state={state} />);
    // Messages wrap (pre-wrap), never clipped to one line.
    expect(markup).toContain("white-space:pre-wrap");
    // A reasoning event's full message survives into the markup (wrapping is CSS, not truncation).
    // Escape as React does for text nodes, so a message with &/</> in a future corpus still matches.
    const firstReasoning = state.recentEvents.find((e) => e.event === "reasoning")!;
    expect(markup).toContain(escapeHtml(firstReasoning.message));
  });
});

describe("render — DriftBanner", () => {
  it("renders nothing when pairing is healthy", () => {
    // A permanent "pairing OK" chip would train the eye to ignore the one place it must not.
    expect(renderToStaticMarkup(<DriftBanner correlation={health()} />)).toBe("");
    // ...and nothing in live mode, where there is no corpus to disagree with.
    expect(renderToStaticMarkup(<DriftBanner correlation={null} />)).toBe("");
  });

  it("treats a kit-version mismatch as a quiet pairing NOTE, not a critical alert (info)", () => {
    // Kevin's ask: a kit-version drift is an expected observability caveat, not a run failure, so
    // it must not wear the critical-red alert weight that reads as "the orchestrator is broken".
    const markup = renderToStaticMarkup(
      <DriftBanner
        correlation={health({
          healthy: false,
          severity: "info",
          kitVersionMatch: false,
          message: "Log and corpus are different kit versions (log aaaa111 vs corpus bbbb222) — turn pairing is unreliable.",
        })}
      />,
    );
    expect(markup).toContain("Live view pairing note");
    expect(markup).toContain("different kit versions");
    expect(markup).toContain("Turn drill-downs may be approximate");
    expect(markup).toContain("kit version mismatch");
    // The structural count is labelled as expected, so it never reads as part of the problem.
    expect(markup).toContain("10 structural (expected)");
    // Quiet: a polite note, never the assertive critical alert.
    expect(markup).toContain('role="note"');
    expect(markup).not.toContain('role="alert"');
  });

  it("flags a role the corpus never recorded as a prominent WARNING — a likely different run", () => {
    const markup = renderToStaticMarkup(
      <DriftBanner
        correlation={health({
          healthy: false,
          severity: "warning",
          unpairedEvents: 4,
          message: "The corpus has no turns for dba (4 events) — it may be a different run.",
        })}
      />,
    );
    expect(markup).toContain("Corpus pairing unreliable");
    expect(markup).toContain("may be a different run");
    // The paired count is kept, so partial trust stays legible.
    expect(markup).toContain("71 paired · 4 unpaired");
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain("kit version mismatch"); // that isn't this failure
  });
});

describe("render — FidelityBanner", () => {
  // A minimal SourceMeta; `caps` and `fidelity` are the only things this banner reasons about.
  type Src = NonNullable<DashboardState["source"]>;
  const src = (caps: Src["capabilities"], fidelity: Src["fidelity"]): DashboardState["source"] =>
    ({ mode: "live", describe: "proj", capabilities: caps, availableModes: ["live"], note: null, correlation: null, fidelity }) as DashboardState["source"];

  it("renders nothing for replay (no fidelity — a corpus is full-fidelity by definition)", () => {
    // Even a replay corpus that happens to lack correspondence must not nag: re-running won't fix
    // a recorded corpus, and fidelity is null for replay.
    expect(renderToStaticMarkup(<FidelityBanner source={src(["timeline", "artifactContent"], null)} />)).toBe("");
  });

  it("shows on a NOT-recording live build and points at LAKEBASE_CONSORT_RECORD_DIR", () => {
    const markup = renderToStaticMarkup(
      <FidelityBanner source={src(["timeline", "featureStatus", "artifactContent"], { recording: false })} />,
    );
    expect(markup).toContain("not recording");
    expect(markup).toContain("prompts &amp; inputs");
    expect(markup).toContain("the HIL↔orchestrator conversation");
    expect(markup).toContain("point-in-time per-step snapshots");
    expect(markup).toContain("LAKEBASE_CONSORT_RECORD_DIR");
    expect(markup).toContain("Available: current outputs (at HEAD)");
  });

  it("STILL shows on a recording live build that can't yet surface the streams (points at replay, not re-run)", () => {
    // The core review finding: `recording:true` must not silently hide the banner while the
    // capabilities that surface those streams are absent — that leaves a recording build with no
    // drill-down AND no explanation. It shows, with replay guidance instead of the re-run advice.
    const markup = renderToStaticMarkup(
      <FidelityBanner source={src(["timeline", "featureStatus", "artifactContent"], { recording: true })} />,
    );
    expect(markup).toContain("limited live view");
    expect(markup).toContain("Open the recorded corpus in replay");
    expect(markup).not.toContain("LAKEBASE_CONSORT_RECORD_DIR");
  });

  it("hides once the live board has every richer capability (nothing to warn about)", () => {
    // Capability-driven visibility: when transcripts + correspondence + stepOutputs are all
    // present (the Phase B end state), `missing` is empty and the banner removes itself.
    const full = src(
      ["timeline", "featureStatus", "artifactContent", "transcripts", "correspondence", "stepOutputs"],
      { recording: true },
    );
    expect(renderToStaticMarkup(<FidelityBanner source={full} />)).toBe("");
  });

  it("never renders a broken 'Available: .' sentence when no available caps are present", () => {
    const markup = renderToStaticMarkup(<FidelityBanner source={src([], { recording: false })} />);
    expect(markup).not.toContain("Available: .");
    expect(markup).toContain("Not captured:");
  });
});

describe("render — DrilldownPanel", () => {
  it("renders a loading shell for a turn target without fetching server-side", () => {
    // The panel fetches in an effect, which never runs under renderToStaticMarkup — so this
    // pins the shell a viewer sees for one frame, and proves the component doesn't throw
    // when its data is absent.
    const markup = renderToStaticMarkup(<DrilldownPanel target={{ kind: "turn", ord: 16 }} mode="replay" feature={null} onClose={() => {}} />);
    expect(markup).toContain("#16"); // the turn identity, in the always-present header title
    expect(markup).toContain("Loading turn 16…");
    expect(markup).toContain("Close drill-down panel"); // always escapable
    // The tabs are always-present chrome: all three render (and stay clickable) even before the
    // turn resolves, so a viewer can move between Correspondence / Artifacts / Code immediately.
    expect(markup).toContain("Correspondence");
    expect(markup).toContain("Artifacts");
    expect(markup).toContain("Code");
  });

  it("renders a loading shell for an artifact target with the HEAD honesty label", () => {
    // The live half: one file at HEAD, labelled as such so it's never mistaken for a snapshot.
    const markup = renderToStaticMarkup(<DrilldownPanel target={{ kind: "artifact", path: "design/ia.md" }} mode="live" feature={null} onClose={() => {}} />);
    expect(markup).toContain("ARTIFACT");
    expect(markup).toContain("design/ia.md");
    expect(markup).toContain("content at HEAD");
    expect(markup).toContain("Close drill-down panel");
  });

  it("renders a loading shell for a step target", () => {
    const markup = renderToStaticMarkup(<DrilldownPanel target={{ kind: "step", node: "plan" }} mode="replay" feature="F1-stock-visibility" onClose={() => {}} />);
    expect(markup).toContain("STEP OUTPUTS");
    expect(markup).toContain("Close drill-down panel");
  });

  // Kevin's ask, in the drill-down: the turn must read as an EXCHANGE — an inbound prompt to the
  // role, then the role's tools + reasoning back — with the tool NAME legible apart from its args.
  it("frames the transcript as a directional exchange with the role named, and splits tool name from args", () => {
    const turn = {
      ordinal: 20,
      step: 20,
      label: "spec-author",
      kind: "invoke-role",
      role: "spec-author",
      produced: [],
      deleted: [],
      transcript: { prompt: "Propose the features.", tools: ["Read app/models.py lines 1-40", "Write .consort/spec.json"], reasoning: "Chose the thinnest slice." },
      transcriptSummary: null,
    } as TurnPayload;
    const markup = renderToStaticMarkup(<TranscriptView turn={turn} />);
    // Inbound and outbound are labelled and name the role.
    expect(markup).toContain("▸ Prompt → spec-author");
    expect(markup).toContain("◂ Tools spec-author invoked (2)");
    expect(markup).toContain("◂ spec-author&#x27;s final reasoning");
    // The tool NAME is bolded (its own span) and the args are present but rendered muted.
    expect(markup).toMatch(/font-weight:700[^>]*>Read<\/span>/);
    expect(markup).toContain("app/models.py lines 1-40");
  });

  // T5 parity: the stream is scannable by category, with a legend that explains the colours.
  it("colour-codes state-transition event kinds and renders a legend", () => {
    // The count-based assertions below assume no correspondence rows (CorrRow also uses the gate
    // colour), which holds for this fixture.
    expect(state.source?.correspondence?.recent?.length ?? 0).toBe(0);
    const markup = renderToStaticMarkup(<EventTicker state={state} />);
    // The legend names each colour category plus the reasoning marker.
    for (const label of ["gate", "escalation", "deploy / verify", "reasoning"]) {
      expect(markup).toContain(label);
    }
    // Row colouring, not just the legend swatch: the legend emits exactly one of each colour, so a
    // count > 1 proves at least one actual event row carries it. The fixture has info-level gate and
    // deploy/verify events.
    expect(state.recentEvents.some((e) => e.event.startsWith("gate") && e.level !== "warn" && e.level !== "error")).toBe(true);
    expect((markup.match(/var\(--status-gate\)/g) ?? []).length).toBeGreaterThan(1);
    expect(state.recentEvents.some((e) => (e.event.startsWith("deploy") || e.event.startsWith("verify")) && e.level !== "warn" && e.level !== "error")).toBe(true);
    // deploy/verify events read in the Release Engineer's role colour (they are ALL the RE's work),
    // so their swatch + rows carry --role-release-engineer, not the generic --status-good.
    expect((markup.match(/var\(--role-release-engineer\)/g) ?? []).length).toBeGreaterThan(1);
  });

  it("does NOT paint a failed deploy/verify with the RE category colour — a warn/error row keeps its level colour", () => {
    // The demo hazard: `deploy.failed` matches the deploy/verify rule, but painting it the category
    // colour reads as success. At error level the category colour is withheld, so the only
    // --role-release-engineer in the markup is the legend swatch (count 1), and the row shows red.
    const failed = {
      ...state,
      recentEvents: [{ timestamp: "2026-08-05T00:00:00.000Z", level: "error", role: "release-engineer", event: "deploy.failed", message: "DEPLOY failed", metadata: {} }],
    } as DashboardState;
    const markup = renderToStaticMarkup(<EventTicker state={failed} />);
    expect((markup.match(/var\(--role-release-engineer\)/g) ?? []).length).toBe(1); // legend swatch only, no coloured row
    expect(markup).toContain("var(--status-critical-text)"); // the failure reads as error
  });

  it("builds the turn meta line as mode · story · model · N tools, omitting absent fields", () => {
    // The reference's example: a fully-recorded navigator turn shows all four fields.
    const full = {
      ordinal: 54, step: 54, label: "navigator", kind: "invoke-role", role: "navigator",
      mode: "review", story: "S3-sku-detail-view",
      produced: [], deleted: [],
      transcript: { prompt: "", tools: new Array(11).fill("Read x"), reasoning: "" },
      transcriptSummary: { model: "sonnet", toolCount: 11 },
    } as TurnPayload;
    expect(turnMetaFields(full).join(" · ")).toBe("review · S3-sku-detail-view · sonnet · 11 tools");

    // A dispatch turn carries only a mode → just that, no empty separators (the #02 case).
    const dispatch = {
      ordinal: 2, step: 2, label: "product-owner", kind: "invoke-role", role: "product-owner",
      mode: "author-requests", produced: [], deleted: [], transcript: null, transcriptSummary: null,
    } as TurnPayload;
    expect(turnMetaFields(dispatch).join(" · ")).toBe("author-requests");
  });

  it("says a non-role step has no transcript rather than rendering an empty exchange", () => {
    const turn = { ordinal: 5, step: 5, label: "cut", kind: "experiment-cut", produced: [], deleted: [], transcript: null, transcriptSummary: null } as TurnPayload;
    const markup = renderToStaticMarkup(<TranscriptView turn={turn} />);
    expect(markup).toContain("No transcript recorded for this turn (gate / dispatch / orchestrator step).");
    expect(markup).not.toContain("Prompt →");
  });

  it("builds turn URLs without asserting a mode it wasn't given", () => {
    // The panel is gated on the `transcripts` capability rather than on mode === "replay", so a
    // future non-replay source with a turns corpus must not be silently handed the replay one.
    // Null means "server's choice", matching /api/state.
    expect(turnUrl(16, "replay")).toBe("/api/turn/16?mode=replay");
    expect(turnUrl(16, null)).toBe("/api/turn/16");
    // File paths are encoded, and the ?/& is never hand-assembled.
    expect(turnUrl(16, "replay", "app/a.ts")).toBe("/api/turn/16?mode=replay&file=app%2Fa.ts");
    expect(turnUrl(16, null, "app/a.ts")).toBe("/api/turn/16?file=app%2Fa.ts");
    // A path with a literal `&` must not be able to inject another parameter.
    expect(turnUrl(16, null, "a&mode=live.ts")).toBe("/api/turn/16?file=a%26mode%3Dlive.ts");
  });
});

describe("modeFromUrl", () => {
  it("reads a valid mode and ignores anything else", () => {
    // `?mode=` makes a replay board linkable. Found by driving the page with ?mode=replay and
    // getting live: the param reached /api/state but nothing read it on the client.
    expect(modeFromUrl("?mode=replay")).toBe("replay");
    expect(modeFromUrl("?at=40&mode=live")).toBe("live");
    // An unknown value must fall back to the server's choice, not request a mode that can't
    // exist — validated against the union so a typo can't disable the board.
    expect(modeFromUrl("?mode=REPLAY")).toBeNull();
    expect(modeFromUrl("?mode=corpus")).toBeNull();
    expect(modeFromUrl("?mode=")).toBeNull();
    expect(modeFromUrl("")).toBeNull();
    expect(modeFromUrl("?at=40")).toBeNull();
  });
});

describe("render — FeatureStatusSection (left-pane status rollup)", () => {
  const story = (over: Partial<StoryProgress> & Pick<StoryProgress, "id" | "feature">): StoryProgress => ({
    status: "done",
    stage: "done",
    designComplete: true,
    designPhase: null,
    gateApproved: true,
    active: false,
    ...over,
  });
  const custom: DashboardState = {
    ...state,
    features: [
      { id: "F1", done: true, active: false }, // complete → shown
      { id: "F6", done: false, active: true }, // active → shown
      { id: "F9", done: false, active: false }, // neither → omitted
    ],
    stories: [
      story({ id: "S1", feature: "F1", status: "done", stage: "done" }),
      story({ id: "S2", feature: "F6", status: "building", stage: "build", active: true }),
      story({ id: "S3", feature: "F9", status: "designing", stage: "design", designComplete: false, designPhase: "propose" }),
    ],
  };

  it("shows only complete + active features, each with its stories", () => {
    const m = renderToStaticMarkup(<FeatureStatusSection state={custom} pinned={null} onPin={() => {}} />);
    // done + active features render; the started-but-idle F9 (and its story S3) do not.
    expect(m).toContain("F1");
    expect(m).toContain("F6");
    expect(m).not.toContain("F9");
    expect(m).not.toContain("S3");
    // per-feature chip labels, and each shown feature's own stories.
    expect(m).toContain(">done<");
    expect(m).toContain(">active<");
    expect(m).toContain("S1");
    expect(m).toContain("S2");
    // the header rollup counts complete of shown (F1 done of {F1,F6}).
    expect(m).toContain("1 of 2 complete");
  });

  it("is the feature selector: every feature has a visible pin control; pinning marks it + offers follow", () => {
    const unpinned = renderToStaticMarkup(<FeatureStatusSection state={custom} pinned={null} onPin={() => {}} />);
    expect(unpinned).toContain(">pin<"); // the visible pin button (unpinned)
    expect(unpinned).toContain("cursor:pointer"); // it's a real clickable control
    const pinnedF1 = renderToStaticMarkup(<FeatureStatusSection state={custom} pinned="F1" onPin={() => {}} />);
    expect(pinnedF1).toContain(">pinned<"); // F1's pin button now reads "pinned"
    expect(pinnedF1).toContain("follow"); // the clear-pin control in the header
  });

  it("shows the pin control even on a single-feature run (works in all scenarios)", () => {
    const one: DashboardState = {
      ...state,
      features: [{ id: "F1", done: false, active: true }],
      stories: [story({ id: "S1", feature: "F1", status: "building", stage: "build", active: true })],
    };
    const m = renderToStaticMarkup(<FeatureStatusSection state={one} pinned={null} onPin={() => {}} />);
    expect(m).toContain("F1");
    expect(m).toContain(">pin<"); // the pin control is present with one feature too
    expect(m).toContain("cursor:pointer");
  });

  it("renders an empty-state line when no feature is complete or underway", () => {
    const empty: DashboardState = { ...state, features: [{ id: "F1", done: false, active: false }], stories: [] };
    const m = renderToStaticMarkup(<FeatureStatusSection state={empty} pinned={null} onPin={() => {}} />);
    expect(m).toContain("No feature complete or underway yet.");
  });
});
