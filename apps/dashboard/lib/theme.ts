// The dashboard's design tokens — the single source of truth for color.
//
// Before this existed, ~60 color literals were spread across page.tsx and AgentBubble.tsx
// as inline styles, and the role palette was a private const in page.tsx. Phase 1 item 6
// of the merge plan promotes both into a token layer, adopting the idea (though not the
// naming) from Kevin's CSS custom properties — his `--c1…--c10 / --good / --warning` is
// better engineering than inline-literals-everywhere.
//
// The `surface`/`border`/`text`/`status`/`roleColor` objects below are the LIGHT theme;
// their values are unchanged from the inline literals they replaced (lib/theme.test.ts
// pins every one against the pre-refactor value so a "tidy-up" can't quietly restyle the
// board). The `*Dark` objects are the DARK theme — a port of Kevin's original dashboard
// palette (warm near-black surfaces, tan secondary text, his c1…c10 role hues). Each dark
// object is typed against the light object's keys, so the compiler rejects a token that is
// themed for light but not dark (a half-themed element).
//
// One consumer, one mechanism: components read colors as CSS custom properties
// (`var(--surface-page)`), never the JS values directly. `cssVariables()` renders BOTH a
// light `:root` block and a `:root[data-theme="dark"]` block that layout.tsx injects, so
// flipping the `data-theme` attribute on <html> re-themes everything — inline styles, CSS,
// and SVG alike — with no React re-render. The JS objects remain the source the CSS vars
// are generated from (and what the tests pin), not something components import for styling.

import { ROLES, type Role } from "./types";

// --- surfaces ---------------------------------------------------------------
export const surface = {
  page: "#F3F4F6", // app background
  card: "#fff", // cards, chips, buttons
  muted: "#FAFAFA", // idle agent bubble
  inset: "#F3F4F6", // progress-bar troughs, not-started steps
  terminal: "#111827", // event ticker — reads as a terminal, intentionally dark
  code: "#1F2937", // inline command block
} as const;

// --- borders ----------------------------------------------------------------
export const border = {
  default: "#E5E7EB",
  strong: "#D1D5DB",
} as const;

// --- text -------------------------------------------------------------------
export const text = {
  strong: "#111827", // headings, metric values
  heading: "#374151", // section headers
  body: "#4B5563", // prose
  muted: "#6B7280", // secondary
  faint: "#9CA3AF", // labels, placeholders, em-dashes
  onDark: "#E5E7EB", // ticker rows
  onDarkMuted: "#D1D5DB", // ticker message
  onDarkFaint: "#6B7280", // ticker timestamp
  onDarkAccent: "#60A5FA", // ticker role
  onCode: "#FDE68A", // command text in the code block
} as const;

// --- status -----------------------------------------------------------------
// `accent` is Consort's in-progress orange; it carries "this is happening now" everywhere
// (current design phase, working agent, current story step, active graph node).
export const status = {
  accent: "#FF7033",
  accentText: "#C2410C", // accessible orange-on-tint text
  accentTint: "rgba(255,112,51,0.12)",
  accentTintSoft: "rgba(255, 112, 51, 0.08)",
  accentGlow: "rgba(255,112,51,0.35)",

  good: "#10B981",
  goodLight: "#34D399", // gradient partner for the test bar
  goodText: "#047857",
  goodTint: "rgba(16,185,129,0.10)",
  goodTintSoft: "rgba(16,185,129,0.08)",

  critical: "#EF4444",
  criticalText: "#DC2626",
  criticalTextDeep: "#B91C1C",
  criticalSoft: "#FECACA",
  criticalTint: "rgba(239,68,68,0.12)",
  criticalTintSoft: "rgba(239, 68, 68, 0.08)",
  criticalTintFaint: "rgba(239,68,68,0.03)",

  warning: "#F59E0B",
  warningAmber: "#FBBF24", // pending gate chip
  warningText: "#B45309",
  warningTextDeep: "#92400E",
  warningSoft: "#FDE68A",
  warningTint: "rgba(245,158,11,0.14)",
  warningTintFaint: "rgba(245,158,11,0.04)",
  warningTicker: "#D97706", // warn level in the ticker

  // HITL gate — deliberately not warning-amber, so "waiting on a human decision" reads
  // differently from "something is wrong".
  gate: "#A855F7",
  gateText: "#7C3AED",
  gateTextDeep: "#6D28D9",
  gateSoft: "#DDD6FE",
  gateTint: "rgba(168,85,247,0.12)",
  gateTintSoft: "rgba(168, 85, 247, 0.10)",
  gateTintFaint: "rgba(168,85,247,0.04)",

  // A discarded story is neither success nor failure — gold, not green or red.
  discarded: "#D9A406",
  discardedText: "#92750A",
  discardedTint: "rgba(217,164,6,0.12)",

  onDeck: "#3B82F6",
  onDeckTint: "rgba(59, 130, 246, 0.08)",
} as const;

// --- role palette -----------------------------------------------------------
// Distinct, stable color per agent role. Used by the cost bar, and by the topology graph
// to stroke a node with the color of the role that owns it.
export const roleColor: Record<Role, string> = {
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
};

// Any string, so an unknown role from a future kit degrades to grey instead of undefined.
// Returns a CSS var so the color re-themes with `data-theme`; the fallback is the faint var.
export function colorForRole(role: string): string {
  return Object.hasOwn(roleColor, role) ? `var(--role-${role})` : "var(--text-faint)";
}

// === DARK THEME =============================================================
// A port of Kevin's original dashboard (`_dashboard_template.html`), which is natively dark:
// warm near-black surfaces (#0d0d0d / #1a1a19 / #222220 / #2a2a28), tan secondary text
// (#c3c2b7), his c1…c10 categorical hues for roles, and good/warning/critical from his
// --good/--warning/--critical. Each object is typed against its light counterpart's keys, so
// the build fails if a token is defined for light but not dark (see the completeness test).
// Text-on-tint variants (`*Text`) and the tints are lightened / re-alpha'd for a dark ground —
// the light values (dark ink on a pale tint) would be invisible on #0d0d0d.

type Tokens<T> = Record<keyof T, string>;

export const surfaceDark: Tokens<typeof surface> = {
  page: "#0d0d0d",
  card: "#1a1a19",
  muted: "#222220", // idle agent bubble
  inset: "#222220", // progress troughs, not-started steps
  terminal: "#121110", // event ticker — a touch below card so it still reads as a terminal
  code: "#2a2a28",
};

export const borderDark: Tokens<typeof border> = {
  default: "rgba(255,255,255,0.10)", // Kevin's --border
  strong: "rgba(255,255,255,0.18)",
};

export const textDark: Tokens<typeof text> = {
  strong: "#ffffff", // Kevin --text-primary
  heading: "#E7E6DD",
  body: "#c3c2b7", // Kevin --text-secondary (warm tan)
  muted: "#898781", // Kevin --muted
  faint: "#6F6D67",
  onDark: "#E5E7EB", // ticker already assumes a dark ground — carries over
  onDarkMuted: "#D1D5DB",
  onDarkFaint: "#6B7280",
  onDarkAccent: "#60A5FA",
  onCode: "#FDE68A",
};

export const statusDark: Tokens<typeof status> = {
  accent: "#FF7033", // keep Consort's orange identity; reads well on dark
  accentText: "#FDBA74", // light orange for text-on-tint
  accentTint: "rgba(255,112,51,0.18)",
  accentTintSoft: "rgba(255,112,51,0.12)",
  accentGlow: "rgba(255,112,51,0.45)",

  good: "#0ca30c", // Kevin --good
  goodLight: "#34D399",
  goodText: "#4ADE80",
  goodTint: "rgba(12,163,12,0.20)",
  goodTintSoft: "rgba(12,163,12,0.12)",

  critical: "#d03b3b", // Kevin --critical
  criticalText: "#F87171",
  criticalTextDeep: "#FCA5A5",
  criticalSoft: "rgba(208,59,59,0.32)",
  criticalTint: "rgba(208,59,59,0.20)",
  criticalTintSoft: "rgba(208,59,59,0.12)",
  criticalTintFaint: "rgba(208,59,59,0.06)",

  warning: "#fab219", // Kevin --warning
  warningAmber: "#FBBF24",
  warningText: "#FCD34D",
  warningTextDeep: "#FDE68A",
  warningSoft: "rgba(250,178,25,0.32)",
  warningTint: "rgba(250,178,25,0.20)",
  warningTintFaint: "rgba(250,178,25,0.06)",
  warningTicker: "#FBBF24", // brightened from the light #D97706, which sinks into a dark ground

  gate: "#A855F7",
  gateText: "#C4B5FD",
  gateTextDeep: "#DDD6FE",
  gateSoft: "rgba(168,85,247,0.32)",
  gateTint: "rgba(168,85,247,0.20)",
  gateTintSoft: "rgba(168,85,247,0.14)",
  gateTintFaint: "rgba(168,85,247,0.06)",

  discarded: "#D9A406",
  discardedText: "#E8C766",
  discardedTint: "rgba(217,164,6,0.20)",

  onDeck: "#60A5FA", // brightened blue for a dark ground
  onDeckTint: "rgba(96,165,250,0.14)",
};

// Role hues from Kevin's c1…c10, mapped to preserve the light theme's semantics where it
// matters (navigator stays orange, driver stays green). orchestrator → warm grey (his --muted).
export const roleColorDark: Record<Role, string> = {
  orchestrator: "#898781",
  "spec-author": "#3987e5", // c1
  "ux-designer": "#d55181", // c3
  "architect-reviewer": "#9085e9", // c7
  dba: "#c98500", // c4
  "test-strategist": "#199e70", // c5
  navigator: "#d95926", // c6 (orange, as in light)
  driver: "#008300", // c2 (green, as in light)
  "product-owner": "#e66767", // c8
  "release-engineer": "#5ec8d8", // c9
};

// --- shared non-color tokens ------------------------------------------------
export const radius = { card: 14, panel: 10, chip: 6, step: 7 } as const;

export const font = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

// --- CSS custom properties --------------------------------------------------
// Rendered into two blocks by layout.tsx — a light `:root` and a dark
// `:root[data-theme="dark"]` — so components can style off `var(--surface-page)` etc. and
// flipping `data-theme` on <html> re-themes everything at once. Names are kebab-cased and
// grouped: --surface-page, --text-muted, --status-good, --role-spec-author.
const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

function themeBlock(
  selector: string,
  colorScheme: "light" | "dark",
  tables: {
    surface: Record<string, string>;
    border: Record<string, string>;
    text: Record<string, string>;
    status: Record<string, string>;
    roleColor: Record<Role, string>;
  },
): string {
  const lines: string[] = [`  color-scheme: ${colorScheme};`];
  const emit = (prefix: string, table: Record<string, string>) => {
    for (const [k, v] of Object.entries(table)) lines.push(`  --${prefix}-${kebab(k)}: ${v};`);
  };
  emit("surface", tables.surface);
  emit("border", tables.border);
  emit("text", tables.text);
  emit("status", tables.status);
  for (const r of ROLES) lines.push(`  --role-${r}: ${tables.roleColor[r]};`);
  return `${selector} {\n${lines.join("\n")}\n}`;
}

export function cssVariables(): string {
  const light = themeBlock(":root", "light", { surface, border, text, status, roleColor });
  const dark = themeBlock(':root[data-theme="dark"]', "dark", {
    surface: surfaceDark,
    border: borderDark,
    text: textDark,
    status: statusDark,
    roleColor: roleColorDark,
  });
  return `${light}\n${dark}`;
}
