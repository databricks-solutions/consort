// Single source of truth for `.tdd/` artifact layout + format accessors.
//
// WHY THIS EXISTS: the knowledge of where each artifact lives and what shape it
// has was copy-pasted across ~20 files (findFeatureDir alone had 6 divergent
// copies). Producers and consumers then drifted onto different paths/fields and
// the deterministic driver stalled. Everything that touches a `.tdd/` artifact
// imports from HERE, so a producer and its consumer cannot reference different
// locations. Pure path builders + a few explicit read/write accessors; no other
// side effects.

import * as fs from "node:fs";
import { join } from "node:path";

// ── Artifact root name (single source of truth) ───────────────────
//
// The on-disk directory that holds all workflow artifacts + logs. Named
// ".consort" to match the Consort skill. It was historically ".tdd", then
// ".sftdd" (the consort-skill-rename era), and that name was copy-pasted as a
// default across ~20 call sites; this is the one place the name is now defined.
// Existing projects keep whichever legacy root they have (tri-read via
// resolveConsortDir, newest-first: ".sftdd" then ".tdd") and are auto-migrated to
// ".consort" by the orchestrator on the next run (see migrate-artifact-dir.ts).
export const ARTIFACT_ROOT = ".consort";
/** Prior artifact-root names, newest-first. READ (never written) for backward
 *  compatibility: a project still on ".sftdd" or the older ".tdd" is honored in
 *  place and auto-migrated to ".consort" on the next run. */
export const LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"] as const;
/** The immediate predecessor root. Retained as a named constant for the few
 *  call sites that reference "the legacy root" singularly; new code should use
 *  LEGACY_ARTIFACT_ROOTS (the full tri-read chain). */
export const LEGACY_ARTIFACT_ROOT: (typeof LEGACY_ARTIFACT_ROOTS)[number] = ".sftdd";

/** Every artifact-root directory name the kit recognises, current first then
 *  legacy (newest-first). The SINGLE source any scanner/skip-list uses to
 *  exclude the workflow bookkeeping dir – so a future rename touches only the
 *  constants above, never a hardcoded ".consort"/".sftdd"/".tdd" literal
 *  scattered across the tree. */
export const ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS] as const;

/** The artifact-root names as a regex-escaped alternation (`\.consort|\.sftdd|\.tdd`)
 *  for embedding in a directory-exclusion pattern. Derived from ALL_ARTIFACT_ROOTS so
 *  a scanner's skip-list stays in lockstep with the root rename – the ONE place the
 *  alternation is built (no consumer re-escapes the literal). */
export const artifactRootsRegexAlternation = (): string =>
  ALL_ARTIFACT_ROOTS.map((r) => r.replace(/[.]/g, "\\.")).join("|");

/** Resolve the artifact-root path for a project. Prefers the current
 *  ".consort"; honors a legacy root (".sftdd", then ".tdd") when that is what
 *  exists on disk; defaults to ".consort" for a fresh project. Pure read: never
 *  creates or renames. Pass the project dir (defaults to the current working
 *  directory) and use the result anywhere a bare artifact-root literal used to
 *  be hardcoded. */
export function resolveConsortDir(projectDir: string = process.cwd()): string {
  const next = join(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    const legacy = join(projectDir, legacyName);
    if (fs.existsSync(legacy)) return legacy;
  }
  return next;
}

// ── Top-level dirs ────────────────────────────────────────────────
export const featuresDir = (tdd: string): string => join(tdd, "features");
export const planningDir = (tdd: string): string => join(tdd, "planning");
export const sprintsDir = (tdd: string): string => join(tdd, "sprints");
export const cyclesRootDir = (tdd: string): string => join(tdd, "cycles");
export const experimentsRootDir = (tdd: string): string => join(tdd, "experiments");
/** Where escalations raised to the HIL are recorded (follow-up): any
 *  role/orchestration that hits a blocking problem (failed-green run, blocking
 *  smell, deploy verify-fail) writes one here; the driver routes to a single
 *  raise-to-hil halt while an unresolved one exists. */
export const escalationsDir = (tdd: string): string => join(tdd, "escalations");
export const escalationFile = (tdd: string, id: string): string => join(escalationsDir(tdd), `${id}.json`);

// Per-AC REVIEW: once an AC's tests are all green, the Navigator
// REVIEWs the AC's diff against the architecture + design guide and writes its
// verdict (review-verdict.json: { refactor, notes }); the orchestration records
// the review transition (review.json: { reviewed_at, refactor_requested,
// refactored_at }). Both live under the AC's cycles dir.
export const acReviewJson = (tdd: string, f: string, s: string, ac: string): string =>
  join(cyclesRootDir(tdd), f, s, ac, "review.json");
export const acReviewVerdictJson = (tdd: string, f: string, s: string, ac: string): string =>
  join(cyclesRootDir(tdd), f, s, ac, "review-verdict.json");
// Story-level review (the "story" loop granularity): the Navigator REVIEWs the
// WHOLE story in one turn and the Driver REFACTORs it in one turn, so the
// transition record lives at the story's cycles root (sibling of the per-AC
// dirs), not under any single AC. review-verdict.json is the Navigator's output
// ({ refactor, notes }); review.json records reviewed_at / refactor_requested /
// refactored_at – the same producer/consumer split as the per-AC pair above.
export const storyReviewJson = (tdd: string, f: string, s: string): string =>
  join(cyclesRootDir(tdd), f, s, "review.json");
export const storyReviewVerdictJson = (tdd: string, f: string, s: string): string =>
  join(cyclesRootDir(tdd), f, s, "review-verdict.json");

// ── Project-level artifacts ───────────────────────────────────────
export const workflowStateJson = (tdd: string): string => join(tdd, "workflow-state.json");
export const productOverviewMd = (tdd: string): string => join(tdd, "product-overview.md");
export const nfrsMd = (tdd: string): string => join(tdd, "nfrs.md");
/** Intake is "ready" (planning may propose) once BOTH project-level intake docs exist on disk:
 *  product-overview.md + nfrs.md. The Product Owner intake turn produces them; a fresh project has
 *  neither, so the drive dispatches that turn FIRST. ONE definition, used by BOTH the drive probe
 *  (orchestrator-probe) AND the sprint-planning derivation (orchestrator-sprint), so the two can
 *  never disagree about whether intake is done – the exact split that let the sprint path skip it. */
export const intakeReadyOnDisk = (tdd: string): boolean =>
  fs.existsSync(productOverviewMd(tdd)) && fs.existsSync(nfrsMd(tdd));
/** The intake-gate approval marker (`.consort/intake/approved`): written when the human (or, headless,
 *  the Human Proxy) approves the drafted intake at the intake gate. Its presence gates the transition
 *  from the intake turn to the Spec Author's propose – the drive parks at the gate until it exists. */
export const intakeApprovedMarker = (tdd: string): string => join(tdd, "intake", "approved");
/** True once the intake gate has been approved (the marker exists). Distinct from intakeReadyOnDisk
 *  (docs drafted): drafted-but-unapproved is exactly the state the intake gate pauses in. */
export const intakeApprovedOnDisk = (tdd: string): boolean => fs.existsSync(intakeApprovedMarker(tdd));
/** The design corpus dir (`.consort/design/`): the design brief, project-level
 *  design-guide, IA, and staged brand assets – the committed design half of a
 *  feature's spec. */
export const designDir = (tdd: string): string => join(tdd, "design");
export const designBriefMd = (tdd: string): string => join(designDir(tdd), "design-brief.md");
/** The UX Designer's project-level style guide (machine-checkable tokens),
 *  authored once from the design brief; gates the UI build (design-guide.md is
 *  its human-readable sibling, ia.md the information architecture). */
export const designGuideJson = (tdd: string): string => join(designDir(tdd), "design-guide.json");
/** The staged brand/design assets dir (`.consort/design/assets/`): where the intake
 *  stages an app icon / logo (e.g. `warehouse.png`) for the UX Designer to declare via
 *  the guide's `app_icon` and the kit to install the real bytes from. A staged asset
 *  with no `app_icon` is a design-guide defect (`brandAssetDeclared`). */
export const designAssetsDir = (tdd: string): string => join(designDir(tdd), "assets");
/** Project-level architecture conventions: the canonical layer layout (role ->
 *  module) the FIRST service-backed feature establishes, persisted across
 *  features so every later feature's architecture inherits + conforms to it
 *  (the architecture analogue of the project-level design-guide). */
export const architectureDir = (tdd: string): string => join(tdd, "architecture");
export const architectureConventionsJson = (tdd: string): string =>
  join(architectureDir(tdd), "conventions.json");
/** Project-level architecture CANON: the cross-cutting standing decisions (NFR
 *  posture, AC layers in use, persistence-invariant patterns) the first service-
 *  backed feature establishes and later features conform to. The conventions.json
 *  sibling for the architect's cross-cutting rules, so the per-story architect turn
 *  can project deterministically and only run live on novelty. */
export const architectureCanonJson = (tdd: string): string =>
  join(architectureDir(tdd), "canon.json");
/** The Spec Author's sprint proposal. ONE canonical location (project-level,
 *  sequential across sprints) – the path the spec-author actually writes. */
export const featureProposalsMd = (tdd: string): string => join(planningDir(tdd), "feature-proposals.md");

// ── Feature scope ─────────────────────────────────────────────────
//
// CONVENTION: a feature's directory is either exactly `<id>` (the driver/smoke
// convention, where the dir name IS the feature id) OR `<id>-<slug>` (the
// human-authored convention). findFeatureDir is the ONE rule that resolves
// either. The canonical CREATE path is the exact `<id>` (featureDir); every
// file builder targets the RESOLVED dir (featureResolved) so a reader and a
// writer of the same feature always land in the same place regardless of which
// naming the dir uses – the whole point of the single source of truth.
export const featureDir = (tdd: string, featureId: string): string => join(featuresDir(tdd), featureId);
/** The feature's on-disk dir (exact `<id>`, else unique `<id>-<slug>`), falling
 *  back to the exact create-path when it does not exist yet. Every feature-
 *  scoped file builder below resolves through this, so exact + slug dirs both
 *  resolve to one location for producers and consumers alike. */
export const featureResolved = (tdd: string, f: string): string => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
export const featureSpecJson = (tdd: string, f: string): string => join(featureResolved(tdd, f), "feature-spec.json");
export const featureSpecMd = (tdd: string, f: string): string => join(featureResolved(tdd, f), "feature-spec.md");
export const featureRequestMd = (tdd: string, f: string): string => join(featureResolved(tdd, f), "feature-request.md");
export const architectureJson = (tdd: string, f: string): string => join(featureResolved(tdd, f), "architecture.json");
export const architectureMd = (tdd: string, f: string): string => join(featureResolved(tdd, f), "architecture.md");
export const dbDesignJson = (tdd: string, f: string): string => join(featureResolved(tdd, f), "db-design.json");
export const dbDesignMd = (tdd: string, f: string): string => join(featureResolved(tdd, f), "db-design.md");
export const featureTestListJson = (tdd: string, f: string): string => join(featureResolved(tdd, f), "test-list.json");
export const featureTestListMd = (tdd: string, f: string): string => join(featureResolved(tdd, f), "test-list.md");
export const pipelineJson = (tdd: string, f: string): string => join(featureResolved(tdd, f), "pipeline.json");
export const featurePlanJson = (tdd: string, f: string): string => join(featureResolved(tdd, f), "plan.json");
export const featureGatesJson = (tdd: string, f: string): string => join(featureResolved(tdd, f), "gates.json");
export const featureNfrsMd = (tdd: string, f: string): string => join(featureResolved(tdd, f), "nfrs.md");
export const featureDeployEvidenceJson = (tdd: string, f: string): string =>
  join(featureResolved(tdd, f), "deploy-evidence.json");
/** The ONE bounded re-verify marker (issue #198): written by the
 *  deploy-verify-reverify effect, its presence + a still-failing verdict means the
 *  retry already ran (route the terminal HIL, never a repeated approve). */
export const featureDeployReverifyMarkerJson = (tdd: string, f: string): string =>
  join(featureResolved(tdd, f), "deploy-reverify.json");

// ── Story scope ───────────────────────────────────────────────────
//
// Story dirs follow the SAME exact-`<id>` / `<id>-<slug>` duality as feature
// dirs, resolved by the one findStoryDir rule. The canonical create path is the
// exact `<id>` (storyDir); every story file builder targets the RESOLVED dir
// (storyResolved) so the driver's exact-id probe + a slug-named human dir land
// in one place.
export const storiesDir = (tdd: string, f: string): string => join(featureResolved(tdd, f), "stories");
export const storyDir = (tdd: string, f: string, s: string): string => join(storiesDir(tdd, f), s);
/** Resolve a story's on-disk dir by id: exact `<id>`, else a unique `<id>-<slug>`;
 *  undefined when absent or ambiguous. The ONE story-dir resolution rule. */
export function findStoryDir(tdd: string, f: string, s: string): string | undefined {
  const root = storiesDir(tdd, f);
  if (!fs.existsSync(root)) return undefined;
  const exact = join(root, s);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === s || d.startsWith(`${s}-`));
  return matches.length === 1 ? join(root, matches[0]) : undefined;
}
/** The story's on-disk dir, falling back to the exact create-path when absent. */
export const storyResolved = (tdd: string, f: string, s: string): string =>
  findStoryDir(tdd, f, s) ?? storyDir(tdd, f, s);
export const storyJson = (tdd: string, f: string, s: string): string => join(storyResolved(tdd, f, s), "story.json");
export const acsDir = (tdd: string, f: string, s: string): string => join(storyResolved(tdd, f, s), "acs");
export const acJson = (tdd: string, f: string, s: string, ac: string): string => join(acsDir(tdd, f, s), `${ac}.json`);
/** The story-scoped test list (master scoped to one story's ACs). The canonical
 *  per-story location BOTH the writer (writeStoryTestList) and the driver's
 *  testListReady probe use, so they cannot drift. Named distinctly from the
 *  feature master (featureTestListJson) + the per-AC views (test-list-per-ac). */
export const storyTestListJson = (tdd: string, f: string, s: string): string =>
  join(storyResolved(tdd, f, s), "test-list-per-story.json");
export const storyPlanJson = (tdd: string, f: string, s: string): string => join(storyResolved(tdd, f, s), "plan.json");
/** The pre-build reflection critic's verdict for one story (the Navigator's
 *  reflect turn). Design-lane + per-story, so it is naturally feature+story
 *  isolated (parallel stories/features write independent verdicts, no shared
 *  reflect state). Shape in reflection.ts (ReflectVerdict). */
export const reflectVerdictJson = (tdd: string, f: string, s: string): string =>
  join(storyResolved(tdd, f, s), "reflect-verdict.json");
/** The hand-back note for a role's retry: the orchestrator writes it (what the
 *  role's prior turn failed to return) and the role's next prompt CONSUMES it
 *  (reads + deletes). Keyed by role (+ story when per-story) so concurrent
 *  per-story retries don't collide. */
export const handbackFile = (tdd: string, f: string, role: string, story?: string): string =>
  join(featureDir(tdd, f), ".handback", `${role}${story ? `.${story}` : ""}.md`);
export const storyDeployEvidenceJson = (tdd: string, f: string, s: string): string =>
  join(storyResolved(tdd, f, s), "deploy-evidence.json");

// ── Cycle scope ───────────────────────────────────────────────────
export const cycleDir = (tdd: string, f: string, s: string, ac: string): string =>
  join(cyclesRootDir(tdd), f, s, ac);
export const cycleFile = (tdd: string, f: string, s: string, ac: string, n: number): string =>
  join(cycleDir(tdd, f, s, ac), `cycle-${String(n).padStart(3, "0")}.json`);

// ── Sprint scope ──────────────────────────────────────────────────
export const sprintDir = (tdd: string, sprint: string): string => join(sprintsDir(tdd), sprint);
export const sprintGatesJson = (tdd: string, sprint: string): string => join(sprintDir(tdd, sprint), "gates.json");
export const backlogJson = (tdd: string, sprint: string): string => join(sprintDir(tdd, sprint), "backlog.json");
/** The feature ids REQUESTED for a sprint (the PO/proxy's per-sprint commitment).
 *  syncBacklog scopes the sprint's backlog to these, so a multi-sprint run does
 *  not pull an EARLIER sprint's already-built features (whose feature-request.md
 *  still exists on disk) into a LATER sprint's backlog. Absent => single-sprint /
 *  legacy: the backlog is every committed feature-request (back-compat). */
export const sprintRequestedJson = (tdd: string, sprint: string): string =>
  join(sprintDir(tdd, sprint), "requested.json");

// ── findFeatureDir: ONE definition, one behavior ──────────────────
/**
 * Resolve a feature's directory by id. Exact match preferred; falls back to a
 * unique prefix match (the kit's feature dirs are `<id>` or `<id>-<slug>`).
 * Returns undefined when absent or AMBIGUOUS (>1 prefix match) – callers decide
 * whether that is fatal. Replaces 6 divergent copies that variously threw,
 * picked-first, or returned undefined on the ambiguous case.
 */
export function findFeatureDir(tdd: string, featureId: string): string | undefined {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return undefined;
  const exact = join(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? join(root, matches[0]) : undefined;
}

/** Like findFeatureDir, but throws when the feature is absent or ambiguous.
 *  For the call sites that previously had their own throwing copy. */
export function requireFeatureDir(tdd: string, featureId: string): string {
  const dir = findFeatureDir(tdd, featureId);
  if (!dir) throw new Error(`feature ${featureId} not found (or ambiguous) under ${featuresDir(tdd)}`);
  return dir;
}

// ── Format accessors (the shape knowledge, defined once) ──────────

export type AcLayer = "API" | "E2E" | "Infra";

/** The AC ids a story has, from disk truth: the union of story.json `acs` (id
 *  list or {id} objects) AND the acs/<AC>.json files actually present. The Spec
 *  Author writes acs/<AC>.json but does not always backfill story.json. */
export function storyAcIds(tdd: string, f: string, s: string): string[] {
  const ids = new Set<string>();
  const sj = storyJson(tdd, f, s);
  if (fs.existsSync(sj)) {
    try {
      const data = JSON.parse(fs.readFileSync(sj, "utf8")) as { acs?: unknown };
      if (Array.isArray(data.acs)) {
        for (const a of data.acs) {
          const id = typeof a === "string" ? a : (a as { id?: string })?.id;
          if (typeof id === "string" && id.length > 0) ids.add(id);
        }
      }
    } catch {
      /* fall through to on-disk acs/ files */
    }
  }
  const dir = acsDir(tdd, f, s);
  if (fs.existsSync(dir)) {
    try {
      for (const file of fs.readdirSync(dir)) {
        const m = /^(.+)\.json$/.exec(file);
        if (!m) continue;
        const base = m[1];
        // Count a file as an AC only if it IS one: a conformant AC self-names
        // (acs/<id>.json holds { id: "<id>" }). This rejects non-AC files an
        // agent may drop into acs/ (e.g. <ac>-tests.json / <ac>-test-list.json,
        // whose `id` is the AC they test, not their suffixed basename). Without
        // this, those pollute the AC set: every "AC" must have a layer for
        // architectAnnotated, the test files have none, and the design lane
        // stalls re-dispatching the Architect forever.
        try {
          const obj = JSON.parse(fs.readFileSync(join(dir, file), "utf8")) as { id?: unknown };
          if (obj && typeof obj.id === "string" && obj.id === base) ids.add(base);
        } catch {
          /* unparseable -> not a conformant AC file; skip */
        }
      }
    } catch {
      /* ignore unreadable acs/ */
    }
  }
  return [...ids];
}

/** Read an AC's `layer` from its acs/<AC>.json across the feature's stories.
 *  Undefined when the AC file is absent/malformed or has no valid layer. */
export function readAcLayer(tdd: string, f: string, acId: string): AcLayer | undefined {
  const stories = storiesDir(tdd, f);
  if (!fs.existsSync(stories)) return undefined;
  for (const s of fs.readdirSync(stories)) {
    const file = acJson(tdd, f, s, acId);
    if (!fs.existsSync(file)) continue;
    try {
      const ac = JSON.parse(fs.readFileSync(file, "utf8")) as { layer?: AcLayer };
      if (ac.layer === "API" || ac.layer === "E2E" || ac.layer === "Infra") return ac.layer;
    } catch {
      /* treat malformed as no layer */
    }
  }
  return undefined;
}

/** Read an AC's `architectural_notes` (the Architect Reviewer's distinctive
 *  per-AC output: layer rationale + cross-cutting concerns + owner module).
 *  Undefined when the AC file is absent/malformed or has no notes. Used to tell
 *  whether the ARCHITECT annotated the AC, vs the spec-author merely filling the
 *  schema-required `layer`. */
export function readAcArchitecturalNotes(tdd: string, f: string, acId: string): string | undefined {
  const stories = storiesDir(tdd, f);
  if (!fs.existsSync(stories)) return undefined;
  for (const s of fs.readdirSync(stories)) {
    const file = acJson(tdd, f, s, acId);
    if (!fs.existsSync(file)) continue;
    try {
      const ac = JSON.parse(fs.readFileSync(file, "utf8")) as { architectural_notes?: unknown };
      if (typeof ac.architectural_notes === "string" && ac.architectural_notes.trim().length > 0) {
        return ac.architectural_notes;
      }
    } catch {
      /* treat malformed as no notes */
    }
  }
  return undefined;
}

/** Does this feature have its Feature Requester ask on disk? */
export const hasFeatureRequest = (tdd: string, f: string): boolean => fs.existsSync(featureRequestMd(tdd, f));

// ── Planning estimates (the team's feature-level t-shirt sizing) ──────
//
// At /plan, the candidate features the Spec Author proposed are sized by the
// Architect (the enterprise-architect hat) so the Product Owner can commit
// against sprint capacity. Estimates are FEATURE-level t-shirt sizes here
// (stories don't exist until breakdown, inside the feature phase). The Architect
// writes ONE estimates.json under planning/; sync-backlog reads the sizes from
// it to enrich the PO's committed backlog. One writer, one reader.
export type TshirtSize = "XS" | "S" | "M" | "L" | "XL";
const TSHIRT_SIZES = new Set<string>(["XS", "S", "M", "L", "XL"]);
export const isTshirtSize = (x: unknown): x is TshirtSize => typeof x === "string" && TSHIRT_SIZES.has(x);

export interface FeatureEstimate {
  feature_id: string;
  size: TshirtSize;
  rationale?: string;
}

/** The Architect's feature-level t-shirt sizing for a sprint's candidates. */
export const planningEstimatesJson = (tdd: string): string => join(planningDir(tdd), "estimates.json");

/** Read the planning estimates (feature-level t-shirt sizes). Empty when none. */
export function readEstimates(tdd: string): FeatureEstimate[] {
  const file = planningEstimatesJson(tdd);
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as { estimates?: unknown };
    if (!Array.isArray(data.estimates)) return [];
    return data.estimates.flatMap((e) => {
      const id = (e as { feature_id?: unknown })?.feature_id;
      const size = (e as { size?: unknown })?.size;
      if (typeof id !== "string" || !id || !isTshirtSize(size)) return [];
      const rationale = (e as { rationale?: unknown })?.rationale;
      return [{ feature_id: id, size, ...(typeof rationale === "string" ? { rationale } : {}) }];
    });
  } catch {
    return [];
  }
}

/** Write the planning estimates artifact (creates the planning dir). */
export function writeEstimates(tdd: string, estimates: FeatureEstimate[]): void {
  fs.mkdirSync(planningDir(tdd), { recursive: true });
  fs.writeFileSync(planningEstimatesJson(tdd), JSON.stringify({ estimates }, null, 2) + "\n", "utf8");
}

/** True once the Architect has sized at least one candidate feature. */
export const hasEstimates = (tdd: string): boolean => readEstimates(tdd).length > 0;

// ── Sprint backlog (the PO's committed sprint membership) ─────────────
//
// The backlog is the Product Owner's call: the features committed to THIS
// sprint, each carrying the t-shirt size the Architect estimated. Written by
// the deterministic sync-backlog step (the ONE writer) by projecting the
// features the PO authored a feature-request.md for + their estimated size.
export interface BacklogFeature {
  id: string;
  /** The Architect's t-shirt size (absent if the feature was never estimated). */
  size?: TshirtSize;
}
export interface SprintBacklog {
  sprint: string;
  /** Committed features, in execution order, each with its estimated size. */
  features: BacklogFeature[];
}

/** The feature ids of a backlog, in order (the common projection callers need). */
export const backlogFeatureIds = (b: SprintBacklog): string[] => b.features.map((f) => f.id);

/** Read the sprint backlog. Empty when none written yet. Tolerates the legacy
 *  bare-string-id form (`features: ["F1", ...]`) so old artifacts still read. */
export function readBacklog(tdd: string, sprint: string): SprintBacklog {
  const file = backlogJson(tdd, sprint);
  if (!fs.existsSync(file)) return { sprint, features: [] };
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as { features?: unknown };
    const features: BacklogFeature[] = Array.isArray(data.features)
      ? data.features.flatMap((x) => {
          if (typeof x === "string" && x.length > 0) return [{ id: x }];
          const id = (x as { id?: unknown })?.id;
          if (typeof id !== "string" || !id) return [];
          const size = (x as { size?: unknown })?.size;
          return [{ id, ...(isTshirtSize(size) ? { size } : {}) }];
        })
      : [];
    return { sprint, features };
  } catch {
    return { sprint, features: [] };
  }
}

/** Write the sprint backlog manifest (creates the sprint dir). */
export function writeBacklog(tdd: string, backlog: SprintBacklog): void {
  fs.mkdirSync(sprintDir(tdd, backlog.sprint), { recursive: true });
  fs.writeFileSync(backlogJson(tdd, backlog.sprint), JSON.stringify(backlog, null, 2) + "\n", "utf8");
}

/**
 * The sprint's REQUESTED feature ids (`sprints/<s>/requested.json`) – the single
 * membership declaration that scopes syncBacklog. `undefined` means the file is
 * absent (unscoped: every committed request is in scope, single-sprint/legacy);
 * `[]` means present-but-empty (nothing in scope). Both the Human Proxy (headless,
 * from $LAKEBASE_CONSORT_SPRINT_REQUESTS) and a human-in-the-loop PO (via
 * consort-sync-backlog) declare membership through THIS one file.
 */
export function readRequested(tdd: string, sprint: string): string[] | undefined {
  const file = sprintRequestedJson(tdd, sprint);
  if (!fs.existsSync(file)) return undefined;
  try {
    const p = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Declare/extend the sprint's requested feature ids. MERGES with any existing set
 *  (a resume must never shrink membership), dedups + sorts, writes, and returns the
 *  merged list. The one writer for requested.json (Human Proxy + the sync-backlog
 *  CLI both go through here). */
export function writeRequested(tdd: string, sprint: string, ids: string[]): string[] {
  const existing = readRequested(tdd, sprint) ?? [];
  const merged = [...new Set([...existing, ...ids])].sort();
  fs.mkdirSync(sprintDir(tdd, sprint), { recursive: true });
  fs.writeFileSync(sprintRequestedJson(tdd, sprint), JSON.stringify(merged, null, 2) + "\n", "utf8");
  return merged;
}

/**
 * Project the committed backlog from disk: every feature that has a
 * feature-request.md (the PO's commitment), in directory order, enriched with
 * the Architect's t-shirt size from estimates.json. This is the deterministic
 * sync-backlog body – the single bridge from "PO authored a request" to the
 * backlog the driver reads, so producer (PO) and consumer (driver) never drift.
 */
export function syncBacklog(tdd: string, sprint: string): SprintBacklog {
  const sizeOf = new Map(readEstimates(tdd).map((e) => [e.feature_id, e.size] as const));
  const root = featuresDir(tdd);
  // Sprint scope: the features REQUESTED for THIS sprint (requested.json), so a
  // later sprint's backlog excludes an earlier sprint's already-built features
  // whose feature-request.md still sits on disk. Absent => single-sprint/legacy:
  // every committed request is in scope (unchanged behavior).
  const requested = readRequested(tdd, sprint);
  const scope: Set<string> | undefined = requested ? new Set(requested) : undefined;
  const committed = fs.existsSync(root)
    ? fs
        .readdirSync(root)
        .filter((d) => {
          try {
            if (!fs.statSync(join(root, d)).isDirectory()) return false;
            if (!fs.existsSync(join(root, d, "feature-request.md"))) return false;
            return scope ? scope.has(d) : true;
          } catch {
            return false;
          }
        })
        .sort()
    : [];
  const features: BacklogFeature[] = committed.map((id) => {
    const size = sizeOf.get(id);
    return { id, ...(size ? { size } : {}) };
  });
  const backlog: SprintBacklog = { sprint, features };
  writeBacklog(tdd, backlog);
  return backlog;
}
