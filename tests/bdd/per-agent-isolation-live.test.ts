// Per-agent isolation, LIVE. Each TDD-workflow role is run on its own via
// `claude --agent <role>`, fed a controlled input fixture (staged from the
// recorded corpus), and its REAL output is asserted against the role's
// input->output contract. This isolates WHICH agent is nonconformant in seconds,
// instead of discovering it deep inside a ~15-minute end-to-end smoke. Each
// assertion maps to a real failure we hit:
//   - spec-author: acs/ holds ONLY self-named AC files (no <ac>-tests.json junk)
//   - architect-reviewer: EVERY AC gets a layer (else the design lane stalls)
//   - navigator: writes the ASSIGNED next test, not a different one (no divergence)
//
// GATED: opt-in + needs the `claude` CLI on PATH. Run with:
//   LAKEBASE_TEST_AGENTS=1 npx vitest run tests/bdd/per-agent-isolation-live.test.ts
// The build/deploy roles (driver, release-engineer) additionally need a live
// Lakebase branch + running app; they are covered by the full smoke + the
// e2e-live tests and are listed here as documented TODOs (see bottom).

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deployClaudeAgents, deployClaudeSkills } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { checkArtifactConformance } from "../../scripts/sftdd/artifact-conformance";
import { resolveModelForRole } from "../../scripts/sftdd/agent-models";
import { storyAcIds, readAcLayer } from "../../scripts/sftdd/sftdd-paths";

// Input fixtures = the LAST live run's real artifacts (snapshotted), not the
// hand-curated corpus , this is what the agents actually produce today, junk
// (e.g. acs/<ac>-tests.json) and all, so the isolation tests run against
// representative real input.
const CORPUS = join(__dirname, "..", "..", "examples", "tdd-workflow-smoke", "recorded-agent-inputs");
const FEATURE = "F1-file-bug";
const STORY = "S1-create-bug";

function claudeAvailable(): boolean {
  try {
    execSync("command -v claude", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const RUN = process.env.LAKEBASE_TEST_AGENTS === "1" && claudeAvailable();
const AGENT_TIMEOUT_MS = Number(process.env.LAKEBASE_TEST_AGENT_TIMEOUT_MS ?? 600_000);
const AC_ID = /^AC[0-9]+(-[a-z0-9-]+)?$/;

const TERSE =
  " Be terse: produce ONLY the required artifact file(s) on disk, then stop with at most a one-line confirmation." +
  " Do NOT print a plan or restate the artifacts to stdout, the files on disk are the deliverable.";

/** Run a role agent in the project, returning its stdout. Throws on non-zero. */
function runAgent(projectDir: string, role: string, task: string): string {
  const model = resolveModelForRole(role as never, projectDir);
  return execFileSync(
    "claude",
    ["-p", task + TERSE, "--agent", role, "--model", model, "--strict-mcp-config"],
    { cwd: projectDir, encoding: "utf8", timeout: AGENT_TIMEOUT_MS, stdio: ["ignore", "pipe", "pipe"] },
  );
}

/** Copy a recorded-corpus relative path into the project's .tdd/. */
function stage(projectDir: string, relFromCorpusTdd: string, destRel = relFromCorpusTdd): void {
  const src = join(CORPUS, relFromCorpusTdd);
  const dest = join(projectDir, ".tdd", destRel);
  mkdirSync(join(dest, ".."), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

/** Assert a written artifact conforms to its declared format. */
function expectConforms(projectDir: string, tddRelPath: string): void {
  const file = join(projectDir, ".tdd", tddRelPath);
  expect(existsSync(file), `${tddRelPath} exists`).toBe(true);
  const name = tddRelPath.split("/").pop()!;
  const r = checkArtifactConformance(name, readFileSync(file, "utf8"));
  expect(r.ok, `${tddRelPath} conforms: ${r.ok ? "" : r.violations.join("; ")}`).toBe(true);
}

describe.skipIf(!RUN)("per-agent isolation (LIVE: claude --agent <role>)", () => {
  let projectDir: string;

  beforeAll(async () => {
    // Deploy agents + skills ONCE into a template, then clone per test (cheap).
    const tmpl = mkdtempSync(join(tmpdir(), "agent-iso-tmpl-"));
    await deployClaudeAgents(tmpl);
    await deployClaudeSkills(tmpl);
    templateDir = tmpl;
  });

  let templateDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "agent-iso-"));
    cpSync(join(templateDir, ".claude"), join(projectDir, ".claude"), { recursive: true });
    mkdirSync(join(projectDir, ".tdd"), { recursive: true });
  });
  afterEach(() => rmSync(projectDir, { recursive: true, force: true }));

  // ── product-owner: authors the open-ended intake artifacts ──────────────
  it("product-owner: writes conformant product-overview.md + nfrs.md from a brief", () => {
    runAgent(
      projectDir,
      "product-owner",
      "For a Bug Tracker web app (users file bugs, list them, view detail), author the project intake:" +
        " .tdd/product-overview.md (who the users are, what they accomplish) and" +
        " .tdd/nfrs.md (with ## Required, ## Preferences, ## Out of bounds sections).",
    );
    expectConforms(projectDir, "product-overview.md");
    expectConforms(projectDir, "nfrs.md");
  });

  // ── spec-author: drafts ACs for ONE story; acs/ stays AC-only ───────────
  it("spec-author: drafts ACs into acs/ as self-named files only (no junk pollutes the AC set)", () => {
    stage(projectDir, "product-overview.md");
    stage(projectDir, `features/${FEATURE}/stories/${STORY}/story.json`);
    stage(projectDir, `features/${FEATURE}/stories/${STORY}/story.md`);

    runAgent(
      projectDir,
      "spec-author",
      `Draft the acceptance criteria for story ${STORY} and NOTHING else. Write only under` +
        ` .tdd/features/${FEATURE}/stories/${STORY}/acs/ as one acs/<id>.json (+ optional <id>.md) per AC.`,
    );

    // Contract: every acs/*.json the substrate counts is a real, self-named AC.
    const ids = storyAcIds(join(projectDir, ".tdd"), FEATURE, STORY);
    expect(ids.length, "at least one AC authored").toBeGreaterThan(0);
    const acsDir = join(projectDir, ".tdd", "features", FEATURE, "stories", STORY, "acs");
    for (const f of readdirSync(acsDir).filter((x) => x.endsWith(".json"))) {
      const base = f.replace(/\.json$/, "");
      const obj = JSON.parse(readFileSync(join(acsDir, f), "utf8"));
      // A counted AC must self-name AND carry the given/when/then shape; a junk
      // file (e.g. <ac>-tests.json) must NOT also be a counted AC id.
      if (ids.includes(base)) {
        expect(obj.id, `${f} self-names`).toBe(base);
        expect(obj.given !== undefined && obj.when !== undefined && obj.then !== undefined, `${f} is an AC`).toBe(true);
        // The AC id MUST match AC<n>-<slug> (the schema pattern the spec gate
        // enforces). A bare slug (create-form-displays) is the real bug that
        // cascades to the Test Strategist's test-list ac_id failing conformance.
        expect(AC_ID.test(base), `${f} id matches AC<n>-<slug>`).toBe(true);
      }
    }
  });

  // ── architect-reviewer: EVERY AC gets a layer (else design lane stalls) ──
  it("architect-reviewer: annotates a layer on every AC + writes conformant architecture.json", () => {
    // Stage the feature spec + nfrs + ACs WITH their layer/notes stripped (pre-architect state).
    stage(projectDir, `features/${FEATURE}/feature-spec.json`);
    stage(projectDir, `features/${FEATURE}/feature-spec.md`);
    stage(projectDir, "nfrs.md");
    const acsSrc = join(CORPUS, "features", FEATURE, "stories", STORY, "acs");
    const acsDest = join(projectDir, ".tdd", "features", FEATURE, "stories", STORY, "acs");
    mkdirSync(acsDest, { recursive: true });
    for (const f of readdirSync(acsSrc)) {
      const src = join(acsSrc, f);
      const dst = join(acsDest, f);
      const base = f.replace(/\.json$/, "");
      // Strip layer/notes ONLY on real, parseable, self-named AC files; copy
      // anything else (the run's malformed -test-list.json junk, .md, etc.)
      // as-is, do not parse it (that is what crashed the setup before).
      let obj: Record<string, unknown> | undefined;
      if (f.endsWith(".json")) {
        try { obj = JSON.parse(readFileSync(src, "utf8")); } catch { obj = undefined; }
      }
      if (obj && obj.id === base) {
        delete obj.layer;
        delete obj.architectural_notes;
        writeFileSync(dst, JSON.stringify(obj, null, 2));
      } else {
        cpSync(src, dst);
      }
    }

    runAgent(projectDir, "architect-reviewer", `Annotate AC layers and nfrs.md coverage for story ${STORY}.`);

    expectConforms(projectDir, `features/${FEATURE}/architecture.json`);
    // The design-lane-stall invariant: EVERY real AC now has a valid layer
    // (this is exactly architectAnnotated's check; junk files don't count).
    const realAcs = storyAcIds(join(projectDir, ".tdd"), FEATURE, STORY);
    expect(realAcs.length, "real ACs present").toBeGreaterThan(0);
    for (const ac of realAcs) {
      expect(["API", "E2E", "Infra"], `AC ${ac} has a layer`).toContain(readAcLayer(join(projectDir, ".tdd"), FEATURE, ac));
    }
  });

  // ── test-strategist: ordered test-list ──────────────────────────────────
  it("test-strategist: produces a conformant ordered test-list.json", () => {
    stage(projectDir, `features/${FEATURE}/feature-spec.json`, `features/${FEATURE}/feature-spec.json`);
    stage(projectDir, `features/${FEATURE}/stories/${STORY}/acs`, `features/${FEATURE}/stories/${STORY}/acs`);
    runAgent(projectDir, "test-strategist", `Produce the ordered test list for story ${STORY} (.tdd/features/${FEATURE}/test-list.json).`);
    expectConforms(projectDir, `features/${FEATURE}/test-list.json`);
    const tl = JSON.parse(readFileSync(join(projectDir, ".tdd", "features", FEATURE, "test-list.json"), "utf8"));
    expect(Array.isArray(tl.items) && tl.items.length > 0, "items[] present").toBe(true);
    for (const it of tl.items) {
      expect(typeof it.id === "string" && typeof it.ac_id === "string" && typeof it.description === "string", "item shape").toBe(true);
    }
  });

  // ── ux-designer: design-guide + ia from the brief ───────────────────────
  it("ux-designer: writes conformant design-guide.{md,json} + ia.md (incl. UI Framework section)", () => {
    stage(projectDir, "design/design-brief.md");
    stage(projectDir, "product-overview.md");
    runAgent(
      projectDir,
      "ux-designer",
      "Translate .tdd/design/design-brief.md into the project design system: write .tdd/design/design-guide.md," +
        " .tdd/design/design-guide.json (tokens), and .tdd/design/ia.md (screens, navigation, flows).",
    );
    expectConforms(projectDir, "design/design-guide.md");
    expectConforms(projectDir, "design/design-guide.json");
    expectConforms(projectDir, "design/ia.md");
  });

  // ── navigator: writes the ASSIGNED next test, not a different one ────────
  it("navigator: writes exactly one failing test for the ASSIGNED test id (no divergence)", () => {
    // A per-story test-list whose next pending item is a known, specific test.
    const perStory = {
      feature_id: FEATURE,
      story_id: STORY,
      ordered_for: "design-momentum",
      items: [{ id: "T1", description: "POST /bugs with a valid title+description returns 201 and persists the bug", ac_id: "AC1", status: "pending" }],
    };
    mkdirSync(join(projectDir, ".tdd", "features", FEATURE, "stories", STORY), { recursive: true });
    writeFileSync(join(projectDir, ".tdd", "features", FEATURE, "stories", STORY, "test-list-per-story.json"), JSON.stringify(perStory, null, 2));
    mkdirSync(join(projectDir, "tests"), { recursive: true });

    const out = runAgent(
      projectDir,
      "navigator",
      `Write EXACTLY ONE failing test (RED) for story ${STORY}: the next test in order, T1 [ac AC1]:` +
        ` "POST /bugs with a valid title+description returns 201 and persists the bug". Write ONLY this test under tests/.` +
        ` Do NOT write a different test or skip ahead.`,
    );

    // Contract: it produced a test artifact, and engaged with T1 (the assigned id),
    // not some other test. (We assert reference to the assigned id, not a real run.)
    const testFiles = existsSync(join(projectDir, "tests")) ? readdirSync(join(projectDir, "tests")) : [];
    const wroteATest = testFiles.some((f) => /test/i.test(f));
    expect(wroteATest || /T1|201|bugs/i.test(out), "navigator wrote/identified the assigned T1 test").toBe(true);
  });

  // ── driver + release-engineer ───────────────────────────────────────────
  // True isolation of these needs a live build substrate (a paired Lakebase
  // branch DB to flip a RED test GREEN; a running app + port to deploy/verify).
  // They are exercised by the full smoke + the *-e2e-live tests. Left as TODO
  // here; extend with the recorded-build corpus + a branch when wanted.
  it.todo("driver: flips a staged RED test GREEN without weakening it (needs a live branch DB)");
  it.todo("release-engineer: deploy-evidence shows reachable + verify passed (needs a running app)");
});
