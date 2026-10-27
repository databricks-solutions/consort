// Batch-then-decompose-on-failure (the adaptive-batching primitive).
//
// When a cycle batches N tests (RED + GREEN in one step) and the honest-GREEN
// verify FAILS, the coarse alternative is to repair the whole batched change at
// once — a big, coupled diff where a fix for one failing test can ripple into the
// siblings. The adaptive alternative: KEEP the tests that passed, and DECOMPOSE
// the failure into one fine-grained repair unit PER failing test, each targeting
// a single node-id. The caller re-verifies the WHOLE batch after each repair (the
// regression guard — a repair that breaks a sibling re-fails and is caught).
//
// Property: adaptive. Few failures => batch speed + a couple targeted repairs;
// many failures => it degrades toward fine-grained. Fast when it works, safe when
// it doesn't. This is what makes batching acceptable on a contract story.
//
// This module is PURE parsing + planning (no I/O). `parseFailedNodeDetails` is the
// instrumentation upgrade over `parseFailedNodeIds` (deploy-verify-assess.ts): it
// pairs each failing node-id with its OWN failure detail (short-summary reason +
// the per-test FAILURES traceback) instead of one undifferentiated output tail, so
// each decomposed repair gets exactly its test's failure.

import { parseFailedNodeIds } from "../smells/deploy-verify-assess.js";

export interface FailedNodeDetail {
  /** The pytest node-id (`path::test[param]`). */
  nodeId: string;
  /** The one-line reason from the short summary (`FAILED <id> - <reason>`), "" if absent. */
  reason: string;
  /** The per-test FAILURES-section traceback (bounded), "" when not found. */
  detail: string;
}

/** The test-function name of a node-id (last `::` segment, params stripped) — how a
 *  FAILURES block header (`____ test_foo ____`) maps back to a node-id. */
function testName(nodeId: string): string {
  const leaf = nodeId.split("::").pop() ?? nodeId;
  return leaf.replace(/\[.*$/, "");
}

/** Split the pytest FAILURES section into per-test traceback blocks keyed by the
 *  block header's test name. Returns {} when there is no FAILURES section. */
function failuresBlocks(output: string): Map<string, string> {
  const lines = output.split("\n");
  const start = lines.findIndex((l) => /^=+\s*FAILURES\s*=+$/.test(l));
  const out = new Map<string, string>();
  if (start < 0) return out;
  let name: string | undefined;
  let buf: string[] = [];
  const flush = () => {
    if (name) out.set(name, buf.join("\n").trim().slice(0, 4000));
    buf = [];
    name = undefined; // so a second flush (break + post-loop) can't overwrite with empty
  };
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    // End of the FAILURES section (the next `===` banner, e.g. short summary / warnings).
    if (/^=+\s*\S.*=+$/.test(l) && !/^_+\s/.test(l)) {
      flush();
      break;
    }
    const hdr = l.match(/^_{3,}\s+(\S+?)\s+_{3,}$/);
    if (hdr) {
      flush();
      name = testName(hdr[1]);
      continue;
    }
    if (name) buf.push(l);
  }
  flush();
  return out;
}

/**
 * Per-failing-node-id structured detail. Node-ids come from the short-summary
 * `FAILED/ERROR <id>` lines (reliable, always present — reuses parseFailedNodeIds),
 * the one-line reason from the `- <reason>` suffix, and the full traceback from the
 * matching FAILURES block when present. Order-preserving, deduped by node-id.
 */
export function parseFailedNodeDetails(output: string): FailedNodeDetail[] {
  const ids = parseFailedNodeIds(output);
  const blocks = failuresBlocks(output);
  const reasonFor = new Map<string, string>();
  for (const line of output.split("\n")) {
    const m = line.match(/^(?:FAILED|ERROR)\s+(\S+::[^\s]+)(?:\s+-\s+(.*))?$/);
    if (m) reasonFor.set(m[1], (m[2] ?? "").trim());
  }
  return ids.map((nodeId) => ({
    nodeId,
    reason: reasonFor.get(nodeId) ?? "",
    detail: blocks.get(testName(nodeId)) ?? "",
  }));
}

export interface BatchRepairUnit {
  /** The single failing node-id this fine-grained repair cycle targets. */
  nodeId: string;
  reason: string;
  detail: string;
}

export interface DecomposeResult {
  /** One fine-grained repair unit per FAILING node-id (the decomposition). */
  units: BatchRepairUnit[];
  /** Node-ids that were in the batch and did NOT fail — left untouched. */
  passed: string[];
}

/**
 * Decompose a failed batched verify into per-failing-node-id repair units.
 * `batchNodeIds` is the set the batch ran (node-id form); any not in the failing
 * set is reported as `passed` (left alone). When `batchNodeIds` is empty/unknown,
 * every failing node-id becomes a unit (we still decompose by failure).
 */
export function decomposeBatchFailure(args: {
  output: string;
  batchNodeIds?: string[];
}): DecomposeResult {
  const details = parseFailedNodeDetails(args.output);
  const failingSet = new Set(details.map((d) => d.nodeId));
  const units: BatchRepairUnit[] = details.map((d) => ({ nodeId: d.nodeId, reason: d.reason, detail: d.detail }));
  const passed = (args.batchNodeIds ?? []).filter((id) => !failingSet.has(id));
  return { units, passed };
}

/**
 * Map each test-list id -> its pytest test FUNCTION name, by scanning the project's Python test sources
 * for the `@pytest.mark.testid("<id>")` marker that decorates a test function. This is the link between
 * `pending` (keyed by test-list id, e.g. T36) and a pytest node-id (`path::test_fn`): a failing node-id's
 * function name maps back to its test-list id through this table. The marker may sit among other
 * decorators / blank lines above the `def` — those don't reset the pending id; only the next `def`
 * consumes it. Pure (caller supplies the file contents).
 */
export function testidToTestName(sources: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const src of sources) {
    let pendingId: string | null = null;
    for (const line of src.split("\n")) {
      const mk = line.match(/@pytest\.mark\.testid\(\s*["']([^"']+)["']\s*\)/);
      if (mk) { pendingId = mk[1]; continue; }
      const def = line.match(/^\s*(?:async\s+)?def\s+(test_[A-Za-z0-9_]+)/);
      if (def) {
        if (pendingId) map.set(pendingId, def[1]);
        pendingId = null;
      }
    }
  }
  return map;
}

/** One re-queued (failed) test-list item: its id (to return to `pending`) + the failure detail. */
export interface RequeueUnit {
  /** The test-list id (the `pending` key) to re-queue for the next batch / fan-out. */
  id: string;
  nodeId: string;
  reason: string;
  detail: string;
}

export interface BatchResultSplit {
  /** Test-list ids CONFIRMED passed in the batch's GREEN verify — bank these as green (drop from pending). */
  banked: string[];
  /** Test-list items to RE-QUEUE (failed, OR un-mappable so we can't confirm a pass) — they return to
   *  `pending` and re-form into the next batch / fan out. */
  requeue: RequeueUnit[];
}

/**
 * Split a batch's GREEN verify result per test-list id: BANK the ones confirmed passed, RE-QUEUE the
 * failed ones (and, conservatively, any id we cannot map to a test function — so an unresolved mapping
 * NEVER banks a failer as green, the one silent-loss risk). `testidToName` comes from testidToTestName.
 * The requeued ids go back to `pending`; the caller re-batches OR fans them out.
 */
export function splitBatchByResult(args: {
  batchIds: string[];
  output: string;
  testidToName: Map<string, string>;
}): BatchResultSplit {
  const details = parseFailedNodeDetails(args.output);
  const failedNames = new Set(details.map((d) => testName(d.nodeId)));
  const detailByName = new Map(details.map((d) => [testName(d.nodeId), d]));
  const banked: string[] = [];
  const requeue: RequeueUnit[] = [];
  for (const id of args.batchIds) {
    const name = args.testidToName.get(id);
    if (name && !failedNames.has(name)) {
      banked.push(id); // CONFIRMED pass (mapped + not in the failing set)
    } else {
      // Failed, OR unmappable (no testid marker found) — re-queue rather than risk banking a failer green.
      const d = name ? detailByName.get(name) : undefined;
      requeue.push({ id, nodeId: d?.nodeId ?? "", reason: d?.reason ?? (name ? "" : "unmapped-testid"), detail: d?.detail ?? "" });
    }
  }
  return { banked, requeue };
}
