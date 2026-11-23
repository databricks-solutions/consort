// The ONE parity contract between the Claude `/consort:start` command (`commands/start.md`) and the
// Copilot coordinator skill (`integrations/copilot/consort-copilot/skills/consort/SKILL.md`).
//
// WHY this exists: the Copilot skill is a hand-condensed mirror of `start.md`. A separately-maintained
// condensation drifts — it has silently dropped steps twice. This manifest is the single ordered list
// of EVERY `/consort:start` step, derived once by reading `start.md` in full. `tests/bdd/coordinator-parity.test.ts`
// checks BOTH surfaces against it, so a step cannot be dropped (or a new `start.md` step left un-mirrored)
// without the build failing.
//
// `kind`:
//   - "content"         → a real process step the Copilot coordinator MUST perform. Its `skillAnchor`
//                         (a stable substring) MUST be present in SKILL.md.
//   - "claude-mechanic" → a Claude-Code-specific mechanic (a tool, a plugin-host detail, a prompt UI).
//                         It is either TRANSFORMED for Copilot (`transformRule` + a `skillAnchor` proving
//                         the transform landed in SKILL.md) or intentionally OMITTED (`omissionReason` +
//                         a `skillAnchor` pointing at the documented omission in SKILL.md's
//                         "Intentional omissions" subsection).
//
// `startMdAnchor` is a stable substring that is literally present in `commands/start.md`; the drift test
// greps for it (a removed `start.md` step breaks the grep) and uses the full anchor set to prove every
// `##`/`###` header + `**Step N`-marker section of `start.md` maps to at least one manifest entry (a new,
// unmapped `start.md` section fails the test).
//
// Entries are in `start.md` reading order.

export type StepKind = "content" | "claude-mechanic";

export interface CoordinatorStep {
  /** Stable id (kebab-case). */
  id: string;
  /** Human-readable step title. */
  title: string;
  /** Whether the Copilot coordinator performs this step ("content") or it is a Claude-only mechanic. */
  kind: StepKind;
  /** A substring literally present in `commands/start.md` — the drift test greps for it. */
  startMdAnchor: string;
  /**
   * A substring that MUST be present in the Copilot SKILL.md:
   *  - content          → proof the step is covered.
   *  - claude-mechanic + transformRule → proof the transform landed.
   *  - claude-mechanic + omissionReason → the token inside SKILL.md's "Intentional omissions" subsection.
   */
  skillAnchor?: string;
  /** For a transformed claude-mechanic: how the Claude mechanic becomes the Copilot behavior. */
  transformRule?: string;
  /** For an omitted claude-mechanic: why it is left out of the Copilot flow. */
  omissionReason?: string;
}

export const COORDINATOR_PARITY: CoordinatorStep[] = [
  // ── Preamble: telemetry → preflight → install/current → route ──────────────────────────────────────
  {
    id: "telemetry-briefing",
    title: "Telemetry briefing (one-time, before anything else)",
    kind: "content",
    startMdAnchor: "Telemetry briefing (once, before anything else)",
    skillAnchor: "Step 0 — telemetry",
  },
  {
    id: "telemetry-silent-description",
    title: "Silent Bash tool-call description discipline for the telemetry check",
    kind: "claude-mechanic",
    startMdAnchor: "This silence includes the Bash tool-call DESCRIPTION",
    skillAnchor: "silent Bash-description",
    transformRule:
      "The 'neutral Bash-description, never narrate telemetry' discipline → ask in plain chat prose; Copilot surfaces no tool-call description to suppress, so only the one-time briefing text carries over.",
  },
  {
    id: "plugin-root-resolution",
    title: "Resolve the plugin's shipped binary dir ($CLAUDE_PLUGIN_ROOT / $CONSORT_ROOT)",
    kind: "claude-mechanic",
    startMdAnchor: "`$CLAUDE_PLUGIN_ROOT` is NOT reliably exported",
    skillAnchor: "$CLAUDE_PLUGIN_ROOT",
    transformRule:
      "The $CLAUDE_PLUGIN_ROOT/$CONSORT_ROOT plugin-binary resolver → the kit resolution order in Setup (on PATH → LAKEBASE_KIT_DIR → offer `npm i -g @databricks-solutions/consort`).",
  },
  {
    id: "preflight-blob",
    title: "One-shot deterministic preflight snapshot",
    kind: "claude-mechanic",
    startMdAnchor: "consort-preflight --json",
    skillAnchor: "consort-preflight",
    transformRule:
      "The `consort-preflight --json` cache blob → direct checks at the point of use (`ls -d .consort`, `git status`, `consort-next`, `consort-dashboard --status`).",
  },
  {
    id: "install-current-check",
    title: "Check Consort is installed and current before branching",
    kind: "content",
    startMdAnchor: "Check that Consort is installed and current",
    skillAnchor: "I don't see the Consort kit installed",
  },
  {
    id: "plugin-marketplace-update",
    title: "Install/upgrade the plugin via the marketplace",
    kind: "claude-mechanic",
    startMdAnchor: "claude plugin marketplace update databricks-solutions",
    skillAnchor: "gh copilot plugin install",
    transformRule:
      "`claude plugin marketplace update` / `claude plugin update` → `gh copilot plugin install` (plugin) plus `npm i -g @databricks-solutions/consort` (kit).",
  },
  {
    id: "route-on-state",
    title: "Route on whether a .consort/ project exists",
    kind: "content",
    startMdAnchor: "Route on `project.is_consort`",
    skillAnchor: "Step 1 — where are we",
  },

  // ── A. Resume ──────────────────────────────────────────────────────────────────────────────────────
  {
    id: "resume-take-stock",
    title: "Take stock + situation report",
    kind: "content",
    startMdAnchor: "**Take stock**",
    skillAnchor: "Situation report (take stock FIRST)",
  },
  {
    id: "resume-consort-next-authority",
    title: "Derive where-am-I / what-next from consort-next",
    kind: "content",
    startMdAnchor: "consort-next --feature",
    skillAnchor: "consort-next --feature",
  },
  {
    id: "resume-pin-lag-check",
    title: "Check the project pin isn't behind the installed plugin",
    kind: "claude-mechanic",
    startMdAnchor: "check-pin-lag.cli.js",
    skillAnchor: "pin-lag",
    omissionReason:
      "Project-pin-vs-installed-plugin lag is specific to the Claude plugin host (a committed `.lakebase/kit-ref` pinned behind a newer plugin); the Copilot kit is one global/npm install with no plugin-vs-pin split to reconcile.",
  },
  {
    id: "resume-legacy-pin-main-fix",
    title: "Repin a legacy `main`-pinned project to an immutable tag",
    kind: "claude-mechanic",
    startMdAnchor: "Older project pinned to `main`",
    skillAnchor: "legacy pin",
    omissionReason:
      "The legacy drift-prone `.lakebase/kit-ref`→`main` repin is version-management housekeeping outside the coordinator's drive flow; a modern create pins an immutable tag.",
  },
  {
    id: "tooling-handoff",
    title: "Tooling + terminal hand-off (dashboard + editor + extension), once, before driving",
    kind: "content",
    startMdAnchor: "Tooling + terminal hand-off",
    skillAnchor: "tooling hand-off",
  },
  {
    id: "tooling-dashboard",
    title: "Offer the live dashboard (start, or re-open if already running)",
    kind: "content",
    startMdAnchor: "offer the live dashboard as a WIZARD CHOICE",
    skillAnchor: "consort-dashboard --status",
  },
  {
    id: "tooling-extension-version-check",
    title: "Extension install-OR-upgrade: installed version vs latest gh release",
    kind: "content",
    startMdAnchor: "Read the installed version AND the latest release",
    skillAnchor: "--list-extensions --show-versions",
  },
  {
    id: "tooling-find-editor-fallback",
    title: "find_editor: resolve the editor via app-bundle path, never a bare `command -v`",
    kind: "content",
    startMdAnchor: "resolves the editor's app bundle",
    skillAnchor: "Cursor.app/Contents/Resources",
  },
  {
    id: "tooling-move-to-editor",
    title: "Move-to-editor offer as its own standalone STOP",
    kind: "content",
    startMdAnchor: "Surface the move choice as its OWN standalone STOP",
    skillAnchor: "move to the editor",
  },
  {
    id: "tooling-resume-in-editor",
    title: "After the editor opens, offer to resume the workflow there",
    kind: "content",
    startMdAnchor: "offer to RESUME the workflow there",
    skillAnchor: "resume the workflow in the editor",
  },
  {
    id: "intake-interview",
    title: "Intake interview — capture the product (no-seed projects)",
    kind: "content",
    startMdAnchor: "Intake — capture the PRODUCT next",
    skillAnchor: "INTAKE INTERVIEW",
  },
  {
    id: "intake-methodology-refs",
    title: "Cite the shared intake methodology references",
    kind: "content",
    startMdAnchor: "skills/consort/references/hil-interview.md",
    skillAnchor: "hil-interview.md",
  },
  {
    id: "intake-reference-sites",
    title: "UI design brief MUST ask the reference-sites question",
    kind: "content",
    startMdAnchor: "Which real websites or apps should this look like",
    skillAnchor: "reference site",
  },
  {
    id: "drive-mode",
    title: "Offer how to drive — whole sprint vs one phase at a time",
    kind: "content",
    startMdAnchor: "offer how to drive",
    skillAnchor: "Drive mode",
  },
  {
    id: "drive-detached-relay",
    title: "Run the driver detached, relay with poll-once consort-watch",
    kind: "content",
    startMdAnchor: "Run the driver DETACHED, then relay it with short poll-once calls",
    skillAnchor: "consort-watch --since",
  },
  {
    id: "gate-authority",
    title: "consort-next awaiting_human is the SOLE gate signal",
    kind: "content",
    startMdAnchor: "`awaiting_human` is the SOLE gate signal",
    skillAnchor: "`awaiting_human` is the SOLE gate signal",
  },
  {
    id: "slash-commands",
    title: "Scaffolded slash commands drive the deterministic orchestrator",
    kind: "claude-mechanic",
    startMdAnchor: "The commands (`/sprint`, `/plan`, `/design`, `/build`, `/deploy`, `/spike`) are scaffolded",
    skillAnchor: "the CLIs they wrap",
    transformRule:
      "Claude's scaffolded slash commands (`/sprint` `/plan` `/design` `/build` `/deploy` `/spike`) → the `./scripts/lk consort-drive` / `consort-next` CLIs they wrap, invoked directly.",
  },
  {
    id: "monitor-tool",
    title: "Monitor tool for live step streaming",
    kind: "claude-mechanic",
    startMdAnchor: "If you invoke the Monitor TOOL",
    skillAnchor: "Monitor tool",
    transformRule:
      "The Monitor tool → poll-once `./scripts/lk consort-watch --since <cursor>` relay (or a background watch); Copilot has no Monitor tool.",
  },
  {
    id: "editor-artifact-open",
    title: "Per-turn editor artifact-open as each design role finishes",
    kind: "claude-mechanic",
    startMdAnchor: "opens in the editor as it finishes",
    skillAnchor: "artifact-open",
    transformRule:
      "Per-turn editor artifact-open → surface each finished artifact in chat (the dashboard shows them too); there is no editor auto-open seam in the Copilot CLI.",
  },
  {
    id: "working-software-review",
    title: "Working-software review at the acceptance/deploy gate (serve the app)",
    kind: "content",
    startMdAnchor: "the working-software gate",
    skillAnchor: "run-dev.sh",
  },
  {
    id: "teardown-reclaim",
    title: "Teardown / reclaim — spike delete, lakebase-scm-cleanup",
    kind: "content",
    startMdAnchor: "Teardown / reclaim",
    skillAnchor: "lakebase-scm-cleanup",
  },
  {
    id: "kit-upgrade-at-stop",
    title: "Upgrade the kit at a stoppable point (consort-upgrade ritual)",
    kind: "claude-mechanic",
    startMdAnchor: "swapping the kit under a running drive is split-brain",
    skillAnchor: "consort-upgrade",
    omissionReason:
      "The in-place `consort-upgrade` kit-swap ritual (dual-pinning `.lakebase/kit-ref*`, recording rollback) is Claude-plugin kit-version management; a Copilot kit is upgraded out of band via `npm i -g @databricks-solutions/consort`, then `gh copilot plugin install`.",
  },

  // ── B. Create ────────────────────────────────────────────────────────────────────────────────────────
  {
    id: "create-first-project-offer",
    title: "First-project (StockFlow) example offer — first run only",
    kind: "content",
    startMdAnchor: "First-project example (offer on the FIRST run only)",
    skillAnchor: "First-project (StockFlow) offer",
  },
  {
    id: "create-stockflow-stage",
    title: "Stage the StockFlow seed (lakebase-stage-first-project)",
    kind: "content",
    startMdAnchor: "lakebase-stage-first-project",
    skillAnchor: "lakebase-stage-first-project",
  },
  {
    id: "create-questions",
    title: "Create-questions interview (name/parent/host/github/tiers/language)",
    kind: "content",
    startMdAnchor: "Walk the user through the create questions",
    skillAnchor: "own project: INTERVIEW",
  },
  {
    id: "askuserquestion-structured",
    title: "Structured AskUserQuestion vs free-text prose for create questions",
    kind: "claude-mechanic",
    startMdAnchor: "never wrap a free-text answer in an options prompt",
    skillAnchor: "AskUserQuestion",
    transformRule:
      "AskUserQuestion structured prompts → plain chat questions, one at a time; NEVER wrap a free-text answer (name/dir/host/owner) in an options prompt.",
  },
  {
    id: "create-ui-track",
    title: "UI track — ask it explicitly, never leave it unset",
    kind: "content",
    startMdAnchor: "ASK it, never leave it unset",
    skillAnchor: "Does it have a UI",
  },
  {
    id: "create-model-profile",
    title: "Per-role model profile — Default vs Customize",
    kind: "content",
    startMdAnchor: "Per-role model profile",
    skillAnchor: "Model profile",
  },
  {
    id: "create-scaffold",
    title: "Run the scaffolder (lakebase-create-project)",
    kind: "content",
    startMdAnchor: "create-project.cli.js",
    skillAnchor: "lakebase-create-project --project-name",
  },
  {
    id: "create-kit-install",
    title: "Cache the new project's pinned kit (./scripts/lk --install)",
    kind: "content",
    startMdAnchor: "caches this project's pinned kit",
    skillAnchor: "./scripts/lk --install",
  },

  // ── Gates + closing note ───────────────────────────────────────────────────────────────────────────
  {
    id: "gates-human-decides",
    title: "Surface every gate; the human decides",
    kind: "content",
    startMdAnchor: "the working-software gate",
    skillAnchor: "Gates — the human decides",
  },
  {
    id: "orchestrator-note",
    title: "The orchestrator is the deterministic driver, not an LLM agent",
    kind: "content",
    startMdAnchor: "Note on the orchestrator",
    skillAnchor: "deterministic orchestrator",
  },
];
