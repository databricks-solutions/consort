// Guards two start-flow features:
//   A. run-dashboard — the kit ships a launchable dashboard and scaffolds a run-dashboard.sh
//      that opens it on the local project (see docs/design/dashboard-launch-and-wizard-intake.md).
//   B. wizard intake — the interview canon exists, is domain-first + one-question-at-a-time, and
//      start.md routes to it (the orchestrator interviews; the PO only drafts).
// These are content/registration guards, not a live boot — the standalone build is a release step.

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const KIT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(path.join(KIT, rel), "utf8");

describe("Part A — run-dashboard is shipped + registered", () => {
  it("apps/dashboard builds a self-contained standalone server", () => {
    const cfg = read("apps/dashboard/next.config.ts");
    expect(cfg).toContain('output: "standalone"');
    expect(cfg, "standalone must be rooted at the app dir so server.js lands at the bundle root").toContain(
      "outputFileTracingRoot",
    );
  });

  it("registers consort-dashboard as a bin (map + tsup entry) and ships the source", () => {
    const pkg = JSON.parse(read("package.json")) as { bin: Record<string, string>; scripts: Record<string, string> };
    expect(pkg.bin["consort-dashboard"]).toBe("./dist/bin/consort/dashboard.cli.js");
    expect(pkg.scripts["build:dashboard"], "a build:dashboard script assembles the prebuilt bundle").toBeTruthy();
    expect(read("tsup.config.ts")).toContain("bin/consort/dashboard.cli");
    expect(existsSync(path.join(KIT, "bin/consort/dashboard.cli.ts"))).toBe(true);
    expect(existsSync(path.join(KIT, "scripts/build-dashboard.mjs"))).toBe(true);
  });

  it("the release build includes the dashboard bundle (build:release chains build + build:dashboard)", () => {
    // v0.3.73 shipped bins but NO dashboard bundle because the release ran only `npm run build`
    // (tsup) and skipped build:dashboard, so consort-dashboard had nothing to launch on a clean
    // install. build:release makes the release build atomic — it MUST invoke both, so the bundle
    // can never be silently left out of a release again.
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    const rel = pkg.scripts["build:release"];
    expect(rel, "a build:release script must exist as the one-command release build").toBeTruthy();
    expect(rel).toMatch(/build:dashboard/);
    expect(rel, "must also build the bins (tsup)").toMatch(/\bbuild\b/);
    // The bin looks for the prebuilt server at dist/dashboard/server.js; the build script must
    // assemble it to exactly that path (a path drift would silently disable the prebuilt launch).
    expect(read("bin/consort/dashboard.cli.ts")).toContain('"dist", "dashboard"');
    expect(read("scripts/build-dashboard.mjs")).toContain('"dist", "dashboard"');
  });

  it("scaffolds an executable run-dashboard.sh that reads the LOCAL project via lk (no git)", () => {
    const rel = "templates/project/common/scripts/run-dashboard.sh";
    expect(existsSync(path.join(KIT, rel))).toBe(true);
    // Executable (0o111 bits), like its sibling run-dev.sh, so the scaffolded `./scripts/run-dashboard.sh` runs.
    expect(statSync(path.join(KIT, rel)).mode & 0o111).toBeGreaterThan(0);
    const sh = read(rel);
    expect(sh, "must go through the lk kit resolver, not re-implement it").toContain("scripts/lk");
    expect(sh).toContain("consort-dashboard");
    expect(sh).toContain("--project-dir");
  });

  it("retires the dashboard's separate semver (no version field)", () => {
    const dpkg = JSON.parse(read("apps/dashboard/package.json")) as { version?: string; private?: boolean };
    expect(dpkg.version, "the dashboard ships as a build artifact, not an independently-versioned package").toBeUndefined();
    expect(dpkg.private).toBe(true);
  });
});

describe("Part B — wizard-style intake canon", () => {
  it("hil-interview.md is domain-first, one-question-at-a-time, and orchestrator-run", () => {
    const iv = read("skills/consort/references/hil-interview.md");
    expect(iv).toMatch(/domain \+ project name/i);
    expect(iv).toMatch(/one question at a time/i);
    // The orchestrator interviews; the PO only drafts from answers.md.
    expect(iv).toMatch(/product-owner.*intake.*turn.*draft/is);
  });

  it("ships a BLANK answers template with the canonical section headers", () => {
    const t = read("skills/consort/references/intake-answers-template.md");
    for (const header of ["## Domain and name", "## Product overview", "## Non-functional requirements", "## Design brief"]) {
      expect(t, `template missing ${header}`).toContain(header);
    }
  });

  it("start.md routes the interview to the canon (not an improvised aside) and offers the dashboard + VS Code", () => {
    const start = read("commands/start.md");
    expect(start).toContain("hil-interview.md");
    expect(start).toMatch(/one question at a time/i);
    // The dashboard is launched via a SINGLE `consort-dashboard --detach` call: the bin self-detaches
    // and returns at once (like `code "$PWD"`), so start.md must NOT wrap it in nohup/tmux/& and must
    // NOT re-poll for the URL — the fragile launch that left a hung shell + opened the browser late.
    expect(start).toContain("consort-dashboard --detach");
    expect(start, "must not re-introduce the nohup/tmux/& wrapper — the bin self-detaches").not.toMatch(/nohup .*consort-dashboard|tmux new-window .*consort-dashboard/);
    expect(start).toMatch(/VS Code|code "\$PWD"/);
    // The reference-sites ask must be EXPLICIT in start.md (the followed path), not only in
    // the referenced canon — it's what feeds the ux-designer's browser modelling.
    expect(start).toMatch(/which real websites or apps should this look like/i);
  });

  it("does not re-offer already-satisfied tooling: gates the dashboard offer on --status, and checks the extension isn't already installed", () => {
    const start = read("commands/start.md");
    // Dashboard: check `--status` BEFORE offering, so a resume with one already running doesn't re-ask.
    expect(start, "must query consort-dashboard --status before offering").toContain("consort-dashboard --status");
    // Extension: check it isn't already installed (they're likely running from it in Cursor) before offering.
    expect(start).toMatch(/--list-extensions/);
    // The id appears inside a grep pattern, so its dot may be backslash-escaped (kevin-hartman\.lakebase…).
    expect(start).toMatch(/kevin-hartman\\?\.lakebase-scm-extension/);
  });

  it("keeps the extension and the dashboard as DISTINCT views (no false 'same live view' equivalence)", () => {
    const start = read("commands/start.md");
    // The extension is the SCM view (code + paired DB branch); the dashboard is the run (phase/gate,
    // per-role progress). start.md must state they are complementary, not the same view — the bug the
    // session hit was claiming the extension covered the dashboard's run view.
    expect(start).toMatch(/source-control view|SCM view/i);
    expect(start).toMatch(/complementary|not the same view/i);
    // The old copy attributed the dashboard's "phase/gate state, per-role progress" to the EXTENSION.
    // Guard that the extension is no longer described as showing per-role/phase-gate progress.
    expect(
      /extension[^.]*\b(phase\/gate state, per-role progress|each role's progress)\b/i.test(start),
      "the extension must not be described as showing the run's per-role/phase-gate progress",
    ).toBe(false);
  });
});
