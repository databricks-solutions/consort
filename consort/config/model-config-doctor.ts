// The MODEL-CONFIG DOCTOR: validate a project's per-role / per-step model + effort overrides in
// `.lakebase/consort-config.json` against the kit's known vocabularies, and offer the closest
// replacement for anything that doesn't match. This is the "offer replacements when config doesn't
// match what's available" check — grounded in the KIT's known aliases rather than a live harness
// probe (the claude CLI exposes no way to enumerate what `/model` offers, so there is nothing
// authoritative to detect; a fully-qualified id is therefore passed through untouched).
//
// Pure + leaf: it reads the config primitive + the model/step vocabularies and returns findings; it
// mutates nothing (a doctor suggests, it does not rewrite the human's file). The CLI + the create
// seeder format/surface these findings.

import { loadConsortConfig } from "./consort-config-file.js";
import { KNOWN_MODEL_ALIASES } from "./agent-models.js";
import { ALL_TURN_KEYS, ALL_EFFORT_LEVELS } from "./step-key.js";

/** One problem found in a project's model/effort config, with a suggested fix when one is close. */
export interface ModelConfigFinding {
  /** The role whose entry holds the problem (e.g. "driver"). */
  role: string;
  /** The per-step key when the problem is inside a per-step map (e.g. "green"); absent for a scalar. */
  step?: string;
  /** What kind of value is wrong. */
  field: "model" | "effort" | "step-key";
  /** The offending value as written in the config. */
  value: string;
  /** The closest known replacement, when one is near enough to suggest. */
  suggestion?: string;
  /** Human-readable explanation (closed, no secrets/paths). */
  reason: string;
}

/** Levenshtein edit distance (small strings; used only to pick the closest known token). */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

/** The nearest candidate to `value`, but only when it is close enough to be a plausible typo
 *  (distance <= a third of the longer length, min 2) — never a wild guess. */
function closest(value: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    const dist = editDistance(value.toLowerCase(), c.toLowerCase());
    if (dist < bestD) {
      bestD = dist;
      best = c;
    }
  }
  if (best === undefined) return undefined;
  const threshold = Math.max(2, Math.floor(Math.max(value.length, best.length) / 3));
  return bestD <= threshold ? best : undefined;
}

/** A fully-qualified model id the kit accepts as-is: a provider/model (`anthropic/claude-...`), a
 *  Databricks serving id (`system.ai.*`), a versioned Claude name (`claude-opus-5-5`), or the CLI
 *  sentinels `inherit`/`default`. The kit can't enumerate a given account's reachable models, so it
 *  does not second-guess a qualified id — only BARE tokens are validated against the alias set. */
function isQualifiedOrSentinel(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === "inherit" || v === "default") return true;
  if (v.includes("/") || v.includes(".")) return true; // provider/model or system.ai.* id
  if (/^claude-(opus|sonnet|haiku)-/.test(v)) return true; // versioned full name (claude-opus-5-5)
  return false;
}

function lintModelValue(role: string, value: string, step?: string): ModelConfigFinding | undefined {
  if ((KNOWN_MODEL_ALIASES as readonly string[]).includes(value) || isQualifiedOrSentinel(value)) return undefined;
  const suggestion = closest(value, KNOWN_MODEL_ALIASES);
  return {
    role,
    ...(step ? { step } : {}),
    field: "model",
    value,
    ...(suggestion ? { suggestion } : {}),
    reason: `"${value}" is not a known model alias (known: ${KNOWN_MODEL_ALIASES.join(", ")}; a fully-qualified id such as system.ai.claude-opus-5-5 is also accepted)`,
  };
}

function lintEffortValue(role: string, value: string, step?: string): ModelConfigFinding | undefined {
  if ((ALL_EFFORT_LEVELS as readonly string[]).includes(value)) return undefined;
  const suggestion = closest(value, ALL_EFFORT_LEVELS);
  return {
    role,
    ...(step ? { step } : {}),
    field: "effort",
    value,
    ...(suggestion ? { suggestion } : {}),
    reason: `"${value}" is not a valid effort level (${ALL_EFFORT_LEVELS.join(", ")})`,
  };
}

/** A per-step map key that is not a real TurnKey silently resolves to nothing — flag it so a typo'd
 *  step (e.g. "grreen") is caught rather than silently ignored. */
function lintStepKey(role: string, step: string): ModelConfigFinding | undefined {
  if ((ALL_TURN_KEYS as readonly string[]).includes(step)) return undefined;
  const suggestion = closest(step, ALL_TURN_KEYS);
  return {
    role,
    step,
    field: "step-key",
    value: step,
    ...(suggestion ? { suggestion } : {}),
    reason: `"${step}" is not a known step key, so this per-step override is silently ignored (keys: ${ALL_TURN_KEYS.join(", ")})`,
  };
}

/** Lint one role's `model` / `effort` entry (scalar OR per-step map) into findings. */
function lintRole(role: string, entry: { model?: unknown; effort?: unknown }): ModelConfigFinding[] {
  const out: ModelConfigFinding[] = [];
  const scan = (
    v: unknown,
    scalar: (role: string, value: string) => ModelConfigFinding | undefined,
    perStep: (role: string, value: string, step: string) => ModelConfigFinding | undefined,
  ): void => {
    if (typeof v === "string") {
      const f = scalar(role, v);
      if (f) out.push(f);
    } else if (v && typeof v === "object") {
      for (const [step, val] of Object.entries(v as Record<string, unknown>)) {
        const kf = lintStepKey(role, step);
        if (kf) out.push(kf);
        if (typeof val === "string") {
          const f = perStep(role, val, step);
          if (f) out.push(f);
        }
      }
    }
  };
  scan(entry.model, (r, val) => lintModelValue(r, val), (r, val, step) => lintModelValue(r, val, step));
  scan(entry.effort, (r, val) => lintEffortValue(r, val), (r, val, step) => lintEffortValue(r, val, step));
  return out;
}

/**
 * Lint every role's model/effort config in the project's `.lakebase/consort-config.json`. Returns an
 * EMPTY array when the config is absent (the Default path writes no overrides) or entirely valid.
 */
export function lintModelConfig(projectDir: string): ModelConfigFinding[] {
  const cfg = loadConsortConfig(projectDir);
  const roles = cfg?.roles;
  if (!roles) return [];
  const out: ModelConfigFinding[] = [];
  for (const [role, entry] of Object.entries(roles)) {
    if (entry) out.push(...lintRole(role, entry as { model?: unknown; effort?: unknown }));
  }
  return out;
}

/** One human-readable line per finding, with the suggested replacement when there is one. */
export function formatFindings(findings: ModelConfigFinding[]): string {
  return findings
    .map((f) => {
      const where = f.step ? `roles.${f.role}.${f.field === "step-key" ? "model/effort" : f.field}["${f.step}"]` : `roles.${f.role}.${f.field}`;
      const fix = f.suggestion ? ` — did you mean "${f.suggestion}"?` : "";
      return `  ${where}: ${f.reason}${fix}`;
    })
    .join("\n");
}
