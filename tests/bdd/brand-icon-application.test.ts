// BDD coverage for deterministic brand-icon application: the design-guide's brand
// icon must be INSTALLED (bytes) AND REFERENCED (index.html favicon link)
// deterministically – never left to the driver to hand-wire (the stockflow S1 gap:
// bytes installed, placeholder reference shipped, smell waived).

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { applyBrandIconReference } from "../../consort/pipeline/cycle-record.js";

const tmpDirs: string[] = [];
function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-icon-app-"));
  tmpDirs.push(dir);
  return dir;
}
function writeIndex(dir: string, body: string): string {
  const p = path.join(dir, "client", "index.html");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  return p;
}
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
});

const INSTALL_TO = "client/public/warehouse.png";

describe("applyBrandIconReference", () => {
  it("rewrites an existing favicon <link> to the installed basename (placeholder -> brand)", () => {
    const dir = mkProject();
    const p = writeIndex(dir, `<!doctype html><html><head><link rel="icon" type="image/svg+xml" href="/favicon.svg" /></head><body></body></html>`);
    expect(applyBrandIconReference(dir, INSTALL_TO)).toBe(true);
    const html = fs.readFileSync(p, "utf8");
    expect(html).toContain('href="/warehouse.png"');
    expect(html).not.toContain('href="/favicon.svg"');
  });

  it("inserts the link when index.html has no favicon link", () => {
    const dir = mkProject();
    const p = writeIndex(dir, `<!doctype html><html><head><title>x</title></head><body></body></html>`);
    expect(applyBrandIconReference(dir, INSTALL_TO)).toBe(true);
    const html = fs.readFileSync(p, "utf8");
    expect(html).toContain('<link rel="icon" href="/warehouse.png" />');
  });

  it("is idempotent (a correct href is a no-op) and returns false without an index.html", () => {
    const dir = mkProject();
    const p = writeIndex(dir, `<!doctype html><html><head><link rel="icon" href="/warehouse.png" /></head><body></body></html>`);
    const before = fs.readFileSync(p, "utf8");
    applyBrandIconReference(dir, INSTALL_TO);
    expect(fs.readFileSync(p, "utf8")).toBe(before);
    expect(applyBrandIconReference(mkProject(), INSTALL_TO)).toBe(false);
  });
});
