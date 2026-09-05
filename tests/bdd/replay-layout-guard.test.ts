// Anti-drift guard for the replay dir consolidation: ONE machinery dir
// (examples/replay/) with the corpora nested under examples/replay/corpora/<name>/.
// Before this, the machinery (launchers + engine) was split across
// examples/replay-scenarios/ and examples/tdd-workflow-smoke/orchestrator/, with each
// tree's own corpus fused in. The shell + the TS test path constants resolve against
// this exact layout; if a future move re-scatters it, the corpus-resolution tests fail
// with an opaque ENOENT deep in a readFileSync. This guard fails FIRST, naming the
// canonical layout, so the drift is obvious at the source.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const REPLAY_DIR = path.join(REPO_ROOT, "examples", "replay");

describe("replay layout: one machinery dir + corpora/ subdir (anti-drift)", () => {
  it("the machinery dir examples/replay/ exists with the shared engine + generic launchers", () => {
    expect(fs.existsSync(REPLAY_DIR), "examples/replay/ machinery dir present").toBe(true);
    for (const f of ["_replay-smoke.sh", "replay-scenario.sh", "capture-scenario.sh", "SCENARIOS.md"]) {
      expect(fs.existsSync(path.join(REPLAY_DIR, f)), `examples/replay/${f} present`).toBe(true);
    }
  });

  // (The "corpora live under examples/replay/corpora/<name>/" nesting guard moved to
  //  consort-examples with the corpora; here corpora may be absent, fetched on demand.)

  it("the retired split trees are GONE (no examples/replay-scenarios, no examples/tdd-workflow-smoke)", () => {
    expect(
      fs.existsSync(path.join(REPO_ROOT, "examples", "replay-scenarios")),
      "examples/replay-scenarios/ was folded into examples/replay/ and must not return",
    ).toBe(false);
    expect(
      fs.existsSync(path.join(REPO_ROOT, "examples", "tdd-workflow-smoke")),
      "examples/tdd-workflow-smoke/ was folded into examples/replay/ and must not return",
    ).toBe(false);
  });
});

// The scaffold `lk` shim was moved out of this repo (templates/project/common/scripts/lk)
// into the @databricks-solutions/lakebase-scm-utils substrate package, and made generic
// (it needs LAKEBASE_KIT_PACKAGE to know which kit to load). A launcher that still points
// KIT_LK at the removed in-repo path hard-fails EVERY capture/replay/smoke at the first
// pre-project `lk` call ("No such file or directory"). This guard keeps the resolution on
// the shared helper so that regression cannot silently return.
describe("replay launchers resolve the scaffold lk via the shared helper (anti-drift)", () => {
  const LIB = path.join(REPLAY_DIR, "lib", "pin-local-kit.sh");
  const LAUNCHERS = ["capture-scenario.sh", "_replay-smoke.sh", "run-smoke.sh"];
  const REMOVED_INREPO_LK = 'KIT_LK="${KIT_ROOT}/templates/project/common/scripts/lk"';

  it("pin-local-kit.sh provides kit_lk_path() and exports LAKEBASE_KIT_PACKAGE", () => {
    const lib = fs.readFileSync(LIB, "utf8");
    expect(lib, "kit_lk_path() helper defined").toMatch(/kit_lk_path\(\)\s*\{/);
    expect(lib, "resolve_kit_single_source exports LAKEBASE_KIT_PACKAGE").toMatch(
      /export\s+LAKEBASE_KIT_PACKAGE=/,
    );
  });

  it("kit_lk_path fails loud (returns non-zero) when no scaffold lk exists", () => {
    // Rather than silently returning a dead path and letting a later `bash \"$KIT_LK\"`
    // die with an opaque \"No such file or directory\", the helper must error + return 1.
    const lib = fs.readFileSync(LIB, "utf8");
    expect(lib, "kit_lk_path returns 1 when neither lk path exists").toMatch(/return 1/);
  });

  for (const f of LAUNCHERS) {
    it(`${f} resolves KIT_LK via kit_lk_path and honors its failure`, () => {
      const src = fs.readFileSync(path.join(REPLAY_DIR, f), "utf8");
      // Uses the helper AND bails (|| exit/return) when it fails, so a missing lk
      // stops the run loudly instead of proceeding with an empty KIT_LK.
      expect(src, `${f} uses kit_lk_path and bails on failure`).toMatch(
        /KIT_LK="?\$\(kit_lk_path [^\n]*\)"?\s*\|\|\s*(exit|return)\s+1/,
      );
      expect(
        src.includes(REMOVED_INREPO_LK),
        `${f} must not hardcode KIT_LK at the removed in-repo lk path`,
      ).toBe(false);
    });
  }
});

// The resume path (alreadyClaimed) leaves HEAD on the parent tier with dirty tracked
// .consort/.lakebase run metadata; a plain `git checkout <feature>` aborts and wedges
// the resume. The checkout must force past that disposable churn (the feature branch
// carries its own committed state), mirroring the orchestrator's done-phase force.
describe("replay resume forces past dirty run-metadata on the feature checkout", () => {
  it("_replay-smoke.sh checks out the claimed feature branch with -f", () => {
    const src = fs.readFileSync(path.join(REPLAY_DIR, "_replay-smoke.sh"), "utf8");
    expect(src, "feature-branch checkout uses -f").toMatch(
      /checkout -f "\$_FEATURE_BRANCH"/,
    );
  });
});
