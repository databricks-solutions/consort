// Project-level architecture CANON (FEIP-7902): the FIRST service-backed feature's
// cross-cutting standing decisions (NFR posture, AC layers, persistence-invariant
// patterns) become the project canon, persisted under .tdd/architecture/canon.json.
// A later story that maps onto the canon is PROJECTED deterministically (no
// architect turn); a story that introduces a new dimension is NOVEL and the canon
// grows via amendCanon. Pure module, so these are hermetic.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  readCanon,
  canonReady,
  deriveCanon,
  establishCanonIfAbsent,
  amendCanon,
  architectNovelty,
  projectArchitecturalNotes,
  projectStoryNotes,
  writeCanon,
  type ArchitectureCanon,
} from "../../consort/architecture/architecture-canon.js";
import { diskArtifactProbe } from "../../consort/orchestrator/state/orchestrator-probe.js";

let tdd: string;
const NOW = () => new Date("2026-07-08T00:00:00.000Z");

const ARCH = JSON.stringify({
  feature_id: "F1-stock-visibility",
  service_backed: true,
  nfrs: [
    { category: "performance", requirement: "list endpoints paginate", hil_status: "accepted" },
    { category: "security", requirement: "writes are authz-checked" },
    { category: "performance", requirement: "list endpoints paginate" }, // dup -> deduped
  ],
  persistence_invariants: [
    { id: "PI1", type: "unique", table: "stock", brief: "(sku, location) is unique" },
    { id: "PI2", type: "foreign_key", table: "stock", brief: "location_id -> locations.id" },
    { id: "PI3", type: "unique", table: "sku", brief: "sku code unique" }, // dup type -> one rep
  ],
});

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-arch-canon-"));
});
afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("deriveCanon: project the standing canon from architecture.json + ACs", () => {
  it("projects NFR posture (deduped), invariant patterns (one per type), and AC layers", () => {
    const c = deriveCanon(ARCH, ["API", "Infra", "API"], "F1-stock-visibility", NOW)!;
    expect(c.established_by).toBe("F1-stock-visibility");
    expect(c.established_at).toBe("2026-07-08T00:00:00.000Z");
    expect(c.ac_layers).toEqual(["API", "Infra"]);
    expect(c.nfr_posture).toEqual([
      { category: "performance", requirement: "list endpoints paginate" },
      { category: "security", requirement: "writes are authz-checked" },
    ]);
    expect(c.invariant_patterns).toEqual([
      { type: "unique", brief: "(sku, location) is unique" },
      { type: "foreign_key", brief: "location_id -> locations.id" },
    ]);
  });

  it("captures NFR posture when the text is in `statement` or `brief`, not `requirement` (field-drift tolerance)", () => {
    // The architect agent writes the requirement text as `statement`; the schema prefers `brief`
    // (legacy `requirement`). deriveCanon must read all three or it drops the NFR from the posture —
    // the drift that left canon nfr_posture empty despite a feature declaring rich NFRs.
    const arch = JSON.stringify({
      feature_id: "F1",
      service_backed: true,
      nfrs: [
        { category: "data-integrity", statement: "stock survives migrations" }, // agent's field
        { category: "usability", brief: "validation names the field" }, // schema-preferred field
        { category: "performance", requirement: "list endpoints paginate" }, // legacy field
      ],
    });
    const c = deriveCanon(arch, ["API"], "F1", NOW)!;
    expect(c.nfr_posture).toEqual([
      { category: "data-integrity", requirement: "stock survives migrations" },
      { category: "usability", requirement: "validation names the field" },
      { category: "performance", requirement: "list endpoints paginate" },
    ]);
  });

  it("returns undefined for a non-service-backed feature (nothing standing to pin)", () => {
    expect(deriveCanon(JSON.stringify({ service_backed: false }), ["API"], "F1", NOW)).toBeUndefined();
  });

  it("returns undefined for malformed architecture.json", () => {
    expect(deriveCanon("{not json", ["API"], "F1", NOW)).toBeUndefined();
  });
});

describe("establishCanonIfAbsent: establish once, then inherit (idempotent)", () => {
  it("writes canon.json the first time, is a no-op after (never overwrites)", () => {
    expect(canonReady(tdd)).toBe(false);
    const first = establishCanonIfAbsent(tdd, "F1-stock-visibility", ARCH, ["API", "Infra"], NOW);
    expect(first.established).toBe(true);
    expect(canonReady(tdd)).toBe(true);
    expect(readCanon(tdd)!.established_by).toBe("F1-stock-visibility");

    // A later service-backed feature does NOT clobber the established canon.
    const second = establishCanonIfAbsent(
      tdd,
      "F2-other",
      JSON.stringify({ service_backed: true, nfrs: [], persistence_invariants: [] }),
      ["API"],
      NOW,
    );
    expect(second.established).toBe(false);
    expect(readCanon(tdd)!.established_by).toBe("F1-stock-visibility");
  });

  it("is a no-op for a non-service-backed first feature (canon waits)", () => {
    const r = establishCanonIfAbsent(tdd, "F1", JSON.stringify({ service_backed: false }), ["API"], NOW);
    expect(r.established).toBe(false);
    expect(canonReady(tdd)).toBe(false);
  });
});

describe("amendCanon: grow the canon from a novelty turn (deduped, origin preserved)", () => {
  it("adds new AC layers, NFRs, and invariant patterns without duplicating existing ones", () => {
    const base = deriveCanon(ARCH, ["API", "Infra"], "F1-stock-visibility", NOW)!;
    const grown = amendCanon(base, {
      ac_layers: ["E2E", "API"], // API already present
      nfr_posture: [
        { category: "performance", requirement: "list endpoints paginate" }, // dup
        { category: "observability", requirement: "audit every mutation" }, // new
      ],
      invariant_patterns: [
        { type: "unique", brief: "ignored, type already present" },
        { type: "check", brief: "quantity >= 0" }, // new
      ],
    });
    expect(grown.established_by).toBe("F1-stock-visibility"); // origin preserved
    expect(grown.ac_layers).toEqual(["API", "Infra", "E2E"]);
    expect(grown.nfr_posture.map((n) => n.category)).toEqual(["performance", "security", "observability"]);
    expect(grown.invariant_patterns.map((p) => p.type)).toEqual(["unique", "foreign_key", "check"]);
  });
});

describe("architectNovelty: project-or-dispatch decision", () => {
  let canon: ArchitectureCanon;
  beforeEach(() => {
    canon = deriveCanon(ARCH, ["API", "Infra"], "F1-stock-visibility", NOW)!;
  });

  it("NOT novel when every AC layer is known and no new architecture dimension", () => {
    const r = architectNovelty(canon, [{ layer: "API" }, { layer: "Infra" }]);
    expect(r.novel).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it("novel on an AC layer the canon has not classified", () => {
    const r = architectNovelty(canon, [{ layer: "API" }, { layer: "E2E" }]);
    expect(r.novel).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/AC layer "E2E"/);
  });

  it("novel on a new persistence-invariant type in the story's architecture.json", () => {
    const storyArch = JSON.stringify({
      service_backed: true,
      persistence_invariants: [{ id: "PIx", type: "check", brief: "qty >= 0" }],
    });
    const r = architectNovelty(canon, [{ layer: "Infra" }], storyArch);
    expect(r.novel).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/invariant.*"check"/);
  });

  it("novel on a new NFR category in the story's architecture.json", () => {
    const storyArch = JSON.stringify({
      service_backed: true,
      nfrs: [{ category: "resilience", requirement: "retry on transient failure" }],
    });
    const r = architectNovelty(canon, [{ layer: "API" }], storyArch);
    expect(r.novel).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/NFR category "resilience"/);
  });

  it("NOT novel when the story's architecture.json only reuses known dimensions", () => {
    const storyArch = JSON.stringify({
      service_backed: true,
      nfrs: [{ category: "performance", requirement: "list endpoints paginate" }],
      persistence_invariants: [{ id: "PIy", type: "foreign_key", brief: "fk" }],
    });
    const r = architectNovelty(canon, [{ layer: "API" }], storyArch);
    expect(r.novel).toBe(false);
  });
});

describe("projectArchitecturalNotes: deterministic per-AC note for the common case", () => {
  it("names the layer, the inherited posture, and the canon provenance", () => {
    const canon = deriveCanon(ARCH, ["API", "Infra"], "F1-stock-visibility", NOW)!;
    const note = projectArchitecturalNotes(canon, { layer: "API" })!;
    expect(note).toMatch(/Layer API/);
    expect(note).toMatch(/canon established by F1-stock-visibility/);
    expect(note).toMatch(/performance, security/); // posture categories
    expect(note).toMatch(/Projected deterministically/);
  });

  it("returns undefined for an AC with no layer to anchor on", () => {
    const canon = deriveCanon(ARCH, ["API"], "F1", NOW)!;
    expect(projectArchitecturalNotes(canon, {})).toBeUndefined();
  });
});

// --- Phase 3: project-or-dispatch on disk ----------------------------------

const F = "F2-later";
function writeAc(story: string, acId: string, extra: Record<string, unknown> = {}): void {
  const dir = join(tdd, "features", F, "stories", story, "acs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${acId}.json`), JSON.stringify({ id: acId, layer: "API", ...extra }));
}
function writeFeatureArch(): void {
  const dir = join(tdd, "features", F);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "architecture.json"), JSON.stringify({ feature_id: F, service_backed: true, nfrs: [] }));
}
function establishedCanon(): ArchitectureCanon {
  const c = deriveCanon(ARCH, ["API", "Infra"], "F1-stock-visibility", NOW)!;
  writeCanon(tdd, c);
  return c;
}

describe("projectStoryNotes: write per-AC notes from the canon (idempotent)", () => {
  it("annotates ACs missing notes, and never clobbers an existing annotation", () => {
    establishedCanon();
    writeAc("S1", "AC1");
    writeAc("S1", "AC2", { architectural_notes: "hand-authored by the architect – keep me" });

    const n = projectStoryNotes(tdd, F, "S1");
    expect(n).toBe(1); // only AC1 was missing notes

    const ac1 = JSON.parse(readFileSync(join(tdd, "features", F, "stories", "S1", "acs", "AC1.json"), "utf8"));
    expect(ac1.architectural_notes).toMatch(/Layer API.*canon established by F1-stock-visibility/);
    const ac2 = JSON.parse(readFileSync(join(tdd, "features", F, "stories", "S1", "acs", "AC2.json"), "utf8"));
    expect(ac2.architectural_notes).toBe("hand-authored by the architect – keep me");

    // Idempotent: a second pass annotates nothing new.
    expect(projectStoryNotes(tdd, F, "S1")).toBe(0);
  });

  it("is a no-op with no canon established", () => {
    writeAc("S1", "AC1");
    expect(projectStoryNotes(tdd, F, "S1")).toBe(0);
  });
});

describe("diskArtifactProbe.architectProjectable: the project-or-dispatch decision", () => {
  it("false when no canon is established yet (first feature dispatches the architect)", () => {
    writeFeatureArch();
    writeAc("S1", "AC1");
    expect(diskArtifactProbe(tdd, F).architectProjectable("S1")).toBe(false);
  });

  it("false when the feature architecture.json does not exist yet", () => {
    establishedCanon();
    writeAc("S1", "AC1");
    expect(diskArtifactProbe(tdd, F).architectProjectable("S1")).toBe(false);
  });

  it("true when arch.json + canon exist and the story is not novel (maps onto known layers)", () => {
    establishedCanon();
    writeFeatureArch();
    writeAc("S1", "AC1"); // layer API is in the canon
    expect(diskArtifactProbe(tdd, F).architectProjectable("S1")).toBe(true);
  });

  it("false when the story is NOVEL (an AC layer the canon has not classified)", () => {
    // Canon knows API + Infra; an E2E AC is novel -> dispatch the architect.
    establishedCanon();
    writeFeatureArch();
    writeAc("S1", "AC1", { layer: "E2E" });
    expect(diskArtifactProbe(tdd, F).architectProjectable("S1")).toBe(false);
  });
});
