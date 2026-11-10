#!/usr/bin/env node
// consort-approve-gate: the HUMAN-facing command to record a HITL gate
// approval (FEIP-8005). This is the production counterpart to
// consort-human-proxy, which is explicitly a headless / automated-smoke
// stand-in ("NOT for production use") and defaults the approver to "human-proxy".
//
// A gate approval writes "this named human approved this artifact" into gates.json
// (or the sprint plan gate). That is a governance decision, so this CLI:
//   - REQUIRES --approver <name> (no default): the deciding human must name
//     themselves; there is no silent proxy identity.
//   - records a GENUINE approval – the tool records ATTRIBUTION; the DECISION must
//     be the approver's. Only run it when the named human has actually reviewed
//     and approved.
//
// It reuses the SAME approval substrate as the Human Proxy (approveSprintPlanGate
// for the sprint plan gate; drainGatesAsHumanProxy, which assembles each open
// gate's artifact hashes and calls approveGate, for a feature's gates; and
// approveStoryGateFromDisk for the per-story spec gate managed by the pipeline),
// so the recorded approval is byte-for-byte what the workflow expects – only the
// attribution and the required-human framing differ.
//
// This is the ONE human-facing gate door: --sprint approves the plan gate,
// --feature --story approves a per-story spec gate (the pipeline gate the design
// lane blocks on), and --feature [--gate] approves a feature's gates.json gate(s)
// (FEIP-8008: the design drive used to hint the feature-level door for a
// per-story stop, which recorded the wrong gate and never advanced).
//
// Usage:
//   consort-approve-gate --sprint <name> --approver <you>              # sprint plan gate
//   consort-approve-gate --feature <id> --story <s> --approver <you>   # a per-story spec gate
//   consort-approve-gate --feature <id> --approver <you> [--gate <g>]  # a feature's gate(s)
//                              [--promote-ref <str>] [--project-dir <p>] [--tdd-dir <d>] [--json]
// Exit 0 = approval recorded (or already approved); 2 = usage error / nothing to
// approve; 3 = per-story draft invariant violated.

import { approveSprintPlanGate } from "../../consort/gates/sprint-gates.js";
import { approveIntakeGate } from "../../consort/gates/intake-gate.js";
import { approveBacklogGate } from "../../consort/gates/backlog-gate.js";
import { drainGatesAsHumanProxy } from "../../consort/gates/human-proxy.js";
import { approveStoryGateFromDisk } from "../../consort/pipeline/story-pipeline.js";
import { resolveConsortDir } from "../../consort/config/consort-paths.js";
import type { GateName } from "../../consort/gates/gates.js";

interface Parsed {
  feature?: string;
  sprint?: string;
  story?: string;
  gate?: GateName;
  approver?: string;
  promoteRef?: string;
  projectDir: string;
  tddDir?: string;
  json: boolean;
  help?: boolean;
}

function parse(argv: string[]): Parsed {
  const out: Parsed = { projectDir: process.cwd(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--feature" && i + 1 < argv.length) out.feature = argv[++i];
    else if (a === "--sprint" && i + 1 < argv.length) out.sprint = argv[++i];
    else if (a === "--story" && i + 1 < argv.length) out.story = argv[++i];
    else if (a === "--gate" && i + 1 < argv.length) out.gate = argv[++i] as GateName;
    else if (a === "--approver" && i + 1 < argv.length) out.approver = argv[++i];
    else if (a === "--promote-ref" && i + 1 < argv.length) out.promoteRef = argv[++i];
    else if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--tdd-dir" && i + 1 < argv.length) out.tddDir = argv[++i];
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") out.help = true;
  }
  return out;
}

const HELP =
  `consort-approve-gate – record a HUMAN's HITL gate approval\n\n` +
  `Records a genuine approval into the workflow state. The DECISION must be the\n` +
  `approver's; this tool records ATTRIBUTION + the artifact hashes. Use the Human\n` +
  `Proxy (consort-human-proxy) instead ONLY for headless / smoke runs.\n\n` +
  `Usage:\n` +
  `  consort-approve-gate --sprint <name> --approver <you>              # plan gate\n` +
  `  consort-approve-gate --feature <id> --story <s> --approver <you>   # per-story spec gate\n` +
  `  consort-approve-gate --feature <id> --approver <you> [--gate <name>] [--promote-ref <str>]\n` +
  `                             [--project-dir <p>] [--tdd-dir <d>] [--json]\n\n` +
  `--approver is REQUIRED (name the deciding human; there is no default identity).\n` +
  `Exit 0 = approved (or already approved); 2 = usage error / nothing to approve;\n` +
  `3 = per-story draft invariant violated.\n`;

/** Run the CLI. Returns the process exit code (no process.exit inside), so it is
 *  unit-testable – mirroring runHumanProxyCli. */
export function runApproveGateCli(argv: string[]): number {
  const p = parse(argv);
  if (p.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (!p.approver || !p.approver.trim()) {
    process.stderr.write(
      `consort-approve-gate: --approver <name> is REQUIRED – a gate approval attributes the\n` +
        `decision to a named human. (For headless/smoke runs use consort-human-proxy.)\n`,
    );
    return 2;
  }
  if (!p.sprint && !p.feature) {
    process.stderr.write(`consort-approve-gate: one of --sprint <name> or --feature <id> is required.\n`);
    return 2;
  }
  if (p.story && !p.feature) {
    process.stderr.write(`consort-approve-gate: --story requires --feature <id> (a per-story spec gate is feature-scoped).\n`);
    return 2;
  }
  if (p.story && p.sprint) {
    process.stderr.write(`consort-approve-gate: --story is a per-story feature gate; not valid with --sprint (the plan gate has no story).\n`);
    return 2;
  }
  const consortDir = p.tddDir ?? resolveConsortDir(p.projectDir);

  // Per-story spec gate (the pipeline gate the design lane blocks on). Routes
  // through the SAME shared helper as `consort-pipeline approve-gate`
  // (FEIP-8008), so the human door and the headless proxy write identical state.
  if (p.story) {
    const r = approveStoryGateFromDisk(consortDir, p.feature as string, p.story, { approver: p.approver });
    if (p.json) {
      process.stdout.write(`${JSON.stringify(r)}\n`);
      if (!r.ok) return 2;
      return 0;
    }
    if (!r.ok) {
      process.stderr.write(`approve-gate: ${r.error}\n`);
      return 2;
    }
    process.stdout.write(
      `approve-gate: ${p.feature}/${p.story} – per-story spec gate approved by ${p.approver}` +
        ` (ready + queued: ${(r.queue ?? []).join(", ") || "none"})\n`,
    );
    return 0;
  }

  // Sprint INTAKE gate: `--sprint <name> --gate intake`. Approves the drafted intake (the human
  // reviewed product-overview/nfrs/design-brief) so the drive advances to the Spec Author's propose.
  // Writes the approval marker + logs gate.approved("intake"). Checked before the plan-gate branch.
  if (p.sprint && (p.gate as string) === "intake") {
    approveIntakeGate(consortDir, p.approver);
    process.stdout.write(`approve-gate: intake gate for '${p.sprint}' approved by ${p.approver}\n`);
    return 0;
  }

  // Sprint BACKLOG gate: `--sprint <name> --gate backlog`. Records the human's sprint-backlog commit
  // (the feature selection they made in requested.json). Logs gate.approved("backlog"); the SELECTION
  // itself is declared via consort-sync-backlog. Checked before the plan-gate branch.
  if (p.sprint && (p.gate as string) === "backlog") {
    approveBacklogGate(consortDir, p.approver);
    process.stdout.write(`approve-gate: backlog gate for '${p.sprint}' committed by ${p.approver}\n`);
    return 0;
  }

  // Sprint plan gate.
  if (p.sprint) {
    const res = approveSprintPlanGate({ sprint: p.sprint, approver: p.approver, hitlApproved: true, consortDir });
    if (p.json) process.stdout.write(`${JSON.stringify(res)}\n`);
    else if (res.ok) {
      process.stdout.write(
        `approve-gate: sprint plan gate for '${p.sprint}' ${res.alreadyApproved ? "already approved" : "approved"} by ${p.approver}\n`,
      );
    } else {
      process.stderr.write(`approve-gate: could NOT approve the sprint plan gate (${res.reason}).\n`);
    }
    return res.ok ? 0 : 2;
  }

  // A feature's gate(s). Reuses the shared drain (assembles artifact hashes + calls
  // approveGate); the required --approver above is what makes this a genuine human
  // approval rather than the proxy default.
  const result = drainGatesAsHumanProxy({
    featureId: p.feature as string,
    consortDir,
    approver: p.approver,
    ...(p.gate ? { onlyGate: p.gate } : {}),
    ...(p.promoteRef ? { promoteRef: p.promoteRef } : {}),
  });
  if (p.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  } else {
    process.stdout.write(
      `approve-gate: ${p.feature} – approved ${result.approved.length} gate(s) by ${p.approver}` +
        `${result.approved.length ? ": " + result.approved.join(", ") : ""}\n`,
    );
    for (const s of result.skipped) process.stdout.write(`  skipped ${s.gate} (${s.reason})\n`);
  }
  return result.approved.length > 0 ? 0 : 2;
}

// Only run when invoked as a script (not when imported by a test).
if (process.argv[1] && /approve-gate\.cli\.(c?js|ts)$/.test(process.argv[1])) {
  process.exit(runApproveGateCli(process.argv.slice(2)));
}
