// The LIVE source: a Consort project being worked on right now.
//
// Reads a watched `.sftdd/` directory — `agent-log.jsonl` for the timeline, `next.json` and
// the feature-status CLI for the snapshot half, and Claude transcript mtimes for session
// liveness. All of that I/O already lived in lib/consort.ts and stays there; this file is
// the interface wrapper, so behavior is unchanged by construction rather than by careful
// re-transcription. (Moving ~340 lines of I/O wholesale is exactly how the derive.ts
// extraction broke two functions mid-move; the equivalence is the point, not the file
// layout.)
//
// Capabilities depend on whether a COMPANION record-lane corpus is configured (Phase B):
//
//   Plain live build (no companion) — `agent-log.jsonl` + produced artifacts only. It claims:
//     artifactContent  — HEAD-only. It reads the file `artifact.written` named as it is NOW, not
//                        a per-turn snapshot (replay's kind), so it is strictly less and the panel
//                        says so. Claimed because the artifact panel reads HEAD.
//   Deliberately NOT claimed here: transcripts / correspondence / stepOutputs — a plain live
//   project has no `turns/` corpus, no correspondence.jsonl, no recorded-artifacts mirror.
//
//   Live build WITH a companion record dir (CONSORT_RECORD_DIR / LAKEBASE_CONSORT_RECORD_DIR) —
//   the drive's record lane writes a full ReplaySource-shaped corpus to a SEPARATE dir as it
//   goes, while the agent-log is ALSO mirrored under `.consort/` so liveness is unaffected. So
//   this source keeps events/snapshot/liveness from the live project and DELEGATES the rich
//   drill-down (transcripts, correspondence, stepOutputs) to a ReplaySource over the record dir —
//   the "rewind == replay while live" unlock. The FidelityBanner, whose visibility is keyed on
//   the MISSING capabilities, then auto-hides.

import { existsSync } from "node:fs";
import {
  noSftddMessage,
  projectDir,
  readArtifactAtHead,
  readEvents,
  readSnapshot,
  recordDir,
  sftddDir,
} from "../consort";
import { loadPlanning } from "../planning";
import { CAPABILITIES, foldSource, type Capability, type DashboardSource } from "../source";
import { ReplaySource, classify, type ParsedTranscript, type TurnDetail } from "./replay";
import { correlate, driftMessage } from "../correlate";
import { RECENT_EVENT_TAIL } from "../reducer";
import type { AgentLogEvent, ArtifactContent, DashboardState, Planning, SnapshotInputs, SourceMeta, StepOutputs } from "../types";

const LIVE_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "timeline",
  "transport",
  "liveness",
  "featureStatus",
  "artifactPaths",
  "artifactContent", // HEAD-only; see the header note
  "planningBacklog",
]);

// With a companion record-lane corpus, the live board additionally gains the three replay-grade
// drill-down capabilities, served from the record dir. Precomputed once; the getter picks between
// the two sets by whether a companion is present-and-readable right now.
const LIVE_CAPABILITIES_RECORDING: ReadonlySet<Capability> = new Set<Capability>([
  ...LIVE_CAPABILITIES,
  "transcripts",
  "correspondence",
  "stepOutputs",
]);

// Sanity: every capability named above must be a declared one. A typo would otherwise
// silently disable a panel forever.
for (const c of LIVE_CAPABILITIES_RECORDING) {
  if (!CAPABILITIES.includes(c)) throw new Error(`live source declares unknown capability: ${c}`);
}

export class LiveSource implements DashboardSource {
  readonly mode = "live" as const;

  // Dynamic, not a fixed field: a companion record dir can appear (or its first turns can land) a
  // few seconds into a build, and its capabilities must light up then — which is precisely how the
  // FidelityBanner drops away mid-run. Cheap: one recordDir() env read + two existsSync (the
  // companion's available()) per access, negligible next to the feature-status `lk` shell-out the
  // same 1 Hz poll already pays for.
  get capabilities(): ReadonlySet<Capability> {
    return this.companion() ? LIVE_CAPABILITIES_RECORDING : LIVE_CAPABILITIES;
  }

  // The companion record-lane corpus, or null. `volatile` because the record dir is GROWING while
  // we watch (a finished-corpus ReplaySource caches for the process lifetime; this must re-read).
  // Only surfaced once it's actually readable (has a log + turns/index.json) — before the first
  // turn lands, available() is false, so the rich capabilities stay off and the banner still shows
  // "not captured yet" rather than the drill-down opening onto nothing.
  private companion(): ReplaySource | null {
    const dir = recordDir();
    if (!dir) return null;
    const rs = new ReplaySource(dir, /* volatile */ true);
    return rs.available() ? rs : null;
  }

  describe(): string {
    return projectDir();
  }

  available(): boolean {
    return existsSync(sftddDir());
  }

  unavailableReason(): string | null {
    // One definition, shared with consort.ts's own error path, so the two can't drift.
    return this.available() ? null : noSftddMessage(projectDir());
  }

  events(): AgentLogEvent[] {
    return readEvents();
  }

  snapshot(events: AgentLogEvent[], generatedAt: string): SnapshotInputs {
    return readSnapshot(events, generatedAt);
  }

  getState(upTo?: number, pinnedFeature?: string | null): DashboardState {
    // The shared default: available() → events() → snapshot() → fold, reading the log once.
    // Going through the interface rather than round-tripping consort.buildState() means
    // there is exactly one path to a board, and a replay source inherits it unchanged.
    return foldSource(this, upTo, pinnedFeature);
  }

  // Planning reads straight from the live `.sftdd/`: planning/, sprints/ and features/ all sit
  // there. The log is passed so the re-plan flag can count `propose` rounds. One root, since a
  // live project has no recorded-artifacts mirror. (Unchanged by Phase B — the live project's own
  // planning artifacts are authoritative; the companion mirror would say the same thing.)
  planning(): Planning {
    return loadPlanning([sftddDir()], readEvents());
  }

  // The live half of the turn drill-down: the artifact a log row named, read at HEAD. Path
  // containment + text/size guards live in consort.readArtifactAtHead. Always available (it is
  // what the `artifactContent` capability, which live always claims, promises), independent of any
  // companion — the point-in-time per-turn snapshot is the companion's `file()` below.
  artifactAtHead(rel: string): ArtifactContent {
    return readArtifactAtHead(rel);
  }

  // --- companion-backed drill-down (Phase B) ---
  //
  // Each delegates to a fresh volatile ReplaySource over the record dir. The `?? empty` fallbacks
  // are defensive only: /api/turn, /api/step-outputs and /api/state all gate on the capability +
  // method presence, and the capability is present only when the companion is readable — so in
  // practice these are called only when companion() is non-null. The fallback keeps them
  // type-total for the vanishing-companion race rather than throwing.

  correspondenceSummary(upTo?: number, recentCount?: number): NonNullable<SourceMeta["correspondence"]> {
    const rec = this.companion();
    if (!rec) return { recent: [] };
    // `upTo` indexes THIS source's live agent-log; the companion's mirror log is a different
    // length (it starts at the recording, the live log carries prior features too). So resolve the
    // playhead's horizon HERE, against the live events, and hand the companion the timestamp — it
    // must not re-derive from its own mirror or scrubbed correspondence would misalign with the
    // transport. Mirrors ReplaySource's own index→horizon math so the live edge and every scrub
    // position agree with the event stream.
    const events = this.events();
    const at = upTo === undefined ? events.length : Math.max(0, Math.min(Math.floor(upTo), events.length));
    const horizon = at > 0 ? events[at - 1]?.timestamp ?? null : null;
    return rec.correspondenceSummary(undefined, recentCount, horizon);
  }

  stepOutputs(node: string, feature?: string | null): StepOutputs {
    return this.companion()?.stepOutputs(node, feature) ?? { node, feature: feature ?? null, assets: [] };
  }

  stepOutputContent(rel: string): ArtifactContent {
    return this.companion()?.stepOutputContent(rel) ?? { path: rel, kind: classify(rel), content: null, reason: "(no companion recording)" };
  }

  turn(ordinal: number): TurnDetail | null {
    return this.companion()?.turn(ordinal) ?? null;
  }

  transcript(ordinal: number): ParsedTranscript | null {
    return this.companion()?.transcript(ordinal) ?? null;
  }

  file(ordinal: number, rel: string): { kind: "code" | "artifact"; content: string | null; reason: string | null } {
    return this.companion()?.file(ordinal, rel) ?? { kind: classify(rel), content: null, reason: "(no companion recording)" };
  }

  // Whether the watched build is capturing the full record-lane corpus vs only the agent-log.
  //
  // FIXED in Phase B (the B1 spike's shipped-A3 bug): the record lane writes to a SEPARATE dir,
  // NOT the watched `.consort/` (setting RECORD_DIR to the project's own `.consort/` would corrupt
  // its agent-log via the mirror write). The old detection keyed on `.consort/turns` therefore
  // always read "not recording" in the real setup. Now it keys off the CONFIGURED companion record
  // dir being readable — the same condition that adds the transcripts/correspondence/stepOutputs
  // capabilities, so `recording:true` and full-fidelity drill-down move together and the
  // FidelityBanner (keyed on missing capabilities) hides exactly when recording is truly on.
  fidelity(): NonNullable<SourceMeta["fidelity"]> {
    return { recording: this.companion() !== null };
  }

  // Pair the LIVE event stream against the companion's recorded turns, so a ticker row that begins
  // a turn becomes an "open turn N" drill-down live — the same affordance replay has. Without this
  // the live event rows are inert (the ticker keys clickability off `correlation.recentTurns`), so
  // the only live entry points were WorkflowGraph nodes and correspondence rows.
  //
  // TWO things make this NOT a plain delegate to the companion's own correlationSummary:
  //
  //  1. INDEX SPACE. `recentTurns` is positional to the LIVE `recentEvents` the ticker renders. The
  //     companion mirror is a different-length log (it begins at the recording; the live log is
  //     prefixed with prior features' events), so its own correlation aligns to the wrong tail.
  //  2. THE F1 PREFIX. correlate() is a per-role sequential cursor (correlate.ts): feeding it the
  //     whole live log against companion turns that only exist from the recording onward would let
  //     the earlier features' `phase.start`s consume THIS run's turns and mis-pair everything. So
  //     correlate only the RECORDED SUFFIX — the live events at/after the mirror's first timestamp —
  //     then shift the pairing indices back into live-log space.
  //
  // "Log ahead of the corpus" (a role-exhausted tail — the in-flight turn isn't recorded yet) is the
  // NORMAL live edge, not drift, so it stays healthy (no DriftBanner). Only a role the companion
  // never recorded, or a kit mismatch — i.e. a RECORD_DIR pointing at a different run — is surfaced.
  correlationSummary(upTo?: number, recentCount = RECENT_EVENT_TAIL): NonNullable<SourceMeta["correlation"]> {
    const liveEvents = this.events();
    const at = upTo === undefined ? liveEvents.length : Math.max(0, Math.min(Math.floor(upTo), liveEvents.length));
    const empty = { healthy: true, message: null, paired: 0, structural: 0, unpairedEvents: 0, kitVersionMatch: null as boolean | null, recentTurns: [] as (number | null)[] };

    const rec = this.companion();
    if (!rec) return empty;
    const firstTs = rec.events()[0]?.timestamp ?? null;
    if (firstTs === null) return empty;

    // Where the recorded region begins in the live log (its events share timestamps with the mirror).
    let base = liveEvents.findIndex((e) => e.timestamp >= firstTs);
    if (base < 0) base = liveEvents.length;

    const suffix = liveEvents.slice(base, at);
    const report = correlate(suffix, rec.turns(), rec.provenance()?.kit_commit ?? null, suffix);

    // pairing eventIndex is relative to `suffix`; shift into live-log space so recentTurns lines up
    // with the LIVE recentEvents tail the ticker maps positionally.
    const byLiveIndex = new Map<number, number>();
    for (const p of report.pairings) byLiveIndex.set(base + p.eventIndex, p.turnOrdinal);
    const start = Math.max(0, at - recentCount);
    const recentTurns: (number | null)[] = [];
    for (let i = start; i < at; i++) recentTurns.push(byLiveIndex.get(i) ?? null);

    const absent = report.unpairedEvents.filter((u) => u.reason === "role-absent");
    const healthy = absent.length === 0 && report.kitVersionMatch !== false;
    return {
      healthy,
      message: healthy ? null : driftMessage(report),
      paired: report.pairings.length,
      structural: report.structural.length,
      unpairedEvents: report.unpairedEvents.length,
      kitVersionMatch: report.kitVersionMatch,
      recentTurns,
    };
  }
}

/** The process-wide live source. Stateless apart from the caches inside consort.ts. */
export const liveSource = new LiveSource();
