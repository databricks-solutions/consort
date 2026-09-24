// BDD coverage for the brand-icon acceptance gate + resolve-reverification:
//  - the ux-clean CLI path now reads the design guide's app_icon (a declared-but-
//    unapplied brand icon fails the gate, not just the advisory smell);
//  - the accept step runs the ux-adherence gate FAIL-CLOSED before pipeline accept;
//  - refactor-completion RE-VERIFIES the ux-adherence smell before resolving it (a
//    refactor that never touched the icon must leave the smell OPEN, not mark it
//    "accepted" while the placeholder ships).

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { checkUxClean, readAppIconFromGuide } from "../../consort/architecture/design-adherence.js";
import { commandsForAction, type DriveEffectsConfig } from "../../consort/orchestrator/drive/orchestrator-effects.js";
import { refactorStory, type GreenVerifier } from "../../consort/pipeline/cycle-record.js";
import { writeSmellsLog, readSmellsLog } from "../../consort/smells/smells.js";

const tmpDirs: string[] = [];
function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-icon-gate-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
});

const GUIDE_ICON = { source: ".consort/design/assets/warehouse.png", install_to: "client/public/warehouse.png" };
const PLACEHOLDER_INDEX = `<!doctype html><html><head><link rel="icon" href="/favicon.svg" /></head><body></body></html>`;
const PLACEHOLDER_APP = `export default function App() { return <div>Stock App</div>; }`;
const BRAND_INDEX = `<!doctype html><html><head><link rel="icon" href="/warehouse.png" /></head><body></body></html>`;
const BRAND_APP = `export default function App() { return <div><img src="/warehouse.png" /> Stock App</div>; }`;

function seedGuide(projectDir: string): void {
  const d = path.join(projectDir, ".sftdd", "design");
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "design-guide.json"), JSON.stringify({ app_icon: GUIDE_ICON }) + "\n");
  fs.mkdirSync(path.join(projectDir, "client", "public"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "client", "public", "warehouse.png"), "PNG");
}
function seedClient(projectDir: string, indexHtml: string, appTsx: string): void {
  // client/src/pages/ must exist: checkUxClean short-circuits to clean without it
  // ("not a UI-track project") and the icon contract never runs.
  fs.mkdirSync(path.join(projectDir, "client", "src", "pages"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "client", "index.html"), indexHtml);
  fs.writeFileSync(path.join(projectDir, "client", "src", "App.tsx"), appTsx);
}

describe("the ux-clean icon contract via the guide (the CLI path)", () => {
  it("a declared-but-unapplied brand icon fails the gate (placeholder refs)", () => {
    const projectDir = mkProject();
    seedGuide(projectDir);
    seedClient(projectDir, PLACEHOLDER_INDEX, PLACEHOLDER_APP);
    const appIcon = readAppIconFromGuide(path.join(projectDir, ".sftdd"));
    expect(appIcon).toEqual(GUIDE_ICON);
    const r = checkUxClean({ projectDir, appIcon });
    expect(r.clean).toBe(false);
    expect(JSON.stringify(r)).toMatch(/favicon does not reference/);
    expect(JSON.stringify(r)).toMatch(/app shell \(App.tsx\) does not reference/);
  });

  it("passes once BOTH index.html and the app shell reference the installed basename", () => {
    const projectDir = mkProject();
    seedGuide(projectDir);
    seedClient(projectDir, BRAND_INDEX, BRAND_APP);
    const appIcon = readAppIconFromGuide(path.join(projectDir, ".sftdd"));
    const r = checkUxClean({ projectDir, appIcon });
    expect(r.clean).toBe(true);
  });
});

describe("commandsForAction: accept runs the ux-adherence gate FAIL-CLOSED first", () => {
  it("runs consort-ux-clean BEFORE pipeline accept (a dirty UX blocks acceptance)", () => {
    const projectDir = mkProject();
    const cfg: DriveEffectsConfig = {
      projectDir,
      consortDir: path.join(projectDir, ".sftdd"),
      featureId: "F1",
      runner: { async run() { /* no-op */ } },
      modelForRole: () => "sonnet",
    };
    const cmds = commandsForAction({ kind: "accept", story: "S1" }, cfg);
    expect(cmds.length).toBeGreaterThanOrEqual(2);
    expect(cmds[0]).toMatchObject({ kind: "cli", bin: "consort-ux-clean", args: ["--project-dir", projectDir] });
    expect(cmds[1]).toMatchObject({ kind: "cli", bin: "consort-pipeline" });
  });
});

describe("refactorStory: the ux-adherence smell is RE-VERIFIED before resolving", () => {
  const pass: GreenVerifier = async () => ({ passed: true, summary: "green" });
  const F = "F1";
  const S = "S1";

  function seedStory(projectDir: string): string {
    const tdd = path.join(projectDir, ".sftdd");
    const expDir = path.join(tdd, "experiments", F, S, "exp1");
    fs.mkdirSync(expDir, { recursive: true });
    fs.writeFileSync(path.join(expDir, "branch.txt"), "experiment-s1-exp1");
    fs.writeFileSync(path.join(expDir, "outcomes.json"), JSON.stringify({ status: "running" }) + "\n");
    writeSmellsLog(tdd, [{ smell: "ux-adherence", cycle_ids: [], detail: "brand app icon not applied", story_id: S }]);
    return tdd;
  }

  it("a still-dirty icon contract leaves the smell OPEN after a green refactor", async () => {
    const projectDir = mkProject();
    const tdd = seedStory(projectDir);
    seedGuide(projectDir);
    seedClient(projectDir, PLACEHOLDER_INDEX, PLACEHOLDER_APP);

    const r = await refactorStory(tdd, F, S, { verify: pass });

    expect(r.refactored).toBe(true);
    const open = readSmellsLog(tdd).detected.filter((d) => d.smell === "ux-adherence" && !d.resolution);
    expect(open).toHaveLength(1);
  });

  it("a clean icon contract resolves the smell (the honest green)", async () => {
    const projectDir = mkProject();
    const tdd = seedStory(projectDir);
    seedGuide(projectDir);
    seedClient(projectDir, BRAND_INDEX, BRAND_APP);

    const r = await refactorStory(tdd, F, S, { verify: pass });

    expect(r.refactored).toBe(true);
    const open = readSmellsLog(tdd).detected.filter((d) => d.smell === "ux-adherence" && !d.resolution);
    expect(open).toHaveLength(0);
  });
});
