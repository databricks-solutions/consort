// Parallel per-AC verify (#5) — the LIVE adapter (P2b): the real driveSerial /
// driveInLane that `runAcLanes` orchestrates.
//
//   - driveSerial(ac): run the EXISTING build drive in the MAIN experiment
//     worktree, SCOPED to one AC (CONSORT_SCOPE_AC), against the experiment
//     branch. Used for the migration-authoring first AC.
//   - driveInLane(ac): provision an isolated lane (withAcLane: git worktree +
//     COW child off the experiment branch), then run the SAME scoped build drive
//     inside the lane's worktree against the lane's COW branch. Used for AC2..n,
//     fanned out concurrently by the coordinator.
//
// Both reuse `consort-drive --only build` unchanged — the AC scope is injected via
// CONSORT_SCOPE_AC (storyTestProgress filters the whole build state to that AC, so
// the serial loop drives only its RED -> GREEN and stops at await-acceptance). No
// `nextTransition` change. The per-AC REVIEW/REFACTOR run in-lane (scoped to the
// AC's diff); deploy-verify + accept are story-close, post-merge, on the resumed
// normal drive.

import { spawn, execFileSync } from "node:child_process";
import { join } from "node:path";
import { appendFileSync, createWriteStream, mkdirSync, writeFileSync, existsSync, cpSync, rmSync } from "node:fs";
import { planAcLanes, runAcLanes, type AcLanePlan, type RunAcLanesResult } from "./ac-lane-coordinator.js";
import { withAcLane, acLaneBranchNames } from "./ac-lane.js";
import { mergeAcLanes, type AcLaneMergeResult } from "./ac-lane-merge.js";
import { supersededTestCandidates, partitionSupersededFiles } from "../architecture/contract-clean.js";
import { ARTIFACT_ROOT } from "../config/consort-paths.js";

export interface ParallelAcLanesLiveArgs {
  /** The main experiment worktree (the story's checkout). */
  projectDir: string;
  /** Lakebase project id. */
  instance: string;
  featureId: string;
  story: string;
  /** The story experiment branch (lanes COW-fork their DBs off it). */
  experimentBranch: string;
  /** The story's ACs in design order. */
  acOrder: string[];
  /** `build.parallelAcLanes` lever + `budget.concurrent_branches` cap. */
  enabled: boolean;
  concurrency: number;
  /** opt-in: author the migration in a dedicated serial PREP step, then fan out ALL ACs (incl AC1). */
  migrationPrepStep?: boolean;
  /** opt-in: split a multi-kind AC into ONE LANE PER KIND (needs acKinds). */
  splitAcsByKind?: boolean;
  /** Per-AC test-kind composition (ac -> kinds present), the structural input the split reads. */
  acKinds?: Record<string, string[]>;
  /** Injectable spawn (hermetic coordinator tests stub it); defaults to the real
   *  `./scripts/lk consort-drive --only build` scoped by CONSORT_SCOPE_AC (+ CONSORT_SCOPE_KINDS). */
  driveScoped?: (a: { ac: string; cwd: string; lakebaseBranch: string; deferSupersession?: boolean; label?: string; kinds?: string[] }) => Promise<void>;
  /** Injectable migration-prep (migrationPrep plan only); defaults to a focused migration-author drive. */
  driveMigrationPrep?: (ac: string) => Promise<void>;
  /** Injectable supersession sweep; defaults to one focused `claude -p` driver turn (runs post-merge). */
  clearSupersession?: () => Promise<number>;
}

/** Spawn the real scoped build drive in `cwd` against `lakebaseBranch`, bounded to
 *  one AC via CONSORT_SCOPE_AC. Resolves on exit 0, rejects otherwise. */
function defaultDriveScoped(args: ParallelAcLanesLiveArgs) {
  // OBSERVABILITY: each fanned-out lane runs in its OWN isolated worktree, so its drive-live.log is
  // off in that worktree — invisible to the operator watching the main run. Stream every scoped
  // drive's narration, PREFIXED by its lane label, into the MAIN liveness sidecar (agent-live.log,
  // what `consort-watch` tails), with START/EXIT bookends + a heartbeat. Three lanes run concurrently,
  // so the prefix (`[lane:AC2]` / `[serial:AC1]`) is what makes them individually followable.
  const mainLive = join(args.projectDir, ARTIFACT_ROOT, "agent-live.log");
  const iso = () => new Date().toISOString();
  const note = (m: string) => { try { appendFileSync(mainLive, `${m}\n`); } catch { /* best effort */ } };
  return (a: { ac: string; cwd: string; lakebaseBranch: string; deferSupersession?: boolean; label?: string; kinds?: string[] }): Promise<void> =>
    new Promise((resolve, reject) => {
      const label = a.label ?? a.ac;
      const t0 = Date.now();
      const secs = () => Math.round((Date.now() - t0) / 1000);
      note(`--- ${iso()} [${label}] drive START (branch ${a.lakebaseBranch}, worktree ${a.cwd})`);
      const hb = setInterval(() => note(`  ⏳ ${iso()} [${label}] running ~${secs()}s`), 30000);
      const emitLines = (stream: NodeJS.ReadableStream | null) => {
        let buf = "";
        stream?.on("data", (d: Buffer) => {
          buf += d.toString();
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
            if (line.trim()) note(`[${label}] ${line}`);
          }
        });
      };
      const child = spawn(
        join(a.cwd, "scripts", "lk"),
        [
          "consort-drive",
          "--feature", args.featureId,
          "--story", args.story,
          "--only", "build",
          "--gates", "proxy",
        ],
        {
          cwd: a.cwd,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            CONSORT_SCOPE_AC: a.ac,
            // Split-AC lane: scope this lane to the AC's tests of these KINDS only (e.g. a heavy AC's
            // e2e lane sees only its client tests; its unit lane the rest), so the two lanes author
            // disjoint test slices concurrently. Absent => the whole AC (storyTestProgress ignores it).
            ...(a.kinds?.length ? { CONSORT_SCOPE_KINDS: a.kinds.join(",") } : {}),
            // Re-entrancy SENTINEL: marks this as a coordinator-spawned sub-lane so its
            // own beforeAction hook does NOT re-delegate to the parallel-lane coordinator
            // (infinite fan-out). Keyed separately from CONSORT_SCOPE_AC (the build-state
            // scope filter) so a STALE/ambient CONSORT_SCOPE_AC inherited by a TOP-LEVEL
            // drive can never masquerade as a sub-lane and silently disable the fan-out.
            CONSORT_AC_LANE: "1",
            // DEFER the cross-story supersession OFF the serial-first AC's critical path.
            // The serial-first AC authors the drop migration — which is what makes the
            // prior-story tests fail. Left to the normal reactive loop, that AC grinds the
            // ENTIRE superseded set per-cycle (the 30-min serial head that starves fan-out).
            // With this set, the AC's green is NOT blocked by (and the driver is NOT directed
            // to retarget) the deterministic superseded-candidate set; the coordinator clears
            // it ONCE via clearSupersession right after, then fans out. Only the serial-first.
            ...(a.deferSupersession ? { CONSORT_DEFER_SUPERSESSION: "1" } : {}),
            LAKEBASE_BRANCH_ID: a.lakebaseBranch,
            LAKEBASE_CONSORT_AUTO_CONTINUE: "1",
          },
        },
      );
      emitLines(child.stdout);
      emitLines(child.stderr);
      child.on("error", (e) => { clearInterval(hb); note(`--- ${iso()} [${label}] drive ERROR: ${e.message}`); reject(e); });
      child.on("exit", (code) => {
        clearInterval(hb);
        note(`--- ${iso()} [${label}] drive EXIT ${code} in ${secs()}s`);
        code === 0 ? resolve() : reject(new Error(`scoped drive for ${a.ac} exited ${code}`));
      });
    });
}

export interface ParallelAcLanesLiveResult extends RunAcLanesResult {
  plan: AcLanePlan;
  /** P3 merge of the fanned-out lane branches back onto the experiment branch
   *  (parallel mode only). */
  merge?: AcLaneMergeResult;
  /** ACs re-run SEQUENTIALLY on the merged base — the conflict/failure fallback. */
  sequentialFallback: string[];
  /** S2: count of superseded prior-story test files the POST-MERGE retarget handled (0 => none). */
  supersededCleared?: number;
}

/** The supersession sweep (HYBRID): deterministically RETIRE pure files + LLM-retarget the mixed ones.
 *  S2: this now runs POST-MERGE (runParallelAcLanesLive), on the fully-merged base, NOT as a pre-fan-out
 *  gate — the lanes DEFER supersession at build time, so the sweep's only job is the permanent cleanup
 *  before story-close's full-suite deploy-verify. Deterministically collects every superseded cross-story
 *  test (supersededTestCandidates), retires the PURE files, retargets the MIXED ones in ONE driver turn,
 *  commits. Returns the count handled (0 => nothing superseded, a no-op). Injectable for tests. */
function defaultClearSupersession(args: ParallelAcLanesLiveArgs) {
  return async (): Promise<number> => {
    const cands = supersededTestCandidates({ projectDir: args.projectDir });
    const allFiles = [...new Set(cands.candidates.map((c) => c.file))];
    if (allFiles.length === 0) return 0;
    // HYBRID sweep: deterministically retire the PURE files (every test fn references a dropped symbol —
    // the whole file tests the now-gone feature) and run the minutes-long LLM turn ONLY on the MIXED
    // files (surviving tests interleaved with stale ones) that need per-assertion judgment. A dropped
    // column's superseded set is usually mostly dedicated-feature files, so this skips most — or all —
    // of the LLM sweep (live: 15 files / 815s serial gate before fan-out).
    const { pureRemovable, mixed } = partitionSupersededFiles(args.projectDir, cands.candidates, cands.droppedSymbols);
    const directive =
      `SUPERSESSION SWEEP (story ${args.story}): the contract migration dropped ${cands.droppedSymbols.join(", ")}. ` +
      `Retarget these PRIOR tests off the dropped symbol(s) to the surviving columns in ONE pass — update or remove ` +
      `ONLY the stale assertions, do NOT weaken any still-valid assertion, and do NOT change product code:\n` +
      mixed.map((f) => `  - ${f}`).join("\n");
    // OBSERVABILITY: the sweep is a minutes-long claude turn. Left with stdio inherited it writes
    // NOTHING to .consort, so the operator (and the liveness tail) cannot tell it from a hang — a real
    // gap, since nothing else surfaces it. Stream its output + a heartbeat to the liveness sidecar
    // (.consort/agent-live.log, what `consort-watch` tails), bookend it with start/done, and drop a
    // durable marker so the sweep has a record like any other turn.
    const consortDir = join(args.projectDir, ARTIFACT_ROOT);
    const liveLog = join(consortDir, "agent-live.log");
    const iso = () => new Date().toISOString();
    const note = (m: string) => { try { appendFileSync(liveLog, `${m}\n`); } catch { /* best effort */ } };
    try { mkdirSync(consortDir, { recursive: true }); } catch { /* */ }
    const t0 = Date.now();
    const secs = () => Math.round((Date.now() - t0) / 1000);
    note(`--- ${iso()} SUPERSESSION SWEEP start: ${pureRemovable.length} pure file(s) retired deterministically, ${mixed.length} mixed file(s) to the LLM, off ${cands.droppedSymbols.join(", ")}`);
    const hb = setInterval(() => note(`  ⏳ ${iso()} supersession sweep running ~${secs()}s`), 30000);
    let ok = false;
    try {
      // DETERMINISTIC half: delete the wholly-superseded files. No LLM, no verify — they test a feature
      // that no longer exists; the current story's ACs cover any surviving behavior. `git add` below
      // stages these deletions alongside the LLM's edits into the one sweep commit.
      for (const f of pureRemovable) {
        try { rmSync(join(args.projectDir, f), { force: true }); note(`  [sweep:pure] retired ${f}`); }
        catch (e) { note(`  [sweep:pure] retire failed ${f}: ${e instanceof Error ? e.message : String(e)}`); }
      }
      // LLM half: ONLY the mixed files. If none, the sweep is pure-deterministic (zero LLM time).
      if (mixed.length === 0) {
        note(`  ${iso()} no mixed files — LLM sweep skipped (all superseded files retired deterministically)`);
      } else
      await new Promise<void>((resolve, reject) => {
        // STREAM the sweep's LIVE activity: `claude -p` alone BUFFERS (emits only the final result),
        // so a plain pipe shows nothing until the end — useless for observing progress. Use
        // `--output-format stream-json --verbose` so every tool-use/message is a JSON event the moment
        // it happens; parse each line into a concise `[sweep] <tool> <target>` note on the liveness
        // sidecar. acceptEdits is mandatory for `claude -p` under managed settings.
        //
        // STRUCTURALLY bound the sweep to a static retarget: disallow Bash so it CANNOT run tests,
        // migrations, servers, or background commands. The sweep's only job is to read the listed
        // prior-story test files and edit the stale assertions off the dropped symbol(s); verifying
        // those edits is the LANES' job (their scoped RED/GREEN + the story-close full run). Left
        // with Bash, the sweep turned a ~2-min edit pass into a ~12-min detour — it ran the migration
        // pytest, `sleep`-waited on it, and debugged failures the lanes re-verify anyway. A tool
        // restriction is a hard bound the agent cannot reinterpret, unlike a "do not run tests"
        // directive line. The prompt goes right after `-p` so the VARIADIC `--disallowedTools` (it
        // greedily consumes following args) does not swallow the directive as a tool name.
        const child = spawn(
          "claude",
          ["-p", directive, "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits", "--disallowedTools", "Bash"],
          { cwd: args.projectDir, stdio: ["ignore", "pipe", "pipe"], env: process.env },
        );
        let sbuf = "";
        child.stdout?.on("data", (d: Buffer) => {
          sbuf += d.toString();
          let nl: number;
          while ((nl = sbuf.indexOf("\n")) >= 0) {
            const line = sbuf.slice(0, nl); sbuf = sbuf.slice(nl + 1);
            if (!line.trim()) continue;
            try {
              const ev = JSON.parse(line) as { type?: string; subtype?: string; message?: { content?: Array<{ type?: string; name?: string; input?: unknown; text?: string }> }; result?: string };
              if (ev.type === "assistant" && ev.message?.content) {
                for (const c of ev.message.content) {
                  if (c.type === "tool_use") note(`  [sweep] ${c.name} ${JSON.stringify(c.input ?? {}).slice(0, 90)}`);
                  else if (c.type === "text" && c.text?.trim()) note(`  [sweep] ${c.text.trim().slice(0, 110)}`);
                }
              } else if (ev.type === "result") {
                note(`  [sweep] result(${ev.subtype ?? "ok"}): ${(ev.result ?? "").slice(0, 90)}`);
              }
            } catch {
              note(`  [sweep] ${line.slice(0, 110)}`);
            }
          }
        });
        const errOut = createWriteStream(liveLog, { flags: "a" });
        child.stderr?.pipe(errOut);
        child.on("error", reject);
        child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`supersession sweep exited ${code}`))));
      });
      ok = true;
      // COMMIT the retargets to the experiment branch. The fanned-out lanes COW the experiment
      // branch from its COMMITTED HEAD; left uncommitted, the sweep's retargets would NOT ride onto
      // the lane forks and every lane would re-hit the un-retargeted superseded tests (the sweep
      // would have been pointless). Commit so the lanes fork a genuinely superseded-clean base.
      try {
        execFileSync("git", ["add", "--", ...pureRemovable, ...mixed], { cwd: args.projectDir });
        execFileSync("git", ["commit", "-q", "-m", `supersession sweep: ${pureRemovable.length} retired + ${mixed.length} retargeted superseded test file(s) off ${cands.droppedSymbols.join(", ")}`], { cwd: args.projectDir });
        note(`  ${iso()} supersession sweep committed ${allFiles.length} superseded file(s) (${pureRemovable.length} retired, ${mixed.length} retargeted) to the experiment branch`);
      } catch (e) {
        note(`  ${iso()} supersession sweep commit skipped/failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      clearInterval(hb);
      note(`--- ${iso()} SUPERSESSION SWEEP ${ok ? "done" : "FAILED"}: ${allFiles.length} file(s) (${pureRemovable.length} retired, ${mixed.length} retargeted) in ${secs()}s`);
      try {
        mkdirSync(join(consortDir, "cycles", args.featureId, args.story), { recursive: true });
        writeFileSync(
          join(consortDir, "cycles", args.featureId, args.story, "superseded-sweep.json"),
          JSON.stringify({ at: iso(), droppedSymbols: cands.droppedSymbols, files: allFiles, pureRemoved: pureRemovable, mixedRetargeted: mixed, durationSec: secs(), ok }, null, 2),
          "utf8",
        );
      } catch { /* marker is best-effort */ }
    }
    return allFiles.length;
  };
}

/**
 * Run a contract story's build with per-AC lanes fanned out concurrently (P2),
 * fold the succeeded lane branches back (P3 merge), and re-run any conflicted or
 * failed AC SEQUENTIALLY on the merged base (the safety fallback). Sequential mode
 * (lever off / too few ACs) just drives every AC in order — no merge, byte-identical.
 * After this returns, the experiment branch carries ALL ACs' RED->GREEN work and
 * the normal serial drive resumes for story-close REVIEW/deploy/accept.
 */
export async function runParallelAcLanesLive(args: ParallelAcLanesLiveArgs): Promise<ParallelAcLanesLiveResult> {
  const plan = planAcLanes({
    acOrder: args.acOrder,
    enabled: args.enabled,
    migrationPrepStep: args.migrationPrepStep,
    splitAcsByKind: args.splitAcsByKind,
    acKinds: args.acKinds,
  });
  const driveScoped = args.driveScoped ?? defaultDriveScoped(args);
  const clearSupersession = args.clearSupersession ?? defaultClearSupersession(args);
  // POOL SIZING is the KIT's job, not the runner's: size the worker pool to the number of lanes the
  // plan produced, bounded by args.concurrency as a CEILING (host-contention safety). So all planned
  // lanes run concurrently up to the ceiling — the operator never has to hand-crank a cap to match the
  // lane count. (runExperimentsInParallel is a work-stealing pool: a freed worker pulls the next lane.)
  const laneConcurrency = Math.max(1, Math.min(plan.laneSpecs.length || 1, args.concurrency));
  // Fan-out observability: narrate the coordinator's OWN milestones (plan, fan-out start, merge,
  // fallback) into the main liveness sidecar alongside the per-lane streams from driveScoped.
  const mainLive = join(args.projectDir, ARTIFACT_ROOT, "agent-live.log");
  const coordNote = (m: string) => { try { appendFileSync(mainLive, `--- ${new Date().toISOString()} [fan-out] ${m}\n`); } catch { /* best effort */ } };
  coordNote(`plan: mode=${plan.mode} ${plan.migrationPrep ? `migrationPrep=${plan.migrationPrep}` : `serialFirst=${plan.serialFirst ?? "-"}`} lanes=[${plan.laneSpecs.map((s) => s.laneId).join(", ")}] pool=${laneConcurrency}/${plan.laneSpecs.length} (ceiling ${args.concurrency})`);

  // KIT owns the lane-worktree lifecycle: reap any ORPHAN ac-lane-* worktrees from a PRIOR run killed
  // mid-fan-out (withAcLane's teardown never ran, so their /tmp dirs still EXIST and `git worktree prune`
  // alone keeps them). The drive is serial across stories, so at a fan-out's START any ac-lane worktree
  // is an orphan — safe to force-remove. A bed/runner script should NOT be cleaning up the kit's worktrees.
  try {
    const wt = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: args.projectDir, encoding: "utf8" });
    for (const m of wt.matchAll(/^worktree (.*ac-lane-[^\n]*)$/gm)) {
      try { execFileSync("git", ["worktree", "remove", "--force", m[1]], { cwd: args.projectDir, stdio: "ignore" }); }
      catch { try { rmSync(m[1], { recursive: true, force: true }); } catch { /* */ } }
    }
    execFileSync("git", ["worktree", "prune"], { cwd: args.projectDir, stdio: "ignore" });
  } catch { coordNote("orphan-worktree reap skipped (best-effort)"); }

  const result = await runAcLanes({
    plan,
    concurrency: laneConcurrency,
    // Default plan: the serial-first AC builds fully in the MAIN worktree. It authors the migration and
    // DEFERS the cross-story supersession (deselect at runtime, no commit).
    driveSerial: (ac) => driveScoped({ ac, cwd: args.projectDir, lakebaseBranch: args.experimentBranch, deferSupersession: true, label: `serial:${ac}` }),
    // migrationPrep plan: author + commit ONLY the drop migration serially (no test build). Default to a
    // focused migration-author drive; AC1 then fans out as a verify-only lane with the rest.
    driveMigrationPrep: args.driveMigrationPrep ?? ((ac) => driveScoped({ ac, cwd: args.projectDir, lakebaseBranch: args.experimentBranch, deferSupersession: true, label: `migration-prep:${ac}`, kinds: ["__migration__"] })),
    // Each lane runs in its OWN isolated worktree (withAcLane keyed by laneId) + COW child. A split AC's
    // lane is scoped to its kind subset (spec.kinds). Lanes DEFER supersession (deselect at runtime), so
    // the superseded prior-story tests do not fail their migration-pass verify — the retarget runs post-merge.
    driveInLane: (spec) => {
      coordNote(`lane fan-out: ${spec.laneId}${spec.kinds ? ` (kinds: ${spec.kinds.join(",")})` : ""}`);
      return withAcLane(
        { projectDir: args.projectDir, instance: args.instance, laneId: spec.laneId, parentBranch: args.experimentBranch },
        (ctx) => driveScoped({ ac: spec.ac, cwd: ctx.cwd, lakebaseBranch: ctx.lakebaseBranch, deferSupersession: true, label: `lane:${spec.laneId}`, kinds: spec.kinds }),
      );
    },
    // FAN-OUT-BEGIN snapshot: tag the committed AC1+swept experiment HEAD + drop a marker, so a
    // later run can resume AT the fan-out (re-verify AC1 fast, re-run the no-op sweep, then fan out)
    // instead of re-authoring AC1's whole build. Best-effort: a snapshot failure never aborts the run.
    snapshotBeforeFanout: () => {
      try {
        execFileSync("git", ["tag", "-f", "consort-fanout-begin"], { cwd: args.projectDir });
        const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: args.projectDir, encoding: "utf8" }).trim();
        // Capture the GITIGNORED runtime too (cycles/ + turns/): the probe derives "AC1 built"
        // from the cycle records, which the git tag does NOT carry — without them a resume would
        // re-author AC1. Snapshot them beside the tag so a resume restores the full fan-out-begin
        // state (git HEAD + runtime), not just the tracked tree.
        const snapDir = join(args.projectDir, ARTIFACT_ROOT, "fanout-begin");
        try {
          rmSync(snapDir, { recursive: true, force: true });
          mkdirSync(snapDir, { recursive: true });
          for (const rel of ["cycles", "turns"]) {
            const src = join(args.projectDir, ARTIFACT_ROOT, rel);
            if (existsSync(src)) cpSync(src, join(snapDir, rel), { recursive: true });
          }
        } catch { /* runtime snapshot best-effort */ }
        writeFileSync(
          join(snapDir, "fanout-begin.json"),
          JSON.stringify({ at: new Date().toISOString(), story: args.story, experimentBranch: args.experimentBranch, lakebaseBranch: args.experimentBranch, gitHead: head, parallelLanes: plan.parallelLanes }, null, 2),
          "utf8",
        );
        coordNote(`fan-out-begin snapshot: tagged consort-fanout-begin @ ${head.slice(0, 9)} + runtime (cycles/turns) -> .consort/fanout-begin/ (resume point, no AC1 re-author)`);
      } catch (e) {
        coordNote(`fan-out-begin snapshot skipped: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  });

  // Sequential mode drove everything in the main worktree already — no merge.
  if (plan.mode === "sequential") {
    return { ...result, plan, sequentialFallback: [] };
  }

  // P3: fold the SUCCEEDED lane branches back onto the experiment branch. Keyed by laneId — a split
  // AC contributes TWO lane branches (ac-lane-<ac>-e2e, ac-lane-<ac>-unit), both of which fold back.
  const specByLaneId = new Map(plan.laneSpecs.map((s) => [s.laneId, s]));
  const fannedLaneIds = new Set(plan.laneSpecs.map((s) => s.laneId));
  const succeededLanes = result.outcomes
    .filter((o) => o.status === "succeeded" && fannedLaneIds.has(o.laneId))
    .map((o) => ({ ac: o.laneId, gitBranch: acLaneBranchNames(o.laneId).gitBranch })); // ac=laneId: the merge label + branch token
  const merge = mergeAcLanes({ projectDir: args.projectDir, lanes: succeededLanes });
  coordNote(`merge: merged=[${merge.merged.join(", ")}] conflicted=[${merge.conflicted.map((c) => c.ac).join(", ")}]`);

  // Fallback: a conflicted merge OR a failed lane re-runs SEQUENTIALLY in the main worktree, on the
  // now-merged base, so it is driven against the real combined state. Keyed by laneId; a split lane
  // re-runs with its kind scope so the fallback drives the same slice.
  const failedLaneIds = result.outcomes
    .filter((o) => o.status === "failed" && fannedLaneIds.has(o.laneId))
    .map((o) => o.laneId);
  const sequentialFallback = [...merge.conflicted.map((c) => c.ac), ...failedLaneIds];
  if (sequentialFallback.length > 0) coordNote(`sequential fallback (conflict/fail): [${sequentialFallback.join(", ")}]`);
  for (const laneId of sequentialFallback) {
    const spec = specByLaneId.get(laneId);
    await driveScoped({ ac: spec?.ac ?? laneId, cwd: args.projectDir, lakebaseBranch: args.experimentBranch, deferSupersession: true, label: `fallback:${laneId}`, kinds: spec?.kinds });
  }

  // S2: the one-shot supersession RETARGET runs HERE — POST-MERGE, off the fan-out critical path — on
  // the fully-merged base (incl. any sequential fallback). The lanes DEFERRED supersession at build
  // time; this permanently retargets/retires the superseded prior-story tests before story-close's
  // full-suite deploy-verify runs. Moving it off the pre-fan-out gate removes a 13-16min serial stall.
  let supersededCleared = 0;
  try {
    supersededCleared = await clearSupersession();
  } catch (e) {
    coordNote(`supersession retarget (post-merge) failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  coordNote(`fan-out complete: ${result.outcomes.filter((o) => o.status === "succeeded").length}/${result.outcomes.length} ACs succeeded, peak concurrency ${result.peakInFlight}`);

  return { ...result, plan, merge, sequentialFallback, supersededCleared };
}
