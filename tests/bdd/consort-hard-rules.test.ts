import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { GATE_NAMES } from "../../consort/gates/gates";

const SKILL_DIR = join(__dirname, "..", "..", "skills", "consort");
const SKILL_PATH = join(SKILL_DIR, "SKILL.md");
const README_PATH = join(SKILL_DIR, "README.md");
const NAV_PATH = join(SKILL_DIR, "agents", "navigator.md");
const DRV_PATH = join(SKILL_DIR, "agents", "driver.md");
const TS_PATH = join(SKILL_DIR, "agents", "test-strategist.md");

const NINE_RULES_PHRASES = [
  "immutable until the test list itself is renegotiated",
  "minimal *honest* code",
  "would a fresh reader infer the right concept",
  "outermost public boundary",
  "correct refactor should not change the outer-boundary tests",
  "never make a private method public",
  "leading indicator is",
  "spike code is throwaway",
  "iterative refinement",
];

describe("consort hard rules", () => {
  const skill = readFileSync(SKILL_PATH, "utf8");
  const readme = readFileSync(README_PATH, "utf8");

  it("SKILL.md contains a ## Hard rules section", () => {
    expect(skill).toMatch(/^##\s+Hard rules/m);
  });

  it("README.md ships a ## How to use section with worked prompts", () => {
    expect(readme).toMatch(/^##\s+How to use/m);
    // Flow 1: spec authoring + drift validation.
    expect(readme).toMatch(/Author a feature spec/i);
    // Flow 2: N=1 default – lead with feature-oriented language.
    expect(readme).toMatch(/Build a feature end-to-end/i);
    expect(readme).toMatch(/N=1 default/i);
    // Flow 3: N>=2 parallel experiments.
    expect(readme).toMatch(/Race parallel experiments/i);
  });

  it("README.md lexicon makes the experiment story-scoped explicit for N=1", () => {
    // Experiments are scoped to a story now: N=1 is the story's one isolated build.
    expect(readme).toMatch(/the story's one isolated build/i);
  });

  it("SKILL.md points readers to README.md for the human-facing overview", () => {
    expect(skill).toContain("README.md");
  });

  it("SKILL.md has at least 9 numbered rules", () => {
    const numbered = skill.match(/^[0-9]+\./gm) ?? [];
    expect(numbered.length).toBeGreaterThanOrEqual(9);
  });

  for (const phrase of NINE_RULES_PHRASES) {
    it(`SKILL.md hard rules include: "${phrase}"`, () => {
      // Rule content match is case-insensitive – sentence-start capitalization is incidental,
      // the rule wording itself is what matters.
      expect(skill.toLowerCase()).toContain(phrase.toLowerCase());
    });
  }

  it("SKILL.md points to navigator.md and driver.md for per-role specialization", () => {
    expect(skill).toContain("agents/navigator.md");
    expect(skill).toContain("agents/driver.md");
  });

  it("navigator.md affirms tests are immutable between approved gates", () => {
    const nav = readFileSync(NAV_PATH, "utf8");
    expect(nav).toMatch(/immutable/i);
  });

  it("driver.md prohibits deleting or weakening tests", () => {
    const drv = readFileSync(DRV_PATH, "utf8");
    expect(drv).toMatch(/never delete a test/i);
    expect(drv).toMatch(/never weaken/i);
  });

  it("driver.md prohibits mocking the database", () => {
    const drv = readFileSync(DRV_PATH, "utf8");
    expect(drv.toLowerCase()).toContain("no mocks for the database");
  });

  // Anti-recurrence guard: SKILL.md's gate documentation drifted behind the code
  // once (the `deploy` gate was added to GATE_NAMES but the named-gate list still
  // read spec/plan/test_list/promote). Fail if a gate exists in code but is never
  // mentioned in SKILL.md, so a future gate addition forces a doc update.
  it("SKILL.md names every gate in GATE_NAMES", () => {
    for (const gate of GATE_NAMES) {
      expect(skill, `SKILL.md should mention the '${gate}' gate`).toContain(`\`${gate}\``);
    }
  });

  // Anti-recurrence guard: the design lane runs the DBA between the Architect and
  // the Test Strategist (a routing change in orchestrator-drive). SKILL.md's
  // /design-lane sentence must name the DBA so the doc cannot drift behind the code.
  it("SKILL.md's design-lane sentence names the DBA between the Architect and the Test Strategist", () => {
    expect(skill).toMatch(/Architect Reviewer\s*->\s*DBA\s*->\s*Test Strategist/i);
  });

  // Finding 30: a fixed-key seed with only `finally` cleanup poisons every later
  // run on a reused branch DB when a run is killed mid-test. The migration-test
  // guidance in BOTH design roles must require an idempotent seed at the START.
  it("test-strategist.md + navigator.md require an idempotent migration-test seed", () => {
    for (const p of [TS_PATH, NAV_PATH]) {
      const doc = readFileSync(p, "utf8");
      expect(doc.toLowerCase()).toMatch(/idempotent/);
      // A per-run key OR a delete/on-conflict guard before the insert.
      expect(doc).toMatch(/uuid|ON CONFLICT|DELETE the fixed key/i);
      // And it must say the finally cleanup alone is insufficient.
      expect(doc.toLowerCase()).toMatch(/finally/);
    }
  });

  // pm23: a story's step defs were split across two modules (test_S1_add_holding.py for
  // T1-T5, test_S1_add_holding_ac4.py for AC4's T11-T13) both pointing at ONE feature file.
  // The T1-T5 module's blanket scenarios() glob re-bound AC4's scenarios as phantom items
  // with no matching steps in that module (pytest-bdd resolves step defs per-module) ->
  // StepDefinitionNotFoundError stalled the build lane on a correct app. navigator.md must
  // pin the binding-hygiene rule: a feature file is blanket-bound by at most one module;
  // a split story uses explicit @scenario per module.
  it("navigator.md pins pytest-bdd binding hygiene (one blanket scenarios() per feature; split -> explicit @scenario)", () => {
    const nav = readFileSync(NAV_PATH, "utf8");
    // Names the collision it prevents.
    expect(nav).toMatch(/StepDefinitionNotFound/);
    // Requires explicit @scenario when a story's step defs are split across modules.
    expect(nav).toMatch(/@scenario\(/);
    // States the at-most-one-blanket-glob-per-feature rule.
    expect(nav.toLowerCase()).toMatch(/blanket|at most one module|per module/);
  });

  // pm23 (Resolution A): a service-layer "rejects before the DB" guard was authored by
  // calling the service with NO db to prove the repository isn't reached. That works only
  // while the service keeps a layering-violating optional-session fallback; the layering
  // REFACTOR (db becomes a required injected param) then raises TypeError before validation
  // -> the guard fails on a correct app and the refactor is falsely assessed a regression
  // (a driver-refactor HIL). navigator.md must require: inject the required session, assert
  // the repository write is not called; never omit the session.
  it("navigator.md authors a service-layer guard with an INJECTED session (never by omitting db)", () => {
    const nav = readFileSync(NAV_PATH, "utf8");
    expect(nav.toLowerCase()).toMatch(/injected session|required injected|with its required/);
    expect(nav.toLowerCase()).toMatch(/assert_not_called|repository is untouched|repository write/i);
    expect(nav, "must warn against proving it by omitting the session/db").toMatch(/do NOT.*OMIT|omitting the session/i);
  });
});
