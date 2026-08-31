"use client";

import { useEffect, useState } from "react";
import { nodeById } from "@/lib/topology";
import { colorForRole, font, radius } from "@/lib/theme";
import type { ArtifactContent, StepOutputAsset, StepOutputs } from "@/lib/types";

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

export type DrilldownTarget =
  | { kind: "turn"; ord: number }
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
  onClose,
}: {
  target: DrilldownTarget;
  mode: "live" | "replay" | null;
  // The board's CURRENT feature (the FeatureSwitcher pin, or the playhead's feature). Passed live
  // rather than baked into a step target, so switching the pin re-scopes an open step drill-down.
  // Only step targets read it.
  feature: string | null;
  onClose: () => void;
}) {
  switch (target.kind) {
    case "turn":
      return <TurnBody ord={target.ord} mode={mode} onClose={onClose} />;
    case "artifact":
      return <ArtifactBody path={target.path} mode={mode} onClose={onClose} />;
    case "step":
      return <StepBody node={target.node} feature={feature} mode={mode} onClose={onClose} />;
  }
}

// --- shared shell + primitives ---------------------------------------------------------------

// The card + left accent rail + a header row (caller-supplied content, left of an always-present
// close button) + a padded body. One shell for every kind, so the surface is visually one thing.
function PanelShell({
  accent,
  header,
  onClose,
  children,
}: {
  accent: string;
  header: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: `1px solid var(--border-default)`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: radius.panel,
        marginTop: 12,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderBottom: `1px solid var(--border-default)` }}>
        {header}
        <button
          onClick={onClose}
          aria-label="Close drill-down panel"
          style={{ marginLeft: "auto", background: "none", border: `1px solid var(--border-default)`, borderRadius: radius.chip, color: "var(--text-muted)", cursor: "pointer", fontSize: "0.8rem", lineHeight: 1, padding: "3px 7px", font: "inherit" }}
        >
          ✕
        </button>
      </div>
      <div style={{ padding: "10px 13px 13px" }}>{children}</div>
    </div>
  );
}

const HEAD_LABEL: React.CSSProperties = { fontSize: "0.68rem", fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.05em" };
const CHIP: React.CSSProperties = { fontSize: "0.68rem", color: "var(--text-muted)", background: "var(--surface-inset)", border: `1px solid var(--border-default)`, borderRadius: radius.chip, padding: "1px 6px" };

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

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre
      style={{
        margin: 0,
        maxHeight: 420,
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

// --- turn body (replay: transcript + per-turn produced/deleted files) --------------------------

type TurnKind = "code" | "artifact";

// Most fields optional because the corpus's turn.json genuinely omits them (mode on 36/126, etc.).
interface TurnPayload {
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

type Tab = "transcript" | "files";

function fileCount(t: TurnPayload): number {
  return t.produced.length + t.deleted.length;
}

function TurnBody({ ord, mode, onClose }: { ord: number; mode: "live" | "replay" | null; onClose: () => void }) {
  const [turn, setTurn] = useState<TurnPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("transcript");
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<FilePayload | null>(null);

  // Reset on ordinal change, so opening a second turn never shows the first while the new fetch is
  // in flight.
  useEffect(() => {
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
        // Land on whichever tab has something: a gate turn has no transcript, several produce
        // nothing. Opening on an empty pane reads as broken.
        setTab(t.transcript ? "transcript" : fileCount(t) > 0 ? "files" : "transcript");
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [ord, mode]);

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

  const header = (
    <>
      <span style={HEAD_LABEL}>TURN {ord}</span>
      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-strong)" }}>{turn?.role ?? turn?.label ?? (error ? "—" : "loading…")}</span>
      {/* mode/story are alternatives (most turns carry one), ac narrows a story turn further. */}
      {[turn?.mode, turn?.story, turn?.ac].filter(Boolean).map((chip) => (
        <span key={chip as string} style={CHIP}>
          {chip}
        </span>
      ))}
      {turn && turn.kind !== "invoke-role" ? (
        <span title="A workflow step, not a role invocation — so it has no transcript." style={{ fontSize: "0.66rem", color: "var(--text-faint)" }}>
          {turn.kind}
        </span>
      ) : null}
      {turn?.transcriptSummary?.model ? <span style={{ fontSize: "0.66rem", color: "var(--text-faint)" }}>· {turn.transcriptSummary.model}</span> : null}
    </>
  );

  return (
    <PanelShell accent={roleColor} header={header} onClose={onClose}>
      {error ? (
        <div style={{ fontSize: "0.78rem", color: "var(--status-critical-text)" }}>{error}</div>
      ) : !turn ? (
        <div style={{ fontSize: "0.78rem", color: "var(--text-faint)" }}>Loading turn {ord}…</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 2, marginBottom: 10 }}>
            <TabButton active={tab === "transcript"} onClick={() => setTab("transcript")} disabled={!turn.transcript}>
              Transcript
            </TabButton>
            <TabButton active={tab === "files"} onClick={() => setTab("files")} disabled={fileCount(turn) === 0}>
              Files {fileCount(turn) > 0 ? `(${fileCount(turn)})` : ""}
            </TabButton>
          </div>

          {tab === "transcript" ? (
            <TranscriptView turn={turn} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {turn.produced.map((p) => (
                  <FileRow
                    key={p.path}
                    badge={p.kind === "code" ? "CODE" : "ARTIFACT"}
                    badgeColor={p.kind === "code" ? "var(--status-good-text)" : "var(--text-faint)"}
                    label={p.path}
                    selected={p.path === selected}
                    onSelect={() => setSelected(p.path === selected ? null : p.path)}
                  />
                ))}
                {turn.deleted.map((d) => (
                  <FileRow key={d} badge="DELETED" badgeColor={"var(--status-critical-text)"} label={d} strike />
                ))}
              </div>
              <ContentView
                file={selected === null ? undefined : file}
                idle="Select a file to see the snapshot this turn captured."
                loadingName={selected}
              />
            </div>
          )}
        </>
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
        fontSize: "0.72rem",
        fontWeight: 700,
        color: disabled ? "var(--border-strong)" : active ? "var(--text-strong)" : "var(--text-muted)",
        background: "none",
        border: "none",
        borderBottom: `2px solid ${active && !disabled ? "var(--status-accent)" : "transparent"}`,
        padding: "5px 9px",
        cursor: disabled ? "default" : "pointer",
        font: "inherit",
      }}
    >
      {children}
    </button>
  );
}

function TranscriptView({ turn }: { turn: TurnPayload }) {
  if (!turn.transcript) {
    return (
      <div style={{ fontSize: "0.76rem", color: "var(--text-faint)" }}>
        {turn.kind === "invoke-role" ? "This turn recorded no transcript." : `A ${turn.kind} step — the orchestrator's own action, so there is no agent transcript.`}
      </div>
    );
  }
  const { prompt, tools, reasoning } = turn.transcript;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Section label="Prompt">
        <Pre>{prompt || "(empty)"}</Pre>
      </Section>
      {tools.length > 0 ? (
        <Section label={`Tools used (${tools.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 168, overflowY: "auto" }}>
            {tools.map((t, i) => (
              <div key={i} title={t} style={{ fontSize: "0.68rem", fontFamily: font.mono, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t}
              </div>
            ))}
          </div>
        </Section>
      ) : null}
      {reasoning ? (
        <Section label="Final reasoning">
          <Pre>{reasoning}</Pre>
        </Section>
      ) : null}
    </div>
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

  const header = (
    <>
      <span style={HEAD_LABEL}>ARTIFACT</span>
      <span title={path} style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-strong)", fontFamily: font.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {path}
      </span>
      {artifact ? <span style={{ fontSize: "0.66rem", color: "var(--text-faint)" }}>{artifact.kind}</span> : null}
      {/* The honesty label: this is HEAD, and there is no transcript here. Said up front, so a
          viewer never mistakes a live artifact view for replay's per-turn snapshot. */}
      <span
        title="A live project has no per-turn corpus. This is the file as it is at the project's current HEAD, not a snapshot of the turn that wrote it — and there is no transcript. Both are replay-only."
        style={{ fontSize: "0.64rem", color: "var(--text-muted)", background: "var(--surface-inset)", border: `1px solid var(--border-default)`, borderRadius: radius.chip, padding: "1px 7px" }}
      >
        content at HEAD · transcripts are replay-only
      </span>
    </>
  );

  return (
    <PanelShell accent={"var(--status-accent)"} header={header} onClose={onClose}>
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

  const header = (
    <>
      <span style={HEAD_LABEL}>STEP OUTPUTS</span>
      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-strong)" }}>{label}</span>
      {outputs?.feature ? <span style={CHIP}>{outputs.feature}</span> : null}
    </>
  );

  return (
    <PanelShell accent={"var(--status-accent)"} header={header} onClose={onClose}>
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
