#!/usr/bin/env node

// scripts/lakebase/create-project.ts
import {
  createProject as baseCreateProject
} from "@databricks-solutions/lakebase-scm-utils/lakebase";

// scripts/sftdd/project-sftdd-setup.ts
import * as fs3 from "fs";
import * as path2 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// scripts/sftdd/sftdd-paths.ts
import * as fs from "fs";
import { join } from "path";
var ARTIFACT_ROOT = ".sftdd";

// scripts/sftdd/sftdd-config.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, mkdirSync as mkdirSync2, writeFileSync as writeFileSync2 } from "fs";
import { dirname as dirname2, join as join3 } from "path";

// scripts/sftdd/agent-models.ts
import { dirname, join as join2 } from "path";
var RECOMMENDED_MODELS = {
  "spec-author": "opus",
  "architect-reviewer": "opus",
  "test-strategist": "sonnet",
  "ux-designer": "sonnet",
  navigator: "sonnet",
  driver: "sonnet",
  "product-owner": "opus",
  "release-engineer": "sonnet"
};
var ALL_AGENT_ROLES = Object.keys(RECOMMENDED_MODELS);
var AGENT_CONFIG_REL = join2(".lakebase", "agent-config.json");

// scripts/sftdd/sftdd-config.ts
var SFTDD_CONFIG_REL = join3(".lakebase", "sftdd-config.json");
var LEGACY_TDD_CONFIG_REL = join3(".lakebase", "tdd-config.json");
var TDD_CONFIG_REL = SFTDD_CONFIG_REL;
function defaultSftddConfig() {
  const roles = {};
  for (const role of ALL_AGENT_ROLES) {
    roles[role] = role === "navigator" ? { model: RECOMMENDED_MODELS[role], effort: { review: "low" } } : role === "driver" ? (
      // Model tiering: RED (test authoring) + GREEN (implementation) keep the
      // recommended model; only the mechanical REFACTOR turn drops to a fast
      // model. GREEN was on haiku, but the recorded worst GREEN turn thrashed
      // 93 tool round-trips (haiku's trial-and-error), so wall-clock, not token
      // cost, dominated. Sonnet finishes GREEN in far fewer round-trips, faster
      // even at a higher per-token price. Overridable per project by editing
      // sftdd-config.json (a project can flatten to a scalar `model`).
      { model: { red: RECOMMENDED_MODELS[role], green: RECOMMENDED_MODELS[role], refactor: "haiku" } }
    ) : { model: RECOMMENDED_MODELS[role] };
  }
  return {
    version: 1,
    roles,
    build: { loopGranularity: "story", batchCap: 3, sessionScope: "story" },
    plan: { sizing: true },
    project: { uiTrack: false, gates: "interactive", deployTarget: "local", clientFramework: "none" }
  };
}
function writeSftddConfig(projectDir, config, opts) {
  const f = join3(projectDir, TDD_CONFIG_REL);
  if (existsSync2(f) && !opts?.force) return false;
  mkdirSync2(dirname2(f), { recursive: true });
  writeFileSync2(f, JSON.stringify(config, null, 2) + "\n");
  return true;
}

// scripts/lakebase/adopt-sftdd.ts
import * as fs2 from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// scripts/sftdd/project-sftdd-setup.ts
var __dirname2 = path2.dirname(fileURLToPath2(import.meta.url));
function layDownTddScaffold(targetDir) {
  const candidates = [
    path2.resolve(__dirname2, `../../templates/sftdd-bootstrap/${ARTIFACT_ROOT}`),
    path2.resolve(__dirname2, `../../../templates/sftdd-bootstrap/${ARTIFACT_ROOT}`)
  ];
  const source = candidates.find((c) => fs3.existsSync(c));
  if (!source) {
    throw new Error(`sftdd-bootstrap template not found; looked in: ${candidates.join(", ")}`);
  }
  const dest = path2.join(targetDir, ARTIFACT_ROOT);
  if (fs3.existsSync(dest)) {
    return;
  }
  fs3.cpSync(source, dest, { recursive: true });
}
function seedSftddConfig(projectDir, opts) {
  const sftddConfig = defaultSftddConfig();
  for (const [role, model] of Object.entries(opts.agentModels ?? {})) {
    if (model && sftddConfig.roles?.[role]) {
      sftddConfig.roles[role].model = model;
    }
  }
  if (sftddConfig.project) {
    sftddConfig.project.uiTrack = opts.uiTrack ?? false;
    sftddConfig.project.clientFramework = opts.clientFramework;
  }
  writeSftddConfig(projectDir, sftddConfig);
}
var kitSftddHooks = {
  layDownScaffold: layDownTddScaffold,
  seedConfig: seedSftddConfig
};

// scripts/lakebase/create-project.ts
function createProject(input, progress) {
  return baseCreateProject(
    { ...input, sftddHooks: input.sftddHooks ?? kitSftddHooks },
    progress
  );
}

// scripts/lakebase/create-project.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--json-input":
        out.jsonInput = argv[++i];
        break;
      case "--project-name":
        out.projectName = argv[++i];
        break;
      case "--parent-dir":
        out.parentDir = argv[++i];
        break;
      case "--databricks-host":
        out.databricksHost = argv[++i];
        break;
      case "--github-owner":
        out.githubOwner = argv[++i];
        break;
      case "--no-github":
        out.createGithubRepo = false;
        break;
      case "--public":
        out.privateRepo = false;
        break;
      case "--language":
        out.language = argv[++i];
        break;
      case "--runner":
        out.runnerType = argv[++i];
        break;
      case "--tiers": {
        const v = Number.parseInt(argv[++i], 10);
        if (v !== 1 && v !== 2 && v !== 3) {
          process.stderr.write(
            `--tiers: expected 1, 2, or 3. Got: ${argv[i]}
  1 = prod only (features fork from prod)
  2 = prod + staging (features fork from staging)
  3 = prod + staging + dev (features fork from dev)
  Features are short-lived branches, NOT counted as tiers.
`
          );
          out.help = true;
        } else {
          out.tiers = v;
        }
        break;
      }
      case "--enable-e2e":
        out.enableE2e = true;
        break;
      case "--no-e2e":
        out.enableE2e = false;
        break;
      case "--enable-infra":
        out.enableInfra = true;
        break;
      case "--no-infra":
        out.enableInfra = false;
        break;
      case "--ui-track":
        out.uiTrack = true;
        break;
      case "--no-ui-track":
        out.uiTrack = false;
        break;
      case "--client":
        out.clientFramework = argv[++i];
        break;
      case "--skip-commands":
        out.skipCommands = true;
        break;
      case "--agent-model": {
        const pair = argv[++i] ?? "";
        const eq = pair.indexOf("=");
        const role = eq >= 0 ? pair.slice(0, eq) : "";
        const model = eq >= 0 ? pair.slice(eq + 1) : "";
        if (!ALL_AGENT_ROLES.includes(role) || !model) {
          process.stderr.write(
            `--agent-model: expected <role>=<model> with a known role. Got: ${JSON.stringify(pair)}
  roles: ${ALL_AGENT_ROLES.join(", ")}
`
          );
          out.help = true;
        } else {
          (out.agentModels ??= {})[role] = model;
        }
        break;
      }
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        break;
    }
  }
  return out;
}
var HELP = `lakebase-create-project \u2013 bootstrap a fresh Lakebase-paired project

Usage:
  lakebase-create-project --project-name <name> --parent-dir <dir> --databricks-host <url> [--github-owner <owner>] [flags...]
  lakebase-create-project --json-input '{"projectName": "...", ...}'

Flags:
  --project-name      Project name (Lakebase id + local dir name)            [required]
  --parent-dir        Parent directory for the new project                   [required]
  --databricks-host   Databricks workspace URL                               [required]
  --github-owner      GitHub user/org for the repo                           [required unless --no-github]
  --no-github         Skip GitHub repo creation (local-only)
  --public            Make the GitHub repo public (default: private)
  --language          java | kotlin | python | nodejs    (default: java)
  --runner            self-hosted | github-hosted        (default: self-hosted)
  --tiers             1, 2, or 3. Tier count (features are NOT tiers).
                        1 = prod only           (features fork from prod)
                        2 = prod + staging      (features fork from staging)
                        3 = prod + staging + dev (features fork from dev)
                      When omitted, defaults to 1 (prod only, no extra tiers
                      cut). Architectural choice; surface this in your wizard
                      rather than picking silently.
  --enable-e2e        Force-enable Playwright E2E wire-up
  --no-e2e            Force-disable Playwright E2E wire-up
                      (default: on for --language nodejs, off otherwise)
  --enable-infra      Force-enable [Infra]-tag runner wire-up
  --no-infra          Force-disable [Infra]-tag runner wire-up
                      (default: on for --language nodejs, off otherwise)
  --ui-track          Mark the project as having a UI. The single source for the
  --no-ui-track       UX track: persists project.uiTrack (the drive reads it to
                      run the UX Designer + design-guide/IA + adherence gate) and,
                      when on, always wires the e2e harness. Default: off.
  --client            react | none. Frontend to scaffold under client/.
                      "react" lays down the first-class React + TS + Vite SPA
                      (Vitest + Testing Library + Playwright). Default: react
                      for a --ui-track project, none otherwise.
  --skip-commands     Skip scaffolding .claude/commands/{design,build}.md
                      (default: commands are written)
  --agent-model       <role>=<model>, repeatable. Override a TDD role agent's
                      recommended model for this project (asked at setup; the
                      HIL's call). Roles: spec-author, architect-reviewer,
                      test-strategist, ux-designer, navigator, driver,
                      product-owner, release-engineer. Omitted roles use their
                      recommended model. Persisted to .lakebase/agent-config.json.
  --json-input        Pass all args as a single JSON object (BDD harness)

Output: JSON on stdout (CreateProjectResult). Progress to stderr.
`;
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  let input;
  if (args.jsonInput) {
    try {
      input = JSON.parse(args.jsonInput);
    } catch (err) {
      process.stderr.write(`Failed to parse --json-input: ${err instanceof Error ? err.message : String(err)}
`);
      return 2;
    }
  } else {
    if (!args.projectName || !args.parentDir || !args.databricksHost) {
      process.stderr.write("Error: --project-name, --parent-dir, --databricks-host are required.\n\n" + HELP);
      return 2;
    }
    input = {
      projectName: args.projectName,
      parentDir: args.parentDir,
      databricksHost: args.databricksHost,
      githubOwner: args.githubOwner,
      createGithubRepo: args.createGithubRepo,
      privateRepo: args.privateRepo,
      language: args.language,
      runnerType: args.runnerType,
      tiers: args.tiers,
      enableE2e: args.enableE2e,
      enableInfra: args.enableInfra,
      uiTrack: args.uiTrack,
      clientFramework: args.clientFramework,
      skipCommands: args.skipCommands,
      agentModels: args.agentModels
    };
  }
  const result = await createProject(input, (step, detail) => {
    process.stderr.write(`[${step}]${detail ? ` ${detail}` : ""}
`);
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return 0;
}
main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
    process.exit(1);
  }
);
//# sourceMappingURL=create-project.cli.js.map