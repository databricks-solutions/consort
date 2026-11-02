// A kit upgrade RESETS scripts/run-tests.sh to the template, which carries no Playwright block
// (the block is appended per-project). So refreshSurface must RE-APPEND the E2E block for a UI
// project – otherwise every upgrade wipes E2E out of the deploy-verify gate (how F4's actor-less
// form shipped past a green verify), and a pre-enable-e2e project never had it. Backend projects
// are untouched.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { refreshSurface } from "../../consort/lakebase/upgrade";
import { writeConsortConfig, defaultConsortConfig } from "../../consort/config/consort-config-file";

const KIT_ROOT = resolve(__dirname, "..", "..");

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "e2e-rewire-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function runTests(): string {
  const p = join(dir, "scripts", "run-tests.sh");
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

describe("refreshSurface re-wires the E2E block for a UI project (upgrade must not wipe it)", () => {
  it("a UI (react) project gets the Playwright block re-appended to run-tests.sh", () => {
    const cfg = defaultConsortConfig();
    cfg.project!.uiTrack = true;
    cfg.project!.clientFramework = "react";
    writeConsortConfig(dir, cfg);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "app", scripts: {}, devDependencies: {} }));
    mkdirSync(join(dir, "client"), { recursive: true });
    writeFileSync(join(dir, "client", "package.json"), JSON.stringify({ name: "client", scripts: {}, devDependencies: {} }));

    const r = refreshSurface(dir, KIT_ROOT, "v0.3.52-test");
    expect(r.e2e).toBe(true);
    // The template run-tests.sh has NO Playwright block; after the re-wire it does.
    expect(runTests()).toMatch(/playwright test/);
  });

  it("a backend-only project is left untouched (no E2E block, e2e=false)", () => {
    const cfg = defaultConsortConfig();
    cfg.project!.uiTrack = false;
    cfg.project!.clientFramework = "none";
    writeConsortConfig(dir, cfg);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "api", scripts: {}, devDependencies: {} }));

    const r = refreshSurface(dir, KIT_ROOT, "v0.3.52-test");
    expect(r.e2e).toBe(false);
    expect(runTests()).not.toMatch(/playwright test/);
    // ...but the orphan-client-tests false-green guard IS ported into the template (it carries no
    // `playwright test` string), so a backend-only upgrade still gets the hollow-pass fail-fast.
    expect(runTests()).toMatch(/FALSE-GREEN GUARD/);
  });

  // SCAFFOLD ↔ UPGRADE SURFACE CONTRACT (see scm-utils scripts/lakebase/scaffold.ts): kit-owned
  // per-test instrumentation deployed at scaffold time MUST be force-refreshed on upgrade, else a fix
  // (e.g. the feature/story stamp in app/consort_capture.py) reaches fresh scaffolds but never an
  // existing project — the exact "capture stayed pre-stamp on a project pinned to a newer scm-utils"
  // bug. These assertions enforce the contract so it can't silently regress.
  it("brings kit-owned per-test instrumentation forward: app/consort_capture.py + client reporter/fixtures", () => {
    const cfg = defaultConsortConfig();
    cfg.project!.uiTrack = true;
    cfg.project!.clientFramework = "react";
    writeConsortConfig(dir, cfg);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "app", scripts: {}, devDependencies: {} }));
    writeFileSync(join(dir, "pyproject.toml"), "[project]\nname='app'\n"); // marks a Python project
    // Project carries STALE copies of each instrumentation file (what an older scaffold deployed).
    mkdirSync(join(dir, "app"), { recursive: true });
    writeFileSync(join(dir, "app", "consort_capture.py"), "# STALE pre-stamp capture\n");
    mkdirSync(join(dir, "client", "tests", "e2e"), { recursive: true });
    writeFileSync(join(dir, "client", "package.json"), JSON.stringify({ name: "client", scripts: {}, devDependencies: {} }));
    writeFileSync(join(dir, "client", "consort-vitest-reporter.ts"), "// STALE reporter\n");
    writeFileSync(join(dir, "client", "tests", "e2e", "consort-fixtures.ts"), "// STALE fixtures\n");

    const r = refreshSurface(dir, KIT_ROOT, "v0.3.52-test");

    // All three are reported refreshed and are no longer the stale stubs.
    expect(r.reporterFiles).toEqual(
      expect.arrayContaining([
        "app/consort_capture.py",
        "client/consort-vitest-reporter.ts",
        "client/tests/e2e/consort-fixtures.ts",
      ]),
    );
    const capture = readFileSync(join(dir, "app", "consort_capture.py"), "utf8");
    expect(capture).not.toContain("STALE");
    expect(capture).toContain("_consort_scope"); // the feature/story stamp — proof the FIX reached the file
    expect(readFileSync(join(dir, "client", "consort-vitest-reporter.ts"), "utf8")).not.toContain("STALE");
    expect(readFileSync(join(dir, "client", "tests", "e2e", "consort-fixtures.ts"), "utf8")).not.toContain("STALE");
  });

  it("refreshes app/consort_capture.py on a backend-only project, but not the client instrumentation", () => {
    const cfg = defaultConsortConfig();
    cfg.project!.uiTrack = false;
    cfg.project!.clientFramework = "none";
    writeConsortConfig(dir, cfg);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "api", scripts: {}, devDependencies: {} }));
    writeFileSync(join(dir, "pyproject.toml"), "[project]\nname='api'\n");
    mkdirSync(join(dir, "app"), { recursive: true });
    writeFileSync(join(dir, "app", "consort_capture.py"), "# STALE\n");

    const r = refreshSurface(dir, KIT_ROOT, "v0.3.52-test");

    expect(r.reporterFiles).toContain("app/consort_capture.py");
    // No client/ dir → refreshReporter's dest-dir guard skips the client files (no stray files).
    expect(r.reporterFiles).not.toContain("client/consort-vitest-reporter.ts");
    expect(existsSync(join(dir, "client"))).toBe(false);
    expect(readFileSync(join(dir, "app", "consort_capture.py"), "utf8")).toContain("_consort_scope");
  });

  it("substitutes {{LAKEBASE_SCM_UTILS_VERSION}} in the refreshed CI workflows (no literal placeholder ships)", () => {
    const cfg = defaultConsortConfig();
    cfg.project!.uiTrack = false;
    cfg.project!.clientFramework = "none";
    writeConsortConfig(dir, cfg);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "api", scripts: {}, devDependencies: {} }));

    refreshSurface(dir, KIT_ROOT, "v0.3.58-test");

    // The scaffold placeholder must be GONE from every refreshed workflow. Shipping it verbatim
    // (the raw-copy bug) breaks `${SCM_UTILS_REF:-v{{...}}}`: bash closes at the first `}` of the
    // unsubstituted `}}}` and leaks `}}` into the ref, so `npx github:...#<ref>}}` cannot resolve.
    const prYml = readFileSync(join(dir, ".github", "workflows", "pr.yml"), "utf8");
    const mergeYml = readFileSync(join(dir, ".github", "workflows", "merge.yml"), "utf8");
    expect(prYml).not.toContain("{{LAKEBASE_SCM_UTILS_VERSION}}");
    expect(mergeYml).not.toContain("{{LAKEBASE_SCM_UTILS_VERSION}}");

    // ...replaced with the scm-utils version THIS kit pins (from consort's own dep pin), yielding a
    // clean `${SCM_UTILS_REF:-v<version>}` fallback – exactly what a fresh scaffold produces.
    const pin = (JSON.parse(readFileSync(join(KIT_ROOT, "package.json"), "utf8")).dependencies as Record<string, string>)[
      "@databricks-solutions/lakebase-scm-utils"
    ];
    const ver = pin.slice(pin.indexOf("#") + 1).replace(/^v/, "");
    expect(ver).toMatch(/^\d+\.\d+\.\d+$/); // sanity: the pin is a version tag
    expect(prYml).toContain(`SCM_UTILS_REF:-v${ver}}`);
    expect(mergeYml).toContain(`SCM_UTILS_REF:-v${ver}}`);
  });
});
