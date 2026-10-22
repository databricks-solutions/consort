// Recurrence guard for the navigator-assess-refactor input↔marker binding.
//
// The refactor-verify self-heal writes its failure marker as
// `features/<f>/stories/<s>/refactor-verify-assess.json` (writeRefactorVerifyAssessMarker),
// and the navigator-assess-refactor manifest declares that SAME file as its input
// (`story:refactor-verify-assess.json`). These two are authored in different files
// and silently drifted once (the manifest named a marker basename the writer never
// wrote), which strands the assess turn with a missing input at the HIL. This test
// ties the manifest's declared input to the real writer's target so the basename +
// story scope can't diverge again unnoticed. Hermetic: pure filesystem, no git/net.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { writeRefactorVerifyAssessMarker } from "../../consort/smells/refactor-verify-assess";
import { storyDir, ARTIFACT_ROOT } from "../../consort/config/consort-paths";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_FILE = join(
  HERE,
  "../../consort/orchestrator/steps/manifests/navigator-assess-refactor.json",
);
const DRIVER_MANIFEST_FILE = join(
  HERE,
  "../../consort/orchestrator/steps/manifests/driver-refactor-superseded.json",
);

interface ManifestInput {
  id: string;
  source: string;
}

function readAssessRefactorInput(): ManifestInput {
  const manifest = JSON.parse(readFileSync(MANIFEST_FILE, "utf8")) as { inputs: ManifestInput[] };
  const input = manifest.inputs.find((i) => i.id === "refactor-verify-assess");
  if (!input) {
    throw new Error(
      "navigator-assess-refactor manifest has no input with id 'refactor-verify-assess'",
    );
  }
  return input;
}

const FEATURE = "F1";
const STORY = "S1";
let consortDir: string;

beforeEach(() => {
  consortDir = join(mkdtempSync(join(tmpdir(), "assess-refactor-")), ARTIFACT_ROOT);
  // The feature dir must exist for findFeatureDir (used by both the writer and
  // storyDir) to resolve it; the writer creates the story dir itself.
  mkdirSync(join(consortDir, "features", FEATURE), { recursive: true });
});
afterEach(() => rmSync(dirname(consortDir), { recursive: true, force: true }));

describe("navigator-assess-refactor input ↔ refactor-verify-assess marker", () => {
  it("declares a story-scoped source whose basename is where the writer writes", () => {
    const input = readAssessRefactorInput();
    // Source is "<scope>:<rel>"; the assess marker is story-scoped, exactly like
    // its structural twin navigator-assess-deploy (story:deploy-verify-assess.json).
    const [scope, ...rest] = input.source.split(":");
    const rel = rest.join(":");
    expect(scope).toBe("story");

    const written = writeRefactorVerifyAssessMarker(consortDir, FEATURE, STORY, {
      summary: "story S1 refactor-verify: suite X failed",
    });
    expect(written).toBeDefined();

    // Derive the resolved input path the SAME way a story-scoped resolver does:
    // the `story:` scope roots at features/<f>/stories/<s>/ (storyDir – the single
    // path source of truth), and `rel` is the filename within that scope. This
    // FAILS if the manifest source basename ≠ where the marker is actually written.
    const resolved = join(storyDir(consortDir, FEATURE, STORY), rel);
    expect(existsSync(resolved)).toBe(true);
    expect(written).toBe(resolved);
    expect(basename(written!)).toBe(basename(rel));
  });
});

describe("driver-refactor-superseded input ↔ refactor-verify-assess marker (multi-AC union)", () => {
  it("reads the STORY-level assess marker (its aggregated flagged_tests), not a per-AC superseded-tests.json", () => {
    const manifest = JSON.parse(readFileSync(DRIVER_MANIFEST_FILE, "utf8")) as { inputs: ManifestInput[] };
    const input = manifest.inputs.find((i) => i.id === "superseded-tests");
    if (!input) throw new Error("driver-refactor-superseded manifest has no input 'superseded-tests'");
    const [scope, ...rest] = input.source.split(":");
    const rel = rest.join(":");
    expect(scope).toBe("story");
    // The defect: the input named `superseded-tests.json`, which the Navigator writes PER AC
    // (cycles/<f>/<s>/<ac>/superseded-tests.json) via flag-superseded — NEVER at the story root.
    // A story-granularity supersession spanning >1 AC (e.g. S2's AC1 T41/T42 + AC3 T58/T59) then
    // had NO story-root file, so resolveInputs fail-louded with "missing input" before the Driver
    // spawned. The assess finalize aggregates the per-AC files into the story-level marker's
    // flagged_tests (the UNION), so the step must read THAT marker here.
    expect(rel).toBe("refactor-verify-assess.json");
    expect(rel).not.toBe("superseded-tests.json");

    // The marker the writer / assess-finalize produces resolves at exactly story:<rel> — so the
    // step input is present (no abort) whenever the step is routed (routing requires the marker).
    const written = writeRefactorVerifyAssessMarker(consortDir, FEATURE, STORY, {
      summary: "story S1 refactor-verify: full suite failed",
    });
    const resolved = join(storyDir(consortDir, FEATURE, STORY), rel);
    expect(existsSync(resolved)).toBe(true);
    expect(written).toBe(resolved);
  });
});
