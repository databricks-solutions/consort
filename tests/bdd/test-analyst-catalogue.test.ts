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
