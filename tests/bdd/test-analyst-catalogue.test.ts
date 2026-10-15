// Hermetic test for the test-analyst catalogue (consort/test-list/test-analyst-catalogue): the
// configurable roster of per-kind test analysts the test-strategist SUPERVISOR fans out to. The
// catalogue is the SINGLE SOURCE OF TRUTH for the analyst kinds + each one's focus prompt + declared
// inputs + enablement. Proves: the 3 seed kinds resolve; resolve is fail-loud on an unknown kind
// (listing the known kinds); every entry is well-formed (non-empty focusPrompt + >=1 input); and the
// enablement filter gates `client` on uiTrack (a no-frontend project gets behavior+fitness only) while
// behavior+fitness are unconditional.

import { describe, it, expect } from "vitest";
import {
  TEST_ANALYST_CATALOGUE,
  resolveTestAnalystKind,
  enabledAnalysts,
  type TestAnalystCatalogueEntry,
} from "../../consort/test-list/test-analyst-catalogue";

describe("TEST_ANALYST_CATALOGUE: the 3 seed kinds", () => {
  it("holds behavior, fitness, and client", () => {
    expect(Object.keys(TEST_ANALYST_CATALOGUE).sort()).toEqual(["behavior", "client", "fitness"]);
  });

  it("every entry is well-formed (kind echoes its key, non-empty description + focusPrompt, >=1 input)", () => {
    for (const [key, entry] of Object.entries(TEST_ANALYST_CATALOGUE)) {
      expect(entry.kind, `${key}.kind echoes its catalogue key`).toBe(key);
      expect(entry.description.length, `${key}.description non-empty`).toBeGreaterThan(0);
      expect(entry.focusPrompt.length, `${key}.focusPrompt non-empty`).toBeGreaterThan(40);
      expect(entry.inputs.length, `${key}.inputs non-empty`).toBeGreaterThan(0);
      expect(entry.model.length, `${key}.model non-empty`).toBeGreaterThan(0);
    }
  });

  it("carries the advisory optimize levers per analyst (effort in the enum + a non-empty toolScope)", () => {
    // effort + toolScope are the per-analyst tuning levers the optimize path sweeps. They are
    // OPTIONAL on the type, but every seed entry sets them so the roster surfaces a starting point.
    for (const [key, entry] of Object.entries(TEST_ANALYST_CATALOGUE)) {
      expect(["low", "default", "high"], `${key}.effort in enum`).toContain(entry.effort);
      expect(entry.toolScope?.length ?? 0, `${key}.toolScope non-empty`).toBeGreaterThan(0);
    }
    // fitness is the densest-reasoning slice (layering + ORM + NFR guards + per-invariant real-branch
    // tests) – its seed default is high effort, distinguishing it from the cheaper slices.
    expect(TEST_ANALYST_CATALOGUE.fitness.effort).toBe("high");
  });

  it("only the fitness analyst OWNS invariant_id (behavior + client are told NOT to set it)", () => {
    // Single owner => checkInvariantCoverageDistinct can't be tripped by two emitters. The fitness
    // prompt instructs to SET invariant_id; behavior + client explicitly instruct NOT to set it (they
    // may still MENTION the word to forbid it, so assert the ownership direction, not mere mention).
    expect(TEST_ANALYST_CATALOGUE.fitness.focusPrompt).toMatch(/[Ss]et `?invariant_id/);
    expect(TEST_ANALYST_CATALOGUE.behavior.focusPrompt).toMatch(/[Dd]o NOT set `?invariant_id/);
    expect(TEST_ANALYST_CATALOGUE.client.focusPrompt).toMatch(/[Dd]o NOT set `?invariant_id/);
  });
});

describe("behavior vs fitness: a service-internal guard is NOT a .feature scenario (anti build-stall)", () => {
  // Regression (pm23): "Service rejects negative quantity before DB constraint" was authored as a BDD
  // .feature scenario in the behavior slice; it is not API-observable, so it got no step def -> an
  // unbound pytest-bdd scenario -> cycle-stall on the build lane. Service-internal guards (reject
  // BEFORE the DB / repository never reached / at the service layer) belong to the fitness analyst.
  const bhv = TEST_ANALYST_CATALOGUE.behavior.focusPrompt;
  it("the behavior analyst asserts only API-observable outcomes + excludes service-internal guards from .feature", () => {
    expect(bhv).toMatch(/API-OBSERVABLE/);
    expect(bhv).toMatch(/SERVICE-INTERNAL/);
    expect(bhv, "must say a service-internal guard is not a .feature scenario").toMatch(/not a behavior\/\.feature scenario/i);
    expect(bhv, "must warn it stalls the build (unbound scenario)").toMatch(/unbound|stall/i);
    expect(bhv, "must route the service-layer guard to the fitness analyst").toMatch(/FITNESS analyst/i);
  });
});

describe("fitness: a service-layer guard is described to survive the layering refactor (Resolution A)", () => {
  // pm23: a "rejects before the DB" guard proven by calling the service with NO session
  // breaks once the layering refactor makes the session required (TypeError masks the guard).
  // The fitness analyst must describe such items to inject the session + assert the repository
  // write is never reached, never to omit the session.
  const fit = TEST_ANALYST_CATALOGUE.fitness.focusPrompt;
  it("names the injected session + repository-not-reached technique and warns against omitting the session", () => {
    expect(fit).toMatch(/injected session/i);
    expect(fit).toMatch(/assert-not-called|REPOSITORY WRITE is never reached/i);
    expect(fit, "warns omitting the session masks the guard after the refactor").toMatch(/omitting the session|driver-refactor/i);
  });
});

describe("client: an E2E AC's Playwright spec is named *.spec.ts, never *.e2e.ts (anti silent-skip)", () => {
  // F1 live design run (S1): the client analyst authored e2e scenario_files as `.e2e.ts`, which the
  // scaffold's playwright.config default testMatch (`*.spec.ts`) silently skips, so the deterministic
  // test-list gate (checkTestlistScenarioFileSuffix) bounced a revise lap. The directive (L1) must pin
  // the suffix so the first pass is conformant, in lockstep with that gate + the in-turn self-check.
  const cli = TEST_ANALYST_CATALOGUE.client.focusPrompt;
  it("names the *.spec.ts e2e path and forbids *.e2e.ts (with the testMatch reason)", () => {
    expect(cli).toMatch(/\.spec\.ts/);
    expect(cli, "must forbid the silently-skipped .e2e.ts suffix").toMatch(/NEVER `?\.e2e\.ts/);
    expect(cli, "must explain the testMatch reason").toMatch(/testMatch/i);
  });

  // F1 0.4.7 live run (S1): the client analyst anchored kind:"client" tests to AC2 (architect-tagged
  // API layer) — a mechanism conflict the deterministic checkClientKindLayerCoherence gate caught. The
  // directive scoped client items to UI-presentation ACs but never explicitly forbade a backend-layer
  // anchor; the one-clause sharpening (L1) pins it so the first pass is conformant, in lockstep with the gate.
  it("forbids anchoring a client item to a backend (API/service/Infra)-layer AC and names the gate", () => {
    expect(cli, "must forbid anchoring a client item to a backend-layer AC").toMatch(/NEVER anchor a client item to an `?API/);
    expect(cli, "must name the deterministic gate").toMatch(/checkClientKindLayerCoherence/);
  });
});

describe("fitness: a migration-reversibility test pins to down_revision, never a relative/single-step downgrade", () => {
  // F1 0.4.6 live run (S2): the fitness analyst authored T44 as "a single-step Alembic downgrade" of the
  // add-index migration, which `checkTestlistMigrationRevision` flags (a relative step targets the WRONG
  // migration once head moves). The 0.4.5 fix (A) landed only in navigator.md (the reflect canon), but the
  // AUTHOR is the fitness analyst, so its directive must teach the down_revision pin and NOT the gate-flagged
  // "single-step downgrade" method — in lockstep with the gate (same L1-authoring lesson as the .spec.ts fix).
  const fit = TEST_ANALYST_CATALOGUE.fitness.focusPrompt;
  it("teaches the down_revision pin, drops the single-step-downgrade method, and names the gate", () => {
    expect(fit).toMatch(/down_revision/);
    expect(fit, "must not teach the gate-flagged single-step downgrade as the method").not.toMatch(/single-step downgrade/i);
    expect(fit, "ties the pin to the deterministic gate").toMatch(/checkTestlistMigrationRevision/);
  });
});

describe("resolveTestAnalystKind: fail-loud", () => {
  it("resolves a known kind", () => {
    const e: TestAnalystCatalogueEntry = resolveTestAnalystKind("fitness");
    expect(e.kind).toBe("fitness");
  });
  it("throws on an unknown kind, listing the known kinds sorted", () => {
    expect(() => resolveTestAnalystKind("nope")).toThrowError(/unknown test-analyst kind "nope".*behavior, client, fitness/s);
  });
});

describe("enabledAnalysts: client is gated on uiTrack; behavior + fitness are unconditional", () => {
  it("uiTrack:true enables all three", () => {
    const kinds = enabledAnalysts({ projectDir: "/tmp/p", uiTrack: true }).map((e) => e.kind).sort();
    expect(kinds).toEqual(["behavior", "client", "fitness"]);
  });
  it("uiTrack:false drops client (a no-frontend project gets behavior + fitness only)", () => {
    const kinds = enabledAnalysts({ projectDir: "/tmp/p", uiTrack: false }).map((e) => e.kind).sort();
    expect(kinds).toEqual(["behavior", "fitness"]);
  });
  it("always includes the fitness analyst (a service-backed feature needs >=1 fitness item)", () => {
    for (const uiTrack of [true, false]) {
      expect(enabledAnalysts({ projectDir: "/tmp/p", uiTrack }).some((e) => e.kind === "fitness")).toBe(true);
    }
  });
});
