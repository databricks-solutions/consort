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
import { checkE2eRouteCollision, checkE2eSeedBackendDerivation, checkE2eHelperExports, checkE2eRouteAround, globToRegExp } from "../../consort/architecture/e2e-route-adherence.js";
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

describe("checkE2eSeedBackendDerivation (hardcoded/port-swapped seed backend — stockflow-3-90 CI bug)", () => {
  it("FLAGS deriving the backend by string-replacing the client port (5173->8000)", () => {
    spec("S2.spec.ts", `const backend = (baseURL ?? "http://127.0.0.1:8000").replace("5173", "8000"); await seedStock(backend, {});`);
    const r = checkE2eSeedBackendDerivation(dir);
    expect(r.ok).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].spec).toMatch(/S2\.spec\.ts:1$/);
    expect(r.violations[0].remediation).toMatch(/\$\{baseURL\}/);
  });

  it("FLAGS the colon-prefixed variant (:5173->:8000)", () => {
    spec("S3.spec.ts", `const backend = baseURL.replace(":5173", ":8000");`);
    expect(checkE2eSeedBackendDerivation(dir).ok).toBe(false);
  });

  it("does NOT flag a seed posted through the app origin (${baseURL}/api/...)", () => {
    spec("ok.spec.ts", "await seedStock(`${baseURL}/api/stock`, {});");
    expect(checkE2eSeedBackendDerivation(dir).ok).toBe(true);
  });

  it("is a clean no-op with no client tree", () => {
    rmSync(join(dir, "client"), { recursive: true, force: true });
    expect(checkE2eSeedBackendDerivation(dir).ok).toBe(true);
  });

  it("the navigator self-check surfaces the port-swapped seed", () => {
    spec("S2.spec.ts", `const backend = baseURL.replace("5173", "8000");`);
    const res = formatRoleResponse({ role: "navigator", consortDir: join(dir, ".consort"), featureId: "F1", story: "S2" });
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => /string-replacing the client port|\$\{baseURL\}/.test(v.problem))).toBe(true);
  });
});

// P3: a spec importing a name a LOCAL helper does not export fails the whole suite at load
// (stockflow S1: helpers.ts re-exported `expect` but not `test`). Non-relative imports
// (@playwright/test), star re-exports, and unresolved specifiers fail open.
describe("checkE2eHelperExports (local-helper import/export consistency)", () => {
  const helper = (body: string) => writeFileSync(join(dir, "client", "tests", "e2e", "helpers.ts"), body);

  it("FLAGS a spec importing a name the local helper does not export (the S1 missing `export { test }`)", () => {
    helper(`import { expect } from "@playwright/test";\nexport { expect };\n`);
    spec("file-stock.spec.ts", `import { test, expect } from "./helpers";\ntest("t", async () => {});\n`);
    const r = checkE2eHelperExports(dir);
    expect(r.ok).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].missing).toEqual(["test"]);
    expect(r.violations[0].remediation).toMatch(/@playwright\/test|re-export/);
  });

  it("does NOT flag when the helper re-exports exactly what the spec imports", () => {
    helper(`import { test, expect } from "@playwright/test";\nexport { test, expect };\n`);
    spec("ok.spec.ts", `import { test, expect } from "./helpers";\ntest("t", async () => {});\n`);
    expect(checkE2eHelperExports(dir).ok).toBe(true);
  });

  it("does NOT flag a direct @playwright/test import (non-relative, skipped)", () => {
    spec("direct.spec.ts", `import { test, expect } from "@playwright/test";\ntest("t", async () => {});\n`);
    expect(checkE2eHelperExports(dir).ok).toBe(true);
  });

  it("fails open on an unresolved relative import", () => {
    spec("missing.spec.ts", `import { test } from "./nope";\n`);
    expect(checkE2eHelperExports(dir).ok).toBe(true);
  });

  it("the navigator self-check surfaces the unsatisfied helper import", () => {
    helper(`export { expect } from "@playwright/test";\n`);
    spec("S1.spec.ts", `import { test, expect } from "./helpers";\n`);
    const res = formatRoleResponse({ role: "navigator", consortDir: join(dir, ".consort"), featureId: "F1", story: "S1" });
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => /does not export/.test(v.problem))).toBe(true);
  });
});

// P3: a spec must drive its assertion THROUGH the shipped control, not route around it
// (stockflow S2: selectOption(...).catch(() => page.goto('?location=')) passed whether or not
// the native-datalist filter worked). Only a control-interaction + `.catch`-with-goto is flagged.
describe("checkE2eRouteAround (drive the shipped control, not a URL bypass)", () => {
  it("FLAGS a control interaction with a `.catch(() => page.goto('?...'))` fallback (the S2 datalist bypass)", () => {
    spec("empty-location.spec.ts",
      `test("t", async ({ page }) => {\n` +
      `  await page.getByTestId("location-select").selectOption({ value: loc }).catch(async () => {\n` +
      `    await page.goto(\`/?location=\${loc}\`);\n` +
      `  });\n` +
      `});\n`);
    const r = checkE2eRouteAround(dir);
    expect(r.ok).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].remediation).toMatch(/routes around the shipped control/);
  });

  it("does NOT flag a plain control interaction with no navigation fallback", () => {
    spec("ok.spec.ts", `test("t", async ({ page }) => { await page.getByTestId("location-select").selectOption({ value: "A" }); });`);
    expect(checkE2eRouteAround(dir).ok).toBe(true);
  });

  it("does NOT flag a `.catch` whose handler does not navigate (fail open)", () => {
    spec("catch-no-goto.spec.ts", `await page.getByRole("button").click().catch(() => {});`);
    expect(checkE2eRouteAround(dir).ok).toBe(true);
  });

  it("does NOT flag a legitimate deep-link page.goto with a query (no control fallback)", () => {
    spec("deeplink.spec.ts", `test("t", async ({ page }) => { await page.goto("/?location=NOWHERE"); });`);
    expect(checkE2eRouteAround(dir).ok).toBe(true);
  });

  it("the navigator self-check surfaces the route-around", () => {
    spec("S2.spec.ts", `await page.getByTestId("x").selectOption({ value: "a" }).catch(async () => { await page.goto("/?location=a"); });`);
    const res = formatRoleResponse({ role: "navigator", consortDir: join(dir, ".consort"), featureId: "F1", story: "S2" });
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => /routes around the shipped control/.test(v.problem))).toBe(true);
  });
});
