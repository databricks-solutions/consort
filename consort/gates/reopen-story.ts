// Reopen a story for genuine RE-DESIGN (hardening #4, recovery). The kit had no clean way
// to send a story back to the design lane: withdraw-gate reverts the gate + drops the story
// from the build queue, and revise resets build state, but BOTH leave the story's design
// artifacts (ACs, test-list, reflect-verdict) on disk – so the drive sees the story as
// already-designed (hasAcs=true) and merely wants to RE-APPROVE the same, still-conflicting
// spec. To make the roles genuinely re-author, those artifacts must be cleared. This does
// that, with a backup (the .consort artifacts are untracked, so a copy is the only safety
// net) – the primitive the stockflow recovery had to improvise by hand.
//
// hasAcs = storyAcIds().length > 0, and storyAcIds reads BOTH story.json.acs[] AND the acs/
// dir, so clearing the dir alone can leave hasAcs=true; we also empty story.json.acs[]. The
// story shell (id/title/asA/iWantTo/soThat) is preserved so the story still exists – only
// its design output is reverted. Filesystem-only + deterministic (injectable clock) => the
// gate/experiment teardown stay their own existing primitives (withdraw-gate, discard).

import * as fs from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  acsDir,
  storyTestListJson,
  reflectVerdictJson,
  storyPlanJson,
  storyJson,
  storyResolved,
  featureDeployEvidenceJson,
  workflowStateJson,
  architectureJson,
  architectureMd,
  dbDesignJson,
  dbDesignMd,
  designGuideJson,
  designDir,
  cyclesRootDir,
} from "../config/consort-paths.js";
import { readPipeline, writePipeline } from "../pipeline/story-pipeline.js";
import { PHASE_OWNER_KEY } from "./workflow-phase.js";

export interface ReopenResult {
  /** Where the cleared artifacts were copied before removal. */
  backupDir: string;
  /** The story-relative paths that were cleared/reverted. */
  cleared: string[];
}

/** Back up + clear a story's design artifacts so the drive re-dispatches the Spec Author
 *  (hasAcs=false) instead of re-approving a stale spec. Never throws on a missing artifact
 *  (each is optional); returns what it did. */
export function reopenStoryForRedesign(
  consortDir: string,
  feature: string,
  story: string,
  opts: { now?: () => Date } = {},
): ReopenResult {
  const now = opts.now ?? (() => new Date());
  const storyRoot = storyResolved(consortDir, feature, story);
  const stamp = now().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(consortDir, `.backup-${basename(storyRoot)}-redesign-${stamp}`);
  const cleared: string[] = [];

  const rel = (p: string): string => p.slice(storyRoot.length).replace(/^[/\\]/, "") || basename(p);
  const backup = (p: string): void => {
    const dest = join(backupDir, rel(p));
    fs.mkdirSync(dirname(dest), { recursive: true });
    fs.cpSync(p, dest, { recursive: true });
  };

  // 1. Remove the design artifacts (backed up) so the story reverts to "needs design".
  for (const p of [
    acsDir(consortDir, feature, story),
    storyTestListJson(consortDir, feature, story),
    reflectVerdictJson(consortDir, feature, story),
    storyPlanJson(consortDir, feature, story),
  ]) {
    if (!fs.existsSync(p)) continue;
    backup(p);
    fs.rmSync(p, { recursive: true, force: true });
    cleared.push(rel(p));
  }

  // 2. hasAcs also counts story.json.acs[]; empty it (backed up), preserving every other
  //    field, so hasAcs is DEFINITIVELY false and the drive re-dispatches the Spec Author.
  const sj = storyJson(consortDir, feature, story);
  if (fs.existsSync(sj)) {
    try {
      const obj = JSON.parse(fs.readFileSync(sj, "utf8")) as Record<string, unknown>;
      if (Array.isArray(obj.acs) && obj.acs.length > 0) {
        backup(sj);
        fs.writeFileSync(sj, JSON.stringify({ ...obj, acs: [] }, null, 2) + "\n");
        cleared.push(rel(sj) + " (acs[] emptied)");
      }
    } catch {
      /* leave a malformed story.json untouched */
    }
  }

  // Drop the FEATURE deploy gate, reset the pipeline entry -> designing (spec gate + experiment +
  // acceptance), and clear the coarse phase, so the drive re-enters the design lane. Shared with
  // reopenStoryFromRole (the scoped reopen) so both revisions re-gate cleanly.
  resetBuildStateForReopen(consortDir, feature, story, backupDir, cleared);

  return { backupDir, cleared };
}

/** Drop the feature deploy gate + reset the story's pipeline entry to `designing` (clearing the
 *  spec gate, experiment record, and acceptance) + clear the coarse phase, backing each up. Shared
 *  by the full reopen (`reopenStoryForRedesign`) and the scoped `reopenStoryFromRole`: a design
 *  revision of ANY scope invalidates the spec gate + the build, so the gate must be re-surfaced +
 *  re-approved (fresh integrity) and the experiment rebuilt, not left approved over changed design. */
function resetBuildStateForReopen(
  consortDir: string,
  feature: string,
  story: string,
  backupDir: string,
  cleared: string[],
): void {
  // The FEATURE-level deploy gate. Reopening ANY story makes the feature no-longer-complete, so its
  // `deploy-evidence.json` is STALE – yet the deploy gate is derived from it and would stay OPEN over
  // a mid-redesign story. Back it up + clear it (feature-level, so an explicit backup name).
  const fde = featureDeployEvidenceJson(consortDir, feature);
  if (fs.existsSync(fde)) {
    const dest = join(backupDir, "feature-deploy-evidence.json");
    fs.mkdirSync(dirname(dest), { recursive: true });
    fs.cpSync(fde, dest);
    fs.rmSync(fde, { force: true });
    cleared.push("../deploy-evidence.json (feature deploy gate)");
  }

  // Reset the PIPELINE entry so the derivation re-enters the DESIGN lane for this story. The feature
  // phase is derived from each entry's status + acceptance, so a still-`accepted` entry keeps the
  // feature reading complete and routes to DEPLOY. Clear the entry to a bare `designing` – dropping
  // the spec gate, experiment, AND acceptance in one write – and pull it off the build lane. Idempotent.
  try {
    const pipeline = readPipeline(consortDir, feature);
    if (pipeline.stories[story]) {
      pipeline.stories[story] = { status: "designing" };
      pipeline.build_queue = pipeline.build_queue.filter((s) => s !== story);
      if (pipeline.build_active === story) pipeline.build_active = null;
      writePipeline(consortDir, pipeline);
      cleared.push("pipeline entry -> designing (spec gate + experiment + acceptance cleared)");
    }
  } catch {
    /* no/ malformed pipeline: the artifact clear above already reverts the design output */
  }

  // Reset the COARSE driver phase (workflow-state.json) so the probe RE-DERIVES the true phase from
  // this feature's now-reset artifacts (the un-owned re-derive path). It is a STORED slot, not
  // derived, so the pipeline reset above does not move it. Backed up.
  try {
    const wsFile = workflowStateJson(consortDir);
    if (fs.existsSync(wsFile)) {
      const ws = JSON.parse(fs.readFileSync(wsFile, "utf8")) as Record<string, unknown>;
      if (ws.phase !== undefined || ws[PHASE_OWNER_KEY] !== undefined) {
        const dest = join(backupDir, "workflow-state.json");
        fs.mkdirSync(dirname(dest), { recursive: true });
        fs.cpSync(wsFile, dest);
        delete ws.phase;
        delete ws[PHASE_OWNER_KEY];
        fs.writeFileSync(wsFile, JSON.stringify(ws, null, 2) + "\n");
        cleared.push("coarse phase cleared (drive re-derives design/build from artifacts)");
      }
    }
  } catch {
    /* best-effort: the derivation still re-reads the reset pipeline + deploy-evidence */
  }

  // Clear this story's per-cycle GREEN-FAILURE markers. A reopen re-authors the
  // build, so any `green-failure.json` from the old build (a driver-fixable
  // regression, OR — the loop this closes — a `specDefect` marker for a test-
  // authoring smell) is ORPHANED: `consort-resolve-escalation --list` reads only
  // escalation records + blocking smells, so it reports "none pending", yet
  // `consort-next`/the drive still derive BLOCKED from the surviving marker and a
  // resume re-raises it. Removing the markers (backed up) with the design artifacts
  // keeps the three state views coherent, so the reopen deterministically unblocks.
  try {
    const storyCyclesDir = join(cyclesRootDir(consortDir), feature, story);
    if (fs.existsSync(storyCyclesDir)) {
      for (const acEntry of fs.readdirSync(storyCyclesDir)) {
        const gf = join(storyCyclesDir, acEntry, "green-failure.json");
        if (!fs.existsSync(gf)) continue;
        const dest = join(backupDir, "cycles", acEntry, "green-failure.json");
        fs.mkdirSync(dirname(dest), { recursive: true });
        fs.cpSync(gf, dest);
        fs.rmSync(gf, { force: true });
        cleared.push(`cycles/${acEntry}/green-failure.json (orphaned build marker)`);
      }
    }
  } catch {
    /* best-effort: an unremovable marker does not block the design-artifact reset */
  }
}

/** The design lane in EXECUTION order. Reopening `--from` a role reverts that role's output + every
 *  later role's, keeps the upstream design, and the drive's design derivation (nextDesignAction)
 *  then re-derives the resume point from artifact PRESENCE (testListReady <- storyTestListJson,
 *  reflectionPassed <- reflect-verdict, dbaDesigned <- db-design.json, architectAnnotated <-
 *  architecture.json + per-AC notes, ...), so it resumes AT that role, re-runs the tail, re-surfaces
 *  the spec gate, and rebuilds. `spec-author` is the full reopen (reopenStoryForRedesign). */
export type DesignLaneRole = "spec-author" | "ux-designer" | "architect-reviewer" | "dba" | "test-strategist" | "navigator";
export const DESIGN_LANE_ORDER: DesignLaneRole[] = [
  "spec-author",
  "ux-designer",
  "architect-reviewer",
  "dba",
  "test-strategist",
  "navigator",
];

/** Reopen a story to a SPECIFIC design role — the proportionate alternative to the full
 *  reopenStoryForRedesign. Reverts `fromRole`'s output + everything downstream (keeping the upstream
 *  design), then resets the build state (deploy gate + pipeline -> designing + coarse phase) so the
 *  drive re-derives the resume point at `fromRole`, re-runs the design tail, and re-gates cleanly.
 *  `test-strategist` / `navigator` are STORY-local (only that story is affected); the feature-level
 *  roles (`architect-reviewer` / `dba` / `ux-designer`) revert feature-shared artifacts, so a
 *  sibling story not yet gated re-derives too — the CLI surfaces that. `spec-author` == full reopen. */
export function reopenStoryFromRole(
  consortDir: string,
  feature: string,
  story: string,
  fromRole: DesignLaneRole,
  opts: { now?: () => Date } = {},
): ReopenResult {
  if (fromRole === "spec-author") return reopenStoryForRedesign(consortDir, feature, story, opts);

  const now = opts.now ?? (() => new Date());
  const storyRoot = storyResolved(consortDir, feature, story);
  const stamp = now().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(consortDir, `.backup-${basename(storyRoot)}-reopen-${fromRole}-${stamp}`);
  const cleared: string[] = [];

  const backupTo = (p: string, name: string): void => {
    const dest = join(backupDir, name);
    fs.mkdirSync(dirname(dest), { recursive: true });
    fs.cpSync(p, dest, { recursive: true });
  };
  const clearFile = (p: string, label: string, backupName: string): void => {
    if (!fs.existsSync(p)) return;
    backupTo(p, backupName);
    fs.rmSync(p, { recursive: true, force: true });
    cleared.push(label);
  };

  // The artifacts each role produces, whose ABSENCE re-triggers that role in nextDesignAction.
  // Clearing from `fromRole` onward makes the drive resume at `fromRole`. storyPlanJson (the design-
  // spec analyzer's terminal output) is downstream of every role, so any reopen clears it.
  const clearForRole: Record<Exclude<DesignLaneRole, "spec-author">, () => void> = {
    "ux-designer": () => {
      clearFile(designGuideJson(consortDir), "design/design-guide.json (UX)", "design-guide.json");
      clearFile(join(designDir(consortDir), "design-guide.md"), "design/design-guide.md (UX)", "design-guide.md");
      clearFile(join(designDir(consortDir), "ia.md"), "design/ia.md (UX)", "ia.md");
    },
    "architect-reviewer": () => {
      clearFile(architectureJson(consortDir, feature), "architecture.json (feature)", "architecture.json");
      clearFile(architectureMd(consortDir, feature), "architecture.md (feature)", "architecture.md");
      // architectAnnotated also keys on per-AC architectural_notes; strip them so the architect
      // re-annotates from scratch (the ACs themselves — the spec-author's work — are kept).
      stripArchitecturalNotes(consortDir, feature, story, backupDir, cleared);
    },
    "dba": () => {
      clearFile(dbDesignJson(consortDir, feature), "db-design.json (feature)", "db-design.json");
      clearFile(dbDesignMd(consortDir, feature), "db-design.md (feature)", "db-design.md");
    },
    "test-strategist": () => {
      clearFile(storyTestListJson(consortDir, feature, story), "test-list-per-story.json (test-strategist)", "test-list-per-story.json");
    },
    "navigator": () => {
      clearFile(reflectVerdictJson(consortDir, feature, story), "reflect-verdict.json (reflect)", "reflect-verdict.json");
    },
  };

  const startIdx = DESIGN_LANE_ORDER.indexOf(fromRole);
  for (const role of DESIGN_LANE_ORDER.slice(startIdx)) {
    if (role === "spec-author") continue; // unreachable (handled above), keeps the type total
    clearForRole[role]();
  }
  // The design-spec plan is terminal (downstream of the whole lane) — stale after any revision.
  clearFile(storyPlanJson(consortDir, feature, story), "plan.json (design-spec)", "plan.json");

  resetBuildStateForReopen(consortDir, feature, story, backupDir, cleared);
  return { backupDir, cleared };
}

/** Strip the `architectural_notes` field from every AC of a story (backed up), so architectAnnotated
 *  flips false and the Architect re-annotates. Keeps the ACs (the Spec Author's work) intact. */
function stripArchitecturalNotes(
  consortDir: string,
  feature: string,
  story: string,
  backupDir: string,
  cleared: string[],
): void {
  const dir = acsDir(consortDir, feature, story);
  if (!fs.existsSync(dir)) return;
  let stripped = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const p = join(dir, name);
    try {
      const ac = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
      if (!("architectural_notes" in ac)) continue;
      fs.mkdirSync(join(backupDir, "acs"), { recursive: true });
      fs.cpSync(p, join(backupDir, "acs", name));
      delete ac.architectural_notes;
      fs.writeFileSync(p, JSON.stringify(ac, null, 2) + "\n");
      stripped++;
    } catch {
      /* leave a malformed ac.json untouched */
    }
  }
  if (stripped > 0) cleared.push(`acs/*.json architectural_notes stripped (${stripped}) — architect re-annotates`);
}
