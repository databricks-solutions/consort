// The UX Designer must GROUND the design guide in the brief's reference sites — navigate to them and
// derive tokens from what it SEES, not write the look from the brief's wording alone. The role prompt
// mandates a `browsed:<site>` provenance event per reference viewed (or `browse-gap:<site>` when one is
// unreachable). Enforced at the SPEC GATE (uxDesignerBrowsedReason, reading the PERSISTED
// .consort/agent-log.jsonl) — NOT as a meta-channel agent-log output validator, which the executor
// skips because the resolved meta path is not the persisted log.

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { uxDesignerBrowsedReason } from "../../consort/gates/gate-conformance-guard";

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

/** Build a project .consort with F1's design/ (brief + optional guide) and an agent-log of ux-designer
 *  reasoning messages. `withGuide`/`withBrief` toggle the design/ artifacts. Returns the consortDir. */
function project(messages: string[], opts: { withGuide?: boolean; withBrief?: boolean } = {}): string {
  const { withGuide = true, withBrief = true } = opts;
  dir = mkdtempSync(join(tmpdir(), "ux-browse-"));
  const consortDir = join(dir, ".consort");
  const designDir = join(consortDir, "features", "F1", "design");
  mkdirSync(designDir, { recursive: true });
  if (withBrief) writeFileSync(join(designDir, "design-brief.md"), "# Brief\n\nTake the look from robinhood.com and wealthfront.com.\n");
  if (withGuide) writeFileSync(join(designDir, "design-guide.json"), JSON.stringify({ typography: {}, colors: { brand: { primary: "#000" } }, spacing: {} }));
  const lines = messages.map((m) =>
    JSON.stringify({ timestamp: "2026-10-11T00:00:00.000Z", level: "debug", role: "ux-designer", event: "reasoning", message: m }),
  );
  writeFileSync(join(consortDir, "agent-log.jsonl"), lines.join("\n") + "\n");
  return consortDir;
}

describe("uxDesignerBrowsedReason (spec-gate condition over the PERSISTED log)", () => {
  it("passes (null) when the log carries a browsed:<site> provenance event", () => {
    const c = project(["browsed:robinhood.com — hero + gain coloring", "browsed:wealthfront.com — calm palette"]);
    expect(uxDesignerBrowsedReason(c, "F1")).toBeNull();
  });

  it("passes (null) when a reference was unreachable and the gap was logged (browse-gap:<site>)", () => {
    const c = project(["browse-gap:fishbowl.com — site failed to load after retry"]);
    expect(uxDesignerBrowsedReason(c, "F1")).toBeNull();
  });

  it("BLOCKS when the guide was authored with no browse provenance (the live incident)", () => {
    const c = project(["wrote design-guide.json; density + layout from the brief's wording"]);
    const r = uxDesignerBrowsedReason(c, "F1");
    expect(r).not.toBeNull();
    expect(r).toMatch(/browsed:|browse-gap:/);
    expect(r).toMatch(/GROUNDED|wording alone/i);
  });

  it("does not fire when there is no design brief (nothing to browse)", () => {
    const c = project(["wrote design-guide.json"], { withBrief: false });
    expect(uxDesignerBrowsedReason(c, "F1")).toBeNull();
  });

  it("does not fire before a design guide exists", () => {
    const c = project(["still drafting"], { withGuide: false });
    expect(uxDesignerBrowsedReason(c, "F1")).toBeNull();
  });
});
