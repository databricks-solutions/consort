import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import {
  requireFeatureDir as findFeatureDir,
  findStoryDir as findStoryDirOf,
  featureTestListJson,
  featureTestListMd,
  storyTestListJson,
  acJson,
} from "../../consort/config/consort-paths.js";

export interface TestListItem {
  id: string;
  description: string;
  ac_id: string;
  status: "pending" | "red" | "green" | "refactored" | "skipped";
  scenario_file?: string;
  /** behavior = an AC scenario (pytest-bdd for Python); fitness = an
   *  architectural fitness test (layering, ORM-only, config-in-env, NFR budget);
   *  client = a UI-presentation AC the architecture assigns to the SPA's client
   *  harness (Vitest/RTL component or Playwright e2e under client/tests/), not the
   *  backend pytest-bdd suite. Default behavior. A service-backed feature needs
   *  >=1 fitness item. */
  kind?: "behavior" | "fitness" | "client";
  /** The architecture.json persistence_invariant a data/persistence fitness item
   *  covers. Set only on fitness items that verify a declared DB invariant against
   *  the real branch. checkPersistenceCoverage ties coverage to it, and
   *  checkInvariantCoverageDistinct enforces that exactly one story carries it. */
  invariant_id?: string;
  notes?: string;
}

export interface TestList {
  feature_id: string;
  ordered_for?: "design-momentum" | "risk-first" | "happy-path-first";
  items: TestListItem[];
}

export function readMasterTestList(tddDir: string, featureId: string): TestList {
  findFeatureDir(tddDir, featureId); // assert the feature exists (throws if not)
  const file = featureTestListJson(tddDir, featureId);
  if (!existsSync(file)) {
    throw new Error(`master test-list.json not found for ${featureId} at ${file}`);
  }
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<TestList>;
  // Normalize `items` to an array at the single read point so every consumer
  // (scopeToStory / viewByAc / renderTestListMarkdown) is safe. A Test Strategist
  // that wrote a non-conformant master (e.g. a top-level `tests` key instead of
  // `items`, which haiku has done) must NOT crash the driver with an opaque
  // "Cannot read properties of undefined (reading 'filter')": it yields an empty
  // list, so testListReady stays false and the lane re-issues the role (surfaced
  // as a clean stall), and the test_list conformance gate flags the bad shape.
  return { ...parsed, items: Array.isArray(parsed.items) ? parsed.items : [] } as TestList;
}

export function writeMasterTestList(tddDir: string, list: TestList): void {
  findFeatureDir(tddDir, list.feature_id); // assert the feature exists (throws if not)
  const file = featureTestListJson(tddDir, list.feature_id);
  writeFileSync(file, JSON.stringify(list, null, 2) + "\n");
}

/**
 * Render test-list.md from the JSON so the human-readable Beck list cannot
 * drift from the structured source. Output satisfies the test-list.md
 * conformance contract: H1 + "Ordered for:" rationale + an AC reference on
 * every active item + a Deferred / skipped section. Skipped items are listed
 * under Deferred (not as checklist rows) so they are not mistaken for orphans.
 */
export function renderTestListMarkdown(list: TestList): string {
  const orderedFor = list.ordered_for ?? "design-momentum";
  const active = list.items.filter((it) => it.status !== "skipped");
  const deferred = list.items.filter((it) => it.status === "skipped");

  const checkbox = (status: TestListItem["status"]): string =>
    status === "green" || status === "refactored" ? "x" : " ";

  const lines: string[] = [
    `# Test list: ${list.feature_id}`,
    `Ordered for: ${orderedFor}`,
    "",
  ];
  for (const item of active) {
    lines.push(`- [${checkbox(item.status)}] ${item.id}: ${item.description}  (${item.ac_id})`);
  }
  lines.push("", "## Deferred / skipped");
  if (deferred.length === 0) {
    lines.push("- (none)");
  } else {
    for (const item of deferred) {
      const why = item.notes ? `: ${item.notes}` : "";
      lines.push(`- ${item.id}: ${item.description} (${item.ac_id})${why}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** Render + write test-list.md next to test-list.json. Returns the path. */
export function writeTestListMarkdown(tddDir: string, featureId: string): string {
  const list = readMasterTestList(tddDir, featureId);
  const file = featureTestListMd(tddDir, featureId);
  writeFileSync(file, renderTestListMarkdown(list));
  return file;
}

export interface PerAcView {
  ac_id: string;
  items: TestListItem[];
}

export function viewByAc(list: TestList, acId: string): PerAcView {
  return {
    ac_id: acId,
    items: list.items.filter((it) => it.ac_id === acId),
  };
}

export function viewsForAllAcs(list: TestList): Record<string, PerAcView> {
  const out: Record<string, PerAcView> = {};
  for (const item of list.items) {
    if (!out[item.ac_id]) out[item.ac_id] = { ac_id: item.ac_id, items: [] };
    out[item.ac_id].items.push(item);
  }
  return out;
}

export function writePerAcViews(tddDir: string, featureId: string, list: TestList): string[] {
  const featureDir = findFeatureDir(tddDir, featureId);
  const views = viewsForAllAcs(list);
  const written: string[] = [];
  for (const [acId, view] of Object.entries(views)) {
    const storyDir = locateStoryDirForAc(featureDir, acId);
    if (!storyDir) continue;
    const outFile = join(storyDir, "test-list-per-ac.json");
    let existing: PerAcView[] = [];
    if (existsSync(outFile)) {
      existing = JSON.parse(readFileSync(outFile, "utf8"));
    }
    const merged = mergeViews(existing, view);
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, JSON.stringify(merged, null, 2) + "\n");
    written.push(outFile);
  }
  return written;
}

function mergeViews(existing: PerAcView[], next: PerAcView): PerAcView[] {
  const remaining = existing.filter((v) => v.ac_id !== next.ac_id);
  remaining.push(next);
  return remaining;
}

// --- Per-story scoping (phase 2c) -------------------------------
//
// The master test-list.json is feature-level; its items each carry an ac_id.
// The streaming build lane builds one story at a time, so it needs the subset
// of the list scoped to the story being built: every item whose AC belongs to
// that story, in the master's order (so the Test Strategist's chosen ordering
// carries through). Written as stories/<story>/test-list-per-story.json, the
// build lane's per-story input. AC->story membership comes from the story's
// acs/ dir, the same layout run-cycle + writePerAcViews already use.

export interface StoryTestList {
  feature_id: string;
  story_id: string;
  ordered_for?: TestList["ordered_for"];
  items: TestListItem[];
}

/** AC ids declared under a story dir's acs/, sorted. Only REAL AC files count:
 *  a conformant AC self-names (acs/<id>.json holds { id: "<id>" }), so non-AC
 *  files an agent may drop in (e.g. <ac>-tests.json / <ac>-test-list.json, whose
 *  `id` is the AC they test, not the suffixed basename) are excluded – the same
 *  pollution that stalls the design lane via storyAcIds (see consort-paths.ts). */
function acIdsInStoryDir(storyDir: string): string[] {
  const dir = join(storyDir, "acs");
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const base = f.slice(0, -".json".length);
    try {
      const obj = JSON.parse(readFileSync(join(dir, f), "utf8")) as { id?: unknown };
      if (obj && typeof obj.id === "string" && obj.id === base) out.push(base);
    } catch {
      /* unparseable -> not a conformant AC file; skip */
    }
  }
  return out.sort();
}

/** AC ids declared for a story, read from stories/<story>/acs/*.json. */
export function acsForStory(tddDir: string, featureId: string, storyId: string): string[] {
  const storyDir = findStoryDirOf(tddDir, featureId, storyId);
  return storyDir ? acIdsInStoryDir(storyDir) : [];
}

/**
 * Scope a master test list to the given AC ids, GROUPED BY AC.
 *
 * The per-story BUILD list is the build lane's input, and the build lane runs
 * RED -> GREEN -> REVIEW -> REFACTOR per AC: an AC's tests must be contiguous so
 * each AC fully completes (incl. refactor) before the next AC's first test. So
 * the scoped list is grouped by AC in the AC's first-occurrence order in the
 * master, and the master's order is preserved WITHIN each AC. (The feature-level
 * master test-list keeps its design-momentum order; only this per-story build
 * projection is regrouped.) Pure: no filesystem access.
 */
export function scopeToStory(list: TestList, storyId: string, acIds: string[]): StoryTestList {
  const want = new Set(acIds);
  const scoped = list.items.filter((it) => want.has(it.ac_id));
  // Group by AC, ordered by each AC's first appearance; stable within an AC.
  const firstSeen = new Map<string, number>();
  scoped.forEach((it, i) => {
    if (!firstSeen.has(it.ac_id)) firstSeen.set(it.ac_id, i);
  });
  const grouped = scoped
    .map((it, i) => ({ it, i }))
    .sort((a, b) => firstSeen.get(a.it.ac_id)! - firstSeen.get(b.it.ac_id)! || a.i - b.i)
    .map((x) => x.it);
  return {
    feature_id: list.feature_id,
    story_id: storyId,
    ...(list.ordered_for ? { ordered_for: list.ordered_for } : {}),
    items: grouped,
  };
}

/** The next free `T<n>` ordinal for the master, so folded-in story items keep
 *  globally-unique ids. Continues past the highest existing `T<n>`, and never
 *  below the item count (covers a list whose ids are not all `T`-prefixed). */
function nextTestNumber(items: TestListItem[]): number {
  let max = 0;
  for (const it of items) {
    const m = /^T(\d+)$/.exec(it.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return Math.max(max, items.length) + 1;
}

/**
 * Read the master test list, scope it to one story's ACs, and write the
 * canonical per-story list (storyTestListJson, the build lane's per-story input
 * AND the driver's testListReady probe target – one path, defined once). Returns
 * the written path, or null when the story cannot be resolved or the master is
 * not yet written (so a missing master surfaces as a stall, not a crash).
 */
export function writeStoryTestList(
  tddDir: string,
  featureId: string,
  storyId: string,
): string | null {
  const storyDir = findStoryDirOf(tddDir, featureId, storyId);
  if (!storyDir) return null;
  const storyAcIds = acIdsInStoryDir(storyDir);

  let master: TestList | null = null;
  try {
    master = readMasterTestList(tddDir, featureId);
  } catch {
    master = null; // master not authored yet
  }

  // The streaming pipeline hands the Test Strategist ONE story at a time; it
  // writes that story's per-story list. Accumulate those items into the feature
  // master, which otherwise only ever holds the FIRST story's tests. Both
  // scopeToStory (here) and markTestItemGreen read the master, so a later story
  // whose tests never reach the master scopes to an EMPTY per-story list, which
  // leaves testListReady false and stalls the design lane re-issuing the role.
  const authored = readStoryTestList(tddDir, featureId, storyId);
  if (authored?.items?.length) {
    const baseList: TestList =
      master ?? {
        feature_id: featureId,
        ...(authored.ordered_for ? { ordered_for: authored.ordered_for } : {}),
        items: [],
      };
    // Dedup identity MUST be feature-stable. The test `id` (T1, T2, ...) is
    // per-STORY – the Strategist restarts numbering each story – so keying dedup
    // on `id` made a later story's T1.. collide with an earlier story's T1.. and
    // every item got dropped as "already present", leaving the master without that
    // story. Its per-story scope then came back EMPTY and the build aborted. Key
    // on (ac_id + description), which is unique across the feature (each AC belongs
    // to one story), and RE-ID the additions to extend the master's numbering so
    // the master keeps globally-unique ids (markTestItemGreen finds items by id).
    const key = (it: TestListItem): string => `${it.ac_id} ${it.description}`;
    const have = new Set(baseList.items.map(key));
    const usedIds = new Set(baseList.items.map((i) => i.id));
    const fresh = authored.items.filter((it) => storyAcIds.includes(it.ac_id) && !have.has(key(it)));
    if (fresh.length > 0 || master === null) {
      let n = nextTestNumber(baseList.items);
      // Keep an authored id when it is free; re-id ONLY on collision with an id
      // already in the master (the per-story-numbering clash), so the master's
      // ids stay globally unique while the Strategist's ids survive in the norm.
      const renumbered = fresh.map((it) => {
        if (!usedIds.has(it.id)) {
          usedIds.add(it.id);
          return it;
        }
        let nid = `T${n++}`;
        while (usedIds.has(nid)) nid = `T${n++}`;
        usedIds.add(nid);
        return { ...it, id: nid };
      });
      master = { ...baseList, items: [...baseList.items, ...renumbered] };
      writeMasterTestList(tddDir, master);
    }
  }
  if (!master) return null; // no master and no authored per-story list – nothing to scope

  const scoped = scopeToStory(master, storyId, storyAcIds);
  const file = storyTestListJson(tddDir, featureId, storyId);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(scoped, null, 2) + "\n");
  return file;
}

export interface TestItemGreenResult {
  /** The test_id was found in the master list + marked green. */
  found: boolean;
  /** The AC the test belongs to. */
  acId?: string;
  /** True iff EVERY test for that AC is now green/refactored (AC -> passing). */
  acPassing: boolean;
}

/**
 * Propagate a GREEN cycle up the artifact hierarchy the downstream consumers
 * read: mark the test-list item green (master + the re-derived per-story list)
 * and, when every test for its AC is green, flip the AC's status to `passing`.
 *
 * This is the deterministic record the orchestration writes when it greens a
 * cycle. Without it the cycle artifact says green but the test-list items stay
 * `pending` + the AC stays `draft`, so the Release Engineer (reading those)
 * judges the build incomplete and refuses to deploy – the await-acceptance
 * stall. Cycle bookkeeping is an orchestration concern; so is propagating it.
 */
export function markTestItemGreen(
  tddDir: string,
  featureId: string,
  storyId: string,
  testId: string,
): TestItemGreenResult {
  let master: TestList;
  try {
    master = readMasterTestList(tddDir, featureId);
  } catch {
    return { found: false, acPassing: false };
  }
  const item = master.items.find((i) => i.id === testId);
  if (!item) return { found: false, acPassing: false };
  item.status = "green";
  writeMasterTestList(tddDir, master);
  try {
    writeTestListMarkdown(tddDir, featureId);
  } catch {
    /* md render is observability, never fatal */
  }
  // Re-derive the per-story list from master so its items carry the green too.
  writeStoryTestList(tddDir, featureId, storyId);

  const acId = item.ac_id;
  const acItems = master.items.filter((i) => i.ac_id === acId);
  const acPassing = acItems.length > 0 && acItems.every((i) => i.status === "green" || i.status === "refactored");
  if (acPassing) {
    try {
      const f = acJson(tddDir, featureId, storyId, acId);
      if (existsSync(f)) {
        const ac = JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>;
        ac.status = "passing"; // ac.schema.json enum: draft|approved|in-progress|passing|deprecated
        writeFileSync(f, JSON.stringify(ac, null, 2) + "\n");
      }
    } catch {
      /* best-effort: a malformed/absent AC file must not break greening */
    }
  }
  return { found: true, acId, acPassing };
}

/** Read the canonical per-story list (storyTestListJson), or null when absent. */
export function readStoryTestList(
  tddDir: string,
  featureId: string,
  storyId: string,
): StoryTestList | null {
  const file = storyTestListJson(tddDir, featureId, storyId);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

function locateStoryDirForAc(featureDir: string, acId: string): string | null {
  const storiesDir = join(featureDir, "stories");
  if (!existsSync(storiesDir)) return null;
  for (const storyDirName of readdirSync(storiesDir)) {
    const storyDir = join(storiesDir, storyDirName);
    if (!statSync(storyDir).isDirectory()) continue;
    const acsDir = join(storyDir, "acs");
    if (!existsSync(acsDir)) continue;
    const match = readdirSync(acsDir).find((f) => f.startsWith(acId) && f.endsWith(".json"));
    if (match) return storyDir;
  }
  return null;
}
