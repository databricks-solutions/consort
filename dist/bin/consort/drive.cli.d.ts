#!/usr/bin/env node
import { W as WorkflowAction } from '../../workflow-vocabulary-DlQcuyGS.js';

/** Compose the interactive pause message for the planning `author-requests` step.
 *  NOTHING has been approved/committed, so this must never read as "complete".
 *  But the human's ACTION depends on disk state, and conflating the two is what
 *  makes this pause look like the orchestrator is "confused":
 *   - No `feature-request.md` yet   -> author them, then commit the backlog.
 *   - Requests ALREADY authored (staged first-project, or a prior propose turn)
 *     -> there is nothing to author; the human only COMMITS which of the existing
 *     requests are in this sprint. We branch on the real state and name the exact
 *     commit command (pre-filling the proposed features when planning proposed a
 *     set), so a pre-seeded backlog is never mislabeled as "author the requests".
 *  Pure (returns the string) so the branching is unit-testable off a fixture dir. */
declare function composeInputPause(action: WorkflowAction, sprint?: string, consortDir?: string): string;
/** Re-launch THIS drive in its own session (detached) and return immediately, so a
 *  long run survives the launching shell/turn ending. This is the durable fix for the
 *  "detached drive gets reaped between turns" failure: `nohup … &` is NOT enough on
 *  macOS – the harness SIGTERMs the launching tool call's whole PROCESS GROUP when it
 *  returns, and macOS has no `setsid` binary to escape it. Node's `spawn(detached:true)`
 *  DOES call setsid(2), putting the child in a NEW session + process group that the
 *  SIGTERM never reaches; `.unref()` frees the parent's event loop so we can exit now.
 *
 *  The child re-runs the exact same resolved bin (`process.argv[1]`, whatever the `lk`
 *  shim resolved) with `--detach` stripped, and self-tees its narration to
 *  `.consort/drive-live.log` (so `stdio: "ignore"` here loses nothing). We print the
 *  child PID + the poll-once watch command and exit 0. Returns the child pid, or null
 *  when spawning failed (caller then falls through to a normal in-process run). */
/** The pid file the ACTUAL drive process records for ITSELF (whatever layer
 *  launched it – lk shim, --detach parent, or a plain invocation), so
 *  `consort-drive --stop` always halts the real orchestrator, never a launcher
 *  (issue #204.3). */
declare function drivePidPath(consortDir: string): string;
/** Record THIS drive process's own pid. Written by the process that actually
 *  runs the loop (after the --detach re-launch), never by a launcher. */
declare function writeDrivePid(consortDir: string): void;
/** The pid the running drive recorded for itself in .consort/drive.pid, or null when the file is
 *  absent/unparseable. Shared by stopDrive and the single-drive mutex (assertSingleDrive). */
declare function readDrivePid(consortDir: string): number | null;
/** SINGLE-DRIVE MUTEX. A project has exactly ONE orchestrator: the drive dispatches role agents
 *  sequentially and each agent turn appends one entry to the SINGLE-WRITER turns/index.json ledger.
 *  Two drives racing that ledger straddle ordinals + corrupt the per-turn record audit (the exact
 *  failure a kill-and-relaunch-too-fast produces). Refuse to start when another drive's recorded pid
 *  is still ALIVE. A clean `consort-drive --stop` removes drive.pid; a crash leaves a DEAD pid
 *  (pidAlive=false) which we silently take over. Returns true when it is safe to proceed. Called by
 *  the REAL in-process orchestrator only (after the --detach re-launch), so its own pid is not yet
 *  in the file and never false-refuses itself. */
declare function assertSingleDrive(consortDir: string): boolean;
/** Halt the running drive + its whole process tree (the executor's claude -p
 *  children included), reading the pid the drive recorded for itself. */
declare function stopDrive(consortDir: string): Promise<number>;
/** The feature whose snapshot a sprint stop should emit, or undefined for the
 *  planning snapshot. A workflow-state feature claim shadows the sprint-planning
 *  snapshot ONLY while the claimed feature is still IN FLIGHT (its SCM ladder has
 *  not reached merged): once merged, the leftover feature_id is stale, and a NEW
 *  sprint's planning stop (e.g. sprint-2's intake gate) must emit the planning
 *  snapshot, not the completed feature's "done" snapshot (else the dashboard shows
 *  the stale done instead of the live gate). */
declare function claimActiveForSnapshot(ws: {
    feature_id?: string;
    state?: string;
} | null | undefined): string | undefined;

export { assertSingleDrive, claimActiveForSnapshot, composeInputPause, drivePidPath, readDrivePid, stopDrive, writeDrivePid };
