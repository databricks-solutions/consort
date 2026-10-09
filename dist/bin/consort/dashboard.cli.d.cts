#!/usr/bin/env node
/** Per-project run record so a second invocation (or --status) knows a dashboard is already
 *  serving this project instead of spawning a duplicate or re-offering it. Kept OUT of the repo
 *  (tmp, keyed by the resolved project dir) so it is never committed and never needs a gitignore
 *  rule; the bin owns both ends, so the path is an internal detail, not a cross-tool contract. */
interface DashboardRecord {
    pid: number;
    port: number;
    host: string;
    url: string;
    startedAt: string;
    /** The kit version whose dashboard BUNDLE this server is running. A long-lived server started
     *  on an older kit keeps serving that OLD bundle after the project is upgraded — so a v0.3.106
     *  project could silently be viewed through a v0.3.102 dashboard (missing per-step card fixes).
     *  Recording it lets a relaunch detect the skew and replace the stale server. Absent on records
     *  written before this field existed → treated as a mismatch (relaunch). */
    version?: string;
}
declare function writeRecord(projectDir: string, rec: DashboardRecord): void;
/** The live dashboard record for this project running the CURRENT kit version, or null. Verifies
 *  the recorded pid is alive, its port still answers (so a crashed server or reused pid never
 *  false-positives), AND — when `expectVersion` is given — that the server's bundle version matches
 *  the kit now launching. A version MISMATCH returns null so the launcher never reuses a stale-kit
 *  server for an upgraded project (the v0.3.102-serving-v0.3.106 defect); `staleServer` finds that
 *  one to replace. Omit `expectVersion` to accept any live server (version-agnostic callers). */
declare function runningRecord(projectDir: string, expectVersion?: string): Promise<DashboardRecord | null>;
/** A live server for this project whose bundle version does NOT match `current` — a stale-kit
 *  dashboard the launcher must stop before starting the correct one, so an upgraded project is
 *  never left viewed through (and never piles up orphan ports from) an older bundle. */
declare function staleServer(projectDir: string, current: string): Promise<DashboardRecord | null>;

export { runningRecord, staleServer, writeRecord };
