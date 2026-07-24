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

// scripts/lakebase/create-project.ts
var fs2 = __toESM(require("fs"), 1);

// scripts/sftdd/sftdd-paths.ts
var fs = __toESM(require("fs"), 1);
var import_node_path = require("path");
var ARTIFACT_ROOT = ".sftdd";

// scripts/lakebase/create-project.ts
var path = __toESM(require("path"), 1);
var import_lakebase = require("@databricks-solutions/lakebase-scm-utils/lakebase");
var import_lakebase2 = require("@databricks-solutions/lakebase-scm-utils/lakebase");
var import_github = require("@databricks-solutions/lakebase-scm-utils/github");
var import_git = require("@databricks-solutions/lakebase-scm-utils/git");
var import_git2 = require("@databricks-solutions/lakebase-scm-utils/git");
var import_git3 = require("@databricks-solutions/lakebase-scm-utils/git");
var import_lakebase3 = require("@databricks-solutions/lakebase-scm-utils/lakebase");
var import_lakebase4 = require("@databricks-solutions/lakebase-scm-utils/lakebase");
var import_lakebase5 = require("@databricks-solutions/lakebase-scm-utils/lakebase");
var import_lakebase6 = require("@databricks-solutions/lakebase-scm-utils/lakebase");
var import_lakebase7 = require("@databricks-solutions/lakebase-scm-utils/lakebase");
var import_lakebase8 = require("@databricks-solutions/lakebase-scm-utils/lakebase");
var import_lakebase9 = require("@databricks-solutions/lakebase-scm-utils/lakebase");
var import_util = require("@databricks-solutions/lakebase-scm-utils/util");
var import_util2 = require("@databricks-solutions/lakebase-scm-utils/util");
var import_lakebase10 = require("@databricks-solutions/lakebase-scm-utils/lakebase");

// scripts/sftdd/sftdd-config.ts
var import_fs = require("fs");
var import_path2 = require("path");

// scripts/sftdd/agent-models.ts
var import_path = require("path");
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
var AGENT_CONFIG_REL = (0, import_path.join)(".lakebase", "agent-config.json");

// scripts/sftdd/sftdd-config.ts
var SFTDD_CONFIG_REL = (0, import_path2.join)(".lakebase", "sftdd-config.json");
var LEGACY_TDD_CONFIG_REL = (0, import_path2.join)(".lakebase", "tdd-config.json");
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
  const f = (0, import_path2.join)(projectDir, TDD_CONFIG_REL);
  if ((0, import_fs.existsSync)(f) && !opts?.force) return false;
  (0, import_fs.mkdirSync)((0, import_path2.dirname)(f), { recursive: true });
  (0, import_fs.writeFileSync)(f, JSON.stringify(config, null, 2) + "\n");
  return true;
}

// scripts/lakebase/create-project.ts
async function createProject(input, progress) {
  const report = progress ?? (() => {
  });
  const projectDir = path.join(input.parentDir, input.projectName);
  const lakebaseProjectId = input.projectName;
  const host = input.databricksHost.replace(/\/+$/, "");
  const useGithub = input.createGithubRepo !== false;
  const language = input.language ?? "java";
  const runnerType = input.runnerType ?? "self-hosted";
  const enableSftdd = input.enableSftdd !== false;
  const uiTrack = input.uiTrack === true;
  const enableE2e = uiTrack || (input.enableE2e !== void 0 ? input.enableE2e : language === "nodejs");
  const clientFramework = input.clientFramework ?? (uiTrack ? "react" : "none");
  if (uiTrack && !enableE2e) {
    throw new Error(
      "create-project: uiTrack requires the e2e harness; a UI project cannot be scaffolded without it."
    );
  }
  const enableInfra = input.enableInfra !== void 0 ? input.enableInfra : language === "nodejs";
  const skipCommands = input.skipCommands === true;
  const tiers = input.tiers;
  const warnings = [];
  if (useGithub && !input.githubOwner) {
    throw new Error("GitHub owner is required when creating a GitHub repository");
  }
  if (!useGithub && fs2.existsSync(projectDir)) {
    throw new Error(`Directory already exists: ${projectDir}`);
  }
  const fullRepoName = input.githubOwner ? `${input.githubOwner}/${input.projectName}` : "";
  report("Checking Databricks authentication...");
  const auth = await (0, import_lakebase4.checkDatabricksAuth)(host);
  if (!auth.ok) {
    throw new Error((0, import_lakebase4.databricksAuthPrereqMessage)(host, auth.reason));
  }
  if (useGithub) {
    report("Creating GitHub repository...", fullRepoName);
    await (0, import_github.createRepo)(fullRepoName, {
      private: input.privateRepo !== false,
      description: `Lakebase project: ${input.projectName}`
    });
    report("Waiting for GitHub repo to be visible...", fullRepoName);
    const probeDelays = [1e3, 2e3, 3e3, 5e3, 8e3];
    let probeErr = "";
    let visible = false;
    for (const waitMs of probeDelays) {
      try {
        await (0, import_github.getRepoFullName)(fullRepoName);
        visible = true;
        break;
      } catch (err) {
        probeErr = err instanceof Error ? err.message : String(err);
        await (0, import_util2.delay)(waitMs);
      }
    }
    if (!visible) {
      let activeUser = "";
      try {
        activeUser = await (0, import_github.getCurrentUser)();
      } catch {
      }
      const samlHint = /SAML|scope does not match|sso/i.test(probeErr) ? "\n\nThe error mentions SAML \u2013 re-sign in to GitHub and authorize SSO for this org." : "";
      const userHint = activeUser && activeUser !== input.githubOwner ? `

Note: signed in as "${activeUser}", but the repo was created under "${input.githubOwner}".` : "";
      throw new Error(
        `GitHub repo "${fullRepoName}" was created but isn't visible after ~19s of polling.${samlHint}${userHint}

Last probe error:
  ${probeErr.split("\n")[0].slice(0, 200)}`
      );
    }
    report("Cloning repository...", projectDir);
    await (0, import_git.cloneRepo)({
      repoUrl: `https://github.com/${fullRepoName}.git`,
      parentDir: input.parentDir
    });
  } else {
    report("Creating local project directory...", projectDir);
    if (fs2.existsSync(projectDir)) {
      throw new Error(`Directory already exists: ${projectDir}`);
    }
    fs2.mkdirSync(projectDir, { recursive: true });
    await (0, import_git2.gitInit)(projectDir);
  }
  report("Creating Lakebase database...", lakebaseProjectId);
  await (0, import_lakebase3.createLakebaseProject)({ projectId: lakebaseProjectId, host });
  return await (0, import_lakebase4.withLakebaseRollback)(
    { projectId: lakebaseProjectId, host, report },
    async () => {
      report("Resolving database endpoint...");
      const defaultBranchId = await (0, import_lakebase3.getDefaultBranchId)({
        projectId: lakebaseProjectId,
        host
      });
      report("Scaffolding project files...");
      await (0, import_lakebase5.scaffoldAll)({
        targetDir: projectDir,
        databricksHost: host,
        lakebaseProjectId,
        language,
        runnerType,
        skipCommands,
        clientFramework,
        report: (m, d) => report(m, d)
      });
      if (enableSftdd) {
        report("Scaffolding .sftdd/ workflow directory...");
        layDownTddScaffold(projectDir);
      }
      if (enableE2e) {
        report("Wiring Playwright E2E support...");
        const e2e = (0, import_lakebase7.enableE2eForProject)({
          projectDir,
          language,
          clientOwnsE2e: clientFramework !== "none"
        });
        if (e2e.templatesWritten.length > 0) {
          report(`  wrote ${e2e.templatesWritten.length} Playwright template(s)`);
        }
        if (e2e.packageJson.patched && (e2e.packageJson.scriptAdded || e2e.packageJson.depAdded)) {
          report("  patched package.json (test:e2e + @playwright/test)");
        } else if (!e2e.packageJson.patched) {
          report("  package.json absent, skipped npm wiring (non-Node project)");
        }
        if (e2e.runTestsScript.inserted) {
          report("  patched scripts/run-tests.sh");
        }
      }
      if (enableInfra) {
        report("Wiring [Infra]-tag runner support...");
        const infra = (0, import_lakebase8.enableInfraForProject)({ projectDir });
        if (infra.packageJson.patched && infra.packageJson.scriptAdded) {
          report("  patched package.json (test:infra)");
        } else if (!infra.packageJson.patched) {
          report("  package.json absent, skipped npm wiring (non-Node project)");
        }
        if (infra.runTestsScript.inserted) {
          report("  patched scripts/run-tests.sh (infra block)");
        }
      }
      if (useGithub) {
        report("Setting up CI auth (service principal)...");
        try {
          await (0, import_util.syncCiSecrets)({
            projectDir,
            databricksHost: host,
            lakebaseProjectId,
            comment: "GitHub Actions CI",
            lifetimeSeconds: 86400,
            ownerRepo: fullRepoName
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(`CI auth setup failed: ${msg}`);
          report(`Warning: CI auth setup failed (${msg})`);
        }
      }
      if (useGithub && runnerType === "self-hosted") {
        report("Setting up self-hosted runner...");
        try {
          await (0, import_lakebase9.setupRunner)({
            fullRepoName,
            projectName: input.projectName,
            report: (m) => report(m)
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(`Runner setup failed: ${msg}`);
          report(`Warning: runner setup failed (${msg}). CI workflows will queue until a runner is available.`);
        }
      } else if (useGithub) {
        report("Using GitHub-hosted runners \u2013 no local runner needed.");
      } else {
        report("Skipping runner setup (no GitHub repository).");
      }
      try {
        (0, import_lakebase10.writeWorkflowState)(
          projectDir,
          (0, import_lakebase10.initWorkflowState)({
            projectId: lakebaseProjectId,
            tierTopology: tiers ?? 1
          })
        );
      } catch (err) {
        warnings.push(
          `SCM workflow-state seed failed (advisory): ${err instanceof Error ? err.message : String(err)}. Run lakebase-scm-state to inspect.`
        );
      }
      if (enableSftdd) {
        try {
          const sftddConfig = defaultSftddConfig();
          for (const [role, model] of Object.entries(input.agentModels ?? {})) {
            if (model && sftddConfig.roles?.[role]) {
              sftddConfig.roles[role].model = model;
            }
          }
          if (sftddConfig.project) {
            sftddConfig.project.uiTrack = uiTrack;
            sftddConfig.project.clientFramework = clientFramework;
          }
          writeSftddConfig(projectDir, sftddConfig);
        } catch (err) {
          warnings.push(
            `SFTDD config seed failed (advisory): ${err instanceof Error ? err.message : String(err)}. The role defaults still apply.`
          );
        }
      }
      if (enableSftdd) {
        const kitRef = process.env.LAKEBASE_KIT_REF?.trim();
        if (kitRef) {
          try {
            const dir = path.join(projectDir, ".lakebase");
            fs2.mkdirSync(dir, { recursive: true });
            fs2.writeFileSync(path.join(dir, "kit-ref"), `${kitRef}
`, "utf8");
          } catch (err) {
            warnings.push(`Kit ref pin failed (advisory): ${err instanceof Error ? err.message : String(err)}.`);
          }
        }
        report("Warming + verifying the kit fast-CLI cache...");
        const warm = (0, import_lakebase4.warmAndVerifyKit)(projectDir);
        if (!warm.ok) {
          const msg = (0, import_lakebase4.kitWarmWarning)(projectDir, warm.reason);
          warnings.push(msg);
          report(`Warning: ${msg}`);
        }
      }
      const langLabels = {
        java: "Java/Spring Boot",
        kotlin: "Kotlin/Spring Boot",
        python: "Python/FastAPI",
        nodejs: "Node.js/Express"
      };
      const langLabel = langLabels[language] ?? language;
      report("Creating initial commit...");
      await (0, import_git3.commitAndPush)({
        projectDir,
        message: `Initial project scaffold (${langLabel} + Lakebase)`,
        push: useGithub
      });
      if (tiers === 2 || tiers === 3) {
        if (!useGithub) {
          warnings.push(
            `tiers === ${tiers} requires a GitHub repository (createLongRunningBranch pushes the tier's git side to origin). Extra tiers were NOT cut.`
          );
        } else {
          report(`Cutting staging tier (tiers=${tiers}) via createLongRunningBranch...`);
          try {
            await (0, import_lakebase6.createLongRunningBranch)({
              name: "staging",
              forkFromBranch: "main",
              projectId: lakebaseProjectId,
              workTreeDir: projectDir,
              databricksHost: host
            });
          } catch (err) {
            warnings.push(
              `tiers === ${tiers} requested but createLongRunningBranch for staging failed: ${err instanceof Error ? err.message : String(err)}.`
            );
          }
          if (tiers === 3) {
            report("Cutting dev tier (tiers=3) via createLongRunningBranch (off staging)...");
            try {
              await (0, import_lakebase6.createLongRunningBranch)({
                name: "dev",
                forkFromBranch: "staging",
                projectId: lakebaseProjectId,
                workTreeDir: projectDir,
                databricksHost: host
              });
            } catch (err) {
              warnings.push(
                `tiers === 3 requested but createLongRunningBranch for dev failed: ${err instanceof Error ? err.message : String(err)}.`
              );
            }
          }
        }
      }
      report("Verifying project...");
      const health = (0, import_lakebase2.verifyProject)(projectDir);
      for (const w of health.warnings) {
        warnings.push(w);
        report(`Warning: ${w}`);
      }
      report("Project created successfully!");
      if (enableSftdd) {
        report(`Next: cd ${projectDir} && ./scripts/sftdd.sh plan`);
      }
      report(`Review the running app: cd ${projectDir} && ./scripts/run-dev.sh`);
      return {
        projectDir,
        githubRepoUrl: useGithub ? `https://github.com/${fullRepoName}` : void 0,
        lakebaseProjectId,
        lakebaseDefaultBranch: defaultBranchId,
        warnings
      };
    }
    // end withLakebaseRollback closure
  );
}
function layDownTddScaffold(targetDir) {
  const candidates = [
    path.resolve(__dirname, `../../templates/sftdd-bootstrap/${ARTIFACT_ROOT}`),
    path.resolve(__dirname, `../../../templates/sftdd-bootstrap/${ARTIFACT_ROOT}`)
  ];
  const source = candidates.find((c) => fs2.existsSync(c));
  if (!source) {
    throw new Error(`sftdd-bootstrap template not found; looked in: ${candidates.join(", ")}`);
  }
  const dest = path.join(targetDir, ARTIFACT_ROOT);
  if (fs2.existsSync(dest)) {
    return;
  }
  fs2.cpSync(source, dest, { recursive: true });
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
//# sourceMappingURL=create-project.cli.cjs.map