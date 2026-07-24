#!/usr/bin/env node
"use strict";

// scripts/sftdd/imports-clean.ts
var import_node_child_process = require("child_process");
var import_node_fs = require("fs");
var import_node_path = require("path");
var import_lakebase = require("@databricks-solutions/lakebase-scm-utils/lakebase");
var DEFAULT_BUILD_ARTIFACTS = ["client/dist"];
var REMEDIATION = 'App entry imports an optional build artifact (e.g. client/dist) at module load time. Guard the coupling so the module imports without the artifact: mount the compiled client ONLY when its directory exists, and serve a clear 503 ("client not built") from the SPA route when index.html is absent. See the `import-time-build-coupling` bad smell + the dev/prod-parity rule in software-design-principles.';
function detectEntry(projectDir, lang) {
  if (lang === "python") {
    if ((0, import_node_fs.existsSync)((0, import_node_path.join)(projectDir, "app", "main.py"))) return "app.main";
    if ((0, import_node_fs.existsSync)((0, import_node_path.join)(projectDir, "main.py"))) return "main";
    return null;
  }
  if (lang === "nodejs") {
    try {
      const pkg = JSON.parse(
        (0, import_node_child_process.execSync)("cat package.json", { cwd: projectDir }).toString()
      );
      if (pkg.main && (0, import_node_fs.existsSync)((0, import_node_path.join)(projectDir, pkg.main))) return `./${pkg.main}`;
    } catch {
    }
    for (const cand of ["server/index.js", "index.js", "src/index.js"]) {
      if ((0, import_node_fs.existsSync)((0, import_node_path.join)(projectDir, cand))) return `./${cand}`;
    }
    return null;
  }
  return null;
}
var defaultImporter = ({ projectDir, lang, entry }) => {
  let command;
  if (lang === "python") {
    const py = hasUv(projectDir) ? "uv run python" : "python3";
    command = `${py} -c "import ${entry}"`;
  } else if (lang === "nodejs") {
    command = `node -e "require('${entry}')"`;
  } else {
    return { code: 0, stderr: "" };
  }
  try {
    (0, import_node_child_process.execSync)(command, { cwd: projectDir, stdio: ["ignore", "ignore", "pipe"] });
    return { code: 0, stderr: "" };
  } catch (err) {
    const e = err;
    return {
      code: typeof e.status === "number" ? e.status : 1,
      stderr: e.stderr ? e.stderr.toString() : String(err)
    };
  }
};
function hasUv(projectDir) {
  try {
    (0, import_node_child_process.execSync)("uv --version", { cwd: projectDir, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function checkImportsClean(args) {
  const { projectDir } = args;
  const buildArtifacts = args.buildArtifacts ?? DEFAULT_BUILD_ARTIFACTS;
  const importer = args.importer ?? defaultImporter;
  let lang;
  try {
    lang = args.lang ?? (0, import_lakebase.detectLanguage)(projectDir);
  } catch {
    return { clean: true, entry: null, lang: null, hiddenArtifacts: [] };
  }
  const entry = detectEntry(projectDir, lang);
  if (!entry) {
    return { clean: true, entry: null, lang, hiddenArtifacts: [] };
  }
  const hidden = [];
  for (const rel of buildArtifacts) {
    const from = (0, import_node_path.join)(projectDir, rel);
    if ((0, import_node_fs.existsSync)(from)) {
      const to = `${from}.imports-clean-bak`;
      (0, import_node_fs.renameSync)(from, to);
      hidden.push({ from, to });
    }
  }
  try {
    const outcome = importer({ projectDir, lang, entry });
    if (outcome.code === 0) {
      return { clean: true, entry, lang, hiddenArtifacts: hidden.map((h) => h.from) };
    }
    return {
      clean: false,
      entry,
      lang,
      hiddenArtifacts: hidden.map((h) => h.from),
      error: outcome.stderr.trim(),
      remediation: REMEDIATION
    };
  } finally {
    for (const h of hidden.reverse()) {
      if ((0, import_node_fs.existsSync)(h.to)) (0, import_node_fs.renameSync)(h.to, h.from);
    }
  }
}

// scripts/sftdd/imports-clean.cli.ts
function parse(argv) {
  const out = { projectDir: process.cwd(), artifacts: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--lang" && i + 1 < argv.length) out.lang = argv[++i];
    else if (a === "--artifact" && i + 1 < argv.length) out.artifacts.push(argv[++i]);
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}
function help() {
  process.stdout.write(
    `lakebase-sftdd-imports-clean , import the app entry without a build artifact present

Usage:
  lakebase-sftdd-imports-clean [--project-dir <path>] [--lang python|nodejs] \\
                             [--artifact <rel> ...] [--json]

Exit 0 = clean; exit 1 = entry could not import with the artifact hidden.
`
  );
  process.exit(0);
}
var p = parse(process.argv.slice(2));
var callArgs = { projectDir: p.projectDir };
if (p.lang) callArgs.lang = p.lang;
if (p.artifacts.length > 0) callArgs.buildArtifacts = p.artifacts;
var result = checkImportsClean(callArgs);
if (p.json) {
  process.stdout.write(`${JSON.stringify(result)}
`);
} else if (result.clean) {
  const what = result.entry ? `imported \`${result.entry}\`` : "no conventional entry to check";
  const hid = result.hiddenArtifacts.length ? ` (artifacts hidden: ${result.hiddenArtifacts.join(", ")})` : "";
  process.stdout.write(`imports-clean: OK , ${what}${hid}
`);
} else {
  process.stderr.write(
    `imports-clean: FAILED , \`${result.entry}\` could not import with build artifact(s) hidden.

${result.error}

Remediation: ${result.remediation}
`
  );
}
process.exit(result.clean ? 0 : 1);
//# sourceMappingURL=imports-clean.cli.cjs.map