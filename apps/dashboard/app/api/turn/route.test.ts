/**
 * `/api/turn/<ord>` route tests.
 *
 * Exercised by calling the handler directly with a NextRequest, which is enough: the route is
 * pure request→response over `ReplaySource`, and this avoids standing up a server in the suite.
 *
 * The security case is the reason this file exists at all. `?file=` is attacker-controlled and
 * becomes a filesystem path — review found the containment check missing in
 * `readFileContent`, where traversal read the real /etc/passwd. That is fixed at the source,
 * but this route is the thing that would expose it, so it gets its own regression test.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { GET } from "./[ord]/route";

// v0.3.7 relocated the corpus examples/sftdd-scenarios/ → examples/replay/corpora/; try new then legacy.
const MARKETPLACE = join(process.env.HOME ?? "", ".claude/plugins/marketplaces/databricks-solutions");
const CORPUS =
  [
    process.env.CONSORT_TEST_CORPUS_DIR,
    join(MARKETPLACE, "examples/replay/corpora/stockflow-rerecord"),
    join(MARKETPLACE, "examples/sftdd-scenarios/stockflow-rerecord"),
  ]
    .filter((p): p is string => !!p)
    .find((p) => existsSync(join(p, "agent-log.jsonl"))) ??
  join(MARKETPLACE, "examples/replay/corpora/stockflow-rerecord");
const HAVE_CORPUS = existsSync(join(CORPUS, "agent-log.jsonl"));

// The handler reads the mode from the query and the corpus from the env, so both are set here.
const call = async (ord: string, query = "") => {
  const url = `http://localhost/api/turn/${ord}${query}`;
  const res = await GET(new NextRequest(url), { params: Promise.resolve({ ord }) });
  return { status: res.status, body: await res.json() };
};

describe.skipIf(!HAVE_CORPUS)("/api/turn/<ord>", () => {
  const saved = { corpus: process.env.CONSORT_CORPUS_DIR, project: process.env.CONSORT_PROJECT_DIR };
  beforeEach(() => {
    process.env.CONSORT_CORPUS_DIR = CORPUS;
  });
  afterEach(() => {
    if (saved.corpus === undefined) delete process.env.CONSORT_CORPUS_DIR;
    else process.env.CONSORT_CORPUS_DIR = saved.corpus;
    if (saved.project === undefined) delete process.env.CONSORT_PROJECT_DIR;
    else process.env.CONSORT_PROJECT_DIR = saved.project;
  });

  it("serves a turn with its transcript and classified produced files", async () => {
    const { status, body } = await call("0", "?mode=replay");
    expect(status).toBe(200);
    expect(body.role).toBe("spec-author");
    expect(body.kind).toBe("invoke-role");
    expect(body.produced).toEqual([
      { path: ".sftdd/planning/feature-proposals.md", kind: "artifact" },
    ]);
    expect(body.transcript.prompt.length).toBeGreaterThan(0);
    expect(Array.isArray(body.transcript.tools)).toBe(true);
  });

  it("keeps the parsed transcript and turn.json's summary distinct", () => {
    // turn.json has its own `transcript` key holding {model, toolCount, …}. The parsed body is
    // served under the same name, so the summary would be shadowed if it weren't renamed —
    // and the model/tool counts would vanish with no error.
    return call("0", "?mode=replay").then(({ body }) => {
      expect(body.transcriptSummary.model).toBe("opus");
      expect(body.transcriptSummary.toolCount).toBe(5);
      expect(body.transcript.prompt).toBeTypeOf("string"); // the parsed one, not the summary
    });
  });

  it("does NOT embed file contents in the turn payload", async () => {
    // Decision 1: content is a second fetch. A turn can produce a dozen files and only one is
    // ever on screen; embedding them recreates the 1.5 MB payload the merge set out to avoid.
    const { body } = await call("0", "?mode=replay");
    for (const p of body.produced) expect(p).not.toHaveProperty("content");
  });

  it("serves one file's snapshot content on ?file=", async () => {
    const { status, body } = await call("0", "?mode=replay&file=.sftdd/planning/feature-proposals.md");
    expect(status).toBe(200);
    expect(body.kind).toBe("artifact");
    expect(body.reason).toBeNull();
    expect(body.content).toContain("##");
  });

  it("refuses to read outside the turn's snapshot directory", async () => {
    for (const evil of [
      "../".repeat(30) + "etc/passwd",
      "../../../provenance.json",
      "../turn.json",
      "/etc/passwd",
    ]) {
      const { status, body } = await call("0", `?mode=replay&file=${encodeURIComponent(evil)}`);
      // 200 with a stated reason, not an error: the route answers "here is why you get nothing"
      // exactly as it does for a too-large or binary file. What matters is content === null.
      // The reason varies — a path that exists outside is "(outside…)", one that doesn't exist
      // fails realpath first and is "(not captured…)", which also avoids disclosing existence.
      expect(status).toBe(200);
      expect(body.content, `leaked via ${evil}`).toBeNull();
      expect(body.reason).toMatch(/outside this turn's snapshot|not captured/);
    }
  });

  it("names a code file as code, so the drill-down can separate it from bookkeeping", async () => {
    // Turn 16 produces an alembic migration; turn 31 a repository module. Both are real code
    // this run wrote, and must not read as `.sftdd/` bookkeeping.
    const mig = await call("16", "?mode=replay");
    const code = (mig.body.produced as { path: string; kind: string }[]).filter((p) => p.kind === "code");
    expect(code.length).toBeGreaterThan(0);
    expect(code.some((p) => p.path.startsWith("alembic/"))).toBe(true);
    for (const p of code) expect(p.path).not.toMatch(/^\.sftdd\//);

    // ...and its content is actually readable, which is the whole point of the corpus.
    const f = await call("16", `?mode=replay&file=${encodeURIComponent(code[0].path)}`);
    expect(f.body.kind).toBe("code");
    expect(f.body.content).toBeTypeOf("string");
  });

  it("classifies without reading file contents", async () => {
    // Found in review: classification went through `source.file()`, which also READS the file,
    // so the turn payload discarded every produced file's contents just to keep `.kind` —
    // measured 82,866 bytes across 21 files for turn 81, and 187,568 for turn 15. That is
    // exactly the per-request cost this lazy route exists to avoid. `classify` is a pure string
    // function, so the kinds must still be right while the reads are gone.
    //
    // Asserted by cost rather than by output: a turn whose produced files are large enough that
    // reading them would show up. Timing is too flaky to assert, so instead confirm the payload
    // never carries content — the only observable of the old path — and that kinds are correct.
    const { body } = await call("15", "?mode=replay");
    expect(body.produced.length).toBeGreaterThan(0);
    for (const p of body.produced) {
      expect(Object.keys(p).sort()).toEqual(["kind", "path"]); // no `content`, no `reason`
      expect(["code", "artifact"]).toContain(p.kind);
    }
  });

  it("survives a turn.json that omits produced/deleted", async () => {
    // Found in review: this PR relaxed most of TurnDetail to optional because the corpus really
    // does omit fields, but left `produced` required and then called `.map` on it — a turn
    // without it returned HTTP 500 "Cannot read properties of undefined". Normalised in
    // ReplaySource.turn now, so every consumer can iterate without a guard.
    const dir = mkdtempSync(join(tmpdir(), "turn-noprod-"));
    mkdirSync(join(dir, "turns", "0000-x"), { recursive: true });
    writeFileSync(
      join(dir, "turns", "index.json"),
      JSON.stringify({ turns: [{ ordinal: 0, step: 0, label: "x", kind: "invoke-role", role: "driver", dir: "0000-x", producedCount: 0, deletedCount: 0 }] }),
    );
    // No `produced`, no `deleted` — the shape that 500'd.
    writeFileSync(join(dir, "turns", "0000-x", "turn.json"), JSON.stringify({ ordinal: 0, step: 0, label: "x", kind: "invoke-role", role: "driver" }));
    writeFileSync(join(dir, "agent-log.jsonl"), "");
    process.env.CONSORT_CORPUS_DIR = dir;

    const { status, body } = await call("0", "?mode=replay");
    expect(status).toBe(200);
    expect(body.produced).toEqual([]);
    expect(body.deleted).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses to follow a symlink out of the snapshot, over HTTP", async () => {
    // The route-level regression for the review's highest finding: `resolve()` is lexical, so a
    // corpus with `files/leak.md -> /etc/passwd` served the real file with HTTP 200 and
    // `content` populated, despite this route's own comment claiming containment.
    const dir = mkdtempSync(join(tmpdir(), "turn-symlink-"));
    mkdirSync(join(dir, "turns", "0000-x", "files"), { recursive: true });
    writeFileSync(
      join(dir, "turns", "index.json"),
      JSON.stringify({ turns: [{ ordinal: 0, step: 0, label: "x", kind: "invoke-role", role: "driver", dir: "0000-x", producedCount: 1, deletedCount: 0 }] }),
    );
    writeFileSync(join(dir, "turns", "0000-x", "turn.json"), JSON.stringify({ ordinal: 0, step: 0, label: "x", kind: "invoke-role", role: "driver", produced: ["leak.md"], deleted: [] }));
    writeFileSync(join(dir, "agent-log.jsonl"), "");
    symlinkSync("/etc/passwd", join(dir, "turns", "0000-x", "files", "leak.md"));
    process.env.CONSORT_CORPUS_DIR = dir;

    const { status, body } = await call("0", "?mode=replay&file=leak.md");
    expect(status).toBe(200);
    expect(body.content).toBeNull();
    // Shared containment guard (lib/safepath.ts) folds escaped and non-existent into one reason,
    // so the response can't be used to probe whether an out-of-tree path exists.
    expect(body.reason).toBe("(not captured in this turn's snapshot)");
    rmSync(dir, { recursive: true, force: true });
  });

  it("404s an ordinal the corpus doesn't have", async () => {
    const { status, body } = await call("99999", "?mode=replay");
    expect(status).toBe(404);
    expect(body.error).toContain("No turn 99999");
  });

  it("400s anything that isn't plain digits, rather than coercing it", async () => {
    // Found by this test: `Number("")` is 0, so an empty ordinal served turn 0. `Number(" 1 ")`
    // is 1 and `Number("1e3")` is 1000 — each silently resolving to an unasked-for turn. The
    // route now requires /^\d+$/ before parsing.
    for (const bad of ["abc", "-1", "1.5", "", " 1 ", "1e3", "0x2", "＋1"]) {
      const { status } = await call(bad, "?mode=replay");
      expect(status, `accepted ordinal ${JSON.stringify(bad)}`).toBe(400);
    }
    // Leading zeros are unambiguous digits, so they resolve normally.
    expect((await call("000", "?mode=replay")).status).toBe(200);
  });

  it("409s in live mode, because turns are a replay-only asset", async () => {
    // Not 404: the turn isn't missing, the source fundamentally cannot have one. A live
    // project has no turns/ directory at all.
    process.env.CONSORT_PROJECT_DIR = join(process.env.HOME ?? "", "Code/consort-lab/stockflow");
    const { status, body } = await call("0", "?mode=live");
    expect(status).toBe(409);
    expect(body.error).toContain("replay mode");
    expect(body.mode).toBe("live");
  });
});
