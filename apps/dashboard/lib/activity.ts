// Render a raw agent tool marker into a legible one-line "activity" the driver-activity ticker shows.
//
// The runner records each tool action full-fidelity as `<ToolName> <complete-input-JSON>` (see
// consort/session/claude-usage.ts assistantEventSummary) — e.g.
//   Bash {"command":"cd …; ls …","description":"Survey project layout and tests"}
//   Edit {"file_path":"<PROJECT_ROOT>/app/routes/stock.py","old_string":"…","new_string":"…"}
//   Write {"file_path":"<PROJECT_ROOT>/client/src/components/StockTable.tsx","content":"…"}
// That is exact but unreadable in a ticker. This distills it to { verb, target }: the human action
// (the Bash `description`, the edited/written/read file, the search pattern) with the noisy prefixes
// stripped — so the ticker reads "Edit app/routes/stock.py", "Survey project layout and tests",
// "Run story E2E specs", not a 1 KB JSON blob. Pure + total: anything unparseable degrades to the
// raw verb, never throws (a ticker must not break on an odd marker).

export interface ToolActivity {
  /** The tool/action verb, e.g. "Edit", "Write", "Read", "Bash", "Grep". */
  verb: string;
  /** A short human target: a project-relative file, a Bash description, a pattern — or "". */
  target: string;
  /** The UNCLIPPED target, present ONLY when `target` was truncated — so a UI can show the full
   *  text on hover (a `title`). Absent when `target` already holds the whole thing. */
  full?: string;
}

// Strip a leading `<PROJECT_ROOT>/` / absolute-home prefix so a file path reads project-relative.
function relPath(p: string): string {
  return p
    .replace(/^<[^>]*>\/?/, "") // <PROJECT_ROOT>/ placeholder the recorder substitutes
    .replace(/^\/(?:Users|home)\/[^/]+\/[^/]*\//, "") // an absolute home-rooted path's leading dirs
    .replace(/^\.?\//, "");
}

function clip(s: string, n = 72): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

// A Bash command with no `description` is the ticker's noisiest fallback — strip the boilerplate so
// it reads as the actual work: drop a leading `cd <dir>; ` and the recorder's `<PROJECT_ROOT>/`
// placeholder, keeping the meaningful command.
function cleanCommand(cmd: string): string {
  return cmd
    .replace(/^\s*cd\s+[^;]+;\s*/, "")
    .replace(/<[^>]*>\//g, "")
    .replace(/<[^>]*>/g, "");
}

// A path's short form for a ticker: its basename, keeping the parent dir when the basename is a glob
// (so `acs/*.json` reads as `acs/*.json`, not a bare `*.json`).
function shortPath(p: string): string {
  const parts = relPath(p).split("/").filter(Boolean);
  const base = parts[parts.length - 1] ?? p;
  return base.includes("*") && parts.length >= 2 ? `${parts[parts.length - 2]}/${base}` : base;
}

// File-like args of a command segment: tokens that aren't flags, operators, or the recorder's pipe
// tails — shortened to basenames.
function fileArgs(rest: string): string[] {
  return rest
    .split(/\s+/)
    .filter((t) => t && !t.startsWith("-") && !/^[|&><]/.test(t) && !/[|<>]/.test(t))
    .map(shortPath);
}

function uniqCapped(xs: string[], cap = 4): string {
  const seen: string[] = [];
  for (const x of xs) if (x && !seen.includes(x)) seen.push(x);
  return seen.length > cap ? `${seen.slice(0, cap).join(", ")} +${seen.length - cap} more` : seen.join(", ");
}

// Deterministically distill a description-LESS Bash command into a human action phrase, so the step
// panel never dumps raw shell. The agent SHOULD write a `description` (the directive asks for one);
// this HARDENS the panel for the calls where it doesn't (read-only `cat`/`grep` probes, a quick
// `echo > file`). Recognizes the common agent shapes and degrades to the cleaned command otherwise.
// Split a command into `;` / `&&` / newline-separated segments WITHOUT breaking inside quotes — so a
// `python3 -c "import json;print(1)"` script's inner `;` does not spawn a spurious segment.
function splitSegments(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === ";" || c === "\n") {
      out.push(cur);
      cur = "";
    } else if (c === "&" && s[i + 1] === "&") {
      out.push(cur);
      cur = "";
      i++;
    } else {
      cur += c;
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function summarizeCommand(cmd: string): string {
  const normalized = cmd.replace(/<[^>]*>\//g, "").replace(/<[^>]*>/g, "");
  const segs = splitSegments(normalized)
    .map((s) => s.replace(/\s*\|\s*(?:head|tail|sort|uniq|wc|less|more|cat|tr|cut|awk|sed)\b.*$/, "").trim())
    .filter(Boolean)
    .filter((s) => !/^cd\b/.test(s) && !/^(?:set|export)\b/.test(s) && !/^echo\s+["']?(?:---|===|#)/.test(s));

  const reads: string[] = [];
  const phrases: string[] = [];
  for (const s of segs) {
    const head = /^(\S+)/.exec(s)?.[1] ?? s;
    const rest = s.slice(head.length).trim();
    if (/^(?:cat|less|head|tail)$/.test(head)) {
      if (/^>|<</.test(rest)) phrases.push(`write ${shortPath((/>?\s*([^\s<]+)/.exec(rest.replace(/^>\s*/, "")) ?? [])[1] ?? "file")}`);
      else reads.push(...fileArgs(rest));
    } else if (head === "ls") {
      reads.push(...fileArgs(rest));
    } else if (/^(?:grep|rg|egrep|fgrep)$/.test(head)) {
      const pat = (/(["'])(.*?)\1/.exec(rest) ?? [])[2] ?? rest.split(/\s+/).find((t) => t && !t.startsWith("-"));
      const files = fileArgs(rest);
      phrases.push(files.length ? `search ${uniqCapped(files)}${pat ? ` for ${pat}` : ""}` : `search for ${pat ?? ""}`.trim());
    } else if (/^(?:echo|printf|tee)$/.test(head) && />\s*\S/.test(rest)) {
      phrases.push(`write ${shortPath((/>\s*(\S+)/.exec(rest) ?? [])[1] ?? "file")}`);
    } else if (/^python3?$/.test(head)) {
      phrases.push("run python");
    } else if (head === "node") {
      phrases.push("run node");
    } else if (head === "mkdir") {
      phrases.push(`create ${uniqCapped(fileArgs(rest))}`);
    } else if (/^(?:cp|mv|rm|touch|chmod)$/.test(head)) {
      phrases.push(`${head} ${uniqCapped(fileArgs(rest))}`.trim());
    } else {
      // Unrecognized: keep the segment's cleaned head + a little context, never the whole blob.
      phrases.push(clip(s, 40));
    }
  }
  if (reads.length) phrases.unshift(`read ${uniqCapped(reads)}`);
  const summary = phrases.filter(Boolean).join("; ");
  return summary || cleanCommand(cmd);
}

// Build a ToolActivity, attaching the UNCLIPPED `full` ONLY when the display `target` actually
// truncated — so a UI can reveal the whole text on hover, and callers comparing a short result stay
// unaffected (no spurious `full`). `clip` already normalizes whitespace, so an untruncated target
// equals the normalized full and no `full` is added.
function finish(verb: string, raw: string): ToolActivity {
  const target = clip(raw);
  const full = raw.replace(/\s+/g, " ").trim();
  return target === full ? { verb, target } : { verb, target, full };
}

/** Distill one raw tool marker to { verb, target, full? }. Never throws. */
export function renderToolMarker(raw: string): ToolActivity {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { verb: "", target: "" };
  const sp = trimmed.indexOf(" ");
  const verb = sp === -1 ? trimmed : trimmed.slice(0, sp);
  const rest = sp === -1 ? "" : trimmed.slice(sp + 1).trim();
  if (!rest) return { verb, target: "" };

  let input: Record<string, unknown> | null = null;
  if (rest.startsWith("{")) {
    try {
      input = JSON.parse(rest) as Record<string, unknown>;
    } catch {
      input = null;
    }
  }
  if (!input) return finish(verb, rest);

  const str = (k: string): string | undefined => (typeof input![k] === "string" ? (input![k] as string) : undefined);

  // File-oriented tools FIRST (an explicit file target): Read/Edit/Write/NotebookEdit.
  const file = str("file_path") ?? str("notebook_path");
  if (file) return finish(verb, relPath(file));

  // Bash: prefer the human description over the raw command.
  if (str("description")) return finish(verb, str("description")!);
  // Search tools BEFORE the generic `path` (Grep/Glob carry `path` as the SEARCH DIR, not the
  // target — the `pattern`/`query` is the meaningful activity).
  if (str("pattern")) return finish(verb, str("pattern")!);
  if (str("query")) return finish(verb, str("query")!);
  if (str("command")) return finish(verb, summarizeCommand(str("command")!));
  if (str("url")) return finish(verb, str("url")!);
  if (str("path")) return finish(verb, relPath(str("path")!));

  // Fallback: the first string-valued field, else nothing.
  for (const v of Object.values(input)) if (typeof v === "string" && v) return finish(verb, v);
  return { verb, target: "" };
}

/** Distill an ordered list of raw markers; drops empties. */
export function renderToolMarkers(raw: string[]): ToolActivity[] {
  return (raw ?? []).map(renderToolMarker).filter((a) => a.verb);
}
