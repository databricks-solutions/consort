import { readFileSync, existsSync, readdirSync, writeFileSync, statSync } from "fs";
import { join, basename } from "path";
import type Ajv from "ajv";
import { getValidator, loadSchema } from "../../consort/orchestrator/validators/schema-loader.js";
import { requireFeatureDir as findFeatureDir, featuresDir as featuresDirOf, storiesDir } from "../../consort/config/consort-paths.js";

type Phase =
  | "discovery"
  | "architectural-review"
  | "test-list-construction"
  | "design-spec-gate"
  | "implementation"
  | "synthesis"
  | "review"
  | "shipped"
  | "abandoned";

/**
 * Non-functional requirement. NFRs are owned by the Architect and live in
 * architecture.json (HIL-adjudicated at Gate 2), NOT on the spec-author-owned
 * feature-spec.json/story.json, putting them there drifted the spec gate.
 */
export interface Nfr {
  category: string;
  requirement: string;
  notes?: string;
}

export interface Feature {
  id: string;
  name: string;
  status: string;
  tdd_mode: "N=1" | "N>=2";
  success_metrics?: string[];
  stories?: string[];
  experiment_count_default?: number;
  owner?: string;
  external_ref?: { adapter: string; external_id: string };
}

export interface Story {
  id: string;
  asA: string;
  iWantTo: string;
  soThat: string;
  acs?: string[];
  feature_id?: string;
  external_ref?: Feature["external_ref"];
}

export interface AC {
  id: string;
  layer: "API" | "E2E" | "Infra";
  given: string;
  when: string;
  then: string;
  status: string;
  scenarios?: string[];
  nfrs?: Nfr[];
  architectural_notes?: string;
  story_id?: string;
  external_ref?: Feature["external_ref"];
}

export interface WorkflowState {
  phase: Phase;
  started_at: string;
  feature_id?: string | null;
  story_id?: string | null;
  ac_id?: string | null;
  cycle_id?: string | null;
  experiment_id?: string | null;
  last_transition_at?: string;
  last_transition_by?: string;
}

export interface DriftReport {
  file: string;
  kind: "schema" | "pair-missing" | "id-mismatch" | "narrative-empty";
  detail: string;
}

function makeValidator() {
  // Validators come from the shared schema-loader cache so spec-sync and
  // artifact-conformance validate against the identical compiled schemas.
  return {
    feature: getValidator("feature.schema.json"),
    story: getValidator("story.schema.json"),
    ac: getValidator("ac.schema.json"),
    testList: getValidator("test-list.schema.json"),
    workflowState: getValidator("workflow-state.schema.json"),
  };
}

export function readFeature(consortDir: string, featureId: string): Feature {
  const dir = findFeatureDir(consortDir, featureId);
  const jsonPath = join(dir, "feature-spec.json");
  return JSON.parse(readFileSync(jsonPath, "utf8"));
}

// The properties story.schema.json allows (additionalProperties:false). DERIVED from the
// schema itself (single source of truth) so a valid field can never be silently stripped by
// normalizeStoryJson again — the drift that dropped `requires_e2e` and quietly disabled the
// E2E spec gate. The schema's `additionalProperties:false` makes its property set the exact
// allow-list; a guard test asserts the two agree. (`status`, a stray pipeline runtime key, is
// not a schema property, so it is still stripped — the normalizer's original intent.)
const STORY_ALLOWED_KEYS = new Set(
  Object.keys((loadSchema("story.schema.json") as { properties?: Record<string, unknown> }).properties ?? {}),
);

/**
 * Parse the "As a … / I want … / So that …" narrative out of a story.md. The
 * spec-author writes this narrative verbatim into story.md (it is the story's
 * whole point), so story.md is the single source of truth for the three
 * schema-required story fields. Tolerant of the trailing-comma/period and
 * trailing hard-wrap spaces the role tends to emit; case-insensitive on the
 * lead-in. Returns only the parts it finds.
 */
export function parseStoryNarrative(md: string): { asA?: string; iWantTo?: string; soThat?: string } {
  const grab = (label: RegExp): string | undefined => {
    const m = md.match(label);
    if (!m) return undefined;
    // Strip the trailing connector punctuation the narrative lines carry
    // ("As a warehouse engineer," / "So that ….") and surrounding whitespace.
    const v = m[1].trim().replace(/[,.]$/, "").trim();
    return v.length > 0 ? v : undefined;
  };
  return {
    asA: grab(/^\s*As an?\s+(.+?)\s*$/im),
    iWantTo: grab(/^\s*I want(?:\s+to)?\s+(.+?)\s*$/im),
    soThat: grab(/^\s*So that\s+(.+?)\s*$/im),
  };
}

/**
 * Bring each of a feature's story.json files into story.schema conformance, the
 * deterministic way the spec-author LLM tends to drift: map a stray `feature` to
 * the canonical `feature_id`, STRIP any property the schema forbids (e.g.
 * `status`, which belongs to pipeline.json, not the spec), and BACKFILL the
 * schema-required narrative fields (asA/iWantTo/soThat) from the authoritative
 * story.md when the breakdown emitted them there but not in the JSON stub (the
 * observed drift: breakdown wrote `{id, scope, independence}` + the full As-a/
 * I-want/So-that narrative in story.md, so the JSON tripped the feature-complete
 * gate after ~160 build turns). Idempotent; returns the story ids it changed.
 * Runs at the reconcile seam so the feature-complete conformance gate sees a
 * conformant artifact WITHOUT depending on the role model emitting the exact
 * shape (the same structural-not-model-dependent intent as reconcileArtifactLog
 * + the conventions/canon establishment).
 */
export function normalizeStoryJson(consortDir: string, featureId: string): string[] {
  const stories = storiesDir(consortDir, featureId);
  if (!existsSync(stories)) return [];
  const changed: string[] = [];
  for (const s of readdirSync(stories)) {
    const dir = join(stories, s);
    const file = join(dir, "story.json");
    if (!existsSync(file)) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    } catch {
      continue; // malformed; the gate will surface it
    }
    let mutated = false;
    // Preserve the LLM's intent: a stray `feature` becomes the canonical feature_id.
    if (typeof obj.feature === "string" && obj.feature_id === undefined) {
      obj.feature_id = obj.feature;
      mutated = true;
    }
    // Backfill missing narrative fields from story.md (the authoritative source).
    const mdPath = join(dir, "story.md");
    const needsNarrative = ["asA", "iWantTo", "soThat"].some(
      (k) => typeof obj[k] !== "string" || (obj[k] as string).trim().length === 0,
    );
    if (needsNarrative && existsSync(mdPath)) {
      const narrative = parseStoryNarrative(readFileSync(mdPath, "utf8"));
      for (const k of ["asA", "iWantTo", "soThat"] as const) {
        const cur = obj[k];
        if ((typeof cur !== "string" || cur.trim().length === 0) && narrative[k]) {
          obj[k] = narrative[k];
          mutated = true;
        }
      }
    }
    for (const key of Object.keys(obj)) {
      if (!STORY_ALLOWED_KEYS.has(key)) {
        delete obj[key];
        mutated = true;
      }
    }
    if (mutated) {
      writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
      changed.push(s);
    }
  }
  return changed;
}

/** The story.json fields the feature-complete conformance gate hard-requires
 *  (story.schema.json `required`). story.md is the authoritative narrative source. */
const REQUIRED_STORY_NARRATIVE = ["asA", "iWantTo", "soThat"] as const;

/**
 * Heal each of a feature's story.json stubs from the authoritative story.md
 * (normalizeStoryJson backfill), THEN report the stories whose story.json STILL
 * lacks a required narrative field – i.e. story.md ALSO carried no parseable
 * As-a/I-want/So-that. This is the breakdown post-hook's fail-fast input: the
 * spec-author reliably writes the narrative to story.md but not always the JSON
 * stub, so the backfill fixes the common case; a story the backfill CANNOT fix is
 * a genuinely incomplete breakdown that must HALT at design (the caller returns
 * non-zero), not detonate the feature-complete conformance gate ~160 build turns
 * later after the whole feature is built + accepted. Idempotent (delegates to the
 * idempotent normalizeStoryJson). Returns the ids it healed + the ids still
 * missing narrative (with the specific gap fields).
 */
export function healAndReportStoryNarrative(
  consortDir: string,
  featureId: string,
): { healed: string[]; missing: { story: string; fields: string[] }[] } {
  const healed = normalizeStoryJson(consortDir, featureId);
  const stories = storiesDir(consortDir, featureId);
  const missing: { story: string; fields: string[] }[] = [];
  if (existsSync(stories)) {
    for (const s of readdirSync(stories)) {
      const file = join(stories, s, "story.json");
      if (!existsSync(file)) continue; // no stub yet – the breakdown-complete guard owns that
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      } catch {
        missing.push({ story: s, fields: ["<unparseable story.json>"] });
        continue;
      }
      const gaps = REQUIRED_STORY_NARRATIVE.filter(
        (k) => typeof obj[k] !== "string" || (obj[k] as string).trim().length === 0,
      );
      if (gaps.length > 0) missing.push({ story: s, fields: [...gaps] });
    }
  }
  return { healed, missing };
}

export function writeFeature(consortDir: string, feature: Feature): void {
  const dir = findFeatureDir(consortDir, feature.id);
  const jsonPath = join(dir, "feature-spec.json");
  writeFileSync(jsonPath, JSON.stringify(feature, null, 2) + "\n");
}

export function readWorkflowState(consortDir: string): WorkflowState | null {
  const file = join(consortDir, "workflow-state.json");
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

export function writeWorkflowState(consortDir: string, state: WorkflowState): void {
  const file = join(consortDir, "workflow-state.json");
  writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
}

export function validateSpec(consortDir: string): DriftReport[] {
  const reports: DriftReport[] = [];
  const v = makeValidator();

  // Workflow state
  const wsPath = join(consortDir, "workflow-state.json");
  if (existsSync(wsPath)) {
    const ws = JSON.parse(readFileSync(wsPath, "utf8"));
    if (!v.workflowState(ws)) {
      reports.push({ file: wsPath, kind: "schema", detail: JSON.stringify(v.workflowState.errors) });
    }
  }

  // Features
  const featuresDir = featuresDirOf(consortDir);
  if (!existsSync(featuresDir)) return reports;
  for (const featureDirName of readdirSync(featuresDir)) {
    const featureDir = join(featuresDir, featureDirName);
    if (!statSync(featureDir).isDirectory()) continue;
    checkPair(featureDir, "feature", v.feature, reports);

    const storiesDir = join(featureDir, "stories");
    if (!existsSync(storiesDir)) continue;
    for (const storyDirName of readdirSync(storiesDir)) {
      const storyDir = join(storiesDir, storyDirName);
      if (!statSync(storyDir).isDirectory()) continue;
      checkPair(storyDir, "story", v.story, reports);

      const acsDir = join(storyDir, "acs");
      if (existsSync(acsDir)) {
        for (const acFile of readdirSync(acsDir).filter((f) => f.endsWith(".json"))) {
          const acJsonPath = join(acsDir, acFile);
          const ac = JSON.parse(readFileSync(acJsonPath, "utf8"));
          if (!v.ac(ac)) {
            reports.push({ file: acJsonPath, kind: "schema", detail: JSON.stringify(v.ac.errors) });
          }
          const mdPath = acJsonPath.replace(/\.json$/, ".md");
          if (!existsSync(mdPath)) {
            reports.push({ file: mdPath, kind: "pair-missing", detail: "AC .md narrative missing" });
          }
        }
      }
    }

    const testListJson = join(featureDir, "test-list.json");
    if (existsSync(testListJson)) {
      const list = JSON.parse(readFileSync(testListJson, "utf8"));
      if (!v.testList(list)) {
        reports.push({ file: testListJson, kind: "schema", detail: JSON.stringify(v.testList.errors) });
      }
    }
  }
  return reports;
}

function checkPair(
  dir: string,
  kind: "feature" | "story",
  validator: ReturnType<Ajv["compile"]>,
  reports: DriftReport[]
): void {
  // The feature pair is feature-spec.json + feature-spec.md (Spec Author's
  // structured spec); story stays story.json + story.md.
  const stem = kind === "feature" ? "feature-spec" : kind;
  const jsonPath = join(dir, `${stem}.json`);
  const mdPath = join(dir, `${stem}.md`);
  if (!existsSync(jsonPath)) {
    reports.push({ file: jsonPath, kind: "pair-missing", detail: `${stem}.json missing` });
    return;
  }
  if (!existsSync(mdPath)) {
    reports.push({ file: mdPath, kind: "pair-missing", detail: `${stem}.md missing` });
  } else if (statSync(mdPath).size < 20) {
    reports.push({ file: mdPath, kind: "narrative-empty", detail: `${stem}.md narrative empty` });
  }
  const obj = JSON.parse(readFileSync(jsonPath, "utf8"));
  if (!validator(obj)) {
    reports.push({ file: jsonPath, kind: "schema", detail: JSON.stringify(validator.errors) });
  }
  if (obj.id && !basename(dir).startsWith(obj.id)) {
    reports.push({
      file: jsonPath,
      kind: "id-mismatch",
      detail: `dir name ${basename(dir)} does not start with id ${obj.id}`,
    });
  }
}
