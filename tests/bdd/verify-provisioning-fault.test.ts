// BDD coverage for the DB-provisioning-fault route in the honest-GREEN path
// (issue #197): a verify that fails because the E2E app served an UNMIGRATED or
// unreachable database is an infra fault, not an app-code regression. The cycle
// runs ONE bounded fresh-boot re-verify (the harness never reuses a server), and:
//   - retry passes            -> the stale-reuse false-RED cleared; record green
//   - retry fails same way    -> escalate HIL with the provisioning diagnosis,
//                                never the driver repair loop
//   - retry fails differently -> the provisioning fault was masking a real
//                                failure; route the normal assess path

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  beginNextPendingCycle,
  greenOpenCycle,
  isProvisioningFaultSummary,
  type GreenVerifier,
} from "../../consort/pipeline/cycle-record.js";

const tmpDirs: string[] = [];
function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-provisioning-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
});

const F = "F2";
const S = "S3";
const writeJson = (file: string, obj: unknown): void => fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");

function scaffold(project: string): string {
  const tdd = path.join(project, ".sftdd");
  const acsDir = path.join(tdd, "features", F, "stories", S, "acs");
  fs.mkdirSync(acsDir, { recursive: true });
  writeJson(path.join(acsDir, "AC4.json"), { id: "AC4", layer: "E2E", text: "adjustment audit endpoints" });
  const items = [{ id: "T42", description: "audit endpoint e2e", ac_id: "AC4", status: "pending" }];
  writeJson(path.join(tdd, "features", F, "stories", S, "test-list-per-story.json"), { feature_id: F, story_id: S, items });
  writeJson(path.join(tdd, "features", F, "test-list.json"), { feature_id: F, items });
  const expDir = path.join(tdd, "experiments", F, S, "exp1");
  fs.mkdirSync(expDir, { recursive: true });
  fs.writeFileSync(path.join(expDir, "branch.txt"), "experiment-s3-exp1");
  writeJson(path.join(expDir, "outcomes.json"), { status: "running" });
  return tdd;
}

const PROVISIONING_500 =
  'POST /api/adjustment-audit -> 500 (sqlalchemy.exc.ProgrammingError: (psycopg.errors.UndefinedTable) relation "adjustment_audit" does not exist)';

function scriptedVerify(outcomes: Array<{ passed: boolean; summary: string }>): GreenVerifier {
  let i = 0;
  return async () => outcomes[Math.min(i++, outcomes.length - 1)];
}

describe("isProvisioningFaultSummary", () => {
  it("matches UndefinedTable / relation-does-not-exist / 42P01 / ECONNREFUSED", () => {
    expect(isProvisioningFaultSummary('psycopg.errors.UndefinedTable: relation "stock_records" does not exist')).toBe(true);
    expect(isProvisioningFaultSummary("psql: ERROR: 42P01: relation x does not exist")).toBe(true);
    expect(isProvisioningFaultSummary("Error: connect ECONNREFUSED 127.0.0.1:8000")).toBe(true);
  });
  it("does NOT match an ordinary assertion or an empty summary", () => {
    expect(isProvisioningFaultSummary("AssertionError: expected 200, got 418")).toBe(false);
    expect(isProvisioningFaultSummary(undefined)).toBe(false);
  });
});

describe("greenOpenCycle: DB-provisioning fault route (issue #197)", () => {
  it("a provisioning 500 that clears on the fresh-boot re-verify records GREEN", async () => {
    const tdd = scaffold(mkProject());
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    const r = await greenOpenCycle({
      consortDir: tdd,
      featureId: F,
      story: S,
      verify: scriptedVerify([
        { passed: false, summary: PROVISIONING_500 },
        { passed: true, summary: "all tests green (fresh boot)" },
      ]),
    });
    expect(r.recorded).toBe(true);
    expect(r.escalated).toBeFalsy();
  });

  it("a provisioning 500 that repeats on the re-verify escalates to the HIL, never the repair loop", async () => {
    const tdd = scaffold(mkProject());
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    const r = await greenOpenCycle({
      consortDir: tdd,
      featureId: F,
      story: S,
      verify: scriptedVerify([
        { passed: false, summary: PROVISIONING_500 },
        { passed: false, summary: PROVISIONING_500 },
      ]),
    });
    expect(r.recorded).toBe(false);
    expect(r.escalated).toBe(true);
    expect(r.escalation?.source).toBe("db-provisioning");
    expect(r.escalation?.reason).toMatch(/NOT an app-code regression/);
    expect(r.escalation?.reason).toMatch(/alembic upgrade head/);
    expect(r.needsAssess).toBeFalsy();
  });

  it("a provisioning 500 masking a REAL failure routes the normal assess path after the fresh boot", async () => {
    const tdd = scaffold(mkProject());
    beginNextPendingCycle({ consortDir: tdd, featureId: F, story: S });
    const r = await greenOpenCycle({
      consortDir: tdd,
      featureId: F,
      story: S,
      verify: scriptedVerify([
        { passed: false, summary: PROVISIONING_500 },
        { passed: false, summary: "AssertionError: expected 200, got 418" },
      ]),
    });
    expect(r.recorded).toBe(false);
    expect(r.escalated).toBeFalsy();
    expect(r.needsAssess).toBe(true);
  });
});
