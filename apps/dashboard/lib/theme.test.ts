import { describe, it, expect } from "vitest";
import {
  surface,
  border,
  text,
  status,
  roleColor,
  surfaceDark,
  borderDark,
  textDark,
  statusDark,
  roleColorDark,
  colorForRole,
  cssVariables,
  font,
  radius,
} from "./theme";
import { ROLES } from "./types";

// Item 6 of the merge plan is explicit that promoting the palette into tokens is "a
// refactor of plumbing, not of appearance". These tests are what make that checkable:
// every token is pinned to the literal it replaced, transcribed from app/page.tsx and
// app/AgentBubble.tsx as of commit 3883f4f (the merge of PR #9, before this refactor).
//
// A failure here means a token's VALUE changed. That is either a bug in the refactor or a
// deliberate restyle — and if it's deliberate, this file is the place to say so.

describe("theme — values are unchanged from the pre-refactor literals", () => {
  it("surfaces", () => {
    expect(surface.page).toBe("#F3F4F6");
    expect(surface.card).toBe("#fff");
    expect(surface.muted).toBe("#FAFAFA");
    expect(surface.inset).toBe("#F3F4F6");
    expect(surface.terminal).toBe("#111827");
    expect(surface.code).toBe("#1F2937");
  });

  it("borders", () => {
    expect(border.default).toBe("#E5E7EB");
    expect(border.strong).toBe("#D1D5DB");
  });

  it("text", () => {
    expect(text.strong).toBe("#111827");
    expect(text.heading).toBe("#374151");
    expect(text.body).toBe("#4B5563");
    expect(text.muted).toBe("#6B7280");
    expect(text.faint).toBe("#9CA3AF");
    expect(text.onDark).toBe("#E5E7EB");
    expect(text.onDarkMuted).toBe("#D1D5DB");
    expect(text.onDarkFaint).toBe("#6B7280");
    expect(text.onDarkAccent).toBe("#60A5FA");
    expect(text.onCode).toBe("#FDE68A");
  });

  it("the Consort accent orange and its tints", () => {
    expect(status.accent).toBe("#FF7033");
    expect(status.accentText).toBe("#C2410C");
    expect(status.accentTint).toBe("rgba(255,112,51,0.12)");
    expect(status.accentTintSoft).toBe("rgba(255, 112, 51, 0.08)");
    expect(status.accentGlow).toBe("rgba(255,112,51,0.35)");
  });

  it("good / critical / warning", () => {
    expect(status.good).toBe("#10B981");
    expect(status.goodLight).toBe("#34D399");
    expect(status.goodText).toBe("#047857");
    expect(status.goodTint).toBe("rgba(16,185,129,0.10)");
    expect(status.goodTintSoft).toBe("rgba(16,185,129,0.08)");

    expect(status.critical).toBe("#EF4444");
    expect(status.criticalText).toBe("#DC2626");
    expect(status.criticalTextDeep).toBe("#B91C1C");
    expect(status.criticalSoft).toBe("#FECACA");
    expect(status.criticalTint).toBe("rgba(239,68,68,0.12)");
    expect(status.criticalTintSoft).toBe("rgba(239, 68, 68, 0.08)");
    expect(status.criticalTintFaint).toBe("rgba(239,68,68,0.03)");

    expect(status.warning).toBe("#F59E0B");
    expect(status.warningAmber).toBe("#FBBF24");
    expect(status.warningText).toBe("#B45309");
    expect(status.warningTextDeep).toBe("#92400E");
    expect(status.warningSoft).toBe("#FDE68A");
    expect(status.warningTint).toBe("rgba(245,158,11,0.14)");
    expect(status.warningTintFaint).toBe("rgba(245,158,11,0.04)");
    expect(status.warningTicker).toBe("#D97706");
  });

  it("gate purple stays distinct from warning amber", () => {
    // The distinction is semantic: "waiting on a human decision" must not read as "something
    // is wrong". Collapsing these into one token would lose that.
    expect(status.gate).toBe("#A855F7");
    expect(status.gateText).toBe("#7C3AED");
    expect(status.gateTextDeep).toBe("#6D28D9");
    expect(status.gateSoft).toBe("#DDD6FE");
    expect(status.gateTint).toBe("rgba(168,85,247,0.12)");
    expect(status.gateTintSoft).toBe("rgba(168, 85, 247, 0.10)");
    expect(status.gateTintFaint).toBe("rgba(168,85,247,0.04)");
    expect(status.gate).not.toBe(status.warning);
  });

  it("discarded gold and on-deck blue", () => {
    expect(status.discarded).toBe("#D9A406");
    expect(status.discardedText).toBe("#92750A");
    expect(status.discardedTint).toBe("rgba(217,164,6,0.12)");
    expect(status.onDeck).toBe("#3B82F6");
    expect(status.onDeckTint).toBe("rgba(59, 130, 246, 0.08)");
  });

  it("the role palette, exactly as AGENT_COLORS had it", () => {
    expect(roleColor).toEqual({
      orchestrator: "#6B7280",
      "spec-author": "#3B82F6",
      "ux-designer": "#EC4899",
      "architect-reviewer": "#8B5CF6",
      dba: "#F59E0B",
      "test-strategist": "#14B8A6",
      navigator: "#FF7033",
      driver: "#10B981",
      "product-owner": "#EF4444",
      "release-engineer": "#0EA5E9",
    });
  });

  it("keeps non-color tokens stable too", () => {
    expect(radius).toEqual({ card: 14, panel: 10, chip: 6, step: 7 });
    expect(font.sans).toContain("-apple-system");
    expect(font.mono).toContain("ui-monospace");
  });
});

describe("theme — palette integrity", () => {
  it("covers every known role", () => {
    for (const r of ROLES) expect(roleColor[r], r).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(Object.keys(roleColor).sort()).toEqual([...ROLES].sort());
  });

  it("gives every role a visually distinct color", () => {
    const values = Object.values(roleColor).map((v) => v.toLowerCase());
    expect(new Set(values).size).toBe(values.length);
  });

  it("colorForRole returns a themeable var, degrading unknown roles to the faint var", () => {
    // Returns a CSS var (not a literal) so the color follows data-theme; the fallback is the
    // faint var rather than undefined.
    expect(colorForRole("navigator")).toBe("var(--role-navigator)");
    expect(colorForRole("future-role")).toBe("var(--text-faint)");
    // and does not inherit from Object.prototype (same class of bug as topology's lookups)
    for (const k of ["constructor", "toString", "valueOf", "__proto__"]) {
      expect(colorForRole(k), k).toBe("var(--text-faint)");
    }
  });

  it("every token is a parseable CSS color", () => {
    const ok = /^(#[0-9A-Fa-f]{3,8}|rgba?\([\d\s.,]+\))$/;
    const tables = [surface, border, text, status, surfaceDark, borderDark, textDark, statusDark];
    for (const table of tables as Record<string, string>[]) {
      for (const [k, v] of Object.entries(table)) expect(v, k).toMatch(ok);
    }
  });
});

describe("theme — dark theme (Kevin's palette)", () => {
  it("ports Kevin's warm surfaces and tan text", () => {
    expect(surfaceDark.page).toBe("#0d0d0d");
    expect(surfaceDark.card).toBe("#1a1a19");
    expect(surfaceDark.inset).toBe("#222220");
    expect(surfaceDark.code).toBe("#2a2a28");
    expect(textDark.strong).toBe("#ffffff");
    expect(textDark.body).toBe("#c3c2b7"); // Kevin --text-secondary
    expect(textDark.muted).toBe("#898781"); // Kevin --muted
    expect(borderDark.default).toBe("rgba(255,255,255,0.10)");
  });

  it("uses Kevin's good/warning/critical base colors", () => {
    expect(statusDark.good).toBe("#0ca30c");
    expect(statusDark.warning).toBe("#fab219");
    expect(statusDark.critical).toBe("#d03b3b");
  });

  it("maps roles to Kevin's c1…c10 hues, keeping navigator orange and driver green", () => {
    expect(roleColorDark.navigator).toBe("#d95926"); // c6, orange like the light theme
    expect(roleColorDark.driver).toBe("#008300"); // c2, green like the light theme
    expect(roleColorDark.orchestrator).toBe("#898781"); // warm grey
  });

  it("gives every dark role a visually distinct color", () => {
    const values = Object.values(roleColorDark).map((v) => v.toLowerCase());
    expect(new Set(values).size).toBe(values.length);
  });

  // Completeness: every light token must have a dark counterpart, or an element themed for
  // light silently keeps its light color on a dark board. (The Tokens<T> typing enforces this
  // at compile time; this pins it at runtime too.)
  it("themes every token that the light theme themes — no half-themed element", () => {
    const pairs: [Record<string, string>, Record<string, string>][] = [
      [surface, surfaceDark],
      [border, borderDark],
      [text, textDark],
      [status, statusDark],
      [roleColor, roleColorDark],
    ];
    for (const [light, dark] of pairs) {
      expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    }
  });
});

describe("theme — cssVariables", () => {
  const css = cssVariables();
  // Split into the two emitted blocks: light `:root { … }` then dark `:root[data-theme="dark"] { … }`.
  const lightBlock = css.slice(0, css.indexOf(':root[data-theme="dark"]'));
  const darkBlock = css.slice(css.indexOf(':root[data-theme="dark"]'));
  const declaredIn = (block: string) => [...block.matchAll(/^\s*--([a-z0-9-]+):/gm)].map((m) => m[1]);

  it("emits a light :root block and a dark data-theme block", () => {
    expect(css.startsWith(":root {")).toBe(true);
    expect(css).toContain(':root[data-theme="dark"] {');
    expect(css.trimEnd().endsWith("}")).toBe(true);
  });

  it("sets color-scheme per block", () => {
    expect(lightBlock).toContain("color-scheme: light;");
    expect(darkBlock).toContain("color-scheme: dark;");
  });

  it("kebab-cases camelCase token names", () => {
    expect(css).toContain("--text-on-dark-accent: #60A5FA;");
    expect(css).toContain("--status-accent-tint-soft: rgba(255, 112, 51, 0.08);");
    expect(css).toContain("--surface-page: #F3F4F6;");
  });

  it("exposes every role in both blocks with the block's own values", () => {
    for (const r of ROLES) {
      expect(lightBlock, r).toContain(`--role-${r}: ${roleColor[r]};`);
      expect(darkBlock, r).toContain(`--role-${r}: ${roleColorDark[r]};`);
    }
  });

  it("exposes the dark surface/text values in the dark block", () => {
    expect(darkBlock).toContain("--surface-page: #0d0d0d;");
    expect(darkBlock).toContain("--text-body: #c3c2b7;");
  });

  it("exposes every token from every table in each block", () => {
    const counts = [surface, border, text, status].reduce((n, t) => n + Object.keys(t).length, 0);
    for (const block of [lightBlock, darkBlock]) {
      const declared = declaredIn(block);
      expect(declared.length).toBe(counts + ROLES.length);
      // no duplicate declarations within a block, which would make precedence depend on emit order
      expect(new Set(declared).size).toBe(declared.length);
    }
  });

  it("is deterministic across calls", () => {
    expect(cssVariables()).toBe(css);
  });
});
