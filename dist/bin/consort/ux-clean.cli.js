#!/usr/bin/env node

// consort/architecture/design-adherence.ts
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
var VAR_CALL = /var\(\s*--[A-Za-z0-9-]+[^)]*\)/g;
var ROUTE_ELEMENT_RE = /element=\{\s*<\s*([A-Z][A-Za-z0-9_]*)/g;
var ROUTE_COMPONENT_RE = /\bComponent=\{\s*([A-Z][A-Za-z0-9_]*)\s*\}/g;
var REACHABILITY_REMEDIATION = "A feature page component exists under client/src/pages/ but is not wired into App.tsx's <Routes>, so a user can never reach it (its component test passes in isolation, but the app never renders it). Add a <Route ... element={<Page/>} /> for it AND a nav affordance the IA declares. If the component is composed inside another page (not a route of its own), mark it exempt. See the `ux-adherence` smell.";
function checkRouteReachability(input) {
  const routed = /* @__PURE__ */ new Set();
  for (const re of [ROUTE_ELEMENT_RE, ROUTE_COMPONENT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(input.appSource)) !== null) routed.add(m[1]);
  }
  const exempt = new Set(input.exemptComponents ?? []);
  const unreachable = input.pageComponents.filter((c) => !routed.has(c) && !exempt.has(c));
  return unreachable.length === 0 ? { ok: true, unreachable: [] } : { ok: false, unreachable, remediation: REACHABILITY_REMEDIATION };
}
var CLASSNAME_RE = /className\s*=\s*["'`]([^"'`]+)["'`]/g;
var JSX_ELEMENT_RE = /<[A-Za-z][A-Za-z0-9]*[\s/>]/;
var CONSUMPTION_REMEDIATION = "A feature page renders visible structure but consumes NONE of the design guide: no var(--token) and no class from the design vocabulary. It renders as bare browser-default HTML. Apply the guide \u2013 wrap in the layout/card/button/table classes (or var(--token) styles) the design guide defines \u2013 so the screen matches the design system. See the `ux-adherence` smell.";
function checkTokenConsumption(input) {
  const vocab = new Set(input.designClasses ?? []);
  const bare = [];
  for (const [name, src] of Object.entries(input.pageSources)) {
    if (!JSX_ELEMENT_RE.test(src)) continue;
    const usesVar = VAR_CALL.test(src);
    VAR_CALL.lastIndex = 0;
    let usesDesignClass = false;
    if (vocab.size > 0) {
      CLASSNAME_RE.lastIndex = 0;
      let m;
      while ((m = CLASSNAME_RE.exec(src)) !== null) {
        if (m[1].split(/\s+/).some((cls) => vocab.has(cls) || [...vocab].some((v) => cls === v || cls.startsWith(`${v}__`) || cls.startsWith(`${v}--`)))) {
          usesDesignClass = true;
          break;
        }
      }
    } else {
      CLASSNAME_RE.lastIndex = 0;
      usesDesignClass = CLASSNAME_RE.test(src);
      CLASSNAME_RE.lastIndex = 0;
    }
    if (!usesVar && !usesDesignClass) bare.push(name);
  }
  return bare.length === 0 ? { ok: true, bare: [] } : { ok: false, bare, remediation: CONSUMPTION_REMEDIATION };
}
var APP_ICON_REMEDIATION = "The design guide declares a brand app_icon (an intake asset), but the app does not use it: the asset is missing at its install_to path and/or the app shell still references the generic scaffold placeholder (favicon.svg) instead. Copy the asset to install_to, point index.html's <link rel=\"icon\"> at it, and render it as the navbar/app-title mark. The provided brand icon must be the app's icon, not left unused in intake. See the `ux-adherence` smell.";
function checkAppIcon(input) {
  if (!input.appIcon) return { ok: true, violations: [] };
  const violations = [];
  const base = input.installedBasename;
  if (!input.installedExists) {
    violations.push(`brand app icon not installed at "${input.appIcon.install_to}" (declared in the design guide, copied from "${input.appIcon.source}")`);
  }
  const referenced = (src) => src.includes(base);
  if (!referenced(input.indexHtml)) {
    violations.push(`index.html favicon does not reference the brand icon "${base}" (still the scaffold placeholder)`);
  }
  if (!referenced(input.appShell)) {
    violations.push(`the app shell (App.tsx) does not reference the brand icon "${base}" (navbar/title still the placeholder)`);
  }
  return violations.length === 0 ? { ok: true, violations: [] } : { ok: false, violations, remediation: APP_ICON_REMEDIATION };
}
var COMPONENT_VOCAB_REMEDIATION = "The design guide names component classes its `components` declares, but they are not DEFINED in client/src/styles/global.css \u2014 so the app has no styling for that vocabulary and a page applying the class renders unstyled. The UX Designer must author one class per `components` entry (named exactly its `class`), styled through var(--token). This is what turns 'tokens exist on :root' into 'this project's components actually look like the brief' \u2014 the gap that made every app render the generic baseline. See the `ux-adherence` smell.";
function checkComponentVocabularyDefined(declaredClasses, globalCss) {
  if (declaredClasses.length === 0) return { ok: true, missing: [] };
  const missing = declaredClasses.filter((cls) => {
    const re = new RegExp(`\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`);
    return !re.test(globalCss);
  });
  return missing.length === 0 ? { ok: true, missing: [] } : { ok: false, missing, remediation: COMPONENT_VOCAB_REMEDIATION };
}
var UX_CLEAN_REMEDIATION = "The client UI does not fully apply the design guide: a feature page is unreachable (not routed in App.tsx), bare (consumes no design tokens/classes), and/or the declared brand app icon is not applied. Wire every feature page into <Routes> with a nav affordance, style it with the design vocabulary, and install + reference the brand icon. See `ux-adherence`.";
function summarizeUxViolations(r) {
  const parts = [];
  if (!r.reachability.ok) parts.push(`unreachable pages: ${r.reachability.unreachable.join(", ")}`);
  if (!r.tokens.ok) parts.push(`bare (unstyled) pages: ${r.tokens.bare.join(", ")}`);
  if (!r.vocabulary.ok) parts.push(`design classes not defined in global.css: ${r.vocabulary.missing.join(", ")}`);
  if (!r.appIcon.ok) parts.push(`brand app icon not applied: ${r.appIcon.violations.join("; ")}`);
  return parts.join("; ");
}
function checkUxClean(args) {
  const okIcon = { ok: true, violations: [] };
  const okVocab = { ok: true, missing: [] };
  const clean0 = { clean: true, reachability: { ok: true, unreachable: [] }, tokens: { ok: true, bare: [] }, appIcon: okIcon, vocabulary: okVocab };
  const srcDir = args.clientSrcDir ?? join(args.projectDir, "client", "src");
  const appTsx = join(srcDir, "App.tsx");
  const pagesDir = join(srcDir, "pages");
  if (!existsSync(appTsx) || !existsSync(pagesDir)) return clean0;
  const appSource = readFileSync(appTsx, "utf8");
  const pageSources = {};
  const pageComponents = [];
  for (const name of readdirSync(pagesDir)) {
    if (!name.endsWith(".tsx") || name.endsWith(".test.tsx")) continue;
    const src = readFileSync(join(pagesDir, name), "utf8");
    pageSources[name] = src;
    for (const re of [/export\s+function\s+([A-Z][A-Za-z0-9_]*)/g, /export\s+const\s+([A-Z][A-Za-z0-9_]*)/g]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) pageComponents.push(m[1]);
    }
  }
  const reachability = checkRouteReachability({ appSource, pageComponents });
  const tokens = checkTokenConsumption({ pageSources, designClasses: args.designClasses });
  const globalCssPath = join(srcDir, "styles", "global.css");
  const vocabulary = args.designClasses && args.designClasses.length > 0 && existsSync(globalCssPath) ? checkComponentVocabularyDefined(args.designClasses, readFileSync(globalCssPath, "utf8")) : okVocab;
  let appIcon = okIcon;
  if (args.appIcon) {
    const clientDir = join(srcDir, "..");
    const indexHtmlPath = join(clientDir, "index.html");
    const installToPath = join(args.projectDir, args.appIcon.install_to);
    const installedBasename = args.appIcon.install_to.split("/").pop() ?? args.appIcon.install_to;
    appIcon = checkAppIcon({
      appIcon: args.appIcon,
      installedExists: existsSync(installToPath),
      installedBasename,
      indexHtml: existsSync(indexHtmlPath) ? readFileSync(indexHtmlPath, "utf8") : "",
      appShell: appSource
    });
  }
  const clean = reachability.ok && tokens.ok && appIcon.ok && vocabulary.ok;
  return clean ? { clean, reachability, tokens, appIcon, vocabulary } : { clean, reachability, tokens, appIcon, vocabulary, remediation: UX_CLEAN_REMEDIATION };
}

// bin/consort/ux-clean.cli.ts
function parse(argv) {
  const out = { projectDir: process.cwd(), designClasses: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--client-src" && i + 1 < argv.length) out.clientSrc = argv[++i];
    else if (a === "--design-class" && i + 1 < argv.length) out.designClasses.push(argv[++i]);
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}
function help() {
  process.stdout.write(
    `consort-ux-clean \u2013 prove feature pages are reachable + consume the design guide

Usage:
  consort-ux-clean [--project-dir <path>] [--client-src <path>] \\
                          [--design-class <name> ...] [--json]

Exit 0 = clean / no client workspace; exit 1 = an unreachable or bare feature page.
`
  );
  process.exit(0);
}
var p = parse(process.argv.slice(2));
var result = checkUxClean({
  projectDir: p.projectDir,
  ...p.clientSrc ? { clientSrcDir: p.clientSrc } : {},
  ...p.designClasses.length ? { designClasses: p.designClasses } : {}
});
if (p.json) {
  process.stdout.write(`${JSON.stringify(result)}
`);
} else if (result.clean) {
  process.stdout.write(`ux-clean: OK \u2013 every feature page is reachable + consumes the design guide (or no client workspace)
`);
} else {
  const blocks = [];
  if (!result.reachability.ok) {
    blocks.push(`  [reachability]
    unreachable feature pages (not routed in App.tsx): ${result.reachability.unreachable.join(", ")}` + (result.reachability.remediation ? `
    -> ${result.reachability.remediation}` : ""));
  }
  if (!result.tokens.ok) {
    blocks.push(`  [token consumption]
    bare (unstyled) feature pages: ${result.tokens.bare.join(", ")}` + (result.tokens.remediation ? `
    -> ${result.tokens.remediation}` : ""));
  }
  process.stderr.write(`ux-clean: FAILED \u2013 ${summarizeUxViolations(result)}.

${blocks.join("\n\n")}

${UX_CLEAN_REMEDIATION}
`);
}
process.exit(result.clean ? 0 : 1);
