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
 * directly against fixed data. Date.now() is pinned because AgentBubble shows elapsed time.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AgentBubble } from "./AgentBubble";
import { WorkflowGraph } from "./WorkflowGraph";
import { Transport } from "./Transport";
import { LaneGraph } from "./LaneGraph";
import { DrilldownPanel, turnUrl } from "./DrilldownPanel";
import { DriftBanner, EventTicker, FidelityBanner, modeFromUrl } from "./board-parts";
import type { DashboardState } from "@/lib/types";

const fixture = (name: string): DashboardState =>
  JSON.parse(readFileSync(join(__dirname, "..", "lib", "__fixtures__", name), "utf8"));

const state = fixture("render-state.json");
// The same run pinned at event 40 — atLive false, so snapshot-fenced panels must differ.
const scrubbed = fixture("render-state-scrubbed.json");

// AgentBubble renders "working 4m" from Date.now() - turnStartTs; pin it so the markup is
// deterministic. Chosen well after the fixture's timestamps so elapsed values are stable.
const FIXED_NOW = Date.parse("2026-08-05T00:00:00.000Z");

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

describe("render — appearance is unchanged by the token refactor", () => {
  it("renders every agent bubble identically", () => {
    // All ten roles, and with real data that means several distinct statuses.
    const markup = state.agents
      .map((a) => renderToStaticMarkup(<AgentBubble agent={a} showCost />))
      .join("\n");
    expect(markup).toMatchSnapshot();
  });

  it("renders bubbles the same with cost hidden", () => {
    const markup = state.agents
      .map((a) => renderToStaticMarkup(<AgentBubble agent={a} showCost={false} />))
      .join("\n");
    expect(markup).toMatchSnapshot();
  });

  it("covers every AgentStatus, not just the ones this run happened to produce", () => {
    // The fixture is one moment of one run, so it won't contain all five statuses. Synthesize
    // the rest from a real agent so the tinted/pulsing variants are snapshotted too.
    const base = state.agents[0];
    const statuses = ["working", "on-deck", "issue", "waiting", "idle"] as const;
    const markup = statuses
      .map((status) =>
        renderToStaticMarkup(
          <AgentBubble
            agent={{ ...base, status, work: `synthetic ${status}`, turnStartTs: "2026-08-04T23:56:00.000Z" }}
            showCost
          />,
        ),
      )
      .join("\n");
    expect(markup).toMatchSnapshot();
  });

  it("renders a working bubble in both liveness states", () => {
    const base = { ...state.agents[0], status: "working" as const, turnStartTs: "2026-08-04T23:56:00.000Z" };
    const markup = [true, false, null]
      .map((sessionActive) => renderToStaticMarkup(<AgentBubble agent={{ ...base, sessionActive }} showCost />))
      .join("\n");
    expect(markup).toMatchSnapshot();
  });
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

  it("marks gates as diamonds, not phases", () => {
    // A human decision point must never read as just another phase node.
    const markup = renderToStaticMarkup(<WorkflowGraph state={state} />);
    expect((markup.match(/<polygon/g) ?? []).length).toBe(4); // plan/spec/deploy/promote gates
  });
});

// ---------------------------------------------------------------------------
// LaneGraph: the per-lane sub-workflows (Kevin's Figure 2). New, so these snapshots pin
// behavior going forward rather than proving equivalence with anything.

// A single lane's header markup, so an assertion about one lane can't be satisfied by
// another lane's text. Slices from this lane's uppercase name label to the next panel.
function laneHeader(markup: string, laneId: string): string {
  const start = markup.indexOf(`>${laneId}<`);
  if (start === -1) throw new Error(`lane ${laneId} not rendered`);
  const end = markup.indexOf("margin-left:auto", start);
  return markup.slice(start, end === -1 ? start + 400 : end);
}

const renderLane = (s: DashboardState) => <LaneGraph state={s} />;

describe("render — LaneGraph", () => {
  // Corpus-shaped states, which is where the single-feature fixtures above can't reach. All
  // three of these are real playhead positions in stockflow-rerecord (see reducer.test.ts).
  const withTopology = (over: Partial<DashboardState["topology"]>, rest: Partial<DashboardState> = {}) =>
    ({ ...state, ...rest, topology: { ...state.topology, ...over } }) as DashboardState;

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
    expect(build).toContain("1/7 steps");
  });

  it("falls back to a real lane when laneCurrent names an unknown one", () => {
    // topology.laneCurrent.lane is typed `string`, not LaneId, so an unrecognised value used
    // to become the expanded lane, match no panel, and collapse all three — zero graphs, no
    // error. A Phase 2 replay source emitting a different vocabulary is the realistic trigger.
    const markup = renderToStaticMarkup(
      renderLane(withTopology({ laneCurrent: { lane: "nonexistent", step: "x" } })),
    );
    expect((markup.match(/aria-expanded/g) ?? []).length).toBe(3);
    expect((markup.match(/<svg/g) ?? []).length).toBe(1); // still shows a lane
    // ...and no lane claims to be active on the strength of a bogus name
    expect(markup).not.toContain("· active");
  });

  it("renders all three lanes, with only the playhead's lane expanded", () => {
    // The scrubbed fixture has laneCurrent = design/d-spec, so design expands and the other
    // two collapse to summary rows.
    expect(scrubbed.topology.laneCurrent).toEqual({ lane: "design", step: "d-spec" });
    const markup = renderToStaticMarkup(<LaneGraph state={scrubbed} />);
    // three headers, one <svg>
    expect((markup.match(/aria-expanded/g) ?? []).length).toBe(3);
    expect((markup.match(/<svg/g) ?? []).length).toBe(1);
    expect(markup).toMatchSnapshot();
  });

  it("expands the furthest lane reached when nothing is active", () => {
    // The finished-run fixture has laneCurrent = null (the log ends on phase.end). Falling
    // back to "plan" would show the least interesting lane on a completed run; the furthest
    // lane entered is the useful default.
    expect(state.topology.laneCurrent).toBeNull();
    const markup = renderToStaticMarkup(<LaneGraph state={state} />);
    expect((markup.match(/<svg/g) ?? []).length).toBe(1);
    // build is the furthest lane with steps in this fixture
    expect(markup).toContain("honest-GREEN");
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
    expect(markup).toContain("6/6 steps"); // design: 6 lightable, all lit (d-gate excluded)
    expect(markup).toContain("7/7 steps"); // build: all 7 lit on this run
    // Plan reads 2/3, not 3/3: `p-req` never lights on the live stockflow log, because its
    // product-owner emits only gate.approved and never the author-requests phase. That is a
    // property of this run, not a bug — the corpus log does light it.
    expect(markup).toContain("2/3 steps");
  });

  it("takes gate state from the run's gates, not from the step data", () => {
    // A lane gate can never light from laneSteps, so its only honest source is state.gates.
    // Assert on a COLLAPSED lane's gate dot: the expanded lane in this fixture is build,
    // whose only gate (b-verify) has a real match predicate and is already lit.
    const open = renderToStaticMarkup(<LaneGraph state={{ ...state, gates: [{ name: "spec", status: "open" }] }} />);
    // the design lane's gate dot picks up the HITL purple for a surfaced-but-unapproved gate.
    // The trailing ")" keeps this from matching var(--status-gate-tint).
    expect(open).toContain("var(--status-gate)");

    const approved = renderToStaticMarkup(
      <LaneGraph state={{ ...state, gates: [{ name: "spec", status: "approved" }] }} />,
    );
    // ...and green once cleared, without any step data changing
    expect(approved).not.toContain("var(--status-gate)");
  });

  it("draws back-edges as labelled branches, not happy path", () => {
    // The build lane's five back-edges are the honest-GREEN recovery paths; they must be
    // visually distinct (dashed + amber + labelled) or the cycle reads as linear.
    const markup = renderToStaticMarkup(<LaneGraph state={state} />);
    expect(markup).toContain("verify fails");
    expect(markup).toContain("regression");
    expect(markup).toContain("supersession");
    expect(markup).toContain("re-verify");
  });

  it("survives an empty board without throwing", () => {
    // A run with no events: every lane not started, nothing current, no gates.
    const empty = {
      ...state,
      gates: [],
      topology: { ...state.topology, passedNodes: [], laneSteps: { plan: [], design: [], build: [] }, laneCurrent: null },
    };
    const markup = renderToStaticMarkup(<LaneGraph state={empty} />);
    expect((markup.match(/aria-expanded/g) ?? []).length).toBe(3);
    expect(markup).toContain("not started");
    expect(markup).toContain("0/3 steps");
  });
});

describe("render — Transport", () => {
  const noop = () => {};

  it("renders following the live edge", () => {
    const markup = renderToStaticMarkup(
      <Transport at={null} total={380} onChange={noop} playing={false} onPlayingChange={noop} speed={5} onSpeedChange={noop} atTimestamp="2026-08-04T15:09:36.000Z" />,
    );
    expect(markup).toContain("LIVE");
    expect(markup).not.toContain("PINNED");
    expect(markup).toMatchSnapshot();
  });

  it("renders pinned at an event, and says so", () => {
    const markup = renderToStaticMarkup(
      <Transport at={40} total={380} onChange={noop} playing={false} onPlayingChange={noop} speed={5} onSpeedChange={noop} atTimestamp="2026-08-04T19:39:11.000Z" />,
    );
    expect(markup).toContain("PINNED");
    expect(markup).not.toContain(">LIVE<");
    expect(markup).toMatchSnapshot();
  });

  it("disables step-back at the start and step-forward at the end", () => {
    const atStart = renderToStaticMarkup(
      <Transport at={0} total={380} onChange={noop} playing={false} onPlayingChange={noop} speed={1} onSpeedChange={noop} />,
    );
    // two disabled buttons would mean both ends; at the start only step-back is disabled
    expect((atStart.match(/disabled=""/g) ?? []).length).toBe(1);
    const atEnd = renderToStaticMarkup(
      <Transport at={null} total={380} onChange={noop} playing={false} onPlayingChange={noop} speed={1} onSpeedChange={noop} />,
    );
    expect((atEnd.match(/disabled=""/g) ?? []).length).toBe(1);
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
    expect((markup.match(/turn 7 ›/g) ?? []).length).toBe(1);
    // ...and no other row claims a turn.
    expect((markup.match(/turn \d+ ›/g) ?? []).length).toBe(1);
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
    expect(renderToStaticMarkup(<EventTicker state={s} />)).not.toContain("turn 3 ›");
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
    expect(markup).toContain("TURN 16");
    expect(markup).toContain("Loading turn 16…");
    expect(markup).toContain("Close drill-down panel"); // always escapable
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
