// / UX adherence: machine-enforce that the running UI matches the
// design guide. The design guide (design-guide.json) is the declared contract;
// this checks the IMPLEMENTED design system against it.
//
// Mechanism: the app defines its design tokens as CSS custom properties on
// :root (the convention in the real partner-asset-tracker STYLE_GUIDE.md ,
// tokens in theme.css :root, "accessible in Playwright tests"). We read those
// rendered :root variables and compare them to the tokens in design-guide.json.
// A primary button that renders blue or rounded when the guide says red + sharp
// fails the check, because the underlying --color-brand-red / --radius-none vars
// would not match.
//
// This is token-level adherence (does the implemented design SYSTEM match the
// declared one). Element-level usage adherence (does each component actually
// USE the tokens) is a future extension; the token check is the load-bearing
// first gate and is app/framework-agnostic.
//
// The pure comparison (designGuideToCssVars + checkTokenAdherence) is unit
// tested hermetically; assertDesignAdherence takes a minimal page-like reader
// so the kit core needs no hard @playwright/test dependency.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface DesignGuide {
  typography: {
    font_family: string;
    font_mono?: string;
    scale: Record<string, string>;
    line_heights?: Record<string, string>;
    font_weights?: Record<string, string>;
  };
  colors: Record<string, Record<string, string>>;
  spacing: Record<string, string>;
  radius?: Record<string, string>;
  shadows?: Record<string, string>;
  breakpoints?: Record<string, string>;
  /** The product's brand icon, when the design brief provides one (an intake asset).
   *  Its presence turns the app icon into a checked contract (checkAppIcon). */
  app_icon?: { source: string; install_to: string };
}

/**
 * Flatten a design guide to the CSS custom properties the app is expected to
 * define on :root. Convention (matches the real theme.css token namespace):
 *   typography.font_family       -> --font-sans        (the body/sans family; the
 *                                                       CSS var name the shipped
 *                                                       theme.css + reference assets
 *                                                       actually define/consume — NOT
 *                                                       --font-family, which nothing
 *                                                       renders, so font adherence
 *                                                       silently never held)
 *   typography.font_mono         -> --font-mono
 *   typography.scale[k]          -> --<k>                 (text-base -> --text-base)
 *   typography.line_heights[k]   -> --line-height-<k>     (body -> --line-height-body)
 *   typography.font_weights[k]   -> --font-weight-<k>     (medium -> --font-weight-medium)
 *   colors[group][k]             -> --color-<k>           (brand-red -> --color-brand-red)
 *   spacing[k] / radius[k] /
 *   shadows[k] / breakpoints[k]  -> --<k>                 (space-4 -> --space-4)
 * Token keys are stored WITHOUT the leading "--"; colors additionally drop the
 * group and gain a "color-" prefix on the leaf key.
 */
export function designGuideToCssVars(guide: DesignGuide): Record<string, string> {
  const vars: Record<string, string> = {};
  vars["--font-sans"] = guide.typography.font_family;
  if (guide.typography.font_mono !== undefined) {
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

/**
 * Render the `:root { … }` CSS custom-property block FROM a design guide — the
 * inverse of reading :root back for the adherence check. This is the missing
 * link that made the UX Designer a no-op: the role authored design-guide.json
 * (its derived colors/fonts/spacing) but NOTHING wrote those tokens into the
 * theme the app renders, so every project shipped the frozen scaffold baseline
 * (Databricks red/navy/DM-Sans) regardless of the guide. Generating :root from
 * the SAME `designGuideToCssVars` map the checker uses guarantees the rendered
 * tokens are exactly what the guide declares (adherence then holds by
 * construction), and re-skins the whole app to the guide's palette/type.
 *
 * Returns only the token block; the component classes that CONSUME these vars
 * live elsewhere in the stylesheet. Deterministic: insertion order of
 * `designGuideToCssVars` (typography → colors → spacing/radius/shadows/breakpoints).
 */
export function renderThemeRootCss(guide: DesignGuide): string {
  const vars = designGuideToCssVars(guide);
  const lines = Object.entries(vars).map(([name, value]) => `  ${name}: ${value};`);
  return `:root {\n${lines.join("\n")}\n}\n`;
}

export interface TokenMismatch {
  cssVar: string;
  expected: string;
  /** The rendered value; undefined when the app does not define the variable. */
  actual?: string;
}

export interface AdherenceResult {
  ok: boolean;
  mismatches: TokenMismatch[];
}

/** Normalize for comparison: trim, collapse internal whitespace, lowercase. */
function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Compare the declared CSS-var tokens (from a design guide) against the values
 * the app actually rendered on :root. A declared token that is absent or
 * differs is a mismatch. Extra rendered vars the guide does not declare are
 * ignored (the guide is the contract, not an exhaustive inventory).
 */
export function checkTokenAdherence(
  declared: Record<string, string>,
  rendered: Record<string, string>,
): AdherenceResult {
  const mismatches: TokenMismatch[] = [];
  for (const [cssVar, expected] of Object.entries(declared)) {
    const actual = rendered[cssVar];
    if (actual === undefined || actual === "") {
      mismatches.push({ cssVar, expected, actual: undefined });
      continue;
    }
    if (normalize(actual) !== normalize(expected)) {
      mismatches.push({ cssVar, expected, actual });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

/**
 * Minimal Playwright-Page-like reader: just the `evaluate` seam we use to read
 * computed :root custom-property values in the browser. Typed loosely so the
 * kit core takes no hard @playwright/test dependency.
 */
export interface CssVarReader {
  evaluate(
    fn: (names: string[]) => Record<string, string>,
    names: string[],
  ): Promise<Record<string, string>>;
}

/**
 * Read the app's rendered :root CSS variables for every token the guide
 * declares, compare, and THROW with the mismatches when the UI has drifted.
 * Call this from a project's Playwright E2E suite against the paired-branch
 * app endpoint; it is the runner that makes "ensures adherence" automatic.
 */
export async function assertDesignAdherence(reader: CssVarReader, guide: DesignGuide): Promise<void> {
  const declared = designGuideToCssVars(guide);
  const names = Object.keys(declared);
  const rendered = await reader.evaluate((vars: string[]): Record<string, string> => {
    // Runs in the browser: read each custom property off the document root.
    const root = globalThis as unknown as {
      getComputedStyle: (e: unknown) => { getPropertyValue: (n: string) => string };
      document: { documentElement: unknown };
    };
    const style = root.getComputedStyle(root.document.documentElement);
    const out: Record<string, string> = {};
    for (const name of vars) out[name] = style.getPropertyValue(name);
    return out;
  }, names);

  const result = checkTokenAdherence(declared, rendered);
  if (!result.ok) {
    const lines = result.mismatches.map(
      (m) => `  ${m.cssVar}: expected ${m.expected}, got ${m.actual ?? "(not defined)"}`,
    );
    throw new Error(`design adherence failed: UI does not match design-guide.json\n${lines.join("\n")}`);
  }
}

// ─── Element-level adherence (increment B) ───────────────────────
// The token check above proves the design SYSTEM matches the guide (the right
// :root vars exist). It cannot prove each component actually USES those tokens:
// a UI may define --color-brand-red on :root yet hardcode #FF3621 everywhere, or
// omit the data-testid seams the IA declared, or ship a form that never tells the
// user the action succeeded/failed. These element-level checks close that gap.
// They are pure + injectable (take plain rendered markup/styles, the way
// checkTokenAdherence takes plain rendered vars) so they unit-test hermetically
// without a real browser. A failure is the `ux-adherence` smell.

export interface ElementAdherenceResult {
  ok: boolean;
  violations: string[];
  remediation?: string;
}

// A `:root{...}` declaration block is where tokens are DEFINED (e.g.
// `--color-brand-red: #FF3621`); a hardcoded value there is correct, not a
// violation. Strip those blocks before scanning for hardcoded literals.
const ROOT_BLOCK = /:root\s*\{[^}]*\}/gi;
// A value inside `var(...)` is the consumed token, not a hardcoded literal.
const VAR_CALL = /var\(\s*--[A-Za-z0-9-]+[^)]*\)/g;
// Hardcoded design literals: a hex color, or a raw px length (font-size/spacing).
const HEX_COLOR = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g;
const RAW_PX = /\b\d+(?:\.\d+)?px\b/g;

const HARDCODED_REMEDIATION =
  "The UI hardcodes design values instead of consuming the design-guide tokens. " +
  "Replace each hex color / raw px with the matching var(--token) (defined on :root); " +
  "the design system is the single source of truth. See the `ux-adherence` smell.";

/**
 * Flag hardcoded design values (hex colors, raw px font-sizes/spacing) in inline
 * `style=` attributes or `<style>` blocks that should be a `var(--token)` instead.
 * Values inside `var(...)` are exempt (that IS token use) and `:root{...}` token
 * DEFINITIONS are exempt (that is where tokens live). Returns the offending
 * snippets so the build knows what to replace.
 */
export function checkHardcodedValues(stylesOrHtml: string): ElementAdherenceResult {
  // Remove token-definition blocks + token consumptions so neither registers as a
  // hardcoded literal; what remains is genuine hardcoding.
  const scannable = stylesOrHtml.replace(ROOT_BLOCK, " ").replace(VAR_CALL, " ");
  const violations: string[] = [];
  for (const m of scannable.match(HEX_COLOR) ?? []) {
    violations.push(`hardcoded color ${m} (use a var(--color-*) token)`);
  }
  for (const m of scannable.match(RAW_PX) ?? []) {
    violations.push(`hardcoded length ${m} (use a var(--text-*/--space-*) token)`);
  }
  return violations.length === 0
    ? { ok: true, violations: [] }
    : { ok: false, violations, remediation: HARDCODED_REMEDIATION };
}

const SEAM_REMEDIATION =
  "The IA's screens/flows declare these data-testid seams; the rendered UI must " +
  "expose each one so the E2E layer can select it. Render the missing seam (do not " +
  "rename an existing one out from under a test). See the `ux-adherence` smell.";

/**
 * Every required `data-testid` (derived from `ia.md` screens/flows, passed in)
 * must appear in the rendered HTML. A missing seam is a violation: the IA said
 * the element exists but the UI did not render it (or rendered it under a
 * different id). An empty requirement list is trivially clean.
 */
export function checkRequiredSeams(html: string, requiredTestids: string[]): ElementAdherenceResult {
  const violations: string[] = [];
  for (const id of requiredTestids) {
    // Match data-testid="id" / 'id' tolerant of quote style + surrounding space.
    const present = new RegExp(`data-testid\\s*=\\s*["']${escapeRe(id)}["']`).test(html);
    if (!present) violations.push(`missing required data-testid "${id}" (declared in the IA, not rendered)`);
  }
  return violations.length === 0
    ? { ok: true, violations: [] }
    : { ok: false, violations, remediation: SEAM_REMEDIATION };
}

/** Escape a string for safe inclusion in a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// An action surface: a form, or a submit control. A feedback affordance: a
// live/alert region, or a data-testid that names error/success/message/status.
const ACTION_SURFACE = /<form\b|type\s*=\s*["']submit["']|<button\b(?![^>]*type\s*=\s*["'](?:button|reset)["'])/i;
const FEEDBACK_AFFORDANCE = /role\s*=\s*["']alert["']|aria-live\s*=|data-testid\s*=\s*["'][^"']*(?:error|success|message|status)[^"']*["']/i;

const FEEDBACK_REMEDIATION =
  "An action surface (form/submit) renders with no feedback affordance. Give every " +
  "action a result the user can perceive: a role=\"alert\" / aria-live region, or a " +
  "data-testid naming error/success/message/status. No silent failure, no unacknowledged " +
  "success (design-guide User Feedback Principles). See the `ux-adherence` smell.";

/**
 * Heuristic: an action surface (a `<form>` or submit control) must have a feedback
 * affordance somewhere in the rendered HTML (a `role="alert"` / `aria-live` region,
 * or a `data-testid` containing error/success/message/status), per the design-guide
 * "User Feedback Principles". Conservative: only flags when an action surface exists
 * with NO feedback affordance anywhere; HTML with no action surface is clean.
 */
export function checkFeedbackPresent(html: string): ElementAdherenceResult {
  if (!ACTION_SURFACE.test(html)) return { ok: true, violations: [] };
  if (FEEDBACK_AFFORDANCE.test(html)) return { ok: true, violations: [] };
  return {
    ok: false,
    violations: ["an action surface (form/submit) has no feedback affordance (role=alert / aria-live / a *error/success/message/status* data-testid)"],
    remediation: FEEDBACK_REMEDIATION,
  };
}

// ─── Route reachability + token consumption (increment C) ────────────────────
// The element-level checks above prove a rendered screen is styled + seamed IF it
// is rendered at all. They cannot see two upstream defects a UI-track build can
// ship GREEN with (observed live): a feature page with passing component tests
// that is never wired into App.tsx's <Routes> (unreachable – dead to the user),
// and a page rendered as bare browser-default HTML that consumes NONE of the
// design guide (the tokens exist on :root but the screen ignores them). Both are
// static + hermetic (parse App.tsx + the page sources), so they run at the REVIEW
// step and unit-test with string fixtures, like the checks above. Either is the
// `ux-adherence` smell.

// A React-router v6 route's element component: `element={<PageX ... />}`.
const ROUTE_ELEMENT_RE = /element=\{\s*<\s*([A-Z][A-Za-z0-9_]*)/g;
// The object-route / lazy form: `Component={PageX}`.
const ROUTE_COMPONENT_RE = /\bComponent=\{\s*([A-Z][A-Za-z0-9_]*)\s*\}/g;

export interface RouteReachabilityInput {
  /** Full source of the client's App.tsx (the route composition boundary). */
  appSource: string;
  /** PascalCase page component names discovered under client/src/pages/. */
  pageComponents: string[];
  /** Pages legitimately composed INSIDE another routed page (not directly routed). */
  exemptComponents?: string[];
}
export interface RouteReachabilityResult { ok: boolean; unreachable: string[]; remediation?: string; }

const REACHABILITY_REMEDIATION =
  "A feature page component exists under client/src/pages/ but is not wired into App.tsx's " +
  "<Routes>, so a user can never reach it (its component test passes in isolation, but the app " +
  "never renders it). Add a <Route ... element={<Page/>} /> for it AND a nav affordance the IA " +
  "declares. If the component is composed inside another page (not a route of its own), mark it " +
  "exempt. See the `ux-adherence` smell.";

/**
 * Every `pageComponents` entry must appear as a routed element in `appSource`
 * (`element={<X/>}` or `Component={X}`); any that does not (and is not exempt) is
 * unreachable. Empty inventory is trivially ok (vacuity guard, like checkRequiredSeams([])).
 */
export function checkRouteReachability(input: RouteReachabilityInput): RouteReachabilityResult {
  const routed = new Set<string>();
  for (const re of [ROUTE_ELEMENT_RE, ROUTE_COMPONENT_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(input.appSource)) !== null) routed.add(m[1]);
  }
  const exempt = new Set(input.exemptComponents ?? []);
  const unreachable = input.pageComponents.filter((c) => !routed.has(c) && !exempt.has(c));
  return unreachable.length === 0
    ? { ok: true, unreachable: [] }
    : { ok: false, unreachable, remediation: REACHABILITY_REMEDIATION };
}

// A className attribute value (any of the classes on an element): className="a b c".
const CLASSNAME_RE = /className\s*=\s*["'`]([^"'`]+)["'`]/g;
// A page renders visible structure if it has any JSX element (a `<Tag` opener).
const JSX_ELEMENT_RE = /<[A-Za-z][A-Za-z0-9]*[\s/>]/;

export interface TokenConsumptionInput {
  /** Per-page source keyed by file name (client/src/pages/<name>). */
  pageSources: Record<string, string>;
  /** The design guide's component-class vocabulary (page/card/btn/...). When given,
   *  a page that renders structure but references NONE of these (and no var()) is
   *  flagged even if it uses ad-hoc one-off classes – it bypasses the design system. */
  designClasses?: string[];
}
export interface TokenConsumptionResult { ok: boolean; bare: string[]; remediation?: string; }

const CONSUMPTION_REMEDIATION =
  "A feature page renders visible structure but consumes NONE of the design guide: no " +
  "var(--token) and no class from the design vocabulary. It renders as bare browser-default " +
  "HTML. Apply the guide – wrap in the layout/card/button/table classes (or var(--token) " +
  "styles) the design guide defines – so the screen matches the design system. See the " +
  "`ux-adherence` smell.";

/**
 * A page that renders visible structure must show a design signal: a `var(--token)`
 * consumption OR (when a `designClasses` vocabulary is supplied) at least one class
 * from that vocabulary. A page with structure but zero design signal is `bare`. A
 * page with no visible structure (pure logic / redirect) is never flagged.
 */
export function checkTokenConsumption(input: TokenConsumptionInput): TokenConsumptionResult {
  const vocab = new Set(input.designClasses ?? []);
  const bare: string[] = [];
  for (const [name, src] of Object.entries(input.pageSources)) {
    if (!JSX_ELEMENT_RE.test(src)) continue; // no visible structure -> nothing to style
    const usesVar = VAR_CALL.test(src);
    VAR_CALL.lastIndex = 0; // VAR_CALL is /g; reset after .test()
    let usesDesignClass = false;
    if (vocab.size > 0) {
      CLASSNAME_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = CLASSNAME_RE.exec(src)) !== null) {
        // A class token matches the vocabulary by exact name or BEM-style prefix
        // (`card` matches `card` and `card__title`/`card--active`).
        if (m[1].split(/\s+/).some((cls) => vocab.has(cls) || [...vocab].some((v) => cls === v || cls.startsWith(`${v}__`) || cls.startsWith(`${v}--`)))) {
          usesDesignClass = true;
          break;
        }
      }
    } else {
      // With no vocabulary supplied, ANY className counts as a design signal (the
      // conservative default: only truly class-less + var-less pages are bare).
      CLASSNAME_RE.lastIndex = 0;
      usesDesignClass = CLASSNAME_RE.test(src);
      CLASSNAME_RE.lastIndex = 0;
    }
    if (!usesVar && !usesDesignClass) bare.push(name);
  }
  return bare.length === 0
    ? { ok: true, bare: [] }
    : { ok: false, bare, remediation: CONSUMPTION_REMEDIATION };
}

// ─── App-icon adherence (increment D) ────────────────────────────────────────
// The checks above prove the design SYSTEM (tokens) and the feature SCREENS
// (reachable, styled, seamed) match the guide. They cannot see the brand IDENTITY
// the design brief provides as an intake asset: a warehouse/product icon the guide
// declares as the app icon + favicon. The scaffold ships a GENERIC placeholder
// (favicon.svg, the Databricks spark mark), and nothing forces the provided asset
// to replace it, so the shipped app keeps the placeholder and the brand icon sits
// unused in intake (observed run17). When the guide declares `app_icon`, this makes
// it a checked contract: the asset must be INSTALLED at its install_to path and
// actually REFERENCED by the app shell (index.html favicon link + the navbar/App
// shell), not the placeholder. Pure + injectable (takes the installed-path check +
// the two shell sources) so it unit-tests hermetically. A miss is `ux-adherence`.

export interface AppIconInput {
  /** The guide's declared app icon (source + install_to), or undefined when none. */
  appIcon?: { source: string; install_to: string };
  /** True iff the install_to asset exists on disk (the I/O boundary resolves this). */
  installedExists: boolean;
  /** Basename of install_to, e.g. "warehouse.png" (what a reference must mention). */
  installedBasename: string;
  /** Full source of client/index.html (the favicon `<link rel="icon">` lives here). */
  indexHtml: string;
  /** Full source of the app shell (client/src/App.tsx) that renders the navbar icon. */
  appShell: string;
}
export interface AppIconResult { ok: boolean; violations: string[]; remediation?: string }

const APP_ICON_REMEDIATION =
  "The design guide declares a brand app_icon (an intake asset), but the app does not use it: " +
  "the asset is missing at its install_to path and/or the app shell still references the generic " +
  "scaffold placeholder (favicon.svg) instead. Copy the asset to install_to, point index.html's " +
  "<link rel=\"icon\"> at it, and render it as the navbar/app-title mark. The provided brand icon " +
  "must be the app's icon, not left unused in intake. See the `ux-adherence` smell.";

/**
 * When the guide declares an `app_icon`, verify it is APPLIED: (1) the asset exists
 * at install_to, and (2) its basename is referenced by BOTH the favicon link
 * (index.html) and the app shell (App.tsx) – i.e. the brand icon replaced the
 * generic placeholder. No `appIcon` declared -> trivially ok (a project with no
 * brand asset legitimately keeps the scaffold icon).
 */
export function checkAppIcon(input: AppIconInput): AppIconResult {
  if (!input.appIcon) return { ok: true, violations: [] };
  const violations: string[] = [];
  const base = input.installedBasename;
  if (!input.installedExists) {
    violations.push(`brand app icon not installed at "${input.appIcon.install_to}" (declared in the design guide, copied from "${input.appIcon.source}")`);
  }
  // A reference is the installed basename appearing in the shell source (a src=,
  // href=, or import of the asset). The placeholder favicon.svg does NOT satisfy it.
  const referenced = (src: string) => src.includes(base);
  if (!referenced(input.indexHtml)) {
    violations.push(`index.html favicon does not reference the brand icon "${base}" (still the scaffold placeholder)`);
  }
  if (!referenced(input.appShell)) {
    violations.push(`the app shell (App.tsx) does not reference the brand icon "${base}" (navbar/title still the placeholder)`);
  }
  return violations.length === 0
    ? { ok: true, violations: [] }
    : { ok: false, violations, remediation: APP_ICON_REMEDIATION };
}

export interface ComponentVocabResult { ok: boolean; missing: string[]; remediation?: string }

const COMPONENT_VOCAB_REMEDIATION =
  "The design guide names component classes its `components` declares, but they are not DEFINED in " +
  "client/src/styles/global.css — so the app has no styling for that vocabulary and a page applying " +
  "the class renders unstyled. The UX Designer must author one class per `components` entry (named " +
  "exactly its `class`), styled through var(--token). This is what turns 'tokens exist on :root' into " +
  "'this project's components actually look like the brief' — the gap that made every app render the " +
  "generic baseline. See the `ux-adherence` smell.";

/**
 * Every class the guide's `components` vocabulary names MUST be defined as a
 * selector in global.css. A declared-but-undefined class is a component the
 * design system promises but does not style — the page that applies it renders
 * bare. Definition = the `.<class>` selector appears in the stylesheet. No
 * declared classes (or no stylesheet) -> trivially ok.
 */
export function checkComponentVocabularyDefined(declaredClasses: string[], globalCss: string): ComponentVocabResult {
  if (declaredClasses.length === 0) return { ok: true, missing: [] };
  const missing = declaredClasses.filter((cls) => {
    // Match `.<class>` as a class selector (followed by a non-identifier char:
    // space, {, ,, :, ::, --modifier is a DIFFERENT class so require a boundary).
    const re = new RegExp(`\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`);
    return !re.test(globalCss);
  });
  return missing.length === 0 ? { ok: true, missing: [] } : { ok: false, missing, remediation: COMPONENT_VOCAB_REMEDIATION };
}

export interface UxCleanArgs {
  /** Project root (the dir that contains client/). */
  projectDir: string;
  /** Override the client src dir (default <projectDir>/client/src). */
  clientSrcDir?: string;
  /** The design guide's component-class vocabulary, threaded to checkTokenConsumption
   *  AND to checkComponentVocabularyDefined (each class must be defined in global.css). */
  designClasses?: string[];
  /** The design guide's declared app icon, threaded to checkAppIcon. */
  appIcon?: { source: string; install_to: string };
}
export interface UxCleanResult {
  clean: boolean;
  reachability: RouteReachabilityResult;
  tokens: TokenConsumptionResult;
  /** App-icon adherence; trivially ok when the guide declares no app_icon. */
  appIcon: AppIconResult;
  /** The guide's component classes are all defined in global.css; trivially ok
   *  when no designClasses are threaded. */
  vocabulary: ComponentVocabResult;
  remediation?: string;
}

export const UX_CLEAN_REMEDIATION =
  "The client UI does not fully apply the design guide: a feature page is unreachable (not " +
  "routed in App.tsx), bare (consumes no design tokens/classes), and/or the declared brand app " +
  "icon is not applied. Wire every feature page into <Routes> with a nav affordance, style it with " +
  "the design vocabulary, and install + reference the brand icon. See `ux-adherence`.";

/** Summarize a non-clean result into one line for a smell detail / verify summary. */
export function summarizeUxViolations(r: UxCleanResult): string {
  const parts: string[] = [];
  if (!r.reachability.ok) parts.push(`unreachable pages: ${r.reachability.unreachable.join(", ")}`);
  if (!r.tokens.ok) parts.push(`bare (unstyled) pages: ${r.tokens.bare.join(", ")}`);
  if (!r.vocabulary.ok) parts.push(`design classes not defined in global.css: ${r.vocabulary.missing.join(", ")}`);
  if (!r.appIcon.ok) parts.push(`brand app icon not applied: ${r.appIcon.violations.join("; ")}`);
  return parts.join("; ");
}

/**
 * The I/O boundary (mirrors checkE2eRegexClean): scan a project's client workspace
 * for unreachable + bare feature pages. **UI-track only**: no client/src/App.tsx ->
 * `{ clean: true }` (a non-UI project has no UI to check). Reads App.tsx + every
 * client/src/pages/*.tsx, derives the page-component inventory, and runs both pure
 * checks. Pure functions above are unit-tested with fixtures; this is the thin
 * filesystem shell around them.
 */
export function checkUxClean(args: UxCleanArgs): UxCleanResult {
  const okIcon: AppIconResult = { ok: true, violations: [] };
  const okVocab: ComponentVocabResult = { ok: true, missing: [] };
  const clean0: UxCleanResult = { clean: true, reachability: { ok: true, unreachable: [] }, tokens: { ok: true, bare: [] }, appIcon: okIcon, vocabulary: okVocab };
  const srcDir = args.clientSrcDir ?? join(args.projectDir, "client", "src");
  const appTsx = join(srcDir, "App.tsx");
  const pagesDir = join(srcDir, "pages");
  if (!existsSync(appTsx) || !existsSync(pagesDir)) return clean0; // not a UI-track project
  const appSource = readFileSync(appTsx, "utf8");
  const pageSources: Record<string, string> = {};
  const pageComponents: string[] = [];
  for (const name of readdirSync(pagesDir)) {
    if (!name.endsWith(".tsx") || name.endsWith(".test.tsx")) continue;
    const src = readFileSync(join(pagesDir, name), "utf8");
    pageSources[name] = src;
    for (const re of [/export\s+function\s+([A-Z][A-Za-z0-9_]*)/g, /export\s+const\s+([A-Z][A-Za-z0-9_]*)/g]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) pageComponents.push(m[1]);
    }
  }
  const reachability = checkRouteReachability({ appSource, pageComponents });
  const tokens = checkTokenConsumption({ pageSources, designClasses: args.designClasses });
  // The guide's component vocabulary must be DEFINED in global.css (else a page
  // applying the class renders bare). global.css lives beside theme.css under styles/.
  const globalCssPath = join(srcDir, "styles", "global.css");
  const vocabulary = args.designClasses && args.designClasses.length > 0 && existsSync(globalCssPath)
    ? checkComponentVocabularyDefined(args.designClasses, readFileSync(globalCssPath, "utf8"))
    : okVocab;
  // App-icon adherence: only when the guide declares an app_icon. index.html lives at
  // the client root (one dir up from src); the app shell is App.tsx (already read).
  let appIcon: AppIconResult = okIcon;
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
      appShell: appSource,
    });
  }
  const clean = reachability.ok && tokens.ok && appIcon.ok && vocabulary.ok;
  return clean ? { clean, reachability, tokens, appIcon, vocabulary } : { clean, reachability, tokens, appIcon, vocabulary, remediation: UX_CLEAN_REMEDIATION };
}
