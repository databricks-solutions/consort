// Deterministic pre-reflect AC↔IA consistency gate (#3). An E2E AC asserts a UI
// surface (a column, a cell, a region, an empty state) that must have a home in the
// information architecture (design/ia.md). When ia.md does NOT name that surface, the
// architect tags an E2E layer against a screen the IA never described, and the gap
// surfaces LATE — the LLM reflect catches it (reflect-ia-defect) and bounces a full
// revise lap (ux re-refine → architect re-tag → test-strategist → reflect) that the
// cheap artifacts could have prevented. This was the dominant remaining lap driver in
// the live run (2 of 3 stories lapped on exactly this class).
//
// The deterministic signal is a STRUCTURED declaration, not a prose parse: the Architect
// records each E2E AC's `ui_seams` (the ia.md data-testid seam tokens the AC's UI drives).
// This gate checks every declared seam is NAMED in ia.md's seam vocabulary; a seam the AC
// needs but the IA does not define flags the SAME `reflect-ia-defect` smell the LLM reflect
// uses — so the existing escalation → revise-route machinery bounds + routes it to the UX
// Designer (re-refine ia.md), with NO LLM turn, caught right after the architect step.
//
// Fail-OPEN by construction (never a false positive, never halts a correct design): an AC
// with no `ui_seams`, an absent ia.md, or a non-UI story is vacuously conformant. The gate
// can only UNDER-fire (a gap the architect didn't declare falls through to the LLM reflect,
// exactly as today) — it can never OVER-fire. Mirrors testlist-conformance.ts (checks →
// smell), sourced from the AC's declared seams vs the IA's vocabulary.

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { iaMd, acsDir } from "../../consort/config/consort-paths.js";
import { writeSmellsLog, hasOpenSmell, resolveOpenSmells, type SmellHit } from "./smells.js";

/** The `reflect-ia-defect` smell (ux-designer-owned) the LLM reflect also uses — reused
 *  so the deterministic gate shares its revise/escalation machinery (route to the ia gate). */
const IA_SMELL = "reflect-ia-defect" as const;

/**
 * True iff ia.md NAMES the given seam token. The architect declares the EXACT seam
 * token, which may be a TEMPLATE carrying `<placeholder>`s (e.g. `stock-row-<sku>-<loc>`),
 * so this is a bounded SUBSTRING match against the raw ia.md text — robust to the `<>`
 * punctuation a tokenizer would split on — delimited by a non-token character on each
 * side so a short seam (`stock-row`) does not match inside a longer one
 * (`stock-row-<sku>-<loc>`). Membership errs toward "named" (fail-open): it can only
 * ever UNDER-fire (miss a real gap), never OVER-fire (flag a seam that IS present).
 */
export function iaNamesSeam(iaMarkdown: string, seam: string): boolean {
  const esc = seam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // A token char is a word char or a hyphen; `<` `>` are delimiters, so a templated
  // seam's placeholders bound naturally against the surrounding backticks/commas.
  return new RegExp(`(?<![\\w-])${esc}(?![\\w-])`).test(iaMarkdown);
}

/** A story AC that declares `ui_seams`, keyed by id. Reads only on-disk artifacts. */
function storyUiSeams(consortDir: string, featureId: string, story: string): Array<{ id: string; seams: string[] }> {
  const out: Array<{ id: string; seams: string[] }> = [];
  const dir = acsDir(consortDir, featureId, story);
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const ac = JSON.parse(readFileSync(join(dir, f), "utf8")) as { id?: string; ui_seams?: unknown };
      const seams = Array.isArray(ac.ui_seams) ? ac.ui_seams.filter((s): s is string => typeof s === "string" && s.length > 0) : [];
      if (seams.length > 0) out.push({ id: typeof ac.id === "string" ? ac.id : f.replace(/\.json$/, ""), seams });
    } catch {
      /* a malformed AC is reported by the acs-conformance gate */
    }
  }
  return out;
}

/**
 * The deterministic AC↔IA violations of a story + the ac_id(s) they concern, or null
 * when it conforms (vacuously so when there is no ia.md, or no AC declares ui_seams).
 * A violation is a declared `ui_seams` token the IA does not name.
 */
export function iaConformanceViolations(
  consortDir: string,
  featureId: string,
  story: string,
): { reason: string; acIds: string[] } | null {
  const iaPath = iaMd(consortDir);
  if (!existsSync(iaPath)) return null; // non-UI / no IA yet: vacuously conformant
  const acs = storyUiSeams(consortDir, featureId, story);
  if (acs.length === 0) return null; // nothing declared to check (fail-open)
  let iaMarkdown: string;
  try {
    iaMarkdown = readFileSync(iaPath, "utf8");
  } catch {
    return null;
  }
  const violations: string[] = [];
  const acIds = new Set<string>();
  for (const { id, seams } of acs) {
    const missing = seams.filter((s) => !iaNamesSeam(iaMarkdown, s));
    if (missing.length > 0) {
      violations.push(
        `AC ${id} drives UI seam(s) the information architecture (ia.md) does not name: ${missing.join(", ")}. ` +
          `Add the surface (and its data-testid seam) to the AC's screen in ia.md, OR — if the capability has no ` +
          `standalone surface — reconsider the AC's layer with the spec-author. The architect declared these seams in ` +
          `the AC's ui_seams; every one must have a home in the IA before the build drives a UI the IA never described.`,
      );
      acIds.add(id);
    }
  }
  return violations.length === 0 ? null : { reason: violations.join("; "), acIds: [...acIds] };
}

/** True iff the story's declared UI seams are all named in ia.md (or nothing to check). */
export function iaConforms(consortDir: string, featureId: string, story: string): boolean {
  return iaConformanceViolations(consortDir, featureId, story) === null;
}

/**
 * The deterministic pre-reflect IA gate step (mirrors recordTestListGate): on a seam
 * gap, flag the `reflect-ia-defect` smell (ux-designer-owned) carrying the gap as detail
 * + the flagged ac_id(s), so the existing escalation → revise-route machinery bounds +
 * routes it to the ia refinement with NO LLM turn. On a conformant story, self-clear any
 * lingering open smell (a `cleared` resolve, which does not spend the revise budget).
 */
export function recordIaGate(consortDir: string, featureId: string, story: string): SmellHit[] {
  const found = iaConformanceViolations(consortDir, featureId, story);
  if (found === null) {
    resolveOpenSmells(consortDir, IA_SMELL, {
      story_id: story,
      kind: "cleared",
      note: "story's declared UI seams are all named in ia.md",
    });
    return [];
  }
  const hit: SmellHit = {
    smell: IA_SMELL,
    cycle_ids: [],
    detail: `ia conformance: ${found.reason}`,
    story_id: story,
    ...(found.acIds.length > 0 ? { ac_ids: found.acIds } : {}),
  };
  // Idempotent: a re-run against the same gap re-detects it; only write when not already open.
  if (hasOpenSmell(consortDir, IA_SMELL, story)) return [];
  writeSmellsLog(consortDir, [hit]);
  return [hit];
}
