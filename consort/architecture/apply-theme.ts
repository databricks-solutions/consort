// apply-theme: write the app's design-token stylesheet FROM the design guide.
//
// This is the wiring that made the UX Designer real. Before it, the designer
// authored .consort/design/design-guide.json but NOTHING put those tokens into
// the theme the app renders, so every project shipped the frozen scaffold
// baseline (Databricks red/navy/DM-Sans) no matter what the guide said. This
// generates client/src/styles/theme.css :root deterministically from the guide,
// via the SAME designGuideToCssVars map the adherence gate reads back — so what
// renders IS what the guide declares (adherence holds by construction).
//
// theme.css is TOKENS ONLY (the :root block). The component classes that consume
// them (global.css) are authored by the UX designer to its own `components`
// vocabulary; they are NOT generated here (their styling lives in prose notes).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderThemeRootCss, installBrandAsset, applyBrandIconReference, type DesignGuide } from "./design-adherence.js";
import { resolveConsortDir, designGuideJson } from "../config/consort-paths.js";

const THEME_HEADER = `/*
 * DESIGN TOKENS — GENERATED from .consort/design/design-guide.json.
 * Do NOT hand-edit the :root block: edit the design guide and re-run
 *   ./scripts/lk consort-apply-design-theme
 * so what renders IS what the guide declares (the design-adherence gate reads
 * these :root vars back and compares them to the guide). The component classes
 * that consume these tokens live in global.css (UX-designer authored).
 */
`;

export interface ApplyThemeResult {
  themePath: string;
  varCount: number;
  /** True iff the guide declared an app_icon AND its real bytes were installed to install_to
   *  (false when no app_icon is declared or no staged source asset exists). */
  iconInstalled: boolean;
}

/** The full theme.css text for a guide: the generated banner + the :root block. */
export function buildThemeCss(guide: DesignGuide): string {
  return THEME_HEADER + renderThemeRootCss(guide);
}

/**
 * Read `<projectDir>/.consort/design/design-guide.json` and (over)write
 * `<projectDir>/client/src/styles/theme.css` with the generated token block.
 * Idempotent: re-running with the same guide yields byte-identical output.
 * Throws (loud) when no guide exists — the UX designer must run first.
 */
export function applyDesignGuideTheme(projectDir: string): ApplyThemeResult {
  const consortDir = resolveConsortDir(projectDir);
  const guidePath = designGuideJson(consortDir);
  if (!existsSync(guidePath)) {
    throw new Error(
      `apply-theme: no design guide at ${guidePath} — run the UX designer first (this is a UI project's design system).`,
    );
  }
  const guide = JSON.parse(readFileSync(guidePath, "utf8")) as DesignGuide;
  const themePath = join(projectDir, "client", "src", "styles", "theme.css");
  const css = buildThemeCss(guide);
  writeFileSync(themePath, css);
  // Applying the design is also where the brand icon lands: a coding agent cannot copy a
  // binary via text writes, so install the real bytes + point the favicon at them HERE —
  // so a project that has had its design applied already carries its brand icon, not only
  // after the first build-lane review. Best-effort + idempotent; no app_icon (or no staged
  // source) -> no-op, and the ux-adherence gate reports the asset missing as usual.
  let iconInstalled = false;
  if (guide.app_icon) {
    iconInstalled = installBrandAsset(projectDir, consortDir, guide.app_icon);
    applyBrandIconReference(projectDir, guide.app_icon.install_to);
  }
  return { themePath, varCount: (css.match(/--[\w-]+:/g) ?? []).length, iconInstalled };
}
