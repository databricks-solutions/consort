// hermetic guard rails on the smoke artifacts.
//
// The smoke itself (examples/replay/run-smoke.sh)
// drives a real scaffolded project through 2 iterations + CI; it's
// expensive and not appropriate as a vitest. This test only asserts
// the smoke's SHAPE and that its authored documents follow the kit's
// role conventions: the Product Owner's product-overview.md is
// open-ended product intent, the per-iteration feature-requests/ are
// in Feature Requester voice (no implementation or operational detail),
// the orchestrator references all iterations in order, and each
// iteration is verified by the generic deploy-gate assertion.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { checkArtifactConformance, parseRequiredNfrs } from "../../consort/orchestrator/validators/conformance/artifact-conformance";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
// The replay machinery (run-smoke.sh, assertions/) lives at examples/replay/ and STAYS in the kit,
// so the machinery assertions below still read it directly.
const SMOKE_DIR = path.join(REPO_ROOT, "examples", "replay");
// The bug-tracker intake docs (product-overview / nfrs / design-brief / feature-requests) are the
// recorded corpus, which moved to the consort-examples repo (fetched via scripts/fetch-examples.sh).
// This test OWNS a readable copy under tests/fixtures/ so its role-voice + artifact-conformance
// assertions run offline and never reach into examples/replay/corpora. See the fixture's README.
const BUG_TRACKER = path.join(__dirname, "..", "fixtures", "smoke-bug-tracker");

const ITERATIONS = [
  "v1-file-bug",
  "v2-transition-status",
];

describe("TDD-workflow smoke: directory structure", () => {
  it("ships under examples/replay/", () => {
    expect(fs.existsSync(SMOKE_DIR)).toBe(true);
  });

  it("has the Product Owner requirements doc at product-overview.md", () => {
    expect(fs.existsSync(path.join(BUG_TRACKER, "product-overview.md"))).toBe(true);
  });

  it("has the recorded HIL NFR brief at nfrs.md", () => {
    expect(fs.existsSync(path.join(BUG_TRACKER, "nfrs.md"))).toBe(true);
  });

  it("has the recorded HIL design brief at design-brief.md (UI smoke)", () => {
    expect(fs.existsSync(path.join(BUG_TRACKER, "design-brief.md"))).toBe(true);
  });

  it("has a feature-requests/ subdir with the seed specs (one per iteration)", () => {
    const reqDir = path.join(BUG_TRACKER, "feature-requests");
    expect(fs.existsSync(reqDir)).toBe(true);
    for (const iter of ITERATIONS) {
      expect(fs.existsSync(path.join(reqDir, `${iter}.md`)), `missing feature-requests/${iter}.md`).toBe(true);
    }
    // No stale per-iteration specs left behind from the prior seed.
    const present = fs.readdirSync(reqDir).filter((f) => f.endsWith(".md")).sort();
    expect(present).toEqual(ITERATIONS.map((i) => `${i}.md`).sort());
  });

  it("verifies every iteration with the single generic deploy-gate assertion (executable, wired in)", () => {
    const assertDir = path.join(SMOKE_DIR, "assertions");
    expect(fs.existsSync(assertDir)).toBe(true);
    const verify = path.join(assertDir, "verify-deploy-gate.sh");
    expect(fs.existsSync(verify), "missing assertions/verify-deploy-gate.sh").toBe(true);
    expect((fs.statSync(verify).mode & 0o111) !== 0, "verify-deploy-gate.sh must be executable").toBe(true);
    // run-smoke.sh resolves the generic verify for every iteration (no bespoke
    // per-vN scripts) and passes the feature id.
    const runSmoke = fs.readFileSync(path.join(SMOKE_DIR, "run-smoke.sh"), "utf8");
    expect(runSmoke).toMatch(/verify-deploy-gate\.sh/);
    // The retired bespoke scripts must be gone.
    for (const v of ["v1", "v2", "v3", "v4", "v5"]) {
      expect(fs.existsSync(path.join(assertDir, `verify-${v}.sh`)), `stale assertions/verify-${v}.sh should be removed`).toBe(false);
    }
    expect(fs.existsSync(path.join(assertDir, "verify-v5-e2e.sh")), "stale verify-v5-e2e.sh should be removed").toBe(false);
  });

  it("has an advisory verify-story-pipeline.sh assert wired into run-smoke.sh", () => {
    const assertScript = path.join(SMOKE_DIR, "assertions", "verify-story-pipeline.sh");
    expect(fs.existsSync(assertScript), "missing assertions/verify-story-pipeline.sh").toBe(true);
    expect((fs.statSync(assertScript).mode & 0o111) !== 0, "verify-story-pipeline.sh must be executable").toBe(true);
    const runSmoke = fs.readFileSync(path.join(SMOKE_DIR, "run-smoke.sh"), "utf8");
    expect(runSmoke).toMatch(/verify-story-pipeline\.sh/);
  });

  it("has run-smoke.sh as the entrypoint", () => {
    const entry = path.join(SMOKE_DIR, "run-smoke.sh");
    expect(fs.existsSync(entry)).toBe(true);
    // Executable bit set so direct invocation works.
    const mode = fs.statSync(entry).mode;
    expect((mode & 0o111) !== 0, "run-smoke.sh must be executable").toBe(true);
  });

  it("scaffolds a FRESH project every run: unique default name + hard-abort on a stale dir", () => {
    const runSmoke = fs.readFileSync(path.join(SMOKE_DIR, "run-smoke.sh"), "utf8");
    // Default PROJECT_NAME carries a per-run unique id so the runner can never
    // silently reuse a stale scaffold or collide with a prior run's resources.
    expect(runSmoke).toMatch(/RUN_ID="\$\(date /);
    expect(runSmoke).toMatch(/PROJECT_NAME="bug-tracker-\$\{RUN_ID\}"/);
    // A pre-existing project dir hard-aborts (exit 1) instead of proceeding.
    expect(runSmoke).toMatch(/already exists[\s\S]*?exit 1/);
  });
});

describe("TDD-workflow smoke: headless speed (MCP strip + per-role model tiering)", () => {
  const runSmoke = fs.readFileSync(path.join(SMOKE_DIR, "run-smoke.sh"), "utf8");

  it("drives the orchestrator CLI directly, with no top-level claude -p session", () => {
    // The smoke drives consort-drive directly for every phase (planning +
    // per-feature). It does NOT boot a top-level `claude -p` slash-command
    // session: that path does not reliably inherit LAKEBASE_SFTDD_HUMAN_PROXY into
    // its Bash tool, which silently flipped the plan gate to interactive. The
    // driver owns role-agent invocation internally (claude -p --agent <role>).
    const topLevelCalls = runSmoke
      .split("\n")
      .filter((line) => /^\s*claude -p "/.test(line));
    expect(topLevelCalls, `no top-level claude -p; found: ${topLevelCalls.join(" | ")}`).toHaveLength(0);
    // Planning runs the driver bounded to planning, with proxy gates explicit
    // (deterministic headless, not env-dependent).
    expect(runSmoke).toMatch(/consort-drive\b[\s\S]*--plan-only[\s\S]*--gates proxy/);
  });

  it("runs on kit-default models (NO per-role --agent-model pins), and patches effort=low for all roles EXCEPT the two AC-independence gatekeepers (spec-author + test-strategist run at default effort)", () => {
    // Models: kit DEFAULTS, no per-role pins. The deterministic gates
    // (contract-clean, layering-clean, conformance) + the honest-GREEN backstop
    // carry the quality the old opus pins used to backstop, so the smoke runs on
    // each role's recommended model. (Overridable per run via --agent-model / the
    // AGENT_MODELS env if a specific experiment needs it.)
    expect(runSmoke, "no per-role --agent-model pins; the smoke uses kit defaults").not.toMatch(
      /--agent-model \S+=/,
    );
    // create-project takes only --agent-model (model), so effort is patched into
    // the seeded sftdd-config.json right after scaffold: effort=low on every role
    // EXCEPT the two design-gate AC-independence gatekeepers (spec-author +
    // test-strategist), left unset -> default effort, because their semantic
    // judgment (independence test / ac-overlap detection) is undercut by low effort.
    expect(runSmoke).toMatch(
      /\.roles \|= with_entries\(if \(\.key == "spec-author" or \.key == "test-strategist"\) then \. else \.value\.effort = "low" end\)/,
    );
  });

  // Role observability is now structural inside the deterministic driver
  // (consort-drive emits phase/handoff/gate events as code and reconciles
  // artifacts internally), not a shell-level live-tail + --reconcile wrapped
  // around claude -p passes. The prior assertion for that shell mechanism was
  // removed with the gate-drain loop; the driver's logging is covered by its own
  // tests (orchestrator-drive / orchestrator-run).
});

describe("TDD-workflow smoke: product-overview.md is well-formed (Product Owner voice)", () => {
  // product-overview.md is the Product Owner's standing intent: who the
  // product is for + what they need to accomplish, open-ended and
  // refined across iterations. Stack, schema, endpoints, and tier flags
  // are the Architect's / harness's concern (the smoke README), not here.
  const md = fs.readFileSync(path.join(BUG_TRACKER, "product-overview.md"), "utf8");

  it("carries YAML frontmatter declaring author: Product Owner", () => {
    expect(md).toMatch(/^---\n[\s\S]*?\bauthor:\s*Product Owner\b[\s\S]*?\n---\n/);
  });

  it("has a top-level H1 title", () => {
    expect(md).toMatch(/^#\s+\S/m);
  });

  it("contains substantive product-intent prose (>=400 chars beyond the title)", () => {
    const body = md.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^#.*$/m, "").trim();
    expect(body.length, `product-overview should have substantive intent; got ${body.length} chars`).toBeGreaterThanOrEqual(400);
  });

  it("stays open-ended product intent: no implementation or operational detail", () => {
    expect(md, "no Schema section (architect's concern)").not.toMatch(/##\s*Schema/im);
    expect(md, "no HTTP endpoint listing (architect's concern)").not.toMatch(/\b(POST|GET|PATCH|PUT|DELETE)\s+\//);
    expect(md, "no --tiers operational flag (harness concern)").not.toMatch(/--tiers\b/);
    expect(md, "no SQL DDL (implementation concern)").not.toMatch(/\b(CREATE TABLE|ALTER TABLE|FOREIGN KEY)\b/i);
  });
});

describe("TDD-workflow smoke: recorded HIL intake artifacts conform (Human Proxy answers)", () => {
  it("product-overview.md conforms to its declared format", () => {
    const md = fs.readFileSync(path.join(BUG_TRACKER, "product-overview.md"), "utf8");
    expect(checkArtifactConformance("product-overview.md", md)).toEqual({ ok: true });
  });

  it("nfrs.md conforms (Required / Preferences / Out of bounds) and carries R<n> ids", () => {
    const md = fs.readFileSync(path.join(BUG_TRACKER, "nfrs.md"), "utf8");
    expect(checkArtifactConformance("nfrs.md", md)).toEqual({ ok: true });
    const ids = parseRequiredNfrs(md).map((r) => r.id);
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(ids.every((id) => id !== null)).toBe(true);
  });

  it("design-brief.md conforms (has a References section)", () => {
    const md = fs.readFileSync(path.join(BUG_TRACKER, "design-brief.md"), "utf8");
    expect(checkArtifactConformance("design-brief.md", md)).toEqual({ ok: true });
  });
});

describe("TDD-workflow smoke: orchestrator supplies intake via the Human Proxy", () => {
  const runSmoke = fs.readFileSync(path.join(SMOKE_DIR, "run-smoke.sh"), "utf8");

  it("stages project intake (product-overview.md + nfrs.md + design-brief.md) via human-proxy supply", () => {
    expect(runSmoke).toMatch(/consort-human-proxy supply/);
    expect(runSmoke).toMatch(/stage_project_intake/);
    expect(runSmoke).toMatch(/product-overview\.md/);
    expect(runSmoke).toMatch(/nfrs\.md/);
    expect(runSmoke).toMatch(/design-brief\.md/);
  });

  it("declares the UI track via create-project --ui-track (the single source), not a LAKEBASE_SFTDD_UI env door", () => {
    // Single-source config: uiTrack is persisted at scaffold (create-project
    // --ui-track -> project.uiTrack in sftdd-config.json, which the drive reads),
    // NOT set through the removed LAKEBASE_SFTDD_UI env override.
    expect(runSmoke).toMatch(/--ui-track/);
    expect(runSmoke).not.toMatch(/LAKEBASE_SFTDD_UI/);
  });

  it("hands the PO's feature-requests to the Human Proxy WHEN the state machine asks (not pre-staged)", () => {
    // The PO's artifacts are supplied at the author-requests step, not before:
    // run_plan_sprint records the (feature_id, recorded source) pairs in
    // LAKEBASE_CONSORT_SPRINT_REQUESTS, and the driver's author-requests step has the
    // Human Proxy supply them. No bare cp, and no up-front proxy_supply into .tdd.
    expect(runSmoke).toMatch(/export LAKEBASE_CONSORT_SPRINT_REQUESTS=/);
    expect(runSmoke).not.toMatch(/cp "\$spec"/);
    expect(runSmoke, "no up-front feature-request staging").not.toMatch(
      /proxy_supply "\$spec".*feature-request\.md/,
    );
    expect(runSmoke).toMatch(/run_plan_sprint\s*\(\)/);
    const planFn = runSmoke.slice(runSmoke.indexOf("run_plan_sprint() {"));
    expect(planFn, "the recorded request pairs are built in run_plan_sprint").toMatch(
      /LAKEBASE_CONSORT_SPRINT_REQUESTS/,
    );
  });
});

describe("TDD-workflow smoke: /plan authors each sprint's backlog (two sprints, feedback loop)", () => {
  const runSmoke = fs.readFileSync(path.join(SMOKE_DIR, "run-smoke.sh"), "utf8");

  it("runs two sprints sliced from ITERATIONS (sprint-1 = v1, sprint-2 = v2)", () => {
    expect(runSmoke).toMatch(/SPRINT1_ITERS=\(.*ITERATIONS\[@\]:0:1.*\)/);
    expect(runSmoke).toMatch(/SPRINT2_ITERS=\(.*ITERATIONS\[@\]:1:1.*\)/);
    expect(runSmoke).toMatch(/run_sprint "sprint-1" "\$\{SPRINT1_ITERS\[@\]\}"/);
    expect(runSmoke).toMatch(/run_sprint "sprint-2" "\$\{SPRINT2_ITERS\[@\]\}"/);
  });

  it("/plan enforces the project-intake precondition (consort-intake without --feature)", () => {
    // run_plan_sprint is defined after run_iteration; slice from its definition
    // to the run_sprint driver that follows it in the main block.
    const planFn = runSmoke.slice(
      runSmoke.indexOf("run_plan_sprint() {"),
      runSmoke.indexOf("run_sprint() {")
    );
    // The project-level gate calls `consort-intake` (no --feature), wrapped
    // in a retry loop (transient npx flakes must not be fatal) that still exits
    // 2 after repeated failure. (The per-feature requests are no longer staged
    // here; the Human Proxy supplies them at the driver's author-requests step.)
    expect(planFn).toMatch(/consort-intake; then _intake_ok=1/);
    expect(planFn).toMatch(/project-intake precondition failed after 3 attempts/);
  });

  it("commits the sprint backlog + project intake to trunk so feature branches inherit requests", () => {
    expect(runSmoke).toMatch(/git commit -m "plan \$\{sprint_name\}/);
    expect(runSmoke).toMatch(/git commit -m "intake: project/);
  });

  it("drives planning through the orchestrator CLI (--plan-only --gates proxy), not claude -p", () => {
    // Planning runs the same driver the scaffolded /plan command runs, called
    // directly so gate mode + LAKEBASE_SFTDD_HUMAN_PROXY are deterministic (the
    // claude -p "/plan" path did not reliably inherit the env, flipping the plan
    // gate to interactive headless).
    const planFn = runSmoke.slice(runSmoke.indexOf("run_plan_sprint() {"));
    expect(planFn).toMatch(/consort-drive[\s\S]*--sprint "\$\{sprint_name\}"[\s\S]*--plan-only[\s\S]*--gates proxy/);
    // No EXECUTABLE claude -p "/plan" line (a line-start invocation, not a comment).
    expect(planFn, "planning must not go through claude -p").not.toMatch(/^\s*claude -p "\/plan/m);
  });

  it("skips the Architect t-shirt-sizing step (--no-sizing): single-feature sprints need no capacity tradeoff", () => {
    // Each sprint is one feature, so planning-poker adds nothing the PO needs to
    // commit a backlog; --no-sizing drops the estimate turn (propose ->
    // author-requests). The driver invocation must carry the flag.
    const planFn = runSmoke.slice(runSmoke.indexOf("run_plan_sprint() {"));
    expect(planFn).toMatch(/consort-drive[\s\S]*--no-sizing/);
  });
});

describe("TDD-workflow smoke: orchestrator deploys each iteration to local (working software)", () => {
  const runSmoke = fs.readFileSync(path.join(SMOKE_DIR, "run-smoke.sh"), "utf8");

  it("deploys through the driver's deploy phase (release-engineer), not a separate /deploy or substrate emulation", () => {
    // Driver-only: there is no separate shell-level /deploy. consort-drive
    // runs the feature's deploy phase, which routes the deploy to the
    // release-engineer role (deploy + reachability + feature-verify + the PO
    // deploy gate). The single driver invocation carries it.
    expect(runSmoke).toMatch(/consort-drive --feature "\$\{feature_id\}"/);
    expect(runSmoke, "deploy must not be a separate shell-level claude -p call").not.toMatch(/claude -p "\/deploy/);
    // The smoke still tears the local app down between iterations (safety).
    expect(runSmoke).toMatch(/consort-deploy --target local --project-dir "\$PROJECT_DIR" --stop/);
  });

  it("no feature request carries per-PR deployment intent (that is the orchestrated deploy)", () => {
    for (const iter of ITERATIONS) {
      const md = fs.readFileSync(path.join(BUG_TRACKER, "feature-requests", `${iter}.md`), "utf8");
      expect(md, `${iter} should not carry per-PR deployment intent (that is the orchestrated deploy)`).not.toMatch(/pull request|deployed to a new environment/i);
    }
  });
});

describe("TDD-workflow smoke: iteration specs are well-formed (feature-request.md voice)", () => {
  // Iteration specs are feature-request.md files: pure feature-requester narrative
  // describing WHAT the user wants, in user-behavior language. They do NOT
  // contain implementation details (no SQL, no HTTP verbs, no table names,
  // no file paths), no Acceptance Criteria tables (the kit's
  // test-strategist phase produces those from the prose), and no
  // operational metadata (branch name, Lakebase parent, migration version
  // are all derived by the orchestrator from convention).
  //
  // These assertions guard the requester-voice invariant: future edits
  // that try to re-insert implementation specifics into the iteration
  // specs will fail the BDD.

  for (const iter of ITERATIONS) {
    describe(iter, () => {
      const md = fs.readFileSync(path.join(BUG_TRACKER, "feature-requests", `${iter}.md`), "utf8");

      it("carries YAML frontmatter declaring author: Feature Requester", () => {
        // Every artifact in the kit's workflow records the ROLE that
        // authored it (not the person). Iteration specs ARE feature-request.md
        // files, authored by the feature requester. Spec Author /
        // Architect Reviewer / Test Strategist / driver+navigator
        // outputs each carry their own role in this frontmatter slot
        // when they land.
        expect(md).toMatch(/^---\n[\s\S]*?\bauthor:\s*Feature Requester\b[\s\S]*?\n---\n/);
      });

      it("has a top-level H1 title", () => {
        expect(md).toMatch(/^#\s+v\d/m);
      });

      it("contains substantive narrative prose (>=400 chars beyond the title)", () => {
        const body = md.replace(/^#.*$/m, "").trim();
        expect(body.length, `${iter} should have substantive narrative; got ${body.length} chars`).toBeGreaterThanOrEqual(400);
      });

      it("documents what's out of scope", () => {
        expect(md).toMatch(/##\s*Out of scope/i);
      });

      it("does NOT include implementation-leaking sections (architect's voice)", () => {
        // Schema / Migration / Files-/build-produces sections belong to
        // the architect-reviewer + driver phases of /design + /build, not
        // to the feature requester's narrative.
        expect(md, `${iter} should not have a 'Schema' or 'Schema delta' section`).not.toMatch(/##\s*Schema/im);
        expect(md, `${iter} should not have a 'Migration' header`).not.toMatch(/^\*\*Migration\*\*:/m);
        expect(md, `${iter} should not list files /build is expected to produce`).not.toMatch(/##.*Files.*\/build.*produce/i);
      });

      it("does NOT include operational metadata (derived by orchestrator)", () => {
        expect(md, `${iter} should not declare its branch name (orchestrator derives it)`).not.toMatch(/^\*\*Branch\*\*:/m);
        expect(md, `${iter} should not declare its Lakebase parent (smoke is 2-tier by convention)`).not.toMatch(/^\*\*Lakebase parent\*\*:/m);
      });

      it("does NOT include a pre-decided Acceptance Criteria table", () => {
        // ACs are the test-strategist's output (acs/AC*.json + acs/AC*.md
        // per .tdd/ spec-format), not the requester's pre-decision.
        expect(md, `${iter} should not have an 'Acceptance Criteria' section`).not.toMatch(/##\s*Acceptance Criteria/i);
        // Stricter: no markdown table rows starting with | AC<n> |
        expect(md, `${iter} should not contain | AC<n> | table rows`).not.toMatch(/^\|\s*\*?\*?AC\d/m);
      });
    });
  }
});

describe("TDD-workflow smoke: orchestrator is TDD-only (SCM workflow tested elsewhere)", () => {
  const runSmoke = fs.readFileSync(path.join(SMOKE_DIR, "run-smoke.sh"), "utf8");

  it("declares ITERATIONS in order (v1..v2)", () => {
    const m = runSmoke.match(/ITERATIONS=\(([^)]+)\)/);
    expect(m, "run-smoke.sh missing ITERATIONS=(...) declaration").not.toBeNull();
    const declared = m![1].trim().split(/\s+/);
    expect(declared).toEqual(ITERATIONS);
  });

  it("requires claude on PATH (for /design + /build skill invocations)", () => {
    expect(runSmoke).toMatch(/require_cmd\s+claude/);
  });

  it("does NOT invoke the SCM workflow CLIs (those live in tests/integration/scm-workflow-e2e-live.test.ts)", () => {
    // The TDD smoke MUST NOT shell out to lakebase-scm-prepare-pr /
    // wait-ci / merge. Those CLIs are the contract of the SCM workflow
    // substrate; testing them belongs in the live integration suite.
    // Match only invocation lines (not comment mentions in the header).
    const invocations = runSmoke
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    expect(invocations).not.toMatch(/lakebase-scm-prepare-pr\b/);
    expect(invocations).not.toMatch(/lakebase-scm-wait-ci\b/);
    expect(invocations).not.toMatch(/lakebase-scm-merge\b/);
  });

  it("does NOT define an is_full_cycle gate (TDD-only smoke; no PR cycle)", () => {
    expect(runSmoke).not.toMatch(/is_full_cycle\b/);
  });

  it("does NOT require gh (no GitHub PR/merge ops in the TDD smoke)", () => {
    expect(runSmoke).not.toMatch(/require_cmd\s+gh\b/);
  });

  it("invokes consort-human-proxy for headless intake + gate approval", () => {
    // The Human Proxy replaces the human at intake (supplies product-overview /
    // nfrs / design-brief / feature-request) and answers the HITL gates the
    // deterministic driver surfaces (--gates proxy). Stripping it would let the
    // smoke hang at the first gate.
    expect(runSmoke).toMatch(/consort-human-proxy\b/);
  });

  it("abandons the prior feature before claiming the next (substrate CLI)", () => {
    // Each iteration claims a fresh feature; the SCM state machine
    // refuses concurrent claims, so the orchestrator must abandon the
    // prior one between iterations.
    expect(runSmoke).toMatch(/lakebase-scm-abandon-feature\b/);
  });
});
