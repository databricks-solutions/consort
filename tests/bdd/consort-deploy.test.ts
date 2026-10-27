// /deploy substrate: resolve a target from deploy-targets.yaml and, for
// type:local, start the app + poll until reachable. Remote types are refused.
// Hermetic: process start, reachability, and clock are all injected.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveDeployTarget,
  deployToTarget,
  ensureDeployedAndVerify,
  stopLocal,
  storyDeployVerified,
  logReleaseEngineerDeployStart,
  logReleaseEngineerDeployOutcome,
  defaultRunVerify,
  probeServingOk,
  resolveServeBaseUrl,
  type DeployResult,
} from "../../consort/deploy/deploy";
import { readEscalations } from "../../consort/gates/escalation";
import { readAgentLog } from "../../consort/logging/agent-log";
import {
  readDeployVerifyAssessMarker,
  markDeployVerifyAssessed,
} from "../../consort/smells/deploy-verify-assess";

const TARGETS = [
  "targets:",
  "  local:",
  "    type: local",
  "    run: echo started",
  "    base_url: http://localhost:8000",
  "    health_path: /",
  "    ready_timeout_seconds: 5",
  "  localv:",
  "    type: local",
  "    run: echo started",
  "    base_url: http://localhost:8000",
  "    health_path: /",
  "    ready_timeout_seconds: 5",
  "    verify: run-feature-verify",
  "  localvm:",
  "    type: local",
  "    run: echo started",
  "    base_url: http://localhost:8000",
  "    health_path: /",
  "    ready_timeout_seconds: 5",
  "    verify: run-feature-verify",
  "    migrate: run-migrate",
  "  prod:",
  "    type: databricks-app",
  "    workspace_profile: x",
  "",
].join("\n");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "deploy-"));
  writeFileSync(join(dir, "deploy-targets.yaml"), TARGETS);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("resolveDeployTarget", () => {
  it("parses a local target", () => {
    const r = resolveDeployTarget(dir, "local");
    expect(r.kind).toBe("local");
    if (r.kind === "local") {
      expect(r.config.run).toBe("echo started");
      expect(r.config.baseUrl).toBe("http://localhost:8000");
      expect(r.config.readyTimeoutSeconds).toBe(5);
    }
  });

  it("reports a remote type as unsupported", () => {
    const r = resolveDeployTarget(dir, "prod");
    expect(r.kind).toBe("unsupported");
    if (r.kind === "unsupported") expect(r.type).toBe("databricks-app");
  });

  it("reports a missing target", () => {
    expect(resolveDeployTarget(dir, "nope").kind).toBe("missing");
  });

  it("reports a missing deploy-targets.yaml", () => {
    const empty = mkdtempSync(join(tmpdir(), "deploy-empty-"));
    expect(resolveDeployTarget(empty, "local").kind).toBe("missing");
    rmSync(empty, { recursive: true, force: true });
  });
});

describe("resolveServeBaseUrl: relocate off a busy port instead of halting", () => {
  it("keeps the configured port when it is free", async () => {
    const probe = async () => false; // nothing answers → free
    expect(await resolveServeBaseUrl("http://localhost:8000", probe)).toEqual({
      baseUrl: "http://localhost:8000",
      port: 8000,
    });
  });

  it("bumps to the first free port when the configured one is foreign-held", async () => {
    const probe = async (url: string) => url.includes(":8000"); // :8000 answers, :8001 free
    expect(await resolveServeBaseUrl("http://localhost:8000", probe)).toEqual({
      baseUrl: "http://localhost:8001",
      port: 8001,
    });
  });

  it("falls back to the configured port when nothing nearby is free (caller then refuses)", async () => {
    const probe = async () => true; // everything busy
    expect(await resolveServeBaseUrl("http://localhost:8000", probe)).toEqual({
      baseUrl: "http://localhost:8000",
      port: 8000,
    });
  });
});

describe("deployToTarget: foreign-port guard (gate deploys)", () => {
  it("refuses + escalates when the port is already serving before deploy (rejectForeignPort)", async () => {
    const consortDir = join(dir, ".tdd");
    mkdirSync(join(consortDir, "features", "F1"), { recursive: true });
    let started = false;
    const result = await deployToTarget({
      projectDir: dir,
      targetName: "localv",
      featureId: "F1",
      storyId: "S1",
      lakebaseBranch: "experiment-s1",
      consortDir,
      rejectForeignPort: true,
      reachable: async () => true, // a foreign/stale app stays on the port (stop does not free it)
      startProcess: () => {
        started = true;
        return 1;
      },
      runVerify: () => true,
      sleep: async () => {},
      now: (() => {
        // Fast-forward the self-heal re-probe clock so the genuinely-foreign
        // path reaches its timeout instantly (no 5s real-time spin).
        let t = 0;
        return () => new Date((t += 1000));
      })(),
    });
    expect(result.ok).toBe(false);
    expect(started).toBe(false); // never started our app onto a busy port
    expect(result.reason).toMatch(/already serving|foreign|stale/i);
    // honest evidence: reachable=false, verify failed (we did NOT verify the foreign app).
    const ev = JSON.parse(
      readFileSync(join(consortDir, "features", "F1", "stories", "S1", "deploy-evidence.json"), "utf8"),
    );
    expect(ev.reachable).toBe(false);
    expect(ev.verify.passed).toBe(false);
    // and it raised an escalation for the HIL (deploy-verify source).
    const escs = readEscalations(consortDir).filter((e) => !e.resolved_at);
    expect(escs.some((e) => e.source === "deploy-verify" && e.story_id === "S1")).toBe(true);
  });

  it("self-heals: stops OUR own prior instance on the port, then deploys cleanly (no escalation)", async () => {
    // The per-story await-acceptance deploy leaves our app running on the port
    // for PO review; a re-issued gate deploy must stop that own instance and
    // proceed, NOT refuse it as foreign.
    const consortDir = join(dir, ".tdd");
    mkdirSync(join(consortDir, "features", "F1", "stories", "S1"), { recursive: true });
    let occupied = true; // our own prior app is on the port...
    let stopped = false;
    let started = false;
    const result = await deployToTarget({
      projectDir: dir,
      targetName: "localv",
      featureId: "F1",
      storyId: "S1",
      consortDir,
      rejectForeignPort: true,
      reachable: async () => (started ? true : occupied), // busy until stopped; up once we start
      stop: () => {
        stopped = true;
        occupied = false; // ...stopping it frees the port
      },
      startProcess: () => {
        started = true;
        return 4321;
      },
      runVerify: () => true,
      sleep: async () => {},
      now: () => new Date(),
    });
    expect(stopped).toBe(true); // we stopped our own instance first
    expect(started).toBe(true); // and then deployed cleanly onto the freed port
    expect(result.ok).toBe(true);
    expect(result.verify?.passed).toBe(true);
    // no escalation: this was OUR app, self-healed, not a foreign squatter.
    const escs = readEscalations(consortDir).filter((e) => !e.resolved_at);
    expect(escs.some((e) => e.source === "deploy-verify")).toBe(false);
  });

  it("does NOT guard when rejectForeignPort is unset (per-cycle reuse path is unaffected)", async () => {
    const result = await deployToTarget({
      projectDir: dir,
      targetName: "local",
      startProcess: () => 4242,
      reachable: async () => true, // already reachable, but no guard -> proceeds + ok
      sleep: async () => {},
      now: () => new Date(),
    });
    expect(result.ok).toBe(true);
  });
});

describe("deployToTarget: pre-serve migrate the deployed branch (gate deploys)", () => {
  it("migrates the bound experiment branch BEFORE starting the app", async () => {
    // The honest-GREEN verify migrates a DISPOSABLE child branch, never the
    // experiment branch itself; without a pre-serve migrate the PO-review app is
    // served against an unmigrated schema and 500s. Assert migrate runs first,
    // bound to the experiment branch, and BEFORE the app starts.
    const order: string[] = [];
    let migrateEnv: NodeJS.ProcessEnv | undefined;
    const result = await deployToTarget({
      projectDir: dir,
      targetName: "localvm",
      featureId: "F1",
      storyId: "S1",
      lakebaseBranch: "experiment-s1",
      consortDir: join(dir, ".tdd"),
      rejectForeignPort: true,
      reachable: async () => false, // port free before deploy; app up after start
      runVerify: (cmd, _cwd, env) => {
        order.push(cmd);
        if (cmd === "run-migrate") migrateEnv = env;
        return true;
      },
      startProcess: () => {
        order.push("start");
        return 7;
      },
      servingOk: async () => true, // app serves non-5xx once started
      sleep: async () => {},
      now: () => new Date(),
    });
    expect(result.ok).toBe(true);
    // migrate ran first, then the app started (before verify)
    expect(order[0]).toBe("run-migrate");
    expect(order.indexOf("run-migrate")).toBeLessThan(order.indexOf("start"));
    // migrate was bound to the experiment branch the app serves
    expect(migrateEnv?.LAKEBASE_BRANCH_ID).toBe("experiment-s1");
  });

  it("refuses + escalates when the pre-serve migrate FAILS (no app started, honest evidence)", async () => {
    const consortDir = join(dir, ".tdd");
    mkdirSync(join(consortDir, "features", "F1", "stories", "S1"), { recursive: true });
    let started = false;
    const result = await deployToTarget({
      projectDir: dir,
      targetName: "localvm",
      featureId: "F1",
      storyId: "S1",
      lakebaseBranch: "experiment-s1",
      consortDir,
      rejectForeignPort: true,
      reachable: async () => false,
      runVerify: (cmd) => (cmd === "run-migrate" ? { passed: false, output: "alembic: target database is not up to date" } : true),
      startProcess: () => {
        started = true;
        return 7;
      },
      servingOk: async () => true,
      sleep: async () => {},
      now: () => new Date(),
    });
    expect(result.ok).toBe(false);
    expect(started).toBe(false); // never served an unmigrated app
    expect(result.reason).toMatch(/migrate FAILED|refusing to serve/i);
    const ev = JSON.parse(
      readFileSync(join(consortDir, "features", "F1", "stories", "S1", "deploy-evidence.json"), "utf8"),
    );
    expect(ev.reachable).toBe(false);
    expect(ev.verify.passed).toBe(false);
    const escs = readEscalations(consortDir).filter((e) => !e.resolved_at);
    expect(escs.some((e) => e.source === "deploy-verify" && e.story_id === "S1")).toBe(true);
  });

  it("does NOT migrate a feature deploy (no experiment branch bound)", async () => {
    const ran: string[] = [];
    await deployToTarget({
      projectDir: dir,
      targetName: "localvm",
      featureId: "F1",
      rejectForeignPort: true,
      reachable: async () => false,
      runVerify: (cmd) => {
        ran.push(cmd);
        return true;
      },
      startProcess: () => 7,
      servingOk: async () => true,
      sleep: async () => {},
      now: () => new Date(),
    });
    expect(ran).not.toContain("run-migrate"); // no lakebaseBranch -> no pre-serve migrate
  });
});

describe("deployToTarget: strict serving probe rejects a booted-but-5xx app (gate deploys)", () => {
  it("records reachable=false when the gate app answers 5xx (e.g. unmigrated-branch 500)", async () => {
    const consortDir = join(dir, ".tdd");
    mkdirSync(join(consortDir, "features", "F1", "stories", "S1"), { recursive: true });
    let t = 0;
    const result = await deployToTarget({
      projectDir: dir,
      targetName: "localv",
      featureId: "F1",
      storyId: "S1",
      lakebaseBranch: "experiment-s1",
      consortDir,
      rejectForeignPort: true,
      reachable: async () => false, // port free before deploy (foreign-port guard passes)
      servingOk: async () => false, // app boots but 500s on the health path -> NOT serving-ok
      startProcess: () => 7,
      runVerify: () => true,
      sleep: async () => {},
      now: () => new Date((t += 6000)), // fast-forward past the readiness timeout
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not reachable/);
    const ev = JSON.parse(
      readFileSync(join(consortDir, "features", "F1", "stories", "S1", "deploy-evidence.json"), "utf8"),
    );
    expect(ev.reachable).toBe(false);
  });

  it("probeServingOk: true on <500, false on 5xx", async () => {
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => ({ status: 200 })) as unknown as typeof fetch;
      expect(await probeServingOk("http://x/")).toBe(true);
      globalThis.fetch = (async () => ({ status: 404 })) as unknown as typeof fetch;
      expect(await probeServingOk("http://x/")).toBe(true); // up, just not that route
      globalThis.fetch = (async () => ({ status: 500 })) as unknown as typeof fetch;
      expect(await probeServingOk("http://x/")).toBe(false); // booted but broken
      globalThis.fetch = (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch;
      expect(await probeServingOk("http://x/")).toBe(false); // not up yet
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe("deployToTarget (local)", () => {
  // A clock that advances 200ms per read, well under the 5s timeout.
  function fastClock() {
    let t = 0;
    return () => new Date((t += 200));
  }

  it("starts the app, polls until reachable, records the pid", async () => {
    let calls = 0;
    const result = await deployToTarget({
      projectDir: dir,
      targetName: "local",
      startProcess: () => 4242,
      reachable: async () => ++calls >= 3, // up on the 3rd probe
      sleep: async () => {},
      now: fastClock(),
    });
    expect(result.ok).toBe(true);
    expect(result.pid).toBe(4242);
    expect(result.url).toBe("http://localhost:8000/");
    expect(existsSync(join(dir, ".consort", "deploy", "local.pid"))).toBe(true);
  });

  it("binds LAKEBASE_BRANCH_ID to the experiment branch for a per-story deploy", async () => {
    let seenEnv: NodeJS.ProcessEnv | undefined;
    const result = await deployToTarget({
      projectDir: dir,
      targetName: "local",
      lakebaseBranch: "exp/F1/S1-submit",
      startProcess: (_cmd, _cwd, env) => {
        seenEnv = env;
        return 4242;
      },
      reachable: async () => true,
      sleep: async () => {},
      now: fastClock(),
    });
    expect(result.ok).toBe(true);
    expect(seenEnv?.LAKEBASE_BRANCH_ID).toBe("exp/F1/S1-submit");
  });

  it("threads the serve port (BASE_URL/PORT) with no LAKEBASE_BRANCH_ID override for a feature deploy", async () => {
    let called = false;
    let envPassed: NodeJS.ProcessEnv | undefined;
    await deployToTarget({
      projectDir: dir,
      targetName: "local",
      startProcess: (_cmd, _cwd, env) => {
        called = true;
        envPassed = env;
        return 4242;
      },
      reachable: async () => true,
      sleep: async () => {},
      now: fastClock(),
    });
    expect(called).toBe(true);
    // A feature (per-sprint) deploy sets no branch override…
    expect(envPassed?.LAKEBASE_BRANCH_ID).toBeUndefined();
    // …but DOES thread the serve port, so the app, the health poll, and the verify's
    // Playwright (E2E + UX-adherence) all agree on one (possibly relocated) port.
    expect(envPassed?.BASE_URL).toBeTruthy();
    expect(envPassed?.PORT).toBeTruthy();
    expect(envPassed?.E2E_BACKEND_PORT).toBe(envPassed?.PORT);
  });

  it("fails when the app never becomes reachable (timeout)", async () => {
    // Clock jumps past the 5s budget so the poll times out quickly.
    let t = 0;
    const result = await deployToTarget({
      projectDir: dir,
      targetName: "local",
      startProcess: () => 4242,
      reachable: async () => false,
      sleep: async () => {},
      now: () => new Date((t += 6000)),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not reachable/);
  });

  it("refuses an unsupported target type without starting anything", async () => {
    let started = false;
    const result = await deployToTarget({
      projectDir: dir,
      targetName: "prod",
      startProcess: () => {
        started = true;
        return 1;
      },
      reachable: async () => true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/unsupported target type/);
    expect(started).toBe(false);
  });
});

describe("ensureDeployedAndVerify: GREEN-verify failure diagnostic", () => {
  function fastClock() {
    let t = 0;
    return () => new Date((t += 200));
  }

  it("enriches a verify FAILURE with the e2e-inline-regex-flag cause + file:line", async () => {
    // A project whose E2E test uses a Playwright matcher built from an inline-flag
    // regex – the exact un-greenable shape that raises to HIL with a generic message.
    mkdirSync(join(dir, "tests", "e2e"), { recursive: true });
    writeFileSync(
      join(dir, "tests", "e2e", "test_file_bug.py"),
      `import re\nexpect(e).to_contain_text(re.compile(r"(?i)summary"))\n`,
    );
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv", // has a verify command
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: () => false, // honest GREEN verify failed against the running app
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(false);
    expect(res.summary).toContain("e2e-inline-regex-flag");
    expect(res.summary).toContain("tests/e2e/test_file_bug.py:2");
    expect(res.summary).toMatch(/re\.IGNORECASE/);
  });

  it("leaves the generic message when a verify failure has no inline-flag regex", async () => {
    mkdirSync(join(dir, "tests", "e2e"), { recursive: true });
    writeFileSync(
      join(dir, "tests", "e2e", "test_ok.py"),
      `import re\nexpect(e).to_contain_text(re.compile("summary", re.IGNORECASE))\n`,
    );
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: () => false,
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(false);
    expect(res.summary).toBe("GREEN verify FAILED against the running app");
  });

  it("does not run the lint on a PASSING verify", async () => {
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: () => true,
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(true);
    expect(res.summary).toBe("GREEN verify passed against the running app");
  });
});

describe("deployToTarget: deploy-verify self-heal (contamination classify + one-shot bound)", () => {
  function fastClock() {
    let t = 0;
    return () => new Date((t += 200));
  }
  // A verify that FAILS the full feature suite (reporting a FAILED node-id) but
  // PASSES when re-run in isolation (the classifier appends the node-id): the
  // shared-state contamination signature. projectDir has no project-instance file,
  // so runVerifyMaybeEphemeral verifies IN PLACE (no ephemeral fork – hermetic).
  const contaminated = (cmd: string) =>
    cmd.includes("::") ? { passed: true } : { passed: false, output: "FAILED tests/x.py::t1\n" };

  function baseArgs(consortDir: string) {
    return {
      projectDir: dir,
      targetName: "localv",
      featureId: "F1",
      storyId: "S1",
      lakebaseBranch: "experiment-s1",
      consortDir,
      startProcess: () => 1,
      reachable: async () => true,
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    };
  }

  it("classifies contamination -> writes the one-shot marker + SUPPRESSES the escalation (self-heal, no HIL)", async () => {
    const consortDir = join(dir, ".tdd");
    mkdirSync(join(consortDir, "features", "F1", "stories", "S1"), { recursive: true });

    await deployToTarget({ ...baseArgs(consortDir), runVerify: contaminated });

    // The fragile test is recorded for the Navigator assess turn ...
    expect(readDeployVerifyAssessMarker(consortDir, "F1", "S1")?.failing_node_ids).toEqual(["tests/x.py::t1"]);
    // ... and the terminal deploy-verify escalation was NOT written (no premature HIL).
    const escs = readEscalations(consortDir).filter((e) => !e.resolved_at && e.source === "deploy-verify");
    expect(escs).toHaveLength(0);
  });

  it("one-shot: after the assess turn is spent, a repeat contamination failure ESCALATES (spin closed)", async () => {
    const consortDir = join(dir, ".tdd");
    mkdirSync(join(consortDir, "features", "F1", "stories", "S1"), { recursive: true });

    // First failed deploy -> marker (suppressed). Then the assess turn ran.
    await deployToTarget({ ...baseArgs(consortDir), runVerify: contaminated });
    markDeployVerifyAssessed(consortDir, "F1", "S1", ["tests/x.py::t1"]);

    // The scope did not fix it: a SECOND deploy still fails as contamination. The
    // one shot is spent, so it is NOT re-suppressed – it escalates to the HIL.
    await deployToTarget({ ...baseArgs(consortDir), runVerify: contaminated });
    const escs = readEscalations(consortDir).filter((e) => !e.resolved_at && e.source === "deploy-verify");
    expect(escs.length).toBeGreaterThan(0);
  });

  it("clears the marker when the re-verify PASSES (the scope worked -> proceed to accept)", async () => {
    const consortDir = join(dir, ".tdd");
    mkdirSync(join(consortDir, "features", "F1", "stories", "S1"), { recursive: true });

    await deployToTarget({ ...baseArgs(consortDir), runVerify: contaminated });
    expect(readDeployVerifyAssessMarker(consortDir, "F1", "S1")).toBeDefined();

    // The Driver scoped the tests; the re-deploy now verifies clean.
    await deployToTarget({ ...baseArgs(consortDir), runVerify: () => true });
    expect(readDeployVerifyAssessMarker(consortDir, "F1", "S1")).toBeUndefined();
  });

  // ── FEATURE-SHIP scope: the same self-heal, no storyId (the F1-ship halt) ──
  function featureShipArgs(consortDir: string) {
    // The feature-ship deploy binds to the FEATURE branch (its fork parent for
    // the isolation re-run), and carries NO storyId. Before the fix this path
    // skipped the classifier entirely and hard-raised to HIL.
    return {
      projectDir: dir,
      targetName: "localv",
      featureId: "F1",
      lakebaseBranch: "feature-f1", // the feature branch = fork parent
      consortDir,
      startProcess: () => 1,
      reachable: async () => true,
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    };
  }

  it("feature-ship: classifies contamination -> writes the FEATURE-scope marker + SUPPRESSES the HIL", async () => {
    const consortDir = join(dir, ".tdd");
    mkdirSync(join(consortDir, "features", "F1"), { recursive: true });

    await deployToTarget({ ...featureShipArgs(consortDir), runVerify: contaminated });

    // Feature-scope marker (storyId undefined), NOT a story marker.
    expect(readDeployVerifyAssessMarker(consortDir, "F1")?.failing_node_ids).toEqual(["tests/x.py::t1"]);
    const escs = readEscalations(consortDir).filter((e) => !e.resolved_at && e.source === "deploy-verify");
    expect(escs).toHaveLength(0);
  });

  it("feature-ship one-shot: a repeat contamination failure after the assess is spent ESCALATES", async () => {
    const consortDir = join(dir, ".tdd");
    mkdirSync(join(consortDir, "features", "F1"), { recursive: true });

    await deployToTarget({ ...featureShipArgs(consortDir), runVerify: contaminated });
    markDeployVerifyAssessed(consortDir, "F1", undefined, ["tests/x.py::t1"]);

    await deployToTarget({ ...featureShipArgs(consortDir), runVerify: contaminated });
    const escs = readEscalations(consortDir).filter((e) => !e.resolved_at && e.source === "deploy-verify");
    expect(escs.length).toBeGreaterThan(0);
  });

  it("feature-ship: clears the FEATURE marker when the re-verify PASSES", async () => {
    const consortDir = join(dir, ".tdd");
    mkdirSync(join(consortDir, "features", "F1"), { recursive: true });

    await deployToTarget({ ...featureShipArgs(consortDir), runVerify: contaminated });
    expect(readDeployVerifyAssessMarker(consortDir, "F1")).toBeDefined();

    await deployToTarget({ ...featureShipArgs(consortDir), runVerify: () => true });
    expect(readDeployVerifyAssessMarker(consortDir, "F1")).toBeUndefined();
  });
});

describe("stopLocal", () => {
  it("removes the pid file (best-effort kill)", async () => {
    await deployToTarget({
      projectDir: dir,
      targetName: "local",
      startProcess: () => 999999, // nonexistent pid; kill is caught
      reachable: async () => true,
      sleep: async () => {},
      now: (() => { let t = 0; return () => new Date((t += 100)); })(),
    });
    expect(existsSync(join(dir, ".consort", "deploy", "local.pid"))).toBe(true);
    expect(stopLocal(dir, "local").stopped).toBe(true);
    expect(existsSync(join(dir, ".consort", "deploy", "local.pid"))).toBe(false);
  });

  it("reports nothing to stop when no pid file exists", () => {
    expect(stopLocal(dir, "local").stopped).toBe(false);
  });
});

describe("defaultRunVerify: bounded timeout (a wedged verify FAILS the pass, never hangs)", () => {
  // The 4.5h driver-sweep stall: a green-cycle verify subprocess (pytest + client build / app server)
  // hung and execSync waited forever. defaultRunVerify now passes a `timeout` so a wedged pass is killed
  // (SIGTERM) + returned as passed:false with a clear reason – the caller's finally then stops the app.
  const prev = process.env.LAKEBASE_VERIFY_TIMEOUT_MS;
  afterEach(() => { if (prev === undefined) delete process.env.LAKEBASE_VERIFY_TIMEOUT_MS; else process.env.LAKEBASE_VERIFY_TIMEOUT_MS = prev; });

  it("a command exceeding the timeout returns passed:false + names the timeout (not a hang)", () => {
    process.env.LAKEBASE_VERIFY_TIMEOUT_MS = "400"; // 0.4s bound
    const t0 = Date.now();
    const r = defaultRunVerify("sleep 30", dir); // would hang 30s without the bound
    const elapsed = Date.now() - t0;
    expect(r.passed).toBe(false);
    expect(r.output).toMatch(/TIMED OUT/i);
    expect(elapsed).toBeLessThan(5000); // killed at ~0.4s, nowhere near 30s – proves it did not hang
  });

  it("a fast passing command still returns passed:true (timeout does not false-fail a quick verify)", () => {
    process.env.LAKEBASE_VERIFY_TIMEOUT_MS = "10000";
    const r = defaultRunVerify("true", dir);
    expect(r.passed).toBe(true);
  });
});

describe("deployToTarget: deploy-evidence.json (deploy gate artifact)", () => {
  const FEATURE = "F1-initial-domain";
  function fastClock() {
    let t = 0;
    return () => new Date((t += 200));
  }
  function featureDir(root: string): string {
    return join(root, ".tdd", "features", FEATURE);
  }
  function readEvidence(root: string): Record<string, unknown> {
    return JSON.parse(require("node:fs").readFileSync(join(featureDir(root), "deploy-evidence.json"), "utf8"));
  }

  beforeEach(() => mkdirSync(featureDir(dir), { recursive: true }));

  it("writes reachable=true + verify.passed=true when the feature-verify exits 0", async () => {
    const result = await deployToTarget({
      projectDir: dir, targetName: "localv", featureId: FEATURE,
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: () => true,
      sleep: async () => {}, now: fastClock(),
    });
    expect(result.ok).toBe(true);
    expect(result.verify?.passed).toBe(true);
    expect(result.evidencePath).toBeDefined();
    const ev = readEvidence(dir);
    expect(ev.reachable).toBe(true);
    expect((ev.verify as { passed: boolean }).passed).toBe(true);
    expect(ev.target).toBe("localv");
    expect(ev.feature_id).toBe(FEATURE);
  });

  it("records verify.passed=false when the feature-verify fails", async () => {
    const result = await deployToTarget({
      projectDir: dir, targetName: "localv", featureId: FEATURE,
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: () => false,
      sleep: async () => {}, now: fastClock(),
    });
    expect(result.ok).toBe(true); // reachable, but verify failed
    expect(result.verify?.passed).toBe(false);
    expect((readEvidence(dir).verify as { passed: boolean }).passed).toBe(false);
  });

  it("records reachable=false in the evidence when the app never comes up", async () => {
    let t = 0;
    const result = await deployToTarget({
      projectDir: dir, targetName: "localv", featureId: FEATURE,
      startProcess: () => 4242,
      reachable: async () => false,
      runVerify: () => true,
      sleep: async () => {}, now: () => new Date((t += 6000)),
    });
    expect(result.ok).toBe(false);
    const ev = readEvidence(dir);
    expect(ev.reachable).toBe(false);
    expect((ev.verify as { passed: boolean }).passed).toBe(false); // verify not run when unreachable
  });

  it("writes NO evidence for a feature-less deploy", async () => {
    const result = await deployToTarget({
      projectDir: dir, targetName: "localv",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: () => true,
      sleep: async () => {}, now: fastClock(),
    });
    expect(result.ok).toBe(true);
    expect(result.evidencePath).toBeUndefined();
  });
});

describe("deployToTarget: STORY-scoped deploy evidence + storyDeployVerified", () => {
  const FEATURE = "F1-initial-domain";
  const STORY = "S1-submit";
  function fastClock() {
    let t = 0;
    return () => new Date((t += 200));
  }
  function featureDir(root: string): string {
    return join(root, ".tdd", "features", FEATURE);
  }
  beforeEach(() => mkdirSync(join(featureDir(dir), "stories", STORY), { recursive: true }));

  it("writes evidence at story scope + storyDeployVerified is true when reachable + verify pass", async () => {
    const result = await deployToTarget({
      projectDir: dir, targetName: "localv", featureId: FEATURE, storyId: STORY,
      lakebaseBranch: "exp/F1/S1",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: () => true,
      sleep: async () => {}, now: fastClock(),
    });
    expect(result.ok).toBe(true);
    // Evidence is under the STORY dir, not the feature dir.
    expect(result.evidencePath).toBe(join(featureDir(dir), "stories", STORY, "deploy-evidence.json"));
    expect(existsSync(join(featureDir(dir), "deploy-evidence.json"))).toBe(false);
    expect(storyDeployVerified(join(dir, ".tdd"), FEATURE, STORY)).toBe(true);
  });

  it("storyDeployVerified is false when the story verify failed", async () => {
    await deployToTarget({
      projectDir: dir, targetName: "localv", featureId: FEATURE, storyId: STORY,
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: () => false,
      sleep: async () => {}, now: fastClock(),
    });
    expect(storyDeployVerified(join(dir, ".tdd"), FEATURE, STORY)).toBe(false);
  });

  it("storyDeployVerified is false when no story evidence exists", () => {
    expect(storyDeployVerified(join(dir, ".tdd"), FEATURE, STORY)).toBe(false);
  });
});

describe("Release Engineer deploy lifecycle -> central agent log", () => {
  let tdd: string;
  const FEATURE = "F1-file-bug";
  const STORY = "S1-create-bug";
  const clock = () => new Date("2026-06-09T19:38:20.000Z");
  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "re-deploylog-"));
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  it("emits release-engineer deploy.start + deploy.verified + phase.end for a successful deploy", () => {
    const ctx = { featureId: FEATURE, storyId: STORY, target: "local", consortDir: tdd, now: clock };
    logReleaseEngineerDeployStart(ctx);
    const ok: DeployResult = { ok: true, url: "http://localhost:8000/", pid: 123, verify: { passed: true, summary: "feature-verify passed" } };
    logReleaseEngineerDeployOutcome(ctx, ok);

    const re = readAgentLog({ consortDir: tdd }).filter((e) => e.role === "release-engineer");
    expect(re.map((e) => e.event)).toEqual(["deploy.start", "deploy.verified", "phase.end"]);
    const verified = re.find((e) => e.event === "deploy.verified")!;
    expect(verified.metadata?.feature_id).toBe(FEATURE);
    expect(verified.metadata?.story).toBe(STORY);
    expect(verified.metadata?.url).toBe("http://localhost:8000/");
    expect(verified.metadata?.reachable).toBe(true);
    expect(verified.metadata?.verify_passed).toBe(true);
    expect(re.every((e) => e.role === "release-engineer")).toBe(true);
  });

  it("emits a deploy.failed (error) + phase.end for a failed deploy, carrying the reason", () => {
    const ctx = { featureId: FEATURE, storyId: STORY, target: "local", consortDir: tdd, now: clock };
    const bad: DeployResult = { ok: false, reason: "not reachable within timeout", verify: { passed: false, summary: "n/a" } };
    logReleaseEngineerDeployOutcome(ctx, bad);

    const re = readAgentLog({ consortDir: tdd }).filter((e) => e.role === "release-engineer");
    expect(re.map((e) => e.event)).toEqual(["deploy.failed", "phase.end"]);
    const failed = re.find((e) => e.event === "deploy.failed")!;
    expect(failed.level).toBe("error");
    expect(String(failed.metadata?.reason)).toMatch(/not reachable/);
  });
});

describe("ensureDeployedAndVerify: migration-isolation two-pass (Python)", () => {
  function fastClock() {
    let t = 0;
    return () => new Date((t += 200));
  }

  it("runs the main (not migration) pass then the migration pass on separate branches", async () => {
    writeFileSync(join(dir, "pyproject.toml"), "[project]\nname = 'x'\n");
    const markers: string[] = [];
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: (_cmd, _cwd, env) => {
        markers.push(env?.SFTDD_PYTEST_MARKER ?? "<unset>");
        return true;
      },
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(true);
    expect(markers).toEqual(["not migration", "migration"]);
  });

  it("surfaces a migration-pass failure distinctly", async () => {
    writeFileSync(join(dir, "pyproject.toml"), "[project]\nname = 'x'\n");
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: (_cmd, _cwd, env) => env?.SFTDD_PYTEST_MARKER !== "migration",
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(false);
    expect(res.summary).toMatch(/migration pass/i);
  });

  it("skips the migration pass when the main pass already failed", async () => {
    writeFileSync(join(dir, "pyproject.toml"), "[project]\nname = 'x'\n");
    const markers: string[] = [];
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: (_cmd, _cwd, env) => {
        markers.push(env?.SFTDD_PYTEST_MARKER ?? "<unset>");
        return false;
      },
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(false);
    expect(markers).toEqual(["not migration"]); // migration pass not attempted
  });

  it("TIERED: SKIPS the migration pass when the cycle touched no migration (cycleTouchedMigrations=false)", async () => {
    writeFileSync(join(dir, "pyproject.toml"), "[project]\nname = 'x'\n");
    const markers: string[] = [];
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      cycleTouchedMigrations: false, // a behavior/client cycle — no migration changed
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: (_cmd, _cwd, env) => {
        markers.push(env?.SFTDD_PYTEST_MARKER ?? "<unset>");
        return true;
      },
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(true);
    expect(markers).toEqual(["not migration"]); // migration pass skipped — the tiered optimization
  });

  it("TIERED: RUNS the migration pass when the cycle touched a migration (cycleTouchedMigrations=true)", async () => {
    writeFileSync(join(dir, "pyproject.toml"), "[project]\nname = 'x'\n");
    const markers: string[] = [];
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      cycleTouchedMigrations: true,
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: (_cmd, _cwd, env) => {
        markers.push(env?.SFTDD_PYTEST_MARKER ?? "<unset>");
        return true;
      },
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(true);
    expect(markers).toEqual(["not migration", "migration"]); // full pass, same as undefined (refactor/deploy)
  });

  it("SCOPE: threads storyTestIds to the verify as SFTDD_TEST_IDS (per-cycle scope); omits it when not given (full)", async () => {
    writeFileSync(join(dir, "pyproject.toml"), "[project]\nname = 'x'\n");
    // per-cycle GREEN: storyTestIds supplied -> the verify env carries SFTDD_TEST_IDS (conftest scopes to them)
    const scopedEnvs: (string | undefined)[] = [];
    await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      storyTestIds: ["T43", "T44", "T45"],
      cycleTouchedMigrations: false, // keep it to one pass for the assertion
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: (_cmd, _cwd, env) => {
        scopedEnvs.push(env?.SFTDD_TEST_IDS);
        return true;
      },
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(scopedEnvs.every((v) => v === "T43 T44 T45")).toBe(true); // scoped to the story's ids

    // refactor/deploy: no storyTestIds -> SFTDD_TEST_IDS unset -> the full cross-story suite runs
    const fullEnvs: (string | undefined)[] = [];
    await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      cycleTouchedMigrations: false,
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: (_cmd, _cwd, env) => {
        fullEnvs.push(env?.SFTDD_TEST_IDS);
        return true;
      },
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(fullEnvs.every((v) => v === undefined)).toBe(true); // unscoped => full suite
  });

  it("a non-Python project keeps ONE full pass (no marker split, no double run)", async () => {
    const markers: string[] = [];
    const res = await ensureDeployedAndVerify({
      projectDir: dir, // no pyproject.toml / requirements.txt
      targetName: "localv",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: (_cmd, _cwd, env) => {
        markers.push(env?.SFTDD_PYTEST_MARKER ?? "<unset>");
        return true;
      },
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(true);
    expect(markers).toEqual(["<unset>"]);
  });
});

// Finding 26 (FEIP-8051): the build honest-GREEN verify uses the marked pytest
// two-pass, which run-tests.sh short-circuits BEFORE its client Vitest block, so a
// Python + client scaffold never ran the client suite under build GREEN (only the
// deploy feature-verify, which runs unmarked, caught it). ensureDeployedAndVerify
// must run the client suite ONCE (SFTDD_CLIENT_ONLY) and refuse GREEN if it fails.
describe("ensureDeployedAndVerify: client Vitest pass on Python + client (Finding 26)", () => {
  function fastClock() {
    let t = 0;
    return () => new Date((t += 200));
  }
  function stagePythonClient(d: string): void {
    writeFileSync(join(d, "pyproject.toml"), "[project]\nname = 'x'\n");
    mkdirSync(join(d, "client"), { recursive: true });
    writeFileSync(join(d, "client", "package.json"), "{}\n");
  }

  it("runs a client-only pass after the two marked backend passes, and gates GREEN on it", async () => {
    stagePythonClient(dir);
    const calls: Array<{ marker: string; clientOnly: string }> = [];
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: (_cmd, _cwd, env) => {
        calls.push({
          marker: env?.SFTDD_PYTEST_MARKER ?? "<unset>",
          clientOnly: env?.SFTDD_CLIENT_ONLY ?? "<unset>",
        });
        return true;
      },
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(true);
    // two backend marker passes, then exactly one client-only pass (no marker).
    expect(calls.map((c) => c.marker)).toEqual(["not migration", "migration", "<unset>"]);
    expect(calls.filter((c) => c.clientOnly === "1")).toHaveLength(1);
    // the client pass carries NO pytest marker (it is not a backend pass).
    expect(calls.find((c) => c.clientOnly === "1")!.marker).toBe("<unset>");
  });

  it("refuses GREEN when the client suite FAILS even though the backend passed", async () => {
    stagePythonClient(dir);
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      startProcess: () => 4242,
      reachable: async () => true,
      // Backend (marked) passes; the client-only pass fails – the exact Finding 26 state.
      runVerify: (_cmd, _cwd, env) => env?.SFTDD_CLIENT_ONLY !== "1",
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(false);
    expect(res.summary).toMatch(/client/i);
  });

  it("does NOT run a client pass when there is no client/ workspace (back-compat)", async () => {
    writeFileSync(join(dir, "pyproject.toml"), "[project]\nname = 'x'\n"); // no client/
    const clientOnlySeen: string[] = [];
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: (_cmd, _cwd, env) => {
        if (env?.SFTDD_CLIENT_ONLY) clientOnlySeen.push(env.SFTDD_CLIENT_ONLY);
        return true;
      },
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(true);
    expect(clientOnlySeen).toEqual([]);
  });
});

// Per-cycle server SCOPE (waste elimination): the uvicorn serving app is needed ONLY for the client
// Vitest (real backend) + Playwright E2E — backend pytest is in-process. A per-cycle GREEN whose story
// has NO client/component/e2e test (storyHasClientTests=false) skips the server start/poll/stop AND the
// client pass, running the backend passes alone. Only for Python; only an explicit false skips.
describe("ensureDeployedAndVerify: backend-only server skip (storyHasClientTests=false)", () => {
  function fastClock() {
    let t = 0;
    return () => new Date((t += 200));
  }
  function stagePythonClient(d: string): void {
    writeFileSync(join(d, "pyproject.toml"), "[project]\nname = 'x'\n");
    mkdirSync(join(d, "client"), { recursive: true });
    writeFileSync(join(d, "client", "package.json"), "{}\n");
  }

  it("SKIPS the server start + the client pass for a pure backend story (no client/E2E tests)", async () => {
    stagePythonClient(dir); // a client/ workspace EXISTS, yet the story has no client test
    let started = 0;
    const clientOnlySeen: string[] = [];
    const markers: string[] = [];
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      storyHasClientTests: false, // pure backend/migration story
      cycleTouchedMigrations: false, // keep backend to one pass for the assertion
      startProcess: () => {
        started += 1;
        return 4242;
      },
      reachable: async () => true,
      runVerify: (_cmd, _cwd, env) => {
        markers.push(env?.SFTDD_PYTEST_MARKER ?? "<unset>");
        if (env?.SFTDD_CLIENT_ONLY) clientOnlySeen.push(env.SFTDD_CLIENT_ONLY);
        return true;
      },
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(true);
    expect(started).toBe(0); // server never started — backend is in-process
    expect(res.reachable).toBe(false); // no server to be reachable
    expect(res.summary).toMatch(/backend-only/i);
    expect(clientOnlySeen).toEqual([]); // the client pass was skipped
    expect(markers).toEqual(["not migration"]); // only the backend pass ran
  });

  it("STARTS the server + runs the client pass when the story HAS client tests (storyHasClientTests=true)", async () => {
    stagePythonClient(dir);
    let started = 0;
    const clientOnlySeen: string[] = [];
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      storyHasClientTests: true,
      cycleTouchedMigrations: false,
      startProcess: () => {
        started += 1;
        return 4242;
      },
      reachable: async () => true,
      runVerify: (_cmd, _cwd, env) => {
        if (env?.SFTDD_CLIENT_ONLY) clientOnlySeen.push(env.SFTDD_CLIENT_ONLY);
        return true;
      },
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(true);
    expect(started).toBe(1); // server started
    expect(res.reachable).toBe(true);
    expect(clientOnlySeen).toEqual(["1"]); // the client pass ran
  });

  it("IGNORES storyHasClientTests=false for a non-Python project (always starts the server)", async () => {
    // no pyproject.toml / requirements.txt — the backend-is-in-process assumption does not hold
    let started = 0;
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      storyHasClientTests: false,
      startProcess: () => {
        started += 1;
        return 4242;
      },
      reachable: async () => true,
      runVerify: () => true,
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(true);
    expect(started).toBe(1); // non-Python keeps the full serve + single pass
    expect(res.reachable).toBe(true);
  });
});

// The client-only pass runs the appended client Playwright E2E block, which boots a
// real backend against DATABASE_URL and exercises the DB. Run against the SHARED
// experiment branch, one build turn's e2e writes bleed into the next turn's verify
// (cross-run state on the shared branch), and a server started before a later story's
// migration serves a stale schema. So the client pass must ISOLATE on an ephemeral
// child branch – exactly like the two backend passes – not run in place. Guarded via
// the injectable verifyBranchOps seam (hermetic; no real Lakebase). Staging
// LAKEBASE_PROJECT_ID in .env makes readProjectInstance resolve an instance so the
// fork path is taken.
describe("ensureDeployedAndVerify: client E2E pass isolates on an ephemeral branch", () => {
  function fastClock() {
    let t = 0;
    return () => new Date((t += 200));
  }
  function stagePythonClientOnBranch(d: string): void {
    writeFileSync(join(d, "pyproject.toml"), "[project]\nname = 'x'\n");
    mkdirSync(join(d, "client"), { recursive: true });
    writeFileSync(join(d, "client", "package.json"), "{}\n");
    // readProjectInstance reads LAKEBASE_PROJECT_ID; readAppDatabaseName reads DATABASE_URL.
    writeFileSync(
      join(d, ".env"),
      "LAKEBASE_PROJECT_ID=proj-1\nDATABASE_URL=postgresql://u:p@h/stockflow\n",
    );
  }

  it("forks a child branch for the client pass (VERIFY_DATABASE_URL set), not just the backend passes", async () => {
    stagePythonClientOnBranch(dir);
    const created: string[] = [];
    const removed: string[] = [];
    // One record per runVerify invocation: which pass it was + the child DSN it ran against.
    const passes: Array<{ marker: string; clientOnly: string; verifyUrl: string }> = [];
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      lakebaseBranch: "experiment-s3-exp1",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: (_cmd, _cwd, env) => {
        passes.push({
          marker: env?.SFTDD_PYTEST_MARKER ?? "<unset>",
          clientOnly: env?.SFTDD_CLIENT_ONLY ?? "<unset>",
          verifyUrl: env?.VERIFY_DATABASE_URL ?? "<unset>",
        });
        return true;
      },
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
      // Hermetic Lakebase ops: record forks/teardowns, hand back a per-branch DSN.
      verifyBranchOps: {
        create: async (a) => {
          created.push(a.branch);
        },
        waitReady: async () => {},
        resolveDsn: async (a) => `postgresql://child/${a.branch}/${a.database}`,
        remove: async (a) => {
          removed.push(a.branch);
        },
      },
    });
    expect(res.passed).toBe(true);
    // Three passes: backend main, backend migration, then the client pass.
    expect(passes.map((p) => p.marker)).toEqual(["not migration", "migration", "<unset>"]);
    const clientPass = passes.find((p) => p.clientOnly === "1")!;
    expect(clientPass).toBeDefined();
    // THE GUARD: the client pass ran against a forked child DSN, not the shared branch.
    // Reverting the client pass to an in-place runVerify leaves this "<unset>".
    expect(clientPass.verifyUrl).not.toBe("<unset>");
    expect(clientPass.verifyUrl).toMatch(/^postgresql:\/\/child\/experiment-s3-exp1-vrfy-/);
    // Targets the app's CONFIGURED database (test-what-ships), not a fallback.
    expect(clientPass.verifyUrl).toMatch(/\/stockflow$/);
    // Every pass (backend main, backend migration, client) forked + tore down its OWN child.
    expect(created).toHaveLength(3);
    expect(removed.sort()).toEqual(created.sort());
    expect(created.every((b) => b.includes("-vrfy-"))).toBe(true);
    // The child the client pass ran against was one that was created AND removed (round-trip).
    const clientChild = clientPass.verifyUrl.split("/")[3];
    expect(created).toContain(clientChild);
    expect(removed).toContain(clientChild);
  });

  it("falls back to an in-place client pass when no experiment branch is bound (no fork)", async () => {
    stagePythonClientOnBranch(dir);
    const created: string[] = [];
    let clientVerifyUrl = "unset-sentinel";
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      // no lakebaseBranch – runVerifyMaybeEphemeral verifies in place.
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: (_cmd, _cwd, env) => {
        if (env?.SFTDD_CLIENT_ONLY === "1") clientVerifyUrl = env?.VERIFY_DATABASE_URL ?? "<unset>";
        return true;
      },
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
      verifyBranchOps: {
        create: async (a) => {
          created.push(a.branch);
        },
        waitReady: async () => {},
        resolveDsn: async () => "postgresql://child/db",
        remove: async () => {},
      },
    });
    expect(res.passed).toBe(true);
    expect(created).toEqual([]); // no branch bound – no fork on any pass
    expect(clientVerifyUrl).toBe("<unset>"); // client pass ran in place
  });
});

describe("deployToTarget: deploy-verify supersession self-heal ROUTER (hardened: observe -> carry -> adjudicate)", () => {
  const FEATURE = "F6-split";
  const STORY = "S3-contract-drop";
  // A failing verify that FAILS both in the full run AND in isolation (genuine-at-HEAD, the
  // supersession branch's precondition), carrying a REALISTIC observed error per test: a
  // dropped-column crash (superseded) + a live-data assertion mismatch (a would-be regression).
  const FAIL_OUTPUT = [
    "=== short test summary info ===",
    'FAILED tests/test_listing.py::test_index_shape - psycopg.errors.UndefinedColumn: column "tracking_code" does not exist',
    "FAILED tests/test_summary.py::test_rollup - assert 2 == 3",
    "=== 2 failed in 3.1s ===",
  ].join("\n");

  function setup(withDroppedColumn: boolean): string {
    const consortDir = join(dir, ".tdd");
    mkdirSync(join(consortDir, "features", FEATURE, "stories", STORY), { recursive: true });
    mkdirSync(join(dir, "tests"), { recursive: true });
    // test_listing REFERENCES the dropped column (stale); test_summary does NOT — under the OLD
    // all-or-nothing gate the non-column-ref failure forced the WHOLE set to a terminal HIL.
    writeFileSync(join(dir, "tests", "test_listing.py"), "def test_index_shape(row):\n    assert row.tracking_code is None\n");
    writeFileSync(join(dir, "tests", "test_summary.py"), "def test_rollup(client):\n    assert client.get('/api/summary').json()['n'] == 3\n");
    if (withDroppedColumn) {
      mkdirSync(join(dir, "alembic", "versions"), { recursive: true });
      writeFileSync(
        join(dir, "alembic", "versions", "0003_drop.py"),
        ["def upgrade():", "    op.drop_column('stock_records', 'tracking_code')", "", "def downgrade():", "    pass", ""].join("\n"),
      );
    }
    return consortDir;
  }

  it("routes the FULL failing set to the supersession assess AND carries the observed failure output", async () => {
    const consortDir = setup(true);
    const res = await deployToTarget({
      projectDir: dir,
      targetName: "localv",
      featureId: FEATURE,
      storyId: STORY,
      lakebaseBranch: "projects/p/branches/exp-s3",
      consortDir,
      reachable: async () => true, // readyProbe passes -> verify runs -> fails -> self-heal classifies
      startProcess: () => 7,
      runVerify: () => ({ passed: false, output: FAIL_OUTPUT }), // fails full AND in isolation => genuine-at-HEAD
      sleep: async () => {},
      now: () => new Date(),
    });
    expect(res.verify?.passed).toBe(false); // the full-feature verify failed (app deployed+reachable, so ok:true)
    const m = readDeployVerifyAssessMarker(consortDir, FEATURE, STORY);
    expect(m?.kind).toBe("supersession");
    // The WHOLE set is handed to the Navigator (the old gate dropped test_summary -> terminal HIL).
    expect(m?.failing_node_ids).toEqual([
      "tests/test_listing.py::test_index_shape",
      "tests/test_summary.py::test_rollup",
    ]);
    expect(m?.dropped_columns).toContain("tracking_code");
    // OBSERVE -> CARRY: the real runtime error travels to the assess so the Navigator adjudicates
    // superseded (column does not exist) vs genuine (assertion mismatch) from evidence, not a guess.
    expect(m?.failure_output).toContain('column "tracking_code" does not exist');
    expect(m?.failure_output).toContain("assert 2 == 3");
    expect(readEscalations(consortDir).some((e) => e.source === "deploy-verify")).toBe(false);
  });

  it("CONSERVATIVE: a genuine failure on a feature that drops NOTHING still takes the terminal escalation (no marker)", async () => {
    const consortDir = setup(false);
    const res = await deployToTarget({
      projectDir: dir,
      targetName: "localv",
      featureId: FEATURE,
      storyId: STORY,
      lakebaseBranch: "projects/p/branches/exp-s3",
      consortDir,
      reachable: async () => true,
      startProcess: () => 7,
      runVerify: () => ({ passed: false, output: FAIL_OUTPUT }),
      sleep: async () => {},
      now: () => new Date(),
    });
    expect(res.verify?.passed).toBe(false);
    expect(readDeployVerifyAssessMarker(consortDir, FEATURE, STORY)).toBeUndefined();
    expect(readEscalations(consortDir).some((e) => e.source === "deploy-verify")).toBe(true);
  });
});
