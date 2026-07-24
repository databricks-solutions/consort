#!/usr/bin/env node
// CLI: Human Proxy for automated smoke runs.
//
//   lakebase-sftdd-human-proxy --feature <id>           # approve all open gates
//   lakebase-sftdd-human-proxy --feature <id> --gate spec
//   lakebase-sftdd-human-proxy --feature <id> --json --pretty
//
// Wraps drainGatesAsHumanProxy. Exit codes:
//   0 = at least one gate approved (or all already-closed; idempotent no-op also returns 0)
//   2 = bad args
//   3 = substrate failure

import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import {
  drainGatesAsHumanProxy,
  supplyArtifact,
  supplyRequests,
  supplyProposals,
} from "./human-proxy.js";
// The revise self-heal is a state-machine transition, not a proxy decision; the
// CLI verb triggers it but the logic lives in the driver's service layer.
import { applyReviseSelfHeal } from "./revise.js";
import { approveSprintPlanGate } from "./sprint-gates.js";
import type { GateName } from "./gates.js";

/**
 * `supply` subcommand: the Human Proxy provides a pre-recorded intake artifact
 * at an orchestrated intake step (validate-then-place), the stand-in for a
 * human authoring product-overview.md / nfrs.md / design-brief.md / etc.
 *
 *   lakebase-sftdd-human-proxy supply --from <recorded> --to <.tdd/path> [--artifact <name>] [--feature <id>]
 *
 * Exit: 0 supplied, 2 bad args, 4 refused (missing/non-conformant recording).
 */
function runSupplyCli(argv: string[]): number {
  let from: string | undefined;
  let to: string | undefined;
  let artifact: string | undefined;
  let sftddDir: string | undefined;
  let feature: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--from": from = argv[++i]; break;
      case "--to": to = argv[++i]; break;
      case "--artifact": artifact = argv[++i]; break;
      case "--tdd-dir": sftddDir = argv[++i]; break;
      case "--feature": feature = argv[++i]; break;
    }
  }
  if (!from || !to) {
    process.stderr.write("Error: supply requires --from <recorded> and --to <path>.\n");
    return 2;
  }
  const result = supplyArtifact({ from, to, artifact, sftddDir, featureId: feature });
  if (result.ok) {
    process.stdout.write(`human-proxy: supplied ${result.artifact} -> ${result.to}\n`);
    return 0;
  }
  process.stderr.write(`human-proxy: refused to supply ${result.artifact}: ${result.reason}\n`);
  return 4;
}

/**
 * `supply-requests` subcommand: at the planning author-requests step, the Human
 * Proxy supplies the PO's recorded feature-request.md files (the headless stand-
 * in for the human providing them when the state machine asks). The (feature_id,
 * recorded source) pairs come from $LAKEBASE_SFTDD_SPRINT_REQUESTS. Always exits 0:
 * an unset env is a no-op (a live human provides them out-of-band); a missing or
 * non-conformant recording is logged + skipped, and the driver surfaces the
 * unmet need as a stall rather than advancing on absent artifacts.
 *
 *   lakebase-sftdd-human-proxy supply-requests [--tdd-dir <dir>] [--approver <name>]
 */
function runSupplyRequestsCli(argv: string[]): number {
  let sftddDir: string | undefined;
  let approver: string | undefined;
  let sprint: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--tdd-dir": sftddDir = argv[++i]; break;
      case "--approver": approver = argv[++i]; break;
      case "--sprint": sprint = argv[++i]; break;
    }
  }
  const result = supplyRequests({ sftddDir, approver, sprint });
  if (result.supplied.length > 0) {
    process.stdout.write(`human-proxy: supplied ${result.supplied.length} feature-request(s): ${result.supplied.join(", ")}\n`);
  } else {
    process.stdout.write(`human-proxy: no recorded feature-requests to supply (LAKEBASE_SFTDD_SPRINT_REQUESTS unset/empty)\n`);
  }
  if (result.skipped.length > 0) {
    process.stderr.write(
      `human-proxy: skipped ${result.skipped.length}: ${result.skipped.map((s) => `${s.featureId} (${s.reason})`).join(", ")}\n`,
    );
  }
  return 0;
}

/**
 * `supply-proposals` subcommand: DETERMINISTIC propose. At the planning propose
 * step (capture/headless), project feature-proposals.md from the sprint's recorded
 * feature-requests ($LAKEBASE_SFTDD_SPRINT_REQUESTS) instead of spawning the Spec
 * Author LLM (which could write nothing then claim the file exists, tripping the
 * propose protocol-violation abort). Always exits 0: an unset env is a no-op (the
 * live LLM propose runs for interactive users).
 *
 *   lakebase-sftdd-human-proxy supply-proposals [--tdd-dir <dir>] [--ui]
 */
function runSupplyProposalsCli(argv: string[]): number {
  let sftddDir: string | undefined;
  let uiTrack = false;
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--tdd-dir": sftddDir = argv[++i]; break;
      case "--ui": uiTrack = true; break;
    }
  }
  const result = supplyProposals({ sftddDir, uiTrack });
  process.stdout.write(
    result.written
      ? `human-proxy: projected feature-proposals.md from ${result.count} recorded feature-request(s)\n`
      : `human-proxy: no recorded feature-requests to project proposals from (${result.reason ?? "unset"})\n`,
  );
  return 0;
}

/**
 * `decide-escalation` subcommand: the Human Proxy makes the PO's
 * `revise` decision on a SPEC-level blocking escalation and drives the
 * circle-back (record the decision, reset the story to designing, resolve the
 * smell). The deterministic driver emits this for a `revise-route` action; it is
 * never invoked for a build-level/non-routable escalation (those hard-halt).
 *
 *   lakebase-sftdd-human-proxy decide-escalation --feature F --story S --smell N \
 *       --routed-to spec-author --gate spec --reason "<verdict>" [--approver A] [--tdd-dir D]
 */
function runDecideEscalationCli(argv: string[]): number {
  let feature: string | undefined;
  let story: string | undefined;
  let smell: string | undefined;
  let routedTo: string | undefined;
  let gate: string | undefined;
  let reason: string | undefined;
  let approver: string | undefined;
  let sftddDir: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature": feature = argv[++i]; break;
      case "--story": story = argv[++i]; break;
      case "--smell": smell = argv[++i]; break;
      case "--routed-to": routedTo = argv[++i]; break;
      case "--gate": gate = argv[++i]; break;
      case "--reason": reason = argv[++i]; break;
      case "--approver": approver = argv[++i]; break;
      case "--tdd-dir": sftddDir = argv[++i]; break;
      // --project-dir is accepted (the effect passes it) but unused here.
      case "--project-dir": i++; break;
    }
  }
  if (!feature || !story || !smell || !routedTo || !gate) {
    process.stderr.write(
      "Error: decide-escalation requires --feature, --story, --smell, --routed-to, --gate.\n",
    );
    return 2;
  }
  if (routedTo !== "spec-author" && routedTo !== "test-strategist" && routedTo !== "architect-reviewer") {
    process.stderr.write(`Error: --routed-to must be spec-author|test-strategist|architect-reviewer (got ${routedTo}).\n`);
    return 2;
  }
  if (gate !== "spec" && gate !== "test_list" && gate !== "architecture") {
    process.stderr.write(`Error: --gate must be spec|test_list|architecture (got ${gate}).\n`);
    return 2;
  }
  try {
    const r = applyReviseSelfHeal({
      featureId: feature,
      story,
      smell,
      routedTo: routedTo as "spec-author" | "test-strategist" | "architect-reviewer",
      gate: gate as "spec" | "test_list" | "architecture",
      reason: reason ?? `revise ${smell} on ${story}`,
      approver,
      sftddDir,
    });
    process.stdout.write(
      `human-proxy: revised ${story} (smell ${smell} -> ${r.routedTo}); ` +
        `story reset to designing${r.resolvedSmell ? ", smell resolved" : " (no open smell found)"}\n`,
    );
    return 0;
  } catch (e) {
    process.stderr.write(`human-proxy decide-escalation: ${(e as Error).message}\n`);
    return 3;
  }
}

interface ParsedArgs {
  feature?: string;
  sprint?: string;
  gate?: GateName;
  sftddDir?: string;
  approver?: string;
  promoteRef?: string;
  json?: boolean;
  pretty?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--feature":
        out.feature = argv[++i];
        break;
      case "--sprint":
        out.sprint = argv[++i];
        break;
      case "--gate":
        out.gate = argv[++i] as GateName;
        break;
      case "--tdd-dir":
        out.sftddDir = argv[++i];
        break;
      case "--approver":
        out.approver = argv[++i];
        break;
      case "--promote-ref":
        out.promoteRef = argv[++i];
        break;
      case "--json":
        out.json = true;
        break;
      case "--pretty":
        out.pretty = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
    }
  }
  return out;
}

const HELP = `lakebase-sftdd-human-proxy

Human Proxy for automated smoke / headless test runs. Calls
approveGate on every open gate for a feature with hitlApproved=true,
default approver "human-proxy". NOT for production use.

Usage:
  lakebase-sftdd-human-proxy --feature <id> [flags]

Flags:
  --feature <id>          Feature id (required, e.g. F1-initial-domain)
  --gate <name>           Approve only one gate (spec | plan | test_list | promote)
  --tdd-dir <path>        artifact root (default: ./.sftdd, honors a legacy ./.tdd)
  --approver <name>       Approver identity (default: human-proxy)
  --promote-ref <str>     promote gate ref string (promote gate is skipped if omitted)
  --json                  Machine-readable JSON output
  --pretty                Pretty-print JSON
  -h, --help              Show this help
`;

export function runHumanProxyCli(argv: string[]): number {
  // Subcommand dispatch: `supply` provides a recorded intake artifact; the
  // default (no subcommand, or `approve`) drains open gates.
  if (argv[0] === "supply") return runSupplyCli(argv.slice(1));
  if (argv[0] === "supply-requests") return runSupplyRequestsCli(argv.slice(1));
  if (argv[0] === "supply-proposals") return runSupplyProposalsCli(argv.slice(1));
  if (argv[0] === "decide-escalation") return runDecideEscalationCli(argv.slice(1));
  if (argv[0] === "approve") argv = argv.slice(1);
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  // Sprint-scoped plan gate: `--sprint <name> [--gate plan]`. The
  // Human Proxy approves the sprint plan gate, the HITL checkpoint between
  // planning and execution. Teeth: refuses unless feature-proposals.md exists +
  // conforms. A refusal is a skip (exit 0), mirroring the per-feature drain.
  if (args.sprint) {
    const res = approveSprintPlanGate({
      sprint: args.sprint,
      approver: args.approver ?? "human-proxy",
      hitlApproved: true,
      sftddDir: args.sftddDir,
    });
    if (res.ok) {
      process.stdout.write(
        `human-proxy: sprint plan gate for ${args.sprint} ${res.alreadyApproved ? "already approved" : "approved"}\n`,
      );
    } else {
      process.stdout.write(`human-proxy: skipped sprint plan gate (${res.reason})\n`);
    }
    return 0;
  }
  if (!args.feature) {
    process.stderr.write(`Error: --feature or --sprint is required.\n\n${HELP}\n`);
    return 2;
  }
  try {
    const result = drainGatesAsHumanProxy({
      featureId: args.feature,
      sftddDir: args.sftddDir,
      approver: args.approver,
      onlyGate: args.gate,
      promoteRef: args.promoteRef,
    });
    if (args.json) {
      process.stdout.write(
        `${JSON.stringify(
          { ok: true, ...result },
          null,
          args.pretty ? 2 : 0,
        )}\n`,
      );
    } else {
      process.stdout.write(
        `human-proxy: approved ${result.approved.length} gate(s)${result.approved.length ? ": " + result.approved.join(", ") : ""}\n`,
      );
      if (result.skipped.length > 0) {
        process.stdout.write(
          `human-proxy: skipped ${result.skipped.length}: ${result.skipped.map((s) => `${s.gate} (${s.reason})`).join(", ")}\n`,
        );
      }
    }
    return 0;
  } catch (e) {
    const err = e as Error;
    process.stderr.write(`human-proxy: ${err.message}\n`);
    return 3;
  }
}

if (isCliEntry(import.meta.url)) {
  process.exit(runHumanProxyCli(process.argv.slice(2)));
}
