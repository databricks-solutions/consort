// Resolve the human-reviewable artifacts the Consort roles produce, so they can be
// opened in the editor at a gate instead of the human hunting for them. Returns only
// files that EXIST, in review order (design/planning context first, then the
// feature's spec/architecture, then the story's spec/ACs/test-list). Pure + I/O-light
// => unit-testable off a fixture.

import * as fs from "node:fs";
import { join } from "node:path";
import {
  productOverviewMd,
  nfrsMd,
  designBriefMd,
  designGuideJson,
  featureProposalsMd,
  featureRequestMd,
  featureSpecMd,
  featureSpecJson,
  architectureMd,
  architectureJson,
  dbDesignMd,
  dbDesignJson,
  featureTestListMd,
  featureTestListJson,
  storyDir,
  storyJson,
  storyTestListJson,
  acsDir,
} from "../../config/consort-paths.js";

/** The reviewable artifacts for a scope, existing-only, deduped, in review order.
 *  No feature => the planning/design review set (proposals + brief + guide). */
export function reviewArtifacts(consortDir: string, opts: { feature?: string; story?: string } = {}): string[] {
  const out: string[] = [];
  const add = (p: string): void => {
    if (fs.existsSync(p) && !out.includes(p)) out.push(p);
  };

  // Product + design + planning context (relevant at every review).
  add(productOverviewMd(consortDir));
  add(nfrsMd(consortDir));
  add(featureProposalsMd(consortDir));
  add(join(consortDir, "planning", "estimates.json")); // architect-estimator: the t-shirt sizes the PO commits from
  add(designBriefMd(consortDir));
  add(join(consortDir, "design", "design-guide.md")); // ux-designer narrative (the reviewable one)
  add(designGuideJson(consortDir));
  add(join(consortDir, "design", "ia.md")); // ux-designer IA: screens + navigation + flows

  const { feature: f, story: s } = opts;
  if (f) {
    add(featureRequestMd(consortDir, f));
    add(featureSpecMd(consortDir, f));
    add(featureSpecJson(consortDir, f));
    add(architectureMd(consortDir, f));
    add(architectureJson(consortDir, f));
    add(dbDesignMd(consortDir, f));
    add(dbDesignJson(consortDir, f));
    add(featureTestListMd(consortDir, f)); // rendered test list (human-readable)
    add(featureTestListJson(consortDir, f));
    if (s) {
      add(join(storyDir(consortDir, f, s), "story.md"));
      add(storyJson(consortDir, f, s));
      add(storyTestListJson(consortDir, f, s));
      try {
        for (const a of fs.readdirSync(acsDir(consortDir, f, s)).filter((n) => n.endsWith(".json")).sort()) {
          add(join(acsDir(consortDir, f, s), a));
        }
      } catch {
        /* no acs dir yet */
      }
    }
  }
  return out;
}

/** The design roles that PRODUCE reviewable artifacts. A turn-done for one of these with
 *  nothing to open is worth reporting (scope/timing); a build turn (driver) opening nothing
 *  is expected + stays silent. Slugs match the telemetry ROLE_VALUES closed enum. */
export const DESIGN_ROLES: ReadonlySet<string> = new Set([
  "product-owner",
  "spec-author",
  "architect-reviewer",
  "dba",
  "ux-designer",
  "test-strategist",
  "navigator",
]);

/** The reviewable artifacts a SPECIFIC role produces this turn, existing-only, in review
 *  order – so the per-turn open reveals exactly what the role that just finished authored
 *  (not the whole review set). Empty for `driver` (build turns emit code, no design artifact)
 *  and for any role with no output yet. Scope comes from the live workflow-state feature/story. */
export function roleArtifacts(consortDir: string, role: string, opts: { feature?: string; story?: string } = {}): string[] {
  const { feature: f, story: s } = opts;
  const out: string[] = [];
  const add = (p: string): void => {
    if (fs.existsSync(p) && !out.includes(p)) out.push(p);
  };
  switch (role) {
    case "product-owner":
      // The PO's intake deliverables – what it drafts at the intake step and the human reviews at the
      // intake gate. design-brief.md is UI-track only (a backend-only project produces none), so it is
      // simply absent then (add() no-ops on a missing file). feature-proposals.md is the SPEC-AUTHOR's
      // propose output, not the PO's, so it is not here.
      add(productOverviewMd(consortDir));
      add(nfrsMd(consortDir));
      add(designBriefMd(consortDir));
      break;
    case "spec-author":
      if (f) {
        add(featureSpecMd(consortDir, f));
        add(featureSpecJson(consortDir, f));
      }
      if (f && s) {
        add(join(storyDir(consortDir, f, s), "story.md"));
        add(storyJson(consortDir, f, s));
        try {
          for (const a of fs.readdirSync(acsDir(consortDir, f, s)).filter((n) => n.endsWith(".json")).sort()) {
            add(join(acsDir(consortDir, f, s), a));
          }
        } catch {
          /* no acs dir yet */
        }
      }
      break;
    case "architect-reviewer":
      if (f) {
        add(architectureMd(consortDir, f));
        add(architectureJson(consortDir, f));
      }
      break;
    case "dba":
      if (f) {
        add(dbDesignMd(consortDir, f));
        add(dbDesignJson(consortDir, f));
      }
      break;
    case "ux-designer":
      add(join(consortDir, "design", "design-guide.md"));
      add(designGuideJson(consortDir));
      add(join(consortDir, "design", "ia.md"));
      add(designBriefMd(consortDir));
      break;
    case "test-strategist":
      if (f) {
        add(featureTestListMd(consortDir, f));
        add(featureTestListJson(consortDir, f));
      }
      if (f && s) add(storyTestListJson(consortDir, f, s));
      break;
    case "navigator":
      // reflect: the story under review – what's going into the gate the human is about to
      // approve, so they see the reflected design (not the reflect verdict itself).
      if (f && s) {
        add(join(storyDir(consortDir, f, s), "story.md"));
        add(storyJson(consortDir, f, s));
      }
      break;
    default:
      break; // driver + anything else: no reviewable design artifact
  }
  return out;
}

/** Work-status priority for picking the CURRENT story to scope the per-turn open. The story a
 *  design role just wrote into is the one actively being WORKED (designing / awaiting its gate),
 *  NOT one you are already past (ready/building/.../done). Ranking by this (highest first) means
 *  an older, already-advanced story can never shadow the current one — the bug where mtime alone
 *  (fragile after a clone/checkout/rehydrate rewrites timestamps) kept re-opening a story we were
 *  past. mtime (storyFreshness) stays only as a tiebreaker AMONG same-status stories (parallel
 *  design). Statuses mirror STORY_STATUSES; an unknown status ranks lowest. */
const STORY_WORK_PRIORITY: Record<string, number> = {
  designing: 6,
  "awaiting-gate": 5,
  building: 4,
  "awaiting-acceptance": 3,
  ready: 2,
  done: 1,
  discarded: 0,
};

/** The freshest mtime across a story's key artifacts (dir + story.json + acs/) – used to pick
 *  the story a just-finished role wrote into when several are mid-design. 0 when none exist. */
function storyFreshness(consortDir: string, feature: string, story: string): number {
  let m = 0;
  for (const p of [storyDir(consortDir, feature, story), storyJson(consortDir, feature, story), acsDir(consortDir, feature, story)]) {
    try { m = Math.max(m, fs.statSync(p).mtimeMs); } catch { /* absent */ }
  }
  return m;
}

/**
 * The LIVE current feature + story for scoping the per-turn open. Reads `next.json` – the drive's
 * AUTHORITATIVE per-turn snapshot (`feature` + `state.stories`) – NOT `workflow-state.json`, whose
 * `feature_id`/`story_id` are null during a design/build drive (its `phase_feature_id` also drifts
 * stale). That mismatch was the real bug: the per-turn open resolved an EMPTY scope and so opened
 * nothing. The story is the FRESHEST among the snapshot's stories (the one the finishing role just
 * wrote into) – the right pick when several sit in "designing" at once. Falls back to
 * `workflow-state.json`, then `{}`. Never throws.
 */
export function resolveScope(consortDir: string): { feature?: string; story?: string } {
  try {
    const next = JSON.parse(fs.readFileSync(join(consortDir, "next.json"), "utf8")) as {
      feature?: string | null;
      state?: { stories?: Record<string, string> };
    };
    const feature = next.feature ?? undefined;
    if (feature) {
      // Pick the CURRENT story by work-status priority (the actively-worked one outranks any we
      // are past), with artifact mtime as a tiebreaker among same-status stories. Only a story
      // whose artifacts EXIST (freshness > 0) is eligible, so a not-yet-authored story is skipped.
      let story: string | undefined;
      let bestPriority = -1;
      let bestMtime = 0;
      for (const [id, status] of Object.entries(next.state?.stories ?? {})) {
        const m = storyFreshness(consortDir, feature, id);
        if (m === 0) continue; // artifacts not authored yet – nothing to open for it
        const priority = STORY_WORK_PRIORITY[status] ?? 0;
        if (priority > bestPriority || (priority === bestPriority && m > bestMtime)) {
          bestPriority = priority;
          bestMtime = m;
          story = id;
        }
      }
      return { feature, ...(story ? { story } : {}) };
    }
  } catch { /* no next.json – fall through */ }
  try {
    const ws = JSON.parse(fs.readFileSync(join(consortDir, "workflow-state.json"), "utf8")) as {
      feature_id?: string | null;
      story_id?: string | null;
    };
    return { ...(ws.feature_id ? { feature: ws.feature_id } : {}), ...(ws.story_id ? { story: ws.story_id } : {}) };
  } catch {
    return {};
  }
}
