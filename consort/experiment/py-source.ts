// Shared Python top-level-block splitter. A "block" is one decorated top-level unit — a decorator run
// plus the def/async-def/class it annotates, through to the line before the next such unit (trailing
// blanks included) — so a function and its decorators never split apart. Used by:
//   - ac-lane-merge: function-block merge of concurrent per-AC test appends (never line-interleave).
//   - contract-clean: classify a superseded-test file as PURE (every test fn references a dropped
//     symbol) vs MIXED (some surviving tests), so the sweep can deterministically retire the pure ones.
// One parser, one definition (DRY): both callers key on the same block identity + boundaries.

export interface PyBlock {
  /** Dedup/identity key: the first def/class name in the block, else the trimmed block text. */
  key: string;
  /** The block's source lines (decorator run + def/class body, through the line before the next unit). */
  lines: string[];
}

/**
 * Split a Python source into a leading PREAMBLE (module-level imports / setup before the first
 * top-level unit) and an ordered list of top-level BLOCKS. A block starts at a column-0 decorator
 * run or a bare `def`/`async def`/`class`, and runs until the next such start (decorators stay with
 * the def/class they annotate). Identity is the name of the first def/class declared.
 */
export function splitPyBlocks(src: string): { preamble: string[]; blocks: PyBlock[] } {
  const lines = src.split("\n");
  const isTop = (l: string) => /^(@|def |async def |class )/.test(l);
  const isDecorator = (l: string) => /^@/.test(l);
  // A block START is a top-level line whose previous line is NOT a decorator (so decorators group
  // with the def/class they annotate instead of splitting off).
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isTop(lines[i]) && (i === 0 || !isDecorator(lines[i - 1]))) starts.push(i);
  }
  if (starts.length === 0) return { preamble: lines, blocks: [] };
  const preamble = lines.slice(0, starts[0]);
  const blocks: PyBlock[] = [];
  for (let s = 0; s < starts.length; s++) {
    const from = starts[s];
    const to = s + 1 < starts.length ? starts[s + 1] : lines.length;
    const blockLines = lines.slice(from, to);
    const m = blockLines.join("\n").match(/^(?:async def|def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/m);
    blocks.push({ key: m ? `name:${m[1]}` : `text:${blockLines.join("\n").trim()}`, lines: blockLines });
  }
  return { preamble, blocks };
}

/** The first def/class NAME a block declares (without the `name:` key prefix), or null for an
 *  anonymous/text-keyed block. */
export function blockDefName(b: PyBlock): string | null {
  return b.key.startsWith("name:") ? b.key.slice("name:".length) : null;
}
