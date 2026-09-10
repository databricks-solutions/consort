// / UX adherence: the design guide is a contract, and "ensures
// adherence" must be machine-enforced, not eyeballed. The running app defines
// its design tokens as CSS custom properties on :root (per the real
// partner-asset-tracker STYLE_GUIDE: tokens in theme.css :root are readable in
// Playwright tests). This checks those rendered :root variables against the
// tokens declared in design-guide.json, so a primary button that renders blue
// or rounded when the guide says red + sharp fails the build.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  designGuideToCssVars,
  renderThemeRootCss,
  checkTokenAdherence,
  assertDesignAdherence,
  checkHardcodedValues,
  checkRequiredSeams,
  checkFeedbackPresent,
  checkRouteReachability,
  checkTokenConsumption,
  checkComponentVocabularyDefined,
  checkAppIcon,
  checkUxClean,
} from "../../consort/architecture/design-adherence";

const GUIDE = {
  typography: { font_family: "DM Sans", font_mono: "DM Mono", scale: { "text-base": "15px" } },
  colors: { brand: { "brand-red": "#FF3621" }, semantic: { success: "#2E844A" } },
  spacing: { "space-4": "16px" },
  radius: { "radius-none": "0px" },
};

describe("designGuideToCssVars: flattens a guide to CSS custom properties", () => {
  it("maps tokens to their --css-var names by convention", () => {
    const vars = designGuideToCssVars(GUIDE);
    expect(vars["--font-sans"]).toBe("DM Sans");
    expect(vars["--font-mono"]).toBe("DM Mono");
    expect(vars["--text-base"]).toBe("15px");
    expect(vars["--color-brand-red"]).toBe("#FF3621");
    expect(vars["--color-success"]).toBe("#2E844A");
    expect(vars["--space-4"]).toBe("16px");
    expect(vars["--radius-none"]).toBe("0px");
  });

  it("maps the expanded typography tokens (line_heights, font_weights) to prefixed vars", () => {
    const vars = designGuideToCssVars({
      ...GUIDE,
      typography: {
        ...GUIDE.typography,
        line_heights: { body: "1.5", heading: "1.25" },
        font_weights: { regular: "400", medium: "500" },
      },
    });
    expect(vars["--line-height-body"]).toBe("1.5");
    expect(vars["--line-height-heading"]).toBe("1.25");
    expect(vars["--font-weight-regular"]).toBe("400");
    expect(vars["--font-weight-medium"]).toBe("500");
  });

  it("omits the expanded typography vars when the guide does not declare them", () => {
    const vars = designGuideToCssVars(GUIDE);
    expect(Object.keys(vars).some((k) => k.startsWith("--line-height-"))).toBe(false);
    expect(Object.keys(vars).some((k) => k.startsWith("--font-weight-"))).toBe(false);
  });
});

describe("renderThemeRootCss: generates the :root token block FROM the guide", () => {
  it("emits a :root block declaring every token the checker expects (adherence holds by construction)", () => {
    const css = renderThemeRootCss(GUIDE);
    expect(css.startsWith(":root {")).toBe(true);
    expect(css.trimEnd().endsWith("}")).toBe(true);
    // Every var designGuideToCssVars produces appears as a declaration.
    const declared = designGuideToCssVars(GUIDE);
    for (const [name, value] of Object.entries(declared)) {
      expect(css).toContain(`  ${name}: ${value};`);
    }
  });

  it("round-trips: parsing the generated :root back yields exactly the declared vars", () => {
    // This is the guarantee that made the UX designer real: what renders IS what
    // the guide declares. Parse `  --x: v;` lines back and compare to the checker's map.
    const css = renderThemeRootCss(GUIDE);
    const parsed: Record<string, string> = {};
    for (const m of css.matchAll(/^\s*(--[\w-]+):\s*(.+);$/gm)) {
      parsed[m[1]] = m[2];
    }
    expect(parsed).toEqual(designGuideToCssVars(GUIDE));
    // And that map, fed to the adherence checker as the rendered side, passes.
    expect(checkTokenAdherence(designGuideToCssVars(GUIDE), parsed).ok).toBe(true);
  });

  it("re-skins to a DIFFERENT guide's palette (proves it is not the frozen baseline)", () => {
    const indigo = renderThemeRootCss({
      typography: { font_family: "Inter", font_mono: "Roboto Mono", scale: { "text-hero": "56px" } },
      colors: { brand: { "brand-indigo": "#4840BB" }, semantic: { gain: "#047857" } },
      spacing: { "space-5": "24px" },
      radius: { lg: "16px" },
    });
    expect(indigo).toContain("--color-brand-indigo: #4840BB;");
    expect(indigo).toContain("--font-sans: Inter;");
    expect(indigo).not.toContain("#FF3621"); // never the Databricks baseline red
    expect(indigo).not.toContain("DM Sans");
  });
});

describe("checkTokenAdherence: rendered :root vars vs declared tokens", () => {
  const declared = designGuideToCssVars(GUIDE);

  it("ok when every declared token matches the rendered value (case/space-insensitive)", () => {
    const rendered = {
      "--font-sans": "DM Sans",
      "--font-mono": "DM Mono",
      "--text-base": "15px",
      "--color-brand-red": " #ff3621 ", // whitespace + lowercase still matches
      "--color-success": "#2E844A",
      "--space-4": "16px",
      "--radius-none": "0px",
    };
    expect(checkTokenAdherence(declared, rendered).ok).toBe(true);
  });

  it("reports a mismatch when a rendered value differs from the declared token", () => {
    const rendered = { ...{ "--font-sans": "DM Sans", "--font-mono": "DM Mono", "--text-base": "15px", "--color-success": "#2E844A", "--space-4": "16px", "--radius-none": "0px" }, "--color-brand-red": "#0000FF" };
    const r = checkTokenAdherence(declared, rendered);
    expect(r.ok).toBe(false);
    const brand = r.mismatches.find((m) => m.cssVar === "--color-brand-red");
    expect(brand?.expected).toBe("#FF3621");
    expect(brand?.actual).toBe("#0000FF");
  });

  it("reports a missing var when the app does not define a declared token", () => {
    const rendered = { "--font-sans": "DM Sans" }; // everything else absent
    const r = checkTokenAdherence(declared, rendered);
    expect(r.ok).toBe(false);
    const missing = r.mismatches.find((m) => m.cssVar === "--color-brand-red");
    expect(missing?.actual).toBeUndefined();
  });
});

describe("assertDesignAdherence: reads :root from a page-like reader", () => {
  // A minimal reader stands in for a Playwright Page: it returns the computed
  // value of each requested CSS custom property.
  function readerFrom(vars: Record<string, string>) {
    return {
      evaluate: async (_fn: unknown, names: string[]) =>
        Object.fromEntries(names.map((n) => [n, vars[n] ?? ""])),
    };
  }

  it("resolves when the rendered tokens match the guide", async () => {
    const reader = readerFrom({
      "--font-sans": "DM Sans",
      "--font-mono": "DM Mono",
      "--text-base": "15px",
      "--color-brand-red": "#FF3621",
      "--color-success": "#2E844A",
      "--space-4": "16px",
      "--radius-none": "0px",
    });
    await expect(assertDesignAdherence(reader, GUIDE)).resolves.toBeUndefined();
  });

  it("throws naming the mismatched token when the UI drifts from the guide", async () => {
    const reader = readerFrom({
      "--font-sans": "DM Sans",
      "--font-mono": "DM Mono",
      "--text-base": "15px",
      "--color-brand-red": "#0000FF", // wrong
      "--color-success": "#2E844A",
      "--space-4": "16px",
      "--radius-none": "0px",
    });
    await expect(assertDesignAdherence(reader, GUIDE)).rejects.toThrow(/--color-brand-red/);
  });
});

// ─── Element-level adherence (increment B) ───────────────────────
// A UI can set :root tokens yet never USE them. These checks read the rendered
// markup/styles and flag the element-level gaps the token check cannot see:
// hardcoded design values, missing data-testid seams, actions with no feedback.

describe("checkHardcodedValues: hardcoded design values that should be tokens", () => {
  it("flags a raw hex color in an inline style", () => {
    const html = `<button style="color: #FF3621">Save</button>`;
    const r = checkHardcodedValues(html);
    expect(r.ok).toBe(false);
    expect(r.violations.join("\n")).toMatch(/#FF3621/);
  });

  it("flags a raw px font-size / spacing in a <style> block", () => {
    const css = `<style>.card { font-size: 15px; padding: 16px; }</style>`;
    const r = checkHardcodedValues(css);
    expect(r.ok).toBe(false);
    expect(r.violations.join("\n")).toMatch(/15px/);
  });

  it("ok when values come from var(--token)", () => {
    const html = `<button style="color: var(--color-brand-red); font-size: var(--text-base)">Save</button>`;
    expect(checkHardcodedValues(html).ok).toBe(true);
  });

  it("exempts the :root token DEFINITIONS themselves", () => {
    const css = `<style>:root { --color-brand-red: #FF3621; --text-base: 15px; --space-4: 16px; }</style>`;
    expect(checkHardcodedValues(css).ok).toBe(true);
  });
});

describe("checkRequiredSeams: every required data-testid must be rendered", () => {
  const html = `<form data-testid="bug-form"><input data-testid="bug-title" /></form>`;

  it("ok when every required testid appears", () => {
    expect(checkRequiredSeams(html, ["bug-form", "bug-title"]).ok).toBe(true);
  });

  it("flags a missing required testid", () => {
    const r = checkRequiredSeams(html, ["bug-form", "bug-status"]);
    expect(r.ok).toBe(false);
    expect(r.violations.join("\n")).toMatch(/bug-status/);
  });

  it("ok when no seams are required (nothing to check)", () => {
    expect(checkRequiredSeams(html, []).ok).toBe(true);
  });
});

describe("checkFeedbackPresent: an action surface has a feedback affordance", () => {
  it("flags a form with no feedback affordance anywhere", () => {
    const html = `<form><input name="title" /><button type="submit">Save</button></form>`;
    const r = checkFeedbackPresent(html);
    expect(r.ok).toBe(false);
    expect(r.violations.length).toBeGreaterThan(0);
  });

  it("ok when a role=alert feedback element is present", () => {
    const html = `<form><button type="submit">Save</button><div role="alert"></div></form>`;
    expect(checkFeedbackPresent(html).ok).toBe(true);
  });

  it("ok when a data-testid feedback seam is present", () => {
    const html = `<form><button type="submit">Save</button><p data-testid="form-error"></p></form>`;
    expect(checkFeedbackPresent(html).ok).toBe(true);
  });

  it("ok when there is no action surface to give feedback for", () => {
    const html = `<main><h1>Bugs</h1><p>nothing actionable here</p></main>`;
    expect(checkFeedbackPresent(html).ok).toBe(true);
  });
});

// ── Route reachability (increment C): every feature page is wired into App.tsx ──
describe("checkRouteReachability: feature pages must be reachable from App.tsx routes", () => {
  const APP_ONE_ROUTE = `
    import { Routes, Route } from "react-router-dom";
    import { HomePage } from "./pages/HomePage";
    export function App() {
      return (<Routes><Route path="/" element={<HomePage />} /></Routes>);
    }`;
  const APP_ALL = `
    import { Routes, Route } from "react-router-dom";
    export function App() {
      return (<Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/location/:loc" element={<StockByLocationPage />} />
        <Route path="/sku/:sku" element={<SkuDetailPage />} />
      </Routes>);
    }`;

  it("flags a page component that is never routed", () => {
    const r = checkRouteReachability({
      appSource: APP_ONE_ROUTE,
      pageComponents: ["HomePage", "StockByLocationPage", "SkuDetailPage"],
    });
    expect(r.ok).toBe(false);
    expect(r.unreachable).toEqual(expect.arrayContaining(["StockByLocationPage", "SkuDetailPage"]));
    expect(r.unreachable).not.toContain("HomePage");
    expect(r.remediation).toBeTruthy();
  });

  it("ok when every page is routed via element={<X/>}", () => {
    const r = checkRouteReachability({
      appSource: APP_ALL,
      pageComponents: ["HomePage", "StockByLocationPage", "SkuDetailPage"],
    });
    expect(r.ok).toBe(true);
    expect(r.unreachable).toEqual([]);
  });

  it("recognizes the Component={X} route form", () => {
    const app = `<Routes><Route path="/x" Component={StockByLocationPage} /></Routes>`;
    const r = checkRouteReachability({ appSource: app, pageComponents: ["StockByLocationPage"] });
    expect(r.ok).toBe(true);
  });

  it("empty inventory is trivially reachable", () => {
    expect(checkRouteReachability({ appSource: APP_ONE_ROUTE, pageComponents: [] }).ok).toBe(true);
  });

  it("an exempt component (composed inside another page) is not flagged", () => {
    const r = checkRouteReachability({
      appSource: APP_ONE_ROUTE,
      pageComponents: ["HomePage", "StockPanel"],
      exemptComponents: ["StockPanel"],
    });
    expect(r.ok).toBe(true);
  });
});

// ── Token consumption (increment C): feature pages must APPLY the design guide ──
describe("checkTokenConsumption: a feature page must consume tokens / the design vocabulary", () => {
  const BARE = `export function P(){ return (<table><tr><td>{x}</td></tr></table>); }`;
  const VAR = `export function P(){ return (<div style={{color:"var(--color-brand-red)"}}>hi</div>); }`;
  const CLASS = `export function P(){ return (<main className="page"><div className="card"/></main>); }`;

  it("flags a page that renders structure with zero var() and zero design class", () => {
    const r = checkTokenConsumption({ pageSources: { "SkuDetailPage.tsx": BARE } });
    expect(r.ok).toBe(false);
    expect(r.bare).toContain("SkuDetailPage.tsx");
    expect(r.remediation).toBeTruthy();
  });

  it("ok when the page consumes a var(--token)", () => {
    expect(checkTokenConsumption({ pageSources: { "P.tsx": VAR } }).ok).toBe(true);
  });

  it("ok when the page uses a design-class from the vocabulary", () => {
    const r = checkTokenConsumption({ pageSources: { "P.tsx": CLASS }, designClasses: ["page", "card", "btn"] });
    expect(r.ok).toBe(true);
  });

  it("flags a page that uses only ad-hoc classes not in the design vocabulary", () => {
    const adhoc = `export function P(){ return (<div className="my-random-wrapper"><span/></div>); }`;
    const r = checkTokenConsumption({ pageSources: { "P.tsx": adhoc }, designClasses: ["page", "card", "btn"] });
    expect(r.ok).toBe(false);
    expect(r.bare).toContain("P.tsx");
  });
});

describe("checkComponentVocabularyDefined: the guide's component classes must be defined in global.css", () => {
  it("ok when every declared class has a selector in global.css", () => {
    const css = ".hero-value { font-size: var(--text-hero); }\n.delta { color: var(--color-gain); }\n.holdings-table { width: 100%; }";
    expect(checkComponentVocabularyDefined(["hero-value", "delta", "holdings-table"], css).ok).toBe(true);
  });

  it("flags a class the guide names but global.css never defines (a page applying it renders bare)", () => {
    const css = ".hero-value { font-size: var(--text-hero); }"; // delta + holdings-table missing
    const r = checkComponentVocabularyDefined(["hero-value", "delta", "holdings-table"], css);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["delta", "holdings-table"]);
    expect(r.remediation).toMatch(/global\.css/);
  });

  it("does not treat a --modifier class as defining its base (.badge vs .badge--gain)", () => {
    // Only `.badge--gain` present must NOT satisfy a declared `.badge`.
    expect(checkComponentVocabularyDefined(["badge"], ".badge--gain { color: red; }").ok).toBe(false);
    expect(checkComponentVocabularyDefined(["badge"], ".badge { border-radius: var(--radius-pill); }").ok).toBe(true);
  });

  it("trivially ok when the guide declares no component classes", () => {
    expect(checkComponentVocabularyDefined([], "").ok).toBe(true);
  });
});

// ── checkUxClean (I/O boundary): scans a project's client/, no-op without one ──
describe("checkUxClean: project-level UX gate (UI-track only)", () => {
  let dir: string;
  const mkClient = (app: string, pages: Record<string, string>, globalCss?: string): void => {
    mkdirSync(join(dir, "client", "src", "pages"), { recursive: true });
    writeFileSync(join(dir, "client", "package.json"), "{}");
    writeFileSync(join(dir, "client", "src", "App.tsx"), app);
    for (const [name, src] of Object.entries(pages)) {
      writeFileSync(join(dir, "client", "src", "pages", name), src);
    }
    if (globalCss !== undefined) {
      mkdirSync(join(dir, "client", "src", "styles"), { recursive: true });
      writeFileSync(join(dir, "client", "src", "styles", "global.css"), globalCss);
    }
  };
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "uxclean-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("clean (no-op) when there is no client/ workspace", () => {
    expect(checkUxClean({ projectDir: dir }).clean).toBe(true);
  });

  it("not clean when a feature page is unrouted", () => {
    mkClient(
      `import {Routes,Route} from "react-router-dom";
       export function App(){return(<Routes><Route path="/" element={<HomePage/>}/></Routes>);}`,
      {
        "HomePage.tsx": `export function HomePage(){return(<main className="page"/>);}`,
        "SkuDetailPage.tsx": `export function SkuDetailPage(){return(<main className="page"><div className="card"/></main>);}`,
      },
    );
    const r = checkUxClean({ projectDir: dir });
    expect(r.clean).toBe(false);
    expect(r.reachability.unreachable).toContain("SkuDetailPage");
  });

  it("not clean when a routed feature page is bare (no tokens / classes)", () => {
    mkClient(
      `import {Routes,Route} from "react-router-dom";
       export function App(){return(<Routes>
         <Route path="/" element={<HomePage/>}/>
         <Route path="/sku" element={<SkuDetailPage/>}/>
       </Routes>);}`,
      {
        "HomePage.tsx": `export function HomePage(){return(<main className="page"/>);}`,
        "SkuDetailPage.tsx": `export function SkuDetailPage(){return(<table><tr><td>{x}</td></tr></table>);}`,
      },
    );
    const r = checkUxClean({ projectDir: dir });
    expect(r.clean).toBe(false);
    expect(r.tokens.bare).toContain("SkuDetailPage.tsx");
  });

  it("clean when every feature page is routed and styled", () => {
    mkClient(
      `import {Routes,Route} from "react-router-dom";
       export function App(){return(<Routes>
         <Route path="/" element={<HomePage/>}/>
         <Route path="/sku" element={<SkuDetailPage/>}/>
       </Routes>);}`,
      {
        "HomePage.tsx": `export function HomePage(){return(<main className="page"/>);}`,
        "SkuDetailPage.tsx": `export function SkuDetailPage(){return(<main className="page"><div className="card" style={{gap:"var(--space-4)"}}/></main>);}`,
      },
    );
    expect(checkUxClean({ projectDir: dir }).clean).toBe(true);
  });

  it("not clean when the guide names a component class that global.css never defines", () => {
    // The page applies the guide's own class (.holdings-table), but global.css only
    // defines .card -> the class the design system promises has no styling -> bare.
    mkClient(
      `import {Routes,Route} from "react-router-dom";
       export function App(){return(<Routes><Route path="/" element={<HomePage/>}/></Routes>);}`,
      { "HomePage.tsx": `export function HomePage(){return(<table className="holdings-table"/>);}` },
      ".card { background: var(--color-card); }", // .holdings-table NOT defined
    );
    const r = checkUxClean({ projectDir: dir, designClasses: ["card", "holdings-table"] });
    expect(r.clean).toBe(false);
    expect(r.vocabulary.ok).toBe(false);
    expect(r.vocabulary.missing).toContain("holdings-table");
  });

  it("clean when global.css defines every class the guide's vocabulary names", () => {
    mkClient(
      `import {Routes,Route} from "react-router-dom";
       export function App(){return(<Routes><Route path="/" element={<HomePage/>}/></Routes>);}`,
      { "HomePage.tsx": `export function HomePage(){return(<main className="page"><table className="holdings-table"/></main>);}` },
      ".page { max-width: 960px; } .holdings-table { width: 100%; font-family: var(--font-mono); }",
    );
    const r = checkUxClean({ projectDir: dir, designClasses: ["page", "holdings-table"] });
    expect(r.vocabulary.ok).toBe(true);
    expect(r.clean).toBe(true);
  });

  it("flags the brand app icon as not applied when the guide declares it but the shell keeps the placeholder", () => {
    // Routed + styled page (so reachability + tokens pass), a guide that declares an
    // app_icon, but no installed asset and a shell/index that still point at favicon.svg.
    mkClient(
      `import {Routes,Route} from "react-router-dom";
       export function App(){return(<><img src="/favicon.svg"/><Routes><Route path="/" element={<HomePage/>}/></Routes></>);}`,
      { "HomePage.tsx": `export function HomePage(){return(<main className="page"/>);}` },
    );
    writeFileSync(join(dir, "client", "index.html"), `<link rel="icon" href="/favicon.svg" />`);
    const r = checkUxClean({ projectDir: dir, appIcon: { source: "intake/assets/warehouse.png", install_to: "client/public/warehouse.png" } });
    expect(r.clean).toBe(false);
    expect(r.appIcon.ok).toBe(false);
    // Names all three misses: not installed, index.html not referencing, shell not referencing.
    expect(r.appIcon.violations.join(" ")).toMatch(/not installed/);
    expect(r.appIcon.violations.join(" ")).toMatch(/index\.html/);
  });

  it("clean when the declared brand app icon is installed and referenced by index.html + the shell", () => {
    mkClient(
      `import {Routes,Route} from "react-router-dom";
       export function App(){return(<><img src="/warehouse.png"/><Routes><Route path="/" element={<HomePage/>}/></Routes></>);}`,
      { "HomePage.tsx": `export function HomePage(){return(<main className="page"/>);}` },
    );
    writeFileSync(join(dir, "client", "index.html"), `<link rel="icon" href="/warehouse.png" />`);
    mkdirSync(join(dir, "client", "public"), { recursive: true });
    writeFileSync(join(dir, "client", "public", "warehouse.png"), "PNGDATA");
    const r = checkUxClean({ projectDir: dir, appIcon: { source: "intake/assets/warehouse.png", install_to: "client/public/warehouse.png" } });
    expect(r.appIcon.ok).toBe(true);
    expect(r.clean).toBe(true);
  });
});

describe("checkAppIcon: the declared brand icon must be installed + referenced", () => {
  const base = { installedBasename: "warehouse.png", indexHtml: `<link rel="icon" href="/warehouse.png"/>`, appShell: `<img src="/warehouse.png"/>` };
  it("trivially ok when the guide declares no app icon", () => {
    expect(checkAppIcon({ ...base, appIcon: undefined, installedExists: false }).ok).toBe(true);
  });
  it("ok when installed + referenced by both shell surfaces", () => {
    const r = checkAppIcon({ ...base, appIcon: { source: "intake/assets/warehouse.png", install_to: "client/public/warehouse.png" }, installedExists: true });
    expect(r.ok).toBe(true);
  });
  it("flags a missing installed asset", () => {
    const r = checkAppIcon({ ...base, appIcon: { source: "intake/assets/warehouse.png", install_to: "client/public/warehouse.png" }, installedExists: false });
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/not installed/);
  });
  it("flags the placeholder: shell + index still reference favicon.svg, not the brand icon", () => {
    const r = checkAppIcon({
      appIcon: { source: "intake/assets/warehouse.png", install_to: "client/public/warehouse.png" },
      installedExists: true,
      installedBasename: "warehouse.png",
      indexHtml: `<link rel="icon" href="/favicon.svg"/>`,
      appShell: `<img src="/favicon.svg"/>`,
    });
    expect(r.ok).toBe(false);
    expect(r.violations.length).toBe(2); // index.html + shell
  });
});
