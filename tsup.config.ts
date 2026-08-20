import { defineConfig } from "tsup";

// Dual-format build: emit both ESM (.js, since package.json type=module) and
// CJS (.cjs) so the lakebase-scm-extension (CommonJS + webpack) can consume
// without ESM-interop pain on default imports of CJS deps like tweetsodium.
//
// Output structure mirrors the source so the package.json exports map keeps
// stable paths like ./dist/scripts/lakebase/index.{js,cjs}.

export default defineConfig({
  entry: {
    // The substrate barrels + SCM/branch/connection/schema-migrate/scaffold CLIs
    // now live in @databricks-solutions/lakebase-scm-utils and are declared as
    // bins pointing into node_modules there (see package.json "bin"). This kit
    // builds only its own top barrel (re-export of the package), the SFTDD
    // orchestration CLIs, the SFTDD-coupled scaffolders that stay here, and the
    // MCP server.
    "scripts/index": "scripts/index.ts",
    "bin/lakebase/create-project.cli": "bin/lakebase/create-project.cli.ts",
    "bin/lakebase/adopt-consort.cli": "bin/lakebase/adopt-consort.cli.ts",
    "bin/lakebase/resolve-consort-dir.cli": "bin/lakebase/resolve-consort-dir.cli.ts",
    "bin/lakebase/update-commands.cli": "bin/lakebase/update-commands.cli.ts",
    "bin/lakebase/update-agents.cli": "bin/lakebase/update-agents.cli.ts",
    "bin/consort/feature-status.cli": "bin/consort/feature-status.cli.ts",
    "bin/consort/next.cli": "bin/consort/next.cli.ts",
    "bin/consort/test-list.cli": "bin/consort/test-list.cli.ts",
    "bin/consort/spec-sync.cli": "bin/consort/spec-sync.cli.ts",
    "bin/consort/human-proxy.cli": "bin/consort/human-proxy.cli.ts",
    "bin/consort/intake.cli": "bin/consort/intake.cli.ts",
    "bin/consort/deploy.cli": "bin/consort/deploy.cli.ts",
    "bin/consort/gate-conformance.cli": "bin/consort/gate-conformance.cli.ts",
    "bin/consort/agent-log.cli": "bin/consort/agent-log.cli.ts",
    "bin/consort/finalize-corpus.cli": "bin/consort/finalize-corpus.cli.ts",
    "bin/consort/timing-report.cli": "bin/consort/timing-report.cli.ts",
    "bin/consort/drive-log-report.cli": "bin/consort/drive-log-report.cli.ts",
    "bin/consort/contract-clean.cli": "bin/consort/contract-clean.cli.ts",
    "bin/consort/sync-backlog.cli": "bin/consort/sync-backlog.cli.ts",
    "bin/consort/telemetry.cli": "bin/consort/telemetry.cli.ts",
    "bin/consort/approve-gate.cli": "bin/consort/approve-gate.cli.ts",
    "bin/consort/project-canon-notes.cli": "bin/consort/project-canon-notes.cli.ts",
    "bin/consort/migration-app-clean.cli": "bin/consort/migration-app-clean.cli.ts",
    "bin/consort/imports-clean.cli": "bin/consort/imports-clean.cli.ts",
    "bin/consort/layering-clean.cli": "bin/consort/layering-clean.cli.ts",
    "bin/consort/ux-clean.cli": "bin/consort/ux-clean.cli.ts",
    "bin/consort/optimize.cli": "bin/consort/optimize.cli.ts",
    "bin/consort/optimize-apply.cli": "bin/consort/optimize-apply.cli.ts",
    // Internal per-role sweep harness (NOT a published bin , see package.json: no bin entry).
    // Built to dist only so the scripts/optimize-role.sh runbook can run the CJS build (the
    // shared schema-loader uses __dirname, which tsx's ESM loader leaves undefined). driver-sweep.ts
    // (its transitive import) is committed, so this entry builds cleanly; only scripts/optimize-role.sh
    // consumes the dist output (the capture/kit/published bins do not).
    "tests/optimization/optimize-role.cli": "tests/optimization/optimize-role.cli.ts",
    "bin/consort/agent-models.cli": "bin/consort/agent-models.cli.ts",
    "bin/consort/story-pipeline.cli": "bin/consort/story-pipeline.cli.ts",
    "bin/consort/cycle.cli": "bin/consort/cycle.cli.ts",
    "bin/consort/response-formatter.cli": "bin/consort/response-formatter.cli.ts",
    "bin/consort/scenario-conditions.cli": "bin/consort/scenario-conditions.cli.ts",
    "bin/consort/story-experiment.cli": "bin/consort/story-experiment.cli.ts",
    "bin/consort/drive.cli": "bin/consort/drive.cli.ts",
    "bin/consort/claude-runner": "consort/orchestrator/drive/claude-runner.ts",
    "bin/consort/spike.cli": "bin/consort/spike.cli.ts",
    "apps/mcp-server/index": "apps/mcp-server/index.ts",
    "apps/mcp-server/dump-tools": "apps/mcp-server/dump-tools.ts",
  },
  outDir: "dist",
  format: ["esm", "cjs"],
  target: "node20",
  dts: true,
  clean: true,
  // tsup compiles TS only; copy *.schema.json runtime assets into dist/ so
  // consumer installs (which ship pre-built dist/ and never rebuild) can read
  // them. Without this, schema-loader / scm-workflow-state hit ENOENT.
  onSuccess: "node scripts/copy-build-assets.mjs",
  sourcemap: true,
  splitting: false,
  // `shims: true` makes esbuild inject pathToFileURL(__filename).href for
  // `import.meta.url` in the CJS build (and the inverse for ESM). Without
  // it, `import.meta.url` is undefined at runtime in the CJS bundle, which
  // breaks scaffold.ts's findTemplatesDir + sibling helpers when called
  // from a CJS consumer like lakebase-scm-extension. Required for dual-
  // format reach.
  shims: true,
});
