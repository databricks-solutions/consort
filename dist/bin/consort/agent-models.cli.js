#!/usr/bin/env node

// consort/config/agent-models.ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
var RECOMMENDED_MODELS = {
  "spec-author": "opus",
  "architect-reviewer": "opus",
  dba: "opus",
  "test-strategist": "sonnet",
  "ux-designer": "sonnet",
  navigator: "sonnet",
  driver: "sonnet",
  "product-owner": "opus"
};
var ALL_AGENT_ROLES = Object.keys(RECOMMENDED_MODELS);
var KNOWN_MODEL_ALIASES = ["opus", "sonnet", "haiku"];
var AGENT_CONFIG_REL = join(".lakebase", "agent-config.json");
function readAgentConfig(projectDir) {
  const p = join(projectDir, AGENT_CONFIG_REL);
  if (!existsSync(p)) return void 0;
  return JSON.parse(readFileSync(p, "utf8"));
}
function resolveModelForRole(role, projectDir) {
  const spawnable = role;
  const entry = readAgentConfig(projectDir)?.roles?.[spawnable];
  return entry?.override ?? entry?.recommended ?? RECOMMENDED_MODELS[spawnable] ?? "inherit";
}

// consort/config/consort-config-file.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, mkdirSync as mkdirSync2, writeFileSync as writeFileSync2 } from "fs";
import { dirname as dirname2, join as join2 } from "path";
var CONSORT_CONFIG_REL = join2(".lakebase", "consort-config.json");
var LEGACY_CONFIG_RELS = [
  join2(".lakebase", "sftdd-config.json"),
  join2(".lakebase", "tdd-config.json")
];
var LEGACY_TDD_CONFIG_REL = LEGACY_CONFIG_RELS[0];
function loadConsortConfig(projectDir) {
  for (const rel of [CONSORT_CONFIG_REL, ...LEGACY_CONFIG_RELS]) {
    const f = join2(projectDir, rel);
    if (!existsSync2(f)) continue;
    try {
      return JSON.parse(readFileSync2(f, "utf8"));
    } catch {
      return void 0;
    }
  }
  return void 0;
}

// consort/config/step-key.ts
var ALL_BUILD_TURNS = ["red", "green", "review", "refactor", "assess", "repair", "reflect", "reconcile", "reauthor"];
var ALL_DESIGN_STEPS = ["breakdown", "propose", "acs", "estimate", "architect", "dba", "test-list", "ux"];
var ALL_TURN_KEYS = [...ALL_BUILD_TURNS, ...ALL_DESIGN_STEPS];
var ALL_EFFORT_LEVELS = ["default", "low", "medium", "high", "xhigh", "max"];

// consort/config/model-config-doctor.ts
function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}
function closest(value, candidates) {
  let best;
  let bestD = Infinity;
  for (const c of candidates) {
    const dist = editDistance(value.toLowerCase(), c.toLowerCase());
    if (dist < bestD) {
      bestD = dist;
      best = c;
    }
  }
  if (best === void 0) return void 0;
  const threshold = Math.max(2, Math.floor(Math.max(value.length, best.length) / 3));
  return bestD <= threshold ? best : void 0;
}
function isQualifiedOrSentinel(value) {
  const v = value.trim().toLowerCase();
  if (v === "inherit" || v === "default") return true;
  if (v.includes("/") || v.includes(".")) return true;
  if (/^claude-(opus|sonnet|haiku)-/.test(v)) return true;
  return false;
}
function lintModelValue(role, value, step) {
  if (KNOWN_MODEL_ALIASES.includes(value) || isQualifiedOrSentinel(value)) return void 0;
  const suggestion = closest(value, KNOWN_MODEL_ALIASES);
  return {
    role,
    ...step ? { step } : {},
    field: "model",
    value,
    ...suggestion ? { suggestion } : {},
    reason: `"${value}" is not a known model alias (known: ${KNOWN_MODEL_ALIASES.join(", ")}; a fully-qualified id such as system.ai.claude-opus-5-5 is also accepted)`
  };
}
function lintEffortValue(role, value, step) {
  if (ALL_EFFORT_LEVELS.includes(value)) return void 0;
  const suggestion = closest(value, ALL_EFFORT_LEVELS);
  return {
    role,
    ...step ? { step } : {},
    field: "effort",
    value,
    ...suggestion ? { suggestion } : {},
    reason: `"${value}" is not a valid effort level (${ALL_EFFORT_LEVELS.join(", ")})`
  };
}
function lintStepKey(role, step) {
  if (ALL_TURN_KEYS.includes(step)) return void 0;
  const suggestion = closest(step, ALL_TURN_KEYS);
  return {
    role,
    step,
    field: "step-key",
    value: step,
    ...suggestion ? { suggestion } : {},
    reason: `"${step}" is not a known step key, so this per-step override is silently ignored (keys: ${ALL_TURN_KEYS.join(", ")})`
  };
}
function lintRole(role, entry) {
  const out = [];
  const scan = (v, scalar, perStep) => {
    if (typeof v === "string") {
      const f = scalar(role, v);
      if (f) out.push(f);
    } else if (v && typeof v === "object") {
      for (const [step, val] of Object.entries(v)) {
        const kf = lintStepKey(role, step);
        if (kf) out.push(kf);
        if (typeof val === "string") {
          const f = perStep(role, val, step);
          if (f) out.push(f);
        }
      }
    }
  };
  scan(entry.model, (r, val) => lintModelValue(r, val), (r, val, step) => lintModelValue(r, val, step));
  scan(entry.effort, (r, val) => lintEffortValue(r, val), (r, val, step) => lintEffortValue(r, val, step));
  return out;
}
function lintModelConfig(projectDir) {
  const cfg = loadConsortConfig(projectDir);
  const roles = cfg?.roles;
  if (!roles) return [];
  const out = [];
  for (const [role, entry] of Object.entries(roles)) {
    if (entry) out.push(...lintRole(role, entry));
  }
  return out;
}
function formatFindings(findings) {
  return findings.map((f) => {
    const where = f.step ? `roles.${f.role}.${f.field === "step-key" ? "model/effort" : f.field}["${f.step}"]` : `roles.${f.role}.${f.field}`;
    const fix = f.suggestion ? ` \u2014 did you mean "${f.suggestion}"?` : "";
    return `  ${where}: ${f.reason}${fix}`;
  }).join("\n");
}

// bin/consort/agent-models.cli.ts
function parse(argv) {
  const out = { projectDir: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--role") out.role = argv[++i];
    else if (a === "--list") out.list = true;
    else if (a === "--doctor") out.doctor = true;
    else if (a === "--project-dir") out.projectDir = argv[++i];
    else if (a === "--json") out.json = true;
  }
  return out;
}
function main() {
  const args = parse(process.argv.slice(2));
  if (args.doctor) {
    const findings = lintModelConfig(args.projectDir);
    if (args.json) {
      process.stdout.write(JSON.stringify(findings, null, 2) + "\n");
    } else if (findings.length === 0) {
      process.stdout.write("\u2713 model config OK \u2014 every configured model/effort/step matches the kit's known set\n");
    } else {
      process.stderr.write(`Model config issues in .lakebase/consort-config.json:
${formatFindings(findings)}
`);
    }
    return findings.length === 0 ? 0 : 1;
  }
  if (args.list) {
    const cfg = readAgentConfig(args.projectDir);
    const rows = ALL_AGENT_ROLES.map((role2) => ({
      role: role2,
      recommended: cfg?.roles?.[role2]?.recommended,
      resolved: resolveModelForRole(role2, args.projectDir)
    }));
    if (args.json) {
      process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
    } else {
      for (const r of rows) process.stdout.write(`${r.role}	${r.resolved}
`);
    }
    return 0;
  }
  if (!args.role || !ALL_AGENT_ROLES.includes(args.role)) {
    process.stderr.write(
      `Usage: consort-agent-model --role <role> [--project-dir <dir>] [--json]
       consort-agent-model --list [--project-dir <dir>] [--json]
       consort-agent-model --doctor [--project-dir <dir>] [--json]
roles: ${ALL_AGENT_ROLES.join(", ")}
`
    );
    return 2;
  }
  const role = args.role;
  const resolved = resolveModelForRole(role, args.projectDir);
  if (args.json) {
    const entry = readAgentConfig(args.projectDir)?.roles?.[role];
    process.stdout.write(
      JSON.stringify({ role, resolved, recommended: entry?.recommended, override: entry?.override }, null, 2) + "\n"
    );
  } else {
    process.stdout.write(resolved + "\n");
  }
  return 0;
}
process.exit(main());
