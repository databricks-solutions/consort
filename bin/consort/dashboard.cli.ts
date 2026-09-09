#!/usr/bin/env node
// consort-dashboard: launch the Consort dashboard against a LOCAL project's .consort/,
// using whatever kit is deployed locally (no git, no remote). The dashboard's live source
// reads the project's .consort/ straight off disk, so this just points a server at it.
//
// Prefers the PREBUILT bundle the kit ships (dist/dashboard/server.js — a Next standalone
// server, no install needed). Falls back to `apps/dashboard/run.sh` (next dev) when the
// deployed kit is a dev clone with source but no build. The scaffolded run-dashboard.sh is a
// thin wrapper that calls this via `lk` (so lk's kit resolution is reused, not duplicated).
//
//   consort-dashboard [--project-dir <p>] [--port <n>] [--record-dir <p>] [--host <h>] [--no-open] [--status]
//
// --project-dir defaults to cwd; --record-dir is optional (the dashboard auto-detects the
// project's own record lane otherwise); --port auto-picks a free port when omitted. The server
// runs in the foreground (Ctrl-C stops it). Launching when one is already up for this project is
// idempotent (re-opens the browser, no second server); --status reports running/stopped without
// launching, so a caller can decide whether to OFFER the dashboard rather than re-asking.

import { spawn } from "node:child_process";
import { createServer, connect } from "node:net";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { kitRoot } from "../../consort/config/kit-bin.js";

interface Args {
  projectDir: string;
  port?: number;
  recordDir?: string;
  host: string;
  open: boolean;
  /** --status: report whether a dashboard is already serving this project, then exit
   *  (`running <url>` + exit 0, or `stopped` + exit 3). No launch. Lets a caller decide
   *  whether to OFFER the dashboard rather than re-asking when one is already up. */
  status: boolean;
  /** --detach: spawn the server fully detached (its own session, unref'd, logged to a file) and
   *  RETURN AT ONCE with the URL printed — the resilient launch for a session/agent, which must
   *  not sit foregrounding a long-lived server (a hung "shell still running"). The browser is
   *  opened by a separate detached opener when the server binds, however long that takes. */
  detach: boolean;
  /** --open-ready (internal): the detached opener re-invokes the bin with this — it polls until
   *  host:port answers, opens the browser, and exits. Keeps the browser-open off the launcher's
   *  critical path so `--detach` can return immediately yet the browser still opens reliably. */
  openReady: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { projectDir: process.cwd(), host: "localhost", open: true, status: false, detach: false, openReady: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--project-dir": out.projectDir = argv[++i]; break;
      case "--port": out.port = Number(argv[++i]); break;
      case "--record-dir": out.recordDir = argv[++i]; break;
      case "--host": out.host = argv[++i]; break;
      case "--no-open": out.open = false; break;
      case "--status": out.status = true; break;
      case "--detach": out.detach = true; break;
      case "--open-ready": out.openReady = true; break;
      case "-h": case "--help":
        console.log(
          "consort-dashboard [--project-dir <p>] [--port <n>] [--record-dir <p>] [--host <h>] [--no-open] [--status] [--detach]\n" +
            "Launch the dashboard on a local project's .consort/ (prebuilt bundle, or next dev in a dev clone).\n" +
            "--detach spawns the server detached + prints the URL + returns at once (opens the browser when ready).\n" +
            "--status reports whether one is already running (running <url> / stopped) without launching.",
        );
        process.exit(0);
        break;
      default: break;
    }
  }
  return out;
}

/** Per-project detached-server log (tmp, keyed by the resolved project dir), so a `--detach`
 *  launch's server output is capturable and a startup crash is diagnosable instead of lost. */
function logPath(projectDir: string): string {
  const h = crypto.createHash("sha1").update(path.resolve(projectDir)).digest("hex").slice(0, 16);
  return path.join(os.tmpdir(), "consort-dashboard", `${h}.log`);
}

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
}

function recordPath(projectDir: string): string {
  const h = crypto.createHash("sha1").update(path.resolve(projectDir)).digest("hex").slice(0, 16);
  return path.join(os.tmpdir(), "consort-dashboard", `${h}.json`);
}

function readRecord(projectDir: string): DashboardRecord | null {
  try {
    return JSON.parse(fs.readFileSync(recordPath(projectDir), "utf8")) as DashboardRecord;
  } catch {
    return null;
  }
}

function writeRecord(projectDir: string, rec: DashboardRecord): void {
  try {
    fs.mkdirSync(path.dirname(recordPath(projectDir)), { recursive: true });
    fs.writeFileSync(recordPath(projectDir), JSON.stringify(rec));
  } catch {
    /* best-effort: a missing record only costs a re-offer, never correctness */
  }
}

function clearRecord(projectDir: string): void {
  try {
    fs.rmSync(recordPath(projectDir), { force: true });
  } catch {
    /* best-effort */
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The live dashboard record for this project, or null. Verifies BOTH that the recorded pid is
 *  alive AND that its port still answers — so a stale record (crashed server) or a reused pid
 *  never false-positives into "already running". */
async function runningRecord(projectDir: string): Promise<DashboardRecord | null> {
  const rec = readRecord(projectDir);
  if (!rec || !pidAlive(rec.pid)) return null;
  const up = await waitListening(rec.host, rec.port, 3); // quick probe, not the full startup wait
  return up ? rec : null;
}

/** A free TCP port (OS-assigned when we bind :0), so the launcher never collides with a
 *  deploy server, a stale dashboard, or another listener. The scaffolded wrapper may pass
 *  --port (resolved via port-utils.sh); this is the fallback when it doesn't. */
function freePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, host, () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** The prebuilt standalone server the kit ships, or null. Assembled into dist/dashboard/ by
 *  `build:dashboard`; server.js sits at the root, but Next's standalone layout can nest it one
 *  level under the app path, so accept either. */
function prebuiltServer(kit: string): string | null {
  const root = path.join(kit, "dist", "dashboard");
  const candidates = [path.join(root, "server.js"), path.join(root, "apps", "dashboard", "server.js")];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const projectDir = path.resolve(args.projectDir);

  // --open-ready (internal, spawned detached by a --detach launch): poll until the server binds,
  // open the browser, exit. Runs OFF the launcher's critical path so --detach returns at once yet
  // the browser still opens reliably whenever the server is up (generous wait for a cold boot).
  if (args.openReady) {
    const port = args.port ?? 0;
    const ready = await waitListening(args.host, port, 480); // up to ~2min: cold Next boot, slow box
    if (ready && args.open) openBrowser(`http://${args.host}:${port}/`);
    process.exit(0);
  }

  // --status: answer "is a dashboard already serving this project?" and exit — no launch. A
  // caller (e.g. /consort:start) checks this to decide whether to OFFER the dashboard, instead
  // of re-asking on every resume when one is already up.
  if (args.status) {
    const rec = await runningRecord(projectDir);
    if (rec) {
      console.log(`running ${rec.url}`);
      process.exit(0);
    }
    console.log("stopped");
    process.exit(3);
  }

  // Already running for this project? Don't spawn a duplicate server — just re-open the browser
  // on the existing one and exit. Makes the bin idempotent, so a re-launch is harmless.
  const existing = await runningRecord(projectDir);
  if (existing) {
    console.log(`Consort dashboard already running → ${existing.url}\n  project: ${projectDir}`);
    if (args.open) openBrowser(existing.url);
    process.exit(0);
  }

  const kit = kitRoot();
  const port = args.port && Number.isFinite(args.port) ? args.port : await freePort(args.host);

  // Companion record lane (turn transcripts / correspondence): only forward an EXPLICIT
  // --record-dir. With just CONSORT_PROJECT_DIR set, the dashboard already auto-detects the
  // project's own record lane, so the bin doesn't second-guess the artifact-root layout.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: args.host,
    CONSORT_PROJECT_DIR: projectDir,
    ...(args.recordDir ? { CONSORT_RECORD_DIR: args.recordDir } : {}),
  };

  const url = `http://${args.host}:${port}/`;
  const server = prebuiltServer(kit);
  const runSh = path.join(kit, "apps", "dashboard", "run.sh");

  // Detached launch (a session/agent): the server gets its OWN session (detached:true → setsid) +
  // unref, and its stdout/stderr go to a per-project LOG file — so this launcher exits AT ONCE
  // instead of foregrounding a long-lived server (the "shell still running" that hung the session
  // and made it wait on the boot). Foreground launch (a human via run-dashboard.sh): inherit the
  // terminal, Ctrl-C stops it.
  let stdio: "inherit" | ["ignore", number, number] = "inherit";
  let logFile: string | null = null;
  if (args.detach) {
    logFile = logPath(projectDir);
    try { fs.mkdirSync(path.dirname(logFile), { recursive: true }); } catch { /* best-effort */ }
    const fd = fs.openSync(logFile, "a");
    stdio = ["ignore", fd, fd];
  }
  const spawnOpts = args.detach ? { env, stdio, detached: true as const } : { env, stdio };

  let child;
  if (server) {
    console.log(`Consort dashboard (prebuilt) → ${url}\n  project: ${projectDir}${args.recordDir ? `\n  record:  ${args.recordDir}` : ""}${args.detach ? "" : "\n  Ctrl-C to stop."}`);
    child = spawn("node", [server], { cwd: path.dirname(server), ...spawnOpts });
  } else if (fs.existsSync(runSh)) {
    // Dev-clone kit: no prebuilt bundle, but the dashboard source is here. run.sh sets
    // CONSORT_PROJECT_DIR/PORT itself from its args + env and runs `next dev`.
    console.log(`Consort dashboard (dev) → ${url}\n  project: ${projectDir}${args.detach ? "" : "\n  Ctrl-C to stop."}`);
    child = spawn("bash", [runSh, projectDir], { cwd: path.join(kit, "apps", "dashboard"), ...spawnOpts });
  } else {
    console.error(
      `consort-dashboard: no dashboard found in the deployed kit (${kit}).\n` +
        `  Expected a prebuilt bundle at dist/dashboard/server.js (installed kit) or apps/dashboard/ (dev clone).\n` +
        `  An installed kit older than the prebuilt-dashboard release won't have it; upgrade the kit, or point LAKEBASE_KIT_DIR at a dev clone.`,
    );
    process.exit(1);
    return;
  }

  const childPid = child.pid;

  // Detached: RETURN NOW. The server runs in its own session (survives this exit); we record it so
  // --status + a re-launch find it, print the URL immediately (the session relays it without
  // waiting on the boot), and hand the browser-open to a SEPARATE detached opener that polls until
  // the port answers. Nothing here blocks — no hung shell, and the browser still opens reliably
  // whenever the server is ready, however long a cold boot takes.
  if (args.detach) {
    child.unref();
    if (childPid) writeRecord(projectDir, { pid: childPid, port, host: args.host, url, startedAt: new Date().toISOString() });
    if (args.open) {
      try {
        spawn(process.execPath, [process.argv[1], "--open-ready", "--host", args.host, "--port", String(port)], {
          detached: true,
          stdio: "ignore",
        }).unref();
      } catch {
        /* the printed URL is the fallback */
      }
    }
    console.log(`  detached — the browser opens when the server is ready; logs: ${logFile}`);
    process.exit(0);
  }

  // Foreground (human): wait for the server to accept connections, THEN record it + open the
  // browser. An immediate open races the not-yet-ready server (connection-refused page); recording
  // only once it's up means --status never reports a server that then failed to bind. If it never
  // comes up (a startup crash), say so loudly and point at where the output went.
  void waitListening(args.host, port).then((ready) => {
    if (ready) {
      if (childPid) writeRecord(projectDir, { pid: childPid, port, host: args.host, url, startedAt: new Date().toISOString() });
      if (args.open) openBrowser(url);
    } else {
      console.error(
        `consort-dashboard: the server did not come up on ${url} — it likely crashed on startup.\n` +
          `  Check this window's output (or the log the launcher redirected to) for the error.`,
      );
    }
  });
  child.on("exit", (code) => {
    clearRecord(projectDir); // the server is gone; don't leave a record that says "running"
    process.exit(code ?? 0);
  });
}

/** Best-effort browser open; never fatal (headless boxes just use the printed URL). */
/** Resolve once the server accepts a TCP connection on host:port (or after ~15s of retries). */
function waitListening(host: string, port: number, tries = 60): Promise<boolean> {
  return new Promise((resolve) => {
    let n = 0;
    const attempt = (): void => {
      const s = connect(port, host);
      s.once("connect", () => {
        s.destroy();
        resolve(true);
      });
      s.once("error", () => {
        s.destroy();
        if (++n >= tries) resolve(false);
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* printed URL is the fallback */
  }
}

main().catch((err) => {
  console.error(`consort-dashboard: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
