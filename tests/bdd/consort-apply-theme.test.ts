// Hermetic test for apply-theme: the wiring that writes client/src/styles/theme.css
// FROM .consort/design/design-guide.json, so the UX designer's derived tokens are
// what the app renders (not the frozen scaffold baseline). Proves: the :root is
// generated from the guide (guide colors present, baseline red absent); it is
// idempotent; it throws loud when no guide exists; and the CLI is registered so
// `./scripts/lk consort-apply-design-theme` resolves.

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildThemeCss, applyDesignGuideTheme } from "../../consort/architecture/apply-theme";
import { designGuideToCssVars } from "../../consort/architecture/design-adherence";

const INDIGO_GUIDE = {
  typography: { font_family: "'Inter', sans-serif", font_mono: "'Roboto Mono', monospace", scale: { "text-hero": "56px" } },
  colors: { brand: { "brand-indigo": "#4840BB" }, semantic: { gain: "#047857" }, surface: { page: "#F8F7FC" } },
  spacing: { "space-5": "24px" },
  radius: { lg: "16px" },
  shadows: { md: "0 4px 16px rgba(0,0,0,0.08)" },
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
});

describe("CLI registration", () => {
  it("consort-apply-design-theme is a registered bin pointing at the built CLI", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8"));
    expect(pkg.bin["consort-apply-design-theme"]).toBe("./dist/bin/consort/apply-design-theme.cli.js");
  });
});
