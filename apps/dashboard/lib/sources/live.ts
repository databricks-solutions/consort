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
// One path: a recorded corpus can be replayed, a live build can be seen. A live build now records
// every turn into its OWN `.consort/` (drive.cli/executor: turns/ + transcripts + a produced/deleted
// INDEX; NO content snapshot), so this source reads its own turns exactly as a ReplaySource reads a
// corpus – the companion IS `.consort` (or an external RECORD_DIR capture when one is set).
//
//   Before the first turn lands — `agent-log.jsonl` + produced artifacts only. transcripts /
//     correspondence stay off (no turns/index.json yet); the FidelityBanner shows "not captured yet".
//   Once `.consort/turns/` has a turn — the source gains transcripts + correspondence, DELEGATING
//     turn()/transcript()/correspondence to a ReplaySource over `.consort`. Two content differences
//     from a full capture, because the live record is index-only: turn FILE content is read at HEAD
//     (readProjectFileAtHead) rather than a frozen per-turn copy, and stepOutputs reads the live
//     `.consort/` tree at HEAD (no recorded-artifacts mirror). Not historically accurate – by design.
//   artifactContent is HEAD-only throughout (the file `artifact.written` named, as it is NOW).

import { existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import {
  noSftddMessage,
  projectDir,
  readArtifactAtHead,
  readProjectFileAtHead,
  readEvents,
  readSnapshot,
  recordDir,
  recordDirExplicit,
  sftddDir,
} from "../consort";
import { resolveContained } from "../safepath";
import { STEP_OUTPUTS } from "../topology";
import { loadPlanning } from "../planning";
import { CAPABILITIES, foldSource, type Capability, type DashboardSource } from "../source";
import { ReplaySource, classify, listFilesUnder, expandStepSpec, type ParsedTranscript, type TurnDetail } from "./replay";
import type { StepOutputAsset } from "../types";
import { correlate, driftMessage, driftSeverity, latestTurnByRole, latestTurnByStep } from "../correlate";
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
  // A lifecycle step's deliverables, served from the live project's `.consort/` tree at HEAD (see
  // stepOutputs below). Unlike transcripts/correspondence – which genuinely need a per-turn corpus ,
  // the deliverables a step produced live ON DISK, so "click a role/node → read what it produced"
  // works on ANY live board, not only one with a companion recording. This is what makes clicking
  // the product-owner surface its intake docs (product-overview / nfrs / design-brief).
  "stepOutputs",
]);

// With a companion record-lane corpus, the live board additionally gains the two replay-grade
// drill-down capabilities that DO need a per-turn corpus (a live project has no transcript / no
// correspondence.jsonl). stepOutputs is already in the base set (served from HEAD); the companion
// simply gives its reads the recorded per-turn snapshot instead. Precomputed once; the getter picks
// between the two sets by whether a companion is present-and-readable right now.
const LIVE_CAPABILITIES_RECORDING: ReadonlySet<Capability> = new Set<Capability>([
  ...LIVE_CAPABILITIES,
  "transcripts",
  "correspondence",
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
    // The turns corpus to read: an explicit external RECORD_DIR (a full capture), ELSE the project's
    // OWN `.consort` – which the live build now always records into (turns/ + transcripts; index
    // only, no content snapshot). One path: a live board reads its own turns exactly as replay reads
    // a corpus. Volatile because `.consort/turns/` is GROWING while we watch. Surfaced only once
    // there's a readable turns/index.json (before the first turn lands, available() is false → the
    // rich capabilities stay off and the banner shows "not captured yet").
    const dir = recordDir() || sftddDir();
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

  // A lifecycle step's deliverables, read from the live project's `.consort/` tree at HEAD. Always
  // HEAD, even though the companion is now the project's own `.consort` corpus: the live record is
  // INDEX-only (no recorded-artifacts mirror), and the deliverables live on disk at HEAD anyway – so
  // HEAD is both the only source and the right one. An empty list is honest (the step hasn't produced
  // them yet). An external CAPTURE (RECORD_DIR) is the historically-accurate path; a live board is not.
  stepOutputs(node: string, feature?: string | null): StepOutputs {
    return this.stepOutputsAtHead(node, feature ?? null);
  }

  stepOutputContent(rel: string): ArtifactContent {
    // Read the deliverable from the live project at HEAD (containment-guarded, same reader as the
    // artifact drill-down). classify AS RESOLVED under `.consort/`, matching HEAD.
    return readArtifactAtHead(rel);
  }

  // The HEAD half of stepOutputs: resolve each STEP_OUTPUTS spec for `node` against the live
  // `.consort/` root and keep the ones that exist NOW (a `dir` spec expands to its files). Mirrors
  // ReplaySource.stepOutputs, but rooted at the live tree instead of `recorded-artifacts/`, and
  // containment-guarded (the same guard the HEAD artifact reader uses) since paths carry `<F>`.
  private stepOutputsAtHead(node: string, feature: string | null): StepOutputs {
    const root = sftddDir();
    const specs = STEP_OUTPUTS[node] ?? [];
    const assets: StepOutputAsset[] = [];
    const seen = new Set<string>();
    const add = (rel: string) => {
      if (seen.has(rel)) return;
      seen.add(rel);
      assets.push({ path: rel, name: basename(rel), kind: classify(basename(root) + "/" + rel) });
    };
    for (const spec of specs) {
      // expandStepSpec substitutes <F> (feature) and <S> (each story dir) — shared with ReplaySource
      // so live + replay expand identically; each path is then existence-checked at HEAD below.
      for (const rel of expandStepSpec(root, spec, feature)) {
        const abs = resolveContained(root, rel);
        if (abs === null) continue; // escaped containment or absent
        try {
          const st = statSync(abs);
          if (spec.dir && st.isDirectory()) {
            for (const child of listFilesUnder(root, abs)) add(child);
          } else if (st.isFile()) {
            add(rel);
          }
        } catch {
          /* not present at HEAD — dropped, as elsewhere */
        }
      }
    }
    return { node, feature, assets };
  }

  turn(ordinal: number): TurnDetail | null {
    return this.companion()?.turn(ordinal) ?? null;
  }

  transcript(ordinal: number): ParsedTranscript | null {
    return this.companion()?.transcript(ordinal) ?? null;
  }

  file(ordinal: number, rel: string): { kind: "code" | "artifact"; content: string | null; reason: string | null } {
    const rec = this.companion();
    if (!rec) return { kind: classify(rel), content: null, reason: "(no companion recording)" };
    // A LIVE-INDEX turn (snapshotted:false) copied no content – read the produced file at HEAD (may
    // have changed since; not historically accurate, by design). A CAPTURE turn (external RECORD_DIR)
    // has the frozen per-turn snapshot, so read that.
    const turn = rec.turn(ordinal) as (TurnDetail & { snapshotted?: boolean }) | null;
    if (turn && turn.snapshotted === false) return readProjectFileAtHead(rel);
    return rec.file(ordinal, rel);
  }

  // Whether the watched build has a readable turns corpus to drill into (vs only the agent-log).
  //
  // A live build now records its turns into its OWN `.consort/turns/` (index + transcripts), so the
  // companion is that corpus once its first turn lands (or an external RECORD_DIR capture, if set).
  // Keyed off the companion being readable – the same condition that adds transcripts/correspondence
  // – so `recording:true` and the drill-down move together and the FidelityBanner (keyed on missing
  // capabilities) hides exactly when a turns corpus exists. Before the first turn, available() is
  // false → recording:false → the banner shows "not captured yet".
  fidelity(): NonNullable<SourceMeta["fidelity"]> {
    // `recording` = a companion corpus is readable (drives the drill-down + FidelityBanner).
    // `explicit` = that record dir came from env, not the auto-detected `.consort/record` lane — the
    // mode badge treats only an explicit capture as "RECORDING".
    return { recording: this.companion() !== null, explicit: recordDirExplicit() };
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
    const empty = { healthy: true, severity: "ok" as const, message: null, paired: 0, structural: 0, unpairedEvents: 0, kitVersionMatch: null as boolean | null, recentTurns: [] as (number | null)[] };

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

    // A role's FIRST turn is in-flight on the live edge too: its phase.start lands in the log before
    // its turn is recorded to the companion, so correlate() reports it role-ABSENT — the exact same
    // code a genuinely-different run produces (an active architect-reviewer with no recorded turn yet
    // lit a false "corpus pairing unreliable" banner). Distinguish them by POSITION: an unpaired
    // event with NO later PAIRED event is the trailing in-flight edge (healthy, like a role-exhausted
    // tail); only a role-absent event that a later event has already paired PAST is real corpus
    // disagreement. (With zero pairings, lastPairedIdx = -1, so nothing counts as drift — the very
    // start of a recording never alarms.)
    const lastPairedIdx = report.pairings.reduce((m, p) => Math.max(m, p.eventIndex), -1);
    const absent = report.unpairedEvents.filter((u) => u.reason === "role-absent" && u.eventIndex < lastPairedIdx);
    const healthy = absent.length === 0 && report.kitVersionMatch !== false;
    // Severity must track THIS LOCAL `healthy`, not `report.healthy`. `report.healthy` also trips on
    // a role-exhausted tail (the in-flight turn the companion hasn't recorded yet) — the NORMAL live
    // edge this source deliberately treats as healthy. Keying `driftSeverity(report)` off it directly
    // would return "info" and surface the banner (with a null message) on every recording live board.
    // So short-circuit to "ok" whenever the local rule is healthy; only classify warning/info when it
    // isn't (which, by construction, means role-absent or a kit mismatch — exactly what driftSeverity
    // separates).
    const severity = healthy ? "ok" : driftSeverity(report);
    return {
      healthy,
      severity,
      message: healthy ? null : driftMessage(report),
      paired: report.pairings.length,
      structural: report.structural.length,
      unpairedEvents: report.unpairedEvents.length,
      kitVersionMatch: report.kitVersionMatch,
      recentTurns,
      // Full-corpus role → latest reached turn (companion turns), so a role/lane card opens that
      // role's turn even when it is older than the tail. Scoped to the reached (paired) ordinals.
      latestTurnByRole: latestTurnByRole(rec.turns(), new Set(report.pairings.map((p) => p.turnOrdinal))),
      latestTurnByStep: latestTurnByStep(rec.turns(), new Set(report.pairings.map((p) => p.turnOrdinal))),
    };
  }
}

/** The process-wide live source. Stateless apart from the caches inside consort.ts. */
export const liveSource = new LiveSource();
