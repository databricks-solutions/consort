#!/usr/bin/env node
// the orchestrator's interface to the per-story build queue +
// per-story status (.tdd/features/<F>/pipeline.json). The design lane sets
// status as it streams; on a per-story gate approval the orchestrator enqueues
// the story; the single build lane dispatches the head and completes it.
//
// Usage (all take --feature <F> [--tdd-dir <dir>]; default tdd-dir = $PWD/.consort, honors legacy $PWD/.sftdd + $PWD/.tdd):
//   consort-pipeline status        --feature F [--json]
//   consort-pipeline set            --feature F --story S --status <designing|awaiting-gate|ready|building|done>
//   consort-pipeline surface        --feature F --story S                 (design done -> awaiting-gate, open the gate)
//   consort-pipeline approve-gate   --feature F --story S --approver A [--spec-hash H] [--at ISO]
//   consort-pipeline withdraw-gate  --feature F --story S --approver A --reason R [--at ISO]
//   consort-pipeline enqueue        --feature F --story S                 (low-level: mark ready + queue, no gate)
//   consort-pipeline dispatch       --feature F                          (pull FIFO head into the single lane if idle)
//   consort-pipeline complete       --feature F                          (active story done, free the lane)
//   consort-pipeline cut-experiment --feature F --story S --slug X --branch B --parent FB [--lakebase-uid U] [--parent-sha SHA] [--n N]
//   consort-pipeline await-acceptance --feature F --story S              (built + deployed -> awaiting-acceptance)
//   consort-pipeline accept         --feature F --story S --approver A    (PO accepts -> experiment merged, story done, lane freed)
//   consort-pipeline discard        --feature F --story S --approver A --reason R   (PO discards -> torn down, out of sprint)
//   consort-pipeline revise         --feature F --story S --approver A --reason R   (PO sends back -> designing; self-heals a blocking smell)
//   consort-pipeline rebuild-story  --feature F --story S [--approver A] [--at ISO]  (clean-slate re-drive: clears build cycles + escalations + smells, re-forks the experiment, back on the build lane)
//   consort-pipeline resolve-smell  --feature F --smell NAME --approver A [--story S] [--reason R]   (clear a blocking smell without revise/discard)
//
// The formal per-story spec gate is surface -> approve-gate; approve-gate is
// what authorizes the ready transition (it enqueues). `enqueue` stays as the
// low-level re-queue primitive. The build lane records its experiment branch
// with cut-experiment, then await-acceptance -> accept/discard/revise (each
// frees the single lane). The actual branch fork/merge/teardown is the
// experiment-lifecycle CLI's job; these record pipeline state.
//
// surface + approve-gate enforce the per-story draft invariant: they hard-fail
// (exit 3) if any other un-gated story already has ACs on disk, i.e. the Spec
// Author batched the feature instead of streaming one story at a time.
//
// Exit: 0 ok; 2 bad args; 3 per-story draft invariant violated (batched ACs).

import {
  readPipeline,
  writePipeline,
  updatePipeline,
  setStoryStatus,
  enqueueReady,
  dispatchNext,
  completeActive,
  syncBreakdownToPipeline,
  resetIncompleteBreakdown,
  surfaceForGate,
  approveStoryGateFromDisk,
  batchedDraftMessage,
  withdrawStoryGate,
  findBatchedDraftStories,
  cutStoryExperiment,
  awaitAcceptance,
  discardStory,
  STORY_STATUSES,
  type StoryStatus,
  type StoryPipeline,
} from "../../consort/pipeline/story-pipeline";
import { storyDesignFingerprint } from "../../consort/pipeline/design-fingerprint.js";
import { healAndReportStoryNarrative } from "../../consort/intake/spec-sync";
import { join } from "path";
import { resolveConsortDir, ARTIFACT_ROOT } from "../../consort/config/consort-paths.js";
import { reviseStoryWithSelfHeal, clearStoryBlockingSmellOnDiscard, rebuildStory } from "../../consort/orchestrator/status/revise.js";
import { markSmellResolved } from "../../consort/smells/smells.js";
import { resolveAcceptMergeArgs, experimentMergeArgv } from "../../consort/experiment/experiment-merge.js";
import { runKitBinSync } from "../../consort/config/kit-bin.js";

interface Args {
  cmd?: string;
  feature?: string;
  story?: string;
  status?: string;
  approver?: string;
  specHash?: string;
  reason?: string;
  at?: string;
  slug?: string;
  branch?: string;
  parent?: string;
  parentSha?: string;
  lakebaseUid?: string;
  n?: string;
  smell?: string;
  consortDir?: string;
  projectDir?: string;
  instance?: string;
  json?: boolean;
}

function parse(argv: string[]): Args {
  const out: Args = {};
  out.cmd = argv[0];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--feature") out.feature = argv[++i];
    else if (a === "--story") out.story = argv[++i];
    else if (a === "--status") out.status = argv[++i];
    else if (a === "--approver") out.approver = argv[++i];
    else if (a === "--spec-hash") out.specHash = argv[++i];
    else if (a === "--reason") out.reason = argv[++i];
    else if (a === "--at") out.at = argv[++i];
    else if (a === "--slug") out.slug = argv[++i];
    else if (a === "--branch") out.branch = argv[++i];
    else if (a === "--parent") out.parent = argv[++i];
    else if (a === "--parent-sha") out.parentSha = argv[++i];
    else if (a === "--lakebase-uid") out.lakebaseUid = argv[++i];
    else if (a === "--n") out.n = argv[++i];
    else if (a === "--smell") out.smell = argv[++i];
    else if (a === "--tdd-dir") out.consortDir = argv[++i];
    else if (a === "--project-dir") out.projectDir = argv[++i];
    else if (a === "--instance") out.instance = argv[++i];
    else if (a === "--json") out.json = true;
  }
  return out;
}

function usage(msg: string): number {
  process.stderr.write(
    `${msg}\n` +
      `Usage: consort-pipeline <status|set|surface|approve-gate|withdraw-gate|enqueue|dispatch|complete|cut-experiment|await-acceptance|accept|discard|revise|rebuild-story|resolve-smell> --feature <F> [--tdd-dir <dir>]\n` +
      `  set additionally needs --story <S> --status <${STORY_STATUSES.join("|")}>\n` +
      `  surface needs --story <S>\n` +
      `  approve-gate needs --story <S> --approver <A> [--spec-hash <H>] [--at <ISO>]\n` +
      `  withdraw-gate needs --story <S> --approver <A> --reason <R> [--at <ISO>]\n` +
      `  enqueue needs --story <S>\n` +
      `  cut-experiment needs --story <S> --slug <X> --branch <B> --parent <FB> [--lakebase-uid <U>] [--parent-sha <SHA>] [--n <N>] [--at <ISO>]\n` +
      `  await-acceptance needs --story <S>\n` +
      `  accept needs --story <S> --approver <A> [--at <ISO>]\n` +
      `  discard / revise need --story <S> --approver <A> --reason <R> [--at <ISO>]\n` +
      `  rebuild-story needs --story <S> [--approver <A>] [--at <ISO>]\n` +
      `  resolve-smell needs --smell <NAME> --approver <A> [--story <S>] [--reason <R>]\n`,
  );
  return 2;
}

/**
 * Hard-fail (exit 3) when the Spec Author batched acceptance criteria across
 * stories instead of drafting one at a time. The per-story spec gate (surface /
 * approve-gate) is the choke point: a story cannot be gated while sibling
 * un-gated stories already have ACs on disk. Returns 3 + prints actionable
 * guidance when batched; null when the draft is correctly one-story-scoped.
 */
function rejectBatchedDraft(
  consortDir: string,
  feature: string,
  pipeline: StoryPipeline,
  story: string,
): number | null {
  const batched = findBatchedDraftStories(consortDir, feature, pipeline, story);
  if (batched.length === 0) return null;
  process.stderr.write(batchedDraftMessage(story, batched) + "\n");
  return 3;
}

async function main(): Promise<number> {
  const args = parse(process.argv.slice(2));
  const consortDir = args.consortDir ?? resolveConsortDir();
  if (!args.cmd) return usage("missing subcommand");
  if (!args.feature && args.cmd !== "help") return usage("missing --feature");
  const feature = args.feature as string;

  if (args.cmd === "status") {
    const p = readPipeline(consortDir, feature);
    if (args.json) {
      process.stdout.write(JSON.stringify(p, null, 2) + "\n");
    } else {
      process.stdout.write(`feature ${p.feature_id}  active=${p.build_active ?? "(idle)"}  queue=[${p.build_queue.join(", ")}]\n`);
      for (const [s, v] of Object.entries(p.stories)) {
        const gate = v.gate ? `  gate=${v.gate.status}` : "";
        const exp = v.experiment ? `  exp=${v.experiment.slug}(${v.experiment.status})` : "";
        const acc = v.acceptance?.decision ? `  acceptance=${v.acceptance.decision}` : "";
        process.stdout.write(`  ${s}\t${v.status}${gate}${exp}${acc}\n`);
      }
    }
    return 0;
  }

  // FEIP-8024: clear an INCOMPLETE breakdown (partial story stubs with no
  // populated feature-spec.json) so the next spec-author breakdown regenerates
  // cleanly instead of deadlocking. Runs before the pipeline read so it operates
  // on the on-disk breakdown, not pipeline.json. No-op on a complete breakdown.
  if (args.cmd === "reset-breakdown") {
    const r = resetIncompleteBreakdown(consortDir, feature);
    process.stdout.write(
      r.reset
        ? `reset-breakdown: cleared an incomplete breakdown for ${feature} (re-dispatch will regenerate)\n`
        : `reset-breakdown: breakdown for ${feature} is complete or absent; nothing to reset\n`,
    );
    return 0;
  }

  const pipeline = readPipeline(consortDir, feature);

  switch (args.cmd) {
    case "sync-breakdown": {
      // Seed the pipeline from the on-disk breakdown (stories/<S>/ dirs). Used
      // by the driver right after spec-author breakdown so the streaming lanes
      // have stories to advance. Re-reads + writes the pipeline itself.
      const r = syncBreakdownToPipeline(consortDir, feature);
      // Heal + assert story.json narrative conformance AT the producer's own hook
      // (self-contained: does its own story.md backfill, so it does not depend on the
      // separate post-turn --reconcile having run first). The spec-author reliably
      // writes the As-a/I-want/So-that narrative to story.md but not always into the
      // JSON stub; the backfill fixes that. A stub the backfill CANNOT heal (story.md
      // also lacks a parseable narrative – e.g. a truncated breakdown turn) is a
      // genuinely incomplete breakdown: FAIL FAST here at design (exit non-zero halts
      // the drive) instead of passing build+accept and only detonating the
      // feature-complete conformance gate ~160 turns later (the observed F1/F6 halt
      // that blocked advancing to the next feature).
      const { healed, missing } = healAndReportStoryNarrative(consortDir, feature);
      process.stdout.write(
        `sync-breakdown: +${r.added.length} (${r.added.join(", ") || "none"}); ${r.total.length} tracked` +
          (healed.length ? `; healed narrative in ${healed.join(", ")} from story.md` : "") +
          "\n",
      );
      if (missing.length > 0) {
        process.stderr.write(
          `sync-breakdown: FAIL – ${missing.length} story stub(s) still missing required narrative after story.md backfill: ` +
            missing.map((m) => `${m.story} [${m.fields.join("/")}]`).join(", ") +
            `. The spec-author must write the "As a / I want / So that" narrative into each story.md ` +
            `(story.schema requires asA/iWantTo/soThat on story.json). Halting at design, not the feature-complete gate.\n`,
        );
        return 1;
      }
      return 0;
    }
    case "set": {
      if (!args.story) return usage("set needs --story");
      if (!args.status || !(STORY_STATUSES as readonly string[]).includes(args.status)) {
        return usage(`set needs a valid --status (${STORY_STATUSES.join("|")})`);
      }
      updatePipeline(consortDir, feature, (p) => setStoryStatus(p, args.story!, args.status as StoryStatus));
      process.stdout.write(`${args.story} -> ${args.status}\n`);
      return 0;
    }
    case "surface": {
      if (!args.story) return usage("surface needs --story");
      const batched = rejectBatchedDraft(consortDir, feature, pipeline, args.story);
      if (batched !== null) return batched;
      updatePipeline(consortDir, feature, (p) => surfaceForGate(p, args.story!));
      process.stdout.write(`surfaced ${args.story} for the per-story spec gate (awaiting-gate)\n`);
      return 0;
    }
    case "approve-gate": {
      if (!args.story) return usage("approve-gate needs --story");
      if (!args.approver) return usage("approve-gate needs --approver");
      // The per-story gate is approved through the ONE shared helper (FEIP-8008),
      // the same path the human-facing consort-approve-gate --story uses.
      const r = approveStoryGateFromDisk(consortDir, feature, args.story, {
        approver: args.approver,
        at: args.at,
        specHash: args.specHash,
      });
      if (!r.ok) {
        if (r.batched) {
          process.stderr.write(batchedDraftMessage(args.story, r.batched) + "\n");
          return 3;
        }
        process.stderr.write(`approve-gate: ${r.error}\n`);
        return 2;
      }
      process.stdout.write(
        `approved gate for ${args.story} (by ${args.approver}); ready + queued (queue: ${(r.queue ?? []).join(", ")})\n`,
      );
      return 0;
    }
    case "withdraw-gate": {
      if (!args.story) return usage("withdraw-gate needs --story");
      if (!args.approver) return usage("withdraw-gate needs --approver");
      if (!args.reason) return usage("withdraw-gate needs --reason");
      const at = args.at ?? new Date().toISOString();
      updatePipeline(consortDir, feature, (p) => withdrawStoryGate(p, args.story!, { approver: args.approver!, at, reason: args.reason! }));
      process.stdout.write(`withdrew gate for ${args.story} (${args.reason}); back to awaiting-gate\n`);
      return 0;
    }
    case "enqueue": {
      if (!args.story) return usage("enqueue needs --story");
      const afterEnqueue = updatePipeline(consortDir, feature, (p) => enqueueReady(p, args.story!));
      process.stdout.write(`enqueued ${args.story} (queue: ${afterEnqueue.build_queue.join(", ")})\n`);
      return 0;
    }
    case "dispatch": {
      let dispatched: string | null = null;
      const afterDispatch = updatePipeline(consortDir, feature, (p) => {
        dispatched = dispatchNext(p) ?? null;
      });
      process.stdout.write(
        dispatched
          ? `dispatched ${dispatched} to the build lane\n`
          : `no dispatch: ${afterDispatch.build_active ? `lane busy on ${afterDispatch.build_active}` : "queue empty"}\n`,
      );
      return 0;
    }
    case "complete": {
      let completed: string | null = null;
      updatePipeline(consortDir, feature, (p) => {
        completed = completeActive(p) ?? null;
      });
      process.stdout.write(completed ? `completed ${completed}; lane idle\n` : `no active story to complete\n`);
      return 0;
    }
    case "cut-experiment": {
      if (!args.story) return usage("cut-experiment needs --story");
      if (!args.slug || !args.branch || !args.parent) {
        return usage("cut-experiment needs --slug, --branch, and --parent");
      }
      updatePipeline(consortDir, feature, (p) =>
        cutStoryExperiment(p, args.story!, {
          slug: args.slug!,
          branch: args.branch!,
          parent: args.parent!,
          lakebase_branch_uid: args.lakebaseUid,
          parent_sha: args.parentSha,
          n: args.n !== undefined ? Number(args.n) : undefined,
          at: args.at ?? new Date().toISOString(),
          // Stamp the design this experiment is cut to build (stale-experiment guardrail).
          ...(() => {
            const fp = storyDesignFingerprint(consortDir, feature, args.story as string);
            return fp !== undefined ? { design_fingerprint: fp } : {};
          })(),
        }),
      );
      process.stdout.write(`cut experiment ${args.slug} for ${args.story} on ${args.branch} (parent ${args.parent})\n`);
      return 0;
    }
    case "await-acceptance": {
      if (!args.story) return usage("await-acceptance needs --story");
      updatePipeline(consortDir, feature, (p) => awaitAcceptance(p, args.story!));
      process.stdout.write(`${args.story} -> awaiting-acceptance (PO reviewing the running story)\n`);
      return 0;
    }
    case "accept": {
      if (!args.story) return usage("accept needs --story");
      if (!args.approver) return usage("accept needs --approver");
      // FEIP-8013: accept LANDS the story's code (git-merge + migrations +
      // teardown) then records acceptance. Before, this recorded state only and the
      // merge lived elsewhere; interactive, the human ran only this and the merge
      // never fired, stranding the code on the experiment branch. This CLI does NOT
      // touch the merge substrate itself: it RESOLVES the merge args (slug/branches
      // from the persisted experiment record; instance from --instance else
      // scm-state) and DELEGATES to `consort-experiment merge`, the single
      // door that owns the git/Lakebase merge (which records acceptStory + is
      // idempotent). The human's `pipeline accept` therefore routes through that CLI.
      const projectDir = args.projectDir ?? process.cwd();
      const resolved = resolveAcceptMergeArgs(consortDir, projectDir, feature, args.story, {
        ...(args.instance ? { instance: args.instance } : {}),
      });
      if (!resolved.ok) {
        process.stderr.write(`accept: ${resolved.error}\n`);
        return 2;
      }
      const argv = experimentMergeArgv(feature, args.story, resolved, {
        approver: args.approver,
        projectDir,
        consortDir,
        ...(args.at ? { at: args.at } : {}),
      });
      return runKitBinSync("consort-experiment", argv, projectDir);
    }
    case "discard": {
      if (!args.story) return usage("discard needs --story");
      if (!args.approver) return usage("discard needs --approver");
      if (!args.reason) return usage("discard needs --reason");
      discardStory(pipeline, args.story, { approver: args.approver, at: args.at ?? new Date().toISOString(), reason: args.reason });
      writePipeline(consortDir, pipeline);
      // A discarded story leaves the sprint; clear any blocking smell against it so
      // the next drive does not re-block on a smell for a story that is gone.
      const cleared = clearStoryBlockingSmellOnDiscard(consortDir, feature, args.story, args.approver);
      const smellNote = cleared ? `; cleared blocking smell '${cleared}'` : "";
      process.stdout.write(`discarded ${args.story} (${args.reason}); experiment torn down, out of sprint, lane freed${smellNote}\n`);
      return 0;
    }
    case "revise": {
      if (!args.story) return usage("revise needs --story");
      if (!args.approver) return usage("revise needs --approver");
      if (!args.reason) return usage("revise needs --reason");
      // Route through the SAME self-heal the driver's auto-route uses: when a
      // blocking smell is open against the story this resets to designing, RE-BRIEFS
      // the owning author with the coverage-forcing verdict, AND resolves the smell
      // (Findings 22 + 23). A hollow reset left the smell open and looped forever.
      const outcome = reviseStoryWithSelfHeal(consortDir, feature, args.story, {
        approver: args.approver,
        reason: args.reason,
        ...(args.at ? { at: args.at } : {}),
      });
      if (outcome.mode === "self-heal") {
        process.stdout.write(
          `revising ${args.story} (${args.reason}); smell '${outcome.smell}' resolved, ` +
            `${outcome.routedTo} re-briefed, experiment torn down, back to designing\n`,
        );
      } else {
        process.stdout.write(`revising ${args.story} (${args.reason}); experiment torn down, back to designing, lane freed\n`);
      }
      return 0;
    }
    case "rebuild-story": {
      // The sanctioned "re-drive this story from a clean slate" op (Finding 27):
      // clears the build cycles + test-list, the story's HIL escalations AND
      // blocking smells, resets the experiment for a clean re-fork, and puts the
      // story back on the build lane – so recovering a story after a caught
      // false-GREEN never needs `rm -rf .consort/cycles/...` + hand-edits.
      if (!args.story) return usage("rebuild-story needs --story");
      let r;
      try {
        r = rebuildStory(consortDir, feature, args.story, {
          ...(args.approver ? { approver: args.approver } : {}),
          ...(args.at ? { at: args.at } : {}),
        });
      } catch (e) {
        process.stderr.write(`rebuild-story: ${e instanceof Error ? e.message : String(e)}\n`);
        return 2;
      }
      const parts = [
        r.cyclesCleared ? "cleared build cycles" : "no build cycles to clear",
        `${r.testItemsReset} test item(s) reset`,
        `${r.escalationsCleared.length} escalation(s) cleared`,
        r.smellsCleared.length ? `smells cleared: ${r.smellsCleared.join(", ")}` : "no smells to clear",
        r.experimentReset ? "experiment reset for re-fork" : "no experiment to reset",
      ];
      process.stdout.write(`rebuild-story ${args.story}: ${parts.join("; ")}; back on the build lane (building)\n`);
      return 0;
    }
    case "resolve-smell": {
      // Explicit escape hatch: resolve a blocking smell without a revise/discard,
      // so an operator never hand-edits .consort/smells.json (Finding 23). Marks the
      // entry `cleared` (does not spend the revise budget).
      if (!args.smell) return usage("resolve-smell needs --smell");
      if (!args.approver) return usage("resolve-smell needs --approver");
      const ok = markSmellResolved(consortDir, args.smell, {
        ...(args.story ? { story_id: args.story } : {}),
        kind: "cleared",
        note: `cleared by ${args.approver}${args.reason ? `: ${args.reason}` : ""}`,
      });
      if (!ok) {
        process.stderr.write(`no open smell '${args.smell}'${args.story ? ` for story ${args.story}` : ""} to resolve\n`);
        return 1;
      }
      process.stdout.write(`resolved smell '${args.smell}'${args.story ? ` (story ${args.story})` : ""}\n`);
      return 0;
    }
    default:
      return usage(`unknown subcommand: ${args.cmd}`);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
