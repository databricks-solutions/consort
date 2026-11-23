// Hermetic test for apply-theme: the wiring that writes client/src/styles/theme.css
// FROM .consort/design/design-guide.json, so the UX designer's derived tokens are
// what the app renders (not the frozen scaffold baseline). Proves: the :root is
// generated from the guide (guide colors present, baseline red absent); it is
// idempotent; it throws loud when no guide exists; and the CLI is registered so
// `./scripts/lk consort-apply-design-theme` resolves.

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildThemeCss, applyDesignGuideTheme } from "../../consort/architecture/apply-theme";
import {
  designGuideToCssVars,
  hexLuminance,
  consortLockupForSurface,
  pageSurfaceColor,
  ensureConsortFooter,
  CONSORT_FOOTER_IMPORT,
  CONSORT_FOOTER_ELEMENT,
} from "../../consort/architecture/design-adherence";

const INDIGO_GUIDE = {
  typography: { font_family: "'Inter', sans-serif", font_mono: "'Roboto Mono', monospace", scale: { "text-hero": "56px" } },
  colors: { brand: { "brand-indigo": "#4840BB" }, semantic: { gain: "#047857" }, surface: { page: "#F8F7FC" } },
  spacing: { "space-5": "24px" },
  radius: { lg: "16px" },
  shadows: { md: "0 4px 16px rgba(0,0,0,0.08)" },
  motion: { "transition-base": "0.2s", "transition-fast": "0.15s" },
};

const dirs: string[] = [];
afterEach(() => { while (dirs.length) { try { rmSync(dirs.pop()!, { recursive: true, force: true }); } catch { /* */ } } });

function scaffold(guide?: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "consort-apply-theme-"));
  dirs.push(dir);
  mkdirSync(join(dir, "client", "src", "styles"), { recursive: true });
  // A frozen baseline theme.css that must be OVERWRITTEN by the guide's tokens.
  writeFileSync(join(dir, "client", "src", "styles", "theme.css"), ":root { --color-brand: #ff3621; --font-sans: \"DM Sans\"; }\n");
  if (guide !== undefined) {
    mkdirSync(join(dir, ".consort", "design"), { recursive: true });
    writeFileSync(join(dir, ".consort", "design", "design-guide.json"), JSON.stringify(guide));
  }
  return dir;
}

describe("buildThemeCss: the theme.css text for a guide", () => {
  it("is a generated banner + a :root block declaring the guide's tokens", () => {
    const css = buildThemeCss(INDIGO_GUIDE);
    expect(css).toMatch(/GENERATED from .*design-guide\.json/);
    for (const [name, value] of Object.entries(designGuideToCssVars(INDIGO_GUIDE))) {
      expect(css).toContain(`  ${name}: ${value};`);
    }
  });
});

describe("applyDesignGuideTheme: overwrites theme.css from the guide", () => {
  it("replaces the frozen baseline with the guide's palette (indigo in, Databricks red out)", () => {
    const dir = scaffold(INDIGO_GUIDE);
    const { themePath, varCount } = applyDesignGuideTheme(dir);
    const css = readFileSync(themePath, "utf8");
    expect(css).toContain("--color-brand-indigo: #4840BB;");
    expect(css).toContain("--color-gain: #047857;");
    expect(css).toContain("--font-sans: 'Inter', sans-serif;");
    expect(css).not.toMatch(/#ff3621/i); // the frozen baseline red is gone
    expect(css).not.toContain("DM Sans");
    expect(varCount).toBeGreaterThan(0);
  });

  it("emits the guide's motion tokens as --<name> vars (so transitions aren't hardcoded in global.css)", () => {
    const dir = scaffold(INDIGO_GUIDE);
    const css = readFileSync(applyDesignGuideTheme(dir).themePath, "utf8");
    expect(css).toContain("--transition-base: 0.2s;");
    expect(css).toContain("--transition-fast: 0.15s;");
  });

  it("is idempotent (re-running yields byte-identical output)", () => {
    const dir = scaffold(INDIGO_GUIDE);
    const p = applyDesignGuideTheme(dir).themePath;
    const once = readFileSync(p, "utf8");
    applyDesignGuideTheme(dir);
    expect(readFileSync(p, "utf8")).toBe(once);
  });

  it("throws loud when there is no design guide (UX designer must run first)", () => {
    const dir = scaffold(undefined);
    expect(() => applyDesignGuideTheme(dir)).toThrowError(/no design guide/i);
  });

  it("no-ops (skipped) with { ifGuide: true } when there is no design guide — the DRIVER post-turn re-freeze path", () => {
    // The driver postTurn re-applies the theme onto the shell it just (re)wrote, but runs on
    // EVERY project — a non-UI (or pre-guide) project has no guide, so ifGuide must no-op, not throw.
    const dir = scaffold(undefined);
    const res = applyDesignGuideTheme(dir, { ifGuide: true });
    expect(res.skipped).toBe(true);
    expect(res.varCount).toBe(0);
    expect(res.iconInstalled).toBe(false);
  });

  it("still applies normally with { ifGuide: true } when a guide IS present (re-freeze on a UI project)", () => {
    const dir = scaffold(INDIGO_GUIDE);
    const res = applyDesignGuideTheme(dir, { ifGuide: true });
    expect(res.skipped).toBeFalsy();
    expect(res.varCount).toBeGreaterThan(0);
    expect(readFileSync(res.themePath, "utf8")).toContain("--color-brand-indigo: #4840BB;");
  });
});

describe("applyDesignGuideTheme: installs the brand icon at design-apply time", () => {
  const ICON_GUIDE = {
    ...INDIGO_GUIDE,
    app_icon: { source: ".consort/design/assets/warehouse.png", install_to: "client/public/warehouse.png" },
    app_name: "StockFlow",
  };

  // The scaffold App.tsx navbar brand the apply step rewrites: the `navbar__icon` placeholder src
  // and the brand title text node inside `navbar__brand`.
  const SCAFFOLD_APP_TSX =
    'export function App() {\n' +
    '  return (\n' +
    '    <nav className="navbar">\n' +
    '      <span className="navbar__brand">\n' +
    '        <img className="navbar__icon" src="/favicon.svg" alt="" />\n' +
    '        my-project\n' +
    '      </span>\n' +
    '    </nav>\n' +
    '  );\n' +
    '}\n';

  function scaffoldWithIcon(declareIcon: boolean): string {
    const dir = scaffold(declareIcon ? ICON_GUIDE : INDIGO_GUIDE);
    // Stage the intake asset (real bytes a coding agent cannot copy via text) + a client
    // index.html carrying the generic scaffold placeholder favicon + the scaffold App.tsx navbar.
    mkdirSync(join(dir, ".consort", "design", "assets"), { recursive: true });
    writeFileSync(join(dir, ".consort", "design", "assets", "warehouse.png"), "PNG-BYTES");
    writeFileSync(join(dir, "client", "index.html"), '<!doctype html><html><head><link rel="icon" type="image/svg+xml" href="/favicon.svg" /></head><body></body></html>');
    writeFileSync(join(dir, "client", "src", "App.tsx"), SCAFFOLD_APP_TSX);
    return dir;
  }

  it("copies the staged asset to install_to AND points the favicon at it", () => {
    const dir = scaffoldWithIcon(true);
    const res = applyDesignGuideTheme(dir);
    expect(res.iconInstalled).toBe(true);
    // bytes landed in client/public
    const installed = join(dir, "client", "public", "warehouse.png");
    expect(existsSync(installed)).toBe(true);
    expect(readFileSync(installed, "utf8")).toBe("PNG-BYTES");
    // favicon reference rewritten off the placeholder onto the brand icon
    const html = readFileSync(join(dir, "client", "index.html"), "utf8");
    expect(html).toContain('href="/warehouse.png"');
    expect(html).not.toContain("favicon.svg");
  });

  it("is a no-op when the guide declares no app_icon (iconInstalled false, nothing installed)", () => {
    const dir = scaffoldWithIcon(false);
    const res = applyDesignGuideTheme(dir);
    expect(res.iconInstalled).toBe(false);
    expect(existsSync(join(dir, "client", "public", "warehouse.png"))).toBe(false);
    expect(readFileSync(join(dir, "client", "index.html"), "utf8")).toContain("favicon.svg");
  });

  it("wires the App.tsx navbar icon src AND title from the guide (so the designer never hand-edits App.tsx)", () => {
    const dir = scaffoldWithIcon(true);
    applyDesignGuideTheme(dir);
    const app = readFileSync(join(dir, "client", "src", "App.tsx"), "utf8");
    // navbar icon points at the installed brand icon (not the scaffold placeholder)
    expect(app).toContain('className="navbar__icon" src="/warehouse.png"');
    expect(app).not.toContain("favicon.svg");
    // brand title text is the guide's app_name (the scaffold "my-project" is replaced)
    expect(app).toMatch(/navbar__brand">[\s\S]*\/>\s*StockFlow\s*<\/span>/);
    expect(app).not.toContain("my-project");
    // checkAppIcon's App.tsx requirement (it just needs the basename referenced) is satisfied
    expect(app).toContain("warehouse.png");
  });

  it("navbar wiring is idempotent (re-running yields byte-identical App.tsx)", () => {
    const dir = scaffoldWithIcon(true);
    const appPath = join(dir, "client", "src", "App.tsx");
    applyDesignGuideTheme(dir);
    const once = readFileSync(appPath, "utf8");
    applyDesignGuideTheme(dir);
    expect(readFileSync(appPath, "utf8")).toBe(once);
  });
});

// The fixed "Made with Consort" footer: the generated theme.css carries a --consort-lockup token
// that picks the wordmark variant CONTRASTING with the app's own surface (white on dark, dark on
// light). It is NOT a guide-declared token, so the adherence gate (which compares only declared
// tokens) ignores it.
describe("--consort-lockup token: light/dark wordmark by the app's own surface", () => {
  const darkGuide = {
    typography: { font_family: "'Inter', sans-serif", scale: { "text-base": "15px" } },
    colors: { surface: { surface: "#11161c" }, brand: { brand: "#4840BB" } },
    spacing: { "space-4": "16px" },
  };
  const lightGuide = {
    typography: { font_family: "'Inter', sans-serif", scale: { "text-base": "15px" } },
    colors: { surface: { surface: "#f9f7f4" }, brand: { brand: "#4840BB" } },
    spacing: { "space-4": "16px" },
  };

  it("emits the WHITE lockup when the page surface is dark", () => {
    expect(buildThemeCss(darkGuide)).toContain('--consort-lockup: url("/consort-lockup-white.svg");');
  });
  it("emits the DARK lockup when the page surface is light", () => {
    expect(buildThemeCss(lightGuide)).toContain('--consort-lockup: url("/consort-lockup.svg");');
  });
  it("defaults to the DARK lockup when no recognizable surface token is present", () => {
    // INDIGO_GUIDE names its surface `page` (→ --color-page) with a LIGHT value, so still dark mark;
    // a guide with no surface color at all also defaults to the dark (light-surface) mark.
    expect(buildThemeCss(INDIGO_GUIDE)).toContain('--consort-lockup: url("/consort-lockup.svg");');
  });
  it("is NOT a guide-declared token (the adherence contract never lists it, so the gate ignores it)", () => {
    expect(Object.keys(designGuideToCssVars(darkGuide))).not.toContain("--consort-lockup");
  });

  it("hexLuminance / consortLockupForSurface / pageSurfaceColor are pure and correct", () => {
    expect(hexLuminance("#000000")).toBeCloseTo(0, 5);
    expect(hexLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(hexLuminance("not-a-hex")).toBeNull();
    expect(consortLockupForSurface("#11161c")).toBe('url("/consort-lockup-white.svg")');
    expect(consortLockupForSurface("#f9f7f4")).toBe('url("/consort-lockup.svg")');
    expect(consortLockupForSurface(undefined)).toBe('url("/consort-lockup.svg")'); // safe light default
    expect(pageSurfaceColor({ "--color-page": "#123456" })).toBe("#123456"); // probes `page` too
    expect(pageSurfaceColor({ "--color-brand": "#abcdef" })).toBeUndefined(); // brand is not a surface
  });
});

describe("ensureConsortFooter: back-fills the footer into an existing App.tsx", () => {
  const APP_TSX =
    'import { Routes, Route } from "react-router-dom";\n' +
    'import { HomePage } from "./pages/HomePage";\n' +
    '\n' +
    'export function App() {\n' +
    '  return (\n' +
    '    <>\n' +
    '      <Routes>\n' +
    '        <Route path="/" element={<HomePage />} />\n' +
    '      </Routes>\n' +
    '    </>\n' +
    '  );\n' +
    '}\n';

  // A real client carries the footer COMPONENT (delivered by the kit-owned refresh); ensureConsortFooter
  // only wires the import when it's present. `withComponent: false` models the version-skew half-state.
  function appProject(appSrc: string, opts: { withComponent?: boolean } = {}): string {
    const dir = mkdtempSync(join(tmpdir(), "consort-footer-"));
    dirs.push(dir);
    mkdirSync(join(dir, "client", "src", "components"), { recursive: true });
    writeFileSync(join(dir, "client", "src", "App.tsx"), appSrc);
    if (opts.withComponent !== false) {
      writeFileSync(join(dir, "client", "src", "components", "MadeWithConsort.tsx"), "export function MadeWithConsort() { return null; }\n");
    }
    return dir;
  }

  it("injects the import + renders <MadeWithConsort/> after </Routes>", () => {
    const dir = appProject(APP_TSX);
    expect(ensureConsortFooter(dir)).toBe(true);
    const app = readFileSync(join(dir, "client", "src", "App.tsx"), "utf8");
    expect(app).toContain(CONSORT_FOOTER_IMPORT);
    expect(app).toMatch(/<\/Routes>\s*\n\s*<MadeWithConsort \/>/);
    expect(app.indexOf(CONSORT_FOOTER_IMPORT)).toBeLessThan(app.indexOf("export function App"));
  });

  it("is idempotent (already-wired App.tsx is a no-op, no duplicate import/element)", () => {
    const dir = appProject(APP_TSX);
    ensureConsortFooter(dir);
    const once = readFileSync(join(dir, "client", "src", "App.tsx"), "utf8");
    expect(ensureConsortFooter(dir)).toBe(false);
    const twice = readFileSync(join(dir, "client", "src", "App.tsx"), "utf8");
    expect(twice).toBe(once);
    expect(twice.match(/import \{ MadeWithConsort \}/g)?.length).toBe(1); // exactly one import
    expect(twice.match(/<MadeWithConsort \/>/g)?.length).toBe(1); // exactly one render site
  });

  it("no-ops (best-effort) when there is no </Routes> seam to anchor on", () => {
    const dir = appProject('export function App() { return <div>bare</div>; }\n');
    expect(ensureConsortFooter(dir)).toBe(false);
    expect(readFileSync(join(dir, "client", "src", "App.tsx"), "utf8")).not.toContain("MadeWithConsort");
  });

  it("ATOMICITY: no-ops when the footer COMPONENT is absent — never wires an import to a missing module", () => {
    // The import-injection (here, consort) and the component delivery (refreshKitOwnedInstrumentation,
    // from scm-utils) can version-skew; injecting the import without the component breaks the client
    // typecheck and gets mis-fixed as an app regression. With no component present, this MUST no-op.
    const dir = appProject(APP_TSX, { withComponent: false });
    expect(ensureConsortFooter(dir)).toBe(false);
    expect(readFileSync(join(dir, "client", "src", "App.tsx"), "utf8")).not.toContain("MadeWithConsort");
  });

  it("CONSORT_FOOTER_ELEMENT is the element string the injector drops in", () => {
    expect(CONSORT_FOOTER_ELEMENT).toBe("<MadeWithConsort />");
  });
});

describe("CLI registration", () => {
  it("consort-apply-design-theme is a registered bin pointing at the built CLI", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8"));
    expect(pkg.bin["consort-apply-design-theme"]).toBe("./dist/bin/consort/apply-design-theme.cli.js");
  });
});
