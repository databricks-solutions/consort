// Cross-story design-review context (hardening #1): the deterministic preparer that
// gives the design-lane reviewers (architect-reviewer, navigator reflect) the ONE thing
// they structurally lacked – sight of the FEATURE'S OTHER STORIES. A story was reviewed
// in isolation, so a later story could author an AC that contradicts an earlier, already
// gated story (e.g. S3 "reject a SKU not in stock_records" vs S1 "first receipt of a
// fresh SKU establishes stock"), and no reviewer or gate compared across stories – the
// contradiction surfaced only in the build lane. This assembles the sibling stories'
// acceptance criteria + the architecture's open_decisions so the reviewer can catch the
// conflict (and a story silently resolving a deferred decision) at design time.
//
// Pure + I/O-light off disk => unit-testable off a fixture (the S1/S3 regression). The
// runner injects it as an OPTIONAL `computed:cross-story-context` input, so a turn with no
// siblings / no architecture.json simply gets an empty context (never a hard failure).

import * as fs from "node:fs";
import { basename } from "node:path";
import { storiesDir, storyResolved, storyAcIds, acJson, architectureJson } from "../../config/consort-paths.js";

export interface SiblingAc {
  ac_id: string;
  status?: string;
  layer?: string;
  given?: string;
  when?: string;
  then?: string;
  architectural_notes?: string;
}
export interface SiblingStory {
  story: string;
  acs: SiblingAc[];
}
export interface OpenDecision {
  id: string;
  question?: string;
  decision_status?: string;
  resolved_by_story?: string;
  resolution?: string;
}
export interface RequiredField {
  /** The `not_null` persistence-invariant id (e.g. PI2-pick-actor-not-null). */
  invariant_id: string;
  table?: string;
  /** The invariant brief – names the mandated field + why (e.g. "actor is NOT NULL: every pick records who made it"). */
  brief?: string;
}
export interface CrossStoryContext {
  current_story: string;
  /** Every OTHER story's ACs in this feature (status carried so the reviewer weighs a
   *  gated/approved sibling AC as a hard constraint). */
  sibling_stories: SiblingStory[];
  /** The architecture's deliberately-unresolved decisions (schema `open_decisions`). */
  open_decisions: OpenDecision[];
  /** The feature's MANDATED fields – the architecture's `not_null` persistence invariants. A field
   *  the schema requires must reach the DB through some story's WRITE path; if that path is a user
   *  submit, the submit's AC must SUPPLY it. Surfaced so the reviewer can catch a story that adds a
   *  required field (e.g. actor NOT NULL) that an earlier user-submit story never supplies – a
   *  field-CONTRACT gap (missing supply), NOT a contradiction, so check #8's opposite-outcome test
   *  misses it (the actor-not-sent defect: a required column with no client path to fill it). */
  required_persistence_fields: RequiredField[];
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

/** Assemble the cross-story review context for `currentStory` in `feature`: the OTHER
 *  stories' ACs + the architecture's open decisions. Never throws; missing pieces yield
 *  empty arrays. */
export function buildCrossStoryContext(consortDir: string, feature: string, currentStory: string): CrossStoryContext {
  const ctx: CrossStoryContext = { current_story: currentStory, sibling_stories: [], open_decisions: [], required_persistence_fields: [] };

  const currentDir = (() => {
    try {
      return basename(storyResolved(consortDir, feature, currentStory));
    } catch {
      return currentStory;
    }
  })();

  let dirs: string[] = [];
  try {
    dirs = fs.readdirSync(storiesDir(consortDir, feature));
  } catch {
    dirs = [];
  }
  for (const dir of dirs.sort()) {
    if (dir === currentDir) continue; // never fold the story under review into its own sibling context
    const acs: SiblingAc[] = [];
    for (const acId of storyAcIds(consortDir, feature, dir)) {
      try {
        const ac = JSON.parse(fs.readFileSync(acJson(consortDir, feature, dir, acId), "utf8")) as Record<string, unknown>;
        acs.push({
          ac_id: acId,
          status: str(ac.status),
          layer: str(ac.layer),
          given: str(ac.given),
          when: str(ac.when),
          then: str(ac.then),
          architectural_notes: str(ac.architectural_notes),
        });
      } catch {
        /* skip an unreadable/malformed AC file */
      }
    }
    if (acs.length) ctx.sibling_stories.push({ story: dir, acs });
  }

  try {
    const arch = JSON.parse(fs.readFileSync(architectureJson(consortDir, feature), "utf8")) as {
      open_decisions?: unknown;
      persistence_invariants?: unknown;
    };
    if (Array.isArray(arch.open_decisions)) {
      ctx.open_decisions = arch.open_decisions
        .filter((d): d is Record<string, unknown> => !!d && typeof (d as Record<string, unknown>).id === "string")
        .map((d) => ({
          id: String(d.id),
          question: str(d.question),
          decision_status: str(d.decision_status),
          resolved_by_story: str(d.resolved_by_story),
          resolution: str(d.resolution),
        }));
    }
    // Mandated fields: the `not_null` persistence invariants. Each is a field the schema REQUIRES,
    // so it must reach the DB through some story's write path; the reviewer checks that a required
    // field written via a user submit is actually supplied by that submit's AC.
    if (Array.isArray(arch.persistence_invariants)) {
      ctx.required_persistence_fields = arch.persistence_invariants
        .filter(
          (p): p is Record<string, unknown> =>
            !!p && typeof (p as Record<string, unknown>).id === "string" && (p as Record<string, unknown>).type === "not_null",
        )
        .map((p) => ({ invariant_id: String(p.id), table: str(p.table), brief: str(p.brief) }));
    }
  } catch {
    /* no architecture.json yet (early design) */
  }
  return ctx;
}

/**
 * The cross-story review context as a prompt BLOCK, for the orchestrator to INJECT into the
 * design-lane reviewers (navigator reflect, architect-reviewer) as a precondition. This is the
 * kit-owned delivery the reviewers can rely on: it rides the prompt deterministically, so the
 * cross-story checks never depend on the agent shelling out to `consort-cross-story-context`
 * (a spawned agent's `./scripts/lk` can fail to resolve the bin from its kit cache, which
 * silently skipped the review). Empty string when there is nothing cross-story to review — no
 * sibling stories AND no open decisions AND no mandated fields — so a lone-story feature injects
 * nothing (the preparer contract's "" degrade).
 */
export function renderCrossStoryContextBlock(consortDir: string, feature: string, story: string): string {
  const ctx = buildCrossStoryContext(consortDir, feature, story);
  if (
    ctx.sibling_stories.length === 0 &&
    ctx.open_decisions.length === 0 &&
    ctx.required_persistence_fields.length === 0
  ) {
    return "";
  }
  return (
    "CROSS-STORY CONTEXT — this story is NOT reviewed in isolation. The feature's OTHER stories' ACs, " +
    "the architecture's open_decisions, and its mandated (not-null) persistence fields are below; use them for " +
    "the cross-story checks (an AC contradicting a gated sibling AC; a mandated field no sibling submit AC supplies). " +
    "This IS that context — do not run `consort-cross-story-context` yourself.\n\n" +
    JSON.stringify(ctx, null, 2)
  );
}
