#!/usr/bin/env node
// consort-cycle: the substrate surface for TDD cycle bookkeeping.
//
// The ORCHESTRATION (deterministic driver) calls this around the pure
// Navigator/Driver agents. The agents never record cycles or touch git:
//   - Navigator writes the next failing test, then the driver runs:
//       consort-cycle begin --feature F --story S [--tdd-dir D]
//     to stamp the RED cycle for that test.
//   - Driver writes code + runs the project's test command, then the driver runs:
//       consort-cycle green --feature F --story S [--tdd-dir D]
//     to record the runner outcome + stamp GREEN.
//
// Exit: 0 ok; 2 bad args; 1 op failure (e.g. no open RED cycle to green).

import { join } from "path";
import { resolveConsortDir, storyAcIds } from "../../consort/config/consort-paths.js";
import {
  beginNextPendingCycle,
  beginNextPendingBatch,
  greenOpenCycle,
  reviewAc,
  refactorAc,
  reviewStory,
  refactorStory,
  firstReviewPendingAc,
  firstRefactorPendingAc,
  greenVerifierForEnv,
} from "../../consort/pipeline/cycle-record.js";
import {
  writeSupersededTests,
  readSupersededTests,
  readGreenFailure,
  writeGreenFailure,
  readRegressionAssessment,
  writeRegressionAssessment,
  composeAssessedGreenFailure,
} from "../../consort/smells/supersession.js";
import { writeEscalation } from "../../consort/gates/escalation.js";
import { recordReflectionGate } from "../../consort/smells/reflection.js";
import { recordTestListGate } from "../../consort/smells/testlist-conformance.js";
import {
  readDeployVerifyAssessMarker,
  readDeployVerifyScope,
  markDeployVerifyAssessed,
  markDeployVerifyRefactored,
} from "../../consort/smells/deploy-verify-assess.js";
import {
  readRefactorVerifyAssessMarker,
  markRefactorVerifyAssessed,
  markRefactorVerifyRefactored,
} from "../../consort/smells/refactor-verify-assess.js";

interface Args {
  cmd?: string;
  feature?: string;
  story?: string;
  ac?: string;
  consortDir?: string;
  /** P8b: "hybrid-a" makes `begin` stamp a layer-batch RED (vs one test). */
  loop?: string;
  /** P8b: layer-batch cap for `begin --loop hybrid-a`. */
  batchCap?: number;
  /** flag-superseded: prior test files/node-ids the current AC supersedes. */
  tests?: string[];
  /** flag-superseded: why the prior tests are superseded (new AC + change). */
  reason?: string;
  /** assess-regression: the Navigator's root-cause finding for a genuine regression. */
  diagnosis?: string;
  /** assess-regression: the repair directive when the regression is driver-fixable. */
  fixDirective?: string;
  /** assess-regression --spec-defect: the failing test/NFR is itself wrong (not the code) — routes a
   *  design-lane reopen recommendation, not a Driver repair. */
  specDefect?: boolean;
  /** assess-regression --from <role>: the design role a spec-defect recommends re-authoring. */
  fromRole?: string;
  /** green: this green is the Driver's bounded REPAIR re-verify (consume the attempt). */
  repair?: boolean;
}

function parse(argv: string[]): Args {
  const out: Args = { cmd: argv[0] };
  for (let i = 1; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature": out.feature = argv[++i]; break;
      case "--story": out.story = argv[++i]; break;
      case "--ac": out.ac = argv[++i]; break;
      case "--tdd-dir": out.consortDir = argv[++i]; break;
      case "--loop": out.loop = argv[++i]; break;
      case "--test": (out.tests ??= []).push(argv[++i]); break;
      case "--reason": out.reason = argv[++i]; break;
      case "--diagnosis": out.diagnosis = argv[++i]; break;
      case "--fix": out.fixDirective = argv[++i]; break;
      case "--spec-defect": out.specDefect = true; break;
      case "--from": out.fromRole = argv[++i]; break;
      case "--repair": out.repair = true; break;
      case "--batch-cap": {
        const n = Number(argv[++i]);
        if (Number.isFinite(n) && n > 0) out.batchCap = Math.floor(n);
        break;
      }
    }
  }
  return out;
}

function usage(msg: string): number {
  process.stderr.write(
    `${msg}\nUsage: consort-cycle <begin|green|review|refactor> --feature <F> --story <S> [--ac <AC>] [--tdd-dir <D>] [--loop ac|hybrid-a] [--batch-cap <n>]\n`,
  );
  return 2;
}

async function main(): Promise<number> {
  const a = parse(process.argv.slice(2));
  if (!a.feature || !a.story) return usage("Error: --feature and --story are required.");
  const consortDir = a.consortDir ?? resolveConsortDir();
  const base = { consortDir, featureId: a.feature, story: a.story };

  switch (a.cmd) {
    case "begin": {
      // P8b: hybrid-a stamps ONE batch RED cycle for the first pending layer's
      // items (capped); the default (ac) stamps one RED for the next test.
      // story: one batch RED covering EVERY pending test in the story (the
      // Navigator writes the whole story's failing tests in one turn).
      // hybrid-a: one layer-batch (capped). ac: one RED for the next test.
      const r =
        a.loop === "story"
          ? beginNextPendingBatch(base, { cap: Number.MAX_SAFE_INTEGER })
          : a.loop === "hybrid-a"
            ? beginNextPendingBatch(base, { cap: a.batchCap })
            : beginNextPendingCycle(base);
      process.stdout.write(
        r.recorded
          ? `cycle: RED ${r.cycleId} for ${r.testId} (${r.acId})\n`
          : `cycle: no pending test for ${a.story} (every test-list item already has a cycle)\n`,
      );
      return 0;
    }
    case "green": {
      // HONEST GREEN: greenOpenCycle runs the verify suite against the running
      // app. On failure it leaves the cycle RED + raises an escalation; we exit
      // 0 (the escalation is recorded data, not a command crash) so the driver's
      // next readState routes to a clean raise-to-hil halt.
      // In a build replay (LAKEBASE_CONSORT_REPLAY_BUILD_DIR set) the per-turn
      // full-suite honest-GREEN is invalid (a later AC's test is legitimately RED
      // while only the current AC's code is overlaid), so trust the recorded GREEN
      // for this turn; the final all-ACs state is verified at the deploy gate.
      const r = await greenOpenCycle({ ...base, repair: a.repair, verify: greenVerifierForEnv() });
      if (r.needsAssess) {
        process.stdout.write(`cycle: GREEN verify failed for ${r.testId} -> Navigator assess (supersession vs regression): ${r.summary}\n`);
      } else if (r.escalated) {
        process.stdout.write(`cycle: GREEN BLOCKED for ${r.testId} -> raised to HIL: ${r.summary}\n`);
      } else {
        process.stdout.write(`cycle: GREEN ${r.cycleId} for ${r.testId}\n`);
      }
      return 0;
    }
    case "review": {
      // story granularity (default): the Navigator REVIEWs the WHOLE story in
      // one turn (review-verdict.json at the story root); no AC.
      if (a.loop === "story") {
        const r = reviewStory(consortDir, a.feature, a.story);
        process.stdout.write(`cycle: REVIEWED story ${a.story}${r.refactorRequested ? " (refactor requested)" : " (looks good)"}\n`);
        return 0;
      }
      // Record the Navigator's REVIEW of an AC (after its tests are all green).
      const ac = a.ac ?? firstReviewPendingAc(consortDir, a.feature, a.story);
      if (!ac) {
        process.stdout.write(`cycle: no AC awaiting review for ${a.story}\n`);
        return 0;
      }
      const r = reviewAc(consortDir, a.feature, a.story, ac);
      process.stdout.write(`cycle: REVIEWED ${ac}${r.refactorRequested ? " (refactor requested)" : " (looks good)"}\n`);
      return 0;
    }
    case "refactor": {
      // Record that the Driver completed the requested REFACTOR for an AC.
      // Like GREEN, the refactor is re-verified honestly: on a failed verify the
      // AC stays refactor-pending + an escalation is raised; we exit 0 (the
      // escalation is recorded data, not a crash) so the driver's next readState
      // routes to a clean raise-to-hil halt.
      // story granularity (default): the Driver REFACTORs the WHOLE story in
      // one turn; honest re-verify gates stamping (same as the per-AC path).
      if (a.loop === "story") {
        const r = await refactorStory(consortDir, a.feature, a.story, { verify: greenVerifierForEnv() });
        if (r.escalated) {
          process.stdout.write(`cycle: REFACTOR BLOCKED for story ${a.story} -> raised to HIL: ${r.summary}\n`);
        } else {
          process.stdout.write(`cycle: REFACTORED story ${a.story}\n`);
        }
        return 0;
      }
      const ac = a.ac ?? firstRefactorPendingAc(consortDir, a.feature, a.story);
      if (!ac) {
        process.stdout.write(`cycle: no AC awaiting refactor for ${a.story}\n`);
        return 0;
      }
      // Same replay-build trust applies to the refactor re-verify.
      const r = await refactorAc(consortDir, a.feature, a.story, ac, { verify: greenVerifierForEnv() });
      if (r.escalated) {
        process.stdout.write(`cycle: REFACTOR BLOCKED for ${ac} -> raised to HIL: ${r.summary}\n`);
      } else {
        process.stdout.write(`cycle: REFACTORED ${ac}\n`);
      }
      return 0;
    }
    case "flag-superseded": {
      // The Navigator flags PRIOR tests the current AC supersedes, so the Driver
      // may permissively refactor ONLY those when the honest-GREEN verify breaks
      // them. Requires --ac, at least one --test, and a --reason.
      if (!a.ac) return usage("flag-superseded: --ac is required.");
      if (!a.tests || a.tests.length === 0) return usage("flag-superseded: at least one --test is required.");
      if (!a.reason) return usage("flag-superseded: --reason is required.");
      writeSupersededTests(consortDir, a.feature, a.story, a.ac, { tests: a.tests, reason: a.reason });
      process.stdout.write(`cycle: flagged ${a.tests.length} superseded test(s) for ${a.story}/${a.ac}\n`);
      return 0;
    }
    case "assess-regression": {
      // The Navigator records its root-cause finding for a GENUINE regression
      // (not a supersession), so the diagnosis travels to the Driver / the HIL
      // instead of being lost. With --fix the regression is driver-fixable: the
      // directive routes a bounded Driver repair turn. Without --fix it is not
      // driver-fixable and assess-green will escalate carrying the diagnosis.
      if (!a.ac) return usage("assess-regression: --ac is required.");
      if (!a.diagnosis) return usage("assess-regression: --diagnosis is required.");
      // --spec-defect: the failing TEST/NFR is itself wrong (unrealistic/unsatisfiable/flaky), not the
      // code. Record it as a spec-defect (NOT a fixDirective) so the drive routes a raise-to-hil
      // recommending the design-lane reopen (--from <role>, default test-strategist), never a repair.
      if (a.specDefect) {
        writeRegressionAssessment(consortDir, a.feature, a.story, a.ac, {
          diagnosis: a.diagnosis,
          specDefect: { ...(a.fromRole ? { fromRole: a.fromRole } : {}), reason: a.diagnosis },
        });
        process.stdout.write(
          `cycle: SPEC-DEFECT assessed for ${a.story}/${a.ac} (test/NFR is wrong, not the code); design-lane reopen recommended (--from ${a.fromRole ?? "test-strategist"})\n`,
        );
        return 0;
      }
      writeRegressionAssessment(consortDir, a.feature, a.story, a.ac, {
        diagnosis: a.diagnosis,
        ...(a.fixDirective ? { fixDirective: a.fixDirective } : {}),
      });
      process.stdout.write(
        `cycle: regression assessed for ${a.story}/${a.ac}${a.fixDirective ? " (driver-fixable; repair directive recorded)" : " (not driver-fixable; will escalate with diagnosis)"}\n`,
      );
      return 0;
    }
    case "reflect-gate": {
      // Deterministic post-turn step after the Navigator's reflect turn: read the
      // per-story reflect-verdict.json and, if it did NOT pass, flag the
      // spec-level blocking smell(s) for the owning author(s), scoped to the
      // story. The existing revise-route/escalation machinery then routes +
      // bounds + escalates. A passed/absent verdict flags nothing.
      if (!a.story) return usage("reflect-gate: --story is required.");
      const hits = recordReflectionGate(consortDir, a.feature, a.story);
      process.stdout.write(
        hits.length === 0
          ? `cycle: reflect gate passed for ${a.story} (no design defect)\n`
          : `cycle: reflect gate flagged ${hits.length} design defect(s) for ${a.story}: ${hits.map((h) => h.smell).join(", ")}\n`,
      );
      return 0;
    }
    case "testlist-gate": {
      // Deterministic pre-reflect gate: run the structural test_list conformance
      // checks (client-kind↔layer, e2e coverage, jsdom-vacuous assertion) and, on a
      // violation, flag the reflect-testlist-defect smell (no LLM turn) so the
      // existing revise-route/escalation machinery bounds + routes it. A conformant
      // test-list self-clears any lingering smell.
      if (!a.story) return usage("testlist-gate: --story is required.");
      const hits = recordTestListGate(consortDir, a.feature, a.story);
      process.stdout.write(
        hits.length === 0
          ? `cycle: test-list gate passed for ${a.story} (structurally conformant)\n`
          : `cycle: test-list gate flagged ${hits.length} structural defect(s) for ${a.story}: ${hits.map((h) => h.smell).join(", ")}\n`,
      );
      return 0;
    }
    case "assess-green": {
      // Finalize the Navigator's assessment of a failed GREEN verify. Mark the
      // green-failure assessed (so a still-failing verify next escalates rather
      // than re-assessing). The verdict is READ from disk – the role's output:
      //   - superseded-tests.json present  -> supersession (Driver permissive green);
      //   - regression-assessment.json + fixDirective -> driver-fixable regression:
      //       record the diagnosis + directive on the marker; a Driver REPAIR turn
      //       is routed (no escalation yet);
      //   - regression-assessment.json, no fixDirective -> not driver-fixable:
      //       escalate carrying the Navigator's diagnosis;
      //   - nothing written -> genuine regression with no diagnosis: escalate with
      //       the bare verify summary (the prior, diagnosis-free fallback).
      const ac = a.ac;
      if (!ac) return usage("assess-green: --ac is required.");
      const gf = readGreenFailure(consortDir, a.feature, a.story, ac);
      const flagged = readSupersededTests(consortDir, a.feature, a.story, ac);
      const regression = readRegressionAssessment(consortDir, a.feature, a.story, ac);
      // composeAssessedGreenFailure PRESERVES the cross-round fixAttempts counter
      // (without it the assess turn reset the self-heal cap every round, so the
      // refactor-until-clean loop was unbounded – observed 4 rounds, counter stuck at 1).
      writeGreenFailure(consortDir, a.feature, a.story, ac, composeAssessedGreenFailure(gf, regression));
      if (flagged) {
        process.stdout.write(`cycle: assessed ${a.story}/${ac} -> superseded (${flagged.tests.length} test(s) flagged; Driver may permissively green)\n`);
      } else if (regression?.fixDirective) {
        // Driver-fixable regression: a bounded Driver repair turn is routed next
        // (the orchestration sees the fixDirective on the marker). No escalation.
        process.stdout.write(`cycle: assessed ${a.story}/${ac} -> driver-fixable regression; routing Driver repair: ${regression.diagnosis}\n`);
      } else if (regression?.specDefect) {
        // SPEC-DEFECT: the test/NFR is wrong (unrealistic/unsatisfiable/flaky), not the code. Do NOT
        // write a driver-green regression escalation — the green-failure now carries `specDefect`, so
        // the drive routes a raise-to-hil recommending the design-lane reopen (--from <role>) itself.
        const scope = regression.specDefect.fromRole ?? "test-strategist";
        process.stdout.write(`cycle: assessed ${a.story}/${ac} -> SPEC-DEFECT (test/NFR is wrong, not the code); design-lane reopen recommended (--from ${scope}): ${regression.diagnosis}\n`);
      } else {
        const why = regression?.diagnosis ?? gf?.summary ?? "";
        writeEscalation(consortDir, {
          source: "driver-green",
          reason: `GREEN verify failed for ${ac} in ${a.feature}/${a.story}: Navigator assessed it as a genuine regression${regression ? " (not driver-fixable)" : " (no superseded tests flagged)"}${why ? ` – ${why}` : ""}`,
          feature_id: a.feature,
          story_id: a.story,
          ac_id: ac,
        });
        process.stdout.write(`cycle: assessed ${a.story}/${ac} -> genuine regression, raised to HIL${regression ? " with diagnosis" : ""}\n`);
      }
      return 0;
    }
    case "assess-deploy-verify": {
      // Finalize the Navigator's story-level ASSESS-DEPLOY turn (deploy-verify
      // self-heal). The failure was already classified as shared-state
      // contamination (a marker exists). The Navigator's verdict is READ from
      // disk (deploy-verify-scope.json), the role's output:
      //   - directives present -> confirmed the contamination-fragile set: mark
      //     assessed + record the scope set (routes the Driver SCOPE-DEPLOY turn);
      //   - nothing written (the Navigator's veto: it judged the failure genuine
      //     despite the classifier) -> mark assessed (spend the one shot) + write
      //     the terminal deploy-verify escalation (raise-to-hil).
      // --story is OPTIONAL: absent = the FEATURE-ship self-heal (feature-scope
      // marker + scope file; no story_id on the escalation).
      const scopeLabel = a.story ? `${a.feature}/${a.story}` : a.feature;
      const marker = readDeployVerifyAssessMarker(consortDir, a.feature, a.story);
      if (!marker) {
        process.stdout.write(`cycle: assess-deploy-verify – no marker for ${scopeLabel} (nothing to assess)\n`);
        return 0;
      }
      const scope = readDeployVerifyScope(consortDir, a.feature, a.story);
      const scoped = scope?.directives?.map((d) => d.node_id).filter((n) => !!n) ?? [];
      if (scoped.length > 0) {
        markDeployVerifyAssessed(consortDir, a.feature, a.story, scoped);
        process.stdout.write(
          `cycle: assessed deploy-verify ${scopeLabel} -> ${scoped.length} contamination-fragile test(s) to scope; routing Driver SCOPE-DEPLOY\n`,
        );
      } else {
        markDeployVerifyAssessed(consortDir, a.feature, a.story);
        writeEscalation(consortDir, {
          source: "deploy-verify",
          reason: `deploy-verify failure for ${scopeLabel}: Navigator assessed it as genuine (no contamination-fragile tests to scope); raising to HIL`,
          feature_id: a.feature,
          ...(a.story ? { story_id: a.story } : {}),
        });
        process.stdout.write(`cycle: assessed deploy-verify ${scopeLabel} -> genuine (no scope set), raised to HIL\n`);
      }
      return 0;
    }
    case "refactor-deploy-verify": {
      // Finalize the Driver's SCOPE-DEPLOY turn: mark the flagged tests refactored
      // so the marker is no longer refactor-pending and the transition falls
      // through to the one re-deploy + re-verify (which clears the marker on pass,
      // or – if it still fails – writes the terminal escalation, the one-shot bound).
      // --story optional: absent = the feature-ship marker.
      markDeployVerifyRefactored(consortDir, a.feature, a.story);
      process.stdout.write(
        `cycle: deploy-verify scope refactor recorded for ${a.story ?? a.feature}; re-deploying to re-verify\n`,
      );
      return 0;
    }
    case "assess-refactor-verify": {
      // Finalize the Navigator's refactor-verify ASSESS turn. A marker exists (the
      // refactor broke the full suite). The Navigator's verdict is READ from disk
      // (the per-AC superseded-tests.json it wrote via flag-superseded):
      //   - superseded tests flagged -> confirmed the current story's refactor
      //     supersedes them: mark assessed + record the set (routes the Driver
      //     permissive-refactor turn);
      //   - nothing flagged (its veto: a genuine regression the refactor introduced)
      //     -> mark assessed (spend the one shot) + write the terminal refactor
      //     escalation (raise-to-hil).
      if (!a.story) return usage("assess-refactor-verify: --story is required.");
      const marker = readRefactorVerifyAssessMarker(consortDir, a.feature, a.story);
      if (!marker) {
        process.stdout.write(`cycle: assess-refactor-verify – no marker for ${a.feature}/${a.story} (nothing to assess)\n`);
        return 0;
      }
      // Aggregate the superseded tests the Navigator flagged across the story's ACs.
      const flagged: string[] = [];
      for (const ac of storyAcIds(consortDir, a.feature, a.story)) {
        const s = readSupersededTests(consortDir, a.feature, a.story, ac);
        if (s?.tests) flagged.push(...s.tests);
      }
      const uniqueFlagged = [...new Set(flagged)];
      if (uniqueFlagged.length > 0) {
        markRefactorVerifyAssessed(consortDir, a.feature, a.story, uniqueFlagged);
        process.stdout.write(
          `cycle: assessed refactor-verify ${a.story} -> ${uniqueFlagged.length} superseded test(s); routing Driver permissive refactor\n`,
        );
      } else {
        markRefactorVerifyAssessed(consortDir, a.feature, a.story);
        writeEscalation(consortDir, {
          source: "driver-refactor",
          reason: `REFACTOR verify failure for ${a.feature}/${a.story}: Navigator assessed it as a genuine regression (no superseded tests to refactor); raising to HIL`,
          feature_id: a.feature,
          story_id: a.story,
        });
        process.stdout.write(`cycle: assessed refactor-verify ${a.story} -> genuine regression (no supersession), raised to HIL\n`);
      }
      return 0;
    }
    case "refactor-superseded-verify": {
      // Finalize the Driver's permissive-refactor turn: mark the marker refactored
      // so it is no longer refactor-pending and the transition falls through to the
      // plain story refactor re-verify (which clears the marker on pass, or – if it
      // still fails – escalates via the now-assessed marker, the one-shot bound).
      if (!a.story) return usage("refactor-superseded-verify: --story is required.");
      markRefactorVerifyRefactored(consortDir, a.feature, a.story);
      process.stdout.write(`cycle: refactor-verify superseded refactor recorded for ${a.story}; re-verifying\n`);
      return 0;
    }
    default:
      return usage(`unknown subcommand: ${a.cmd}`);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
