// Pure parse of the per-test live ledger `.consort/test-run.jsonl` — the file the scaffolded
// per-stack reporters (pytest / Playwright / Vitest) append one line to as each `@T<id>`-tagged
// test finishes. Kept pure (string in, entries out) so it is unit-testable without the filesystem;
// the route (/api/test-run-live) just reads the file and hands the text here.

export interface TestRunEntry {
  test_id: string;
  status: string; // green | red | skipped
  file: string; // project-relative test file; disambiguates a reused T-id across stories/features
  ts: string;
}

/** Reduce the JSONL to the LATEST entry per (test_id, file): the last line for a key wins, so a
 *  rerun within a cycle shows its final state. Malformed / half-written trailing lines are skipped
 *  (a reader may catch the file mid-append), never thrown on. Insertion order follows first sight
 *  of each key. */
export function reduceTestRunLog(text: string): TestRunEntry[] {
  const latest = new Map<string, TestRunEntry>();
  for (const line of (text ?? "").split("\n")) {
    const s = line.trim();
    if (!s) continue;
    let o: Partial<TestRunEntry>;
    try {
      o = JSON.parse(s) as Partial<TestRunEntry>;
    } catch {
      continue;
    }
    if (!o || typeof o.test_id !== "string" || typeof o.status !== "string") continue;
    const file = typeof o.file === "string" ? o.file : "";
    latest.set(`${o.test_id}\u0000${file}`, {
      test_id: o.test_id,
      status: o.status,
      file,
      ts: typeof o.ts === "string" ? o.ts : "",
    });
  }
  return Array.from(latest.values());
}
