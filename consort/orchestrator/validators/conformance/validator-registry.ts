// validator-registry: the CODE face of a step's outputs – named, deterministic
// OutputValidator fns a manifest references BY NAME. The manifest is DATA (it carries the
// validator name); this registry maps that name to the actual in-code check. A manifest
// typo (an unknown name) is a HARD failure at resolve time, never a silent skip – the
// same fail-loud philosophy as MockStepContract's missing-route throw.
//
// The validators themselves live here so both the orchestrator (validate-outputs phase) and
// the agent (via a step's conformanceValidators, self-check in-turn) run the SAME fn. The
// first two are the breakdown step's validators, lifted from spec-author-breakdown-step.ts;
// that file now re-exports them so existing importers keep working.

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { checkArtifactConformance } from "./artifact-conformance.js";
import { getValidator, formatSchemaErrors } from "../schema-loader.js";
import type { OutputValidator, OutputValidationResult } from "../../steps/step-contract.js";
import { enabledAnalysts } from "../../../test-list/test-analyst-catalogue.js";
import { resolveConsortSettings } from "../../settings/project-settings.js";

/**
 * feature-spec validator: the produced feature-spec.json must parse + conform to
 * feature.schema.json AND carry a non-empty stories[] (the breakdown deliverable).
 * Deterministic – the orchestrator ACCEPTS/REJECTS on this, never a follow-up to the agent.
 */
export function featureSpecNonEmptyStories(producedPath: string): OutputValidationResult {
  let content: string;
  try {
    content = readFileSync(producedPath, "utf8");
  } catch {
    return { ok: false, violations: [`feature-spec.json not readable at ${producedPath}`] };
  }
  const conf = checkArtifactConformance("feature-spec.json", content);
  if (!conf.ok) return { ok: false, violations: conf.violations };
  try {
    const spec = JSON.parse(content) as { stories?: unknown };
    if (!Array.isArray(spec.stories) || spec.stories.length === 0) {
      return { ok: false, violations: ["feature-spec.json has an empty or missing stories[] (the breakdown must enumerate >=1 story)"] };
    }
  } catch (e) {
    return { ok: false, violations: [`feature-spec.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }
  return { ok: true, violations: [] };
}

/**
 * agent-log validator: the produced agent-log.jsonl must have >=1 line, each a JSON object
 * conforming to agent-log-event.schema.json, and at least one line from THIS role recording
 * what it did. This is how "the agent logs what it did + surfaces issues" is enforced
 * deterministically. Parameterized by the role that must appear.
 */
export function agentLogHasRoleEvent(producedPath: string, role = "spec-author"): OutputValidationResult {
  let raw: string;
  try {
    raw = readFileSync(producedPath, "utf8");
  } catch {
    return { ok: false, violations: [`agent-log.jsonl not readable at ${producedPath} (the agent must log what it did via the shared agent-log script)`] };
  }
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { ok: false, violations: ["agent-log.jsonl is empty (the agent must log at least one event: what it did / any issue surfaced)"] };
  }
  const validate = getValidator("agent-log-event.schema.json");
  const violations: string[] = [];
  let sawRoleEvent = false;
  for (const [i, line] of lines.entries()) {
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      violations.push(`agent-log.jsonl line ${i + 1} is not valid JSON`);
      continue;
    }
    if (!validate(obj)) {
      violations.push(`agent-log.jsonl line ${i + 1}: ${formatSchemaErrors(validate).join("; ")}`);
      continue;
    }
    if ((obj as { role?: string }).role === role) sawRoleEvent = true;
  }
  if (!sawRoleEvent && violations.length === 0) {
    violations.push(`agent-log.jsonl has no ${role} event (the role must log what it did)`);
  }
  return { ok: violations.length === 0, violations };
}

/**
 * test-strategist FAN-OUT provenance validator: the Test Strategist is a SUPERVISOR that must spawn one
 * per-kind test-analyst subagent (behavior / fitness / client) and reconcile their slices — it must NOT
 * author the test list solo. Nothing downstream can tell a fanned-out list from a solo-authored one (both
 * can be schema-conformant), so this gates on the PROCESS: the roster prompt mandates a reasoning event
 * whose message carries the token `test-analyst:<kind>` per analyst it dispatches, and this validator
 * requires one such event for EACH analyst ENABLED for the project (client only when uiTrack). A solo turn
 * logs no dispatch events and fails here. It also keeps the existing role-event requirement (the role must
 * have logged at all). Enablement is resolved from the project itself (the log lives at
 * `<consortDir>/agent-log.jsonl`, so projectDir = dirname(consortDir)), so the check needs only the path.
 */
export function testStrategistDispatchedAnalysts(producedPath: string): OutputValidationResult {
  // The role must have logged at all (shape + a test-strategist event) — subsumes the old check.
  const base = agentLogHasRoleEvent(producedPath, "test-strategist");
  if (!base.ok) return base;
  const consortDir = dirname(producedPath);
  const projectDir = dirname(consortDir);
  let uiTrack = true; // fail SAFE: if settings can't resolve, demand the full roster (incl. client)
  try {
    uiTrack = resolveConsortSettings({ projectDir }).project.uiTrack;
  } catch {
    /* keep the conservative default */
  }
  const kinds = enabledAnalysts({ projectDir, uiTrack }).map((a) => a.kind);
  let raw: string;
  try {
    raw = readFileSync(producedPath, "utf8");
  } catch {
    return { ok: false, violations: [`agent-log.jsonl not readable at ${producedPath}`] };
  }
  const messages: string[] = [];
  for (const line of raw.split("\n").map((l) => l.trim()).filter(Boolean)) {
    try {
      const obj = JSON.parse(line) as { role?: string; message?: string };
      if (obj.role === "test-strategist" && typeof obj.message === "string") messages.push(obj.message);
    } catch {
      /* a malformed line is caught by agentLogHasRoleEvent above; ignore here */
    }
  }
  const missing = kinds.filter((k) => !messages.some((m) => m.includes(`test-analyst:${k}`)));
  if (missing.length > 0) {
    return {
      ok: false,
      violations: [
        `the test-strategist did not dispatch the ${missing.join(", ")} analyst${missing.length > 1 ? "s" : ""} ` +
          `(no \`test-analyst:<kind>\` dispatch reasoning event found). The strategist SUPERVISES: it must spawn ` +
          `one Task subagent per enabled roster analyst, not author the test list solo. Re-run the turn fanning ` +
          `out to each analyst and logging the mandated per-dispatch event.`,
      ],
    };
  }
  return { ok: true, violations: [] };
}

/**
 * nonEmptyFile validator: the produced file exists and carries non-whitespace content. The
 * generic "the human/agent actually authored something here" check – used for the PO's
 * seed markdown (product-overview.md / nfrs.md / design-brief.md), where the deliverable is
 * prose, not a schema-validated artifact.
 */
export function nonEmptyFile(producedPath: string): OutputValidationResult {
  let content: string;
  try {
    content = readFileSync(producedPath, "utf8");
  } catch {
    return { ok: false, violations: [`file not readable at ${producedPath}`] };
  }
  if (content.trim().length === 0) {
    return { ok: false, violations: [`file at ${producedPath} is empty (expected authored content)`] };
  }
  return { ok: true, violations: [] };
}

/**
 * design-guide validator: the produced design-guide.json must parse + conform to
 * design-guide.schema.json (the token + component shape the UX Designer emits, which the
 * downstream design-adherence gate checks). Deterministic – the same conformance the response
 * self-check runs. Used for the ux-designer step's output.
 */
export function designGuideConformant(producedPath: string): OutputValidationResult {
  let content: string;
  try {
    content = readFileSync(producedPath, "utf8");
  } catch {
    return { ok: false, violations: [`design-guide.json not readable at ${producedPath}`] };
  }
  const conf = checkArtifactConformance("design-guide.json", content);
  return conf.ok ? { ok: true, violations: [] } : { ok: false, violations: conf.violations };
}

/**
 * Generic schema-conformance validator factory: read the produced file and check it against
 * one of the kit's canonical artifact schemas (via the SAME checkArtifactConformance the design
 * gate + response self-check use, so a manifest output is gated to the exact schema its role
 * ships). Used for the design-role INTEGRATION live chains, where a real agent authors the
 * artifact and the orchestrator must reject a non-conformant one (not merely a non-empty file).
 */
function conformsTo(artifactName: string): OutputValidator {
  return (producedPath: string): OutputValidationResult => {
    let content: string;
    try {
      content = readFileSync(producedPath, "utf8");
    } catch {
      return { ok: false, violations: [`${artifactName} not readable at ${producedPath}`] };
    }
    const conf = checkArtifactConformance(artifactName, content);
    return conf.ok ? { ok: true, violations: [] } : { ok: false, violations: conf.violations };
  };
}

/**
 * navigatorTestsAuthored validator: the Navigator's RED turn writes TEST code under tests/. The
 * deterministic floor is "a non-empty tests/ tree exists" (the coverage+faithfulness judgment is
 * the opus RED-coverage judge, not this check). producedPath is the tests/ dir (existsSync passes
 * for a dir). Passes iff it is a directory holding >=1 test file (.py/.ts/.tsx).
 */
export function navigatorTestsAuthored(producedPath: string): OutputValidationResult {
  if (!existsSync(producedPath) || !statSync(producedPath).isDirectory()) {
    return { ok: false, violations: [`navigator RED wrote no tests/ tree at ${producedPath}`] };
  }
  const isTest = (n: string): boolean => /\.(py|ts|tsx|js|jsx)$/.test(n);
  const walk = (dir: string): boolean => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (walk(abs)) return true;
      } else if (isTest(e.name)) {
        return true;
      }
    }
    return false;
  };
  return walk(producedPath)
    ? { ok: true, violations: [] }
    : { ok: false, violations: [`navigator RED tests/ tree at ${producedPath} has no test file (.py/.ts/.tsx/.js/.jsx)`] };
}

/**
 * driverCodePresent validator: the Driver's GREEN turn writes PRODUCT code (app/) to make the open
 * RED pass. The deterministic FLOOR is "a non-empty app/ tree exists" – the primary produced-signal
 * the agent writes IN-TURN (mirrors navigatorTestsAuthored's tests/ floor). The real correctness
 * judgment is NOT this check – it is the post-turn @build-cycle honest-GREEN verify (alembic upgrade
 * + the project's test suite against a live branch), which flips codeWritten for the route. This
 * floor just proves the driver produced code so the produced-gate is meaningful (an empty turn is a
 * real defect). producedPath is the app/ dir. Passes iff it holds >=1 source file (.py/.ts/.tsx).
 */
export function driverCodePresent(producedPath: string): OutputValidationResult {
  if (!existsSync(producedPath) || !statSync(producedPath).isDirectory()) {
    return { ok: false, violations: [`driver GREEN wrote no product tree (app/ or src/) at ${producedPath}`] };
  }
  const isSource = (n: string): boolean => /\.(py|ts|tsx|js|jsx)$/.test(n);
  const walk = (dir: string): boolean => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (walk(abs)) return true;
      } else if (isSource(e.name)) {
        return true;
      }
    }
    return false;
  };
  return walk(producedPath)
    ? { ok: true, violations: [] }
    : { ok: false, violations: [`driver GREEN product tree at ${producedPath} has no source file (.py/.ts/.tsx/.js/.jsx)`] };
}

/**
 * assessMarkerWritten validator: the Navigator's ASSESS turn discriminates the driver's failed
 * GREEN and writes EXACTLY ONE marker into the AC cycle dir – either superseded-tests.json
 * {tests,reason} (the AC supersedes prior tests) OR regression-assessment.json {diagnosis,
 * fixDirective?} (a genuine regression). producedPath is the AC cycle dir. Passes iff one is
 * present + well-formed (the ALIGNMENT-vs-oracle judgment is the live test's job, not this floor).
 */
export function assessMarkerWritten(producedPath: string): OutputValidationResult {
  const sup = join(producedPath, "superseded-tests.json");
  const reg = join(producedPath, "regression-assessment.json");
  const hasSup = existsSync(sup);
  const hasReg = existsSync(reg);
  if (!hasSup && !hasReg) {
    return { ok: false, violations: [`assess wrote no marker (expected superseded-tests.json OR regression-assessment.json) in ${producedPath}`] };
  }
  if (hasSup) {
    try {
      const j = JSON.parse(readFileSync(sup, "utf8")) as { tests?: unknown; reason?: unknown };
      if (!Array.isArray(j.tests) || j.tests.length === 0 || typeof j.reason !== "string" || !j.reason.trim()) {
        return { ok: false, violations: [`superseded-tests.json malformed (need non-empty tests[] + a reason) in ${producedPath}`] };
      }
    } catch (e) {
      return { ok: false, violations: [`superseded-tests.json invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
    }
  }
  if (hasReg) {
    try {
      const j = JSON.parse(readFileSync(reg, "utf8")) as { diagnosis?: unknown };
      if (typeof j.diagnosis !== "string" || !j.diagnosis.trim()) {
        return { ok: false, violations: [`regression-assessment.json malformed (need a non-empty diagnosis) in ${producedPath}`] };
      }
    } catch (e) {
      return { ok: false, violations: [`regression-assessment.json invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
    }
  }
  return { ok: true, violations: [] };
}

/**
 * acsDirConformant validator: the spec-author's per-story output is the `acs/` DIRECTORY (one
 * acs/<AC>.json per acceptance criterion), NOT a fixed filename – the agent names each file after
 * the AC it authors (AC1-file-stock-record.json, ...). producedPath is the acs/ dir (existsSync
 * passes for a dir). The deterministic floor mirrors the legacy verify-artifact (the acs/ dir is
 * non-empty) PLUS the design gate's per-file check: every acs/*.json must conform to ac.json. Used
 * for the executor-dispatched spec-author per-story turn, whose declared output resolves to the dir
 * (a single-file validator like nonEmptyFile cannot read a directory).
 */
export function acsDirConformant(producedPath: string): OutputValidationResult {
  if (!existsSync(producedPath) || !statSync(producedPath).isDirectory()) {
    return { ok: false, violations: [`spec-author wrote no acs/ dir at ${producedPath} (expected >=1 acs/<AC>.json)`] };
  }
  const acFiles = readdirSync(producedPath).filter((n) => n.endsWith(".json"));
  if (acFiles.length === 0) {
    return { ok: false, violations: [`acs/ dir at ${producedPath} holds no AC file (expected >=1 acs/<AC>.json)`] };
  }
  const violations: string[] = [];
  for (const name of acFiles) {
    let content: string;
    try {
      content = readFileSync(join(producedPath, name), "utf8");
    } catch {
      violations.push(`acs/${name} not readable`);
      continue;
    }
    const conf = checkArtifactConformance("ac.json", content);
    if (!conf.ok) violations.push(...conf.violations.map((v) => `acs/${name}: ${v}`));
  }
  return violations.length === 0 ? { ok: true, violations: [] } : { ok: false, violations };
}

/**
 * deployVerifyScopeConformant validator: the navigator ASSESS-DEPLOY turn's OPTIONAL output ,
 * deploy-verify-scope.json, the scope directives the Driver's refactor-deploy turn reads. This is
 * the first shipped consumer of the optional-output contract (Stage F): the turn writes the file
 * ONLY when it confirms contamination-fragile tests; when it judges the classifier wrong it writes
 * NOTHING (its veto -> the orchestration escalates to a human). So ABSENT is a clean pass (the
 * executor's phase 5 owns that); this validator only runs when the file is PRESENT – and then it
 * must be a well-formed scope marker: version 1 + a directives[] array of {node_id, directive}.
 * A present-but-malformed marker is a hard reject (a garbled scope would misdirect the Driver).
 */
export function deployVerifyScopeConformant(producedPath: string): OutputValidationResult {
  let content: string;
  try {
    content = readFileSync(producedPath, "utf8");
  } catch {
    return { ok: false, violations: [`deploy-verify-scope.json not readable at ${producedPath}`] };
  }
  let scope: { version?: unknown; directives?: unknown };
  try {
    scope = JSON.parse(content) as { version?: unknown; directives?: unknown };
  } catch (e) {
    return { ok: false, violations: [`deploy-verify-scope.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const violations: string[] = [];
  if (scope.version !== 1) violations.push(`deploy-verify-scope.json version must be 1 (got ${JSON.stringify(scope.version)})`);
  if (!Array.isArray(scope.directives)) {
    violations.push("deploy-verify-scope.json must carry a directives[] array");
  } else {
    scope.directives.forEach((d, i) => {
      const dir = d as { node_id?: unknown; directive?: unknown };
      if (typeof dir?.node_id !== "string" || !dir.node_id) violations.push(`directives[${i}].node_id must be a non-empty string`);
      if (typeof dir?.directive !== "string" || !dir.directive) violations.push(`directives[${i}].directive must be a non-empty string`);
    });
  }
  return violations.length === 0 ? { ok: true, violations: [] } : { ok: false, violations };
}

/** Per-artifact schema-conformance validators (the design roles' primary outputs), each
 *  gated to its canonical schema via checkArtifactConformance. */
export const acConformant = conformsTo("ac.json");
export const architectureConformant = conformsTo("architecture.json");
export const dbDesignConformant = conformsTo("db-design.json");
export const testListConformant = conformsTo("test-list.json");
// The Product Owner's intake deliverables (the metered `intake` turn's outputs), each gated to its
// artifact-conformance kind: product-overview.md / nfrs.md (md-narrative + required sections).
// design-brief.md is UI-only, so it is declared OPTIONAL on the manifest.
export const productOverviewConformant = conformsTo("product-overview.md");
export const nfrsConformant = conformsTo("nfrs.md");
export const designBriefConformant = conformsTo("design-brief.md");

/**
 * The named-validator registry a manifest resolves against. Add an entry here (code) and
 * reference it by name in a manifest (data). Every OutputValidator is (path) => result – the
 * role-parameterized agent-log validator binds its default role so it matches the signature.
 */
export const VALIDATOR_REGISTRY: Record<string, OutputValidator> = {
  featureSpecNonEmptyStories,
  agentLogHasRoleEvent: (p: string) => agentLogHasRoleEvent(p),
  // The PO's structured log event is authored as product-owner; bind that role.
  productOwnerLoggedAuthoring: (p: string) => agentLogHasRoleEvent(p, "product-owner"),
  // The UX Designer's structured log event is authored as ux-designer; bind that role.
  uxDesignerLoggedAuthoring: (p: string) => agentLogHasRoleEvent(p, "ux-designer"),
  // The Test Strategist's + Architect Reviewer's + DBA's log events, role-bound (used by the
  // route-scenario manifests that exercise those roles' escalation/produced routes, and by the
  // shipped design-role manifests whose logged-authoring output is the role's agent-log line).
  testStrategistLoggedAuthoring: (p: string) => agentLogHasRoleEvent(p, "test-strategist"),
  // The test-strategist's agent-log must prove it FANNED OUT to each enabled analyst (not authored solo).
  testStrategistDispatchedAnalysts,
  architectReviewerLoggedAuthoring: (p: string) => agentLogHasRoleEvent(p, "architect-reviewer"),
  dbaLoggedAuthoring: (p: string) => agentLogHasRoleEvent(p, "dba"),
  // The Navigator's log event (build turns: RED / assess / review), role-bound.
  navigatorLoggedAuthoring: (p: string) => agentLogHasRoleEvent(p, "navigator"),
  // The Driver's log event (build turns: GREEN / refactor / repair), role-bound.
  driverLoggedAuthoring: (p: string) => agentLogHasRoleEvent(p, "driver"),
  nonEmptyFile,
  designGuideConformant,
  // BUILD-turn navigator output validators (the lean per-role build chains).
  navigatorTestsAuthored,
  assessMarkerWritten,
  // The navigator assess-deploy turn's OPTIONAL scope marker (Stage F optional-output contract's
  // first shipped consumer): absent = the veto/escalate route (a clean pass), present = validated.
  deployVerifyScopeConformant,
  // BUILD-turn driver output validator (the product-code floor; honest-GREEN is the real gate).
  driverCodePresent,
  // Schema-conformance validators for the design roles' primary artifacts (the integration
  // live chains gate the real agent's output to its canonical schema, not just non-emptiness).
  acConformant,
  // The spec-author per-story primary is the acs/ DIRECTORY (dynamically-named AC files); the
  // executor-dispatched turn resolves its output to that dir, so it needs a dir-aware validator.
  acsDirConformant,
  architectureConformant,
  dbDesignConformant,
  testListConformant,
  // The PO intake turn's deliverables (product-overview.md / nfrs.md required; design-brief.md
  // optional, UI-only).
  productOverviewConformant,
  nfrsConformant,
  designBriefConformant,
};

/**
 * Resolve a validator name to its fn. THROWS loud on an unknown name – a manifest typo is a
 * hard failure surfaced at load/validate time, not a silently-skipped output check.
 */
export function resolveValidator(name: string): OutputValidator {
  const fn = VALIDATOR_REGISTRY[name];
  if (!fn) {
    const known = Object.keys(VALIDATOR_REGISTRY).sort().join(", ");
    throw new Error(`validator-registry: unknown validator "${name}" (a manifest referenced a validator not in the registry). Known: ${known}.`);
  }
  return fn;
}
