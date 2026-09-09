// Proactive fix for the multi-part-NFR reflect<->revise thrash (portfolio-manager19 / stockflow-3-78):
// a COMPOUND fitness_function packs several checkable claims into one prose string, so the Test
// Strategist must infer N tests from it and the navigator's reflect surfaces the uncovered
// sub-clauses ONE-PER-LAP — a full-design revise each lap that burns the reflect budget. The
// architect must instead declare the ATOMIC `fitness_functions` ARRAY (one obligation per entry),
// tagged `nfr_id`, which the deterministic `checkFitnessClauseCoverage` gate enforces 1:1 so the
// design converges in a single reflect pass. (Layering is the EXCEPTION: declared in
// `layers[].may_import` + defended by the consort-layering-clean gate, NOT emitted as `nfrs[]`.)
// This guards that guidance stays in the architect prompt.

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ARCHITECT = path.resolve(__dirname, "..", "..", "skills", "consort", "agents", "architect-reviewer.md");

describe("architect emits ATOMIC per-clause fitness NFRs (anti reflect-thrash)", () => {
  const md = readFileSync(ARCHITECT, "utf8");

  it("directs a multi-part NFR to the atomic fitness_functions ARRAY, never a compound fitness_function", () => {
    expect(md).toMatch(/atomic/i);
    expect(md, "must warn against a compound fitness_function").toMatch(/compound[^\n]*fitness_function/i);
    expect(md, "must direct multi-part NFRs to the fitness_functions array").toMatch(
      /fitness_functions[^\n]*array|array[^\n]*fitness_functions/i,
    );
    expect(md, "must name the deterministic per-clause gate").toMatch(/checkFitnessClauseCoverage/);
    expect(md, "must require nfr_id tagging so per-clause coverage is checkable").toMatch(/nfr_id/);
  });

  it("keeps layering as the EXCEPTION (declared in may_import, gate-defended) and states the single-pass payoff", () => {
    expect(md, "layering is declared in may_import, not as a fitness NFR").toMatch(/may_import/);
    expect(md).toMatch(/LAYERING is the exception/i);
    // the payoff the rule exists for: 1:1 coverage converging in one reflect pass
    expect(md).toMatch(/single reflect pass|converge[^\n]*reflect/i);
  });
});
