// Consort per-test "green as it runs" reporter for Playwright.
//
// Appends one line to `.consort/test-run.jsonl` as each test tagged `@T<id>` in its title finishes,
// so the dashboard tails it and lights that test live — even under story cadence (one whole-suite
// run), where otherwise every test would appear to flip at once. The `file` disambiguates a reused
// test id across features (F1 and F2 may both carry a T37); the dashboard keys by (scenario_file + id).
//
// The shared, framework-agnostic capture writers (emitTestRun / emitTableSnapshot /
// captureTablesFromRoute / findConsortDir) live in `./consort-capture` — this file is the ONLY one
// that imports `@playwright/test/reporter`, so the Vitest/client compile never pulls in Playwright.
// Re-exported here for back-compat with importers that still reach through this module.
//
// Pure observability: everything is wrapped so a reporter write can NEVER fail the suite. Tag a test
// by putting its test-list id in the title, e.g. `test("home table lists stock @T37", …)`.
import type { FullConfig, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { emitTestRun, captureTablesFromRoute } from "./consort-capture";

export { findConsortDir, emitTestRun, emitTableSnapshot, captureTablesFromRoute, type TestRunStatus } from "./consort-capture";

const TEST_ID = /@(T\d+(?:-[a-z0-9-]+)?)/;

export default class ConsortTestReporter implements Reporter {
  private baseURL = "";

  // The app's read-only snapshot route lives at the app origin; E2E specs hit the DB THROUGH the
  // app, so after each spec we ask the app what rows it left (the client never touches the DB).
  onBegin(config: FullConfig): void {
    this.baseURL = config.projects?.[0]?.use?.baseURL ?? "";
  }

  // Emit `running` the moment a tagged spec starts, so the dashboard shows it in-flight (amber)
  // before it resolves — the dashboard's last-write-wins reduce makes running -> green compose.
  onTestBegin(test: TestCase): void {
    const id = TEST_ID.exec(test.title)?.[1];
    if (id) emitTestRun(id, "running", test.location?.file ?? "", "client");
  }

  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    const id = TEST_ID.exec(test.title)?.[1];
    if (!id) return;
    const status = result.status === "passed" ? "green" : result.status === "skipped" ? "skipped" : "red";
    emitTestRun(id, status, test.location?.file ?? "", "client");
    await captureTablesFromRoute(this.baseURL, id, test.location?.file ?? "");
  }
}
