// Planning / backlog parsing — ported from Kevin's build_dashboard.py
// (`parse_proposals`, `feature_details`, `load_planning`), the one parser set the Phase 2 port
// left behind. Pure string/JSON work over a set of on-disk artifacts, so it lives here and is
// unit-tested against the real files; the source layer supplies the two roots to search.
//
// The plan calls this "port parse_proposals", but a verbatim port would MISPARSE the replay
// corpus. Kevin's regex was written against the LIVE stockflow format and never run against his
// own recorded corpus — the two `feature-proposals.md` files disagree:
//
//   live  stockflow/.sftdd/planning/feature-proposals.md
//         `## FP1: File and view…`   body: `**One-line ask:**`  `**E2E story:**`
//   replay recorded-artifacts/planning/feature-proposals.md
//         `## FP1: File and view…`   body: `- **Ask:**`         `- **E2E (UI) story:**`
//
// Ported verbatim, the ask/rationale/e2e come out EMPTY on the replay demo — exactly the
// Kevin-parser-vs-real-data gap this project keeps hitting (see the memory). So the header regex
// and the body-label matcher below accept both spellings, verified against both real files.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AgentLogEvent,
  Planning,
  PlanningCandidate,
  PlanningSprint,
  SprintFeature,
} from "./types";

/** A parsed proposal from feature-proposals.md, before joining with estimates. */
export interface Proposal {
  id: string;
  title: string;
  ask: string;
  rationale: string;
  e2e: string;
}

/**
 * Parse feature-proposals.md into an ordered list of candidate features.
 *
 * Headers look like `## FP1: File and view stock…` (both real files) — Kevin's docstring also
 * allowed `## PF1 (candidate) …`, kept here. Non-feature sections (`## Open questions for the
 * Product Owner`) are skipped: an id must start with letters followed by a digit.
 *
 * Body labels are matched in BOTH spellings the two real files use:
 *   ask       — `**Ask:**` (replay) or `**One-line ask:**` (live)
 *   rationale — `**Rationale:**`
 *   e2e       — `**E2E (UI) story:**` (replay) or `**E2E story:**` (live)
 * A leading `- ` (the replay file bullets its labels) is tolerated before the `**`.
 */
export function parseProposals(md: string): Proposal[] {
  const out: Proposal[] = [];
  let cur: Proposal | null = null;
  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) {
      // Drop a trailing "FP1:" colon and an optional "(candidate)" tag, then split id / title.
      const head = line.slice(3).trim();
      const m = head.match(/^([A-Za-z]+\d+[\w-]*)\s*:?\s*(?:\(candidate\))?\s*(.*)$/);
      const fid = m ? m[1] : head;
      const title = m ? m[2].trim() : "";
      // Skip prose sections like "Open questions…": a real id is letters then a digit.
      if (!/^[A-Za-z]+\d/.test(fid)) {
        cur = null;
        continue;
      }
      cur = { id: fid, title, ask: "", rationale: "", e2e: "" };
      out.push(cur);
    } else if (cur) {
      // Strip a leading bullet so `- **Ask:** …` matches the same as `**Ask:** …`.
      const s = line.trim().replace(/^-\s+/, "");
      const label = s.match(/^\*\*([^*]+):\*\*\s*(.*)$/);
      if (!label) continue;
      const key = label[1].trim().toLowerCase();
      const value = label[2].trim();
      if (key === "ask" || key === "one-line ask") cur.ask = value;
      else if (key === "rationale") cur.rationale = value;
      else if (key === "e2e story" || key === "e2e (ui) story") cur.e2e = value;
    }
  }
  return out;
}

/** JSON read that never throws — a malformed artifact yields null, not a 500. */
function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Title + summary for a committed feature, from its feature dir under one of `roots`.
 *
 * Committed features (F1, F6, …) are NOT in the FP proposal pool; their detail lives under
 * `<root>/features/<id>/`: the `name` from feature-spec.json and the first prose line of
 * feature-request.md (its `# ` heading is the title fallback). First root that has either wins.
 */
export function featureDetails(roots: string[], fid: string): { title: string; summary: string } {
  let title = "";
  let summary = "";
  for (const root of roots) {
    const fdir = join(root, "features", fid);
    const spec = readJson<{ name?: string; title?: string }>(join(fdir, "feature-spec.json"));
    if (spec) title = spec.name || spec.title || title;

    const reqPath = join(fdir, "feature-request.md");
    if (existsSync(reqPath)) {
      try {
        const lines = readFileSync(reqPath, "utf8").split("\n").map((l) => l.replace(/\s+$/, ""));
        if (!title) {
          const h = lines.find((l) => l.startsWith("# "));
          if (h) title = h.slice(2).trim();
        }
        // First real PROSE line, not merely the first non-heading. A feature-request.md can open
        // with a bullet, a blockquote, a table row, or a `---` front-matter/rule — none of which
        // read as a summary. Skip those markup-leading lines and take the first plain sentence.
        const isProse = (l: string): boolean => {
          const s = l.trim();
          if (!s || s.startsWith("#")) return false; // blank or heading
          if (/^[-*+]\s/.test(s) || /^\d+[.)]\s/.test(s)) return false; // bullet / numbered list
          if (s.startsWith(">")) return false; // blockquote
          if (s.startsWith("|")) return false; // table row
          if (/^[-=]{3,}$/.test(s) || s === "---") return false; // rule / front-matter fence
          return true;
        };
        const firstProse = lines.find(isProse);
        if (firstProse) summary = firstProse.trim();
      } catch {
        // leave title/summary as-is
      }
    }
    if (title || summary) break;
  }
  return { title, summary };
}

/**
 * Gather planning: t-shirt estimates, proposals, sprint backlog, and the plan gate.
 *
 * `roots` are searched in order (live `.sftdd` first, then recorded-artifacts) — the same
 * freshest-wins fallback Kevin used, but taking the roots as an argument so the caller owns
 * where the data is. This also sidesteps his dead `cap_dir = LOG_PATH.parent.parent`
 * (build_dashboard.py:491), which resolved to a directory with no `.sftdd/` and only worked
 * because `load_planning` fell back to recorded-artifacts anyway.
 *
 * `logEvents` is optional and used only to count spec-author `propose` rounds, which drives the
 * re-plan flag.
 */
export function loadPlanning(roots: string[], logEvents?: AgentLogEvent[]): Planning {
  const find = (rel: string): string | null => {
    for (const r of roots) {
      const p = join(r, rel);
      if (existsSync(p)) return p;
    }
    return null;
  };

  // Estimates: feature_id → { size, rationale }.
  const estimates = new Map<string, { size: string | null; rationale: string }>();
  const ep = find("planning/estimates.json");
  if (ep) {
    const j = readJson<{ estimates?: { feature_id: string; size?: string; rationale?: string }[] }>(ep);
    for (const e of j?.estimates ?? []) {
      estimates.set(e.feature_id, { size: e.size ?? null, rationale: e.rationale ?? "" });
    }
  }

  // Proposals, in document order.
  let proposals: Proposal[] = [];
  const pp = find("planning/feature-proposals.md");
  if (pp) {
    try {
      proposals = parseProposals(readFileSync(pp, "utf8"));
    } catch {
      proposals = [];
    }
  }

  // Sprints: one dir per sprint under <root>/sprints/<sprint>/. First root that HAS a sprints
  // dir wins (live over recorded), matching Kevin's `break`.
  const sprints: PlanningSprint[] = [];
  const committed = new Set<string>();
  for (const r of roots) {
    const sdir = join(r, "sprints");
    if (!existsSync(sdir)) continue;
    // Deterministic, chronological order. A plain `.sort()` is lexical, so `…-s10` and `…-s11`
    // would sort BEFORE `…-s2` once a run reaches ten sprints — which also mis-derives the
    // re-plan flag below (it keys on index order). `numeric` collation keeps s2 < s10.
    let names: string[];
    try {
      names = readdirSync(sdir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    } catch {
      continue;
    }
    for (const name of names) {
      const sp = join(sdir, name);
      const backlog = readJson<{ sprint?: string; features?: { id: string; size?: string }[] }>(
        join(sp, "backlog.json"),
      );
      if (!backlog) continue; // no backlog.json → not a sprint dir
      const gatesJson = readJson<{ gates?: { plan?: { status?: string; approver?: string; approved_at?: string } } }>(
        join(sp, "gates.json"),
      );
      const gate = gatesJson?.gates?.plan ?? null;

      const ids = (backlog.features ?? []).map((f) => f.id);
      for (const id of ids) committed.add(id);

      const features: SprintFeature[] = (backlog.features ?? []).map((f) => {
        const det = featureDetails(roots, f.id);
        const est = estimates.get(f.id);
        return {
          id: f.id,
          title: det.title,
          summary: det.summary,
          // The backlog rarely carries a size (F# aren't in the FP estimate pool); prefer it, fall back to the estimate.
          size: f.size ?? est?.size ?? null,
          rationale: est?.rationale ?? "",
        };
      });

      sprints.push({
        sprint: backlog.sprint ?? name,
        featureIds: ids,
        features,
        planGate: gate?.status ?? null,
        approver: gate?.approver ?? null,
        approvedAt: gate?.approved_at ?? null,
        isReplan: false, // set below, once propose rounds are counted
      });
    }
    break; // first root with sprints wins
  }

  // Count spec-author `propose` rounds. One round feeding multiple sprints means every sprint
  // after the first is a re-plan, not a fresh proposal.
  let proposeRounds = 0;
  for (const e of logEvents ?? []) {
    const md = (e.metadata || {}) as Record<string, unknown>;
    if (e.event === "phase.start" && e.role === "spec-author" && md.phase === "propose") proposeRounds++;
  }

  // Candidate list = proposals joined with their estimate, in proposal order; then any
  // estimate-only ids that weren't proposed (so a sized-but-undocumented feature still shows).
  const candidates: PlanningCandidate[] = [];
  const seen = new Set<string>();
  for (const p of proposals) {
    const est = estimates.get(p.id);
    candidates.push({
      id: p.id,
      title: p.title,
      ask: p.ask,
      size: est?.size ?? null,
      rationale: est?.rationale || p.rationale,
      committed: committed.has(p.id),
    });
    seen.add(p.id);
  }
  for (const [fid, est] of estimates) {
    if (seen.has(fid)) continue;
    candidates.push({ id: fid, title: "", ask: "", size: est.size, rationale: est.rationale, committed: committed.has(fid) });
  }

  // A later sprint is a re-plan only when we can SEE that a single proposal round fed all of
  // them. `=== 1`, not `<= 1`: zero propose rounds means the log was truncated, not passed, or
  // predates logging — that is unknown, not "one round", and must not stamp a re-plan we can't
  // support. (Kevin's `<= 1` never bit because his log always had the one round; a truncated or
  // omitted log would have made every later sprint claim re-plan.)
  for (let i = 0; i < sprints.length; i++) {
    sprints[i].isReplan = i > 0 && proposeRounds === 1;
  }

  return {
    sprints,
    candidates,
    committed: [...committed].sort(),
    proposeRounds,
  };
}
