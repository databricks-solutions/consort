// Shared loader + compiler for the JSON schemas under consort/config/schemas/. Single source of
// schema-compilation truth so spec-sync (drift reporting) and artifact-conformance (gate
// preconditions) validate against the SAME compiled validators instead of each rolling their own
// Ajv instance. Lives in the validators family (its registry is the primary consumer); the schema
// JSON files live in the config foundation (consort/config/schemas/) since they are the shared
// contract data the whole kit validates against, and are copied to dist by copy-build-assets.mjs.
//
// Validators are compiled lazily and cached by schema filename: the first
// caller pays the compile, every later caller reuses it.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import Ajv, { type ValidateFunction } from "ajv";

/**
 * Resolve the schemas dir robustly across runtime layouts, since this module is INLINED by tsup
 * (`splitting:false`) into each consuming entry (dist/bin/**, dist/apps/mcp-server, …) at varying
 * directory depths rather than sitting next to the schemas:
 *   - SOURCE (vitest / tsx): __dirname is this file's home (consort/orchestrator/validators), so
 *     the sibling walk consort/../config/schemas resolves directly.
 *   - DIST (consumer install): the schemas are copied to dist/consort/config/schemas/ (and the kit
 *     also ships the source tree). Since the inlined consumer's depth under dist/ varies, walk UP
 *     from __dirname looking for a consort/config/schemas at each ancestor – depth-independent.
 * First existing candidate wins.
 */
function resolveSchemaDir(): string {
  // Direct source path first (consort/orchestrator/validators -> consort/config/schemas).
  const direct = join(__dirname, "..", "..", "config", "schemas");
  if (existsSync(direct)) return direct;
  // Otherwise walk up ancestors, probing <ancestor>/consort/config/schemas at each level – this
  // finds the dist mirror regardless of how deep the inlined entry sits under dist/.
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const cand = join(dir, "consort", "config", "schemas");
    if (existsSync(cand)) return cand;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return direct;
}

const SCHEMA_DIR = resolveSchemaDir();

const ajv = new Ajv({ allErrors: true, strict: false });
// Register the `date-time` format as permissive (accept any string). Several
// schemas annotate a `timestamp` with `format: "date-time"`, but Ajv ships no
// format validators, so it logged `unknown format "date-time" ignored` on every
// validation (twice per call), pure console noise. We never validated the format
// (it was ignored), so a no-op registration preserves behavior + silences it,
// with no dependency on the transitive ajv-formats.
ajv.addFormat("date-time", true);
const validatorCache = new Map<string, ValidateFunction>();

/** Read + parse a schema file from consort/config/schemas/ by filename. */
export function loadSchema(name: string): object {
  return JSON.parse(readFileSync(join(SCHEMA_DIR, name), "utf8"));
}

/** Absolute path to a schema file (the SAME dir the validators compile from). Lets a step manifest
 *  hand an authoring turn the exact schema its output is gated against, via a `schema:` input source —
 *  one source of truth, so the contract the agent reads is byte-identical to the one the gate enforces. */
export function schemaPath(name: string): string {
  return join(SCHEMA_DIR, name);
}

/**
 * Return a cached, compiled Ajv validator for a schema filename
 * (e.g. "feature.schema.json"). Compiles on first use, then memoizes.
 */
export function getValidator(name: string): ValidateFunction {
  const cached = validatorCache.get(name);
  if (cached) return cached;
  const validate = ajv.compile(loadSchema(name));
  validatorCache.set(name, validate);
  return validate;
}

/**
 * Render Ajv validation errors into short, human-readable strings like
 * `/status: must be equal to one of the allowed values`. Falls back to a
 * generic message when Ajv attached no error detail.
 */
export function formatSchemaErrors(validate: ValidateFunction): string[] {
  const errors = validate.errors ?? [];
  if (errors.length === 0) return ["schema validation failed"];
  return errors.map((e) => {
    const where = e.instancePath && e.instancePath.length > 0 ? e.instancePath : "(root)";
    return `${where}: ${e.message ?? "invalid"}`;
  });
}
