// The REPLAY source: a recorded corpus, read from disk.
//
// Layout (examples/sftdd-scenarios/<scenario>/ in the consort repo):
//
//   agent-log.jsonl                     the full run — same vocabulary as a live log
//   provenance.json                     kit_commit / kit_describe: the version anchor
//   turns/index.json                    126 turn descriptors
//   turns/<nnnn>-<label>/turn.json      produced[] / deleted[] / transcript summary
//   turns/<nnnn>-<label>/transcript.md  prompt / tools / reasoning
//   turns/<nnnn>-<label>/files/<path>   per-turn content snapshot of produced files
//   recorded-artifacts/**               planning, sprints, features — the snapshot half
//
// The plan's central finding is that the event log is mode-independent, so this source's job
// is narrow: hand `fold()` the same two things live does. The interesting parts are the two
// places replay knows MORE than live:
//
//   1. `turns/` — transcripts and per-turn file snapshots, which a live project has no
//      equivalent of. Hence the `transcripts` / `artifactContent` capabilities.
//   2. Historical test counts. Live cannot rewind `test-list.json` (plan §3a), but the corpus
//      snapshots it inside 14 turns, so a scrubbed replay board can show real counts as of
//      the playhead. That is what `statusIsHistorical` carries to the fold.
//
// Everything here is read lazily and cached, because `getState` runs per request while a
// corpus is immutable on disk.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { resolveContained } from "../safepath";
import { classify, readTextFile } from "../filekind";
import { correlate, driftMessage, type CorrelationReport, type TurnIndexEntry } from "../correlate";
import { RECENT_EVENT_TAIL } from "../reducer";
import { CAPABILITIES, foldSource, type Capability, type DashboardSource } from "../source";
import { loadPlanning } from "../planning";
import { loadCorrespondence, type CorrespondenceEntry } from "../correspondence";
import { STEP_OUTPUTS } from "../topology";
import type {
  AgentLogEvent,
  ArtifactContent,
  DashboardState,
  FeatureStatus,
  Planning,
  SnapshotInputs,
  SourceMeta,
  StepOutputAsset,
  StepOutputs,
} from "../types";

const REPLAY_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "timeline",
  "transport",
  "artifactPaths",
  "artifactContent", // per-turn snapshots under turns/<n>/files/
  "transcripts", // transcript.md per turn — the thing live can never offer
  "planningBacklog", // recorded-artifacts/planning/
  "stepOutputs", // recorded-artifacts deliverables grouped by lifecycle step
  "correspondence", // correspondence.jsonl, when the corpus ships one (empty tail otherwise)
  // NOT claimed:
  //   liveness      — a finished corpus has no live session; the concept is meaningless.
  //   featureStatus — there is no CLI to shell. Recorded artifacts stand in, but they are
  //                   not the authoritative live %, so the capability would overpromise.
]);

for (const c of REPLAY_CAPABILITIES) {
  if (!CAPABILITIES.includes(c)) throw new Error(`replay source declares unknown capability: ${c}`);
}

/** `provenance.json`. The version anchor that lets correlation detect a mismatched log. */
export interface Provenance {
  scenario?: string;
  captured_at?: string;
  kit_ref?: string;
  kit_commit?: string;
  kit_describe?: string;
  agent_log?: string;
  notes?: string;
}

/**
 * A turn, as `turn.json` records it.
 *
 * Most fields are OPTIONAL, which the shape has to admit rather than assume — measured across
 * the 126 turns of stockflow-rerecord: `ordinal`/`step`/`label`/`kind`/`action`/`produced`/
 * `deleted` are on all 126, but `role` on 72, `story` on 100, `transcript` on 69, `mode` on
 * only 36, and `ac` on 11. A turn is identified by `mode` OR by `story`/`ac` depending on what
 * it did (a `driver` working a story carries `story`, a `spec-author` in propose carries
 * `mode`), and 19 turns carry neither.
 */
export interface TurnDetail {
  ordinal: number;
  step: number;
  label: string;
  kind: string;
  role?: string | null;
  mode?: string | null;
  /** The story this turn worked, when it worked one. More common than `mode`. */
  story?: string | null;
  /** The acceptance criterion, for the turns that scope that tightly. */
  ac?: string | null;
  action?: Record<string, unknown>;
  // Present on all 126 turns of this corpus, but normalised to [] by `turn()` anyway: they are
  // absent-able in principle like every other field here, and an unguarded `.map` on one 500'd
  // the turn route. Guaranteed non-null on the way out, so callers need no `?? []`.
  produced: string[];
  deleted: string[];
  transcript?: { role?: string; model?: string; toolCount?: number; finalTextChars?: number };
}

/** A transcript split into its three sections, as Kevin's `parse_transcript` did. */
export interface ParsedTranscript {
  prompt: string;
  tools: string[];
  reasoning: string;
}

// File-kind + text-read rules moved to lib/filekind.ts so the live HEAD reader shares them.
// `classify` is re-exported (it is imported above for local use) because the turn route and
// tests still import it from here.
export { classify };

/**
 * Split `transcript.md` into prompt / tools / reasoning. Ported from `parse_transcript`.
 *
 * Kept faithful to the original's section handling, including stripping a ``` fence around
 * the prompt, because the corpus's transcripts are written to match it.
 */
export function parseTranscript(md: string): ParsedTranscript {
  let prompt = "";
  let reasoning = "";
  const tools: string[] = [];
  let section: "prompt" | "tools" | "reasoning" | null = null;
  let buf: string[] = [];

  const flush = () => {
    const text = buf.join("\n").trim();
    if (section === "prompt") {
      let t = text;
      // Strip a leading fence line, then a trailing one.
      if (t.startsWith("```")) t = t.includes("\n") ? t.slice(t.indexOf("\n") + 1) : "";
      if (t.trimEnd().endsWith("```")) t = t.trimEnd().slice(0, -3).trimEnd();
      prompt = t;
    } else if (section === "reasoning") {
      reasoning = text;
    }
  };

  for (const line of md.split("\n")) {
    const h = line.trim().toLowerCase();
    if (h.startsWith("## prompt")) {
      flush();
      section = "prompt";
      buf = [];
      continue;
    }
    if (h.startsWith("## tools used")) {
      flush();
      section = "tools";
      buf = [];
      continue;
    }
    if (h.startsWith("## final reasoning")) {
      flush();
      section = "reasoning";
      buf = [];
      continue;
    }
    if (section === "tools") {
      const s = line.trim();
      if (s.startsWith("- ")) tools.push(s.slice(2).trim());
    } else {
      buf.push(line);
    }
  }
  flush();
  return { prompt, tools, reasoning };
}

/** A produced file's snapshot content, or why it isn't available. Ported from `read_file_content`. */
export function readFileContent(
  turnDir: string,
  rel: string,
): { content: string | null; reason: string | null } {
  // Containment check, BEFORE any read. `rel` ultimately originates from a request parameter
  // (TurnPanel fetches by path), so this is the boundary between attacker input and the
  // filesystem — it has to survive both a lexical `../` / absolute-path escape and a symlink
  // that a lexical check can't see. `resolveContained` (lib/safepath.ts) is the one audited
  // implementation of that guard, shared with the live HEAD-artifact reader; null means either
  // escaped or non-existent, which are deliberately indistinguishable — so the reason below
  // does not reveal which.
  const f = resolveContained(resolve(turnDir, "files"), rel);
  if (f === null) return { content: null, reason: "(not captured in this turn's snapshot)" };

  // The read/size/text guards live in filekind.ts, shared with the live reader. `readTextFile`
  // returns its own generic reasons; map its containment-independent "(not a file)"/"(unreadable)"
  // onto this reader's snapshot wording so the turn panel's copy is unchanged.
  const r = readTextFile(f, rel);
  if (r.reason === "(not a file)" || r.reason === "(unreadable)") {
    return { content: null, reason: "(not captured in this turn's snapshot)" };
  }
  return r;
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/** True when `abs` is an existing regular file. Used to keep directories out of a file list. */
function isFile(abs: string): boolean {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

/**
 * Root-relative paths of the files under `absDir`, recursively, capped.
 *
 * For the `dir` step-output specs (`cycles/<F>/`, `deploy/`, `sprints/`): the honest-GREEN cycle
 * and deploy write a tree of files, so the drill-down browses them rather than the map naming each.
 * Sorted for a stable panel across reads, and capped so a pathological tree can't stall the read
 * or flood the UI. Paths are returned relative to `root` so they round-trip through
 * `stepOutputContent`. `absDir` is assumed already containment-checked by the caller.
 */
function listFilesUnder(root: string, absDir: string, cap = 60): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (out.length >= cap) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (out.length >= cap) break;
      const abs = join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile()) out.push(relative(root, abs));
    }
  };
  walk(absDir);
  return out;
}

/** The corpus dir from the environment. Mirrors `projectDir()` in consort.ts. */
export function corpusDir(): string {
  return process.env.CONSORT_CORPUS_DIR ?? "";
}

interface CorpusCache {
  events?: AgentLogEvent[];
  turns?: TurnIndexEntry[];
  provenance?: Provenance | null;
  testLists?: { ordinal: number; feature: string; status: FeatureStatus }[];
  planning?: Planning;
  correspondence?: CorrespondenceEntry[];
}

/**
 * Per-corpus-directory read cache, shared across ReplaySource instances.
 *
 * Safe because a recorded corpus is immutable: unlike a live project, nothing appends to it
 * while the dashboard watches. Keyed by directory so two corpora can't blend, and exported for
 * tests that need to prove a cold read.
 */
const CORPUS_CACHES = new Map<string, CorpusCache>();

/** Drop cached corpus reads. For tests; a corpus doesn't change under a running server. */
export function clearCorpusCache(): void {
  CORPUS_CACHES.clear();
}

export class ReplaySource implements DashboardSource {
  readonly mode = "replay" as const;
  readonly capabilities = REPLAY_CAPABILITIES;

  // A corpus is immutable, so every read is cached for the process lifetime.
  //
  // The cache is keyed by DIRECTORY at module scope rather than held per instance, because
  // `resolveSource()` constructs a fresh ReplaySource on every request (deliberately — reading
  // CONSORT_CORPUS_DIR at import time is a trap, and a test pins that). A per-instance cache
  // would therefore never survive a single request: measured, a cold `getState(200)` is ~18 ms
  // against ~0 ms warm, and page.tsx polls once a second, so every poll would re-read the
  // 158 KB log, the 34 KB index, all 126 turn.json files and every test-list.json.
  private get cache(): CorpusCache {
    // A `volatile` corpus is a LIVE-GROWING record dir (a LiveSource companion), not a finished
    // recording — turns/, correspondence.jsonl and the mirrored log keep being appended while the
    // dashboard watches. The immutability assumption above is FALSE there, so return a fresh,
    // unshared cache each access: every read recomputes from disk (the `x ??= compute()` idiom
    // throughout still holds — it just never memoizes). Safe because turn()/transcript()/file()/
    // stepOutputs() already read disk directly; only events/turns/correspondence/testLists route
    // through here, and those MUST be fresh for a growing corpus. Reads stay cheap (on-demand
    // drill-downs; correspondence is a few hundred rows on the 1 Hz poll).
    if (this.volatile) return {};
    let c = CORPUS_CACHES.get(this.dir);
    if (!c) CORPUS_CACHES.set(this.dir, (c = {}));
    return c;
  }

  // `volatile` marks a live-growing companion corpus (see the cache getter). Defaults false: a
  // corpus opened as a replay SOURCE is immutable and cached for the process lifetime.
  constructor(private readonly dir: string = corpusDir(), private readonly volatile = false) {}

  describe(): string {
    const p = this.provenance();
    // Prefer the scenario name — "stockflow-rerecord" is what a viewer recognises, and the
    // absolute path is noise in a header.
    return p?.scenario ? `${p.scenario} (replay)` : this.dir || "(no corpus configured)";
  }

  available(): boolean {
    return !!this.dir && existsSync(this.logPath()) && existsSync(this.turnsIndexPath());
  }

  unavailableReason(): string | null {
    if (this.available()) return null;
    if (!this.dir) return "CONSORT_CORPUS_DIR is not set — no corpus to replay.";
    if (!existsSync(this.dir)) return `Corpus directory not found: ${this.dir}`;
    // Name the missing piece: a corpus without a log is the exact Phase 0 situation, and it
    // deserves a better message than "unavailable".
    if (!existsSync(this.logPath())) {
      return `No agent-log.jsonl in ${this.dir} — this corpus ships turns but no run log, so there is no timeline to replay.`;
    }
    return `No turns/index.json in ${this.dir} — cannot correlate the log to recorded turns.`;
  }

  events(): AgentLogEvent[] {
    if (this.cache.events) return this.cache.events;
    let raw = "";
    try {
      raw = readFileSync(this.logPath(), "utf8");
    } catch {
      return (this.cache.events = []);
    }
    // Same tolerant parse live uses: skip malformed lines rather than failing the whole run.
    const events = raw
      .split("\n")
      .filter((l) => l.trim())
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as AgentLogEvent];
        } catch {
          return [];
        }
      });
    return (this.cache.events = events);
  }

  snapshot(events: AgentLogEvent[], generatedAt: string, upTo?: number): SnapshotInputs {
    const at = upTo === undefined ? events.length : Math.max(0, Math.min(Math.floor(upTo), events.length));
    const feature = activeFeature(events.slice(0, at));
    const status = this.statusAt(feature, at, events);

    return {
      projectDir: this.describe(),
      // A corpus has no next.json: it is the live orchestrator's "what should happen next"
      // file, which a finished run has no use for. The fold falls back to the log for
      // everything next.json would have supplied.
      next: null,
      status,
      handbacks: [], // .handback/ is live routing state; a finished run has none outstanding.
      sessionAgeMs: Infinity, // no live session — this is why `liveness` isn't claimed.
      pendingPermission: null,
      generatedAt,
      // The counts came from a snapshot taken at or before the playhead, so they describe
      // the folded window rather than "now". This is the capability live cannot have.
      statusIsHistorical: status !== null,
    };
  }

  getState(upTo?: number, pinnedFeature?: string | null): DashboardState {
    return foldSource(this, upTo, pinnedFeature);
  }

  // Planning reads the recorded mirror under `recorded-artifacts/`: planning/, sprints/ and
  // features/ all live there, the same layout live has under `.sftdd/`. Cached like every other
  // corpus read — a corpus is immutable, and page.tsx polls, so this must not re-parse per poll.
  // The log drives the re-plan flag; passing this.events() reuses the already-cached parse.
  planning(): Planning {
    if (this.cache.planning) return this.cache.planning;
    const root = join(this.dir, "recorded-artifacts");
    return (this.cache.planning = loadPlanning([root], this.events()));
  }

  // --- step outputs: the deliverables each lifecycle step produced ---
  //
  // Reads the recorded mirror under `recorded-artifacts/` (planning/, design/, features/<F>/,
  // cycles/<F>/, deploy/, sprints/ — the same tree a live run keeps under `.consort/`). Which
  // files belong to which lifecycle node is topology's STEP_OUTPUTS; here they are resolved
  // against THIS corpus and anything the run didn't produce is dropped, so the map can name more
  // than any single run emits without leaving dead links. Not cached: a step-output list is a
  // handful of existence checks, reached only on a node click rather than on the 1 Hz poll.

  /** The deliverables listed for a lifecycle node, scoped to `feature` for the per-feature entries. */
  stepOutputs(node: string, feature?: string | null): StepOutputs {
    const root = join(this.dir, "recorded-artifacts");
    const specs = STEP_OUTPUTS[node] ?? [];
    const assets: StepOutputAsset[] = [];
    const seen = new Set<string>();

    const add = (rel: string) => {
      if (seen.has(rel)) return;
      seen.add(rel);
      assets.push({ path: rel, name: basename(rel), kind: classify(rel) });
    };

    for (const spec of specs) {
      if (spec.perFeature && !feature) continue;
      // `<F>` → the feature in scope. split/join rather than replaceAll so the lib target the
      // repo compiles under doesn't matter.
      const rel = feature ? spec.path.split("<F>").join(feature) : spec.path;
      const abs = resolveContained(root, rel);
      if (abs === null) continue; // escaped containment or absent — both dropped, as elsewhere
      if (spec.dir) {
        for (const child of listFilesUnder(root, abs)) add(child);
      } else if (isFile(abs)) {
        add(rel);
      }
    }
    return { node, feature: feature ?? null, assets };
  }

  /**
   * One step-output file's content, by the root-relative path `stepOutputs` handed out.
   *
   * `rel` round-trips from the API (`?path=`), so it is untrusted — `resolveContained` is the same
   * audited guard the per-turn reader uses, rooted at `recorded-artifacts/` here.
   */
  stepOutputContent(rel: string): ArtifactContent {
    const root = join(this.dir, "recorded-artifacts");
    const abs = resolveContained(root, rel);
    if (abs === null) {
      return { path: rel, kind: classify(rel), content: null, reason: "(not found in recorded artifacts)" };
    }
    const r = readTextFile(abs, rel);
    return { path: rel, kind: classify(rel), content: r.content, reason: r.reason };
  }

  // --- corpus-only surface, for Phase 3's TurnPanel ---

  /** `turns/index.json`, ordinal order. */
  turns(): TurnIndexEntry[] {
    if (this.cache.turns) return this.cache.turns;
    const raw = readJson<{ turns?: TurnIndexEntry[] }>(this.turnsIndexPath());
    return (this.cache.turns = raw?.turns ?? []);
  }

  provenance(): Provenance | null {
    if (this.cache.provenance !== undefined) return this.cache.provenance;
    return (this.cache.provenance = readJson<Provenance>(join(this.dir, "provenance.json")));
  }

  /**
   * The wire-sized version of `correlation()`, for the board's drift banner.
   *
   * Only the summary crosses the wire: the UI needs to know whether to trust a turn, not the
   * 71 individual pairings, and this rides along on every 1 Hz poll.
   */
  correlationSummary(upTo?: number, recentCount = RECENT_EVENT_TAIL): NonNullable<SourceMeta["correlation"]> {
    const r = this.correlation(upTo);
    const events = this.events();
    const at = upTo === undefined ? events.length : Math.max(0, Math.min(Math.floor(upTo), events.length));

    // Align turn ordinals to the same tail the fold ships as `recentEvents`, so the client can
    // index the two together without computing absolute positions itself.
    const start = Math.max(0, at - recentCount);
    const byEvent = new Map(r.pairings.map((p) => [p.eventIndex, p.turnOrdinal]));
    const recentTurns: (number | null)[] = [];
    for (let i = start; i < at; i++) recentTurns.push(byEvent.get(i) ?? null);

    return {
      healthy: r.healthy,
      message: driftMessage(r),
      paired: r.pairings.length,
      structural: r.structural.length,
      unpairedEvents: r.unpairedEvents.length,
      kitVersionMatch: r.kitVersionMatch,
      recentTurns,
    };
  }

  /** How well the log fits the corpus. Surface `driftMessage()` in the UI, don't hide it. */
  correlation(upTo?: number): CorrelationReport {
    const events = this.events();
    const at = upTo === undefined ? events.length : Math.max(0, Math.min(Math.floor(upTo), events.length));
    // Full log passed as the 4th argument so the kit-version check still fires at upTo = 0.
    return correlate(events.slice(0, at), this.turns(), this.provenance()?.kit_commit ?? null, events);
  }

  // --- correspondence: the HIL ↔ orchestrator conversation, folded into the timeline ---

  /** `correspondence.jsonl`, parsed and cached. Empty when the corpus ships none. */
  correspondence(): CorrespondenceEntry[] {
    if (this.cache.correspondence) return this.cache.correspondence;
    return (this.cache.correspondence = loadCorrespondence(this.dir));
  }

  /**
   * The correspondence tail as of the playhead, shaped for the ticker.
   *
   * Filtered by TIMESTAMP against the playhead's own event, so the conversation rewinds with the
   * transport exactly like the event stream does. `at <=` the horizon keeps an exchange that
   * happened at the same instant as the playhead event. Tail-capped to match `recentEvents`, and
   * carrying each exchange's completion `outcome` — the per-action signal the agent-log lacks.
   */
  correspondenceSummary(
    upTo?: number,
    recentCount = RECENT_EVENT_TAIL,
    // `horizonOverride` lets a LIVE source supply the playhead's timestamp DIRECTLY. When this
    // corpus is a companion record dir (see LiveSource), `upTo` indexes the LIVE agent-log, not
    // this mirror — the two logs share timestamps but not length/indexing (the live log is
    // prefixed with prior features' events). Resolving the horizon here from `this.events()` would
    // clamp a live index against the mirror and pick the wrong event, so the correspondence tail
    // wouldn't rewind in lockstep with the transport. `undefined` → resolve from `upTo` as a pure
    // replay source does; `string | null` → use it verbatim (null means "before anything").
    horizonOverride?: string | null,
  ): NonNullable<SourceMeta["correspondence"]> {
    const all = this.correspondence();
    if (all.length === 0) return { recent: [] };

    let horizon: string | null;
    if (horizonOverride !== undefined) {
      horizon = horizonOverride;
    } else {
      const events = this.events();
      const at = upTo === undefined ? events.length : Math.max(0, Math.min(Math.floor(upTo), events.length));
      // The playhead's horizon: the timestamp of the last folded event. Before the first event
      // (at === 0) nothing has happened yet, so no correspondence shows.
      horizon = at > 0 ? events[at - 1]?.timestamp ?? null : null;
    }

    const upto = horizon === null ? [] : all.filter((e) => e.at <= horizon);
    const recent = upto.slice(-recentCount).map((e) => ({
      at: e.at,
      direction: e.direction,
      phase: e.phase,
      kind: e.kind,
      by: e.by,
      // The request is the substance for orchestrator prompts; a kickoff/intake's human reply
      // (responseMd) is the interesting half, so prefer it when the request carried no markdown.
      text: e.promptMd ?? e.responseMd ?? "",
      ordinal: e.ordinal,
      outcome: e.approved ? ("approved" as const) : e.validated ? ("validated" as const) : null,
    }));
    return { recent };
  }

  /** A turn's full record, or null when the ordinal isn't in this corpus. */
  turn(ordinal: number): TurnDetail | null {
    const entry = this.turns().find((t) => t.ordinal === ordinal);
    if (!entry) return null;
    const raw = readJson<TurnDetail>(join(this.dir, "turns", entry.dir, "turn.json"));
    if (!raw) return null;
    // Normalise the two list fields here, once, so every consumer can iterate them without a
    // guard. Missing `produced` previously 500'd the turn route, and missing `deleted` would
    // have thrown in the client's FilesView — one fix at the boundary beats two at the edges.
    return { ...raw, produced: raw.produced ?? [], deleted: raw.deleted ?? [] };
  }

  /** A turn's transcript, split into sections. Null when the turn recorded none. */
  transcript(ordinal: number): ParsedTranscript | null {
    const entry = this.turns().find((t) => t.ordinal === ordinal);
    if (!entry || !entry.hasTranscript) return null;
    try {
      return parseTranscript(readFileSync(join(this.dir, "turns", entry.dir, "transcript.md"), "utf8"));
    } catch {
      return null;
    }
  }

  /** A file's content as snapshotted by a specific turn, with `classify` applied. */
  file(ordinal: number, rel: string): { kind: "code" | "artifact"; content: string | null; reason: string | null } {
    const entry = this.turns().find((t) => t.ordinal === ordinal);
    if (!entry) return { kind: classify(rel), content: null, reason: "(unknown turn)" };
    return { kind: classify(rel), ...readFileContent(join(this.dir, "turns", entry.dir), rel) };
  }

  // --- historical test counts ---

  /**
   * The feature status as of event index `at`, from the newest per-turn `test-list.json`
   * snapshot at or before the playhead.
   *
   * This is what makes replay's test bar honest while scrubbing. The mapping from event index
   * to turn ordinal comes from `correlate`, so it inherits that module's validation: a
   * mis-paired log cannot silently attribute test counts to the wrong point in the run.
   *
   * Returns null when no snapshot exists at or before this position — the run genuinely had
   * no test list yet, and the fold's `testsHistorical: false` path correctly hides the bar.
   */
  private statusAt(feature: string | null, at: number, events: AgentLogEvent[]): FeatureStatus | null {
    if (!feature) return null;
    const lists = this.testLists();
    if (lists.length === 0) return null;

    // Which turn is the playhead at or past? Only paired events have a turn, so walk the
    // pairings inside the window.
    //
    // Take the MAXIMUM ordinal, not the last pairing's: pairings are ordered by eventIndex
    // while ordinals come from independent per-role cursors, so they are not guaranteed
    // monotonic. If role A's turn 50 paired at event 100 and role B's turn 20 at event 101,
    // trusting the last one would cap at 20 and silently discard every snapshot from turns
    // 21–50. This corpus happens to be monotone (0 inversions across 71 pairings), which is
    // exactly why the sweep test can't catch it — hence the explicit max.
    const pairings = correlate(events.slice(0, at), this.turns(), this.provenance()?.kit_commit ?? null, events).pairings;
    let maxOrdinal = -1;
    for (const p of pairings) if (p.turnOrdinal > maxOrdinal) maxOrdinal = p.turnOrdinal;

    // Newest snapshot for this feature from a turn that has FINISHED.
    //
    // Strict `<`, not `<=`: a pairing marks where a turn STARTS, but the file it snapshots is
    // written during the turn. Counting a turn's own snapshot the moment it begins showed test
    // totals ~2 events before the log's `artifact.written` for the same file (measured:
    // testTotal jumped to 17 at event 44, the artifact.written is event 45) — the future
    // leaking into the past, which is the thing this whole module is careful about. Requiring
    // a LATER turn to have started means the snapshotting turn is provably done.
    //
    // At the live edge this costs nothing: maxOrdinal is the run's last turn, which is past
    // every snapshot (113 < 115 on this corpus), so the final counts still show.
    let best: { ordinal: number; status: FeatureStatus } | null = null;
    for (const l of lists) {
      if (l.feature !== feature) continue;
      if (l.ordinal >= maxOrdinal) continue;
      if (!best || l.ordinal > best.ordinal) best = { ordinal: l.ordinal, status: l.status };
    }
    return best?.status ?? null;
  }

  /**
   * Every `test-list.json` the corpus snapshots inside a turn, as `FeatureStatus` values.
   *
   * Scans turn dirs once and caches. Measured on stockflow-rerecord: 14 snapshots across the
   * two features, tracking the list growing 17 → 23 → 32 items as stories are broken down.
   */
  private testLists(): { ordinal: number; feature: string; status: FeatureStatus }[] {
    if (this.cache.testLists) return this.cache.testLists;
    const out: { ordinal: number; feature: string; status: FeatureStatus }[] = [];

    for (const t of this.turns()) {
      const detail = readJson<TurnDetail>(join(this.dir, "turns", t.dir, "turn.json"));
      for (const rel of detail?.produced ?? []) {
        // e.g. `.consort/features/F1-stock-visibility/test-list.json` (v0.3.7) or the legacy
        // `.sftdd/`/`.tdd/` roots — a corpus carries whichever root it was captured under.
        const m = /^\.(?:consort|sftdd|tdd)\/features\/([^/]+)\/test-list\.json$/.exec(rel);
        if (!m) continue;
        const raw = readJson<{ feature_id?: string; items?: { id: string; status?: string }[] }>(
          join(this.dir, "turns", t.dir, "files", rel),
        );
        if (!raw?.items) continue;
        out.push({ ordinal: t.ordinal, feature: m[1], status: toFeatureStatus(m[1], raw.items) });
      }
    }
    return (this.cache.testLists = out);
  }

  private logPath(): string {
    // provenance.json names the log, so a corpus that renames it still works; fall back to
    // the conventional name for the pre-provenance corpora.
    const named = this.provenance()?.agent_log;
    return join(this.dir, named && !named.includes("..") ? named : "agent-log.jsonl");
  }

  private turnsIndexPath(): string {
    return join(this.dir, "turns", "index.json");
  }
}

/** Roll a recorded test-list into the `test_list` shape the fold consumes. */
function toFeatureStatus(feature: string, items: { id: string; status?: string }[]): FeatureStatus {
  const by_status: Record<string, number> = {};
  for (const i of items) {
    const s = i.status ?? "pending";
    by_status[s] = (by_status[s] ?? 0) + 1;
  }
  const total = items.length;
  const done = (by_status.green ?? 0) + (by_status.refactored ?? 0);
  return {
    feature_id: feature,
    test_list: {
      total,
      by_status,
      completion_pct: total ? Math.round((done / total) * 100) : 0,
    },
    // Deliberately NOT supplying `stories`, `gates` or `derived_phase`: the fold reconstructs
    // all three from the log prefix, which is genuinely historical, whereas the corpus's
    // recorded-artifacts describe only the run's END state. Handing over end-state stories
    // would reintroduce exactly the bug PR #10 fixed — a finished story rendering as done at
    // event 12. Test counts are the one thing the log cannot supply, so they are the one
    // thing this fills in.
  };
}

/** The newest feature_id in a window. Mirrors the fold's own rule, incl. skipping `reasoning`. */
function activeFeature(events: AgentLogEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    // `reasoning` events carry an unreliable feature_id — in this corpus three hold a story
    // id or a truncated "F1". Skip them structurally, as derive.ts does.
    if (e.event === "reasoning") continue;
    const f = (e.metadata as Record<string, unknown> | undefined)?.feature_id;
    if (typeof f === "string" && f) return f;
  }
  return null;
}

// NOTE: there is deliberately no `replaySource` singleton to mirror `liveSource`.
//
// `new ReplaySource()` reads CONSORT_CORPUS_DIR through its default argument, so a
// module-level instance would pin whatever the environment said at IMPORT time — the exact
// trap `sources/index.ts` documents avoiding and `source.test.ts` asserts against. Construct
// one per use (`new ReplaySource()`, or `resolveSource("replay")`); the read cache is keyed by
// directory at module scope, so doing so costs nothing.
