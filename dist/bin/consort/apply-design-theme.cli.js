#!/usr/bin/env node

// consort/architecture/apply-theme.ts
import { existsSync as existsSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "fs";
import { join as join3 } from "path";

// consort/architecture/design-adherence.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, readdirSync as readdirSync2, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2, copyFileSync } from "fs";
import { join as join2, dirname, basename } from "path";

// consort/config/consort-paths.ts
import * as fs from "fs";
import { join } from "path";
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];
function resolveConsortDir(projectDir = process.cwd()) {
  const next = join(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    const legacy = join(projectDir, legacyName);
    if (fs.existsSync(legacy)) return legacy;
  }
  return next;
}
var designDir = (tdd) => join(tdd, "design");
var designGuideJson = (tdd) => join(designDir(tdd), "design-guide.json");
var designAssetsDir = (tdd) => join(designDir(tdd), "assets");

// consort/architecture/design-adherence.ts
function installBrandAsset(projectDir, consortDir, appIcon) {
  try {
    const base = basename(appIcon.install_to);
    const src = [
      join2(designAssetsDir(consortDir), base),
      join2(projectDir, appIcon.source),
      join2(consortDir, appIcon.source)
    ].find((p) => existsSync2(p));
    if (!src) return false;
    const dest = join2(projectDir, appIcon.install_to);
    mkdirSync2(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    return true;
  } catch {
    return false;
  }
}
function applyBrandIconReference(projectDir, installTo) {
  const indexHtml = join2(projectDir, "client", "index.html");
  if (!existsSync2(indexHtml)) return false;
  try {
    const href = `/${basename(installTo)}`;
    const src = readFileSync2(indexHtml, "utf8");
    const linkRe = /<link\s+rel="icon"([^>]*?)href="[^"]*"([^>]*)>/;
    if (linkRe.test(src)) {
      const next = src.replace(linkRe, `<link rel="icon"$1href="${href}"$2>`);
      if (next !== src) writeFileSync2(indexHtml, next);
      return true;
    }
    if (/<\/head>/i.test(src)) {
      writeFileSync2(indexHtml, src.replace(/<\/head>/i, `  <link rel="icon" href="${href}" />
</head>`));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
function designGuideToCssVars(guide) {
  const vars = {};
  vars["--font-sans"] = guide.typography.font_family;
  if (guide.typography.font_mono !== void 0) {
    vars["--font-mono"] = guide.typography.font_mono;
  }
  for (const [k, v] of Object.entries(guide.typography.scale)) {
    vars[`--${k}`] = v;
  }
  for (const [k, v] of Object.entries(guide.typography.line_heights ?? {})) {
    vars[`--line-height-${k}`] = v;
  }
  for (const [k, v] of Object.entries(guide.typography.font_weights ?? {})) {
    vars[`--font-weight-${k}`] = v;
  }
  for (const group of Object.values(guide.colors)) {
    for (const [k, v] of Object.entries(group)) {
      vars[`--color-${k}`] = v;
    }
  }
  for (const map of [guide.spacing, guide.radius, guide.shadows, guide.breakpoints]) {
    if (!map) continue;
    for (const [k, v] of Object.entries(map)) {
      vars[`--${k}`] = v;
    }
  }
  return vars;
}
function renderThemeRootCss(guide) {
  const vars = designGuideToCssVars(guide);
  const lines = Object.entries(vars).map(([name, value]) => `  ${name}: ${value};`);
  return `:root {
${lines.join("\n")}
}
`;
}

// consort/architecture/apply-theme.ts
var THEME_HEADER = `/*
 * DESIGN TOKENS \u2014 GENERATED from .consort/design/design-guide.json.
 * Do NOT hand-edit the :root block: edit the design guide and re-run
 *   ./scripts/lk consort-apply-design-theme
 * so what renders IS what the guide declares (the design-adherence gate reads
 * these :root vars back and compares them to the guide). The component classes
 * that consume these tokens live in global.css (UX-designer authored).
 */
`;
function buildThemeCss(guide) {
  return THEME_HEADER + renderThemeRootCss(guide);
}
function applyDesignGuideTheme(projectDir) {
  const consortDir = resolveConsortDir(projectDir);
  const guidePath = designGuideJson(consortDir);
  if (!existsSync3(guidePath)) {
    throw new Error(
      `apply-theme: no design guide at ${guidePath} \u2014 run the UX designer first (this is a UI project's design system).`
    );
  }
  const guide = JSON.parse(readFileSync3(guidePath, "utf8"));
  const themePath = join3(projectDir, "client", "src", "styles", "theme.css");
  const css = buildThemeCss(guide);
  writeFileSync3(themePath, css);
  let iconInstalled = false;
  if (guide.app_icon) {
    iconInstalled = installBrandAsset(projectDir, consortDir, guide.app_icon);
    applyBrandIconReference(projectDir, guide.app_icon.install_to);
  }
  return { themePath, varCount: (css.match(/--[\w-]+:/g) ?? []).length, iconInstalled };
}

// bin/consort/apply-design-theme.cli.ts
function parse(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") out.project = argv[++i];
  }
  return out;
}
function main() {
  const a = parse(process.argv.slice(2));
  const projectDir = a.project ?? process.cwd();
  try {
    const { themePath, varCount, iconInstalled } = applyDesignGuideTheme(projectDir);
    process.stdout.write(`apply-design-theme: wrote ${varCount} design tokens to ${themePath} (:root generated from design-guide.json).
`);
    if (iconInstalled) {
      process.stdout.write(`apply-design-theme: installed the brand app icon + pointed the favicon at it (design-guide app_icon).
`);
    }
    return 0;
  } catch (err) {
    process.stderr.write(`apply-design-theme: ${err.message}
`);
    return 1;
  }
}
process.exit(main());
