#!/usr/bin/env node
// CLI wrapper around createProject. Supports two input modes:
//   --json-input '<json>'  – single JSON arg with all CreateProjectArgs
//   <named flags>          – individual --project-name, --parent-dir, etc.
//
// Output: JSON to stdout containing CreateProjectResult. Progress goes to
// stderr.

import { createProject, CreateProjectArgs } from "../../consort/lakebase/create-project.js";
import { setProjectExecutor } from "../../consort/config/consort-config-file.js";
import { ALL_AGENT_ROLES, type SpawnableAgentRole } from "../../consort/config/agent-models.js";
import { runCreateDoctorGate, formatGateBlockers } from "../../consort/lakebase/create-doctor-gate.js";
import { kitRefPin, recordDevKitLocalDirs, consortVersionFromModule, declaredSubstrateVersionFromModule } from "../../consort/lakebase/kit-ref-pin.js";
import { exportConsortVersionEnv } from "../../consort/config/kit-bin.js";
import { substrateMismatchMessage } from "../../consort/lakebase/substrate-check.js";
import { createRequire } from "node:module";
import { readFileSync, appendFileSync, writeFileSync, openSync, closeSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { relaunchDetached } from "../../consort/session/relaunch-detached.js";

interface ParsedArgs {
  jsonInput?: string;
  /** Tee the `[stage]` progress lines to this file (in addition to stderr), so a
   *  caller can tail/poll it for live relay regardless of how create was launched. */
  progressLog?: string;
  projectName?: string;
  parentDir?: string;
  databricksHost?: string;
  githubOwner?: string;
  createGithubRepo?: boolean;
  privateRepo?: boolean;
  language?: "java" | "kotlin" | "python" | "nodejs";
  runnerType?: "self-hosted" | "github-hosted";
  tiers?: 1 | 2 | 3;
  enableE2e?: boolean;
  enableInfra?: boolean;
  uiTrack?: boolean;
  clientFramework?: "react" | "none";
  executor?: "claude" | "copilot";
  skipCommands?: boolean;
  agentModels?: Partial<Record<SpawnableAgentRole, string>>;
  skipDoctor?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--json-input":
        out.jsonInput = argv[++i];
        break;
      case "--progress-log":
        out.progressLog = argv[++i];
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
        out.language = argv[++i] as ParsedArgs["language"];
        break;
      case "--runner":
        out.runnerType = argv[++i] as ParsedArgs["runnerType"];
        break;
      case "--tiers": {
        const v = Number.parseInt(argv[++i], 10);
        if (v !== 1 && v !== 2 && v !== 3) {
          process.stderr.write(
            `--tiers: expected 1, 2, or 3. Got: ${argv[i]}\n` +
              `  1 = prod only (features fork from prod)\n` +
              `  2 = prod + staging (features fork from staging)\n` +
              `  3 = prod + staging + dev (features fork from dev)\n` +
              `  Features are short-lived branches, NOT counted as tiers.\n`,
          );
          out.help = true;
        } else {
          out.tiers = v as 1 | 2 | 3;
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
        out.clientFramework = argv[++i] as ParsedArgs["clientFramework"];
        break;
      case "--executor": {
        const v = argv[++i];
        if (v !== "claude" && v !== "copilot") {
          process.stderr.write(`--executor: expected claude or copilot. Got: ${v}\n`);
          process.exit(2);
        }
        out.executor = v;
        break;
      }
      case "--skip-commands":
        out.skipCommands = true;
        break;
      case "--skip-doctor":
        out.skipDoctor = true;
        break;
      case "--agent-model": {
        // --agent-model <role>=<model>, repeatable. The HIL's per-project
        // override of a role's recommended model.
        const pair = argv[++i] ?? "";
        const eq = pair.indexOf("=");
        const role = eq >= 0 ? pair.slice(0, eq) : "";
        const model = eq >= 0 ? pair.slice(eq + 1) : "";
        if (!ALL_AGENT_ROLES.includes(role as SpawnableAgentRole) || !model) {
          process.stderr.write(
            `--agent-model: expected <role>=<model> with a known role. Got: ${JSON.stringify(pair)}\n` +
              `  roles: ${ALL_AGENT_ROLES.join(", ")}\n`,
          );
          out.help = true;
        } else {
          (out.agentModels ??= {})[role as SpawnableAgentRole] = model;
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

const HELP = `lakebase-create-project – bootstrap a fresh Lakebase-paired project

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
  --executor          claude | copilot. The agent backend that runs role turns,
                      persisted to .lakebase/consort-config.json (the single
                      source of truth — no env override). Default: claude.
                      "copilot" runs each role turn via the GitHub Copilot CLI.
  --skip-commands     Skip scaffolding .claude/commands/{design,build}.md
                      (default: commands are written)
  --skip-doctor       Skip the environment preflight (lakebase-doctor) that
                      otherwise gates creation. Not recommended: a missing
                      prerequisite or a workspace without Lakebase then fails
                      partway through provisioning instead of up front.
  --agent-model       <role>=<model>, repeatable. Override a TDD role agent's
                      recommended model for this project (asked at setup; the
                      HIL's call). Roles: spec-author, architect-reviewer, dba,
                      test-strategist, ux-designer, navigator, driver,
                      product-owner. (release-engineer is deterministic, not a
                      tunable agent.) Omitted roles use their recommended model.
                      Persisted to .lakebase/agent-config.json.
  --detach            Re-launch scaffolding in a NEW session and return at once, so
                      the ~3-4 min provision never hits the harness ~2min bash timeout
                      and survives the turn ending. Captures the child's output (doctor
                      + every [stage] line + final JSON) to a log and prints the
                      consort-watch command to relay it poll-once. Use this to watch
                      each step live instead of a silent foreground call.
  --progress-log <p>  Tee the [stage] lines to this file too (structured relay sink).
  --json-input        Pass all args as a single JSON object (BDD harness)

Output: JSON on stdout (CreateProjectResult). Progress to stderr.
`;

async function main(): Promise<number> {
  exportConsortVersionEnv(); // label provisioning connections consort/<version> (see kit-bin.ts)
  const rawArgv = process.argv.slice(2);
  const args = parseArgs(rawArgv);
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }

  // --detach: re-launch scaffolding in its OWN session and return at once, so the ~3-4
  // min provision NEVER hits the harness's ~2min bash timeout (a foreground call is
  // killed; a plain `&` is reaped at turn-end). The child's stdout+stderr – doctor +
  // every `[stage]` line + the final JSON – are captured to a log the caller relays
  // POLL-ONCE with `consort-watch --since` (so each step shows live). Must run BEFORE
  // any side effect (doctor gate, provisioning) so the CHILD owns them. Falls through
  // to an in-process run only if the re-spawn itself fails (never silently drops it).
  if (rawArgv.includes("--detach")) {
    const childArgs = rawArgv.filter((a) => a !== "--detach");
    const logPath = path.join(os.tmpdir(), `consort-create-${Date.now()}.log`);
    let pid: number | null = null;
    try {
      const fd = openSync(logPath, "a");
      pid = relaunchDetached(childArgs, { stdio: ["ignore", fd, fd] });
      closeSync(fd);
    } catch {
      pid = null;
    }
    if (pid !== null) {
      process.stdout.write(
        `lakebase-create-project: scaffolding detached into its own session as pid ${pid} (survives this turn + the ~2min bash timeout).\n` +
          `  live log: ${logPath}\n` +
          `  relay it: consort-watch --since 0 --log ${logPath} --pid ${pid}   (re-poll with the printed cursor until status=done)\n`,
      );
      return 0;
    }
    process.stderr.write("lakebase-create-project: detach re-spawn failed – running in-process instead.\n");
  }

  let input: CreateProjectArgs;
  if (args.jsonInput) {
    try {
      input = JSON.parse(args.jsonInput) as CreateProjectArgs;
    } catch (err) {
      process.stderr.write(`Failed to parse --json-input: ${err instanceof Error ? err.message : String(err)}\n`);
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
      agentModels: args.agentModels,
    };
  }

  // Front-door doctor gate: verify the environment BEFORE any irreversible
  // provisioning (a repo + a Lakebase database). A hard prerequisite failure
  // (missing tool, or a workspace without Lakebase) stops us here with an
  // actionable message instead of failing mid-provision. --skip-doctor bypasses.
  if (!args.skipDoctor) {
    process.stderr.write("[doctor] verifying environment before provisioning...\n");
    const gate = await runCreateDoctorGate({
      parentDir: input.parentDir,
      databricksHost: input.databricksHost,
      language: input.language,
    });
    if (!gate.ok) {
      process.stderr.write("\n" + formatGateBlockers(gate.blockers) + "\n");
      return 2;
    }
    process.stderr.write("[doctor] environment ok\n");
  }

  // Substrate integrity gate: refuse to scaffold from a STALE nested substrate.
  // npx can update the top-level kit while reusing a cached older
  // @databricks-solutions/lakebase-scm-utils – that silently produces a broken
  // project (wrong launcher, mismatched .lakebase refs). Verify the installed
  // substrate matches what this kit declares, and fail loud BEFORE provisioning
  // anything (a repo + a Lakebase database).
  {
    const declared = declaredSubstrateVersionFromModule(import.meta.url);
    let installed: string | undefined;
    try {
      const req = createRequire(import.meta.url);
      installed = JSON.parse(
        readFileSync(req.resolve("@databricks-solutions/lakebase-scm-utils/package.json"), "utf8"),
      ).version;
    } catch {
      // Can't resolve the installed substrate – leave undefined; the check no-ops
      // and the downstream scaffold still guards.
    }
    const mismatch = substrateMismatchMessage({ declared, installed, env: process.env });
    if (mismatch) {
      process.stderr.write("\n" + mismatch + "\n");
      return 2;
    }
  }

  // Pin the scaffolded project's runtime kit ref to THIS kit's version so it
  // resolves an immutable, version-keyed kit cache instead of a mutable `main`
  // that silently goes stale (missing bins, old orchestrator). The substrate's
  // create-project Step 7e writes `.lakebase/kit-ref` straight from
  // LAKEBASE_KIT_REF, so defaulting the env var here is all it takes. An explicit
  // LAKEBASE_KIT_REF (dev override / capture pin) still wins.
  const pin = kitRefPin(process.env, consortVersionFromModule(import.meta.url));
  if (pin) {
    process.env.LAKEBASE_KIT_REF = pin;
    process.stderr.write(
      `[kit-ref] pinning the scaffolded kit to ${pin} (immutable version – avoids mutable-main cache drift)\n`,
    );
  }

  // Tee stage lines to --progress-log (fresh file) so a caller can poll it for live
  // relay regardless of how create was launched (the caller owns the path – no
  // dependency on a shell redirect the launch might drop). Best-effort; never fatal.
  if (args.progressLog) {
    try { writeFileSync(args.progressLog, ""); } catch { /* ignore */ }
  }
  const result = await createProject(input, (step, detail) => {
    const line = `[${step}]${detail ? ` ${detail}` : ""}\n`;
    process.stderr.write(line);
    if (args.progressLog) {
      try { appendFileSync(args.progressLog, line); } catch { /* best-effort log */ }
    }
  });
  // Dev scaffold self-heal: when scaffolding from a LOCAL kit (LAKEBASE_KIT_DIR — a dev/unreleased
  // plugin whose version tag isn't published upstream), record it as the project's kit-local-dir so
  // lk resolves that local kit for the pinned ref instead of failing to fetch an unpublished tag.
  const recorded = recordDevKitLocalDirs(result.projectDir, process.env);
  if (recorded.length) {
    process.stderr.write(
      `[kit-ref] dev kit in use — recorded .lakebase/${recorded.join(", ")} so lk resolves your local kit for the pinned ref\n`,
    );
  }
  // Persist the executor backend into consort-config.json (the ONE door; no env override). Omitted
  // => the "claude" default. A copilot project records it here so every drive reads it deterministically.
  if (args.executor) {
    setProjectExecutor(result.projectDir, args.executor);
    process.stderr.write(`[executor] project executor set to ${args.executor} (.lakebase/consort-config.json)\n`);
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
);
