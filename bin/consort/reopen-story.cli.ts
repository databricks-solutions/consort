#!/usr/bin/env node
// consort-reopen-story: send a story back to the design lane for genuine RE-AUTHORING.
// withdraw-gate reverts the gate and revise resets build state, but both LEAVE the story's
// ACs/test-list/reflect-verdict on disk, so the drive just re-approves the same spec. This
// clears those design artifacts (with a backup) so hasAcs=false and the drive re-dispatches
// the Spec Author – the missing recovery primitive the stockflow run had to improvise.
//
//   consort-reopen-story --feature <F> --story <S> [--reason "<why>"] [--project-dir <p>]
//
// It ALSO resets the story's pipeline entry to `designing` – dropping the spec gate, the
// experiment record, AND the acceptance in one write, clearing the feature deploy-evidence,
// and clearing the coarse phase – so reopening a DONE + merged + ACCEPTED story works in one
// command (the case the stockflow run had to hand-surger across four primitives). The one
// thing it CANNOT clear is the actual git/Lakebase experiment BRANCH (a real external
// resource); it prints that as the remaining manual step so it is never silently stranded.

import { execFileSync } from "node:child_process";
import { resolveConsortDir } from "../../consort/config/consort-paths.js";
import { reopenStoryForRedesign, reopenStoryFromRole, DESIGN_LANE_ORDER, type DesignLaneRole } from "../../consort/gates/reopen-story.js";
import { resyncOffTreeStampIfPresent, defaultRunVerify } from "../../consort/deploy/deploy.js";
import { readWorkflowState } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";

/** The checked-out branch of `projectDir`, or null when it cannot be read (not a git repo / no
 *  commits). A detached HEAD reports the literal "HEAD". execFileSync matches the kit's raw-git idiom. */
function currentGitBranch(projectDir: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

interface Args {
  feature?: string;
  story?: string;
  reason: string;
  projectDir: string;
  consortDir?: string;
  /** Scope the reopen to a design role: revert that role's output + downstream only, keep upstream. */
  from?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { reason: "reopened for redesign", projectDir: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature": out.feature = argv[++i]; break;
      case "--story": out.story = argv[++i]; break;
      case "--from": out.from = argv[++i]; break;
      case "--reason": out.reason = argv[++i]; break;
      case "--project-dir": out.projectDir = argv[++i]; break;
      case "--tdd-dir": case "--consort-dir": out.consortDir = argv[++i]; break;
      case "-h": case "--help":
        process.stdout.write(
          "consort-reopen-story – send a story back to the design lane for a genuine re-author (backed up).\n\n" +
            "  consort-reopen-story --feature <F> --story <S> [--from <role>] [--reason \"<why>\"]\n\n" +
            "Default (full reopen): clears acs/, test-list, reflect-verdict, plan and empties story.json acs[]\n" +
            "(hasAcs=false -> the Spec Author is re-dispatched). --from <role> is a PROPORTIONATE scoped reopen:\n" +
            "it reverts only that role's output + everything downstream, keeps the upstream design, and the drive\n" +
            "resumes AT that role. Roles: " + DESIGN_LANE_ORDER.join(" -> ") + ".\n" +
            "  e.g. --from test-strategist  (re-author the test-list only; keeps ACs/architecture/schema)\n" +
            "test-strategist/navigator are STORY-local; architect-reviewer/dba/ux-designer revert FEATURE-shared\n" +
            "artifacts (a sibling story not yet gated re-derives too). Either way it resets the pipeline -> designing\n" +
            "(drops the spec gate + experiment + acceptance so the gate is re-surfaced with fresh integrity), clears\n" +
            "the feature deploy-evidence + coarse phase, and backs everything up. It CANNOT clear a live git/Lakebase\n" +
            "experiment branch – it prints that as the one step left.\n",
        );
        process.exit(0);
    }
  }
  return out;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.feature || !args.story) {
    process.stderr.write("consort-reopen-story: --feature and --story are required.\n");
    return 2;
  }
  // --from scopes the reopen to a design role. Validate against the lane order before touching disk.
  if (args.from !== undefined && !DESIGN_LANE_ORDER.includes(args.from as DesignLaneRole)) {
    process.stderr.write(`consort-reopen-story: --from must be one of ${DESIGN_LANE_ORDER.join(", ")} (got "${args.from}").\n`);
    return 2;
  }
  // Branch guard: reopen CLEARS .consort design artifacts that are TRACKED on the feature (paired)
  // branch. Run from an experiment branch (or a detached HEAD) the revert lands on the wrong branch
  // and is silently lost on the next checkout — the story reads un-reopened when the drive resumes on
  // the feature branch. The positive invariant is "reopen runs ON the claimed feature branch", so we
  // compare the live branch to the claim (not enumerate experiment-branch names). Refuse with the exact
  // remedy rather than silently switching HEAD: this is a manual recovery primitive whose epilogue
  // already makes the live branch the operator's responsibility (one door, no surprise checkout). Only
  // guards when a claim exists AND the branch is readable; otherwise it is best-effort and proceeds.
  const scm = readWorkflowState(args.projectDir);
  const claimedBranch = scm?.feature_id?.trim() ? scm?.branch?.trim() : undefined;
  const current = currentGitBranch(args.projectDir);
  if (claimedBranch && current && current !== claimedBranch) {
    process.stderr.write(
      `consort-reopen-story: refusing — the working tree is on "${current}", not the feature branch "${claimedBranch}".\n` +
        `        reopen clears .consort design artifacts tracked on the feature branch; clearing them here would\n` +
        `        land the revert on the wrong branch (an experiment branch) and be lost on the next checkout.\n` +
        `        Check out the feature branch first, then re-run:\n` +
        `            git checkout ${claimedBranch}\n` +
        `            consort-reopen-story --feature ${args.feature} --story ${args.story}` +
        `${args.from !== undefined ? ` --from ${args.from}` : ""}\n`,
    );
    return 2;
  }
  const consortDir = args.consortDir ?? resolveConsortDir(args.projectDir);
  const from = args.from as DesignLaneRole | undefined;
  const res = from
    ? reopenStoryFromRole(consortDir, args.feature, args.story, from, { reason: args.reason })
    : reopenStoryForRedesign(consortDir, args.feature, args.story, { reason: args.reason });

  if (!res.cleared.length) {
    process.stdout.write(`consort-reopen-story: ${args.story} had no design artifacts to clear${from ? ` from ${from}` : ""} (nothing to revert).\n`);
    return 0;
  }
  const scope = from ? `from ${from}` : "for redesign (full)";
  process.stdout.write(`consort-reopen-story: reopened ${args.feature}/${args.story} ${scope}.\n`);
  process.stdout.write(`  cleared (backed up to ${res.backupDir}):\n`);
  for (const c of res.cleared) process.stdout.write(`    - ${c}\n`);
  // The resume role is `from` (scoped) or the Spec Author (full); the drive re-derives it from the
  // artifacts left on disk, then re-runs the design tail -> spec gate (fresh integrity) -> rebuild.
  const resume = from ? from.replace("navigator", "navigator (reflect)") : "Spec Author";
  // A reverted MIGRATION-bearing story leaves the feature-branch DB stamped at a now-orphaned revision (its
  // migration file is gone with the reopen), so the next `alembic upgrade head` / `alembic current` fails
  // "Can't locate revision" and keeps resurfacing (experiment cuts inherit it, the per-cycle verify + the
  // deploy gate hit it). The reopen runs ON the feature branch (the branch guard above enforces it), so it
  // CAN fix this at the source: resync the feature-branch DB to head NOW rather than leave a manual step.
  // resyncOffTreeStampIfPresent probes first and only resets a genuinely off-tree branch (python-only; a
  // non-python or healthy branch is a no-op), so this is safe to call unconditionally when a migration was
  // reverted. If it can't complete, fall back to naming the manual remedy — never silently leave it broken.
  let dbStep = "";
  if (res.dbResyncNeeded) {
    let healed = false;
    try {
      healed = resyncOffTreeStampIfPresent(args.projectDir, defaultRunVerify).reset;
    } catch {
      healed = false;
    }
    dbStep = healed
      ? "  3. RESYNCED THE PAIRED DB: this story owned a migration, so its reverted migration left the\n" +
        "     feature-branch DB stamped at an orphaned revision — now auto-reset to the code's alembic head\n" +
        "     (drop + recreate + `alembic upgrade head`). No action needed; the next build starts clean.\n"
      : "  3. RESYNC THE PAIRED DB (auto-resync did not complete): this story owned a migration, so its\n" +
        "     reverted migration left the feature-branch DB stamped at an orphaned revision. Reset it to the\n" +
        "     code's alembic head manually (drop the public schema + `alembic upgrade head`), OR re-cut the\n" +
        "     experiment branch from a clean parent — else `alembic upgrade head` fails \"Can't locate revision\".\n";
  }
  process.stderr.write(
    `\nThis reset the design tail AND the pipeline entry (spec gate + experiment + acceptance -> designing),\n` +
      `the feature deploy-evidence, and the coarse phase. ${res.dbResyncNeeded ? "Three" : "Two"} things remain:\n` +
      "  1. Discard the story's actual git/Lakebase experiment BRANCH if one exists – this cannot clear a\n" +
      "     live branch, only the pipeline record of it. Do NOT leave it orphaned.\n" +
      `  2. Re-run the drive: it re-derives the resume point at the ${resume} and re-runs the design tail ->\n` +
      "     the spec gate (re-surfaced + re-approved, fresh integrity), then cuts a FRESH experiment and rebuilds.\n" +
      dbStep,
  );
  return 0;
}

if (isCliEntry(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((e) => {
    process.stderr.write(`consort-reopen-story: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
