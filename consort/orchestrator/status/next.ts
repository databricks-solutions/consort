// consort-next: the authoritative, strictly READ-ONLY "what next" surface
// (FEIP-8017).
//
// The deterministic drive knows exactly where the workflow is and what it would
// do next, but only WHILE it runs. Every time it stops (a HITL gate, a raised
// escalation, feature-complete, a transient error, a killed run) an orchestrating
// agent otherwise has to reverse-engineer the next move from source and drifts
// into freeform (improvised CLIs, manual git, manual state edits). This module
// answers, from the SAME engine the drive uses (nextTransition over the derived
// DriveState), four questions with no model in the loop:
//   - where am I?            -> the reconciled state (coarse + derived phase,
//                               per-story statuses, open gates, blockers)
//   - what can I do next?    -> the decision MENU (not just the one next action):
//                               at a gate, the real HIL choices, each with its
//                               correct enact CLI + a hil_prompt to pose
//   - how do I enact each?   -> the exact { bin, args } per option
//   - how do I frame it?     -> hil_prompt per option
//
// It is PURE over an injected DriveState + context: no I/O, no model spawn, no
// writes to workflow artifacts. The CLI (next.cli.ts) reads the state from disk
// and the drive (drive.cli.ts) auto-emits this snapshot to .consort/next.json on
// every stop, so the agent's contract is simply: on any stop, read next.json,
// present its options to the human, enact the chosen one.

import * as fs from "node:fs";
import * as path from "node:path";
import type { DriveState, WorkflowAction } from "../../../consort/orchestrator/drive/orchestrator-drive.js";
import { nextTransition } from "../../../consort/orchestrator/drive/orchestrator-drive.js";
import { describeAction, gateEnactCommand, type EnactCommand } from "../../../consort/logging/orchestrator-logging.js";
import { deriveFeaturePhase, summarizeStories, type StoryStatusEntry } from "./feature-status.js";
import { findFeatureDir } from "../../../consort/config/consort-paths.js";
import { readDeployEvidence, deployEvidencePasses } from "../../../consort/deploy/deploy.js";
import { readDriveStateFromDisk } from "../../../consort/orchestrator/drive/orchestrator-effects.js";

/** One choice on the decision menu the human (or the agent, on their behalf)
 *  picks between at a stop. `enact` is the exact command that carries it out;
 *  null for a manual/no-command choice (hold, or a step with no dedicated CLI). */
export interface NextOption {
  /** Stable dotted id, e.g. "acceptance.accept" / "spec.approve" / "resume". */
  id: string;
  /** Short human label for the choice. */
  title: string;
  /** The question to pose to the human, so the agent proposes rather than guesses. */
  hil_prompt: string;
  /** action = runs substrate that advances the workflow; gate = a HITL approval;
   *  noop = hold/checkpoint (no command); manual = needs human work, no single CLI. */
  kind: "action" | "gate" | "noop" | "manual";
  /** The exact command to enact this option, or null (noop/manual). */
  enact: EnactCommand | null;
  /** True when enacting reaches outside the local project (opens a PR, merges,
   *  deletes a branch): the agent should confirm with the human before enacting. */
  outward_facing?: boolean;
  /** Extra guidance for a manual choice (no dedicated CLI). */
  note?: string;
}

/** A thing blocking forward progress: an unresolved escalation, with the exact
 *  resolver command when one is known (else a hint). */
export interface NextBlocker {
  source: string;
  reason: string;
  story?: string;
  /** The command that clears this blocker, when deterministic; else null. */
  resolver: EnactCommand | null;
  /** Free-text guidance when there is no single resolver command. */
  resolver_hint?: string;
}

/** The reconciled state summary: the truth the engine acts on, not the stale
 *  coarse workflow phase. */
export interface NextState {
  /** The driver's coarse phase (planning | feature | deploy | promote | done). */
  coarse_phase: string;
  /** The feature phase DERIVED from the per-story pipeline (complete | build |
   *  design), or null when no stories are tracked / sprint scope (FEIP-8016). */
  derived_phase: string | null;
  /** Per-story statuses (story id -> status), feature scope only. */
  stories: Record<string, string>;
  /** The HITL gates currently open (awaiting a human decision). */
  open_gates: string[];
  /** What is blocking progress right now (empty when nothing is). */
  blockers: NextBlocker[];
}

export interface NextSnapshot {
  scope: "feature" | "sprint";
  feature?: string;
  sprint?: string;
  state: NextState;
  /** The single next action the deterministic engine would take (nextTransition),
   *  as a stable kind + a one-line human description. The options[] below expand
   *  this into the full decision menu. */
  primary_action: { kind: string; describe: string };
  /** The decision menu: every valid next choice, each with its enact command +
   *  hil_prompt. Always includes a "hold" checkpoint option. */
  options: NextOption[];
  /** TRUE when the next move requires a HUMAN decision – a gate (intake / backlog / plan /
   *  spec / deploy / promote), or a per-story accept/discard/revise – i.e. NO autonomous
   *  `resume` option is offered. This is the SOLE signal a session / watcher / the extension
   *  should gate on: `false` ⇒ resume the drive; `true` ⇒ surface the decision to the human at
   *  once. The backlog SELECTION is now its own `approve-backlog-gate` (a HITL gate carried in
   *  open_gates), so this catches it directly; the metered `author-requests` turn that follows is
   *  an ordinary agent turn the drive RESUMES (not a human decision). */
  awaiting_human: boolean;
  /** A plain-language summary of where things stand + what the human is being
   *  asked, for the agent to relay verbatim (truthful phase-complete messaging). */
  summary: string;
  /** The kit version this playbook was computed against. */
  authoritative_playbook_version: string;
  generated_at: string;
}

export interface NextContext {
  featureId?: string;
  sprint?: string;
  /** Approver to fill into gate enact commands (default `<you>` placeholder). */
  approver?: string;
  /** The feature's canonical branch, the promote gate's required `--promote-ref`
   *  (FEIP-8019). Falls back to the feature id when unknown. */
  featureBranch?: string;
  /** Kit version string for authoritative_playbook_version. */
  version?: string;
  /** ISO timestamp for generated_at (injectable for deterministic tests). */
  now?: string;
  /** Per-story derived rows (feature scope), for the reconciled state + phase.
   *  Reuses feature-status' summarizeStories so `next` and `feature-status` agree. */
  stories?: StoryStatusEntry[];
  /** Per-story acceptance-review hints keyed by story_id: API-only (no UI tests) + the live
   *  Swagger/OpenAPI docs URL to offer at the acceptance gate. Computed in the disk layer
   *  (buildStoryReview) so buildNextSnapshot stays pure. */
  storyReview?: Record<string, StoryReview>;
}

/** Acceptance-review hint for one story. `apiOnly` = its per-story test list is backend-only
 *  (no client/e2e UI tests). `docsUrl` = the deployed server's live Swagger UI, present only when
 *  the story's deploy verified reachable. */
export interface StoryReview {
  apiOnly: boolean;
  docsUrl?: string;
}

/** The universal "resume the drive to the next stop" enact for a scope. */
function resumeCommand(ctx: NextContext): EnactCommand {
  return ctx.sprint && !ctx.featureId
    ? { bin: "consort-drive", args: ["--sprint", ctx.sprint] }
    : { bin: "consort-drive", args: ["--feature", ctx.featureId ?? "<feature-id>"] };
}

/** The always-present "stop here / checkpoint" option. */
function holdOption(): NextOption {
  return {
    id: "hold",
    title: "Stop here (checkpoint)",
    hil_prompt: "Checkpoint and resume later?",
    kind: "noop",
    enact: null,
  };
}

/** The single feature/story a gate action targets, if any. */
function storyOf(action: WorkflowAction): string | undefined {
  return "story" in action ? (action as { story?: string }).story : undefined;
}

/**
 * Expand the engine's single next action into the full decision menu. The menu
 * is genuinely > 1 choice at the acceptance gate (accept / discard / revise are
 * three distinct, real pipeline CLIs the human chooses between); at the other
 * approval gates it is approve-or-hold; for a non-gate step it is resume-or-hold.
 * Every option carries its EXACT enact command (from the one gateEnactCommand
 * mapping, so it can never drift from the drive) + a hil_prompt.
 */
export function buildNextOptions(action: WorkflowAction, ctx: NextContext): NextOption[] {
  const f = ctx.featureId ?? "<feature-id>";
  const you = ctx.approver ?? "<you>";
  const gateEnact = gateEnactCommand(action, {
    featureId: ctx.featureId,
    sprint: ctx.sprint,
    approver: ctx.approver,
    featureBranch: ctx.featureBranch,
  });

  switch (action.kind) {
    case "accept": {
      // The richest, highest-stakes menu: the PO's acceptance decision. accept
      // LANDS the story (git-merge experiment -> feature + migrate + teardown);
      // discard drops it out of the sprint; revise sends it back to designing.
      const story = storyOf(action) ?? "<story>";
      // API-only stories get a Swagger/OpenAPI UI as the acceptance-review surface (every scaffold
      // backend serves one: FastAPI + the Express scaffold at `/docs`). ALWAYS offer it for such a
      // story instead of hand-rolled curl, so the PO can review and exercise the API against its ACs.
      const review = ctx.storyReview?.[story];
      const swaggerOffer = review?.apiOnly
        ? ` This is an API-ONLY story, so ALWAYS offer its Swagger / OpenAPI UI as the review surface: ${review.docsUrl ? `open ${review.docsUrl} (the deployed server serves it live)` : "start the app (`./scripts/run-dev.sh`) and open `<base_url>/docs`"} to review and exercise every endpoint against this story's ACs, rather than hand-rolled curl.`
        : "";
      const swaggerNote = review?.apiOnly
        ? ` API-only story: ALWAYS offer the Swagger UI (${review.docsUrl ?? "`<base_url>/docs` on the running server"}) as the acceptance surface.`
        : "";
      return [
        {
          id: "acceptance.accept",
          title: `Accept story ${story}`,
          hil_prompt: `Accept story ${story}? I will merge its experiment into the feature branch, run its migrations, and tear the experiment down. First OFFER the human to SEE it working: the story's experiment branch is checked out + deployed, so \`./scripts/run-dev.sh\` serves the real app on its paired Lakebase branch – for a UI product point them at the client URL to click through this story; for a backend/service, give them the endpoint(s) + a curl/Postman example that exercises this story's ACs.${swaggerOffer} Only then take the accept/discard/revise decision.`,
          kind: "gate",
          enact: gateEnact, // consort-pipeline accept ... (owns the merge)
          note: `Before deciding, offer a working-software review – run \`./scripts/run-dev.sh\` (serves the checked-out experiment branch against its Lakebase branch) and hand the human the client URL (UI) or the API endpoint + a curl/Postman example for this story's ACs; stop the server when they're done. Also offer to GENERATE SEED DATA so it isn't an empty app: run-dev.sh auto-runs \`scripts/seed_dev.py\` on start (SEED=0 skips; idempotent); if none exists, generate one that inserts representative rows for this story's tables.${swaggerNote}`,
        },
        {
          id: "acceptance.discard",
          title: `Discard story ${story}`,
          hil_prompt: `Discard story ${story}? Its experiment is torn down and it leaves the sprint; its code is NOT merged.`,
          kind: "action",
          enact: { bin: "consort-pipeline", args: ["discard", "--feature", f, "--story", story, "--approver", you, "--reason", "<reason>"] },
        },
        {
          id: "acceptance.revise",
          title: `Revise story ${story}`,
          hil_prompt: `Send story ${story} back to designing? Its experiment is torn down and it re-enters the design lane; its code is NOT merged.`,
          kind: "action",
          enact: { bin: "consort-pipeline", args: ["revise", "--feature", f, "--story", story, "--approver", you, "--reason", "<reason>"] },
        },
        holdOption(),
      ];
    }
    case "approve-intake-gate":
      return [
        {
          id: "intake.approve",
          title: "Approve the project intake",
          hil_prompt:
            "The Product Owner drafted product-overview.md / nfrs.md" +
            " / design-brief.md from your answers. REVIEW them (open + read), EDIT anything that's off, " +
            "or ask for changes (edit .consort/intake/answers.md and re-run to redraft). Approve to hand " +
            "the intake to the Spec Author, who proposes the sprint from it?",
          kind: "gate",
          enact: gateEnact,
          note: "To request changes instead of approving: edit the drafted docs directly, or edit " +
            ".consort/intake/answers.md and resume so the PO redrafts. Approve only once they reflect your intent.",
        },
        holdOption(),
      ];
    case "approve-backlog-gate":
      // The BACKLOG gate: the human picks WHICH proposed features enter the sprint and commits
      // them. Committing writes requested.json (the selection membership), which flips
      // backlogCommitted so the drive advances to the metered author-requests turn. Surfaced as a
      // human decision with the exact command, so a session reads it off consort-next (the
      // authoritative surface) instead of grepping the kit to rediscover how the backlog is recorded.
      return [
        {
          id: "backlog.commit",
          title: "Commit the sprint backlog",
          hil_prompt:
            "Which proposed features are in this sprint? Commit them (by folder id) to lock the backlog; " +
            "the drive then dispatches the Product Owner to author each request and advances to the plan gate.",
          kind: "gate",
          enact: { bin: "consort-sync-backlog", args: ["--sprint", ctx.sprint ?? "<sprint>", "--features", "<id[,id...]>"] },
          note:
            "Pick the features from .consort/planning/feature-proposals.md and pass their FOLDER ids " +
            "(e.g. F1-stock-visibility,F2-stock-adjustment) – NOT the proposal's `## F1` heading labels. " +
            "A pure UI/shell story is not a feature; commit only the features this sprint delivers.",
        },
        holdOption(),
      ];
    case "approve-plan-gate":
      return [
        {
          id: "plan.approve",
          title: "Approve the sprint plan",
          hil_prompt: "Approve the sprint plan and lock the backlog so execution can begin?",
          kind: "gate",
          enact: gateEnact,
        },
        holdOption(),
      ];
    case "approve-gate": // per-story spec gate
      return [
        {
          id: "spec.approve",
          title: `Approve story ${storyOf(action) ?? "<story>"}'s spec`,
          hil_prompt: `Approve story ${storyOf(action) ?? "<story>"}'s spec so its build can start? (To send it back, edit the spec and re-run the design lane.)`,
          kind: "gate",
          enact: gateEnact,
        },
        holdOption(),
      ];
    case "approve-deploy-gate":
      return [
        {
          id: "deploy.approve",
          title: "Approve the deploy gate",
          hil_prompt: "The feature deployed + verified locally. Approve the deploy gate to enter promotion?",
          kind: "gate",
          enact: gateEnact,
        },
        holdOption(),
      ];
    case "approve-promote-gate":
      return [
        {
          id: "promote.approve",
          title: "Approve the promote gate",
          hil_prompt: "CI is green on the promotion PR. Approve it so the feature can merge up to the parent tier?",
          kind: "gate",
          enact: gateEnact,
          outward_facing: true,
        },
        holdOption(),
      ];
    case "raise-to-hil":
      // A blocker pre-empted everything. The blocker (+ its resolver) is surfaced
      // in state.blockers; the only forward option is to resolve it, then resume.
      return [
        {
          id: "resume",
          title: "Resume the drive (after resolving the blocker below)",
          hil_prompt: "Once the blocker under `blockers` is resolved, resume the drive?",
          kind: "action",
          enact: resumeCommand(ctx),
          note: "Clear the escalation (and any blocking smell) named in blockers first; the drive will re-derive and retry.",
        },
        holdOption(),
      ];
    case "prepare-pr":
    case "wait-ci":
    case "merge":
      // Promote-phase substrate steps: resuming the drive performs the SCM ladder
      // step. merge/prepare-pr reach GitHub, so flag them outward-facing.
      return [
        {
          id: "resume",
          title: "Resume the drive (promotion)",
          hil_prompt: `Continue promotion (${describeAction(action, { featureId: ctx.featureId })})?`,
          kind: "action",
          enact: resumeCommand(ctx),
          outward_facing: true,
        },
        holdOption(),
      ];
    case "done":
      return [
        {
          id: "done",
          title: "Nothing to do (workflow complete)",
          hil_prompt: "This feature is fully shipped. Start a new feature or sprint?",
          kind: "noop",
          enact: null,
        },
      ];
    case "feature-complete":
      return [
        {
          id: "resume",
          title: "Deploy the feature",
          hil_prompt: "Every story is built + accepted. Deploy the feature (local working-software check) and enter promotion?",
          kind: "action",
          enact: resumeCommand(ctx),
        },
        holdOption(),
      ];
    default:
      // Any other step (design/build role turns, dispatch, cut-experiment, deploy):
      // resuming the drive carries it out. One resume option + hold.
      return [
        {
          id: "resume",
          title: "Resume the drive",
          hil_prompt: `Resume the drive to carry out: ${describeAction(action, { featureId: ctx.featureId })}?`,
          kind: "action",
          enact: resumeCommand(ctx),
        },
        holdOption(),
      ];
  }
}

/** The open HITL gates implied by the engine's next action (the one gate the
 *  drive would stop at). Empty for a non-gate action. */
function openGatesOf(action: WorkflowAction): string[] {
  switch (action.kind) {
    case "approve-backlog-gate":
      return ["backlog"];
    case "approve-plan-gate":
      return ["plan"];
    case "approve-gate":
      return ["spec"];
    case "accept":
      return ["acceptance"];
    case "approve-deploy-gate":
      return ["deploy"];
    case "approve-promote-gate":
      return ["promote"];
    default:
      return [];
  }
}

/** The blocker(s) implied by an escalation pre-empt. Kept honest: a generic
 *  escalation has no single deterministic resolver, so we surface the detail +
 *  a resume-after-you-resolve hint rather than fabricating a fix command. */
function blockersOf(state: DriveState): NextBlocker[] {
  if (!state.escalation) return [];
  const e = state.escalation;
  return [
    {
      source: e.source,
      reason: e.reason,
      ...(e.story_id ? { story: e.story_id } : {}),
      // The deterministic clear is the resolve verb – NOT hand-editing state. `consort-resolve-escalation`
      // clears BOTH the escalation file AND any blocking smell in one shot and KEEPS the audit trail. Emitting
      // the exact command here (and NOT telling the operator to rm/edit the files) is what stops a session
      // improvising a hand-edit of .consort/escalations/ or smells.json to move the run forward.
      resolver: { bin: "consort-resolve-escalation", args: ["--id", e.id, "--resolution", "<what you fixed>"] },
      resolver_hint:
        `Fix the root cause, then run: consort-resolve-escalation --id ${e.id} --resolution "<what you fixed>" ` +
        `(clears this escalation AND any blocking smell, keeps the audit trail), then resume the drive. ` +
        `Do NOT hand-edit or delete the escalation file or smells.json to move forward – that desyncs on-disk state.`,
    },
  ];
}

/** A one-line, TRUTHFUL summary of where things stand (subsumes the misleading
 *  "deploy complete in 0 actions": a done feature reads as shipped, not a no-op). */
function summarize(scope: "feature" | "sprint", action: WorkflowAction, state: NextState, ctx: NextContext): string {
  const who = scope === "sprint" ? `sprint ${ctx.sprint}` : `feature ${ctx.featureId}`;
  if (action.kind === "done") {
    return `${who} is complete: every story was built, accepted, and deployed per story, and the feature is merged. Nothing left to do.`;
  }
  if (action.kind === "feature-complete") {
    return `${who}: every story is built + accepted. Next step is to deploy the feature (local working-software check) and enter promotion.`;
  }
  if (action.kind === "raise-to-hil") {
    return `${who} is BLOCKED and needs a human: ${state.blockers[0]?.reason ?? "an escalation was raised"}. See blockers; resolve it, then resume.`;
  }
  if (state.open_gates.length > 0) {
    return `${who} is at the ${state.open_gates[0]} gate, awaiting a human decision. See options for the choices and how to enact each.`;
  }
  return `${who} is mid-flight (${state.derived_phase ?? state.coarse_phase}). The next step is: ${describeAction(action, { featureId: ctx.featureId })}.`;
}

/**
 * Compute the authoritative snapshot from an injected DriveState (pure). The CLI
 * reads the state from disk and passes it here; tests pass a hand-built state.
 * The transition is the SAME nextTransition the drive uses, so `next` can never
 * disagree with what the drive would actually do.
 */
export function buildNextSnapshot(
  scope: "feature" | "sprint",
  state: DriveState,
  ctx: NextContext,
  transition: (s: DriveState) => WorkflowAction = nextTransition,
): NextSnapshot {
  const action = transition(state);
  const stories: Record<string, string> = {};
  for (const s of ctx.stories ?? []) stories[s.story_id] = s.status;
  const nextState: NextState = {
    coarse_phase: state.phase,
    derived_phase: scope === "feature" ? deriveFeaturePhase(ctx.stories ?? []) : null,
    stories,
    open_gates: openGatesOf(action),
    blockers: blockersOf(state),
  };
  const primary = { kind: action.kind, describe: describeAction(action, { featureId: ctx.featureId }) };
  const options = buildNextOptions(action, ctx);
  // A human is needed iff the menu offers a DECISION (a gate, or a non-`resume` action
  // like backlog.commit / accept / discard / revise) rather than an autonomous `resume`.
  // `hold` (kind:"noop") is always present and never counts.
  const awaiting_human = options.some((o) => o.kind === "gate" || (o.kind === "action" && o.id !== "resume"));
  return {
    scope,
    ...(ctx.featureId ? { feature: ctx.featureId } : {}),
    ...(ctx.sprint ? { sprint: ctx.sprint } : {}),
    state: nextState,
    primary_action: primary,
    options,
    awaiting_human,
    summary: summarize(scope, action, nextState, ctx),
    authoritative_playbook_version: ctx.version ?? "unknown",
    generated_at: ctx.now ?? new Date().toISOString(),
  };
}

/** UI test kinds — a story with any of these in its per-story test list is user-facing, not API-only. */
const UI_TEST_KINDS: ReadonlySet<string> = new Set(["client", "e2e"]);

/**
 * Per-story acceptance-review hints (impure; reads disk), keyed by story_id. A story is API-only
 * when its per-story test list (`stories/<s>/test-list-per-story.json`) is non-empty and has NO
 * client/e2e UI test; `docsUrl` is the deployed server's live Swagger UI (`<url>/docs`), present
 * only when the story's deploy verified reachable (so we never offer a dead link). An empty/absent
 * test list is NOT treated as API-only (its shape is not yet known), so the offer only fires once
 * the story is genuinely backend-only. Computed here so buildNextSnapshot stays pure.
 */
export function buildStoryReview(consortDir: string, featureId: string): Record<string, StoryReview> {
  const fdir = findFeatureDir(consortDir, featureId);
  if (!fdir) return {};
  const storiesDir = path.join(fdir, "stories");
  let ids: string[];
  try {
    ids = fs.readdirSync(storiesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return {};
  }
  const out: Record<string, StoryReview> = {};
  for (const story of ids) {
    const sdir = path.join(storiesDir, story);
    let items: Array<{ kind?: string }> = [];
    try {
      items = (JSON.parse(fs.readFileSync(path.join(sdir, "test-list-per-story.json"), "utf8")) as { items?: Array<{ kind?: string }> }).items ?? [];
    } catch {
      /* no per-story test list yet */
    }
    const apiOnly = items.length > 0 && !items.some((i) => typeof i.kind === "string" && UI_TEST_KINDS.has(i.kind));
    const ev = readDeployEvidence(path.join(sdir, "deploy-evidence.json"));
    const docsUrl = apiOnly && ev && deployEvidencePasses(ev) && ev.url ? ev.url.replace(/\/+$/, "") + "/docs" : undefined;
    out[story] = { apiOnly, ...(docsUrl ? { docsUrl } : {}) };
  }
  return out;
}

/**
 * Build the feature-scope snapshot straight from disk (read-only): the drive's
 * auto-emit + the CLI share this so both reflect the exact on-disk state via the
 * same readDriveStateFromDisk + summarizeStories the engine uses. Impure (reads
 * disk); buildNextSnapshot itself stays pure.
 */
export function readFeatureNextSnapshot(
  consortDir: string,
  featureId: string,
  projectDir: string,
  ctx: Omit<NextContext, "featureId" | "stories"> & { uiTrack?: boolean } = {},
): NextSnapshot {
  const state = readDriveStateFromDisk(consortDir, featureId, projectDir, { uiTrack: ctx.uiTrack });
  return buildNextSnapshot("feature", state, {
    ...ctx,
    featureId,
    stories: summarizeStories(consortDir, featureId),
    storyReview: buildStoryReview(consortDir, featureId),
  });
}

/**
 * Emit the authoritative feature snapshot to `<consortDir>/next.json`. The drive
 * calls this on every stop (a gate, an escalation, feature-complete, an error,
 * a killed run), so an orchestrating agent's contract is simply: on any stop,
 * read next.json and present its options. Best-effort: an advisory artifact must
 * never break the run, so all failures are swallowed (FEIP-8017).
 */
export function emitNextJson(
  consortDir: string,
  featureId: string,
  projectDir: string,
  ctx: Omit<NextContext, "featureId" | "stories"> & { uiTrack?: boolean } = {},
): void {
  try {
    const snap = readFeatureNextSnapshot(consortDir, featureId, projectDir, ctx);
    fs.mkdirSync(consortDir, { recursive: true });
    fs.writeFileSync(path.join(consortDir, "next.json"), JSON.stringify(snap, null, 2) + "\n", "utf8");
  } catch {
    /* best-effort: next.json is advisory; never let it fail the run */
  }
}

/** Render a NextSnapshot as a compact human-readable block (the CLI's non-JSON
 *  output). Read-only presentation; the JSON is the machine contract. */
export function renderNextSnapshot(snap: NextSnapshot): string {
  const lines: string[] = [];
  const who = snap.scope === "sprint" ? `sprint ${snap.sprint}` : `feature ${snap.feature}`;
  lines.push(`Next for ${who}`);
  const phase = snap.state.derived_phase ?? snap.state.coarse_phase;
  const coarseLag =
    snap.state.derived_phase && snap.state.coarse_phase !== snap.state.derived_phase
      ? ` [coarse: ${snap.state.coarse_phase}]`
      : "";
  lines.push(`  Phase: ${phase}${coarseLag}`);
  if (Object.keys(snap.state.stories).length > 0) {
    const rows = Object.entries(snap.state.stories).map(([id, st]) => `${id}=${st}`);
    lines.push(`  Stories: ${rows.join(", ")}`);
  }
  if (snap.state.open_gates.length > 0) lines.push(`  Open gate: ${snap.state.open_gates.join(", ")}`);
  lines.push(``);
  lines.push(snap.summary);
  if (snap.state.blockers.length > 0) {
    lines.push(``);
    lines.push(`Blockers:`);
    for (const b of snap.state.blockers) {
      lines.push(`  - [${b.source}] ${b.reason}${b.story ? ` (story ${b.story})` : ""}`);
      if (b.resolver) lines.push(`      resolve: ${b.resolver.bin} ${b.resolver.args.join(" ")}`);
      else if (b.resolver_hint) lines.push(`      resolve: ${b.resolver_hint}`);
    }
  }
  lines.push(``);
  lines.push(`Options:`);
  for (const o of snap.options) {
    const tag = o.outward_facing ? " (outward-facing: confirm first)" : "";
    lines.push(`  - ${o.title}${tag}`);
    lines.push(`      ${o.hil_prompt}`);
    if (o.enact) lines.push(`      enact: ${o.enact.bin} ${o.enact.args.join(" ")}`);
    if (o.note) lines.push(`      note: ${o.note}`);
  }
  return lines.join("\n");
}
