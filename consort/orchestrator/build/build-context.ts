// build-context: the pre-extracted design CONTEXT PACK a BUILD turn (navigator/driver:
// RED / GREEN / REVIEW / REFACTOR / assess) is handed inline, so a fresh-session heavy role
// does NOT reload architecture.md + nfrs.md + design-guide.md IN FULL, nor find/grep/ls to
// relocate the module layout + test dirs every turn (the recorded worst GREEN spent ~37 of 93
// tool round-trips just relocating context already on disk). All of it is a DETERMINISTIC
// projection of the design artifacts + conventions.json, never authored, so it cannot drift.
//
// This lives in the orchestrator family as the ONE source of truth: the real drive
// (consort/orchestrator/drive/orchestrator-effects.ts, roleTaskBody) imports it, AND the lean per-role build
// chains (optimize/build-role-chains.ts) inject the SAME pack, so an isolated build turn is
// pre-conditioned exactly as the dispatched turn is (no hand-written approximation).

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import { dirname, join } from "node:path";
import { readConventions } from "../../architecture/architecture-conventions.js";
import { consortEnv } from "../../config/consort-env.js";
import { storyAcIds, readAcLayer, architectureJson, designGuideJson } from "../../config/consort-paths.js";
import { projectLanguage } from "../../config/consort-config-file.js";

/** The .consort artifact root for a project (identity: the artifact dir IS the root). */
function artifactRoot(consortDir: string): string {
  return consortDir;
}

/**
 * A compact, pre-extracted design rubric the orchestrator computes ONCE from the
 * design artifacts and passes inline to a BUILD turn (RED / GREEN / REVIEW /
 * REFACTOR), so the Navigator + Driver do not reload `architecture.md` +
 * `nfrs.md` + `design-guide.md` IN FULL every turn (the same 3 files, re-read
 * on each RED/GREEN/REVIEW/REFACTOR across a story). Same data, pre-extracted:
 *   - the `layer`(s) the code must respect: the single AC's layer in ac-loop, or
 *     the UNION across the story's ACs at story scope (ac === ""),
 *   - the NFRs that apply to this story or feature-wide (id + brief), from
 *     architecture.json (the canonical NFR home), and
 *   - for UI (E2E) work, the design-token groups to check, from design-guide.json.
 * Best-effort: any unreadable / absent source is simply omitted (the prompt
 * still names the full files for when more detail than the rubric is needed).
 * Returns "" when nothing could be extracted (the prompt then degrades to naming
 * the full files, the prior behavior). This is the per-role context-compaction
 * lever: inject the slice, do not make each turn re-read the whole design tree.
 */
function contextRubric(consortDir: string, featureId: string, story: string, ac: string): string {
  const parts: string[] = [];

  // Layer(s): the single AC in ac-loop; the union across the story's ACs at
  // story scope (so a story-level RED/GREEN/REVIEW/REFACTOR sees every boundary
  // its tests/code span, not just one).
  const layers = new Set<string>();
  const acIds = ac ? [ac] : storyAcIds(consortDir, featureId, story);
  for (const id of acIds) {
    const l = readAcLayer(consortDir, featureId, id);
    if (l) layers.add(l);
  }
  if (layers.size) parts.push(`layer${layers.size > 1 ? "s" : ""}=${[...layers].join(", ")}`);

  // PRODUCT NFRs scoped to this story or applied feature-wide (applies_to === featureId).
  // A tier:"platform" NFR is defended ONCE by its gate/feature-level fitness, not per
  // story, so it is NOT threaded into the per-story rubric — this is what stops the
  // "every cross-cutting NFR reasoned about in every story" flightiness. Untiered NFRs
  // (tier absent) are product by default and thread as before.
  try {
    const arch = JSON.parse(fs.readFileSync(architectureJson(consortDir, featureId), "utf8")) as {
      nfrs?: Array<{ id?: string; brief?: string; applies_to?: string; tier?: string }>;
    };
    const nfrs = (arch.nfrs ?? []).filter(
      (n) => n && typeof n.id === "string" && n.tier !== "platform" && (n.applies_to === story || n.applies_to === featureId),
    );
    if (nfrs.length) {
      parts.push(`required NFRs, ${nfrs.map((n) => `${n.id}${n.brief ? ` (${n.brief})` : ""}`).join("; ")}`);
    }
  } catch {
    /* no architecture.json -> omit; prompt still names nfrs.md */
  }

  // Design-token groups to check, only when UI (E2E) work is in scope, the
  // non-UI majority need NO design-guide read at all.
  if (layers.has("E2E")) {
    try {
      const dg = JSON.parse(fs.readFileSync(designGuideJson(consortDir), "utf8")) as {
        tokens?: Record<string, unknown>;
      };
      const groups = Object.keys(dg.tokens ?? (dg as Record<string, unknown>));
      if (groups.length) parts.push(`design-token groups, ${groups.join(", ")}`);
    } catch {
      /* omit */
    }
  }

  return parts.length ? ` RUBRIC (pre-extracted; judge against THIS) :: ${parts.join(" | ")}.` : "";
}

/** The shared "prefer the pre-extracted rubric; open the full files only if you
 *  need more detail" note appended after a non-empty `contextRubric`. Uses the
 *  hyphenated `design-guide.md` filename only (never the phrase "design guide"),
 *  so a RED/GREEN turn's note does not read as the UI-track design-guide input
 *  flag. Returns "" when the rubric was empty (nothing pre-extracted to prefer). */
function rubricSourcesNote(rubric: string, featureId: string, root: string): string {
  if (!rubric) return "";
  return (
    ` The rubric above is pre-extracted from ${root}/features/${featureId}/architecture.md, ${root}/nfrs.md,` +
    ` and ${root}/design/design-guide.md, open those full files ONLY if you need more detail than it carries` +
    ` (do not re-read them by default).`
  );
}

/**
 * The build turn's CONTEXT PACK: rubric (layers + NFRs + UI tokens) PLUS the
 * established module layout and where the story's tests live. A heavy role
 * (Driver / Navigator) starts EVERY turn on a FRESH session (no warm context),
 * so anything it is not TOLD it must rediscover – and the recorded worst GREEN
 * turn spent 93 tool round-trips, ~37 of them just `find`/`grep`/`ls`/`Read`
 * relocating context already on disk. Injecting the layout + test locations
 * turns that discovery into zero round-trips. All of it is a deterministic
 * projection of the artifacts (conventions.json + the scaffold's fixed test
 * dirs), never authored, so it cannot drift. Best-effort: an absent piece is
 * simply omitted. `skipTestLoop` drops the test-location + iterate line for turns
 * that do not run the build test loop (RED has no code yet; REVIEW only judges).
 */
/** DRIVER-GREEN context lever C1 (`ctx-db`): the DB's current + head revisions, probed ONCE at
 *  context-build time so the Driver does not re-run `alembic current` every cycle (run-17: ~7
 *  alembic probes/turn, incl. 5 identical in a row). The reader is INJECTABLE so tests are hermetic;
 *  the default shells `alembic current`/`heads` in the project dir (best-effort, gated OFF by
 *  default). Returns "" when the probe yields nothing. */
export type DbStateReader = (projectDir: string) => { current?: string; heads?: string } | undefined;
const defaultDbStateReader: DbStateReader = (projectDir) => {
  const one = (args: string): string | undefined => {
    try {
      return execSync(`uv run --env-file .env alembic ${args}`, { cwd: projectDir, stdio: ["ignore", "pipe", "ignore"], timeout: 60_000 })
        .toString()
        .trim() || undefined;
    } catch {
      return undefined;
    }
  };
  const current = one("current");
  const heads = one("heads");
  return current || heads ? { current, heads } : undefined;
};

/** DRIVER-GREEN context lever C2 (`ctx-test`): the body of the story's failing RED test, injected so
 *  the Driver reads the failing behavior from context instead of Read/cat-discovering it (run-17: ~40
 *  Read + cat/head re-reads/turn). Reader is INJECTABLE; the default derives the pytest-bdd step-def
 *  path from the story slug and reads it (tail-bounded). Returns "" when no test file resolves. */
export type FailingTestReader = (projectDir: string, story: string) => string | undefined;
const defaultFailingTestReader: FailingTestReader = (projectDir, story) => {
  // The pytest-bdd step-def path is python-only; a nodejs project's RED test lives elsewhere and the
  // driver discovers it itself, so skip this pre-injection lever for node (returning undefined is
  // graceful – it just means no pre-read of the failing test body).
  if (projectLanguage(projectDir) === "nodejs") return undefined;
  // Story slug "S2-drop-combined-code" -> tests/step_defs/test_S2_drop_combined_code.py.
  const file = join(projectDir, "tests", "step_defs", `test_${story.replace(/-/g, "_")}.py`);
  try {
    const body = fs.readFileSync(file, "utf8");
    return body.length > 4000 ? body.slice(0, 4000) + "\n… (truncated; read the full file if needed)" : body;
  } catch {
    return undefined;
  }
};

interface ContextPackOpts {
  skipTestLoop?: boolean;
  /** Enable the ctx-db section (C1). Precedence: this opt > `<consortDir>/ctx-levers.json` marker >
   *  env `LAKEBASE_CONSORT_CTX_DBSTATE === "1"`. */
  dbState?: boolean;
  /** Enable the ctx-test section (C2). Same precedence as dbState (failingTest marker / env). */
  failingTest?: boolean;
  /** Enable the scope-note section: an explicit layer-scoping directive that tells the driver to make
   *  ONLY the failing test green at its own layer and NOT investigate/build other layers' surfaces
   *  (e.g. the client/SPA a later refactor owns). Data-justified: the fast (-46%) runs touched the
   *  client surface ~4x while the slow ones rabbit-holed it ~13x – this makes that scoping deterministic.
   *  Same precedence as dbState (scopeNote marker / env LAKEBASE_CONSORT_CTX_SCOPENOTE). */
  scopeNote?: boolean;
  /** Enable the migration-convention section: where alembic migrations live + the command to create one
   *  + where models are. Eliminates the opening DISCOVERY a drop/schema turn otherwise does (the driver
   *  guesses the migrations path and greps scripts/lk to find `lakebase-new-migration` before it can even
   *  start – measured on opus-ctx-test-emedium). Same precedence (migration marker / env CTX_MIGRATION). */
  migration?: boolean;
  /** Injected for tests; defaults shell/read from disk. */
  dbStateReader?: DbStateReader;
  failingTestReader?: FailingTestReader;
}

/** Read the per-project ctx-lever marker (`<consortDir>/ctx-levers.json`) the driver-GREEN sweep
 *  writes per candidate. A per-WORKSPACE file (not env) so parallel sweep candidates never race on a
 *  shared process env. Absent/malformed => no toggles. */
function readCtxLeverMarker(consortDir: string): { dbState?: boolean; failingTest?: boolean; scopeNote?: boolean; migration?: boolean } {
  try {
    return JSON.parse(fs.readFileSync(join(consortDir, "ctx-levers.json"), "utf8"));
  } catch {
    return {};
  }
}

/** The ctx-test block: the failing RED test body, so the Driver does not Read/cat-discover it. Returns
 *  "" when no failing test body is found. Shared by buildContextPack + the APPEND-lever path so the two
 *  never drift. */
function failingTestBlock(consortDir: string, story: string, reader: FailingTestReader = defaultFailingTestReader): string {
  const body = reader(dirname(consortDir), story);
  return body ? ` FAILING TEST (make THIS pass; do NOT search for it) ::\n\`\`\`python\n${body}\n\`\`\`` : "";
}

/** The scope-note block: an explicit layer-scoping directive (make ONLY the failing test green at its
 *  own layer; do not chase other layers/the client SPA). Shared by buildContextPack + the append lever. */
function scopeNoteBlock(): string {
  return (
    ` SCOPE :: Make ONLY the single failing test green with the SIMPLEST honest code at ITS OWN layer.` +
    ` Iterate on that one test (\`uv run --env-file .env pytest <its path> -x -q\`). Do NOT investigate,` +
    ` build, or run OTHER layers' surfaces this turn (e.g. if the failing test is backend, do not touch,` +
    ` grep, or run the client/SPA – StockView*, vite, npx vitest; a later refactor turn owns that). The` +
    ` post-turn honest-GREEN verify is authoritative; stop once the single test passes.`
  );
}

/** APPEND-lever context: build ONLY the named context blocks (to APPEND after an already-assembled
 *  prompt, e.g. a corpus turn's recorded prompt.txt in a replay experiment) – not the full pack. The
 *  faithful "leverage what was there + append" path: the recorded prompt already carries RUBRIC/LAYOUT/
 *  TESTS; a candidate's context lever adds these blocks on top. Blocks accrue in the requested order. */
export function contextAppendBlocks(
  consortDir: string,
  story: string,
  blocks: ReadonlyArray<"failing-test" | "scope-note" | "db-state" | "migration">,
): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b === "failing-test") {
      const block = failingTestBlock(consortDir, story);
      if (block) out.push(block);
    } else if (b === "scope-note") {
      out.push(scopeNoteBlock());
    }
    // db-state / migration append blocks are wired via buildContextPack's markers; not needed for the
    // driver-green ctx-test append lever, so left to the full-pack path for now.
  }
  return out.join("");
}

function buildContextPack(
  consortDir: string,
  featureId: string,
  story: string,
  ac: string,
  opts: ContextPackOpts = {},
): string {
  const root = artifactRoot(consortDir);
  const rubric = contextRubric(consortDir, featureId, story, ac);
  const parts: string[] = [];
  if (rubric) parts.push(rubric + rubricSourcesNote(rubric, featureId, root));

  // Module layout: the established role -> path map, so the Driver PLACES code
  // (and the Navigator/Reviewer JUDGES placement) without probing the tree.
  const conventions = readConventions(consortDir);
  if (conventions?.layers?.length) {
    const layout = conventions.layers
      .map((l) => `${l.role}=${l.module}${l.renders_via ? ` (${l.renders_via})` : ""}`)
      .join(" | ");
    parts.push(` LAYOUT (place/judge code at THESE paths, do not scan for them) :: ${layout}.`);
  }

  // Language-aware RUN/REACHABILITY hint: how THIS app boots + how to confirm it is reachable, so a
  // turn that must check the app came up (especially a Navigator ASSESS of an "app not reachable"
  // verify failure) uses the project's OWN run command instead of improvising a Python check
  // (`python -c "import app.main"`), which FALSE-fails on a node/java project – there is no app/,
  // source is src/, and the app boots a different way. Reachability is always an HTTP response on the
  // health path (the deploy gate's base_url+health_path probe), never a language-specific import.
  {
    const language = projectLanguage(dirname(consortDir));
    const runHint =
      language === "nodejs"
        ? ` RUN/REACHABILITY :: node project – source under src/ (there is NO app/). To confirm the app` +
          ` boots or is reachable, run the project's OWN start (the package.json start/dev script, e.g.` +
          ` \`node src/index.js\`) and GET the health path over HTTP – do NOT assume Python or run` +
          ` \`python -c "import app.main"\` (it will false-fail here).`
        : language === "java" || language === "kotlin"
          ? ` RUN/REACHABILITY :: ${language} project. To confirm the app boots or is reachable, run` +
            ` \`./mvnw spring-boot:run\` and GET the health path over HTTP – do NOT assume Python` +
            ` (\`python -c "import app.main"\` false-fails here).`
          : ` RUN/REACHABILITY :: python project – source under app/. To confirm the app boots or is` +
            ` reachable, run \`uv run uvicorn app.main:app\` and GET the health path over HTTP.` +
            ` Reachability is an HTTP response, never just an import succeeding.`;
    parts.push(runHint);
  }

  // Test locations: the scaffold fixes these dirs, so a build turn never needs
  // to `find`/`ls` for the story's tests. Behavior + fitness live in known dirs;
  // e2e is owned by the deploy gate, never re-run per cycle here.
  if (!opts.skipTestLoop) {
    parts.push(
      ` TESTS :: this story's tests are under tests/step_defs/ (behavior, one file per story) and` +
        ` tests/architecture/ (fitness: layering, persistence invariants, migration reversibility). Read those` +
        ` named paths directly; do NOT find/grep/ls to locate them. Iterate against the single failing test while` +
        ` fixing; the honest-GREEN verify is the authoritative full run.`,
    );
  }

  const marker = readCtxLeverMarker(consortDir);
  // C1 (ctx-db): the DB revision state, probed once, so the Driver does not re-run `alembic current`.
  const dbOn = opts.dbState ?? marker.dbState ?? consortEnv("CTX_DBSTATE") === "1";
  if (dbOn) {
    const st = (opts.dbStateReader ?? defaultDbStateReader)(dirname(consortDir));
    if (st && (st.current || st.heads)) {
      parts.push(
        ` DB STATE (already probed, do NOT re-run alembic current/heads) ::` +
          `${st.current ? ` current=${st.current.replace(/\s+/g, " ")}` : ""}` +
          `${st.heads ? ` head=${st.heads.replace(/\s+/g, " ")}` : ""}.` +
          ` The branch is migrated to head; iterate with \`uv run --env-file .env pytest <path>\` (no re-migrate).`,
      );
    }
  }

  // C2 (ctx-test): the failing RED test body, so the Driver does not Read/cat-discover it.
  const testOn = opts.failingTest ?? marker.failingTest ?? consortEnv("CTX_FAILINGTEST") === "1";
  if (testOn) {
    const block = failingTestBlock(consortDir, story, opts.failingTestReader ?? defaultFailingTestReader);
    if (block) parts.push(block);
  }

  // scope-note: an explicit layer-scoping directive. The fast (-46%) driver runs scoped to the SINGLE
  // failing test with a fail-fast run and did NOT chase other layers; the slow ones rabbit-holed the
  // client/SPA surface (~13 touches vs ~4). This makes that scoping deterministic instead of a per-run
  // coin flip. Layer-agnostic: it scopes to the failing test's OWN layer (whatever that is).
  const scopeOn = opts.scopeNote ?? marker.scopeNote ?? consortEnv("CTX_SCOPENOTE") === "1";
  if (scopeOn) parts.push(scopeNoteBlock());

  // ctx-migration: the migration mechanism, so a schema/drop turn does not DISCOVER it. Measured on
  // opus-ctx-test-emedium: the driver guessed the migrations path (app/migrations vs alembic/versions)
  // and grepped scripts/lk to find `lakebase-new-migration` before it could start – pure opening waste.
  const migrationOn = opts.migration ?? marker.migration ?? consortEnv("CTX_MIGRATION") === "1";
  if (migrationOn) {
    // Language-aware: the create command (lakebase-new-migration) is uniform, but the tool, the
    // migrations dir, the models location, and the apply command differ per stack. A python hint
    // (alembic/app/models.py) is actively misleading on a nodejs (knex) or java/kotlin (flyway) project.
    const language = projectLanguage(dirname(consortDir));
    const migrationGuide =
      language === "nodejs"
        ? ` MIGRATION :: knex migrations live in migrations/. Create one with \`./scripts/lk` +
          ` lakebase-new-migration --name "<short desc>"\` (do NOT hand-author it or grep scripts/lk).` +
          ` Source/models live under src/; apply with \`npm run migrate\`.`
        : language === "java" || language === "kotlin"
          ? ` MIGRATION :: flyway migrations live in src/main/resources/db/migration/. Create one with` +
            ` \`./scripts/lk lakebase-new-migration --name "<short desc>"\` (do NOT hand-author it or grep` +
            ` scripts/lk). Apply with \`./mvnw -q flyway:migrate\`.`
          : ` MIGRATION :: alembic migrations live in alembic/versions/. Create one with` +
            ` \`./scripts/lk lakebase-new-migration --name "<short desc>"\` (do NOT hand-author the revision` +
            ` file or grep scripts/lk to find the command). ORM models are in app/models.py; apply with` +
            ` \`uv run --env-file .env alembic upgrade head\`.`;
    parts.push(migrationGuide);
  }

  return parts.join("");
}

export { contextRubric, rubricSourcesNote, buildContextPack };
