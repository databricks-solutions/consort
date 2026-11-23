// The ONE informed-retry mechanism: compose + write the SPECIFIC output-validation violations for a
// rejected role turn to the role's handbackFile, so the drive's consumeHandback (buildClaudeCommandWithBody,
// BOTH executors) prepends them to the re-issued turn's prompt. Shared by the two failure-detection points
// so they never fight: the executor's phase-5 validate-outputs path (executor-dispatch), AND the
// orchestrator-expect conformance-predicate path (orchestrator-probe), whose generic ExpectationLedger
// handback carried no specifics. Keyed by role(+story) so it lands on exactly the re-issued turn; a passing
// turn writes nothing (consumeHandback read+deletes any), so no stale note. Best-effort (never breaks the drive).

import * as fs from "node:fs";
import { dirname } from "node:path";
import { handbackFile } from "../../config/consort-paths.js";

export function writeConformanceHandback(opts: {
  consortDir: string;
  featureId: string;
  role: string;
  story?: string;
  violations: string[];
  /** Artifact filename(s) the violations concern, named in the brief (optional). */
  artifacts?: string[];
}): void {
  const { consortDir, featureId, role, story, violations, artifacts } = opts;
  if (!consortDir || !featureId || !role || violations.length === 0) return;
  try {
    const named = artifacts && artifacts.length ? artifacts.join(", ") : "your previous output(s)";
    const brief =
      `## Automated conformance feedback — your previous turn was REJECTED\n\n` +
      `Your ${named} FAILED output validation and this turn is being re-issued. Fix EXACTLY these and ` +
      `RE-EMIT THE WHOLE FILE(S), conforming precisely to the declared schema/contract — do NOT add any ` +
      `key the schema does not define (the schemas are additionalProperties:false):\n` +
      violations.map((v) => `- ${v}`).join("\n") +
      `\n`;
    const hb = handbackFile(consortDir, featureId, role, story);
    fs.mkdirSync(dirname(hb), { recursive: true });
    fs.writeFileSync(hb, brief, "utf8");
  } catch {
    /* best-effort: the informed-retry note is observability, never load-bearing */
  }
}
