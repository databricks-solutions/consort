#!/usr/bin/env node
// consort-upgrade: upgrade a scaffolded project's kit to THIS (the invoking) kit's
// version – safely, even for a run that may be in flight.
//
// A run is a SEQUENCE of consort-drive processes with HITL gates between them, and the
// kit version is bound at each drive LAUNCH. So the ONE safe moment to upgrade is AT A
// STOP – between drive processes. This command:
//   1. QUIESCE-GATES – refuses unless no drive is provably running (--pid not alive) and
//      the run is at a clean stop (next.json awaiting_human / done / no run).
//   2. REFRESHES the kit cache to the target (so ./scripts/lk resolves it afterwards).
//   3. DUAL-PINS .lakebase/kit-ref.local (the run) + committed .lakebase/kit-ref (CI) to
//      the target IN LOCKSTEP, recording the prior pins to kit-ref.prev for rollback.
//   4. REFRESHES the scaffolded surface (agents + commands) from the target kit.
//   5. Hands back the RESUME + ROLLBACK commands. The next drive launch runs the target,
//      re-derives state from disk, and continues from the gate.
//
// Because it pins the project to the INVOKING kit, refreshing the surface from this kit's
// files (kitRoot) is always correct – invoke the NEW version's upgrade to adopt it, e.g.
//   LAKEBASE_KIT_REF=v0.3.42 ./scripts/lk --refresh
//   LAKEBASE_KIT_REF=v0.3.42 ./scripts/lk consort-upgrade --pid <drive-pid>
// Rollback (instant undo): ./scripts/lk consort-upgrade --rollback
//
// Exit: 0 = upgraded / rolled back; 2 = not safe (a drive is running / not at a stop);
//       1 = rollback had nothing to restore.

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveConsortDir } from "../../consort/config/consort-paths.js";
import { kitRoot, kitVersion } from "../../consort/config/kit-bin.js";
import { quiesceGate, pinBoth, rollbackPins, refreshSurface, commitRefreshedSurface } from "../../consort/lakebase/upgrade.js";
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";

interface Args {
  rollback: boolean;
  pid?: number;
  projectDir: string;
  consortDir?: string;
  skipRefresh: boolean;
}

function parse(argv: string[]): Args {
  const out: Args = { rollback: false, projectDir: process.cwd(), skipRefresh: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--rollback": out.rollback = true; break;
      case "--pid": out.pid = Number(argv[++i]); break;
      case "--project-dir": out.projectDir = argv[++i]; break;
      case "--tdd-dir": case "--consort-dir": out.consortDir = argv[++i]; break;
      case "--skip-refresh": out.skipRefresh = true; break;
      default: break;
    }
  }
  return out;
}

/** True iff a process with `pid` is currently alive (signal 0 probe). */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Is the run at a clean stop per next.json? awaiting_human OR done == a human-owned stop;
 *  a MISSING next.json == no run in flight (also safe). Only an autonomous mid-flight
 *  snapshot (awaiting_human false, not done) reads as NOT-at-a-stop. */
function readAtStop(consortDir: string): boolean {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(consortDir, "next.json"), "utf8")) as {
      awaiting_human?: boolean;
      primary_action?: { kind?: string };
    };
    return s.awaiting_human === true || s.primary_action?.kind === "done";
  } catch {
    return true; // no readable next.json => nothing in flight => at a stop
  }
}

async function main(): Promise<number> {
  const args = parse(process.argv.slice(2));
  const consortDir = args.consortDir ?? resolveConsortDir(args.projectDir);

  // Rollback: restore the pins recorded by the last upgrade – the instant undo.
  if (args.rollback) {
    const r = rollbackPins(args.projectDir);
    if (!r.restored) {
      process.stderr.write(`consort-upgrade: rollback – ${r.reason}\n`);
      return 1;
    }
    process.stdout.write(
      `consort-upgrade: ROLLED BACK – kit-ref.local=${r.local ?? "(unset)"} / kit-ref=${r.committed ?? "(unset)"}.\n` +
        `  Refresh the cache to the restored ref, then resume: \`./scripts/lk --refresh\` then re-run your drive command.\n`,
    );
    return 0;
  }

  const target = kitVersion();
  if (!target || target === "unknown") {
    process.stderr.write("consort-upgrade: cannot resolve the invoking kit's version – run this from a real kit (npx github:consort#<ver> or LAKEBASE_KIT_REF=<ver> ./scripts/lk).\n");
    return 2;
  }
  const ref = target.startsWith("v") ? target : `v${target}`;

  // 1. Quiesce-gate – NEVER swap the kit under a running drive.
  const pidAlive = args.pid !== undefined ? alive(args.pid) : null;
  const q = quiesceGate({ pidAlive, atStop: readAtStop(consortDir) });
  if (!q.safe) {
    process.stderr.write(`consort-upgrade: NOT SAFE to upgrade – ${q.reason}\n`);
    return 2;
  }
  if (pidAlive === null) process.stderr.write(`consort-upgrade: ${q.reason}\n`);

  // 2. Refresh the kit cache to the target so ./scripts/lk resolves it after the pin.
  //    Best-effort + bounded: the pin below still points the next drive at the target even
  //    if this fails (the operator can re-run `./scripts/lk --refresh`).
  if (!args.skipRefresh) {
    const lk = path.join(args.projectDir, "scripts", "lk");
    if (fs.existsSync(lk)) {
      process.stderr.write(`consort-upgrade: refreshing the kit cache to ${ref} ...\n`);
      const r = spawnSync(lk, ["--refresh"], {
        cwd: args.projectDir,
        stdio: "inherit",
        env: { ...process.env, LAKEBASE_KIT_REF: ref },
        timeout: 300_000,
      });
      if (r.status !== 0) {
        process.stderr.write(`consort-upgrade: cache refresh exited ${r.status ?? "(signal)"} – continuing; re-run \`./scripts/lk --refresh\` if a resume cannot resolve ${ref}.\n`);
      }
    }
  }

  // 3. Dual-pin (.local run pin + committed CI ref) in lockstep, recording prior for rollback.
  const pin = pinBoth(args.projectDir, ref);
  // 4. Refresh the scaffolded surface from THIS (the target) kit.
  const surf = refreshSurface(args.projectDir, kitRoot(), target);
  // 5. Commit the refreshed kit-owned surface so the tree is CLEAN. Without this, the refreshed
  //    tracked files (agents/commands/scripts/workflows/kit-ref) sit uncommitted and the run's
  //    NEXT experiment/feature fork refuses to fork a dirty tree – the mid-run-upgrade failure.
  const committed = commitRefreshedSurface(args.projectDir, ref, surf.rootFiles, surf.removedRootFiles);

  process.stdout.write(
    `consort-upgrade: UPGRADED to ${ref}.\n` +
      `  pins: .local ${pin.previousLocal ?? "(unset)"} -> ${ref}; committed ${pin.previousCommitted ?? "(unset)"} -> ${ref} (in lockstep, no drift).\n` +
      `  surface: ${surf.agents} agent(s) + ${surf.commands} command(s) + ${surf.scripts} script(s) + ${surf.workflows} CI workflow(s) refreshed from ${ref}${surf.e2e ? " + Playwright E2E block re-wired into run-tests.sh (deploy-verify runs the client E2E)" : ""} (the scm-utils scripts/lk shim + project config left as-is).\n` +
      `  committed: ${committed.committed ? `${committed.sha} – kit surface committed, tree clean for the next fork` : `nothing committed (${committed.reason}) – if the tree is dirty with kit files, commit them before the next fork`}.\n` +
      `  RESUME: run \`consort-next\` for the exact command, then re-run your drive – it runs ${ref}, re-derives state from disk, and continues from the gate.\n` +
      `  ROLLBACK (instant undo): \`./scripts/lk consort-upgrade --rollback\` then \`./scripts/lk --refresh\` (re-commit the restored surface if the next fork reports a dirty tree).\n`,
  );
  return 0;
}

if (isCliEntry(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
