// The REVIEW step runs a deterministic LAYERING gate (checkImportLayering / checkOrmContainment
// against the feature's architecture.json) and, on a boundary->model (or ORM-containment) violation,
// flags the story-scoped `layering-violation` smell — with NO model cooperation. This closes the
// rubber-stamp-review escape: the live S3 review wrote `refactor:false` without running the gate, so
// a layering violation would have shipped. Because `layering-violation` is build-refactor-routable,
// the open smell routes the Driver's REFACTOR even when the verdict said refactor:false. Mirrors the
// ux-adherence review backstop (consort-ux-adherence-review.test.ts).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reviewStory } from "../../consort/pipeline/cycle-record.js";
import { readSmellsLog } from "../../consort/smells/smells.js";

const F = "F1";
const S = "S1";
let proj: string;
let tdd: string;

function writeJson(file: string, obj: unknown): void {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

const ARCH = {
  feature_id: F,
  service_backed: true,
  layers: [
    { name: "routes", role: "boundary", module: "app/routes/", may_import: ["service"] },
    { name: "services", role: "service", module: "app/services/", may_import: ["repository", "models"] },
    { name: "repositories", role: "repository", module: "app/repositories/", may_import: ["models", "infrastructure"] },
    { name: "models", role: "models", module: "app/models/", may_import: [] },
  ],
};

/** An app/ tree whose boundary route either imports the service (clean) or the model (violation). */
function writeApp(violating: boolean): void {
  mkdirSync(join(proj, "app", "routes"), { recursive: true });
  mkdirSync(join(proj, "app", "services"), { recursive: true });
  mkdirSync(join(proj, "app", "repositories"), { recursive: true });
  mkdirSync(join(proj, "app", "models"), { recursive: true });
  writeFileSync(join(proj, "app", "services", "stock_service.py"), "class StockService:\n    pass\n");
  writeFileSync(join(proj, "app", "repositories", "stock_repository.py"), "class StockRepository:\n    pass\n");
  writeFileSync(join(proj, "app", "models", "stock_record.py"), "class StockRecord:\n    pass\n");
  writeFileSync(
    join(proj, "app", "routes", "stock.py"),
    (violating ? "from app.models.stock_record import StockRecord\n" : "from app.services.stock_service import StockService\n") + "router = None\n",
  );
}

const openLayeringSmells = () =>
  readSmellsLog(tdd).detected.filter((d) => d.smell === "layering-violation" && !d.resolution);

beforeEach(() => {
  proj = mkdtempSync(join(tmpdir(), "layer-review-"));
  tdd = join(proj, ".sftdd");
  writeJson(join(tdd, "features", F, "stories", S, "acs", "AC1.json"), { id: "AC1", layer: "API" });
  writeJson(join(tdd, "features", F, "architecture.json"), ARCH);
});
afterEach(() => rmSync(proj, { recursive: true, force: true }));

describe("reviewStory flags layering-violation on a boundary->model violation (deterministic backstop)", () => {
  it("writes the story-scoped layering-violation smell when the route imports a model", () => {
    writeApp(true);
    reviewStory(tdd, F, S);
    const hits = openLayeringSmells();
    expect(hits.length).toBe(1);
    expect(hits[0].story_id).toBe(S);
    expect(hits[0].detail).toMatch(/boundary may not import models|import layering|layering-clean/i);
  });

  it("writes nothing when the route imports only the service (clean)", () => {
    writeApp(false);
    reviewStory(tdd, F, S);
    expect(openLayeringSmells().length).toBe(0);
  });

  it("is idempotent (no double-write on a repeat review)", () => {
    writeApp(true);
    reviewStory(tdd, F, S);
    reviewStory(tdd, F, S);
    expect(openLayeringSmells().length).toBe(1);
  });

  it("writes nothing for a non-service-backed feature (architecture exempt)", () => {
    writeApp(true);
    writeJson(join(tdd, "features", F, "architecture.json"), { ...ARCH, service_backed: false });
    reviewStory(tdd, F, S);
    expect(openLayeringSmells().length).toBe(0);
  });

  it("writes nothing when the feature has no architecture.json", () => {
    writeApp(true);
    rmSync(join(tdd, "features", F, "architecture.json"), { force: true });
    reviewStory(tdd, F, S);
    expect(openLayeringSmells().length).toBe(0);
  });
});
