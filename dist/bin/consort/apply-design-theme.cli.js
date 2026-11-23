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
function applyNavbarBranding(projectDir, branding) {
  const appTsx = join2(projectDir, "client", "src", "App.tsx");
  if (!existsSync2(appTsx)) return false;
  try {
    const src = readFileSync2(appTsx, "utf8");
    let next = src;
    if (branding.installTo) {
      const href = `/${basename(branding.installTo)}`;
      next = next.replace(
        /(<img\b[^>]*\bclassName="navbar__icon"[^>]*\bsrc=")[^"]*(")/,
        `$1${href}$2`
      );
    }
    if (branding.appName) {
      next = next.replace(
        /(<span className="navbar__brand">[\s\S]*?\/>\s*)([^<]*?)(\s*<\/span>)/,
        `$1${branding.appName}$3`
      );
    }
    if (next !== src) {
      writeFileSync2(appTsx, next);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
var CONSORT_FOOTER_IMPORT = `import { MadeWithConsort } from "./components/MadeWithConsort";`;
var CONSORT_FOOTER_ELEMENT = `<MadeWithConsort />`;
function ensureConsortFooter(projectDir) {
  const appTsx = join2(projectDir, "client", "src", "App.tsx");
  if (!existsSync2(appTsx)) return false;
  const footerComponent = join2(projectDir, "client", "src", "components", "MadeWithConsort.tsx");
  if (!existsSync2(footerComponent)) return false;
  try {
    const src = readFileSync2(appTsx, "utf8");
    if (src.includes("MadeWithConsort")) return false;
    if (!src.includes("</Routes>")) return false;
    let next = src;
    const importRe = /^import .*;$/gm;
    let lastImportEnd = -1;
    let m;
    while ((m = importRe.exec(src)) !== null) lastImportEnd = m.index + m[0].length;
    if (lastImportEnd >= 0) {
      next = next.slice(0, lastImportEnd) + `
${CONSORT_FOOTER_IMPORT}` + next.slice(lastImportEnd);
    } else {
      next = `${CONSORT_FOOTER_IMPORT}
` + next;
    }
    next = next.replace(/(<\/Routes>)/, `$1
      ${CONSORT_FOOTER_ELEMENT}`);
    if (next !== src) {
      writeFileSync2(appTsx, next);
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
  for (const map of [guide.spacing, guide.radius, guide.shadows, guide.breakpoints, guide.motion]) {
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
  lines.push(`  --consort-lockup: ${consortLockupForSurface(pageSurfaceColor(vars))};`);
  return `:root {
${lines.join("\n")}
}
`;
}
function pageSurfaceColor(vars) {
  for (const key of ["--color-surface", "--color-page", "--color-bg", "--color-background", "--color-canvas"]) {
    if (vars[key]) return vars[key];
  }
  return void 0;
}
function hexLuminance(hex) {
  if (!hex) return null;
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
function consortLockupForSurface(surface) {
  const lum = hexLuminance(surface);
  return lum !== null && lum < 0.5 ? 'url("/consort-lockup-white.svg")' : 'url("/consort-lockup.svg")';
}

// consort/architecture/apply-theme.ts
var CLIENT_THEME_CSS = join3("client", "src", "styles", "theme.css");
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
function applyDesignGuideTheme(projectDir, opts = {}) {
  const consortDir = resolveConsortDir(projectDir);
  const guidePath = designGuideJson(consortDir);
  if (!existsSync3(guidePath)) {
    if (opts.ifGuide) {
      return { themePath: "", varCount: 0, iconInstalled: false, skipped: true };
    }
    throw new Error(
      `apply-theme: no design guide at ${guidePath} \u2014 run the UX designer first (this is a UI project's design system).`
    );
  }
  const guide = JSON.parse(readFileSync3(guidePath, "utf8"));
  const themePath = join3(projectDir, CLIENT_THEME_CSS);
  const css = buildThemeCss(guide);
  writeFileSync3(themePath, css);
  let iconInstalled = false;
  if (guide.app_icon) {
    iconInstalled = installBrandAsset(projectDir, consortDir, guide.app_icon);
    applyBrandIconReference(projectDir, guide.app_icon.install_to);
  }
  if (guide.app_icon || guide.app_name) {
    applyNavbarBranding(projectDir, {
      ...guide.app_icon ? { installTo: guide.app_icon.install_to } : {},
      ...guide.app_name ? { appName: guide.app_name } : {}
    });
  }
  ensureConsortFooter(projectDir);
  return { themePath, varCount: (css.match(/--[\w-]+:/g) ?? []).length, iconInstalled };
}

// bin/consort/apply-design-theme.cli.ts
function parse(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") out.project = argv[++i];
    else if (argv[i] === "--if-guide") out.ifGuide = true;
  }
  return out;
}
function main() {
  const a = parse(process.argv.slice(2));
  const projectDir = a.project ?? process.cwd();
  try {
    const { themePath, varCount, iconInstalled, skipped } = applyDesignGuideTheme(projectDir, { ifGuide: a.ifGuide });
    if (skipped) {
      process.stdout.write(`apply-design-theme: no design guide (--if-guide) \u2014 nothing to apply.
`);
      return 0;
    }
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
