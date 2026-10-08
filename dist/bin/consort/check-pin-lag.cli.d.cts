#!/usr/bin/env node
/** The project's EFFECTIVE runtime-kit pin: the run pin (kit-ref.local) wins over the
 *  committed CI pin (kit-ref); undefined when the project is unpinned. Read from cwd. */
declare function readProjectPin(cwd?: string): string | undefined;
declare function runCheckPinLag(argv: string[]): number;

export { readProjectPin, runCheckPinLag };
