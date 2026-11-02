// The DETERMINISTIC artifact side of a surgical story `repair` (the pipeline-state side
// — repairStory / completeRepair — lives in story-pipeline.ts). A repair closes a gap in
// an ALREADY-ACCEPTED story additively, with the same build roles, without the teardown a
// `revise` costs. The first gap class is an UNCOVERED PERSISTENCE INVARIANT (the
// PI8-stock-records-survive-migration case): a `migration_reversible` invariant the DBA
// realized but no test-list item carries its invariant_id, which the hardened deploy gate
// now catches before accept.
//
// `coverInvariant` closes it with a RETAG-FIRST strategy, learned from the live-proof: a
// migration_reversible invariant is almost always ALREADY exercised by an existing round-trip
// test (F3's T28, "stock_records rows survive the migration upgrade and downgrade") that the
// design simply never TAGGED with the invariant_id. The gap is a missing tag, not a missing
// test. So:
//   1. If a test already carries the invariant_id -> done (idempotent).
//   2. migration_reversible: look for an UNTAGGED existing round-trip test for the invariant's
//      table and RETAG it (set invariant_id). This is the common, correct close — no new test,
//      no build. Authoring a NEW test instead duplicates the round-trip and trips the kit's
//      own issue-#199 "reversible-invariant-round-trip" smell (a forward-only/born-green test
//      on an already-migrated shared branch). Ambiguous (multiple candidates) -> raise to the
//      human (AmbiguousCoverageError) to name the one, via `--retag <testId>`.
//   3. Only when NO existing round-trip test is found: AUTHOR a new covering test item (the
//      Navigator then writes its RED, the Driver greens it) — the fallback for a genuinely
//      untested invariant.
//
// Either mutation then RE-FREEZES the already-approved test_list gate in place: re-capture its
// artifact hash from the now-changed list + append an audit history entry. Without this the
// RED-start drift backstop (flagTestListGateDriftIfAny) would read the change as an unapproved
// in-build mutation and raise the TERMINAL `test-list-drift` smell. The repair IS the
// sanctioned re-approval of the one artifact it mutated, so the gate stays approved (no
// withdraw cascade) and its frozen hash legitimately reflects the repair-authorized change.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { architectureJson, featureResolved, featureTestListMd, findStoryDir } from "../config/consort-paths.js";
import { readMasterTestList, writeMasterTestList, renderTestListMarkdown, writeStoryTestList, type TestList, type TestListItem } from "../test-list/test-list.js";
import { resolveArtifactInputs } from "../gates/gate-conformance-guard.js";
import { hashArtifact } from "../gates/gate-hash.js";
import { readGates, writeGates } from "../gates/gates.js";

interface PersistenceInvariant {
  id: string;
  type?: string;
  table?: string;
  brief?: string;
}

/** Read a feature's declared persistence invariants (architecture.json). Empty when absent. */
function readPersistenceInvariants(consortDir: string, featureId: string): PersistenceInvariant[] {
  const file = architectureJson(consortDir, featureId);
  if (!existsSync(file)) return [];
  try {
    const arch = JSON.parse(readFileSync(file, "utf8")) as { persistence_invariants?: PersistenceInvariant[] };
    return Array.isArray(arch.persistence_invariants) ? arch.persistence_invariants : [];
  } catch {
    return [];
  }
}

/** The first AC id declared for a story (its acs/<AC>.json), or undefined when the story has none. */
function firstAcIdForStory(consortDir: string, featureId: string, storyId: string): string | undefined {
  const sdir = findStoryDir(consortDir, featureId, storyId);
  if (!sdir) return undefined;
  const acsDir = join(sdir, "acs");
  if (!existsSync(acsDir)) return undefined;
  const files = readdirSync(acsDir).filter((f) => f.endsWith(".json")).sort();
  for (const f of files) {
    try {
      const ac = JSON.parse(readFileSync(join(acsDir, f), "utf8")) as { id?: string };
      if (ac.id) return ac.id;
    } catch {
      /* skip a malformed AC file */
    }
  }
  return undefined;
}

/** The next free `T<n>` id for the master test-list (max existing numeric suffix + 1). */
function nextTestId(items: TestListItem[]): string {
  let max = 0;
  for (const it of items) {
    const m = /^T(\d+)$/.exec(it.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `T${max + 1}`;
}

/** Raised when more than one untagged round-trip test could cover a migration_reversible
 *  invariant: the repair must not guess — the human names the one via `repair --retag <id>`. */
export class AmbiguousCoverageError extends Error {
  constructor(public readonly invariantId: string, public readonly candidateIds: string[]) {
    super(
      `multiple untagged round-trip tests could cover ${invariantId} (${candidateIds.join(", ")}); ` +
        `name the one to retag with 'repair --retag <testId>', or none to author a new test`,
    );
    this.name = "AmbiguousCoverageError";
  }
}

/** Does this UNTAGGED item already exercise a down->up round-trip for the invariant's table?
 *  (The migration_reversible coverage shape: mentions the table AND both a downgrade and an
 *  upgrade / survival assertion.) Case-insensitive substring match on the description. */
function isRoundTripCoverageFor(item: TestListItem, table: string): boolean {
  if (item.invariant_id) return false;
  const d = item.description.toLowerCase();
  return d.includes(table.toLowerCase()) && /downgrad/.test(d) && /(upgrad|surviv)/.test(d);
}

function persistToStory(consortDir: string, featureId: string, storyId: string, list: TestList): void {
  writeMasterTestList(consortDir, list);
  // Keep the human-readable list in lockstep (the md conformance contract).
  writeFileSync(featureTestListMd(consortDir, featureId), renderTestListMarkdown(list));
  // Re-scope the per-story list so the build lane's RED/GREEN flow actually SEES the change: the
  // build lane reads storyTestListJson, NOT the master. Skipping this made the first live repair
  // HOLLOW (coverage satisfied on the master while the Navigator/Driver never built it).
  writeStoryTestList(consortDir, featureId, storyId);
}

/**
 * Close an uncovered persistence invariant for a story, RETAG-FIRST (see the module header).
 * Returns the covering item id + the mode taken:
 *   - "present": a test already carried the invariant_id (idempotent).
 *   - "retag":   an existing untagged round-trip test was tagged with the invariant_id (the
 *                common migration_reversible close — no new test, the coverage already passes).
 *   - "author":  no existing round-trip test; a new covering fitness item was appended (its RED
 *                is written by the Navigator, greened by the Driver).
 * Throws AmbiguousCoverageError when >1 untagged round-trip test could cover a migration_reversible
 * invariant and no explicit `retagTestId` was given. Throws when authoring but the story has no AC.
 */
export function coverInvariant(
  consortDir: string,
  featureId: string,
  storyId: string,
  invariantId: string,
  opts: { retagTestId?: string } = {},
): { itemId: string; mode: "present" | "retag" | "author" } {
  const list = readMasterTestList(consortDir, featureId);

  const tagged = list.items.find((it) => it.invariant_id === invariantId);
  if (tagged) {
    persistToStory(consortDir, featureId, storyId, list);
    return { itemId: tagged.id, mode: "present" };
  }

  // Explicit operator override: retag exactly the named test (the ambiguity resolution path).
  if (opts.retagTestId) {
    const t = list.items.find((it) => it.id === opts.retagTestId);
    if (!t) throw new Error(`coverInvariant: --retag ${opts.retagTestId} names no test in the master list for ${featureId}`);
    t.invariant_id = invariantId;
    persistToStory(consortDir, featureId, storyId, list);
    return { itemId: t.id, mode: "retag" };
  }

  const inv = readPersistenceInvariants(consortDir, featureId).find((i) => i.id === invariantId);

  // RETAG-FIRST for migration_reversible: an existing untagged round-trip test for the table is
  // the real coverage; the gap was a missing tag, not a missing test.
  if (inv?.type === "migration_reversible" && inv.table) {
    const candidates = list.items.filter((it) => isRoundTripCoverageFor(it, inv.table!));
    if (candidates.length === 1) {
      candidates[0].invariant_id = invariantId;
      persistToStory(consortDir, featureId, storyId, list);
      return { itemId: candidates[0].id, mode: "retag" };
    }
    if (candidates.length > 1) throw new AmbiguousCoverageError(invariantId, candidates.map((c) => c.id));
    // none -> fall through to author a genuinely missing round-trip test.
  }

  // AUTHOR a new covering test (the fallback: no existing round-trip test to retag).
  const acId = firstAcIdForStory(consortDir, featureId, storyId);
  if (!acId) {
    throw new Error(
      `coverInvariant: story ${storyId} has no acceptance criterion to attribute a new covering test to; cannot repair ${invariantId}`,
    );
  }
  const table = inv?.table ?? "the table";
  const item: TestListItem = {
    id: nextTestId(list.items),
    description: `additive migration down->up preserves existing ${table} rows (${invariantId} migration-survival round-trip)`,
    ac_id: acId,
    status: "pending",
    kind: "fitness",
    invariant_id: invariantId,
  };
  list.items.push(item);
  persistToStory(consortDir, featureId, storyId, list);
  return { itemId: item.id, mode: "author" };
}

/**
 * RE-FREEZE the approved test_list gate in place after a repair appended a covering item:
 * re-capture the gate's artifact hash from the current (appended) list and append an audit
 * history entry explaining why. The gate STAYS approved (no withdraw / no downstream
 * cascade) — the repair is the sanctioned re-approval of the one artifact it mutated, so the
 * RED-start drift backstop sees the appended item as approved, not as in-build drift. No-op
 * when the test_list gate is not currently approved (nothing frozen to re-freeze).
 */
export function refreezeTestListGate(
  consortDir: string,
  featureId: string,
  opts: { approver: string; at: string; reason: string },
): boolean {
  const gates = readGates(featureId, { consortDir });
  const rec = gates.gates.test_list;
  if (!rec || rec.status !== "approved") return false;
  const resolved = resolveArtifactInputs("test_list", featureResolved(consortDir, featureId), undefined, consortDir, featureId);
  if (!("inputs" in resolved)) {
    // The appended list is non-conformant — surface it rather than freezing a bad hash.
    throw new Error(`refreezeTestListGate: test_list artifacts are non-conformant after the repair append: ${resolved.reason}`);
  }
  const hashes: Record<string, string> = {};
  for (const [name, content] of Object.entries(resolved.inputs)) hashes[name] = hashArtifact(content);
  rec.artifact_hashes = hashes;
  rec.approved_at = opts.at;
  rec.history.push({ action: "approved", at: opts.at, approver: opts.approver, artifact_hashes: hashes, reason: opts.reason });
  writeGates(gates, { consortDir });
  return true;
}
