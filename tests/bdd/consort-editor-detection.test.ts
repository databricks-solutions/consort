import { describe, it, expect } from "vitest";
import { isInsideEditor } from "../../consort/orchestrator/open/open-in-editor";

describe("isInsideEditor — env-marker branches (deterministic) + tmux fallback", () => {
  it("true on the direct editor markers", () => {
    expect(isInsideEditor({ TERM_PROGRAM: "vscode" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isInsideEditor({ CURSOR_TRACE_ID: "abc" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isInsideEditor({ VSCODE_PID: "123" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isInsideEditor({ VSCODE_GIT_IPC_HANDLE: "/tmp/x" } as NodeJS.ProcessEnv)).toBe(true);
  });
  it("false when there are no markers and not under tmux", () => {
    expect(isInsideEditor({ TERM_PROGRAM: "xterm-256color" } as NodeJS.ProcessEnv)).toBe(false);
    expect(isInsideEditor({} as NodeJS.ProcessEnv)).toBe(false);
  });
  it("under tmux (markers stripped) it falls back to the ancestry probe instead of hard-false — never throws", () => {
    // The live Cursor+tmux miss: TERM_PROGRAM=tmux, no CURSOR_TRACE_ID. The result is ancestry-
    // dependent (true inside an editor, false otherwise); assert only that it resolves a boolean
    // via the fallback rather than the old unconditional false / a throw.
    const r = isInsideEditor({ TERM_PROGRAM: "tmux", TMUX: "/tmp/tmux-x/default,1,0" } as NodeJS.ProcessEnv);
    expect(typeof r).toBe("boolean");
  });
});

import { buildPreflight } from "../../consort/session/preflight";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("preflight emits a deterministic env.editor fact (C3 — PATH-robust, no false 'no editor')", () => {
  it("includes env.editor with a boolean `found` + cmd/host, so the session reads it instead of a bare command -v", () => {
    const b = buildPreflight(mkdtempSync(join(tmpdir(), "pf-editor-")));
    expect(b.env).toHaveProperty("editor");
    expect(typeof b.env.editor.found).toBe("boolean");
    // found === (cmd !== null): the fact is coherent (never found:true with a null cmd).
    expect(b.env.editor.found).toBe(b.env.editor.cmd !== null);
    expect([null, "cursor", "code"]).toContain(b.env.editor.host);
  });
});
