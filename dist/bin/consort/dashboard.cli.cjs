#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// bin/consort/dashboard.cli.ts
var import_node_child_process2 = require("child_process");
var import_node_net = require("net");
var crypto = __toESM(require("crypto"), 1);
var fs2 = __toESM(require("fs"), 1);
var os = __toESM(require("os"), 1);
var path2 = __toESM(require("path"), 1);

// consort/config/kit-bin.ts
var import_node_child_process = require("child_process");
var fs = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
var kitRootCache;
function resolveKitRoot() {
  if (kitRootCache !== void 0) return kitRootCache;
  const env = process.env.LAKEBASE_KIT_DIR?.trim();
  kitRootCache = env && fs.existsSync(path.join(env, "package.json")) ? env : path.resolve(__dirname, "..", "..", "..");
  return kitRootCache;
}
function kitRoot() {
  return resolveKitRoot();
}

// bin/consort/dashboard.cli.ts
function parseArgs(argv) {
  const out = { projectDir: process.cwd(), host: "localhost", open: true, status: false, detach: false, openReady: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--project-dir":
        out.projectDir = argv[++i];
        break;
      case "--port":
        out.port = Number(argv[++i]);
        break;
      case "--record-dir":
        out.recordDir = argv[++i];
        break;
      case "--host":
        out.host = argv[++i];
        break;
      case "--no-open":
        out.open = false;
        break;
      case "--status":
        out.status = true;
        break;
      case "--detach":
        out.detach = true;
        break;
      case "--open-ready":
        out.openReady = true;
        break;
      case "-h":
      case "--help":
        console.log(
          "consort-dashboard [--project-dir <p>] [--port <n>] [--record-dir <p>] [--host <h>] [--no-open] [--status] [--detach]\nLaunch the dashboard on a local project's .consort/ (prebuilt bundle, or next dev in a dev clone).\n--detach spawns the server detached + prints the URL + returns at once (opens the browser when ready).\n--status reports whether one is already running (running <url> / stopped) without launching."
        );
        process.exit(0);
        break;
      default:
        break;
    }
  }
  return out;
}
function logPath(projectDir) {
  const h = crypto.createHash("sha1").update(path2.resolve(projectDir)).digest("hex").slice(0, 16);
  return path2.join(os.tmpdir(), "consort-dashboard", `${h}.log`);
}
function recordPath(projectDir) {
  const h = crypto.createHash("sha1").update(path2.resolve(projectDir)).digest("hex").slice(0, 16);
  return path2.join(os.tmpdir(), "consort-dashboard", `${h}.json`);
}
function readRecord(projectDir) {
  try {
    return JSON.parse(fs2.readFileSync(recordPath(projectDir), "utf8"));
  } catch {
    return null;
  }
}
function writeRecord(projectDir, rec) {
  try {
    fs2.mkdirSync(path2.dirname(recordPath(projectDir)), { recursive: true });
    fs2.writeFileSync(recordPath(projectDir), JSON.stringify(rec));
  } catch {
  }
}
function clearRecord(projectDir) {
  try {
    fs2.rmSync(recordPath(projectDir), { force: true });
  } catch {
  }
}
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function runningRecord(projectDir) {
  const rec = readRecord(projectDir);
  if (!rec || !pidAlive(rec.pid)) return null;
  const up = await waitListening(rec.host, rec.port, 3);
  return up ? rec : null;
}
function freePort(host) {
  return new Promise((resolve3, reject) => {
    const srv = (0, import_node_net.createServer)();
    srv.on("error", reject);
    srv.listen(0, host, () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve3(port));
    });
  });
}
function prebuiltServer(kit) {
  const root = path2.join(kit, "dist", "dashboard");
  const candidates = [path2.join(root, "server.js"), path2.join(root, "apps", "dashboard", "server.js")];
  return candidates.find((p) => fs2.existsSync(p)) ?? null;
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectDir = path2.resolve(args.projectDir);
  if (args.openReady) {
    const port2 = args.port ?? 0;
    const ready = await waitListening(args.host, port2, 480);
    if (ready && args.open) openBrowser(`http://${args.host}:${port2}/`);
    process.exit(0);
  }
  if (args.status) {
    const rec = await runningRecord(projectDir);
    if (rec) {
      console.log(`running ${rec.url}`);
      process.exit(0);
    }
    console.log("stopped");
    process.exit(3);
  }
  const existing = await runningRecord(projectDir);
  if (existing) {
    console.log(`Consort dashboard already running \u2192 ${existing.url}
  project: ${projectDir}`);
    if (args.open) openBrowser(existing.url);
    process.exit(0);
  }
  const kit = kitRoot();
  const port = args.port && Number.isFinite(args.port) ? args.port : await freePort(args.host);
  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: args.host,
    CONSORT_PROJECT_DIR: projectDir,
    ...args.recordDir ? { CONSORT_RECORD_DIR: args.recordDir } : {}
  };
  const url = `http://${args.host}:${port}/`;
  const server = prebuiltServer(kit);
  const runSh = path2.join(kit, "apps", "dashboard", "run.sh");
  let stdio = "inherit";
  let logFile = null;
  if (args.detach) {
    logFile = logPath(projectDir);
    try {
      fs2.mkdirSync(path2.dirname(logFile), { recursive: true });
    } catch {
    }
    const fd = fs2.openSync(logFile, "a");
    stdio = ["ignore", fd, fd];
  }
  const spawnOpts = args.detach ? { env, stdio, detached: true } : { env, stdio };
  let child;
  if (server) {
    console.log(`Consort dashboard (prebuilt) \u2192 ${url}
  project: ${projectDir}${args.recordDir ? `
  record:  ${args.recordDir}` : ""}${args.detach ? "" : "\n  Ctrl-C to stop."}`);
    child = (0, import_node_child_process2.spawn)("node", [server], { cwd: path2.dirname(server), ...spawnOpts });
  } else if (fs2.existsSync(runSh)) {
    console.log(`Consort dashboard (dev) \u2192 ${url}
  project: ${projectDir}${args.detach ? "" : "\n  Ctrl-C to stop."}`);
    child = (0, import_node_child_process2.spawn)("bash", [runSh, projectDir], { cwd: path2.join(kit, "apps", "dashboard"), ...spawnOpts });
  } else {
    console.error(
      `consort-dashboard: no dashboard found in the deployed kit (${kit}).
  Expected a prebuilt bundle at dist/dashboard/server.js (installed kit) or apps/dashboard/ (dev clone).
  An installed kit older than the prebuilt-dashboard release won't have it; upgrade the kit, or point LAKEBASE_KIT_DIR at a dev clone.`
    );
    process.exit(1);
    return;
  }
  const childPid = child.pid;
  if (args.detach) {
    child.unref();
    if (childPid) writeRecord(projectDir, { pid: childPid, port, host: args.host, url, startedAt: (/* @__PURE__ */ new Date()).toISOString() });
    if (args.open) {
      try {
        (0, import_node_child_process2.spawn)(process.execPath, [process.argv[1], "--open-ready", "--host", args.host, "--port", String(port)], {
          detached: true,
          stdio: "ignore"
        }).unref();
      } catch {
      }
    }
    console.log(`  detached \u2014 the browser opens when the server is ready; logs: ${logFile}`);
    process.exit(0);
  }
  void waitListening(args.host, port).then((ready) => {
    if (ready) {
      if (childPid) writeRecord(projectDir, { pid: childPid, port, host: args.host, url, startedAt: (/* @__PURE__ */ new Date()).toISOString() });
      if (args.open) openBrowser(url);
    } else {
      console.error(
        `consort-dashboard: the server did not come up on ${url} \u2014 it likely crashed on startup.
  Check this window's output (or the log the launcher redirected to) for the error.`
      );
    }
  });
  child.on("exit", (code) => {
    clearRecord(projectDir);
    process.exit(code ?? 0);
  });
}
function waitListening(host, port, tries = 60) {
  return new Promise((resolve3) => {
    let n = 0;
    const attempt = () => {
      const s = (0, import_node_net.connect)(port, host);
      s.once("connect", () => {
        s.destroy();
        resolve3(true);
      });
      s.once("error", () => {
        s.destroy();
        if (++n >= tries) resolve3(false);
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}
function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    (0, import_node_child_process2.spawn)(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
  }
}
main().catch((err) => {
  console.error(`consort-dashboard: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
