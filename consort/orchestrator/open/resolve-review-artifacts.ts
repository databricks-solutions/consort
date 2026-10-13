// Resolve the human-reviewable artifacts the Consort roles produce, so they can be
// opened in the editor at a gate instead of the human hunting for them. Returns only
// files that EXIST, in review order (design/planning context first, then the
// feature's spec/architecture, then the story's spec/ACs/test-list). Pure + I/O-light
// => unit-testable off a fixture.

import * as fs from "node:fs";
import { join, dirname } from "node:path";
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
  featuresDir,
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

/** The roles that AUTHOR reviewable design artifacts. A turn-done for one of these with nothing
 *  to open is worth reporting (scope/timing); a turn that authors no design doc opening nothing is
 *  expected + stays silent. The NAVIGATOR is deliberately absent: it REVIEWS in the design lane
 *  (reflect/review/assess → a verdict) and writes TEST code in the build lane — it authors no
 *  reviewable design document, so (like the driver) its per-turn open stays silent. Slugs match the
 *  telemetry ROLE_VALUES closed enum. */
export const DESIGN_ROLES: ReadonlySet<string> = new Set([
  "product-owner",
  "spec-author",
  "architect-reviewer",
  "dba",
  "ux-designer",
  "test-strategist",
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
      // The navigator AUTHORS no reviewable DESIGN document: in the design lane it REVIEWS
      // (reflect/review/assess → a verdict, not docs the human edits), and in the build lane it
      // writes TEST code (reviewed via the build cycle + diff, like the driver's GREEN code — not
      // via this per-turn design-doc open). So it opens NOTHING here, same as the driver. Opening
      // story.md/story.json (which the SPEC-AUTHOR authored) mislabeled someone else's artifacts as
      // "produced by navigator" and, in a multi-story round, surfaced the wrong story's spec. The
      // story's design docs are shown by the GATE open (the full reviewArtifacts set) when the drive
      // stops at the spec gate — which is where the human reviews them.
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

/** The freshest EXISTING story dir on disk for a feature (by storyFreshness), or undefined. The
 *  fallback for when next.json names a feature but its `state.stories` map is not yet populated:
 *  EARLY in a FRESH run the first story's design turns author its artifacts BEFORE the drive writes
 *  the stories map, so the priority scan finds nothing and the per-turn open resolves no story — every
 *  S1 design role then opens nothing. Scanning the dirs recovers the just-authored story. */
function freshestStoryOnDisk(consortDir: string, feature: string): string | undefined {
  const storiesDir = dirname(storyDir(consortDir, feature, "_"));
  let best: string | undefined;
  let bestMtime = 0;
  try {
    for (const name of fs.readdirSync(storiesDir)) {
      const m = storyFreshness(consortDir, feature, name);
      if (m > bestMtime) { bestMtime = m; best = name; }
    }
  } catch { /* no stories dir yet */ }
  return best;
}

/** Derive {feature, story} PURELY from disk — the freshest story artifacts across every feature. The
 *  last-resort fallback for a FRESH run's first story: next.json does not exist yet (the drive writes it
 *  at the first stop/gate) AND `.consort/workflow-state.json` carries a null feature_id mid-drive, so
 *  NEITHER names the feature during S1's design turns. Scanning features/<F>/stories/<S> for the freshest
 *  authored story recovers exactly what the just-finished role wrote. {} when no story exists anywhere. */
function deriveScopeFromDisk(consortDir: string): { feature?: string; story?: string } {
  let bestFeature: string | undefined;
  let bestStory: string | undefined;
  let bestMtime = 0;
  try {
    for (const feature of fs.readdirSync(featuresDir(consortDir))) {
      const story = freshestStoryOnDisk(consortDir, feature);
      if (!story) continue;
      const m = storyFreshness(consortDir, feature, story);
      if (m > bestMtime) { bestMtime = m; bestFeature = feature; bestStory = story; }
    }
  } catch { /* no features dir */ }
  return bestFeature ? { feature: bestFeature, story: bestStory } : {};
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
      // Fallback: next.json named the feature but its stories map had no story with artifacts yet
      // (a fresh run's first story authors its files before the map is written). Recover the
      // just-authored story from disk so the first story's per-turn opens are not all empty.
      const resolved = story ?? freshestStoryOnDisk(consortDir, feature);
      return { feature, ...(resolved ? { story: resolved } : {}) };
    }
  } catch { /* no next.json – fall through */ }
  try {
    const ws = JSON.parse(fs.readFileSync(join(consortDir, "workflow-state.json"), "utf8")) as {
      feature_id?: string | null;
      story_id?: string | null;
    };
    if (ws.feature_id) {
      // story_id is often null mid-drive — recover the just-authored story from disk.
      const story = ws.story_id ?? freshestStoryOnDisk(consortDir, ws.feature_id);
      return { feature: ws.feature_id, ...(story ? { story } : {}) };
    }
  } catch { /* no workflow-state – fall through */ }
  // Final fallback: a FRESH run's first turns have no next.json yet and a null workflow-state feature_id,
  // so neither names the feature — derive both from the freshest story artifacts on disk.
  return deriveScopeFromDisk(consortDir);
}
