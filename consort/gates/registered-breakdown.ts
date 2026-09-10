// registered-breakdown: a deterministic fail-closed guard for a PRE-REGISTERED
// example (e.g. the stockflow reference). A pre-registered feature ships a
// `registration.json` declaring its canonical story + AC breakdown. When the
// live design lane re-derives a DIFFERENT breakdown — the recurring wild path
// where the LLM invents an `app-shell` story as S1, drops/renames a registered
// story, or restructures a story's ACs — this guard halts at the design-spec
// gate with a legible diff instead of letting the run thrash through the reflect
// gate 20 turns later. Pure set comparison, no LLM.
//
// Absent registration.json => the guard is a COMPLETE no-op, so every normal
// (non-registered) project is unaffected.

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { storiesDir, acsDir } from "../config/consort-paths.js";

/** The project-level registration manifest path: `<consortDir>/registration.json`.
 *  Project-level (not per-feature) so a pre-registered example can STAGE it at
 *  seed/intake time — before the `features/<F>/` dir the planning lane creates. */
export const registrationPath = (consortDir: string): string => join(consortDir, "registration.json");

export interface RegisteredStory {
  id: string;
  acs: string[];
}
export interface Registration {
  feature_id: string;
  stories: RegisteredStory[];
}

/** Compare a story/AC by its SLUG, not its ordinal position: `S1-file-stock` ->
 *  `file-stock`, `AC2-inventory-code-stored` -> `inventory-code-stored`. Ordinals
 *  legitimately shift (a story inserted ahead of another renumbers the rest), so
 *  identity is the slug; the guard reports the meaningful SET difference. */
export function storySlug(id: string): string {
  return id.replace(/^S\d+-/, "");
}
export function acSlug(id: string): string {
  return id.replace(/^AC\d+-/, "");
}

export interface DerivedStory {
  id: string;
  acs: string[];
}
export interface BreakdownDivergence {
  ok: boolean;
  violations: string[];
}

/**
 * Does the derived story + AC breakdown match the registration (by slug)?
 * - A derived story whose slug is not registered => `unregistered story`.
 * - A registered story whose slug is absent from the derived set => `missing`.
 * - For a story present in BOTH that HAS ACs authored, the AC slug-sets must
 *   match. A derived story with NO ACs yet is skipped for the AC comparison
 *   (its design lane has not authored them); the story-set check still applies,
 *   so a story is never falsely flagged for un-authored ACs at an early gate.
 */
export function checkRegisteredBreakdown(registration: Registration, derived: DerivedStory[]): BreakdownDivergence {
  const violations: string[] = [];
  const regBySlug = new Map(registration.stories.map((s) => [storySlug(s.id), s]));
  const derBySlug = new Map(derived.map((s) => [storySlug(s.id), s]));
  const registeredList = registration.stories.map((s) => s.id).join(", ");

  for (const d of derived) {
    if (!regBySlug.has(storySlug(d.id))) {
      violations.push(`unregistered story "${d.id}" — not in the registered set (${registeredList}); the design lane must not invent or rename stories for a pre-registered feature`);
    }
  }
  for (const r of registration.stories) {
    if (!derBySlug.has(storySlug(r.id))) {
      violations.push(`registered story "${r.id}" is missing from the derived breakdown`);
    }
  }
  for (const r of registration.stories) {
    const d = derBySlug.get(storySlug(r.id));
    if (!d || d.acs.length === 0) continue; // absent (reported above) or ACs not yet authored
    const regAc = new Set(r.acs.map(acSlug));
    const derAc = new Set(d.acs.map(acSlug));
    for (const a of d.acs) {
      if (!regAc.has(acSlug(a))) violations.push(`story "${d.id}": unregistered AC "${a}" (registered ACs: ${r.acs.join(", ")})`);
    }
    for (const a of r.acs) {
      if (!derAc.has(acSlug(a))) violations.push(`story "${d.id}": registered AC "${a}" is missing`);
    }
  }
  return { ok: violations.length === 0, violations };
}

/** The registration manifest, when the project declares one for THIS feature.
 *  Reads project-level `<consortDir>/registration.json`; returns null when absent,
 *  malformed, or registered for a DIFFERENT feature — so the guard is a complete
 *  no-op for every non-registered project (and for other features of a project
 *  that pre-registers only one). */
export function readRegistration(consortDir: string, featureId: string): Registration | null {
  const p = registrationPath(consortDir);
  if (!existsSync(p)) return null;
  try {
    const reg = JSON.parse(readFileSync(p, "utf8")) as Registration;
    if (!reg || reg.feature_id !== featureId || !Array.isArray(reg.stories)) return null;
    return reg;
  } catch {
    return null; // a malformed manifest must not crash the gate; treat as absent
  }
}

/** Read the derived story + AC breakdown from disk: each story dir under
 *  `features/<F>/stories/` and the AC ids (file basenames sans `.json`) under its
 *  `acs/`. This is what the live design lane actually produced. */
export function readDerivedBreakdown(consortDir: string, featureId: string): DerivedStory[] {
  const sdir = storiesDir(consortDir, featureId);
  if (!existsSync(sdir)) return [];
  return readdirSync(sdir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const adir = acsDir(consortDir, featureId, e.name);
      const acs = existsSync(adir)
        ? readdirSync(adir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort()
        : [];
      return { id: e.name, acs };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
