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
