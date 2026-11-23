// CI-enforced parity between the Claude `/consort:start` command (`commands/start.md`) and the Copilot
// coordinator skill (`integrations/copilot/consort-copilot/skills/consort/SKILL.md`), driven by the ONE
// canonical manifest `integrations/copilot/coordinator-parity.ts`.
//
// This makes "the Copilot coordinator does every /consort:start content step" an INVARIANT, not hand-trust:
//   (1) every `content` step's skillAnchor is present in SKILL.md;
//   (2) every `claude-mechanic` step is either transformed (its skillAnchor present) or omitted (its
//       skillAnchor present in SKILL.md's "Intentional omissions" subsection);
//   (3) drift guard BOTH ways — every `##`/`###` header and `**Step N` marker section of start.md maps to
//       at least one manifest anchor (a NEW start.md step with no manifest entry FAILS), and every manifest
//       anchor is literally present in start.md (a REMOVED start.md step is caught).
//
// Precedent for reading start.md in a test: `tests/bdd/start-kit-pin.test.ts`.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { COORDINATOR_PARITY, type CoordinatorStep } from "../../integrations/copilot/coordinator-parity";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const startMd = fs.readFileSync(path.join(repoRoot, "commands", "start.md"), "utf8");
const skillMd = fs.readFileSync(
  path.join(repoRoot, "integrations", "copilot", "consort-copilot", "skills", "consort", "SKILL.md"),
  "utf8",
);

// The "Intentional omissions" subsection of the skill — an omitted mechanic's reason must live HERE,
// not just anywhere in the skill, so an omission is a deliberate, documented decision.
const omissionsSection = (() => {
  const i = skillMd.indexOf("Intentional omissions");
  return i >= 0 ? skillMd.slice(i) : "";
})();

/**
 * Both-directions drift checker (pure, so the negative test can feed it a synthetic start.md):
 * returns the TITLES of start.md structural units (## / ### headers and `**Step N` markers) whose
 * section body contains NONE of the manifest anchors — i.e. an un-mirrored start.md step.
 *
 * A unit's section runs from the unit line to the next unit that "closes" it: for a header, the next
 * header of the SAME-OR-HIGHER level (so a `##` section spans its `###` children); for a step marker,
 * the next step marker OR the next header.
 */
export function unmappedStartMdUnits(text: string, anchors: string[]): string[] {
  const lines = text.split("\n");
  interface Unit {
    line: number;
    title: string;
    level: number; // 2 or 3 for headers; 3 for step markers (so a header closes them)
    isStep: boolean;
  }
  const units: Unit[] = [];
  lines.forEach((ln, i) => {
    const h = ln.match(/^(#{2,3})\s+(.*)$/);
    if (h) {
      units.push({ line: i, title: h[2].trim(), level: h[1].length, isStep: false });
      return;
    }
    const s = ln.match(/^\*\*Step\s+\d+\s*[—-]\s*(.*)$/);
    if (s) units.push({ line: i, title: s[1].replace(/\*\*.*$/, "").trim(), level: 3, isStep: true });
  });

  const unmapped: string[] = [];
  for (let u = 0; u < units.length; u++) {
    const cur = units[u];
    // Find where this unit's section ends.
    let endLine = lines.length;
    for (let v = u + 1; v < units.length; v++) {
      const nxt = units[v];
      const closes = cur.isStep
        ? true // a step marker is closed by the very next unit (another step OR any header)
        : !nxt.isStep && nxt.level <= cur.level; // a header is closed by a same-or-higher header
      if (closes) {
        endLine = nxt.line;
        break;
      }
    }
    const section = lines.slice(cur.line, endLine).join("\n");
    if (!anchors.some((a) => section.includes(a))) unmapped.push(cur.title);
  }
  return unmapped;
}

const ALL_ANCHORS = COORDINATOR_PARITY.map((s) => s.startMdAnchor);
const content = COORDINATOR_PARITY.filter((s) => s.kind === "content");
const mechanics = COORDINATOR_PARITY.filter((s) => s.kind === "claude-mechanic");

describe("coordinator parity — manifest shape", () => {
  it("every entry is well-formed (unique id, an anchor present in start.md, skillAnchor set)", () => {
    const ids = new Set<string>();
    for (const s of COORDINATOR_PARITY) {
      expect(s.id, `duplicate id ${s.id}`).not.toBe([...ids].find((x) => x === s.id));
      ids.add(s.id);
      expect(s.startMdAnchor, `${s.id}: startMdAnchor must be in start.md`).toBeTruthy();
      expect(startMd.includes(s.startMdAnchor), `${s.id}: startMdAnchor not in start.md: ${s.startMdAnchor}`).toBe(true);
      expect(s.skillAnchor, `${s.id}: must carry a skillAnchor`).toBeTruthy();
    }
    expect(ids.size).toBe(COORDINATOR_PARITY.length);
  });

  it("every claude-mechanic carries exactly a transformRule XOR an omissionReason", () => {
    for (const s of mechanics) {
      const t = !!s.transformRule;
      const o = !!s.omissionReason;
      expect(t !== o, `${s.id}: need exactly one of transformRule / omissionReason`).toBe(true);
    }
  });
});

describe("coordinator parity — (1) every content step is covered in the Copilot skill", () => {
  it.each(content.map((s) => [s.id, s.skillAnchor!] as const))(
    "content step %s is present in SKILL.md",
    (_id, anchor) => {
      expect(skillMd.includes(anchor), `missing content coverage: ${anchor}`).toBe(true);
    },
  );
});

describe("coordinator parity — (2) every claude-mechanic is transformed or documented-as-omitted", () => {
  it.each(mechanics.map((s) => [s.id, s] as const))("mechanic %s", (_id, s: CoordinatorStep) => {
    if (s.omissionReason) {
      // Omission: its token must live in the skill's Intentional-omissions subsection.
      expect(
        omissionsSection.includes(s.skillAnchor!),
        `omission ${s.id} not documented in the Intentional omissions section: ${s.skillAnchor}`,
      ).toBe(true);
    } else {
      // Transform: its token must be present somewhere in the skill (the transform landed).
      expect(skillMd.includes(s.skillAnchor!), `transform ${s.id} not reflected in the skill: ${s.skillAnchor}`).toBe(true);
    }
  });
});

describe("coordinator parity — (3) drift guard, both directions", () => {
  it("every start.md header + step-marker section maps to a manifest anchor (new start.md step ⇒ fail)", () => {
    const unmapped = unmappedStartMdUnits(startMd, ALL_ANCHORS);
    expect(unmapped, `unmapped start.md sections (add manifest entries): ${JSON.stringify(unmapped)}`).toEqual([]);
  });

  it("every manifest anchor is literally present in start.md (removed start.md step ⇒ fail)", () => {
    const missing = ALL_ANCHORS.filter((a) => !startMd.includes(a));
    expect(missing, `manifest anchors no longer in start.md: ${JSON.stringify(missing)}`).toEqual([]);
  });

  it("PROVES THE GUARD: a synthetic new start.md header with no manifest entry is flagged", () => {
    // Append a dummy step to a SCRATCH COPY (commands/start.md is never modified) and assert the
    // drift-checker catches the unmapped section.
    const synthetic = startMd + "\n\n### Dummy parity step\n\nA brand-new /consort:start step nothing maps to.\n";
    const unmapped = unmappedStartMdUnits(synthetic, ALL_ANCHORS);
    expect(unmapped).toContain("Dummy parity step");
    // And the real doc (no dummy) stays clean — the guard isn't just always-failing.
    expect(unmappedStartMdUnits(startMd, ALL_ANCHORS)).toEqual([]);
  });
});
