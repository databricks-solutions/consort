// Escalations: the single "raise to the HIL" channel (follow-up).
//
// WHY: a live smoke shipped a false-GREEN on a self-contradictory test, the
// orchestration stamped green without a real run, ignored the Navigator's
// contradiction smell, and then STALLED at await-acceptance. The fix is a
// uniform rule: after ANY role/step surfaces a blocking problem (a failed honest
// GREEN run, a blocking bad-smell, a deploy verify-fail), it writes an
// escalation here, and the deterministic driver routes to a single `raise-to-hil`
// halt while an unresolved escalation exists, it never advances past it and
// never silently spins. Headless mode surfaces + halts (a human resumes); it
// does not auto-decide.

import * as fs from "node:fs";
import { escalationsDir, escalationFile } from "../../consort/config/consort-paths.js";
import { readSmellsLog, writeSmellsLog, hasOpenSmell, resolveOpenSmells, type SmellName } from "../smells/smells.js";
import { pendingItemKind } from "../pipeline/cycle-record.js";
import { clearGreenFailure, clearStoryGreenFailures } from "../smells/supersession.js";
import { clearRefactorVerifyAssessMarker } from "../smells/refactor-verify-assess.js";
import { clearDeployVerifyAssessMarker } from "../smells/deploy-verify-assess.js";
import { clearReauthorMarker } from "../smells/reauthor-resilience.js";

/** A blocking problem raised to the HIL. Identity is `id` (derived from source +
 *  scope) so the same condition re-detected across driver iterations is the same
 *  escalation, not a new one (keeps the stall-detector + the log quiet). */
export interface Escalation {
  id: string;
  /** Who/what raised it: "driver-green" | "deploy-verify" | "smell:<name>" | a role name. */
  source: string;
  /** Human-readable reason (shown in the halt message + the log). */
  reason: string;
  feature_id?: string;
  story_id?: string;
  ac_id?: string;
  raised_at: string;
  /** Set when the HIL resolves it (a human edits this in, or a resolve verb does). */
  resolved_at?: string;
  /** Optional human note on WHY it was resolved (what the root-cause fix was),
   *  stamped by `consort-resolve-escalation`. Kept for the audit trail. */
  resolution?: string;
  /** Self-documenting resolution path, stamped into the record at write time. A session that opens
   *  this file directly (rather than `consort-next` / `consort-watch`) still learns the correct clear
   *  path – the resolve verb – instead of improvising a hand-edit / rm of this file or smells.json. */
  how_to_resolve?: string;
  /** The failing command's captured stdout+stderr tail, for a CLI-effect escalation (deploy-verify,
   *  wait-ci, merge, experiment cut, ...). Without this a human had to manually re-run the underlying
   *  command to see WHY it failed; here the error travels with the escalation record. */
  captured_output?: string;
}

/** Bad smells that BLOCK the build (vs. advisory ones). A flagged blocking smell
 *  halts to the HIL rather than being recorded for reporting only. */
export const BLOCKING_SMELLS: ReadonlySet<SmellName> = new Set<SmellName>([
  "test-list-drift",
  "cycle-stall",
  "boundary-violation",
  "test-deletion-attempt",
  // A missing kit-owned scaffold piece (e.g. the E2E conftest/live_server) must
  // halt to the HIL, not let the build fabricate it. The driver-wrote-its-own-
  // conftest defect (2026-06-11 smoke) traced to this not being blocking.
  "scaffold-defect",
  // Non-independent ACs (one AC's `then` implied by another) make a faithful RED
  // impossible. Flagged by the test-strategist at the design gate so it halts
  // BEFORE a build cycle, not mid-build as a cycle-stall (the 2026-06-11 AC2/AC3
  // overlap that stalled S1).
  "ac-overlap",
  // Pre-build reflection gate: the Navigator (reflect mode) found a spec or
  // test-list defect BEFORE the build lane. Blocking + spec-level, so it routes
  // to the owning author (bounded one revise) then HITL, via the revise-route
  // machinery. Halts the build until the design defect is resolved.
  "reflect-spec-defect",
  "reflect-testlist-defect",
  // The reflect critic found a persistence invariant contradicting the requirement
  // (e.g. a not_null column the brief renders when absent). Spec-level + architect-owned:
  // routes to the Architect (re-run the architecture gate) via revise-route, bounded one
  // revise then HITL. Prevents the avoidable later-story supersession + build refactor.
  "reflect-architecture-defect",
  // The reflect critic found a user-facing AC (E2E / client) whose screen/form the IA
  // (ia.md) does not name. Spec-level + ux-designer-owned: routes to the UX Designer (re-run
  // the ia refinement) via revise-route, bounded one revise then HITL. The design-lane
  // backstop to the per-story ia refinement — closes the "AC asserts a form not in the IA" gap.
  "reflect-ia-defect",
  // The boundary/routes layer touching persistence directly (a fat controller),
  // instead of delegating to a service + repository. A build-level structural
  // defect; the Navigator flags it in REVIEW and the layering fitness test
  // defends it. Build-level (not spec-level), so it hard-halts to the HIL rather
  // than routing to a design author.
  "layering-violation",
  // The rendered UI does not USE the design tokens at the element level (hardcoded
  // hex/px, a missing ia.md data-testid seam, or an action with no feedback), even
  // though the :root tokens exist. The UX Designer flags it in REVIEW and the
  // element-level design-adherence checks defend it. Build-level (a UI-quality
  // defect to refactor), so it hard-halts to the HIL rather than routing to an author.
  "ux-adherence",
  // The architect-notes projection found a story the canon does not cover
  // (FEIP-7902). Blocking + spec-level + architect-owned: it routes to the
  // Architect (re-annotate + amend the canon) via revise-routing, bounded one
  // revise then HITL. Halts the design lane until the gap is resolved.
  "architect-canon-gap",
]);

/** A stable, filesystem-safe escalation id from its source + scope, so the same
 *  condition does not pile up duplicate files across iterations. */
export function escalationId(parts: { source: string; feature_id?: string; story_id?: string; ac_id?: string }): string {
  return [parts.source, parts.feature_id, parts.story_id, parts.ac_id]
    .filter(Boolean)
    .join("__")
    .replace(/[^A-Za-z0-9_.-]/g, "-");
}

/** Record a blocking escalation (idempotent by id: a still-unresolved one is left
 *  as-is so its original raised_at + reason stand). Returns the escalation. */
export function writeEscalation(
  consortDir: string,
  esc: Omit<Escalation, "id" | "raised_at"> & { id?: string; raised_at?: string },
): Escalation {
  const id = esc.id ?? escalationId(esc);
  const file = escalationFile(consortDir, id);
  const existing = readEscalationFile(file);
  if (existing && !existing.resolved_at) return existing;
  const full: Escalation = {
    id,
    source: esc.source,
    reason: esc.reason,
    ...(esc.feature_id ? { feature_id: esc.feature_id } : {}),
    ...(esc.story_id ? { story_id: esc.story_id } : {}),
    ...(esc.ac_id ? { ac_id: esc.ac_id } : {}),
    // Carry the failing command's captured output (deploy-verify et al.) through to the record so a
    // terminal escalation — the case that needs a HUMAN — names WHICH test failed, not just "verify
    // failed". The field was declared on the interface but never written here, so the hardest case
    // carried the least forensics (the lost-failing-client-test defect).
    ...(esc.captured_output ? { captured_output: esc.captured_output } : {}),
    raised_at: esc.raised_at ?? new Date().toISOString(),
    // A caller MAY supply a source-specific resolution (e.g. feature-conformance names the exact
    // `consort-pipeline repair` command); otherwise the generic clear-with-resolve-escalation default.
    how_to_resolve:
      esc.how_to_resolve ??
      `After fixing the ROOT CAUSE, clear this with: consort-resolve-escalation --id ${id} --resolution "<what you fixed>". ` +
        `That clears this escalation (and any blocking smell) and KEEPS the audit trail. Do NOT hand-edit or delete this ` +
        `file, and do NOT edit smells.json, to move the run forward – that desyncs on-disk state from the drive.`,
  };
  fs.mkdirSync(escalationsDir(consortDir), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(full, null, 2) + "\n", "utf8");
  return full;
}

function readEscalationFile(file: string): Escalation | undefined {
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Escalation;
  } catch {
    return undefined;
  }
}

/** Every explicitly-recorded escalation on disk (resolved + unresolved). */
export function readEscalations(consortDir: string): Escalation[] {
  const dir = escalationsDir(consortDir);
  if (!fs.existsSync(dir)) return [];
  const out: Escalation[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const e = readEscalationFile(`${dir}/${f}`);
    if (e) out.push(e);
  }
  return out;
}

/** Resolve (stamp `resolved_at` on) every unresolved explicit FILE escalation
 *  for a story – the deploy-verify / driver-green halts that pin a story to the
 *  HIL. This is the escalation-file half of a clean rebuild (Finding 27): a
 *  status/cycle reset alone leaves the halting escalation on disk, so the drive
 *  still pre-empts to raise-to-hil. The SMELL-derived half (blocking smells in
 *  smells.json) is cleared separately by the smell resolvers – the dual-source
 *  rule. Returns the ids it resolved (empty when none matched). A story-scoped
 *  match: an escalation with no story_id is feature-wide and left untouched. */
export function resolveEscalationsForStory(
  consortDir: string,
  featureId: string,
  story: string,
  at: string = new Date().toISOString(),
): string[] {
  const dir = escalationsDir(consortDir);
  const resolved: string[] = [];
  for (const e of readEscalations(consortDir)) {
    if (e.resolved_at) continue;
    if (e.story_id !== story) continue;
    if (e.feature_id !== undefined && e.feature_id !== featureId) continue;
    fs.writeFileSync(escalationFile(consortDir, e.id), JSON.stringify({ ...e, resolved_at: at }, null, 2) + "\n", "utf8");
    resolved.push(e.id);
  }
  return resolved;
}

/** Resolve (stamp `resolved_at` + optional `resolution` note on) UNRESOLVED explicit
 *  FILE escalations, the supported way to clear a HIL halt once the root cause is
 *  fixed – instead of `rm`-ing the record (which destroys the audit trail). The
 *  record is KEPT; `firstPendingEscalation` already ignores anything with a
 *  `resolved_at`, so the drive stops pre-empting and retries the failed action fresh.
 *  Scope with `opts`: a specific `id`; else all pending files matching `featureId`
 *  and/or `story`; else (no scope) ALL pending explicit-file escalations. Returns the
 *  ids it resolved (empty when none matched). Smell-derived escalations are NOT files
 *  – they clear when their smell clears (the dual-source rule), so this never touches
 *  them. */
export function resolveEscalations(
  consortDir: string,
  opts: { id?: string; featureId?: string; story?: string; resolution?: string; at?: string } = {},
): string[] {
  const at = opts.at ?? new Date().toISOString();
  const resolved: string[] = [];
  for (const e of readEscalations(consortDir)) {
    if (e.resolved_at) continue;
    if (opts.id && e.id !== opts.id) continue;
    if (opts.featureId && e.feature_id !== undefined && e.feature_id !== opts.featureId) continue;
    if (opts.story && e.story_id !== opts.story) continue;
    fs.writeFileSync(
      escalationFile(consortDir, e.id),
      JSON.stringify({ ...e, resolved_at: at, ...(opts.resolution ? { resolution: opts.resolution } : {}) }, null, 2) + "\n",
      "utf8",
    );
    resolved.push(e.id);
  }
  return resolved;
}

/** Escalations derived from unresolved BLOCKING bad-smells in `.tdd/smells.json`.
 *  The Navigator flags a smell (e.g. test-list-drift on a contradictory test);
 *  if it is in BLOCKING_SMELLS and unresolved, it becomes an HIL escalation
 *  rather than a reporting-only line. */
export function escalationsFromSmells(consortDir: string, featureId?: string): Escalation[] {
  const log = readSmellsLog(consortDir);
  return log.detected
    .filter((d) => !d.resolution && BLOCKING_SMELLS.has(d.smell))
    // Born-green fitness guard: a `cycle-stall` flagged while the story's next
    // pending item is a `kind:"fitness"` test is NOT a stuck build – a fitness
    // test that "can't go RED" is born-green (a regression guard that already
    // holds). The GREEN run is the real arbiter (it greens a passing test;
    // a genuinely failing behavior test still stalls). Drop such a cycle-stall
    // so the loop proceeds to the GREEN turn instead of hard-halting to the HIL.
    .filter((d) => {
      if (d.smell !== "cycle-stall" || !featureId || !d.story_id) { return true; }
      return pendingItemKind(consortDir, featureId, d.story_id) !== "fitness";
    })
    .map((d) => ({
      id: escalationId({ source: `smell:${d.smell}`, feature_id: featureId, story_id: d.story_id }),
      source: `smell:${d.smell}`,
      reason: `blocking smell "${d.smell}": ${d.detail}`,
      ...(featureId ? { feature_id: featureId } : {}),
      ...(d.story_id ? { story_id: d.story_id } : {}),
      ...(d.ac_id ? { ac_id: d.ac_id } : {}),
      raised_at: d.detected_at,
    }));
}

/** All currently-pending blockers for this project, from BOTH sources of the dual-source rule:
 *  unresolved escalation FILES and BLOCKING SMELLS derived from smells.json. */
export function pendingBlockers(consortDir: string, feature?: string): Escalation[] {
  return [
    ...readEscalations(consortDir).filter((e) => !e.resolved_at),
    ...escalationsFromSmells(consortDir, feature),
  ];
}

/** Match an escalation against a resolve scope (id wins; else feature/story narrow). */
function escalationInScope(e: Escalation, scope: { id?: string; feature?: string; story?: string }): boolean {
  if (scope.id) return e.id === scope.id;
  if (scope.feature && e.feature_id !== undefined && e.feature_id !== scope.feature) return false;
  if (scope.story && e.story_id !== scope.story) return false;
  return true;
}

/** Resolve the in-scope blockers; return the ids cleared. Stamps resolved_at on matching escalation
 *  FILES, and clears each in-scope SMELL-sourced blocker in smells.json (the store the drive
 *  re-reads via escalationsFromSmells) by that record's OWN `source` + `story_id`. Driving the
 *  smell-clear off the matched RECORDS — not a feature-scoped regeneration — is what lets a resolve
 *  by `id` alone clear the backing smell WITHOUT a feature: the id is built WITH a feature, so a
 *  feature-less regeneration yields a NON-matching id, leaves the smell unresolved, and the drive
 *  re-raises it next tick (the thrash). smells.json stays the single owner of "resolved"; the
 *  re-raise path consults no second source. */
export function resolveBlockers(
  consortDir: string,
  scope: { id?: string; feature?: string; story?: string; resolution?: string; all?: boolean },
): string[] {
  const pending = pendingBlockers(consortDir, scope.feature);
  const resolved: string[] = [];
  // (1) File escalations – stamp resolved_at (keeps the record).
  resolved.push(
    ...resolveEscalations(consortDir, {
      ...(scope.id ? { id: scope.id } : {}),
      ...(scope.feature ? { featureId: scope.feature } : {}),
      ...(scope.story ? { story: scope.story } : {}),
      ...(scope.resolution ? { resolution: scope.resolution } : {}),
    }),
  );
  // (2) Blocking smells – mark "cleared" in smells.json (does NOT count toward the revise budget).
  for (const e of pending.filter((x) => scope.all || escalationInScope(x, scope))) {
    if (!e.source.startsWith("smell:")) continue;
    const n = resolveOpenSmells(consortDir, e.source.slice("smell:".length), {
      ...(e.story_id ? { story_id: e.story_id } : {}),
      kind: "cleared",
      ...(scope.resolution ? { note: scope.resolution } : {}),
    });
    if (n > 0 && !resolved.includes(e.id)) resolved.push(e.id);
  }
  // (3) Latched VERIFY-FAILURE markers – the escalation-file half of the dual-source rule is not enough
  // for a VERIFY escalation (driver-green / driver-refactor / deploy-verify). Those are not routed from the
  // escalation FILE: the drive's state-derivation routes to raise-to-hil from the LATCHED failure marker
  // (green-failure.json / refactor-verify-assess.json / deploy-verify-assess.json — assessed + fix-rounds
  // exhausted), then re-WRITES a fresh escalation. So stamping the file resolved alone leaves the marker,
  // the next run re-derives raise-to-hil WITHOUT re-running the verify, and this verb's own promise
  // ("retry the failed action fresh") is false. Clear the matching marker for each resolved verify
  // escalation so the next run genuinely RE-RUNS the verify — a fresh attempt that can pass after the
  // human's root-cause fix OR self-heal (e.g. the orphan-stamp auto-resync). The honest verify still gates
  // every re-run, so this never green-washes; it only lifts the stale latch the resolve already promised to lift.
  for (const e of pending) {
    if (!resolved.includes(e.id) || !e.feature_id || !e.story_id) continue;
    // driver-green latches an AC-keyed green-failure.json. A per-AC escalation (recordGreenResult) carries
    // ac_id → clear that one; the raise-to-hil shape carries feature + story only → clear ALL the story's
    // AC markers so the latch lifts either way.
    if (e.source === "driver-green") {
      if (e.ac_id) clearGreenFailure(consortDir, e.feature_id, e.story_id, e.ac_id);
      else clearStoryGreenFailures(consortDir, e.feature_id, e.story_id);
    } else if (e.source === "driver-refactor") clearRefactorVerifyAssessMarker(consortDir, e.feature_id, e.story_id);
    else if (e.source === "deploy-verify") clearDeployVerifyAssessMarker(consortDir, e.feature_id, e.story_id);
    // test-authoring-smell latches a one-shot reauthor-resilience marker (attempts); once spent (attempts>=1)
    // a still-flagged smell escalates. Resolving the escalation (the author fixed the test, OR a detector
    // false-positive was fixed in the kit) must clear that marker too, so the next run RE-CHECKS the smell
    // fresh instead of re-escalating from the spent one-shot — same latch class as the verify markers above.
    else if (e.source === "test-authoring-smell" && e.ac_id) clearReauthorMarker(consortDir, e.feature_id, e.story_id, e.ac_id);
  }
  return resolved;
}

/** Mirror a role-flagged BLOCKING smell into `smells.json` so the driver's
 *  `firstPendingEscalation` -> raise-to-hil picks it up and HALTS the loop.
 *  A `smell.flagged` log event is observability only; persisting the blocking
 *  ones here is what makes the navigator's "(blocking)" actually stop the build
 *  (the driver-fabricated-conftest defect traced to this gap). No-op for
 *  advisory/unknown smell names; idempotent (skips a still-unresolved dup of the
 *  same smell). Returns true iff a new entry was written. */
export function recordBlockingSmellFlag(
  consortDir: string,
  smell: string,
  detail?: string,
  scope?: { story_id?: string; ac_id?: string },
): boolean {
  if (!BLOCKING_SMELLS.has(smell as SmellName)) return false;
  // Idempotent per (smell, story): a still-open flag of the same smell on the
  // same story is a dup (the shared hasOpenSmell guard).
  if (hasOpenSmell(consortDir, smell, scope?.story_id)) return false;
  writeSmellsLog(consortDir, [
    {
      smell: smell as SmellName,
      cycle_ids: [],
      detail: detail || `flagged blocking smell: ${smell}`,
      ...(scope?.story_id ? { story_id: scope.story_id } : {}),
      ...(scope?.ac_id ? { ac_id: scope.ac_id } : {}),
    },
  ]);
  return true;
}

/** The first UNRESOLVED escalation for a feature (explicit files + blocking
 *  smells), or null. This is what the driver consults to decide whether to
 *  pre-empt every other transition with a raise-to-hil halt. Explicit files win
 *  over smell-derived (they carry the richer reason). */
export function firstPendingEscalation(consortDir: string, featureId?: string): Escalation | null {
  const explicit = readEscalations(consortDir).filter((e) => !e.resolved_at);
  const scoped = featureId ? explicit.filter((e) => !e.feature_id || e.feature_id === featureId) : explicit;
  if (scoped.length > 0) {
    return [...scoped].sort((a, b) => (a.raised_at < b.raised_at ? -1 : 1))[0];
  }
  const fromSmells = escalationsFromSmells(consortDir, featureId);
  return fromSmells.length > 0 ? fromSmells.sort((a, b) => (a.raised_at < b.raised_at ? -1 : 1))[0] : null;
}
