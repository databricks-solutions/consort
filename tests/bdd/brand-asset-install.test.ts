// The deterministic brand-icon install: the staged intake asset (a binary PNG) must
// land at the design-guide's `install_to` (e.g. client/public/warehouse.png) with its
// REAL bytes – a coding agent can't `cp` a binary via text writes, so without this the
// built app ships a placeholder even though the icon is declared + referenced. This is
// the fix for "the built app still does not incorporate warehouse.png".

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installBrandAsset } from "../../consort/architecture/design-adherence.js";

const ICON = { source: "intake/assets/warehouse.png", install_to: "client/public/warehouse.png" };

describe("installBrandAsset – deterministic binary brand-icon install", () => {
  let proj: string;
  let consort: string;
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), "brand-"));
    consort = join(proj, ".consort");
    mkdirSync(join(consort, "design", "assets"), { recursive: true });
  });
  afterEach(() => rmSync(proj, { recursive: true, force: true }));

  it("copies the staged design asset's REAL bytes to install_to (creating dirs)", () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]); // PNG-ish
    writeFileSync(join(consort, "design", "assets", "warehouse.png"), bytes);
    const ok = installBrandAsset(proj, consort, ICON);
    expect(ok).toBe(true);
    const dest = join(proj, "client", "public", "warehouse.png");
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest).equals(bytes)).toBe(true); // real bytes, not a text placeholder
  });

  it("OVERWRITES a driver-written placeholder with the real staged asset", () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9]);
    writeFileSync(join(consort, "design", "assets", "warehouse.png"), bytes);
    const dest = join(proj, "client", "public", "warehouse.png");
    mkdirSync(join(proj, "client", "public"), { recursive: true });
    writeFileSync(dest, "placeholder"); // what a driver might write to pass the "exists" check
    installBrandAsset(proj, consort, ICON);
    expect(readFileSync(dest).equals(bytes)).toBe(true);
  });

  it("returns false + installs nothing when no staged source exists (the gate then flags it)", () => {
    const ok = installBrandAsset(proj, consort, ICON);
    expect(ok).toBe(false);
    expect(existsSync(join(proj, "client", "public", "warehouse.png"))).toBe(false);
  });
});
