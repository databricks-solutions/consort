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
    "scripts/lakebase/create-project.cli": "scripts/lakebase/create-project.cli.ts",
    "scripts/lakebase/adopt-sftdd.cli": "scripts/lakebase/adopt-sftdd.cli.ts",
    "scripts/lakebase/resolve-sftdd-dir.cli": "scripts/lakebase/resolve-sftdd-dir.cli.ts",
    "scripts/lakebase/update-commands.cli": "scripts/lakebase/update-commands.cli.ts",
    "scripts/sftdd/feature-status.cli": "scripts/sftdd/feature-status.cli.ts",
    "scripts/sftdd/next.cli": "scripts/sftdd/next.cli.ts",
    "scripts/sftdd/test-list.cli": "scripts/sftdd/test-list.cli.ts",
    "scripts/sftdd/spec-sync.cli": "scripts/sftdd/spec-sync.cli.ts",
    "scripts/sftdd/human-proxy.cli": "scripts/sftdd/human-proxy.cli.ts",
    "scripts/sftdd/intake.cli": "scripts/sftdd/intake.cli.ts",
    "scripts/sftdd/deploy.cli": "scripts/sftdd/deploy.cli.ts",
    "scripts/sftdd/gate-conformance.cli": "scripts/sftdd/gate-conformance.cli.ts",
    "scripts/sftdd/agent-log.cli": "scripts/sftdd/agent-log.cli.ts",
    "scripts/sftdd/timing-report.cli": "scripts/sftdd/timing-report.cli.ts",
    "scripts/sftdd/drive-log-report.cli": "scripts/sftdd/drive-log-report.cli.ts",
    "scripts/sftdd/contract-clean.cli": "scripts/sftdd/contract-clean.cli.ts",
    "scripts/sftdd/sync-backlog.cli": "scripts/sftdd/sync-backlog.cli.ts",
    "scripts/sftdd/approve-gate.cli": "scripts/sftdd/approve-gate.cli.ts",
    "scripts/sftdd/project-canon-notes.cli": "scripts/sftdd/project-canon-notes.cli.ts",
    "scripts/sftdd/migration-app-clean.cli": "scripts/sftdd/migration-app-clean.cli.ts",
    "scripts/sftdd/imports-clean.cli": "scripts/sftdd/imports-clean.cli.ts",
    "scripts/sftdd/layering-clean.cli": "scripts/sftdd/layering-clean.cli.ts",
    "scripts/sftdd/agent-models.cli": "scripts/sftdd/agent-models.cli.ts",
    "scripts/sftdd/story-pipeline.cli": "scripts/sftdd/story-pipeline.cli.ts",
    "scripts/sftdd/cycle.cli": "scripts/sftdd/cycle.cli.ts",
    "scripts/sftdd/response-formatter.cli": "scripts/sftdd/response-formatter.cli.ts",
    "scripts/sftdd/scenario-conditions.cli": "scripts/sftdd/scenario-conditions.cli.ts",
    "scripts/sftdd/story-experiment.cli": "scripts/sftdd/story-experiment.cli.ts",
    "scripts/sftdd/drive.cli": "scripts/sftdd/drive.cli.ts",
    "scripts/sftdd/spike.cli": "scripts/sftdd/spike.cli.ts",
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
