"use client";

import { useEffect, useState } from "react";
import { nodeById, primaryOutputNodeForRole } from "@/lib/topology";
import { colorForRole, font, radius } from "@/lib/theme";
import type { ArtifactContent, StepOutputAsset, StepOutputs } from "@/lib/types";
import { buildFileTree, type FileTreeRow } from "@/lib/filetree";
import { ResizableSplit } from "./ResizableSplit";

// The ONE drill-down surface. Everything the board lets you click — an event-stream row that begins
// a recorded turn, an event row that names a produced artifact, or a lifecycle node on the graph —
// opens THIS panel. Before, three separate panels (TurnPanel / ArtifactPanel / StepOutputsPanel)
// answered three phrasings of the same question ("what did this produce, and what went into it?")
// with three shapes and three open-states; a viewer couldn't tell they were the same idea. This
// collapses them into one component behind a tagged-union target, sharing one shell, one file list,
// and one content view — the "click anything → one panel" the merge was missing.
//
// It stays capability-honest: a turn target shows the transcript+files a recorded corpus has; a
// live artifact target shows one file at HEAD and SAYS it's HEAD (no transcript live); a step
// target shows a lifecycle step's recorded deliverables. The page gates which targets are offered
// (by capability), so this never renders an affordance the source can't satisfy.

// How much of a clicked topology cell to reveal, per the frontier rules: a cell AT the active
// position (live or scrubber) shows only its prompt until it completes; a cell AFTER the active
// position shows the uninvoked state even if it ran in a prior run; a cell before it shows all.
export type DrilldownReveal = "full" | "prompt-only" | "none";

export type DrilldownTarget =
  // `fromStep` tags a target opened from a TOPOLOGY card (the step id), so the page can classify it
  // against the current frontier and set the reveal level. Absent for non-topology opens (an event-
  // ticker turn, an artifact), which are never frontier-gated.
  | { kind: "turn"; ord: number; fromStep?: string }
  // A role bubble with NO recorded turn yet (a plain live run, or a role that hasn't taken a turn
  // in the event tail). Clicking a bubble ALWAYS opens the panel – this target just renders the
  // shell + an honest "nothing recorded yet" body instead of a turn, so the panel is never a dead
  // click even when there's nothing to show.
  | { kind: "role"; role: string; fromStep?: string }
  // Live's shallower drill-down: a produced file, read at the project's current HEAD.
  | { kind: "artifact"; path: string }
  // A lifecycle step's deliverables. Timeline-independent (a recorded artifact is the same at every
  // playhead), which is why the page keeps it open across a scrub. NOTE: the feature it's scoped to
  // is deliberately NOT part of the target — it's passed to the panel LIVE (see `feature` below), so
  // switching the FeatureSwitcher (which does not close a step target) re-scopes the deliverables
  // instead of leaving them frozen at the feature that was current when the node was clicked.
  | { kind: "step"; node: string };

/**
 * `/api/turn/<ord>` with an optional mode and file. Built through URLSearchParams so `mode` is
 * simply omitted when null rather than sent as the string "null". Exported for tests + reuse.
 */
export function turnUrl(ord: number, mode: "live" | "replay" | null, file?: string): string {
  const q = new URLSearchParams();
  if (mode !== null) q.set("mode", mode);
  if (file !== undefined) q.set("file", file);
  return q.size > 0 ? `/api/turn/${ord}?${q}` : `/api/turn/${ord}`;
}

/** `/api/artifact?path=…&mode=…` — mode omitted when null so the server keeps its default. */
export function artifactUrl(path: string, mode: "live" | "replay" | null): string {
  const q = new URLSearchParams({ path });
  if (mode !== null) q.set("mode", mode);
  return `/api/artifact?${q}`;
}

/** `/api/step-outputs` list URL for a node, scoped to a feature, with an optional mode. */
function stepListUrl(node: string, feature: string | null, mode: "live" | "replay" | null): string {
  const q = new URLSearchParams({ node });
  if (feature) q.set("feature", feature);
  if (mode !== null) q.set("mode", mode);
  return `/api/step-outputs?${q}`;
}

/** `/api/step-outputs` content URL for one asset path, with an optional mode. */
function stepContentUrl(path: string, mode: "live" | "replay" | null): string {
  const q = new URLSearchParams({ path });
  if (mode !== null) q.set("mode", mode);
  return `/api/step-outputs?${q}`;
}

// The one entry point. Dispatches to the body for the target kind; each body owns its own fetches
// (a turn, a file, a step-output list are genuinely different requests), but they all render inside
// the same shell with the same file-row and content primitives, so the surface reads as one panel.
export function DrilldownPanel({
  target,
  mode,
  feature,
  reveal = "full",
  onClose,
}: {
  target: DrilldownTarget;
  mode: "live" | "replay" | null;
  // The board's CURRENT feature (the FeatureSwitcher pin, or the playhead's feature). Passed live
  // rather than baked into a step target, so switching the pin re-scopes an open step drill-down.
  // Only step targets read it.
  feature: string | null;
  // Frontier gating for a topology card click (computed live from the current playhead): "full"
  // (before the frontier), "prompt-only" (the active cell, until it completes), or "none" (a cell
  // after the frontier — shown as uninvoked). "full" for non-topology opens.
  reveal?: DrilldownReveal;
  onClose: () => void;
}) {
  switch (target.kind) {
    case "turn":
      return <TurnBody ord={target.ord} mode={mode} reveal={reveal} onClose={onClose} />;
    case "role":
      return <RoleBody role={target.role} feature={feature} mode={mode} reveal={reveal} onClose={onClose} />;
    case "artifact":
      return <ArtifactBody path={target.path} mode={mode} onClose={onClose} />;
    case "step":
      return <StepBody node={target.node} feature={feature} mode={mode} onClose={onClose} />;
  }
}

// A role bubble clicked when there's no recorded turn to open (plain live run / role not in the
// event tail). SAME chrome as a loaded turn: the "#— <role>" title and the three Correspondence /
// Artifacts / Code tabs. There is no per-turn transcript live, so Correspondence carries an honest
// note; but the role's lifecycle-step DELIVERABLES live on disk, so the Artifacts + Code tabs are
// filled from them (the product-owner's intake docs, a spec-author's proposals, ...). The layout +
// the title are exactly a turn's — only the source of the files differs (step-outputs, not a turn).
function RoleBody({
  role,
  feature,
  mode,
  reveal = "full",
  onClose,
}: {
  role: string;
  feature: string | null;
  mode: "live" | "replay" | null;
  reveal?: DrilldownReveal;
  onClose: () => void;
}) {
  // The lifecycle node whose recorded deliverables this role authors (product-owner → intake, ...),
  // or null for a role that produces no durable output (then Artifacts/Code are simply empty).
  const node = primaryOutputNodeForRole(role);
  const [outputs, setOutputs] = useState<StepOutputs | null>(null);
  const [tab, setTab] = useState<Tab>("correspondence");
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<ArtifactContent | null>(null);

  // Fetch the role's produced deliverables so Artifacts/Code are populated. Re-scopes with the
  // pinned feature (the per-feature specs), exactly like StepBody. No node → nothing to fetch.
  useEffect(() => {
    // At/after the frontier the body is gated below; don't fetch this step's prior deliverables.
    if (reveal !== "full") return;
    setSelected(null);
    setFile(null);
    if (!node) {
      setOutputs({ node: "", feature: feature ?? null, assets: [] });
      return;
    }
    let live = true;
    setOutputs(null);
    (async () => {
      try {
        const r = await fetch(stepListUrl(node, feature, mode), { cache: "no-store" });
        const body = await r.json();
        if (!live) return;
        setOutputs(r.ok ? (body as StepOutputs) : { node, feature: feature ?? null, assets: [] });
      } catch {
        if (live) setOutputs({ node, feature: feature ?? null, assets: [] });
      }
    })();
    return () => {
      live = false;
    };
  }, [node, feature, mode, reveal]);

  // Selected deliverable's content — same reader the step drill-down uses.
  useEffect(() => {
    if (selected === null) {
      setFile(null);
      return;
    }
    let live = true;
    setFile(null);
    (async () => {
      try {
        const r = await fetch(stepContentUrl(selected, mode), { cache: "no-store" });
        const body = await r.json();
        if (live) setFile(r.ok ? (body as ArtifactContent) : { path: selected, kind: "artifact", content: null, reason: body.error ?? `HTTP ${r.status}` });
      } catch (e) {
        if (live) setFile({ path: selected, kind: "artifact", content: null, reason: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      live = false;
    };
  }, [selected, node, feature, mode]);

  const assets: StepOutputAsset[] = outputs?.assets ?? [];
  const artifacts = assets.filter((a) => a.kind === "artifact");
  const codeFiles = assets.filter((a) => a.kind === "code");
  const artCount = artifacts.length;
  const codeCount = codeFiles.length;
  const codeRows = buildFileTree(codeFiles.map((a) => a.path));
  const selectFile = (p: string) => setSelected(p === selected ? null : p);
  const viewer = (
    <>
      {selected ? (
        <div style={{ fontFamily: font.mono, fontSize: "0.64rem", color: "var(--text-faint)", marginBottom: 6, paddingBottom: 5, borderBottom: `1px solid var(--border-default)`, wordBreak: "break-all" }}>{selected}</div>
      ) : null}
      <ContentView file={selected === null ? undefined : file} idle="Select a file to view it." loadingName={selected} />
    </>
  );

  // Frontier gating (topology clicks only):
  if (reveal === "none") {
    return <NotYetRunBody accent={colorForRole(role)} title={turnTitle(null, role)} onClose={onClose} />;
  }
  if (reveal === "prompt-only") {
    return (
      <PromptOnlyBody
        accent={colorForRole(role)}
        title={runningTitle(role)}
        role={role}
        prompt="(no prompt recorded for this step yet)"
        note="Running — this step is active; its prompt isn't recorded yet."
        onClose={onClose}
      />
    );
  }

  return (
    <PanelShell accent={colorForRole(role)} title={turnTitle(null, role)} onClose={onClose} bodyScroll={false}>
      <TabRow>
        <TabButton active={tab === "correspondence"} onClick={() => setTab("correspondence")}>
          Correspondence
        </TabButton>
        <TabButton active={tab === "artifacts"} onClick={() => { setTab("artifacts"); setSelected(null); }}>
          Artifacts{artCount > 0 ? ` (${artCount})` : ""}
        </TabButton>
        <TabButton active={tab === "code"} onClick={() => { setTab("code"); setSelected(null); }}>
          Code{codeCount > 0 ? ` (${codeCount})` : ""}
        </TabButton>
      </TabRow>

      {tab === "correspondence" ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 16px", fontSize: "0.78rem", color: "var(--text-faint)", lineHeight: 1.55 }}>
          No transcript recorded for <strong style={{ color: "var(--text-muted)" }}>{role}</strong> yet.
          <div style={{ marginTop: 8 }}>
            Its correspondence (prompt · tools · reasoning) appears here once it takes a turn with
            recording on. What it produced is under Artifacts / Code.
          </div>
        </div>
      ) : tab === "artifacts" ? (
        <SplitPane
          list={
            artCount === 0 ? (
              <Empty>No artifacts.</Empty>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {artifacts.map((a) => (
                  <FileRow key={a.path} badge="ARTIFACT" badgeColor="var(--text-faint)" label={a.name} sub={a.path} selected={a.path === selected} onSelect={() => selectFile(a.path)} />
                ))}
              </div>
            )
          }
          viewer={viewer}
        />
      ) : (
        <SplitPane
          list={codeCount === 0 ? <Empty>No code.</Empty> : <CodeTree rows={codeRows} selected={selected} onSelect={selectFile} />}
          viewer={viewer}
        />
      )}
    </PanelShell>
  );
}

// --- shared shell + primitives ---------------------------------------------------------------

// The panel's INNER chrome (the sliding fixed container is the page's drawer): a header row — a
// role-coloured badge square, then a stacked title + meta line, then an always-present close button
// — over the body, which fills the remaining height. One shell for every kind, so the surface is
// visually one thing. Matches the reference dashboard's `.phead` (badge + `.ttl` + `.meta`) + `.pbody`.
function PanelShell({
  accent,
  title,
  meta,
  onClose,
  children,
  // Single-pane bodies (role / artifact / step) want the body to scroll and pad itself. The turn
  // body manages its own full-width tabs + full-height panes, so it opts out and lays out the body.
  bodyScroll = true,
}: {
  accent: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  bodyScroll?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--surface-panel)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", borderBottom: `1px solid var(--border-default)`, background: "var(--surface-card)", flex: "none" }}>
        <span aria-hidden style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: accent, marginTop: 5, flex: "none" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-strong)", fontFamily: font.sans, wordBreak: "break-word" }}>{title}</div>
          {meta ? <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: font.sans, marginTop: 3, lineHeight: 1.55 }}>{meta}</div> : null}
        </div>
        <button
          onClick={onClose}
          aria-label="Close drill-down panel"
          style={{ flex: "none", background: "none", border: `1px solid var(--border-default)`, borderRadius: radius.chip, color: "var(--text-muted)", cursor: "pointer", fontFamily: font.sans, fontSize: 16, lineHeight: 1, width: 30, height: 30 }}
        >
          ✕
        </button>
      </div>
      {bodyScroll ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 16px" }}>{children}</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>{children}</div>
      )}
    </div>
  );
}

// The meta line's inline separator/token styling, reused across the bodies so every panel's meta
// row reads the same. A leading eyebrow label (TURN 16 / ARTIFACT / STEP OUTPUTS / ROLE) then dot-
// separated tokens.
function MetaChips({ items }: { items: React.ReactNode[] }) {
  const kept = items.filter((x) => x !== null && x !== undefined && x !== false && x !== "");
  return <MetaSlots slots={kept} />;
}

// A dot-separated meta line. Unlike MetaChips it renders EVERY slot it's given (the caller has
// already substituted an em-dash for a blank), so the turn/role header keeps a fixed shape whether
// the turn is loaded, still loading, or has never run.
function MetaSlots({ slots }: { slots: React.ReactNode[] }) {
  return (
    <>
      {slots.map((x, i) => (
        <span key={i}>
          {i > 0 ? <span style={{ color: "var(--border-strong)", margin: "0 6px" }}>·</span> : null}
          {x}
        </span>
      ))}
    </>
  );
}

// The turn/role panel's always-present tab row. `disabled` (a role with no recorded turn) renders
// the three tabs as inert placeholders so the chrome is identical to a loaded turn's.
function TabRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 2, padding: "6px 12px 0", borderBottom: `1px solid var(--border-default)`, flex: "none" }}>{children}</div>;
}

// "#<ordinal> <role>" title, the ordinal muted and zero-padded to two digits (#02) like the
// reference; a role with no turn passes ord=null → "#— <role>".
function turnTitle(ord: number | null, roleText: string): React.ReactNode {
  const ordStr = ord === null ? "—" : String(ord).padStart(2, "0");
  return (
    <>
      <span style={{ color: "var(--text-faint)", fontWeight: 600 }}>#{ordStr}</span> {roleText}
    </>
  );
}

// A RUNNING step's title: an active cell has NO honest ordinal to show — its turn isn't
// recorded yet, and the last recorded turn FOR THE STEP is a PRIOR turn (e.g. showing "#36"
// while the step is actually on its unfinished turn 44). So we drop the misleading ordinal
// and label it "running" instead of a stale "#NN". Used for every prompt-only (active) body.
function runningTitle(roleText: string): React.ReactNode {
  return (
    <>
      <span style={{ color: "var(--text-faint)", fontWeight: 600 }}>running</span> {roleText}
    </>
  );
}

// The turn header's meta fields, in order: mode (or the step kind), the work item (story, then the
// ac if present), the model, and the tool count — each INCLUDED ONLY WHEN PRESENT (like the
// reference). A dispatch/gate turn with only a mode renders just "author-requests"; a fully-recorded
// turn renders all four, e.g. "review · S3-sku-detail-view · sonnet · 11 tools". Pure + exported so
// the exact format is unit-tested rather than only visible behind a live fetch.
export function turnMetaFields(turn: TurnPayload | null): string[] {
  if (!turn) return [];
  const workItem = [turn.story, turn.ac].filter(Boolean).join(" · ");
  const toolCount = turn.transcript?.tools.length ?? turn.transcriptSummary?.toolCount ?? null;
  return [turn.mode || turn.kind || "", workItem, turn.transcriptSummary?.model || "", toolCount != null ? `${toolCount} tools` : ""].filter((x) => x !== "");
}

// The meta-line eyebrow (TURN 16 / ARTIFACT / STEP OUTPUTS / ROLE): a small bold uppercase-weight
// token that leads the meta line, distinguishing the panel's KIND from its title.
const HEAD_LABEL: React.CSSProperties = { fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em" };

// A file/asset row: a code/artifact (or deleted) badge + a path, optionally with a trailing muted
// sub-path. Clickable when `onSelect` is given (a deleted file has no content to open, so it
// renders as a static row). Shared by the turn Files tab and the step-outputs list, which were
// near-identical before.
function FileRow({
  badge,
  badgeColor,
  label,
  sub,
  strike,
  selected,
  onSelect,
}: {
  badge: string;
  badgeColor: string;
  label: string;
  sub?: string;
  strike?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const labelSpan = (
    <span style={{ fontSize: "0.7rem", fontFamily: font.mono, color: strike ? "var(--text-faint)" : "var(--text-body)", textDecoration: strike ? "line-through" : undefined, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {label}
      {sub ? <span style={{ color: "var(--text-faint)" }}> · {sub}</span> : null}
    </span>
  );
  const badgeSpan = <span style={{ fontSize: "0.58rem", fontWeight: 700, color: badgeColor, minWidth: 46 }}>{badge}</span>;
  if (!onSelect) {
    return (
      <div title={strike ? `deleted: ${label}` : label} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 8px" }}>
        {badgeSpan}
        {labelSpan}
      </div>
    );
  }
  return (
    <button
      onClick={onSelect}
      title={sub ?? label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        textAlign: "left",
        background: selected ? "var(--surface-inset)" : "transparent",
        border: "none",
        borderLeft: `2px solid ${selected ? "var(--status-accent)" : "transparent"}`,
        borderRadius: 3,
        padding: "3px 6px",
        cursor: "pointer",
        font: "inherit",
      }}
    >
      {badgeSpan}
      {labelSpan}
    </button>
  );
}

// The content pane for a selected file: its text, or the reason it can't be shown (gone at HEAD,
// too large, binary, not captured), or a loading / nothing-selected line. The reason IS
// information — a live artifact can legitimately no longer exist — so it's named, never blanked.
function ContentView({
  file,
  idle,
  loadingName,
}: {
  // undefined = nothing selected; null = selected but still loading; else the fetched content.
  file: { content: string | null; reason?: string | null } | null | undefined;
  idle: string;
  loadingName: string | null;
}) {
  if (file === undefined) return <div style={{ fontSize: "0.72rem", color: "var(--text-faint)" }}>{idle}</div>;
  if (file === null) return <div style={{ fontSize: "0.72rem", color: "var(--text-faint)" }}>Loading {loadingName}…</div>;
  if (file.content === null) return <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontStyle: "italic" }}>{file.reason ?? "(no content)"}</div>;
  return <Pre>{file.content}</Pre>;
}

// `fill` makes the block GROW to fill its flex parent and scroll INSIDE that bound (the transcript's
// top/bottom sections), instead of the fixed maxHeight the standalone file viewer uses.
function Pre({ children, fill }: { children: React.ReactNode; fill?: boolean }) {
  return (
    <pre
      style={{
        margin: 0,
        ...(fill ? { flex: "1 1 0", minHeight: 0 } : { maxHeight: 420 }),
        overflow: "auto",
        background: "var(--surface-inset)",
        border: `1px solid var(--border-default)`,
        borderRadius: 5,
        padding: "7px 9px",
        fontSize: "0.68rem",
        fontFamily: font.mono,
        color: "var(--text-body)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {children}
    </pre>
  );
}

// `fill` makes the section grow to share the panel height (its label fixed, its body flexing) so a
// `fill` Pre inside it scrolls within that bound — used for the transcript's Prompt / Reasoning.
// `fill` grows the section to share the column height (and scroll its own body). A NUMBER sets the
// flex-grow WEIGHT, so sections can take unequal shares — the prompt + tools carry the most, the
// final reasoning a smaller slice.
function Section({ label, children, fill }: { label: string; children: React.ReactNode; fill?: boolean | number }) {
  const grow = typeof fill === "number" ? fill : fill ? 1 : 0;
  return (
    <div style={fill ? { flex: `${grow} 1 0`, minHeight: 0, display: "flex", flexDirection: "column" } : undefined}>
      <div style={{ flex: "none", fontSize: "0.62rem", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

// --- turn body (replay: transcript + per-turn produced/deleted files) --------------------------

type TurnKind = "code" | "artifact";

// Most fields optional because the corpus's turn.json genuinely omits them (mode on 36/126, etc.).
export interface TurnPayload {
  ordinal: number;
  step: number;
  label: string;
  kind: string;
  role?: string | null;
  mode?: string | null;
  story?: string | null;
  ac?: string | null;
  produced: { path: string; kind: TurnKind }[];
  deleted: string[];
  transcript: { prompt: string; tools: string[]; reasoning: string } | null;
  transcriptSummary: { role?: string; model?: string; toolCount?: number; finalTextChars?: number } | null;
}

interface FilePayload {
  path: string;
  kind: TurnKind;
  content: string | null;
  reason: string | null;
}

type Tab = "correspondence" | "artifacts" | "code";

// `produced` files carry a kind; `deleted` files don't, so bucket a deleted path by extension —
// clear code extensions go to the Code tab, everything else (md/json/txt/…) to Artifacts.
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|java|kt|kts|go|rb|rs|sql|sh|css|scss|c|h|cpp|php|swift)$/i;
function isCodePath(p: string): boolean {
  return CODE_EXT.test(p);
}

// Frontier gate bodies, shared by TurnBody + RoleBody so a topology click past/at the active cell
// renders identically regardless of whether a prior-run turn happened to exist.
// A cell AFTER the frontier: the uninvoked state (no prior-run content).
function NotYetRunBody({ accent, title, onClose }: { accent: string; title: React.ReactNode; onClose: () => void }) {
  return (
    <PanelShell accent={accent} title={title} onClose={onClose} bodyScroll={false}>
      <Empty>This step hasn&apos;t run at the current position. Advance the run — or move the scrubber — to its turn to see what it produced.</Empty>
    </PanelShell>
  );
}
// The ACTIVE cell: only the prompt, until the agent completes (then the reveal flips to "full").
function PromptOnlyBody({ accent, title, role, prompt, note, onClose }: { accent: string; title: React.ReactNode; role: string; prompt: string; note: string; onClose: () => void }) {
  return (
    <PanelShell accent={accent} title={title} onClose={onClose} bodyScroll={false}>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "14px 16px" }}>
        <Section label={`▸ Prompt → ${role}`} fill>
          <Pre fill>{prompt}</Pre>
        </Section>
        <div style={{ flex: "none", fontSize: "0.68rem", color: "var(--text-faint)", marginTop: 8 }}>{note}</div>
      </div>
    </PanelShell>
  );
}

function TurnBody({ ord, mode, reveal = "full", onClose }: { ord: number; mode: "live" | "replay" | null; reveal?: DrilldownReveal; onClose: () => void }) {
  const [turn, setTurn] = useState<TurnPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("correspondence");
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<FilePayload | null>(null);

  // Reset on ordinal change, so opening a second turn never shows the first while the new fetch is
  // in flight.
  useEffect(() => {
    // A cell AFTER the frontier must read as uninvoked — don't fetch (or reveal) its prior-run turn.
    if (reveal === "none") return;
    let live = true;
    setTurn(null);
    setError(null);
    setSelected(null);
    setFile(null);
    (async () => {
      try {
        const r = await fetch(turnUrl(ord, mode), { cache: "no-store" });
        const body = await r.json();
        if (!live) return;
        if (!r.ok) {
          setError(body.error ?? `HTTP ${r.status}`);
          return;
        }
        const t = body as TurnPayload;
        setTurn(t);
        // Always land on Correspondence (like the reference's showTab("corr")); the tabs stay
        // clickable, so a no-transcript turn shows its "no transcript" note and you click over to
        // Artifacts / Code from there.
        setTab("correspondence");
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [ord, mode, reveal]);

  // Selected file's content — separate effect so switching files doesn't refetch the turn.
  useEffect(() => {
    if (selected === null) {
      setFile(null);
      return;
    }
    let live = true;
    setFile(null);
    (async () => {
      try {
        const r = await fetch(turnUrl(ord, mode, selected), { cache: "no-store" });
        const body = await r.json();
        if (live) setFile(r.ok ? (body as FilePayload) : { path: selected, kind: "artifact", content: null, reason: body.error ?? `HTTP ${r.status}` });
      } catch (e) {
        if (live) setFile({ path: selected, kind: "artifact", content: null, reason: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      live = false;
    };
  }, [ord, mode, selected]);

  const roleColor = turn?.role ? colorForRole(turn.role) : "var(--border-strong)";

  // Header: "#<ordinal> <role>" title, then a meta line of "<mode> · <story> · <model> · <N tools>"
  // where each field is APPENDED ONLY WHEN PRESENT (like the reference) — a dispatch/gate turn with
  // only a mode shows just the mode, no empty separators. The tabs + panes below are the always-
  // present structure that keeps the panel's shape stable across turns.
  const roleText = turn?.role ?? turn?.label ?? (error ? "unavailable" : "loading…");
  const title = turnTitle(ord, roleText);
  const meta = <MetaChips items={turnMetaFields(turn)} />;

  // File buckets for the two split panes, null-safe so the tabs + their counts render even before
  // the turn loads. `produced` carries a kind; deleted files are bucketed by extension.
  const artifacts = turn?.produced.filter((p) => p.kind === "artifact") ?? [];
  const codeFiles = turn?.produced.filter((p) => p.kind === "code") ?? [];
  const delArts = turn?.deleted.filter((d) => !isCodePath(d)) ?? [];
  const delCode = turn?.deleted.filter((d) => isCodePath(d)) ?? [];
  const artCount = artifacts.length + delArts.length;
  const codeCount = codeFiles.length + delCode.length;
  const codeRows = buildFileTree(codeFiles.map((p) => p.path));
  const selectFile = (p: string) => setSelected(p === selected ? null : p);
  // One viewer serves both split panes: a path header + the existing per-file content view.
  const viewer = (
    <>
      {selected ? (
        <div style={{ fontFamily: font.mono, fontSize: "0.64rem", color: "var(--text-faint)", marginBottom: 6, paddingBottom: 5, borderBottom: `1px solid var(--border-default)`, wordBreak: "break-all" }}>{selected}</div>
      ) : null}
      <ContentView file={selected === null ? undefined : file} idle="Select a file to view its snapshot." loadingName={selected} />
    </>
  );

  // Frontier gating (topology clicks only; non-topology opens pass reveal="full"):
  if (reveal === "none") {
    return <NotYetRunBody accent={"var(--border-strong)"} title={turnTitle(ord, "not yet run")} onClose={onClose} />;
  }
  if (reveal === "prompt-only") {
    return (
      <PromptOnlyBody
        accent={roleColor}
        title={runningTitle(roleText)}
        role={turn?.role ?? "agent"}
        prompt={error ? error : !turn ? `Loading…` : turn.transcript?.prompt || "(no prompt recorded for this turn)"}
        note="Running — only the prompt is shown until this agent completes."
        onClose={onClose}
      />
    );
  }

  return (
    <PanelShell accent={roleColor} title={title} meta={meta} onClose={onClose} bodyScroll={false}>
      {/* All three tabs stay clickable (like the reference) — an empty tab shows an empty pane
          rather than being disabled — so the panel always lands on Correspondence and you can click
          across to Artifacts / Code even when a turn has no transcript. */}
      <TabRow>
        <TabButton active={tab === "correspondence"} onClick={() => setTab("correspondence")}>
          Correspondence
        </TabButton>
        <TabButton active={tab === "artifacts"} onClick={() => { setTab("artifacts"); setSelected(null); }}>
          Artifacts{artCount > 0 ? ` (${artCount})` : ""}
        </TabButton>
        <TabButton active={tab === "code"} onClick={() => { setTab("code"); setSelected(null); }}>
          Code{codeCount > 0 ? ` (${codeCount})` : ""}
        </TabButton>
      </TabRow>

      {error ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 16px", fontSize: "0.78rem", color: "var(--status-critical-text)" }}>{error}</div>
      ) : !turn ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 16px", fontSize: "0.78rem", color: "var(--text-faint)" }}>Loading turn {ord}…</div>
      ) : tab === "correspondence" ? (
        // Bounded (no outer scroll): TranscriptView's own top/bottom sections scroll within this box.
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "14px 16px" }}>
          <TranscriptView turn={turn} />
        </div>
      ) : tab === "artifacts" ? (
        <SplitPane
          list={
            artCount === 0 ? (
              <Empty>No artifacts this turn.</Empty>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {artifacts.map((p) => (
                  <FileRow key={p.path} badge="ARTIFACT" badgeColor="var(--text-faint)" label={p.path} selected={p.path === selected} onSelect={() => selectFile(p.path)} />
                ))}
                {delArts.map((d) => (
                  <FileRow key={d} badge="DELETED" badgeColor="var(--status-critical-text)" label={d} strike />
                ))}
              </div>
            )
          }
          viewer={viewer}
        />
      ) : (
        <SplitPane
          list={
            codeCount === 0 ? (
              <Empty>No code this turn.</Empty>
            ) : (
              <>
                <CodeTree rows={codeRows} selected={selected} onSelect={selectFile} />
                {delCode.map((d) => (
                  <FileRow key={d} badge="DELETED" badgeColor="var(--status-critical-text)" label={d} strike />
                ))}
              </>
            )
          }
          viewer={viewer}
        />
      )}
    </PanelShell>
  );
}

function TabButton({ active, onClick, disabled, children }: { active: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 12.5,
        fontFamily: font.sans,
        fontWeight: 600,
        color: disabled ? "var(--border-strong)" : active ? "var(--text-strong)" : "var(--text-muted)",
        background: "none",
        border: "none",
        // Sits ON the tabs-row bottom border, so pull it down 1px to overlap and read as the
        // reference's active-tab underline rather than a second line above the divider. The
        // selected tab's accent is the transport play-button blue (--status-play).
        borderBottom: `2px solid ${active && !disabled ? "var(--status-play)" : "transparent"}`,
        marginBottom: -1,
        padding: "7px 14px",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

// Master-detail split that FILLS the panel body: a scrolling file list/tree on the left (230px), the
// selected file's content on the right — the reference's full-height `.pane.split.show` (230px 1fr),
// in the app's tokens. Each side scrolls independently; the split itself takes all remaining height.
function SplitPane({ list, viewer }: { list: React.ReactNode; viewer: React.ReactNode }) {
  // Draggable file-list | content split (drag the handle toward the file list to give the content
  // body more room). The file list keeps single-line, ellipsis-clipped rows (see FileRow/CodeTree);
  // the content body wraps (see Pre). The handle supplies the divider the grid border used to.
  return (
    <ResizableSplit direction="horizontal" initialWeights={[230, 640]} minSize={120}>
      <div style={{ overflowY: "auto", padding: "8px 0", flex: 1, minHeight: 0 }}>{list}</div>
      <div style={{ overflowY: "auto", padding: "12px 14px", flex: 1, minHeight: 0 }}>{viewer}</div>
    </ResizableSplit>
  );
}

// The Code pane's left rail: a directory tree (dirs as indented headers, files as indented,
// selectable rows) built by buildFileTree — the template's `.tree-dir` / `.tree-file`.
function CodeTree({ rows, selected, onSelect }: { rows: FileTreeRow[]; selected: string | null; onSelect: (p: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map((r) =>
        r.kind === "dir" ? (
          <div key={`d:${r.path}`} style={{ fontFamily: font.mono, fontSize: "0.66rem", fontWeight: 700, color: "var(--text-muted)", padding: "3px 8px", paddingLeft: 8 + r.depth * 12, whiteSpace: "nowrap" }}>
            {r.name}/
          </div>
        ) : (
          <button
            key={`f:${r.path}`}
            onClick={() => onSelect(r.path)}
            title={r.path}
            style={{
              display: "block",
              textAlign: "left",
              width: "100%",
              background: r.path === selected ? "var(--surface-inset)" : "transparent",
              border: "none",
              borderLeft: `2px solid ${r.path === selected ? "var(--status-good-text)" : "transparent"}`,
              padding: "3px 8px",
              paddingLeft: 8 + r.depth * 12,
              fontFamily: font.mono,
              fontSize: "0.66rem",
              color: r.path === selected ? "var(--text-strong)" : "var(--text-body)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {r.name}
          </button>
        ),
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: "0.7rem", color: "var(--text-faint)", padding: "8px 10px" }}>{children}</div>;
}

export function TranscriptView({ turn }: { turn: TurnPayload }) {
  if (!turn.transcript) {
    return <div style={{ fontSize: "0.76rem", color: "var(--text-faint)" }}>No transcript recorded for this turn (gate / dispatch / orchestrator step).</div>;
  }
  const { prompt, tools, reasoning } = turn.transcript;
  // Frame the turn as the EXCHANGE Kevin's original made obvious: an inbound prompt sent TO the
  // role (▸), then what the role sent back (◂) — its tools and its reasoning. The direction glyphs
  // + the role name in each label make "what was passed back and forth" legible at a glance rather
  // than three flat sections a viewer has to mentally assign a direction to.
  const role = turn.role ?? "agent";
  // The three sections (Prompt ▸, Tools ◂, Reasoning ◂) stack vertically with DRAGGABLE dividers
  // between them (ResizableSplit), so a viewer can grow whichever they're reading; each still scrolls
  // within its slice. Only the present sections are included — tools/reasoning are conditional — and
  // the default weights keep the prompt + tools primary with reasoning given a smaller initial share.
  const parts: { node: React.ReactNode; weight: number }[] = [
    {
      weight: 1,
      node: (
        <Section key="prompt" label={`▸ Prompt → ${role}`} fill>
          <Pre fill>{prompt || "(empty)"}</Pre>
        </Section>
      ),
    },
  ];
  if (tools.length > 0) {
    parts.push({
      weight: 1,
      node: (
        <Section key="tools" label={`◂ Tools ${role} invoked (${tools.length})`} fill>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 0", minHeight: 0, overflowY: "auto" }}>
            {tools.map((t, i) => {
              // Tool lines arrive as "ToolName rest of the call…"; bold the tool name and mute the
              // arguments so a viewer scans WHICH tools ran without the args drowning them out.
              const sp = t.indexOf(" ");
              const name = sp > 0 ? t.slice(0, sp) : t;
              const rest = sp > 0 ? t.slice(sp) : "";
              return (
                <div key={i} title={t} style={{ fontSize: "0.68rem", lineHeight: 1.6, flexShrink: 0, fontFamily: font.mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  <span style={{ fontWeight: 700, color: "var(--text-body)" }}>{name}</span>
                  <span style={{ color: "var(--text-muted)" }}>{rest}</span>
                </div>
              );
            })}
          </div>
        </Section>
      ),
    });
  }
  if (reasoning) {
    parts.push({
      weight: 0.4,
      node: (
        <Section key="reasoning" label={`◂ ${role}'s final reasoning`} fill>
          <Pre fill>{reasoning}</Pre>
        </Section>
      ),
    });
  }
  return (
    <ResizableSplit direction="vertical" initialWeights={parts.map((p) => p.weight)} minSize={48}>
      {parts.map((p) => p.node)}
    </ResizableSplit>
  );
}

// --- artifact body (live: one produced file, read at HEAD) -------------------------------------

function ArtifactBody({ path, mode, onClose }: { path: string; mode: "live" | "replay" | null; onClose: () => void }) {
  const [artifact, setArtifact] = useState<ArtifactContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setArtifact(null);
    setError(null);
    (async () => {
      try {
        const r = await fetch(artifactUrl(path, mode), { cache: "no-store" });
        const body = await r.json();
        if (!live) return;
        if (!r.ok) {
          setError(body?.error ?? `HTTP ${r.status}`);
          return;
        }
        setArtifact(body as ArtifactContent);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [path, mode]);

  const title = (
    <span title={path} style={{ fontFamily: font.mono, wordBreak: "break-all" }}>
      {path}
    </span>
  );
  const meta = (
    <MetaChips
      items={[
        <span style={HEAD_LABEL}>ARTIFACT</span>,
        artifact?.kind,
        // The honesty label: this is HEAD, and there is no transcript here. Said up front, so a
        // viewer never mistakes a live artifact view for replay's per-turn snapshot.
        <span title="A live project has no per-turn corpus. This is the file as it is at the project's current HEAD, not a snapshot of the turn that wrote it — and there is no transcript. Both are replay-only.">
          content at HEAD · transcripts are replay-only
        </span>,
      ]}
    />
  );

  return (
    <PanelShell accent={"var(--status-accent)"} title={title} meta={meta} onClose={onClose}>
      {error ? (
        <div style={{ fontSize: "0.78rem", color: "var(--status-critical-text)" }}>{error}</div>
      ) : !artifact ? (
        <div style={{ fontSize: "0.78rem", color: "var(--text-faint)" }}>Loading {path}…</div>
      ) : (
        <ContentView file={artifact} idle="" loadingName={path} />
      )}
    </PanelShell>
  );
}

// --- step body (a lifecycle step's recorded deliverables) --------------------------------------

function StepBody({ node, feature, mode, onClose }: { node: string; feature: string | null; mode: "live" | "replay" | null; onClose: () => void }) {
  const [outputs, setOutputs] = useState<StepOutputs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<ArtifactContent | null>(null);

  const label = nodeById(node)?.label ?? node;

  // Re-fetch the list when node OR feature changes: switching the pinned feature must re-scope the
  // per-feature deliverables.
  useEffect(() => {
    let live = true;
    setOutputs(null);
    setError(null);
    setSelected(null);
    setFile(null);
    (async () => {
      try {
        const r = await fetch(stepListUrl(node, feature, mode), { cache: "no-store" });
        const body = await r.json();
        if (!live) return;
        if (!r.ok) {
          setError(body.error ?? `HTTP ${r.status}`);
          return;
        }
        setOutputs(body as StepOutputs);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [node, feature, mode]);

  useEffect(() => {
    if (selected === null) {
      setFile(null);
      return;
    }
    let live = true;
    setFile(null);
    (async () => {
      try {
        const r = await fetch(stepContentUrl(selected, mode), { cache: "no-store" });
        const body = await r.json();
        if (live) setFile(r.ok ? (body as ArtifactContent) : { path: selected, kind: "artifact", content: null, reason: body.error ?? `HTTP ${r.status}` });
      } catch (e) {
        if (live) setFile({ path: selected, kind: "artifact", content: null, reason: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      live = false;
    };
    // `node`/`feature` are in the deps for explicitness: when either changes the list effect above
    // already resets `selected` to null (which re-runs this and clears the file), but naming them
    // here makes the re-scope correctness self-evident instead of an implicit cross-effect ordering,
    // and matches TurnBody's content effect (which keys on its `ord`).
  }, [selected, node, feature, mode]);

  const assets: StepOutputAsset[] = outputs?.assets ?? [];

  const meta = <MetaChips items={[<span style={HEAD_LABEL}>STEP OUTPUTS</span>, outputs?.feature]} />;

  return (
    <PanelShell accent={"var(--status-selection)"} title={label} meta={meta} onClose={onClose}>
      {error ? (
        <div style={{ fontSize: "0.78rem", color: "var(--status-critical-text)" }}>{error}</div>
      ) : !outputs ? (
        <div style={{ fontSize: "0.78rem", color: "var(--text-faint)" }}>Loading {label} outputs…</div>
      ) : assets.length === 0 ? (
        <div style={{ fontSize: "0.76rem", color: "var(--text-faint)" }}>No recorded deliverables for this step{feature ? ` in ${feature}` : ""}.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {assets.map((a) => (
              <FileRow
                key={a.path}
                badge={a.kind === "code" ? "CODE" : "ARTIFACT"}
                badgeColor={a.kind === "code" ? "var(--status-good-text)" : "var(--text-faint)"}
                label={a.name}
                sub={a.path}
                selected={a.path === selected}
                onSelect={() => setSelected(a.path === selected ? null : a.path)}
              />
            ))}
          </div>
          <ContentView file={selected === null ? undefined : file} idle="Select a deliverable to read it." loadingName={selected} />
        </div>
      )}
    </PanelShell>
  );
}
