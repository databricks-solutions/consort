#!/usr/bin/env node

// bin/consort/watch.cli.ts
import * as fs4 from "fs";
import * as path2 from "path";

// consort/config/consort-paths.ts
import * as fs from "fs";
import { join } from "path";
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];
function resolveConsortDir(projectDir = process.cwd()) {
  const next = join(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    const legacy = join(projectDir, legacyName);
    if (fs.existsSync(legacy)) return legacy;
  }
  return next;
}
var featuresDir = (tdd) => join(tdd, "features");
var productOverviewMd = (tdd) => join(tdd, "product-overview.md");
var nfrsMd = (tdd) => join(tdd, "nfrs.md");
var designDir = (tdd) => join(tdd, "design");
var designBriefMd = (tdd) => join(designDir(tdd), "design-brief.md");
var designGuideJson = (tdd) => join(designDir(tdd), "design-guide.json");
var featureDir = (tdd, featureId) => join(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var featureSpecJson = (tdd, f) => join(featureResolved(tdd, f), "feature-spec.json");
var featureSpecMd = (tdd, f) => join(featureResolved(tdd, f), "feature-spec.md");
var architectureJson = (tdd, f) => join(featureResolved(tdd, f), "architecture.json");
var architectureMd = (tdd, f) => join(featureResolved(tdd, f), "architecture.md");
var dbDesignJson = (tdd, f) => join(featureResolved(tdd, f), "db-design.json");
var dbDesignMd = (tdd, f) => join(featureResolved(tdd, f), "db-design.md");
var featureTestListJson = (tdd, f) => join(featureResolved(tdd, f), "test-list.json");
var featureTestListMd = (tdd, f) => join(featureResolved(tdd, f), "test-list.md");
var storiesDir = (tdd, f) => join(featureResolved(tdd, f), "stories");
var storyDir = (tdd, f, s) => join(storiesDir(tdd, f), s);
function findStoryDir(tdd, f, s) {
  const root = storiesDir(tdd, f);
  if (!fs.existsSync(root)) return void 0;
  const exact = join(root, s);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === s || d.startsWith(`${s}-`));
  return matches.length === 1 ? join(root, matches[0]) : void 0;
}
var storyResolved = (tdd, f, s) => findStoryDir(tdd, f, s) ?? storyDir(tdd, f, s);
var storyJson = (tdd, f, s) => join(storyResolved(tdd, f, s), "story.json");
var acsDir = (tdd, f, s) => join(storyResolved(tdd, f, s), "acs");
var storyTestListJson = (tdd, f, s) => join(storyResolved(tdd, f, s), "test-list-per-story.json");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = join(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? join(root, matches[0]) : void 0;
}

// consort/orchestrator/drive/watch-classify.ts
function classifyDriveLine(raw) {
  const line = raw.replace(/\s+$/, "");
  if (/recorded under .*escalations\//.test(line)) {
    return { kind: "escalation", text: line.trim(), stop: true, outcome: "escalation" };
  }
  if (line.startsWith("[consort]")) {
    return { kind: "notice", text: line.replace(/^\[consort\] /, ""), stop: false };
  }
  if (/^lk: /.test(line)) {
    return { kind: "info", text: line.replace(/^lk: /, ""), stop: false };
  }
  const isDrive = line.startsWith("[drive]");
  const isSprint = line.startsWith("[sprint]");
  const isBracketed = /^\[[^\]]+\]/.test(line);
  if (!isDrive && !isSprint && !isBracketed) return null;
  if (/\bRAISED TO HIL\b/.test(line)) {
    return { kind: "escalation", text: line.replace(/^\[(drive|sprint)\] /, ""), stop: true, outcome: "escalation" };
  }
  if (/^\[drive\] ABORTED\b/.test(line)) {
    return { kind: "escalation", text: line.replace(/^\[drive\] /, ""), stop: true, outcome: "escalation" };
  }
  if (/^\[drive\] GATE awaiting human approval:/.test(line)) {
    return { kind: "gate", text: line, stop: true, outcome: "gate" };
  }
  if (/^\[drive\] PAUSED\b/.test(line) || /^\[sprint\] paused on\b/.test(line)) {
    return { kind: "pause", text: line, stop: true, outcome: "pause" };
  }
  if (/^\[drive\] holding\b/.test(line)) {
    return { kind: "pause", text: line, stop: true, outcome: "pause" };
  }
  if (/^\[sprint\] .*\bcomplete:/.test(line) || /^\[drive\] done in \d+ actions\b/.test(line)) {
    return { kind: "done", text: line, stop: true, outcome: "done" };
  }
  if (/^\[drive\] stopped at --max-steps\b/.test(line)) {
    return { kind: "done", text: line, stop: true, outcome: "done" };
  }
  const perAction = line.match(/^\[drive\] \d{3} (.*)$/);
  if (perAction) return { kind: "dispatch", text: perAction[1], stop: false };
  if (/^\[drive\] \S+ turn [\d.]+s\b/.test(line)) {
    return { kind: "turn-done", text: line.replace(/^\[drive\] /, ""), stop: false };
  }
  if (/^\[sprint\] feature \d+:.*already shipped, skipping/.test(line)) {
    return { kind: "skip", text: line.replace(/^\[sprint\] /, ""), stop: false };
  }
  if (/^\[sprint\] feature \d+:/.test(line)) {
    return { kind: "feature", text: line.replace(/^\[sprint\] /, ""), stop: false };
  }
  if (/^\[drive\] turn stalled:/.test(line)) {
    return { kind: "stalled", text: line.replace(/^\[drive\] /, ""), stop: false };
  }
  return { kind: "info", text: line.replace(/^\[(drive|sprint)\] /, ""), stop: false };
}

// consort/orchestrator/open/open-in-editor.ts
import * as fs3 from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

// consort/orchestrator/open/resolve-review-artifacts.ts
import * as fs2 from "fs";
import { join as join2, dirname } from "path";
var DESIGN_ROLES = /* @__PURE__ */ new Set([
  "product-owner",
  "spec-author",
  "architect-reviewer",
  "dba",
  "ux-designer",
  "test-strategist"
]);
function roleArtifacts(consortDir, role, opts = {}) {
  const { feature: f, story: s } = opts;
  const out = [];
  const add = (p) => {
    if (fs2.existsSync(p) && !out.includes(p)) out.push(p);
  };
  switch (role) {
    case "product-owner":
      add(productOverviewMd(consortDir));
      add(nfrsMd(consortDir));
      add(designBriefMd(consortDir));
      break;
    case "spec-author":
      if (f) {
        add(featureSpecMd(consortDir, f));
        add(featureSpecJson(consortDir, f));
      }
      if (f && s) {
        add(join2(storyDir(consortDir, f, s), "story.md"));
        add(storyJson(consortDir, f, s));
        try {
          for (const a of fs2.readdirSync(acsDir(consortDir, f, s)).filter((n) => n.endsWith(".json")).sort()) {
            add(join2(acsDir(consortDir, f, s), a));
          }
        } catch {
        }
      }
      break;
    case "architect-reviewer":
      if (f) {
        add(architectureMd(consortDir, f));
        add(architectureJson(consortDir, f));
      }
      break;
    case "dba":
      if (f) {
        add(dbDesignMd(consortDir, f));
        add(dbDesignJson(consortDir, f));
      }
      break;
    case "ux-designer":
      add(join2(consortDir, "design", "design-guide.md"));
      add(designGuideJson(consortDir));
      add(join2(consortDir, "design", "ia.md"));
      add(designBriefMd(consortDir));
      break;
    case "test-strategist":
      if (f) {
        add(featureTestListMd(consortDir, f));
        add(featureTestListJson(consortDir, f));
      }
      if (f && s) add(storyTestListJson(consortDir, f, s));
      break;
    case "navigator":
      break;
    default:
      break;
  }
  return out;
}
var STORY_WORK_PRIORITY = {
  designing: 6,
  "awaiting-gate": 5,
  building: 4,
  "awaiting-acceptance": 3,
  ready: 2,
  done: 1,
  discarded: 0
};
function storyFreshness(consortDir, feature, story) {
  let m = 0;
  for (const p of [storyDir(consortDir, feature, story), storyJson(consortDir, feature, story), acsDir(consortDir, feature, story)]) {
    try {
      m = Math.max(m, fs2.statSync(p).mtimeMs);
    } catch {
    }
  }
  return m;
}
function freshestStoryOnDisk(consortDir, feature) {
  const storiesDir2 = dirname(storyDir(consortDir, feature, "_"));
  let best;
  let bestMtime = 0;
  try {
    for (const name of fs2.readdirSync(storiesDir2)) {
      const m = storyFreshness(consortDir, feature, name);
      if (m > bestMtime) {
        bestMtime = m;
        best = name;
      }
    }
  } catch {
  }
  return best;
}
function deriveScopeFromDisk(consortDir) {
  let bestFeature;
  let bestStory;
  let bestMtime = 0;
  try {
    for (const feature of fs2.readdirSync(featuresDir(consortDir))) {
      const story = freshestStoryOnDisk(consortDir, feature);
      if (!story) continue;
      const m = storyFreshness(consortDir, feature, story);
      if (m > bestMtime) {
        bestMtime = m;
        bestFeature = feature;
        bestStory = story;
      }
    }
  } catch {
  }
  return bestFeature ? { feature: bestFeature, story: bestStory } : {};
}
function resolveScope(consortDir) {
  try {
    const next = JSON.parse(fs2.readFileSync(join2(consortDir, "next.json"), "utf8"));
    const feature = next.feature ?? void 0;
    if (feature) {
      let story;
      let bestPriority = -1;
      let bestMtime = 0;
      for (const [id, status] of Object.entries(next.state?.stories ?? {})) {
        const m = storyFreshness(consortDir, feature, id);
        if (m === 0) continue;
        const priority = STORY_WORK_PRIORITY[status] ?? 0;
        if (priority > bestPriority || priority === bestPriority && m > bestMtime) {
          bestPriority = priority;
          bestMtime = m;
          story = id;
        }
      }
      const resolved = story ?? freshestStoryOnDisk(consortDir, feature);
      return { feature, ...resolved ? { story: resolved } : {} };
    }
  } catch {
  }
  try {
    const ws = JSON.parse(fs2.readFileSync(join2(consortDir, "workflow-state.json"), "utf8"));
    if (ws.feature_id) {
      const story = ws.story_id ?? freshestStoryOnDisk(consortDir, ws.feature_id);
      return { feature: ws.feature_id, ...story ? { story } : {} };
    }
  } catch {
  }
  return deriveScopeFromDisk(consortDir);
}

// consort/orchestrator/open/open-in-editor.ts
var CURSOR_BUNDLES = [
  "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
  `${process.env.HOME}/Applications/Cursor.app/Contents/Resources/app/bin/cursor`
];
var CODE_BUNDLES = [
  "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
  `${process.env.HOME}/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`
];
function hostEditor(env = process.env) {
  if (env.CURSOR_TRACE_ID) return "cursor";
  if (env.VSCODE_PID || env.VSCODE_GIT_IPC_HANDLE || env.TERM_PROGRAM === "vscode") return "code";
  return null;
}
function findEditorCmd(env = process.env) {
  const host = hostEditor(env);
  const names = host === "code" ? ["code", "cursor"] : ["cursor", "code"];
  const bundles = host === "code" ? [...CODE_BUNDLES, ...CURSOR_BUNDLES] : [...CURSOR_BUNDLES, ...CODE_BUNDLES];
  const pathDirs = (env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const name of names) {
    for (const dir of pathDirs) {
      const p = path.join(dir, name);
      try {
        if (fs3.existsSync(p) && fs3.statSync(p).isFile()) return name;
      } catch {
      }
    }
  }
  for (const p of bundles) {
    try {
      if (fs3.existsSync(p)) return p;
    } catch {
    }
  }
  return null;
}
function isInsideEditor(env = process.env) {
  return /vscode|cursor/i.test(env.TERM_PROGRAM ?? "") || Boolean(env.CURSOR_TRACE_ID) || Boolean(env.VSCODE_PID);
}
function openRoleArtifacts(consortDir, role, opts = {}) {
  const env = opts.env ?? process.env;
  const files = roleArtifacts(consortDir, role, { feature: opts.feature, story: opts.story });
  if (!files.length) return { files, opened: false, reason: "no-artifacts" };
  const cmd = findEditorCmd(env);
  if (!cmd) return { files, opened: false, reason: "no-editor" };
  if (!isInsideEditor(env) && !opts.force) return { files, opened: false, editor: cmd, reason: "not-in-editor" };
  const spawn = opts.spawn ?? ((c, fs22) => {
    spawnSync(c, fs22, { stdio: "ignore" });
  });
  try {
    spawn(cmd, files);
  } catch {
    return { files, opened: false, editor: cmd, reason: "no-editor" };
  }
  return { files, opened: true, editor: cmd };
}

// bin/consort/watch.cli.ts
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
function reportRoleOpen(consortDir, role, env, spawn) {
  const force = env.LAKEBASE_CONSORT_OPEN === "1" || env.LAKEBASE_CONSORT_OPEN === "force";
  const res = openRoleArtifacts(consortDir, role, { ...resolveScope(consortDir), env, force, ...spawn ? { spawn } : {} });
  if (res.opened) return `[consort-watch] opened ${res.files.length} artifact(s) produced by ${role} in ${res.editor}`;
  if (!DESIGN_ROLES.has(role)) return null;
  switch (res.reason) {
    case "not-in-editor":
      return `[consort-watch] ${role} turn done \u2013 ${res.files.length} artifact(s) to review, NOT opened \u2013 run the relay inside your Cursor/VS Code integrated terminal, OR set LAKEBASE_CONSORT_OPEN=1 to auto-open from a background monitor (else review via consort-open)`;
    case "no-editor":
      return `[consort-watch] ${role} turn done \u2013 no cursor/code CLI found to open its ${res.files.length} artifact(s) \u2013 install the editor's shell command (else review via consort-open)`;
    case "no-artifacts":
      return `[consort-watch] ${role} turn done \u2013 no reviewable artifact found yet for this scope`;
    default:
      return null;
  }
}
function parseArgs(argv) {
  const out = { fromStart: false, projectDir: process.cwd(), open: true, timeout: 90, monitor: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--log":
        out.log = argv[++i];
        break;
      case "--pid":
        out.pid = Number(argv[++i]);
        break;
      case "--timeout":
        out.timeout = Number(argv[++i]);
        break;
      case "--since":
        out.since = Number(argv[++i]);
        break;
      case "--from-start":
        out.fromStart = true;
        break;
      case "--project-dir":
        out.projectDir = argv[++i];
        break;
      case "--tdd-dir":
      case "--consort-dir":
        out.consortDir = argv[++i];
        break;
      case "--no-open":
        out.open = false;
        break;
      case "--monitor":
        out.monitor = true;
        out.timeout = 0;
        break;
      // persistent: no self-bound
      case "-h":
      case "--help":
        process.stdout.write(
          "consort-watch \u2013 follow a backgrounded drive's live log and relay transitions.\n\n  consort-watch [--log <path>] [--pid <n>] [--from-start] [--project-dir <p>]\n  consort-watch --since <cursor> [--pid <n>]   POLL-ONCE: new lines + status, exit at once (for a Bash-call relay loop)\n  consort-watch --monitor                      PERSISTENT: follow the log across silences + drive re-runs, stop only at a marker (for the Monitor TOOL)\n\nDefaults --log to <consort>/drive-live.log (the scaffolded `> \u2026 2>&1 &` sink).\nStops at a gate / pause / escalation / run-end. Exit 0 clean, 3 escalation, 2 no log.\n"
        );
        process.exit(0);
    }
  }
  return out;
}
var PREFIX = {
  dispatch: "  ->",
  "turn-done": "   ok",
  feature: " >>",
  skip: "  ~",
  gate: "GATE:",
  pause: "PAUSE:",
  escalation: "FAIL:",
  done: "DONE:",
  stalled: " !!",
  notice: "[consort]",
  info: "   ."
};
var alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function scanLastStop(logPath) {
  let last = null;
  try {
    for (const line of fs4.readFileSync(logPath, "utf8").split("\n")) {
      const c = classifyDriveLine(line);
      if (c?.stop) last = c;
    }
  } catch {
  }
  return last;
}
function emitStop(c) {
  if (c.outcome === "gate" || c.outcome === "pause") {
    process.stderr.write("consort-watch: control is back with you \u2013 run `consort-next` for the exact command, then re-run the drive.\n");
  } else if (c.outcome === "escalation") {
    process.stderr.write(`consort-watch: the run escalated \u2013 \`consort-diagnose\` bundles the forensics; after fixing the cause, \`consort-resolve-escalation\` clears it (do NOT rm the record), then re-run.
`);
  } else {
    process.stderr.write("consort-watch: run complete.\n");
  }
  return c.outcome === "escalation" ? 3 : 0;
}
function readNextStop(consortDir) {
  try {
    const s = JSON.parse(fs4.readFileSync(path2.join(consortDir, "next.json"), "utf8"));
    const primary = s.primary_action;
    const opts = Array.isArray(s.options) ? s.options : [];
    const opt = opts.find((o) => o?.id !== "resume" && o?.id !== "hold" && o?.kind !== "noop");
    const enactObj = opt?.enact;
    const enact = enactObj?.bin ? `${enactObj.bin}${enactObj.args?.length ? " " + enactObj.args.join(" ") : ""}` : void 0;
    return {
      generated_at: String(s.generated_at ?? ""),
      awaiting_human: s.awaiting_human === true,
      done: primary?.kind === "done",
      escalated: primary?.kind === "raise-to-hil",
      summary: String(s.summary ?? ""),
      hil: typeof opt?.hil_prompt === "string" ? opt.hil_prompt : void 0,
      enact
    };
  } catch {
    return null;
  }
}
function isNextStop(ns) {
  return !!ns && (ns.awaiting_human || ns.done || ns.escalated);
}
function classifyPidGone(ns, actionBaseline, lastStop) {
  const action = ns ? ns.enact ?? ns.summary ?? "" : "";
  if (isNextStop(ns) || lastStop) return "stop";
  if (action && action !== actionBaseline) return "turn-boundary";
  return "crash";
}
function logIsFromDrive(logPath) {
  try {
    return fs4.readFileSync(logPath, "utf8").includes("[drive]");
  } catch {
    return false;
  }
}
function emitNextStop(ns) {
  process.stdout.write(`[consort-watch] DRIVE STOPPED \u2013 ${ns.summary || (ns.done ? "run complete" : ns.escalated ? "escalation" : "awaiting a decision")}
`);
  if (ns.escalated) {
    process.stderr.write("consort-watch: the run escalated \u2013 `consort-diagnose` bundles the forensics; after fixing the cause, `consort-resolve-escalation` clears it (do NOT rm the record), then re-run.\n");
    return 3;
  }
  if (ns.done) {
    process.stderr.write("consort-watch: run complete.\n");
    return 0;
  }
  if (ns.hil) process.stdout.write(`[consort-watch] HUMAN NEEDED: ${ns.hil}${ns.enact ? ` \u2013 run: ${ns.enact}` : ""}
`);
  process.stderr.write("consort-watch: control is back with you \u2013 run `consort-next` for the exact command, then re-run the drive.\n");
  return 0;
}
function pollOnce(logPath, since, pid, isAlive = alive, nowMs = Date.now()) {
  const pidAlive = pid === void 0 ? null : isAlive(pid);
  if (!fs4.existsSync(logPath)) return { relayed: [], turnsDone: [], cursor: 0, status: "waiting", silentMs: 0, pidAlive };
  const st = fs4.statSync(logPath);
  const size = st.size;
  const silentMs = Math.max(0, nowMs - st.mtimeMs);
  const from = since < 0 || since > size ? 0 : since;
  const relayed = [];
  const turnsDone = [];
  let status = "running";
  if (size > from) {
    const fd = fs4.openSync(logPath, "r");
    const buf = Buffer.alloc(size - from);
    fs4.readSync(fd, buf, 0, buf.length, from);
    fs4.closeSync(fd);
    let inNotice = false;
    for (const line of buf.toString("utf8").split("\n")) {
      if (inNotice) {
        if (/^\s+\S/.test(line)) {
          relayed.push(line.replace(/\s+$/, ""));
          continue;
        }
        inNotice = false;
      }
      const c = classifyDriveLine(line);
      if (!c) continue;
      relayed.push(`${PREFIX[c.kind]} ${c.text}`);
      if (c.kind === "notice") {
        inNotice = true;
        continue;
      }
      if (c.kind === "turn-done") {
        const role = c.text.match(/^(\S+) turn/)?.[1];
        if (role) turnsDone.push(role);
      }
      if (c.stop && c.outcome) status = c.outcome;
    }
  }
  if (status === "running" && pidAlive === false && size <= from) {
    status = scanLastStop(logPath)?.outcome ?? "done";
  }
  return { relayed, turnsDone, cursor: size, status, silentMs, pidAlive };
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const consortDir = args.consortDir ?? resolveConsortDir(args.projectDir);
  const logPath = args.log ?? path2.join(consortDir, "drive-live.log");
  if (args.since !== void 0) {
    const r = pollOnce(logPath, args.since, args.pid);
    for (const line of r.relayed) process.stdout.write(`${line}
`);
    if (args.open) {
      for (const role of r.turnsDone) {
        const rep = reportRoleOpen(consortDir, role, process.env);
        if (rep) process.stdout.write(`${rep}
`);
      }
    }
    process.stdout.write(
      `[consort-watch] cursor=${r.cursor} status=${r.status} silent_for_s=${Math.round(r.silentMs / 1e3)} pid_alive=${r.pidAlive === null ? "unknown" : r.pidAlive}
`
    );
    return 0;
  }
  const APPEAR_MS = 3e4;
  const t0 = Date.now();
  while (!fs4.existsSync(logPath)) {
    if (args.pid && !alive(args.pid)) {
      process.stderr.write(`consort-watch: drive pid ${args.pid} exited before ${logPath} appeared.
`);
      return 2;
    }
    if (Date.now() - t0 > APPEAR_MS) {
      process.stderr.write(`consort-watch: no ${logPath} after ${APPEAR_MS / 1e3}s.
`);
      return 2;
    }
    await sleep(300);
  }
  let offset = args.fromStart ? 0 : fs4.statSync(logPath).size;
  let carry = "";
  let inNotice = false;
  const watchStart = Date.now();
  process.stderr.write(`consort-watch: following ${logPath}${args.pid ? ` (pid ${args.pid})` : ""}
`);
  if (args.monitor) {
    const last = scanLastStop(logPath);
    if (last) {
      process.stdout.write(`${PREFIX[last.kind]} ${last.text}
`);
      return emitStop(last);
    }
  }
  const nextBaseline = readNextStop(consortDir)?.generated_at ?? "";
  const baselineForAction = readNextStop(consortDir);
  const actionBaseline = baselineForAction ? baselineForAction.enact ?? baselineForAction.summary ?? "" : "";
  const monitorStopCheck = () => {
    const pidGone = args.pid !== void 0 && !alive(args.pid);
    const ns = readNextStop(consortDir);
    if (pidGone) {
      const last = scanLastStop(logPath);
      const kind = classifyPidGone(ns, actionBaseline, last);
      if (kind === "stop") {
        if (isNextStop(ns)) return emitNextStop(ns);
        process.stdout.write(`${PREFIX[last.kind]} ${last.text}
`);
        return emitStop(last);
      }
      if (kind === "turn-boundary") {
        process.stdout.write(`[consort-watch] turn boundary \u2013 the drive advanced (${ns?.summary || ns?.enact || "next action ready"}) and exited; re-run the drive to continue.
`);
        return 0;
      }
      if (!logIsFromDrive(logPath)) {
        process.stdout.write(`[consort-watch] process (pid ${args.pid}) finished \u2014 see the log for its result.
`);
        return 0;
      }
      process.stderr.write(`consort-watch: drive pid ${args.pid} is no longer running with no progress + no stop recorded \u2013 run consort-next to check for a crash.
`);
      return 3;
    }
    if (args.pid === void 0 && isNextStop(ns) && ns.generated_at !== nextBaseline) {
      return emitNextStop(ns);
    }
    return null;
  };
  for (; ; ) {
    const size = fs4.statSync(logPath).size;
    if (size < offset) offset = 0;
    if (size > offset) {
      const fd = fs4.openSync(logPath, "r");
      const buf = Buffer.alloc(size - offset);
      fs4.readSync(fd, buf, 0, buf.length, offset);
      fs4.closeSync(fd);
      offset = size;
      carry += buf.toString("utf8");
      const lines = carry.split("\n");
      carry = lines.pop() ?? "";
      for (const line of lines) {
        if (inNotice) {
          if (/^\s+\S/.test(line)) {
            process.stdout.write(`${line.replace(/\s+$/, "")}
`);
            continue;
          }
          inNotice = false;
        }
        const c = classifyDriveLine(line);
        if (!c) continue;
        process.stdout.write(`${PREFIX[c.kind]} ${c.text}
`);
        if (c.kind === "notice") {
          inNotice = true;
          continue;
        }
        if (c.kind === "turn-done" && args.open) {
          const role = c.text.match(/^(\S+) turn/)?.[1];
          if (role) {
            const rep = reportRoleOpen(consortDir, role, process.env);
            if (rep) process.stdout.write(`${rep}
`);
          }
        }
        if (c.stop) return emitStop(c);
      }
    }
    if (args.monitor) {
      const code = monitorStopCheck();
      if (code !== null) return code;
    } else if (args.pid && !alive(args.pid) && fs4.statSync(logPath).size <= offset) {
      const last = scanLastStop(logPath);
      if (last) {
        process.stdout.write(`${PREFIX[last.kind]} ${last.text}
`);
        return emitStop(last);
      }
      process.stderr.write(`consort-watch: drive pid ${args.pid} is no longer running (no terminal line seen).
`);
      return 3;
    }
    if (args.timeout > 0 && (Date.now() - watchStart) / 1e3 >= args.timeout) {
      process.stderr.write(
        `consort-watch: still running after ${args.timeout}s and no gate yet \u2013 the drive continues in the background. Re-run \`consort-watch\` to keep relaying (or pass --timeout 0 when running consort-watch itself detached).
`
      );
      return 0;
    }
    await sleep(400);
  }
}
if (isCliEntry(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((e) => {
    process.stderr.write(`consort-watch: ${e instanceof Error ? e.message : String(e)}
`);
    process.exit(1);
  });
}
export {
  classifyPidGone,
  logIsFromDrive,
  pollOnce,
  readNextStop,
  reportRoleOpen,
  scanLastStop
};
