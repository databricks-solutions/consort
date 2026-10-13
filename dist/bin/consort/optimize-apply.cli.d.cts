#!/usr/bin/env node
import { C as Candidate } from '../../optimize-candidates-B3HDw9iX.cjs';
import '../../step-key-D8bNukll.cjs';

interface ApplyCliArgs {
    projectDir?: string;
    handoff?: string;
    candidate?: string;
    /** The kit checkout to edit (defaults to this kit – resolved from the module). */
    kitDir?: string;
    dryRun?: boolean;
}
declare function parseApplyArgs(argv: string[]): ApplyCliArgs;
/** Read a candidate's recorded object from the sweep audit trail. The candidate is
 *  identical across its trials, so the first trial's candidate.json is canonical. */
declare function readRecordedCandidate(experimentsDir: string, handoff: string, candidateId: string): Candidate;
/** The role a handoff id targets (the id is "<story>-<role>[-<mode>]" or "<role>"). */
declare function roleFromHandoffId(handoffId: string): string;

export { type ApplyCliArgs, parseApplyArgs, readRecordedCandidate, roleFromHandoffId };
