#!/usr/bin/env node

// consort/config/consort-paths.ts
import * as fs from "fs";
import { join } from "path";
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];
function resolveConsortDir(projectDir = process.cwd()) {
  const next = join(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    const legacy = join(projectDir, legacyName);
    if (fs.existsSync(legacy)) return legacy;
  }
  return next;
}
var featuresDir = (tdd) => join(tdd, "features");
var featureDir = (tdd, featureId) => join(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var architectureJson = (tdd, f) => join(featureResolved(tdd, f), "architecture.json");
var storiesDir = (tdd, f) => join(featureResolved(tdd, f), "stories");
var storyDir = (tdd, f, s) => join(storiesDir(tdd, f), s);
function findStoryDir(tdd, f, s) {
  const root = storiesDir(tdd, f);
  if (!fs.existsSync(root)) return void 0;
  const exact = join(root, s);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === s || d.startsWith(`${s}-`));
  return matches.length === 1 ? join(root, matches[0]) : void 0;
}
var storyResolved = (tdd, f, s) => findStoryDir(tdd, f, s) ?? storyDir(tdd, f, s);
var storyJson = (tdd, f, s) => join(storyResolved(tdd, f, s), "story.json");
var acsDir = (tdd, f, s) => join(storyResolved(tdd, f, s), "acs");
var acJson = (tdd, f, s, ac) => join(acsDir(tdd, f, s), `${ac}.json`);
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = join(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? join(root, matches[0]) : void 0;
}
function storyAcIds(tdd, f, s) {
  const ids = /* @__PURE__ */ new Set();
  const sj = storyJson(tdd, f, s);
  if (fs.existsSync(sj)) {
    try {
      const data = JSON.parse(fs.readFileSync(sj, "utf8"));
      if (Array.isArray(data.acs)) {
        for (const a of data.acs) {
          const id = typeof a === "string" ? a : a?.id;
          if (typeof id === "string" && id.length > 0) ids.add(id);
        }
      }
    } catch {
    }
  }
  const dir = acsDir(tdd, f, s);
  if (fs.existsSync(dir)) {
    try {
      for (const file of fs.readdirSync(dir)) {
        const m = /^(.+)\.json$/.exec(file);
        if (!m) continue;
        const base = m[1];
        try {
          const obj = JSON.parse(fs.readFileSync(join(dir, file), "utf8"));
          if (obj && typeof obj.id === "string" && obj.id === base) ids.add(base);
        } catch {
        }
      }
    } catch {
    }
  }
  return [...ids];
}

// consort/orchestrator/steps/cross-story-context.ts
import * as fs2 from "fs";
import { basename } from "path";
var str = (v) => typeof v === "string" && v.length > 0 ? v : void 0;
function buildCrossStoryContext(consortDir, feature, currentStory) {
  const ctx = { current_story: currentStory, sibling_stories: [], open_decisions: [], required_persistence_fields: [], required_request_fields: [] };
  const currentDir = (() => {
    try {
      return basename(storyResolved(consortDir, feature, currentStory));
    } catch {
      return currentStory;
    }
  })();
  let dirs = [];
  try {
    dirs = fs2.readdirSync(storiesDir(consortDir, feature));
  } catch {
    dirs = [];
  }
  for (const dir of dirs.sort()) {
    if (dir === currentDir) continue;
    const acs = [];
    for (const acId of storyAcIds(consortDir, feature, dir)) {
      try {
        const ac = JSON.parse(fs2.readFileSync(acJson(consortDir, feature, dir, acId), "utf8"));
        acs.push({
          ac_id: acId,
          status: str(ac.status),
          layer: str(ac.layer),
          given: str(ac.given),
          when: str(ac.when),
          then: str(ac.then),
          architectural_notes: str(ac.architectural_notes)
        });
      } catch {
      }
    }
    if (acs.length) ctx.sibling_stories.push({ story: dir, acs });
  }
  try {
    const arch = JSON.parse(fs2.readFileSync(architectureJson(consortDir, feature), "utf8"));
    if (Array.isArray(arch.open_decisions)) {
      ctx.open_decisions = arch.open_decisions.filter((d) => !!d && typeof d.id === "string").map((d) => ({
        id: String(d.id),
        question: str(d.question),
        decision_status: str(d.decision_status),
        resolved_by_story: str(d.resolved_by_story),
        resolution: str(d.resolution)
      }));
    }
    if (Array.isArray(arch.persistence_invariants)) {
      ctx.required_persistence_fields = arch.persistence_invariants.filter(
        (p) => !!p && typeof p.id === "string" && p.type === "not_null"
      ).map((p) => ({ invariant_id: String(p.id), table: str(p.table), brief: str(p.brief) }));
    }
    if (Array.isArray(arch.api_contracts)) {
      ctx.required_request_fields = arch.api_contracts.filter((c) => !!c && typeof c.id === "string" && Array.isArray(c.request_fields)).flatMap(
        (c) => c.request_fields.filter((f) => !!f && f.required === true && typeof f.name === "string").map((f) => ({
          contract_id: String(c.id),
          field: String(f.name),
          since_story: str(f.since_story),
          reconciled_stories: Array.isArray(f.reconciled_stories) ? f.reconciled_stories.filter((x) => typeof x === "string") : void 0
        }))
      );
    }
  } catch {
  }
  return ctx;
}

// bin/consort/cross-story-context.cli.ts
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
function parseArgs(argv) {
  const out = { json: false, projectDir: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature":
        out.feature = argv[++i];
        break;
      case "--story":
        out.story = argv[++i];
        break;
      case "--json":
        out.json = true;
        break;
      case "--project-dir":
        out.projectDir = argv[++i];
        break;
      case "--tdd-dir":
      case "--consort-dir":
        out.consortDir = argv[++i];
        break;
      case "-h":
      case "--help":
        process.stdout.write(
          "consort-cross-story-context \u2013 the feature's OTHER stories' ACs + the architecture's open_decisions.\n\n  consort-cross-story-context --feature <F> --story <S> [--json]\n\nRun it in the architect-reviewer + navigator reflect turns to review a story AGAINST its\nsiblings: flag any AC that contradicts a gated sibling AC, or silently resolves an open decision.\n"
        );
        process.exit(0);
    }
  }
  return out;
}
function renderContext(ctx) {
  const lines = [];
  lines.push(`Cross-story review context for ${ctx.current_story}:`);
  if (!ctx.sibling_stories.length) {
    lines.push("  (no sibling stories with ACs yet \u2013 this is the feature's first designed story)");
  }
  for (const s of ctx.sibling_stories) {
    lines.push(`  ${s.story}:`);
    for (const ac of s.acs) {
      const st = ac.status ? ` [${ac.status}]` : "";
      lines.push(`    - ${ac.ac_id}${st}: GIVEN ${ac.given ?? "?"} / WHEN ${ac.when ?? "?"} / THEN ${ac.then ?? "?"}`);
    }
  }
  if (ctx.open_decisions.length) {
    lines.push("  open architectural decisions (do NOT silently resolve one in a way that breaks a sibling):");
    for (const d of ctx.open_decisions) {
      lines.push(`    - ${d.id} [${d.decision_status ?? "open"}]: ${d.question ?? ""}${d.resolved_by_story ? ` (resolved by ${d.resolved_by_story}: ${d.resolution ?? ""})` : ""}`);
    }
  }
  lines.push(
    "\nCheck THIS story's ACs against the above. If one contradicts a gated sibling AC (same input, opposite\nrequired outcome), or resolves an open decision inconsistently, raise it as a spec-author reflect finding\n(it holds the spec gate) rather than letting it reach the build lane."
  );
  return lines.join("\n");
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.feature || !args.story) {
    process.stderr.write("consort-cross-story-context: --feature and --story are required.\n");
    return 2;
  }
  const consortDir = args.consortDir ?? resolveConsortDir(args.projectDir);
  const ctx = buildCrossStoryContext(consortDir, args.feature, args.story);
  process.stdout.write((args.json ? JSON.stringify(ctx, null, 2) : renderContext(ctx)) + "\n");
  return 0;
}
if (isCliEntry(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((e) => {
    process.stderr.write(`consort-cross-story-context: ${e instanceof Error ? e.message : String(e)}
`);
    process.exit(1);
  });
}
export {
  renderContext
};
