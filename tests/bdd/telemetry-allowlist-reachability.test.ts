// REACHABILITY GUARD for the closed telemetry attribute allowlist (schema
// "consort/v1"). Mirrors agent-log-event-reachability.test.ts: a closed
// vocabulary whose membership is asserted against reality, so the build fails the
// moment the emitter could ship a field the allowlist does not list, or the
// `gate` enum drifts from the real WorkflowAction union in the source.
//
// The teeth:
//   1. GATE_KINDS === the set of `kind: "..."` literals in the WorkflowAction
//      source union. A new action kind fails the build until it is classified;
//      a removed kind fails as a stale entry. (This is the "keyed off real
//      WorkflowAction kinds, freeze the actual set" contract.)
//   2. The Resource attrs the emitter actually builds == RESOURCE_ATTR_KEYS
//      exactly (defined-but-never-emitted, or emitted-but-unlisted, both fail).
//   3. Sanitizing a span keeps ONLY the allowlisted fields and DROPS anything
//      else (the runtime tooth against a leaked field).
//   4. No free text: every constrained string field is within its closed enum.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARCH_VALUES,
  EFFORT_VALUES,
  FAIL_CLASSES,
  GATE_KINDS,
  GATE_SPAN_FIELDS,
  MODEL_VALUES,
  OS_VALUES,
  RESOURCE_ATTR_KEYS,
  ROLE_VALUES,
  RUN_SPAN_FIELDS,
  SHELL_VALUES,
  TOKEN_BUCKET_VALUES,
  TURN_SPAN_FIELDS,
  pickAllowed,
} from "../../consort/telemetry/allowlist";
import { buildResourceAttrs } from "../../consort/telemetry/resource";
import {
  sanitizeGateSpan,
  sanitizeRunSpan,
  sanitizeTurnSpan,
  type GateSpan,
  type RunSpan,
  type TurnSpan,
} from "../../consort/telemetry/spans";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VOCAB_FILE = join(repoRoot, "consort", "orchestrator", "workflow", "workflow-vocabulary.ts");

/** Every distinct `kind: "..."` string literal in the WorkflowAction source. */
function workflowActionKindsInSource(): Set<string> {
  const src = readFileSync(VOCAB_FILE, "utf8");
  const kinds = new Set<string>();
  const re = /kind:\s*"([a-z-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) kinds.add(m[1]);
  return kinds;
}

describe("telemetry allowlist reachability (no unlisted / no silent field)", () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "tele-reach-"));
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it("the gate enum EQUALS the real WorkflowAction kinds in the source (frozen, not invented)", () => {
    const inSource = workflowActionKindsInSource();
    const listed = new Set<string>(GATE_KINDS);
    // Every source kind must be listed (a new action fails the build here).
    for (const k of inSource) {
      expect(listed.has(k), `WorkflowAction kind "${k}" is not in GATE_KINDS , classify it`).toBe(true);
    }
    // Every listed kind must still exist in the source (no stale entry).
    for (const k of listed) {
      expect(inSource.has(k), `GATE_KINDS entry "${k}" no longer exists in the WorkflowAction union`).toBe(true);
    }
    // And the counts match (belt + suspenders: the two sets are identical).
    expect(listed.size).toBe(inSource.size);
  });

  it("the Resource attrs the emitter builds are EXACTLY the allowlist (no unlisted, no missing)", () => {
    const attrs = buildResourceAttrs({ homedir: home, env: {} });
    expect(new Set(Object.keys(attrs))).toEqual(new Set(RESOURCE_ATTR_KEYS));
  });

  it("sanitizing a span DROPS any non-allowlisted key (runtime tooth against a leak)", () => {
    // A run span that grew forbidden free-text fields (a path, a branch, an error).
    const dirty = {
      trace_id: "t",
      span_id: "s",
      name: "consort.run",
      start_ts: 1,
      end_ts: 2,
      duration_ms: 1,
      command: "build",
      outcome: "completed",
      exit_code: 0,
      gates_total: 0,
      // forbidden extras:
      branch: "feature/secret-branch",
      cwd: "/Users/someone/secret",
      error_message: "boom at /etc/passwd",
    } as unknown as RunSpan;
    const clean = sanitizeRunSpan(dirty);
    // sanitize is a key filter: it keeps the allowlisted keys PRESENT on the object
    // (the optional L2 fields are simply absent on this L1 span) and drops the rest.
    expect(new Set(Object.keys(clean))).toEqual(new Set(RUN_SPAN_FIELDS.filter((k) => k in dirty)));
    expect(clean as unknown as Record<string, unknown>).not.toHaveProperty("branch");
    expect(clean as unknown as Record<string, unknown>).not.toHaveProperty("cwd");
    expect(clean as unknown as Record<string, unknown>).not.toHaveProperty("error_message");

    const dirtyGate = {
      trace_id: "t",
      parent_span_id: "p",
      span_id: "s",
      name: "consort.gate",
      gate: "deploy",
      ordinal: 0,
      start_ts: 1,
      end_ts: 2,
      duration_ms: 1,
      outcome: "pass",
      note: "free text about the failure",
    } as unknown as GateSpan;
    const cleanGate = sanitizeGateSpan(dirtyGate);
    expect(new Set(Object.keys(cleanGate))).toEqual(new Set(GATE_SPAN_FIELDS.filter((k) => k in dirtyGate)));
    expect(cleanGate as unknown as Record<string, unknown>).not.toHaveProperty("note");
  });

  it("no free text: every constrained resource string field is within its closed enum", () => {
    const attrs = buildResourceAttrs({ homedir: home, env: { SHELL: "/usr/bin/zsh" }, platform: "darwin", arch: "arm64" });
    expect(OS_VALUES).toContain(attrs.os);
    expect(ARCH_VALUES).toContain(attrs.arch);
    expect(SHELL_VALUES).toContain(attrs.shell);
    // A novel platform/arch/shell collapses to the enum bucket, never a raw string.
    const novel = buildResourceAttrs({ homedir: home, env: { SHELL: "/opt/exotic-shell" }, platform: "sunos", arch: "mips" });
    expect(novel.os).toBe("other");
    expect(novel.arch).toBe("other");
    expect(novel.shell).toBe("unknown");
  });

  it("pickAllowed is a pure key filter", () => {
    expect(pickAllowed({ a: 1, b: 2, c: 3 }, ["a", "c"])).toEqual({ a: 1, c: 3 });
  });

  // ── Level 2 (opt-in) additions: the same teeth extended to the L2 vocabulary ──

  it("L2: sanitizing a turn span DROPS any non-allowlisted key (runtime tooth)", () => {
    const dirty = {
      trace_id: "t",
      parent_span_id: "p",
      span_id: "s",
      name: "consort.turn",
      role: "driver",
      model: "opus",
      effort: "high",
      duration_ms: 5,
      retry_count: 0,
      token_bucket: "m",
      // forbidden extras a turn span must never ship:
      prompt: "write the failing test for AC-3",
      cwd: "/Users/someone/secret",
      error_message: "boom",
    } as unknown as TurnSpan;
    const clean = sanitizeTurnSpan(dirty);
    expect(new Set(Object.keys(clean))).toEqual(new Set(Object.keys(dirty).filter((k) => (TURN_SPAN_FIELDS as readonly string[]).includes(k))));
    expect(new Set(Object.keys(clean))).toEqual(new Set(TURN_SPAN_FIELDS));
    for (const forbidden of ["prompt", "cwd", "error_message"]) {
      expect(clean as unknown as Record<string, unknown>).not.toHaveProperty(forbidden);
    }
  });

  it("L2: the run span's L2 count fields SURVIVE sanitize; junk is still dropped", () => {
    const dirty = {
      trace_id: "t",
      span_id: "s",
      name: "consort.run",
      start_ts: 1,
      end_ts: 2,
      duration_ms: 1,
      command: "build",
      outcome: "aborted",
      exit_code: 3,
      gates_total: 4,
      // L2 additions (must survive):
      red_green_cycles: 2,
      refactor_iterations: 1,
      revise_rounds: 1,
      selfheal_attempts: 0,
      hil_escalations: 1,
      story_count: 3,
      ui_track: true,
      // forbidden free text (must drop):
      branch: "feature/secret",
    } as unknown as RunSpan;
    const clean = sanitizeRunSpan(dirty) as unknown as Record<string, unknown>;
    expect(clean.red_green_cycles).toBe(2);
    expect(clean.hil_escalations).toBe(1);
    expect(clean.ui_track).toBe(true);
    expect(clean.story_count).toBe(3);
    expect(clean).not.toHaveProperty("branch");
  });

  it("L2: a gate span's fail_class survives sanitize and is within the closed enum", () => {
    const gate = {
      trace_id: "t",
      parent_span_id: "p",
      span_id: "s",
      name: "consort.gate",
      gate: "deploy",
      ordinal: 0,
      start_ts: 1,
      end_ts: 2,
      duration_ms: 1,
      outcome: "fail",
      fail_class: "deploy-verify-halt",
    } as unknown as GateSpan;
    const clean = sanitizeGateSpan(gate) as unknown as Record<string, unknown>;
    expect(clean.fail_class).toBe("deploy-verify-halt");
    expect(FAIL_CLASSES).toContain(clean.fail_class);
    expect(new Set(Object.keys(clean))).toEqual(new Set(GATE_SPAN_FIELDS.filter((k) => k in gate)));
  });

  it("L2: every constrained field is a CLOSED enum (no free text), incl. an 'other'/'unknown' catch-all where a value may be novel", () => {
    // The enums exist and are non-empty closed sets , the emitter can only ship a
    // member (a novel value collapses to the catch-all, never a raw string).
    expect(ROLE_VALUES.length).toBeGreaterThan(0);
    expect(MODEL_VALUES).toContain("other"); // a model family the bucket does not know
    expect(EFFORT_VALUES).toContain("unknown");
    expect(TOKEN_BUCKET_VALUES.length).toBeGreaterThan(0);
    expect(FAIL_CLASSES).toContain("other"); // an uncategorized failure signature
  });
});
