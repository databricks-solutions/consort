// Guard against the npx tax creeping back in. Kit CLIs invoked from a scaffolded
// project must go through the fast `./scripts/lk` resolver (node dist, ~0.09s),
// NOT `npx --package=github#ref <bin>` (~3.5s, re-resolves the ref every call).
//
// The smoke's create-project bootstrap also runs through the scaffolded project's
// `./scripts/lk` (the real two-package resolver shipped by scm-utils) so a run is
// DETERMINISTIC: lk resolves
// via `npm install <committish>` (content-addressed for a SHA, honors a pre-built
// $LAKEBASE_KIT_DIR), never the `npx pack` path that throws "GitFetcher requires
// an Arborist constructor" on a SHA committish, and never a moving ref's stale
// _cacache. One resolution path => identical bits on every step of every run.
//
// Two intentional exceptions keep npx: the kit's own create path (commands/tdd.md,
// a real user with no kit checkout, pinned to a published tag npx caches fine) and
// the project CI workflows (pinned to an immutable published version tag).

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), "utf8");

const COMMAND_TEMPLATES = [
  "templates/project/common/.claude/commands/plan.md",
  "templates/project/common/.claude/commands/design.md",
  "templates/project/common/.claude/commands/build.md",
  "templates/project/common/.claude/commands/deploy.md",
  "templates/project/common/.claude/commands/spike.md",
  "templates/project/common/.claude/commands/sprint.md",
  "templates/project/common/.claude/commands/design.pre-hook.md",
];

describe("npx-tax guard: scaffolded command templates use ./scripts/lk", () => {
  for (const rel of COMMAND_TEMPLATES) {
    it(`${path.basename(rel)} invokes kit CLIs via ./scripts/lk, not npx --package`, () => {
      const body = read(rel);
      expect(body, "should route kit CLIs through the lk resolver").toMatch(/\.\/scripts\/lk\b/);
      expect(body, "no npx --package kit-CLI calls").not.toMatch(/npx\s+--yes\s+--package/);
      expect(body, "no leftover KIT_PKG plumbing").not.toMatch(/KIT_PKG/);
    });
  }
});

describe("npx-tax guard: the canonical logging doc + smoke use lk", () => {
  it("agent-logging.md shows the logger invoked via ./scripts/lk", () => {
    const body = read("skills/consort/references/agent-logging.md");
    expect(body).toMatch(/\.\/scripts\/lk consort-log/);
    // No bare command-line `consort-log` invocation (start of a bash line).
    expect(body).not.toMatch(/^\s*consort-log /m);
  });

  it("the smokes bootstrap create-project through the kit's lk (no npx --package), for determinism", () => {
    // run-smoke.sh bootstraps directly; the replay smokes share _replay-smoke.sh.
    for (const rel of [
      "examples/replay/run-smoke.sh",
      "examples/replay/_replay-smoke.sh",
    ]) {
      const smoke = read(rel);
      // Bootstrap routes through the committed lk resolver, pinned via KIT_LK.
      // KIT_LK resolves through the shared kit_lk_path helper (the scaffold lk now
      // lives in the @databricks-solutions/lakebase-scm-utils substrate package, not
      // in-repo), so assert the helper is used rather than a hardcoded lk path.
      expect(smoke, `${rel}: defines KIT_LK via the shared kit_lk_path resolver`).toMatch(
        /KIT_LK="?\$\(kit_lk_path /,
      );
      // Tolerate both inline and split-line (`bash "$KIT_LK" \` then bin) forms.
      expect(smoke, `${rel}: runs create-project via lk`).toMatch(/bash "\$KIT_LK"[\s\\]*lakebase-create-project/);
      // No npx --package bootstrap remains (the SHA-pack-bug / stale-ref source).
      expect(smoke, `${rel}: no npx --package= bootstrap`).not.toMatch(/--package="?\$\{KIT_NPX\}/);
      expect(smoke, `${rel}: no bare npx --yes --package`).not.toMatch(/npx\s+--yes[\s\S]{0,8}--package=/);
    }
  });
});
