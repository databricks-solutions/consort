// The telemetry consent predicate. Pure: no I/O, no clock, no globals , the
// caller supplies the persisted flag, whether stdout is a TTY, and the env.
//
// Emit IFF ALL of these hold:
//   1. telemetry_enabled === true      (the persisted opt-out flag)
//   2. stdout.isTTY === true           (a human at an interactive terminal)
//   3. CI is unset / falsey            (never in automation)
//   4. DO_NOT_TRACK not in {1,true}    (the cross-tool opt-out standard)
//   5. CONSORT_TELEMETRY !== "0"       (the kit's explicit per-invocation kill)
//
// Environment overrides ALWAYS win , and they only ever DISABLE. There is no
// force-enable env: an operator can always silence telemetry (DO_NOT_TRACK, CI,
// CONSORT_TELEMETRY=0), but no env can turn it on where the five conditions do
// not already agree. This is a conjunction: any single failing condition => no
// emit (a silent no-op upstream).

export interface ConsentInputs {
  /** The persisted `telemetry_enabled` flag (from ~/.config/consort). */
  telemetryEnabled: boolean;
  /** Whether stdout is an interactive TTY (process.stdout.isTTY). */
  isTTY: boolean;
  /** The process environment (read for CI / DO_NOT_TRACK / CONSORT_TELEMETRY). */
  env: NodeJS.ProcessEnv;
}

/** DO_NOT_TRACK opts out on "1" or "true" (case-insensitive), per the standard. */
const doNotTrack = (env: NodeJS.ProcessEnv): boolean => {
  const v = (env.DO_NOT_TRACK ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
};

/** CI is "truthy" for anything set + non-empty that is not explicitly 0/false ,
 *  err toward NOT emitting (privacy-safe) when a CI provider sets an odd value. */
const inCi = (env: NodeJS.ProcessEnv): boolean => {
  const v = (env.CI ?? "").trim();
  if (v === "") return false;
  return !/^(0|false)$/i.test(v);
};

/** The kit's explicit per-invocation kill: CONSORT_TELEMETRY="0" disables. */
const killed = (env: NodeJS.ProcessEnv): boolean => (env.CONSORT_TELEMETRY ?? "").trim() === "0";

/**
 * Whether telemetry may be emitted for this invocation. See the module header
 * for the five-condition conjunction. Env overrides (kill, DO_NOT_TRACK, CI) are
 * checked first so they always win.
 */
export function shouldEmitTelemetry(inp: ConsentInputs): boolean {
  if (killed(inp.env)) return false;
  if (doNotTrack(inp.env)) return false;
  if (inCi(inp.env)) return false;
  if (!inp.isTTY) return false;
  if (!inp.telemetryEnabled) return false;
  return true;
}
