#!/usr/bin/env node
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// scripts/sftdd/drive-log-report.cli.ts
var drive_log_report_cli_exports = {};
__export(drive_log_report_cli_exports, {
  runDriveLogReportCli: () => runDriveLogReportCli
});
module.exports = __toCommonJS(drive_log_report_cli_exports);

// node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
var importMetaUrl = /* @__PURE__ */ getImportMetaUrl();

// scripts/sftdd/drive-log-report.cli.ts
var import_fs = require("fs");
var import_util = require("@databricks-solutions/lakebase-scm-utils/util");

// scripts/sftdd/drive-log-report.ts
var TOOL_LINE = /^\s*·\s+(\S+)(?:\s+([\s\S]*))?$/;
var TURN_CLOSE = /^\[drive\]\s+([a-z][a-z-]*)\s+turn\s+([\d.]+)s\s+\(([a-z]+)\)/;
var DISCOVERY_FIRST_TOKEN = /^(find|grep|ls|cat|echo)\b/;
function round(n) {
  return Math.round(n * 10) / 10;
}
function classifyToolCall(tool, rest) {
  if (tool !== "Bash") return "other";
  if (/\bpytest\b/.test(rest)) return "pytest";
  if (DISCOVERY_FIRST_TOKEN.test(rest.trimStart())) return "discovery";
  return "other";
}
function parseDriveLog(text) {
  const turns = [];
  let byTool = {};
  let toolCalls = 0;
  let pytestRuns = 0;
  let discoveryCalls = 0;
  const reset = () => {
    byTool = {};
    toolCalls = 0;
    pytestRuns = 0;
    discoveryCalls = 0;
  };
  for (const line of text.split("\n")) {
    const close = TURN_CLOSE.exec(line);
    if (close) {
      turns.push({
        role: close[1],
        model: close[3],
        seconds: Number(close[2]),
        toolCalls,
        byTool,
        pytestRuns,
        discoveryCalls
      });
      reset();
      continue;
    }
    const tool = TOOL_LINE.exec(line);
    if (tool) {
      const name = tool[1];
      const rest = tool[2] ?? "";
      byTool[name] = (byTool[name] ?? 0) + 1;
      toolCalls += 1;
      const cls = classifyToolCall(name, rest);
      if (cls === "pytest") pytestRuns += 1;
      else if (cls === "discovery") discoveryCalls += 1;
    }
  }
  return {
    turns,
    byRole: rollup(turns, (t) => t.role),
    byModel: rollup(turns, (t) => t.model),
    totalSeconds: round(turns.reduce((a, t) => a + t.seconds, 0)),
    totalToolCalls: turns.reduce((a, t) => a + t.toolCalls, 0)
  };
}
function rollup(turns, keyOf) {
  const acc = /* @__PURE__ */ new Map();
  for (const t of turns) {
    const key = keyOf(t);
    const cur = acc.get(key) ?? { turns: 0, seconds: 0, calls: 0, maxCalls: 0 };
    cur.turns += 1;
    cur.seconds += t.seconds;
    cur.calls += t.toolCalls;
    cur.maxCalls = Math.max(cur.maxCalls, t.toolCalls);
    acc.set(key, cur);
  }
  return [...acc.entries()].map(([key, v]) => ({
    key,
    turns: v.turns,
    seconds: round(v.seconds),
    toolCalls: v.calls,
    avgSeconds: round(v.seconds / v.turns),
    avgToolCalls: round(v.calls / v.turns),
    maxToolCalls: v.maxCalls
  })).sort((a, b) => b.seconds - a.seconds);
}
function fmtSecs(n) {
  if (n >= 60) {
    const m = Math.floor(n / 60);
    const s = Math.round(n % 60);
    return `${m}m${String(s).padStart(2, "0")}s`;
  }
  return `${n.toFixed(1)}s`;
}
function rollupBlock(title, rows) {
  if (rows.length === 0) return `${title}
  (none)
`;
  const keyW = Math.max(title.length, ...rows.map((r) => r.key.length));
  const lines = rows.map(
    (r) => `  ${r.key.padEnd(keyW)}  ${fmtSecs(r.seconds).padStart(8)}  (${r.turns}x, avg ${fmtSecs(r.avgSeconds)}, ${r.toolCalls} calls, avg ${r.avgToolCalls}/turn, max ${r.maxToolCalls})`
  );
  return `${title}
${lines.join("\n")}
`;
}
function formatDriveLogReport(report, topN = 10) {
  if (report.turns.length === 0) return "drive-log: no turn-close lines found (need a stream-json drive log).\n";
  const out = [];
  out.push(
    `drive-log tool-calls , ${report.turns.length} turns, ${report.totalToolCalls} tool calls over ${fmtSecs(report.totalSeconds)}`
  );
  out.push("");
  out.push(rollupBlock("by role", report.byRole));
  out.push(rollupBlock("by model", report.byModel));
  const worst = [...report.turns].sort((a, b) => b.toolCalls - a.toolCalls).slice(0, topN);
  out.push(`heaviest ${worst.length} turns (by tool calls)`);
  for (const t of worst) {
    const bash = t.byTool.Bash ?? 0;
    out.push(
      `  ${String(t.toolCalls).padStart(3)} calls  ${fmtSecs(t.seconds).padStart(8)}  ${t.role}/${t.model}  [Bash ${bash}: ${t.pytestRuns} pytest, ${t.discoveryCalls} discovery]`
    );
  }
  return `${out.join("\n")}
`;
}

// scripts/sftdd/drive-log-report.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--top": {
        const n = Number(argv[++i]);
        if (!Number.isFinite(n) || n < 0) return { error: "--top expects a non-negative number" };
        out.top = Math.floor(n);
        break;
      }
      case "--json":
        out.json = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        if (a.startsWith("-")) return { error: `unknown arg: ${a}` };
        if (out.file) return { error: "only one log file may be given" };
        out.file = a;
    }
  }
  return out;
}
var HELP = `lakebase-sftdd-drive-log-report

Per-turn tool-call report from a drive stdout log. Counts the '\xB7 <tool>' lines
between each '[drive] <role> turn <s>s (<model>)' close, rolled up by role and
model, with the heaviest turns (by tool calls) and their pytest/discovery split.

  lakebase-sftdd-drive-log-report <log-file> [flags]
  ... | lakebase-sftdd-drive-log-report [flags]     (reads stdin when no file)
    --top <n>   how many heaviest turns to surface (default 10)
    --json      emit the DriveLogReport as JSON (the machine API)
    -h, --help
`;
function runDriveLogReportCli(argv) {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    process.stderr.write(`Error: ${parsed.error}

${HELP}
`);
    return 2;
  }
  if (parsed.help) {
    process.stdout.write(`${HELP}
`);
    return 0;
  }
  const text = parsed.file ? (0, import_fs.readFileSync)(parsed.file, "utf8") : (0, import_fs.readFileSync)(0, "utf8");
  const report = parseDriveLog(text);
  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}
`);
  } else {
    process.stdout.write(formatDriveLogReport(report, parsed.top));
  }
  return 0;
}
if ((0, import_util.isCliEntry)(importMetaUrl)) {
  process.exit(runDriveLogReportCli(process.argv.slice(2)));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runDriveLogReportCli
});
//# sourceMappingURL=drive-log-report.cli.cjs.map