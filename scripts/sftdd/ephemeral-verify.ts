// Ephemeral verify database (Lakebase branching as test isolation).
//
// The build's verify runs migrations + the test suite. When those tests carry
// migration up/down fixtures (a contract/cleanup story that DROPS a column ,
// F6/S3), running them against the SHARED experiment-branch DB leaves it in a
// half-migrated / idle-in-transaction state for the next run, and the Driver
// then grinds for ~an hour fighting the stateful DB instead of the feature (the
// "thrash" failure mode).
//
// Fix (the evolutionary-DB-design answer): fork a short-lived CHILD branch off
// the experiment branch, run migrate + test against the CHILD, then delete it.
// Each verify gets a pristine DB at the experiment branch's committed schema;
// the suite's up/down fixtures mutate a throwaway database that's discarded, so
// no run can corrupt the next. Lakebase branching makes the fork + teardown
// ~instant, so this is cheap per verify. The child also carries a TTL so a
// crashed run can't leak a branch (Lakebase reaps it).

import { LAKEBASE_BRANCH_NAME_MAX } from "@databricks-solutions/lakebase-scm-utils/util";
import { createBranch } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { deleteBranch } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { getConnection, waitForBranchAuthReady } from "@databricks-solutions/lakebase-scm-utils/lakebase";

/** Lakebase TTL for the disposable child: a backstop reaper, not the primary
 *  cleanup (we delete it in `finally`). 1h covers the slowest single verify. */
export const EPHEMERAL_VERIFY_TTL = "3600s";

export interface EphemeralVerifyBranchArgs {
  /** Lakebase project id. */
  instance: string;
  /** The experiment branch to fork the disposable child from. */
  parentBranch: string;
  /** Unique child branch name (caller supplies a per-run nonce, below). */
  childName: string;
  /** Lakebase TTL ("<seconds>s"); defaults to EPHEMERAL_VERIFY_TTL. */
  ttl?: string;
  /**
   * The database the app is CONFIGURED to connect to (from the project's .env).
   * The child DSN targets THIS database, so the verify runs against the same DB
   * the app ships against , not a silent `databricks_postgres` fallback. When a
   * feature is misconfigured to a database the substrate never provisioned, the
   * verify connection fails and the gate catches it (test-what-ships). Omit to
   * use the substrate default (`databricks_postgres`).
   */
  database?: string;
  // ── injection seams (hermetic tests) ─────────────────────────────────────
  create?: (a: { instance: string; branch: string; parentBranch: string; ttl: string }) => Promise<void>;
  waitReady?: (a: { instance: string; branch: string }) => Promise<void>;
  resolveDsn?: (a: { instance: string; branch: string; database?: string }) => Promise<string>;
  remove?: (a: { instance: string; branch: string }) => Promise<void>;
}

/**
 * Fork a disposable child off `parentBranch`, hand its DSN to `run`, and ALWAYS
 * delete the child afterwards (best-effort; the TTL is the backstop). The child
 * is forked at the parent's committed schema, so `run` (migrate + test) starts
 * from a clean, isolated database every time. Returns `run`'s result.
 */
export async function withEphemeralVerifyBranch<T>(
  args: EphemeralVerifyBranchArgs,
  run: (childDsn: string) => Promise<T> | T,
): Promise<T> {
  const ttl = args.ttl ?? EPHEMERAL_VERIFY_TTL;
  const create =
    args.create ??
    (async (a) => {
      await createBranch({ instance: a.instance, branch: a.branch, parentBranch: a.parentBranch, ttl: a.ttl });
    });
  const waitReady =
    args.waitReady ?? (async (a) => { await waitForBranchAuthReady({ instance: a.instance, branch: a.branch }); });
  const resolveDsn =
    args.resolveDsn ??
    (async (a) =>
      (await getConnection({ instance: a.instance, branch: a.branch, database: a.database, output: "dsn" })).url);
  const remove = args.remove ?? (async (a) => { await deleteBranch({ instance: a.instance, branch: a.branch }); });

  await create({ instance: args.instance, branch: args.childName, parentBranch: args.parentBranch, ttl });
  try {
    await waitReady({ instance: args.instance, branch: args.childName });
    const dsn = await resolveDsn({ instance: args.instance, branch: args.childName, database: args.database });
    return await run(dsn);
  } finally {
    // Never fail the verify on teardown , the TTL reaps a leaked child.
    try {
      await remove({ instance: args.instance, branch: args.childName });
    } catch {
      /* best-effort; Lakebase TTL is the backstop */
    }
  }
}

/**
 * Unique, sanitizable child-branch name for one verify run of an experiment
 * branch. The nonce (a per-run token the caller supplies) keeps concurrent or
 * back-to-back verifies from colliding on the name even if a prior child is
 * still being reaped.
 *
 * The result is capped at the Lakebase branch-name limit by truncating the
 * (descriptive) experiment prefix, NEVER the `-vrfy-<nonce>` suffix. An
 * over-limit name would be silently truncated on create, and the ephemeral flow
 * then looks the branch up by the untruncated name , "branch id not found".
 */
export function ephemeralVerifyBranchName(experimentBranch: string, nonce: string): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const suffix = `-vrfy-${clean(nonce)}`;
  const prefixBudget = Math.max(0, LAKEBASE_BRANCH_NAME_MAX - suffix.length);
  const prefix = clean(experimentBranch).slice(0, prefixBudget).replace(/-$/, "");
  return `${prefix}${suffix}`;
}
