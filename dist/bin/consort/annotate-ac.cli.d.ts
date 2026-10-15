#!/usr/bin/env node
interface ParsedArgs {
    feature?: string;
    story?: string;
    ac?: string;
    layer?: string;
    notes?: string;
    uiSeams?: string;
    apiContract?: string;
    consortDir?: string;
    help?: boolean;
}
declare function parseArgs(argv: string[]): ParsedArgs;
/**
 * Merge the Architect's fields into an AC object, preserving every existing field.
 * Pure – the caller does the fs. Throws on malformed input JSON (a pre-existing
 * corruption we must not silently overwrite).
 */
declare function mergeAcAnnotation(raw: string, fields: {
    layer?: string;
    notes: string;
    uiSeams?: string[];
    apiContract?: string;
}): string;
/** Parse a comma-separated --ui-seams value into a trimmed, de-duped token list. */
declare function parseUiSeams(raw: string | undefined): string[] | undefined;

export { mergeAcAnnotation, parseArgs, parseUiSeams };
