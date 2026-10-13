#!/usr/bin/env node
import { S as SweepSpec } from '../../optimize-candidates-CCaMNrEX.js';
import '../../step-key-D8bNukll.js';

interface OptimizeArgs {
    scenario?: string;
    feature?: string;
    /** A single handoff id to optimize (else the whole feature's handoffs). */
    handoff?: string;
    /** Restrict to one lane. */
    only?: "design" | "build";
    /** The sweep spec string (see parseSweepSpec). */
    candidates?: string;
    /** Trials per candidate (median of passing). Default 3. */
    trials: number;
    /** Print the plan (handoffs + generated candidates) and exit; no spawns. */
    dryRun?: boolean;
    /** Propose-only: run + rank + report, but do NOT overlay/record a winner. The
     *  human reviews the ranked candidates and runs optimize-apply to persist one. */
    proposeOnly?: boolean;
    /** Sweep EVERY role handoff in a lane (design|build), sequentially, with per-role
     *  default candidates (defaultLaneCandidates) – not just the one handoff the drive
     *  sits on. Overrides the single-handoff path. */
    sweepLane?: "design" | "build";
    /** With --sweep-lane: the handoff id OR role to START sweeping from. Handoffs before
     *  it are already-settled (winner applied to the kit) – ADVANCED once at baseline to
     *  reach the target, NOT re-swept. Lets a lane resume at the next unsettled role. */
    from?: string;
    projectDir?: string;
}
/** Parse the CLI flags. Pure. */
declare function parseOptimizeArgs(argv: string[]): OptimizeArgs;
/** Parse a sweep spec string into a SweepSpec. The grammar is `;`-separated
 *  dimensions, each `key=v1,v2,...`:
 *    <role>.<turn>.model=<m>,...      per-turn model tiering
 *    <role>.<turn>.effort=<e>,...     per-turn effort
 *    build.sessionScope=story,cycle   session warmth (scope)
 *    build.loopGranularity=story,ac   loop granularity
 *    env.CONTEXT_FREE_FRACTION=0.3,.. session warmth (fraction, on env)
 *  All model/effort dimensions share ONE role (the last one named wins); the
 *  sweep targets a single role's turns, matching the plan's navigator/driver focus.
 *  Content variants (Family 2) are supplied programmatically, not via this string. */
declare function parseSweepSpec(spec: string): SweepSpec;

export { type OptimizeArgs, parseOptimizeArgs, parseSweepSpec };
