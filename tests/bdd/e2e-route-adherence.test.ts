// Guard for the E2E route-glob<->module collision that dead-locks a UI build (stockflow-3-88
// T20): page.route("**/api/stock**", ...) also matches the app's own /src/api/stock.ts module
// under Vite, fulfilling the ES-module request with JSON so the SPA never boots. The app is
// correct; the TEST is the defect. checkE2eRouteCollision flags a broad glob that matches a
// client/src module's dev URL; a pathname-matcher FUNCTION (the fix) and an anchored non-glob
// string are left alone. Surfaced via the navigator scope of the agent-side response-formatter.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkE2eRouteCollision, globToRegExp } from "../../consort/architecture/e2e-route-adherence.js";
import { formatRoleResponse } from "../../consort/session/response-formatter.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "e2e-route-"));
  // A client module the app imports: served by Vite at /src/api/stock.ts.
  mkdirSync(join(dir, "client", "src", "api"), { recursive: true });
  writeFileSync(join(dir, "client", "src", "api", "stock.ts"), "export const listStock = () => {};\n");
  mkdirSync(join(dir, "client", "tests", "e2e"), { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function spec(name: string, body: string): void {
  writeFileSync(join(dir, "client", "tests", "e2e", name), body);
}

describe("globToRegExp (Playwright URL glob semantics)", () => {
  it("`**` matches across slashes so **/api/stock** catches the /src module URL", () => {
    expect(globToRegExp("**/api/stock**").test("http://127.0.0.1:5173/src/api/stock.ts")).toBe(true);
  });
  it("an anchored **/api/stock (no trailing wildcard) does NOT match the .ts module URL", () => {
    expect(globToRegExp("**/api/stock").test("http://127.0.0.1:5173/src/api/stock.ts")).toBe(false);
  });
});

describe("checkE2eRouteCollision", () => {
  it("FLAGS a broad glob that also matches a client/src module (the T20 defect)", () => {
    spec("S2.spec.ts", `test("t", async ({ page }) => { await page.route("**/api/stock**", (r) => r.fulfill({ body: "{}" })); });`);
    const r = checkE2eRouteCollision(dir);
    expect(r.ok).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].glob).toBe("**/api/stock**");
    expect(r.violations[0].module).toContain("src/api/stock.ts");
    expect(r.violations[0].remediation).toMatch(/pathname/);
  });

  it("does NOT flag a URL-matcher FUNCTION (the correct, scoped form)", () => {
    spec("ok.spec.ts", `test("t", async ({ page }) => { await page.route((url) => new URL(url).pathname === "/api/stock", (r) => r.fulfill({ body: "{}" })); });`);
    expect(checkE2eRouteCollision(dir).ok).toBe(true);
  });

  it("does NOT flag an anchored non-glob string that cannot match the module .ts URL", () => {
    spec("anchored.spec.ts", `await page.route("**/api/stock", (r) => r.continue());`);
    expect(checkE2eRouteCollision(dir).ok).toBe(true);
  });

  it("does NOT flag a broad glob that matches NO client module", () => {
    spec("other.spec.ts", `await page.route("**/api/warehouses**", (r) => r.fulfill({ body: "[]" }));`);
    expect(checkE2eRouteCollision(dir).ok).toBe(true);
  });

  it("is a clean no-op when there is no client tree (backend-only project)", () => {
    rmSync(join(dir, "client"), { recursive: true, force: true });
    expect(checkE2eRouteCollision(dir).ok).toBe(true);
  });
});

describe("response-formatter navigator scope surfaces the collision", () => {
  const consortDir = () => join(dir, ".consort");
  it("returns the violation for the navigator role on a colliding spec", () => {
    spec("S2.spec.ts", `await page.route("**/api/stock**", (r) => r.fulfill({ body: "{}" }));`);
    const res = formatRoleResponse({ role: "navigator", consortDir: consortDir(), featureId: "F1", story: "S2" });
    expect(res.ok).toBe(false);
    expect(res.violations[0].problem).toMatch(/MIME type application\/json|pathname/);
  });
  it("passes the navigator role when the mock is pathname-scoped", () => {
    spec("ok.spec.ts", `await page.route((url) => new URL(url).pathname === "/api/stock", (r) => r.fulfill({ body: "{}" }));`);
    const res = formatRoleResponse({ role: "navigator", consortDir: consortDir(), featureId: "F1", story: "S2" });
    expect(res.ok).toBe(true);
  });
});
