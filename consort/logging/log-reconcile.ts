///7422: make design-phase observability STRUCTURAL, not dependent on
// each role model remembering to emit `consort-log` events.
//
// Per-role logging is prose-instructed, so a role can do the substantive work
// (write story stubs + ACs) while emitting nothing, exactly what happened when
// the spec-author was tiered to sonnet (5 ACs on disk, zero log events).
// reconcileArtifactLog scans the feature's artifacts on disk and emits an
// `artifact.written` event for every one the log does not already cover. The
// orchestrator (and the smoke) call it after each phase so the log always
// reflects what was produced, regardless of which model a role ran on.
// Deterministic + idempotent.

import { existsSync, readdirSync, statSync } from "fs";
import { join, relative, dirname } from "path";
import {
  emitAgentLogEvent,
  readAgentLog,
  type AgentLogEvent,
  type AgentRole,
} from "./agent-log.js";
import { resolveConsortDir, featureResolved, storyTestListJson, designGuideJson, architectureConventionsJson } from "../../consort/config/consort-paths.js";
import { establishConventionsIfAbsent } from "../architecture/architecture-conventions.js";
import { establishCanonFromDisk } from "../architecture/architecture-canon.js";
import { normalizeStoryJson } from "../intake/spec-sync.js";

export interface ReconcileOpts {
  /** Path to the artifact root. Default: resolved (.sftdd, or legacy .tdd). */
  consortDir?: string;
  featureId: string;
  /** Test seam for a deterministic clock. */
  now?: () => Date;
}

interface ArtifactSpec {
  /** Path relative to consortDir (the form the reconciled event records). */
  path: string;
  role: AgentRole;
  message: string;
}

/** The design artifacts a feature produces, attributed to their owning role. */
function discoverArtifacts(consortDir: string, featureId: string): ArtifactSpec[] {
  const out: ArtifactSpec[] = [];
  const fdir = featureResolved(consortDir, featureId);
  if (!existsSync(fdir)) return out;
  const add = (abs: string, role: AgentRole, message: string) => {
    if (existsSync(abs)) out.push({ path: relative(consortDir, abs), role, message });
  };

  // Feature-level artifacts.
  add(join(fdir, "feature-spec.json"), "spec-author", "feature-spec.json");
  add(join(fdir, "architecture.json"), "architect-reviewer", "architecture.json");
  // The DBA's schema design. Was omitted here, so a dba turn logged a phase.start + turn.usage
  // but NO artifact.written for db-design.json – the one design artifact with no log trace.
  add(join(fdir, "db-design.json"), "dba", "db-design.json");
  add(join(fdir, "test-list.json"), "test-strategist", "test-list.json");

  // Project-level architecture conventions (the canonical role -> module layout).
  // Like the design-guide, it lives outside the feature dir and is inherited
  // across features, so reconcile it at its project path or a ux-style turn that
  // produced/inherited it would log nothing for it.
  add(architectureConventionsJson(consortDir), "architect-reviewer", "architecture conventions (project)");

  // UX design system – PROJECT-level, under .tdd/design/ (NOT the feature dir).
  // The ux-designer writes design-guide.{md,json} + ia.md there (designGuideJson
  // resolves tdd/design/design-guide.json); reconciling them at the feature dir
  // found nothing, so a ux-designer turn logged a phase.start but no
  // artifact.written for what it produced.
  const designDir = dirname(designGuideJson(consortDir));
  add(join(designDir, "design-guide.json"), "ux-designer", "design-guide.json");
  add(join(designDir, "design-guide.md"), "ux-designer", "design-guide.md");
  add(join(designDir, "ia.md"), "ux-designer", "ia.md");

  // Per-story artifacts, in story order.
  const sdir = join(fdir, "stories");
  if (existsSync(sdir)) {
    for (const s of readdirSync(sdir).sort()) {
      const storyDir = join(sdir, s);
      if (!statSync(storyDir).isDirectory()) continue;
      add(join(storyDir, "story.json"), "spec-author", `story stub ${s}`);
      const acsDir = join(storyDir, "acs");
      if (existsSync(acsDir)) {
        for (const ac of readdirSync(acsDir).sort()) {
          if (ac.endsWith(".json")) {
            add(join(acsDir, ac), "spec-author", `AC ${ac.replace(/\.json$/, "")} for story ${s}`);
          }
        }
      }
      add(storyTestListJson(consortDir, featureId, s), "test-strategist", `per-story test list for ${s}`);
    }
  }
  return out;
}

/** True when some existing event already records this artifact's path. Lenient
 *  on the path form a role used (bare name / project-relative / absolute) by
 *  matching either direction's suffix, so a role's own emit is never duplicated. */
function alreadyLogged(events: AgentLogEvent[], relPath: string): boolean {
  return events.some((e) => {
    if (e.event !== "artifact.written") return false;
    const p = e.metadata?.path;
    if (typeof p !== "string") return false;
    return p === relPath || p.endsWith(`/${relPath}`) || (p.includes("/") && relPath.endsWith(p));
  });
}

/**
 * Emit an `artifact.written` event (tagged `reconciled: true`) for every
 * on-disk design artifact the log does not already cover. Returns the events
 * emitted (empty when the log is already complete). Idempotent.
 */
export function reconcileArtifactLog(opts: ReconcileOpts): AgentLogEvent[] {
  const consortDir = opts.consortDir ?? resolveConsortDir();
  const existing = readAgentLog({ consortDir, featureId: opts.featureId });
  const emitted: AgentLogEvent[] = [];

  // Deterministically normalize the spec-author's story.json stubs into
  // story.schema conformance (map a stray `feature` -> feature_id, strip non-spec
  // keys like `status`). Runs here, at the post-turn reconcile seam, so the
  // feature-complete conformance gate never hard-blocks on the LLM's field drift.
  normalizeStoryJson(consortDir, opts.featureId);

  // Deterministically establish the project architecture conventions from this
  // feature's architecture.json (a no-op once they exist, or when the feature is
  // not service-backed). When it fires, code-EMIT the architect's layout decision
  // as a `reasoning` event – the architect ran but its substantive output (the
  // canonical role -> module layout) otherwise left no trace, so the design log
  // showed it as silent. This makes the decision observable without depending on
  // the role model remembering to emit (the same structural-observability intent
  // as the artifact reconcile below). Idempotent: establish returns established
  // only on the first reconcile that sees architecture.json.
  const est = establishConventionsIfAbsent(consortDir, opts.featureId, opts.now);
  if (est.established && est.conventions) {
    const layout = est.conventions.layers.map((l) => `${l.role}=${l.module}`).join(", ");
    const ev = emitAgentLogEvent(
      {
        role: "architect-reviewer",
        level: "info",
        event: "reasoning",
        feature_id: opts.featureId,
        slots: { note: `established project architecture conventions: ${layout}` },
      },
      { consortDir, now: opts.now },
    );
    existing.push(ev);
    emitted.push(ev);
  }

  // Deterministically establish the project architecture CANON (the cross-cutting
  // sibling of conventions): the first service-backed feature's NFR posture + AC
  // layers + persistence-invariant patterns become the standing rules a later
  // feature's per-story architect step projects from. Idempotent + code-emitted,
  // so the establish decision is observable in the log without the role emitting.
  const canonEst = establishCanonFromDisk(consortDir, opts.featureId, opts.now);
  if (canonEst.established && canonEst.canon) {
    const c = canonEst.canon;
    const summary =
      `layers=[${c.ac_layers.join(", ")}] nfrs=[${c.nfr_posture.map((n) => n.category).join(", ")}] ` +
      `invariants=[${c.invariant_patterns.map((p) => p.type).join(", ")}]`;
    const ev = emitAgentLogEvent(
      {
        role: "architect-reviewer",
        level: "info",
        event: "reasoning",
        feature_id: opts.featureId,
        slots: { note: `established project architecture canon: ${summary}` },
      },
      { consortDir, now: opts.now },
    );
    existing.push(ev);
    emitted.push(ev);
  }

  for (const art of discoverArtifacts(consortDir, opts.featureId)) {
    if (alreadyLogged(existing, art.path)) continue;
    const ev = emitAgentLogEvent(
      {
        role: art.role,
        level: "info",
        event: "artifact.written",
        feature_id: opts.featureId,
        slots: { artifact: art.message, summary: "present on disk (reconciled)", path: art.path, reconciled: true },
      },
      { consortDir, now: opts.now },
    );
    existing.push(ev); // so a duplicate within this same pass is also deduped
    emitted.push(ev);
  }
  return emitted;
}
