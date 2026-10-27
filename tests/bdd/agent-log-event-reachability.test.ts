// REACHABILITY GUARD for the closed agent-log event vocabulary.
//
// Why this exists: the suite was green at ~1900 tests while cycle.review and
// cycle.refactored reached the central log from NO code path (the per-AC
// review/refactor lane wrote review.json but emitted nothing; the only
// cycle.refactored producer, run-cycle.markRefactored, was the dead per-test
// path). Defining an event in the vocabulary + giving it a schema + a template
// does NOT make it emitted. Nothing connected "this event is in the vocabulary"
// to "some path actually produces it", so a deterministic event could be silent
// and every unit test stayed green.
//
// This guard closes that gap: EVERY event in the closed vocabulary must be
// explicitly classified, and its classification must hold on disk:
//   - CODE_EMITTED   : a deterministic substrate path emits it. Asserted: a
//                      TS `event: "<name>"` producer exists in scripts/ (outside
//                      the logging plumbing itself).
//   - AGENT_EMITTED  : a role emits it via the consort-log CLI as a JUDGMENT
//                      (smell/concern/open question/progress, or a role-observed
//                      verify/deploy/adherence outcome). Asserted: at least one
//                      agent doc instructs it. (Weaker than CODE_EMITTED: a role
//                      may forget. Events that SHOULD be deterministic belong in
//                      CODE_EMITTED, with the dynamic per-AC trail test in
//                      tdd-cycle-record proving the real path emits them.)
//   - KNOWN_DEAD     : in the vocabulary but produced by NOTHING (no code path,
//                      no agent instruction). A documented debt: each must be
//                      WIRED (move to CODE_EMITTED) or REMOVED from the
//                      vocabulary. This list may only SHRINK.
//
// The union of the three MUST equal the vocabulary, so a newly-added event fails
// the build until it is classified – forcing the author to say who emits it.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { AGENT_LOG_EVENT_NAMES } from "../../consort/logging/agent-log-events";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Files that DEFINE/route the vocabulary rather than EMIT a domain event;
 *  excluded so the producer search finds real emit sites, not the plumbing. */
const PLUMBING = ["agent-log-events.ts", "agent-log.ts", "agent-log.cli.ts"];

function grepFiles(pattern: string, dir: string, include?: string): string[] {
  try {
    const args = ["-rEl", ...(include ? ["--include", include] : []), pattern, dir];
    const out = execFileSync("grep", args, { cwd: repoRoot, encoding: "utf8" });
    return out.split("\n").filter(Boolean);
  } catch {
    return []; // grep exits 1 on no match
  }
}

/** A deterministic TS producer: the event name appears as a quoted string
 *  literal in a non-plumbing scripts/ *.ts file – either inline (`event: "x"`)
 *  or passed to an emit helper (`logDeployEvent(consortDir, "x", ...)`). Both are
 *  real emit sites; the guard must not force one syntax. Restricted to .ts (so
 *  the schema JSON enum + docs do not count) and PLUMBING is excluded, so only
 *  true producers register. */
function hasCodeProducer(name: string): boolean {
  const esc = name.replace(/\./g, "\\.");
  // Producers live across the orchestration layer: consort/ (the foliated function families) +
  // bin/ (the CLI entrypoints) + scripts/ (any residual). Search all three roots.
  return ["consort/", "bin/", "scripts/"]
    .flatMap((dir) => grepFiles(`"${esc}"`, dir, "*.ts"))
    .some((f) => !PLUMBING.some((p) => f.endsWith(p)));
}

/** An agent instruction: the event name appears in a role doc / skill. */
function hasAgentInstruction(name: string): boolean {
  return grepFiles(name.replace(/[.]/g, "\\."), "skills/").length > 0;
}

// ── The explicit, reviewed classification. Keep in sync with reality; the tests
//    below FAIL if an entry drifts (a CODE event loses its producer, a DEAD event
//    gains one, a new event is unclassified). ──────────────────────────────────

const CODE_EMITTED = new Set<string>([
  "artifact.written",
  "cycle.red", "cycle.green", "cycle.verified", "cycle.review", "cycle.refactored",
  // Per-test status trail emitted by run-cycle (beginCycle/markGreen/markRefactored)
  // for every covered test id, so each test's status is reconstructable as-of any event.
  "test.result",
  "deploy.start", "deploy.verified", "deploy.failed",
  // Deterministic deploy-step events emitted by deployToTarget (it computes
  // reachability + the verify outcome). Promoted from agent-only.
  "deploy.reachable", "deploy.unreachable",
  "verify.passed", "verify.failed", "verify.timing", "turn.timing",
  "escalation.raised",
  "experiment.cut", "experiment.accepted",
  // Emitted by the experiment-lifecycle CLI's discard/revise path (the substrate
  // home for these HIL acceptance verbs). Promoted from dead.
  "experiment.discarded", "experiment.revised",
  "gate.surfaced", "gate.approved", "gate.rejected",
  "handoff", "phase.start", "phase.end",
  "intake.supplied", "intake.refused",
  // The runner emits this from each claude -p turn's stream-json result event
  // (the per-turn context size + token usage).
  "turn.usage",
  "reasoning",
]);

const AGENT_EMITTED = new Set<string>([
  // Genuine role judgments – a human/agent decides these, no deterministic moment.
  "smell.flagged", "concern.flagged", "open.question", "progress",
  // gate.modified: a HIL gate-modification decision (the human alters a gate),
  // not a deterministic substrate moment – stays role-emitted.
  "gate.modified",
  // PENDING promotion to CODE_EMITTED (user-approved direction). runner.missing:
  // the runner-dispatch substrate detects a missing runner deterministically.
  // adherence.failed: emitted by the design-adherence check. Both depend on a
  // doc instruction today; tracked to wire next.
  "runner.missing",
  "adherence.failed",
]);

// Produced by NOTHING today. Each must be wired (-> CODE_EMITTED) or removed.
// adherence.passed: assertDesignAdherence runs in the PROJECT's browser Playwright
//   context (it throws on failure, is silent on pass), so there is no kit-side
//   node logger in scope to emit the SUCCESS event from. Wiring needs the
//   adherence runner to shell out to consort-log or a kit-side adherence
//   entrypoint; flagged for a decision rather than force-wired wrongly.
const KNOWN_DEAD = new Set<string>([
  "adherence.passed",
]);

describe("agent-log event vocabulary: every event is reachable (no silent/dead events)", () => {
  const all = new Set<string>(AGENT_LOG_EVENT_NAMES);

  it("classifies every vocabulary event exactly once (a new event must declare its producer)", () => {
    for (const name of AGENT_LOG_EVENT_NAMES) {
      const inN = [CODE_EMITTED, AGENT_EMITTED, KNOWN_DEAD].filter((s) => s.has(name)).length;
      expect(inN, `event "${name}" must be classified in exactly ONE of CODE_EMITTED / AGENT_EMITTED / KNOWN_DEAD`).toBe(1);
    }
    for (const s of [CODE_EMITTED, AGENT_EMITTED, KNOWN_DEAD]) {
      for (const name of s) {
        expect(all.has(name), `classified "${name}" is not in the vocabulary (stale entry)`).toBe(true);
      }
    }
  });

  it("every CODE_EMITTED event has a deterministic TS producer (catches a defined-but-silent event)", () => {
    for (const name of CODE_EMITTED) {
      expect(hasCodeProducer(name), `CODE_EMITTED "${name}" has no \`event: "${name}"\` producer in scripts/`).toBe(true);
    }
  });

  it("every AGENT_EMITTED event is instructed in at least one agent doc", () => {
    for (const name of AGENT_EMITTED) {
      expect(hasAgentInstruction(name), `AGENT_EMITTED "${name}" is not referenced in any skills/ agent doc`).toBe(true);
    }
  });

  it("KNOWN_DEAD events truly have NO producer (the list only shrinks; wiring one forces reclassification)", () => {
    for (const name of KNOWN_DEAD) {
      expect(hasCodeProducer(name), `"${name}" now HAS a code producer – move it to CODE_EMITTED`).toBe(false);
      expect(hasAgentInstruction(name), `"${name}" is now agent-instructed – move it to AGENT_EMITTED`).toBe(false);
    }
  });
});
