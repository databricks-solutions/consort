// Correspondence: the HIL ↔ orchestrator message stream a Consort run records alongside the
// agent-log. Where `agent-log.jsonl` is the machine event bus (phase.start, cycle.*, turn.usage),
// `correspondence.jsonl` is the CONVERSATION — what the orchestrator asked the human, what the
// human answered, and the outcome of each exchange, each carrying pre-rendered markdown.
//
// Two things make it worth reading here:
//
//   1. It is the human-readable narrative of a run — kickoff, intake, per-action progress, gate
//      approvals — which the event ticker can fold in beside the raw events.
//   2. Its `progress` entries fire at ACTION COMPLETION and carry `outcome.validated` keyed by
//      `ordinal`. The agent-log only logs at turn boundaries, so a long-running turn can look
//      frozen; a correspondence progress row is an authoritative "this action finished" marker
//      the UI can use to settle a stale "still working" state. See `completionByOrdinal`.
//
// Shape verified against the stockflow-full corpus (209 lines). Everything here is a pure parse
// over strings — no I/O beyond the one `readFileSync` in `loadCorrespondence` — so it is unit
// tested directly against the real file.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** A direction of travel for a correspondence exchange. Others may appear; not an exhaustive union. */
export type CorrespondenceDirection = "hil-to-orch" | "orch-to-hil" | (string & {});

/**
 * One request/response exchange, flattened to what the UI needs.
 *
 * The raw row nests `request.presentation.rendered` / `response.presentation.rendered` (markdown)
 * plus `request.prompt` (plain). `promptMd` prefers the rendered form and falls back to the plain
 * prompt, because the `progress` rows carry only `prompt` (rendered is null there).
 */
export interface CorrespondenceEntry {
  /** Monotonic sequence in the file. Some rows record -1 (pre-sequence bookkeeping); kept as-is. */
  seq: number;
  /** ISO timestamp, for interleaving with agent-log events. */
  at: string;
  direction: CorrespondenceDirection;
  /** Lifecycle phase (planning/feature/deploy/promote), or null on the per-action progress rows. */
  phase: string | null;
  /** The turn ordinal this exchange concerns, when it names one — the key for completion mapping. */
  ordinal: number | null;
  /** `request.kind`: kickoff | intake | progress | author-requests | gate | … */
  kind: string | null;
  /** Who answered: human-proxy, orchestrator, … */
  by: string | null;
  /** Rendered markdown of the request (falls back to the plain prompt). */
  promptMd: string | null;
  /** Rendered markdown of the response, when there is one. */
  responseMd: string | null;
  /** The exchange was validated (well-formed / accepted). */
  validated: boolean;
  /** A gate/HIL decision was approved. Distinct from `validated`: an approval is also validated. */
  approved: boolean;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Flatten one raw JSON row into a CorrespondenceEntry, or null when it isn't shaped like one. */
function toEntry(o: Record<string, unknown>): CorrespondenceEntry | null {
  const at = str(o.at);
  if (!at) return null; // a row with no timestamp can't be placed on the timeline — skip it.

  const request = (o.request ?? {}) as Record<string, unknown>;
  const response = (o.response ?? {}) as Record<string, unknown>;
  const outcome = (o.outcome ?? {}) as Record<string, unknown>;
  const reqPres = (request.presentation ?? {}) as Record<string, unknown>;
  const respPres = (response.presentation ?? {}) as Record<string, unknown>;

  return {
    seq: num(o.seq) ?? -1,
    at,
    direction: (str(o.direction) ?? "unknown") as CorrespondenceDirection,
    phase: str(o.phase),
    ordinal: num(o.ordinal),
    kind: str(request.kind),
    by: str(response.by),
    // rendered markdown first, plain prompt as fallback (progress rows only have the latter).
    promptMd: str(reqPres.rendered) ?? str(request.prompt),
    responseMd: str(respPres.rendered),
    validated: outcome.validated === true,
    approved: outcome.approved === true,
  };
}

/** Parse the JSONL text of a correspondence log. Malformed lines are skipped, as the log reader does. */
export function parseCorrespondence(raw: string): CorrespondenceEntry[] {
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .flatMap((l) => {
      try {
        const e = toEntry(JSON.parse(l) as Record<string, unknown>);
        return e ? [e] : [];
      } catch {
        return [];
      }
    });
}

/**
 * Read `correspondence.jsonl` from a corpus root, or `[]` when the corpus doesn't ship one.
 *
 * Only the older `stockflow-rerecord` carries an agent-log; the newer corpora
 * (`stockflow-full`) ship correspondence instead — see the source's load-fallback.
 */
export function loadCorrespondence(root: string): CorrespondenceEntry[] {
  const path = join(root, "correspondence.jsonl");
  if (!existsSync(path)) return [];
  try {
    return parseCorrespondence(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

/** A completion marker: which action finished, when, and a one-line label from its progress row. */
export interface Completion {
  at: string;
  label: string;
}

/**
 * Map each completed turn ordinal to its completion marker, from the `progress` rows.
 *
 * A `progress` row is emitted when an action finishes ("spec-author propose, 1 file(s) produced")
 * with `outcome.validated`. Keyed by ordinal, this is the authoritative "turn N is done" signal
 * the agent-log's turn-boundary logging can lag on. Latest row wins per ordinal (an ordinal can
 * be revisited), so the map reflects the most recent completion.
 */
export function completionByOrdinal(entries: CorrespondenceEntry[]): Map<number, Completion> {
  const out = new Map<number, Completion>();
  for (const e of entries) {
    if (e.kind !== "progress" || e.ordinal === null) continue;
    if (!e.validated && !e.approved) continue;
    out.set(e.ordinal, { at: e.at, label: e.promptMd ?? `turn ${e.ordinal} complete` });
  }
  return out;
}
