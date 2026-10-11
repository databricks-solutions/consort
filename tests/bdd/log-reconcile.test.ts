///7422: per-role logging is prose-instructed, so a role model can do
// the substantive work (write story stubs + ACs) while emitting no
// `artifact.written` events. We saw exactly that when the spec-author was tiered
// to sonnet: 5 ACs on disk, zero log events. reconcileArtifactLog makes
// observability of the design phase STRUCTURAL instead of model-dependent: it
// scans the feature's artifacts on disk and emits an `artifact.written` event
// for every one the log does not already cover. Deterministic + idempotent.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { reconcileArtifactLog } from "../../consort/logging/log-reconcile";
import { readAgentLog, emitAgentLogEvent } from "../../consort/logging/agent-log";

const tmps: string[] = [];
afterEach(() => {
  while (tmps.length) { const d = tmps.pop(); if (d) try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } }
});
function mkTdd(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-recon-"));
  tmps.push(root);
  return path.join(root, ".tdd");
}
const F = "F1-initial-domain";
function write(p: string, body = "{}"): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}
function scaffoldFeature(consortDir: string): void {
  const f = path.join(consortDir, "features", F);
  write(path.join(f, "feature-spec.json"));
  write(path.join(f, "stories", "S1", "story.json"));
  write(path.join(f, "stories", "S1", "acs", "AC1.json"));
  write(path.join(f, "stories", "S1", "acs", "AC2.json"));
  write(path.join(f, "stories", "S2", "story.json"));
}

describe("reconcileArtifactLog", () => {
  it("emits an artifact.written for every on-disk artifact the log does not cover", () => {
    const consortDir = mkTdd();
    scaffoldFeature(consortDir);

    const emitted = reconcileArtifactLog({ consortDir, featureId: F });

    const paths = emitted.map((e) => e.metadata?.path).sort();
    expect(paths).toEqual([
      `features/${F}/feature-spec.json`,
      `features/${F}/stories/S1/acs/AC1.json`,
      `features/${F}/stories/S1/acs/AC2.json`,
      `features/${F}/stories/S1/story.json`,
      `features/${F}/stories/S2/story.json`,
    ]);
    // All attributed to the spec-author (the owner of spec/story/AC artifacts),
    // tagged reconciled so they are distinguishable from a role's own emits.
    expect(emitted.every((e) => e.role === "spec-author")).toBe(true);
    expect(emitted.every((e) => e.event === "artifact.written" && e.metadata?.reconciled === true)).toBe(true);
    // The events are actually on disk in the log.
    expect(readAgentLog({ consortDir, featureId: F }).length).toBe(5);
  });

  it("is idempotent: a second reconcile emits nothing", () => {
    const consortDir = mkTdd();
    scaffoldFeature(consortDir);
    reconcileArtifactLog({ consortDir, featureId: F });
    const second = reconcileArtifactLog({ consortDir, featureId: F });
    expect(second).toEqual([]);
  });

  it("does not duplicate an artifact a role already logged (exact path)", () => {
    const consortDir = mkTdd();
    scaffoldFeature(consortDir);
    // The spec-author DID log AC1 itself.
    emitAgentLogEvent(
      { role: "spec-author", level: "info", event: "artifact.written",
        feature_id: F, slots: { artifact: "AC1", summary: "authored", path: `features/${F}/stories/S1/acs/AC1.json` } },
      { consortDir },
    );
    const emitted = reconcileArtifactLog({ consortDir, featureId: F });
    expect(emitted.map((e) => e.metadata?.path)).not.toContain(`features/${F}/stories/S1/acs/AC1.json`);
    expect(emitted.length).toBe(4); // the other four artifacts
  });

  it("attributes architecture + db-design + test-list to their owning roles", () => {
    const consortDir = mkTdd();
    const f = path.join(consortDir, "features", F);
    write(path.join(f, "architecture.json"));
    write(path.join(f, "db-design.json"));
    write(path.join(f, "test-list.json"));
    const emitted = reconcileArtifactLog({ consortDir, featureId: F });
    const byPath = Object.fromEntries(emitted.map((e) => [e.metadata?.path, e.role]));
    expect(byPath[`features/${F}/architecture.json`]).toBe("architect-reviewer");
    // db-design.json was previously NOT discovered, so a dba turn left no artifact.written trace.
    expect(byPath[`features/${F}/db-design.json`]).toBe("dba");
    expect(byPath[`features/${F}/test-list.json`]).toBe("test-strategist");
  });

  it("reconciles the ux-designer's PROJECT-level design system (.tdd/design/), not the feature dir", () => {
    // Regression: the ux-designer writes design-guide.{md,json} + ia.md to
    // .tdd/design/ (project-level; designGuideReady probes there too), but
    // reconcile looked under .tdd/features/<F>/ – so a ux-designer turn logged a
    // phase.start with NO artifact.written for what it produced.
    const consortDir = mkTdd();
    write(path.join(consortDir, "features", F, "feature-spec.json")); // the drive's feature dir exists
    write(path.join(consortDir, "design", "design-guide.json"));
    write(path.join(consortDir, "design", "design-guide.md"), "# guide");
    write(path.join(consortDir, "design", "ia.md"), "# ia");
    const emitted = reconcileArtifactLog({ consortDir, featureId: F });
    const byPath = Object.fromEntries(emitted.map((e) => [e.metadata?.path, e.role]));
    expect(byPath["design/design-guide.json"]).toBe("ux-designer");
    expect(byPath["design/design-guide.md"]).toBe("ux-designer");
    expect(byPath["design/ia.md"]).toBe("ux-designer");
  });

  it("returns [] for a feature with no artifacts yet", () => {
    const consortDir = mkTdd();
    expect(reconcileArtifactLog({ consortDir, featureId: F })).toEqual([]);
  });

  it("establishes project architecture conventions from a service-backed architecture.json AND code-emits the architect's layout decision (fixes architect silence)", () => {
    // The architect runs but its substantive output – the canonical role -> module
    // layout – otherwise left no trace in the log (only a phase.start). reconcile
    // deterministically derives the project conventions from architecture.json and
    // emits the decision as a `reasoning` event attributed to the architect, so a
    // model that emits nothing still produces an observable, structural record.
    const consortDir = mkTdd();
    const f = path.join(consortDir, "features", F);
    write(
      path.join(f, "architecture.json"),
      JSON.stringify({
        service_backed: true,
        layers: [
          { role: "boundary", module: "app/routes/" },
          { role: "service", module: "app/services/" },
          { role: "repository", module: "app/repositories/" },
        ],
      }),
    );
    const emitted = reconcileArtifactLog({ consortDir, featureId: F });

    // conventions.json was established on disk.
    expect(fs.existsSync(path.join(consortDir, "architecture", "conventions.json"))).toBe(true);
    // A code-emitted architect `reasoning` event names the established layout.
    const reasoning = emitted.find((e) => e.event === "reasoning" && e.role === "architect-reviewer");
    expect(reasoning, "expected an architect-reviewer reasoning event").toBeTruthy();
    expect((reasoning!.metadata as { note?: string })?.note).toMatch(
      /established project architecture conventions:.*boundary=app\/routes.*service=app\/services.*repository=app\/repositories/,
    );
    // The conventions.json is itself reconciled as an architect artifact.
    const byPath = Object.fromEntries(emitted.map((e) => [e.metadata?.path, e.role]));
    expect(byPath["architecture/conventions.json"]).toBe("architect-reviewer");

    // Idempotent: a second reconcile re-establishes nothing + re-emits no reasoning.
    const second = reconcileArtifactLog({ consortDir, featureId: F });
    expect(second.find((e) => e.event === "reasoning")).toBeFalsy();
  });

  it("establishes the project architecture CANON (NFR posture + AC layers + invariant patterns) and code-emits it", () => {
    // The cross-cutting sibling of conventions: the first service-backed feature's
    // standing decisions become the project canon, deterministically + observably.
    const consortDir = mkTdd();
    const f = path.join(consortDir, "features", F);
    write(
      path.join(f, "architecture.json"),
      JSON.stringify({
        service_backed: true,
        nfrs: [{ category: "performance", requirement: "list endpoints paginate" }],
        persistence_invariants: [{ id: "PI1", type: "unique", table: "stock", brief: "(sku, location) unique" }],
      }),
    );
    // Two ACs on disk with layers, so featureAcLayers picks them up.
    write(path.join(f, "stories", "S1", "acs", "AC1.json"), JSON.stringify({ id: "AC1", layer: "API" }));
    write(path.join(f, "stories", "S1", "acs", "AC2.json"), JSON.stringify({ id: "AC2", layer: "Infra" }));

    const emitted = reconcileArtifactLog({ consortDir, featureId: F });

    // canon.json established on disk.
    expect(fs.existsSync(path.join(consortDir, "architecture", "canon.json"))).toBe(true);
    const canon = JSON.parse(fs.readFileSync(path.join(consortDir, "architecture", "canon.json"), "utf8"));
    expect(canon.ac_layers.sort()).toEqual(["API", "Infra"]);
    expect(canon.nfr_posture).toEqual([{ category: "performance", requirement: "list endpoints paginate" }]);
    expect(canon.invariant_patterns.map((p: { type: string }) => p.type)).toEqual(["unique"]);
    // A code-emitted architect reasoning event names the established canon.
    const reasoning = emitted.find(
      (e) => e.event === "reasoning" && (e.metadata as { note?: string })?.note?.includes("architecture canon"),
    );
    expect(reasoning, "expected a canon reasoning event").toBeTruthy();

    // Idempotent: a second reconcile establishes + emits nothing new for the canon.
    const second = reconcileArtifactLog({ consortDir, featureId: F });
    expect(second.find((e) => (e.metadata as { note?: string })?.note?.includes("architecture canon"))).toBeFalsy();
  });
});
