// consort-preflight composes the pre-session state blob from fast LOCAL sources so
// `/start` opens the session already knowing kit version, project phase + next action,
// telemetry state, SCM branch, and the first-project marker - instead of discovering
// them through a dozen ad-hoc probes. The contract these guards pin: it NEVER throws
// (every source best-effort), it reads the drive's `.consort/next.json` stop-state for
// the project signal, and it honors XDG_CONFIG_HOME for telemetry + the marker.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildPreflight, isPreflightStale } from "../../consort/session/preflight";

let proj: string;
let cfgHome: string;

beforeEach(() => {
  proj = mkdtempSync(join(tmpdir(), "preflight-proj-"));
  cfgHome = mkdtempSync(join(tmpdir(), "preflight-cfg-"));
});
afterEach(() => {
  for (const d of [proj, cfgHome]) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

const deps = () => ({ env: { XDG_CONFIG_HOME: cfgHome } as NodeJS.ProcessEnv, home: cfgHome });

describe("buildPreflight: best-effort, never throws", () => {
  it("returns the full shape on a BARE dir (no .consort, no git, no config) without throwing", () => {
    const b = buildPreflight(proj, deps());
    expect(b.preflight_at).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(b.project.is_consort).toBe(false);
    expect(b.project.phase).toBeNull();
    expect(b.project.awaiting_human).toBeNull();
    expect(b.telemetry.acknowledged).toBe(false);
    expect(b.scm.branch).toBeNull(); // not a git repo
    expect(b.first_project.offered_before).toBe(false);
    expect(Array.isArray(b.warnings)).toBe(true);
  });

  it("reads the drive's .consort/next.json stop-state for the project signal", () => {
    mkdirSync(join(proj, ".consort"), { recursive: true });
    writeFileSync(
      join(proj, ".consort", "next.json"),
      JSON.stringify({
        awaiting_human: true,
        feature: "F1-manage-positions",
        primary_action: { kind: "gate" },
        state: { coarse_phase: "feature", derived_phase: "design" },
      }),
    );
    const b = buildPreflight(proj, deps());
    expect(b.project.is_consort).toBe(true);
    expect(b.project.awaiting_human).toBe(true);
    expect(b.project.feature).toBe("F1-manage-positions");
    expect(b.project.next_action).toBe("gate");
    expect(b.project.phase).toBe("design");
  });

  it("reads the committed + run-local kit pins", () => {
    mkdirSync(join(proj, ".lakebase"), { recursive: true });
    writeFileSync(join(proj, ".lakebase", "kit-ref"), "v0.3.80\n");
    writeFileSync(join(proj, ".lakebase", "kit-ref.local"), "v0.3.81\n");
    const b = buildPreflight(proj, deps());
    expect(b.kit.ref).toBe("v0.3.80");
    expect(b.kit.ref_local).toBe("v0.3.81");
    // kit.version comes from kitVersion() (a semver in the installed/dist kit, or the
    // "unknown" fallback when the package root is unresolvable from source) - always a string.
    expect(typeof b.kit.version).toBe("string");
    expect(b.kit.version.length).toBeGreaterThan(0);
  });

  it("reads the telemetry acknowledged flag under XDG_CONFIG_HOME", () => {
    mkdirSync(join(cfgHome, "consort"), { recursive: true });
    writeFileSync(
      join(cfgHome, "consort", "telemetry.json"),
      JSON.stringify({ acknowledged: true, telemetry_level: 2, install_id: "11111111-1111-4111-8111-111111111111" }),
    );
    const b = buildPreflight(proj, deps());
    expect(b.telemetry.acknowledged).toBe(true);
    expect(b.telemetry.level).toBe(2);
  });

  it("detects the first-project marker under XDG_CONFIG_HOME", () => {
    mkdirSync(join(cfgHome, "consort"), { recursive: true });
    writeFileSync(join(cfgHome, "consort", "first-project-offered"), "");
    expect(buildPreflight(proj, deps()).first_project.offered_before).toBe(true);
  });

  it("sniffs an IDE terminal from env markers", () => {
    const b = buildPreflight(proj, { env: { XDG_CONFIG_HOME: cfgHome, TERM_PROGRAM: "vscode" } as NodeJS.ProcessEnv, home: cfgHome });
    expect(b.env.inside_editor).toBe(true);
    expect(buildPreflight(proj, deps()).env.inside_editor).toBe(false);
  });

  it("tolerates a corrupt next.json (records a warning, does not throw)", () => {
    mkdirSync(join(proj, ".consort"), { recursive: true });
    writeFileSync(join(proj, ".consort", "next.json"), "{ not json");
    const b = buildPreflight(proj, deps());
    expect(b.project.is_consort).toBe(true);
    expect(b.project.awaiting_human).toBeNull();
    expect(b.warnings.some((w) => /next\.json/.test(w))).toBe(true);
  });
});

describe("isPreflightStale", () => {
  const now = Date.parse("2026-09-09T12:00:00.000Z");
  it("is fresh within the window and stale past it", () => {
    expect(isPreflightStale({ preflight_at: "2026-09-09T11:59:00.000Z" }, 5 * 60_000, now)).toBe(false);
    expect(isPreflightStale({ preflight_at: "2026-09-09T11:50:00.000Z" }, 5 * 60_000, now)).toBe(true);
  });
  it("treats an unparseable timestamp as stale", () => {
    expect(isPreflightStale({ preflight_at: "not-a-date" }, 5 * 60_000, now)).toBe(true);
  });
});
