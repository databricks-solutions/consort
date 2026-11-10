// Ephemeral verify DB: the build's verify forks a disposable child branch off
// the experiment branch, runs migrate + test against IT, and deletes it after,
// so the suite's migration up/down fixtures never corrupt the shared branch
// across runs (the F6/S3 contract-phase thrash). Hermetic: all Lakebase ops are
// injected.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  withEphemeralVerifyBranch,
  ephemeralVerifyBranchName,
} from "../../consort/smells/ephemeral-verify";
import { readProjectInstance, defaultRunVerify } from "../../consort/deploy/deploy";

describe("ephemeralVerifyBranchName", () => {
  it("produces a unique, sanitized child name under the experiment branch", () => {
    expect(ephemeralVerifyBranchName("experiment-s3-split-drop-old-exp1", "1234567")).toBe(
      "experiment-s3-split-drop-old-exp1-vrfy-1234567",
    );
  });
  it("sanitizes illegal characters", () => {
    expect(ephemeralVerifyBranchName("exp/weird name", "a.b")).toBe("exp-weird-name-vrfy-a-b");
  });

  it("caps at the Lakebase 63-char limit by truncating the prefix, never the -vrfy-<nonce> suffix", () => {
    // Regression: a 64-char child was silently truncated to 63 on create, then
    // looked up by the untruncated name -> "branch id not found".
    const longExp = "experiment-s3-reversible-down-migration-exp1"; // 44 chars
    const name = ephemeralVerifyBranchName(longExp, "0902519-ad2313"); // suffix pushes past 63
    expect(name.length).toBeLessThanOrEqual(63);
    // The unique suffix survives intact (uniqueness + identifiability); the
    // descriptive prefix is what gets trimmed.
    expect(name.endsWith("-vrfy-0902519-ad2313")).toBe(true);
    expect(name.startsWith("experiment-s3-reversible-down-migration")).toBe(true);
  });
});

describe("withEphemeralVerifyBranch", () => {
  it("forks a child, hands its DSN to run, and deletes it – in order", async () => {
    const calls: string[] = [];
    const result = await withEphemeralVerifyBranch(
      {
        instance: "proj-1",
        parentBranch: "experiment-s3-exp1",
        childName: "experiment-s3-exp1-vrfy-9",
        create: async (a) => {
          calls.push(`create ${a.branch} <- ${a.parentBranch} ttl=${a.ttl}`);
        },
        waitReady: async (a) => {
          calls.push(`wait ${a.branch}`);
        },
        resolveDsn: async (a) => {
          calls.push(`dsn ${a.branch}`);
          return "postgresql://child/db";
        },
        remove: async (a) => {
          calls.push(`delete ${a.branch}`);
        },
      },
      (childDsn) => {
        calls.push(`run ${childDsn}`);
        return childDsn === "postgresql://child/db";
      },
    );
    expect(result).toBe(true);
    expect(calls).toEqual([
      "create experiment-s3-exp1-vrfy-9 <- experiment-s3-exp1 ttl=3600s",
      "wait experiment-s3-exp1-vrfy-9",
      "dsn experiment-s3-exp1-vrfy-9",
      "run postgresql://child/db",
      "delete experiment-s3-exp1-vrfy-9",
    ]);
  });

  it("targets the app's CONFIGURED database on the child DSN (test-what-ships)", async () => {
    let seenDatabase: string | undefined = "unset";
    await withEphemeralVerifyBranch(
      {
        instance: "proj-1",
        parentBranch: "exp",
        childName: "exp-vrfy-db",
        database: "stockflow",
        create: async () => {},
        waitReady: async () => {},
        resolveDsn: async (a) => {
          seenDatabase = a.database; // the child DSN is resolved against the app's DB
          return "postgresql://child/stockflow";
        },
        remove: async () => {},
      },
      (childDsn) => childDsn.endsWith("/stockflow"),
    );
    expect(seenDatabase).toBe("stockflow");
  });

  it("leaves database undefined when the app declares none (substrate default applies)", async () => {
    let seenDatabase: string | undefined = "unset";
    await withEphemeralVerifyBranch(
      {
        instance: "proj-1",
        parentBranch: "exp",
        childName: "exp-vrfy-nodb",
        create: async () => {},
        waitReady: async () => {},
        resolveDsn: async (a) => {
          seenDatabase = a.database;
          return "postgresql://child/db";
        },
        remove: async () => {},
      },
      () => true,
    );
    expect(seenDatabase).toBeUndefined();
  });

  it("ALWAYS deletes the child even when run throws (and re-throws)", async () => {
    let deleted = false;
    await expect(
      withEphemeralVerifyBranch(
        {
          instance: "proj-1",
          parentBranch: "exp",
          childName: "exp-vrfy-1",
          create: async () => {},
          waitReady: async () => {},
          resolveDsn: async () => "postgresql://child/db",
          remove: async () => {
            deleted = true;
          },
        },
        () => {
          throw new Error("verify blew up");
        },
      ),
    ).rejects.toThrow("verify blew up");
    expect(deleted).toBe(true); // teardown ran despite the failure
  });

  it("never fails the verify because teardown failed (delete error swallowed)", async () => {
    const result = await withEphemeralVerifyBranch(
      {
        instance: "proj-1",
        parentBranch: "exp",
        childName: "exp-vrfy-2",
        create: async () => {},
        waitReady: async () => {},
        resolveDsn: async () => "postgresql://child/db",
        remove: async () => {
          throw new Error("delete failed (TTL will reap)");
        },
      },
      () => true,
    );
    expect(result).toBe(true); // run's result stands; the TTL is the backstop
  });
});

// readProjectInstance resolves the Lakebase instance the ephemeral fork needs. If it returns
// undefined the fork SILENTLY degrades to an in-place shared-branch run (rows accumulate; CI diverges),
// so it must fall back from .env to the authoritative SCM workflow state rather than give up.
describe("readProjectInstance (ephemeral-verify instance resolution)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "instance-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("reads LAKEBASE_PROJECT_ID from .env (primary)", () => {
    writeFileSync(join(dir, ".env"), "FOO=1\nLAKEBASE_PROJECT_ID=proj-from-env\nBAR=2\n");
    expect(readProjectInstance(dir)).toBe("proj-from-env");
  });

  it("FALLS BACK to .lakebase/workflow-state.json project_id when .env lacks LAKEBASE_PROJECT_ID (the fix)", () => {
    writeFileSync(join(dir, ".env"), "LAKEBASE_HOST=h\n"); // no LAKEBASE_PROJECT_ID
    mkdirSync(join(dir, ".lakebase"), { recursive: true });
    writeFileSync(join(dir, ".lakebase", "workflow-state.json"), JSON.stringify({ project_id: "proj-from-scm" }));
    expect(readProjectInstance(dir)).toBe("proj-from-scm");
  });

  it("also falls back when there is no .env at all", () => {
    mkdirSync(join(dir, ".lakebase"), { recursive: true });
    writeFileSync(join(dir, ".lakebase", "workflow-state.json"), JSON.stringify({ project_id: "proj-scm-only" }));
    expect(readProjectInstance(dir)).toBe("proj-scm-only");
  });

  it("returns undefined only when NEITHER source has it (so the caller warns + runs in-place)", () => {
    writeFileSync(join(dir, ".env"), "LAKEBASE_HOST=h\n");
    mkdirSync(join(dir, ".lakebase"), { recursive: true });
    writeFileSync(join(dir, ".lakebase", "workflow-state.json"), JSON.stringify({ state: "scaffold-complete" }));
    expect(readProjectInstance(dir)).toBeUndefined();
  });
});

// A failed verify's captured output is consumed tail-first (failureOutput = slice(-4000)). The
// diagnostic FAIL summary (stdout) must survive that tail, not be buried under a flood of incidental
// stderr warnings (e.g. a client suite's hundreds of React-Router future-flag lines).
describe("defaultRunVerify keeps the diagnostic stdout at the tail (not buried under stderr noise)", () => {
  it("puts the FAIL summary (stdout) AFTER the stderr warning flood so a tail slice retains it", () => {
    // 400 stderr "warning" lines then a one-line stdout FAIL summary, exit 1.
    const cmd = `node -e "for(let i=0;i<400;i++)console.error('WARN future-flag noise line '+i);console.log('FAIL tests/x.test.tsx > the-real-assertion');process.exit(1)"`;
    const r = defaultRunVerify(cmd, process.cwd());
    expect(r.passed).toBe(false);
    const tail = r.output.split("\n").slice(-4000).join("\n").slice(-4000);
    expect(tail).toContain("the-real-assertion"); // the diagnostic survived
    // And it is at the END (stdout last), after the stderr noise.
    expect(r.output.trimEnd().endsWith("the-real-assertion")).toBe(true);
  });
});
