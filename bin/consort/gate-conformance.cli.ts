#!/usr/bin/env node
// CLI: "did this feature's artifacts adhere to the format expected?"
//
//   consort-gate-conformance --feature <id>
//   consort-gate-conformance --feature <id> --json --pretty
//
// Layer 2. Scans a feature's on-disk artifacts and checks each that
// exists against its declared format (JSON against its schema; narrative MD
// against its role-documented required sections). Existence is NOT enforced
// here (a feature mid-design legitimately lacks plan.json); this only reports
// non-conformance of what exists. Exit codes:
//   0 = every checked artifact conforms
//   1 = at least one artifact is non-conformant
//   2 = bad args
//   3 = scan failure (e.g. feature not found)

import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import { resolveConsortDir, ARTIFACT_ROOT } from "../../consort/config/consort-paths.js";
import { scanFeatureConformance } from "../../consort/orchestrator/validators/conformance/artifact-conformance.js";
import { normalizeStoryJson } from "../../consort/intake/spec-sync.js";
import { writeEscalation } from "../../consort/gates/escalation.js";

interface ParsedArgs {
  feature?: string;
  consortDir?: string;
  json?: boolean;
  pretty?: boolean;
  escalateOnFail?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature":
        out.feature = argv[++i];
        break;
      case "--tdd-dir":
        out.consortDir = argv[++i];
        break;
      case "--json":
        out.json = true;
        break;
      case "--pretty":
        out.pretty = true;
        break;
      case "--escalate-on-fail":
        out.escalateOnFail = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
    }
  }
  return out;
}

const HELP = `consort-gate-conformance

Check that a feature's artifacts adhere to the format their producing role is
documented to emit. JSON artifacts validate against their schema; narrative MD
artifacts must carry an H1 title plus their required sections.

Usage:
  consort-gate-conformance --feature <id> [flags]

Flags:
  --feature <id>          Feature id (required, e.g. F1-initial-domain)
  --tdd-dir <path>        artifact root (default: ./${ARTIFACT_ROOT}, honors legacy roots)
  --json                  Machine-readable JSON output
  --pretty                Pretty-print JSON
  --escalate-on-fail      On non-conformance, write a surfaced \`feature-conformance\` escalation
                          (resumable, with a repair resolution) before exiting 1 — so the drive
                          halts with a HITL surface instead of a bare non-zero. Used by the
                          feature-complete drive step.
  -h, --help              Show this help
`;

export function runGateConformanceCli(argv: string[]): number {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (!args.feature) {
    process.stderr.write(`Error: --feature is required.\n\n${HELP}\n`);
    return 2;
  }
  const consortDir = args.consortDir ?? resolveConsortDir();
  let report;
  try {
    // HEAL-THEN-CHECK: backfill each story.json's required narrative (asA/iWantTo/soThat)
    // from the authoritative story.md BEFORE scanning. story.md is the source of truth; a
    // minimal {id}-only stub (a story authored before the design-time sync-breakdown heal, or
    // on an older kit) then conforms without hand-editing. A story whose story.md GENUINELY
    // lacks a parseable narrative is NOT healed and still fails the scan below – the real gap
    // surfaces, we just stop failing on stubs the source already answers. Idempotent + only
    // backfills missing fields (never overwrites), so a fully-authored story.json is untouched.
    normalizeStoryJson(consortDir, args.feature);
    report = scanFeatureConformance(consortDir, args.feature);
  } catch (e) {
    process.stderr.write(`gate-conformance: ${(e as Error).message}\n`);
    return 3;
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, args.pretty ? 2 : 0)}\n`);
  } else {
    for (const entry of report.entries) {
      if (entry.ok) {
        process.stdout.write(`  ok    ${entry.artifact}\n`);
      } else {
        process.stdout.write(`  FAIL  ${entry.artifact}\n`);
        for (const v of entry.violations) process.stdout.write(`          ${v}\n`);
      }
    }
    process.stdout.write(
      report.ok
        ? `gate-conformance: all ${report.entries.length} artifact(s) conform\n`
        : `gate-conformance: ${report.entries.filter((e) => !e.ok).length} of ${report.entries.length} artifact(s) non-conformant\n`,
    );
  }
  // --escalate-on-fail: on non-conformance, write a SURFACED, resumable escalation (so consort-next
  // reports it with a resolver + the next drive readState routes raise-to-hil) instead of a bare
  // non-zero halt. Still exits 1 (so the feature-complete step does not advance to deploy), but the
  // halt now leaves a feature-conformance escalation naming the repair path — not a silent exit.
  if (!report.ok && args.escalateOnFail && args.feature) {
    const violations = report.entries.filter((e) => !e.ok).flatMap((e) => e.violations);
    writeEscalation(consortDir, {
      source: "feature-conformance",
      reason: `feature-complete conformance failed for ${args.feature}: ${violations.join("; ")}`,
      feature_id: args.feature,
      how_to_resolve:
        `A declared persistence invariant is uncovered or covered by a wrong-shaped test. Close it on the ACCEPTED ` +
        `story via: consort-pipeline repair --feature ${args.feature} --story <the invariant's realizing/owning story> ` +
        `--gap uncovered-invariant --invariant <PIx> --approver <you>, then consort-pipeline complete-repair ` +
        `--feature ${args.feature} --story <S>. (A transactional invariant needs an atomicity/rollback test — the ` +
        `F2 T19 shape — NOT a migration round-trip.) Do NOT use \`--only design\` (it no-ops on the frozen test_list ` +
        `gate) and do NOT hand-edit test-list.json. Full ladder: skills/consort/references/escalation-triage.md.`,
    });
  }
  return report.ok ? 0 : 1;
}

if (isCliEntry(import.meta.url)) {
  process.exit(runGateConformanceCli(process.argv.slice(2)));
}
