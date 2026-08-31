// Server-side READER for a Consort project's .sftdd state.
//
// This module owns all I/O: reading files, shelling out to the feature-status CLI, and
// scanning Claude transcripts for liveness. The derivation itself lives in derive.ts
// (pure functions over events) and reducer.ts (the fold that composes them), so the
// board can be evaluated at any point in the log and tested without a project on disk.
//
// Pure read-only observer: it never writes to the watched project.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import {
  AgentLogEvent,
  ArtifactContent,
  DashboardState,
  FeatureStatus,
  NextJson,
  PendingPermission,
  Role,
  SnapshotInputs,
} from "./types";
import { ROLE_SET } from "./derive";
import { classify, readTextFile } from "./filekind";
import { resolveContained } from "./safepath";
import { emptyState, fold, ENABLE_PERMISSION_BANNER } from "./reducer";

// Re-exported so existing importers (and tests) keep working after the split.
export {
  resolverFor,
  findPendingGate,
  computeDesignPhases,
  computeStories,
  storyStage,
  designComplete,
  reduceAgents,
} from "./derive";
export { fold } from "./reducer";

// Authoritative issue→resolver attribution: Consort writes .handback/<role>[.<story>].md
// naming EXACTLY the role that must fix a failed contract. Reading these beats guessing
// from a blocker's source string. Returns a map keyed by story (or "" for feature-scoped)
// → the routed-to role. Filename convention (kit drive.cli.js): `${role}${story?`.${story}`:""}.md`.
function readHandbacks(feature: string): { role: Role; story: string | null }[] {
  if (!isSafeSegment(feature)) return []; // untrusted id; refuse to build a traversal path
  const dir = join(sftddDir(), "features", feature, ".handback");
  if (!existsSync(dir)) return [];
  const out: { role: Role; story: string | null }[] = [];
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      const base = f.slice(0, -3); // drop .md
      // role is the first dotted segment that is a known role; the rest is the story id
      const dot = base.indexOf(".");
      const role = (dot === -1 ? base : base.slice(0, dot)) as Role;
      if (!ROLE_SET.has(role)) continue;
      const story = dot === -1 ? null : base.slice(dot + 1);
      out.push({ role, story: story || null });
    }
  } catch {
    return [];
  }
  return out;
}

// The Consort project to observe. Set CONSORT_PROJECT_DIR to point at any scaffolded
// project; otherwise fall back to the process working directory (so you can `cd` into a
// project and launch the dashboard from there).
export function projectDir(): string {
  return process.env.CONSORT_PROJECT_DIR || process.cwd();
}

// A companion record-lane corpus for a LIVE build, when one is being captured. The Consort
// drive's record lane (LAKEBASE_CONSORT_RECORD_DIR set) writes a full ReplaySource-shaped corpus
// — turns/ + correspondence.jsonl + per-turn file snapshots + a MIRRORED agent-log.jsonl — into a
// SEPARATE directory, never the watched `.consort/` (setting RECORD_DIR to the project's own
// `.consort/` would double-append and corrupt its agent-log). Point the dashboard at that same
// directory and a live board gains replay-grade drill-down (prompts, inputs, point-in-time
// per-step snapshots) while liveness still comes from the agent-log mirrored under `.consort/`.
//
// Prefer a dashboard-native override, else read the kit's OWN var so launching the dashboard in
// the same shell as the build ("source ~/.consort-run.env") wires it up with no extra step.
// Null when unset (a plain live build with no companion recording) — the caller degrades to the
// agent-log-only live board and the FidelityBanner explains what isn't captured.
export function recordDir(): string | null {
  const d = process.env.CONSORT_RECORD_DIR || process.env.LAKEBASE_CONSORT_RECORD_DIR;
  return d && d.trim() ? d.trim() : null;
}

// The artifact-root directory names Consort has used, in resolution priority. v0.3.7 renamed
// the root `.sftdd/` → `.consort/` but still READS the legacy names (and auto-migrates old
// projects on their next run), so the observer mirrors the kit's `resolveConsortDir()`: pick the
// first that exists, else default to the current name so a not-yet-created project still resolves
// to a coherent (if absent) path. This lets one dashboard watch both pre- and post-rename projects.
export const ARTIFACT_ROOT_NAMES = [".consort", ".sftdd", ".tdd"] as const;

// The resolved artifact root under the watched project (`.consort/` by preference, legacy
// `.sftdd/`/`.tdd/` honoured in place). Named `consortDir`; `sftddDir` is kept as an alias so
// existing importers and tests keep working.
export function consortDir(): string {
  const root = projectDir();
  for (const name of ARTIFACT_ROOT_NAMES) {
    if (existsSync(join(root, name))) return join(root, name);
  }
  return join(root, ARTIFACT_ROOT_NAMES[0]);
}

/** @deprecated Use {@link consortDir}. Retained so existing callers keep resolving. */
export function sftddDir(): string {
  return consortDir();
}

// Read an artifact the log named (`artifact.written.path`, relative to `.sftdd/`) at the
// project's CURRENT HEAD. This is the live half of the turn drill-down: a live project has no
// per-turn snapshot, so the honest thing it can offer is the file as it is NOW, which the panel
// labels as such.
//
// `rel` comes from a request parameter, so it goes through the same audited containment guard as
// the replay reader (lib/safepath.ts): realpath both sides, require containment under `.sftdd/`.
// Then filekind's shared read/size/text guards, so live and replay agree on what is text and how
// big is too big. `readArtifactAtHead` maps a containment miss onto a HEAD-specific reason, since
// "not captured in a turn" is the wrong wording for a file that simply no longer exists here.
export function readArtifactAtHead(rel: string): ArtifactContent {
  // Classify the path AS RESOLVED — under `.sftdd/` — not the bare rel. `artifact.written.path`
  // is `.sftdd/`-relative and drops the prefix (`design/ia.md`, not `.sftdd/design/ia.md`), but
  // replay classifies the prefixed form (`turn.produced` keeps it), and classify's first rule is
  // `.sftdd/` → artifact. Passing the bare rel skips that rule, so `.sftdd/scripts/x.py` or
  // `.sftdd/tests/x.py` would read "code" here and "artifact" in replay — the exact live/replay
  // disagreement the shared classify exists to prevent. Everything under `.sftdd/` is workflow
  // bookkeeping, so "artifact" is also the honest answer.
  // Resolve once per call. Deliberately NOT memoized across calls: the observer must notice a
  // project (or its artifact root) appearing mid-run — the live board lights up when a replay/build
  // first writes `.consort/`, and a legacy `.sftdd/` project can materialize after launch too.
  const dir = consortDir();
  const kind = classify(basename(dir) + "/" + rel);
  const abs = resolveContained(dir, rel);
  if (abs === null) {
    return { path: rel, kind, content: null, reason: "(no longer present at HEAD)" };
  }
  const r = readTextFile(abs, rel);
  // filekind's generic "(not a file)"/"(unreadable)" read, for a live project, as "gone from HEAD".
  const reason = r.reason === "(not a file)" || r.reason === "(unreadable)" ? "(no longer present at HEAD)" : r.reason;
  return { path: rel, kind, content: r.content, reason };
}

// The one definition of the "this isn't a Consort project" message. Both consort.buildState()
// and LiveSource.unavailableReason() render it, so it must not be written twice.
export function noSftddMessage(dir: string): string {
  return `No .consort/ (or legacy .sftdd/) found in ${dir} — is CONSORT_PROJECT_DIR a scaffolded Consort project?`;
}

// A feature id is used to build a path under .sftdd/features/<id>/. It comes from
// next.json / the agent-log (files the watched project writes), so treat it as untrusted:
// a value like "../../etc" would escape the project dir. A real feature id is a single path
// segment (letters/digits/dash/underscore/dot, no separators, no leading dot). Reject
// anything else so the read-only observer can never be walked outside .sftdd/features.
export function isSafeSegment(seg: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(seg) && !seg.includes("..");
}

function readJsonSafe<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

// A session is considered "actively working" if any Claude Code transcript for this
// project was written within this window. Consort role turns and a human/proxy session
// auto-resolving an escalation both write their transcript continuously; a genuinely idle
// "waiting on you" pause does not. 15s comfortably spans think-time between tool calls
// without latching on after the session actually stops.

// Scanning the transcript dir (readdir + stat per file) is O(files) and the dir can hold
// dozens of sub-agent transcripts, so cache the newest-mtime scan briefly. The poll cadence
// is 2s; a 1s TTL means at most one scan per poll while staying fresh enough for a 15s
// liveness window.
const SESSION_SCAN_TTL_MS = 1000;
let _sessionScan: { at: number; ageBaseMs: number; scannedAt: number } | null = null;

// Newest mtime across the project's Claude Code transcripts, as ms-since-write (Infinity if
// none). Deliberately mtime-only across ALL transcripts — we only need "is SOMETHING writing
// right now", not WHICH session, so this sidesteps the per-session driver-identification that
// made permission detection flaky (many sub-agent transcripts share the project dir).
// Callers gate this on "is there anything to check" (a working agent or a pending banner) so
// a fully-idle run pays nothing; the 1s cache covers repeat calls within a poll.
function sessionActivityAgeMs(): number {
  // HOME must be set to locate ~/.claude; without it the derived path is bogus (leading "/"),
  // so report "no activity" rather than silently scanning the wrong place.
  const home = process.env.HOME;
  if (!home) return Infinity;

  const now = Date.now();
  if (_sessionScan && now - _sessionScan.at < SESSION_SCAN_TTL_MS) {
    // Age advances with wall-clock between scans (the file isn't getting newer on its own).
    return _sessionScan.ageBaseMs + (now - _sessionScan.scannedAt);
  }

  const projectSlug = projectDir().replace(/[/.]/g, "-").replace(/^-/, "");
  const txDir = join(home, ".claude", "projects", `-${projectSlug}`);
  let age = Infinity;
  if (existsSync(txDir)) {
    let newest = -Infinity;
    try {
      for (const f of readdirSync(txDir)) {
        if (!f.endsWith(".jsonl")) continue;
        const m = statSync(join(txDir, f)).mtimeMs;
        if (m > newest) newest = m;
      }
    } catch {
      newest = -Infinity;
    }
    if (newest !== -Infinity) age = now - newest;
  }
  _sessionScan = { at: now, ageBaseMs: Number.isFinite(age) ? age : Infinity, scannedAt: now };
  return age;
}



// A trailing tool_use resolves within a second or two when it's auto-approved and just
// executing; a real permission prompt sits unanswered until the human acts. So we only
// report a pending permission once the tool_use has gone unanswered for this long. This
// kills the "false flash" as a tool starts, at the cost of a ~few-second delay before a
// genuine prompt shows — an acceptable trade for not crying wolf.
// Permission-prompt detection (over Claude Code transcripts) is DISABLED: it was too
// flaky — false-positives from parked/sub-agent sessions, and "newest transcript by mtime"
// picks the wrong session when many sub-agent transcripts share the project dir. The gate
// and escalation banners (sourced from Consort's own .sftdd files) stay on and are reliable.
// Before re-enabling, identify the live driver session by correlating the transcript against
// .sftdd/agent-log.jsonl activity rather than guessing by mtime. Flip to re-enable.

// Master switch for the top-of-dashboard "waiting on you" banner (gate + escalation +
// permission). Disabled: in practice the banners caused more confusion than they resolved —
// stale/flapping states, and "waiting" vs "being worked on" was hard to read at a glance.
// The underlying signals still drive per-agent bubble state (waiting/issue) and the Open
// issues → resolver list, which are the reliable surfaces. Flip to re-enable the banner.

const PERMISSION_DWELL_MS = 4000;

// Upper bound: a tool_use pending longer than this belongs to an abandoned/dead session,
// not a live prompt you're staring at. Consort's driver sessions turn over quickly, so a
// multi-minute-old trailing tool_use is stale, not waiting. (5 min.)
const PERMISSION_STALE_MS = 5 * 60 * 1000;

// Detect a Claude Code permission prompt in the DRIVING session's transcript: the
// file ends with an assistant message whose final content block is a tool_use with
// no following tool_result, AND that tool_use has been pending > PERMISSION_DWELL_MS.
// A different layer from a Consort HITL gate. We read only the tail to stay cheap.
function findPendingPermission(): PendingPermission | null {
  const projectSlug = projectDir().replace(/[/.]/g, "-").replace(/^-/, "");
  const txDir = join(process.env.HOME || "", ".claude", "projects", `-${projectSlug}`);
  if (!existsSync(txDir)) return null;

  // newest transcript by mtime
  let newest: { path: string; mtime: number } | null = null;
  try {
    for (const f of readdirSync(txDir)) {
      if (!f.endsWith(".jsonl")) continue;
      const p = join(txDir, f);
      const m = statSync(p).mtimeMs;
      if (!newest || m > newest.mtime) newest = { path: p, mtime: m };
    }
  } catch {
    return null;
  }
  if (!newest) return null;

  const raw = readFileSync(newest.path, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  // Walk backwards to the last message record with content. But bail early on trailing
  // session-control records (last-prompt / mode / permission-mode) — those are written when
  // a session is PARKED/idle at a prompt box, i.e. it's done executing, not mid-tool. Their
  // presence after the last message means any tool_use above them already resolved.
  for (let i = lines.length - 1; i >= 0; i--) {
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const type = rec.type as string;
    if (type === "last-prompt" || type === "mode" || type === "permission-mode") {
      return null; // session is parked at an idle prompt, not blocked on a tool
    }
    if (type === "user") {
      // a user/tool_result already answered the newest turn — not paused
      return null;
    }
    if (type === "assistant") {
      const msg = (rec.message as Record<string, unknown>) || {};
      const content = msg.content;
      if (!Array.isArray(content) || content.length === 0) return null;
      const last = content[content.length - 1] as Record<string, unknown>;
      if (last?.type !== "tool_use") return null; // ended on text = not awaiting a tool

      const toolName = (last.name as string) ?? "tool";
      // Agent/Task calls spawn a CHILD session; their tool_result flows through the
      // sub-agent transcript, not this file, so a trailing Agent tool_use is NOT a pending
      // permission — it's a normal, already-dispatched sub-agent. Ignore it.
      if (toolName === "Agent" || toolName === "Task") return null;

      const ts = typeof rec.timestamp === "string" ? Date.parse(rec.timestamp) : NaN;
      const age = Number.isNaN(ts) ? Infinity : Date.now() - ts;
      // Dwell gate: too new = auto-approved tool just executing (result about to land).
      if (age < PERMISSION_DWELL_MS) return null;
      // Staleness cap: too old = an abandoned/dead session, not a live prompt you're facing.
      if (age > PERMISSION_STALE_MS) return null;

      const input = (last.input as Record<string, unknown>) || {};
      return {
        tool: toolName,
        command: typeof input.command === "string" ? input.command : null,
        description: typeof input.description === "string" ? input.description : null,
      };
    }
    // skip attachment / file-history-snapshot / summary records
  }
  return null;
}

export function readEvents(): AgentLogEvent[] {
  const path = join(sftddDir(), "agent-log.jsonl");
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  const out: AgentLogEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as AgentLogEvent);
    } catch {
      // tolerate a torn final line while Consort is mid-append
    }
  }
  return out;
}


// Shell out to the project's feature-status CLI for the authoritative % snapshot.
// feature-status shells out (~0.4s) and changes slowly (story/gate/test counts), so cache
// it briefly. The fast-moving signals (agent activity, waiting banner) come from files, not
// this — so a short TTL keeps the poll snappy without staling what matters.
let _fsCache: { feature: string; at: number; value: FeatureStatus | null } | null = null;

const FEATURE_STATUS_TTL_MS = 4000;

function readFeatureStatus(feature: string): FeatureStatus | null {
  if (_fsCache && _fsCache.feature === feature && Date.now() - _fsCache.at < FEATURE_STATUS_TTL_MS) {
    return _fsCache.value;
  }
  let value: FeatureStatus | null = null;
  try {
    const out = execFileSync("./scripts/lk", ["lakebase-feature-status", feature, "--json"], {
      cwd: projectDir(),
      encoding: "utf8",
      timeout: 15000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    value = JSON.parse(out) as FeatureStatus;
  } catch {
    value = _fsCache?.feature === feature ? _fsCache.value : null; // keep last-good on transient failure
  }
  _fsCache = { feature, at: Date.now(), value };
  return value;
}


// Gather every disk-sourced input the fold needs. Isolating the I/O here is what keeps
// `fold` pure — and what lets a future replay source supply the same struct from a corpus.
export function readSnapshot(events: AgentLogEvent[], generatedAt: string): SnapshotInputs {
  const next = readJsonSafe<NextJson>(join(sftddDir(), "next.json"));

  // Active feature: prefer next.json, else the newest event carrying one. Needed here
  // (ahead of the fold) because the status CLI and handbacks are keyed by feature.
  let feature = next?.feature ?? null;
  if (!feature) {
    for (let i = events.length - 1; i >= 0; i--) {
      const f = (events[i].metadata as Record<string, unknown> | undefined)?.feature_id;
      if (f) {
        feature = String(f);
        break;
      }
    }
  }

  const status = feature ? readFeatureStatus(feature) : null;
  const handbacks = feature ? readHandbacks(feature) : [];

  // Both liveness scans are gated on there being something to check, so a fully idle run
  // pays nothing. `sessionAgeMs` is consumed by the fold only at the live edge.
  const needsLiveness =
    events.length > 0 || (next?.state?.open_gates ?? []).length > 0 || !!next?.primary_action;
  const sessionAgeMs = needsLiveness ? sessionActivityAgeMs() : Infinity;
  const pendingPermission = ENABLE_PERMISSION_BANNER ? findPendingPermission() : null;

  return { projectDir: projectDir(), next, status, handbacks, sessionAgeMs, pendingPermission, generatedAt };
}

/**
 * Read the watched project and fold it into a dashboard state.
 *
 * @param upTo optional event index for time travel — omit for the live edge. Note the
 *             snapshot half (progress/gates/story status) always reflects NOW regardless;
 *             `atLive` and `snapshotAsOf` on the result tell the UI how to label it.
 */
export function buildState(upTo?: number): DashboardState {
  const generatedAt = new Date().toISOString();
  const dir = projectDir();

  if (!existsSync(sftddDir())) {
    return {
      ...emptyState(dir, generatedAt),
      error: noSftddMessage(dir),
    };
  }

  const events = readEvents();
  return fold(events, readSnapshot(events, generatedAt), upTo);
}
