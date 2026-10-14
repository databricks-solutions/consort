// consort-layering-clean must FAIL-CLOSED when run with only --project-dir: it auto-resolves the
// in-flight feature's architecture.json and actually runs the import-layering check, instead of
// silently reporting "not service-backed" and skipping it. That silent skip was the live gap where
// a boundary->model layering violation shipped because the per-turn directive ran the gate with no
// --architecture. These spawn the real self-executing CLI against temp fixtures.

import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../../bin/consort/layering-clean.cli.ts", import.meta.url));
const tmpDirs: string[] = [];

function run(projectDir: string): { code: number; out: string } {
  // The CLI writes its status/auto-resolve lines to STDERR, so capture both streams on
  // success AND failure (spawnSync returns both regardless of exit code).
  const r = spawnSync("npx", ["tsx", CLI, "--project-dir", projectDir], { encoding: "utf8" });
  return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

const ARCH = {
  feature_id: "F1",
  service_backed: true,
  layers: [
    { name: "routes", role: "boundary", module: "app/routes/", renders_via: "react", may_import: ["service"] },
    { name: "services", role: "service", module: "app/services/", may_import: ["repository", "models"] },
    { name: "repositories", role: "repository", module: "app/repositories/", may_import: ["models", "infrastructure"] },
    { name: "models", role: "models", module: "app/models/", may_import: [] },
  ],
};

/** A temp project with .consort/features/<F>/architecture.json + an optional boundary->model violation. */
function project(features: Array<{ id: string; violating: boolean }>, opts: { nextFeature?: string } = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "layer-ar-"));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, "app", "routes"), { recursive: true });
  fs.mkdirSync(path.join(dir, "app", "services"), { recursive: true });
  fs.mkdirSync(path.join(dir, "app", "repositories"), { recursive: true });
  fs.mkdirSync(path.join(dir, "app", "models"), { recursive: true });
  fs.writeFileSync(path.join(dir, "app", "services", "stock_service.py"), "class StockService:\n    pass\n");
  fs.writeFileSync(path.join(dir, "app", "repositories", "stock_repository.py"), "class StockRepository:\n    pass\n");
  fs.writeFileSync(path.join(dir, "app", "models", "stock_record.py"), "class StockRecord:\n    pass\n");
  const anyViolating = features.some((f) => f.violating);
  fs.writeFileSync(
    path.join(dir, "app", "routes", "stock.py"),
    (anyViolating ? "from app.models.stock_record import StockRecord\n" : "from app.services.stock_service import StockService\n") +
      "router = None\n",
  );
  for (const f of features) {
    const fdir = path.join(dir, ".consort", "features", f.id);
    fs.mkdirSync(fdir, { recursive: true });
    fs.writeFileSync(path.join(fdir, "architecture.json"), JSON.stringify({ ...ARCH, feature_id: f.id }));
  }
  if (opts.nextFeature) fs.writeFileSync(path.join(dir, ".consort", "next.json"), JSON.stringify({ feature: opts.nextFeature }));
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d) try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe("consort-layering-clean auto-resolves architecture.json (fail-closed)", () => {
  it("bare --project-dir on a single-feature project auto-resolves + CATCHES a boundary->model violation", () => {
    const r = run(project([{ id: "F1", violating: true }]));
    expect(r.out).toMatch(/auto-resolved/);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/boundary may not import models|import layering/i);
  });

  it("bare --project-dir on a clean single-feature project auto-resolves + PASSES (check actually ran)", () => {
    const r = run(project([{ id: "F1", violating: false }]));
    expect(r.out).toMatch(/auto-resolved/);
    expect(r.code).toBe(0);
  });

  it("a project with NO feature architecture stays exempt (genuinely architecture-less), exit 0", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "layer-ar-noarch-"));
    tmpDirs.push(dir);
    fs.mkdirSync(path.join(dir, ".consort"), { recursive: true });
    fs.mkdirSync(path.join(dir, "app"), { recursive: true });
    const r = run(dir);
    expect(r.code).toBe(0);
    expect(r.out).not.toMatch(/auto-resolved/);
  });

  it("AMBIGUOUS (two feature architectures, no next.json) warns 'layering NOT checked' and does NOT false-fail", () => {
    const r = run(project([{ id: "F1", violating: true }, { id: "F2", violating: true }]));
    expect(r.out).toMatch(/layering NOT checked/i);
    // fail-closed on the resolution (we didn't check), but no false "clean" and no false "fail" either
    expect(r.out).not.toMatch(/auto-resolved/);
  });

  it("AMBIGUOUS but next.json names the in-flight feature -> resolves it + checks", () => {
    const r = run(project([{ id: "F1", violating: true }, { id: "F2", violating: false }], { nextFeature: "F1" }));
    expect(r.out).toMatch(/auto-resolved.*F1/);
    expect(r.code).not.toBe(0);
  });
});
