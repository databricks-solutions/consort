#!/usr/bin/env node
// CLI: regenerate per-AC views from a feature's master test list, or, when a
// storyId is given, write that story's scoped per-story test list (the
// streaming build lane's per-story input).

import { readMasterTestList, writePerAcViews, writeStoryTestList, readStoryTestList } from "../../consort/test-list/test-list.js";
import { resolveConsortDir } from "../../consort/config/consort-paths.js";
import { emitAgentLogEvent } from "../../consort/logging/agent-log.js";

/** Trace the per-story-view generation into the persisted agent-log so a run can show WHETHER this
 *  postTurn ran and what it scoped. The per-story view is what `testListReady` reads; when it does not
 *  materialize on the test-strategist's authoring turn the design lane burns a second dispatch, and the
 *  command-execution trace is otherwise not preserved (drive-live.log is narration-only). ABSENCE of this
 *  event after a test-strategist turn => the postTurn was SKIPPED (e.g. validation-gated); a `scoped:0`
 *  => a master/story AC-id mismatch. Best-effort: never let diagnostics fail the CLI. */
function traceStoryView(consortDir: string, featureId: string, storyId: string, result: { wrote?: string; scoped?: number; master?: number; error?: string }): void {
  try {
    emitAgentLogEvent(
      {
        role: "orchestrator",
        level: result.error ? "warn" : "debug",
        event: "reasoning",
        feature_id: featureId,
        slots: {
          note:
            result.error
              ? `per-story-view generation FAILED for ${storyId}: ${result.error}`
              : `per-story-view generated for ${storyId}: master=${result.master} items, scoped=${result.scoped} items -> ${result.wrote}`,
        },
      },
      { consortDir },
    );
  } catch {
    /* diagnostics never fail the CLI */
  }
}

function main(): number {
  const [consortDir = resolveConsortDir(), featureId, storyId] = process.argv.slice(2);
  if (!featureId) {
    process.stderr.write("usage: test-list <consortDir> <featureId> [storyId]\n");
    return 1;
  }
  if (storyId) {
    const file = writeStoryTestList(consortDir, featureId, storyId);
    if (!file) {
      process.stderr.write(`story ${storyId} not found under ${featureId}\n`);
      traceStoryView(consortDir, featureId, storyId, { error: "story not found (no story dir)" });
      return 1;
    }
    // Trace master + scoped item counts so a run shows exactly what this postTurn produced.
    let master = 0;
    try {
      master = readMasterTestList(consortDir, featureId).items.length;
    } catch {
      /* master unreadable; report 0 */
    }
    const scoped = readStoryTestList(consortDir, featureId, storyId)?.items?.length ?? 0;
    traceStoryView(consortDir, featureId, storyId, { wrote: file, scoped, master });
    process.stdout.write(`wrote ${file}\n`);
    return 0;
  }
  const list = readMasterTestList(consortDir, featureId);
  const written = writePerAcViews(consortDir, featureId, list);
  for (const f of written) process.stdout.write(`wrote ${f}\n`);
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
