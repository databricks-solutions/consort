// The CLOSED agent-log event vocabulary + per-event Jinja-style message
// templates. This is the single source of truth for "what events exist" and
// "how each event's message reads". Enforcement (agent-log.ts): an emit whose
// `event` is not in this map is REJECTED; a template slot with no value is
// REJECTED. Nothing is dropped – a malformed emit throws so it gets fixed.
//
// A template is plain text with `{{ slot }}` placeholders. Every placeholder is
// REQUIRED (there are no optional slots / conditionals, on purpose: a fixed
// shape is what makes the stream consistent + greppable). The render context is
// the event's top-level fields (role, feature_id, phase, cycle_id) PLUS the
// caller-supplied `slots`. The event NAME carries the phase; the slots carry the
// specifics the agent (or code) fills in.

/** One event's contract: the message template (placeholders are required slots). */
export interface EventTemplate {
  template: string;
}

/**
 * The closed vocabulary. Keys are the only legal `event` values. Grouped by
 * concern; the `cycle.*` family is the build loop (RED -> GREEN -> REVIEW ->
 * REFACTOR), filterable by prefix or by exact name.
 */
export const EVENT_TEMPLATES = {
  // Orchestration lifecycle (code-emitted)
  "handoff": { template: "dispatch {{to_role}} for {{phase}}" },
  "phase.start": { template: "{{role}} START {{phase}}" },
  "phase.end": { template: "{{role}} END {{phase}} ({{outcome}})" },
  "escalation.raised": { template: "RAISED TO HIL [{{source}}]: {{reason}}" },

  // Gates (code surfaces; HIL / Human Proxy decides)
  "gate.surfaced": { template: "GATE {{gate}} awaiting decision – {{subject}}" },
  "gate.approved": { template: "GATE {{gate}} APPROVED" },
  "gate.rejected": { template: "GATE {{gate}} REJECTED: {{reason}}" },
  "gate.modified": { template: "GATE {{gate}} MODIFIED: {{change}}" },

  // Intake & planning
  "intake.supplied": { template: "INTAKE supplied {{artifact}}" },
  "intake.refused": { template: "INTAKE refused {{artifact}}: {{reason}}" },

  // Artifacts & design (agent-emitted)
  "artifact.written": { template: "{{role}} wrote {{artifact}} – {{summary}}" },
  "open.question": { template: "OPEN Q [{{scope}}]: {{question}}" },
  "concern.flagged": { template: "CONCERN {{concern}} – owner {{owner_layer}}" },

  // Build cycle (cycle.* family: RED -> GREEN -> REVIEW -> REFACTOR)
  "cycle.red": { template: "RED {{batch}} test(s) in {{cycle_id}} [{{layer}}], lead {{test_id}} ({{ac}}): {{asserts}}" },
  "cycle.green": { template: "GREEN {{test_id}} [{{ac}}]: {{change}}" },
  "cycle.verified": { template: "VERIFY [{{ac}}] on {{branch}} {{outcome}}: {{summary}}" },
  "cycle.review": { template: "REVIEW [{{ac}}] refactor={{refactor}}: {{rationale}}" },
  "cycle.refactored": { template: "REFACTOR [{{ac}}]: {{change}}" },
  // Per-TEST status transition within a cycle (code-emitted by the runner as it parses the test
  // runner's machine-readable output). Unlike cycle.green (one event per cycle, lead test only),
  // this fires once per test id so the dashboard can reconstruct each test's status as-of any
  // event index — the historical per-test trail the cycle.* family does not carry. story_id /
  // ac_id / cycle_id ride in metadata (not template slots), like the other cycle.* events.
  "test.result": { template: "TEST {{test_id}} {{status}}" },
  "smell.flagged": { template: "SMELL {{smell}} ({{severity}}): {{detail}}" },
  "runner.missing": { template: "NO RUNNER for layer {{layer}} (test {{test_id}})" },

  // Experiment lifecycle (code-emitted)
  "experiment.cut": { template: "EXPERIMENT cut for {{story}}" },
  "experiment.accepted": { template: "EXPERIMENT accepted (merged) for {{story}}" },
  "experiment.discarded": { template: "EXPERIMENT discarded for {{story}}: {{reason}}" },
  "experiment.revised": { template: "EXPERIMENT revised for {{story}}: {{reason}}" },

  // Deploy / verify (code-emitted from the deploy CLI)
  "deploy.start": { template: "DEPLOY start {{scope}} -> {{target}}" },
  "deploy.reachable": { template: "DEPLOY reachable {{url}} (pid {{pid}})" },
  "deploy.unreachable": { template: "DEPLOY unreachable {{url}}: {{reason}}" },
  "deploy.verified": { template: "DEPLOY verified {{scope}} @ {{url}} – verify {{verify_status}}" },
  "deploy.failed": { template: "DEPLOY failed {{scope}}: {{reason}}" },
  "verify.passed": { template: "VERIFY passed {{scope}} ({{command}})" },
  "verify.failed": { template: "VERIFY failed {{scope}} ({{command}}): {{summary}}" },

  // UX adherence
  "adherence.passed": { template: "ADHERENCE passed {{scope}}" },
  "adherence.failed": { template: "ADHERENCE failed {{scope}}: {{diffs}}" },

  // Per-turn model usage (code-emitted by the runner from the claude -p result).
  // input_tokens is the turn's CONTEXT SIZE (prompt the model processed); the
  // cache_* + cost_usd ride in metadata (not template slots, so not required).
  "turn.usage": { template: "{{role}} turn used {{input_tokens}} input + {{output_tokens}} output tokens" },

  // Generic (agent-emitted; debug / interim)
  "reasoning": { template: "{{note}}" },
  "progress": { template: "{{note}} – {{step}}" },
} as const satisfies Record<string, EventTemplate>;

/** The legal event names (closed set). */
export type AgentLogEventName = keyof typeof EVENT_TEMPLATES;

/** Array form of the vocabulary (for the schema enum + tests). */
export const AGENT_LOG_EVENT_NAMES = Object.keys(EVENT_TEMPLATES) as AgentLogEventName[];

/** True when `name` is in the closed vocabulary. */
export function isKnownEvent(name: string): name is AgentLogEventName {
  return Object.prototype.hasOwnProperty.call(EVENT_TEMPLATES, name);
}

/** The required slot names for an event = the `{{ placeholders }}` in its template. */
export function requiredSlots(event: AgentLogEventName): string[] {
  const out: string[] = [];
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(EVENT_TEMPLATES[event].template)) !== null) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** Thrown when an emit is off-vocabulary or missing a required slot. Nothing is
 *  dropped; the caller must fix the emit. */
export class AgentLogEventError extends Error {}

/**
 * Render an event's message from its template + the slot values. Throws
 * `AgentLogEventError` if the event is unknown OR any required slot is missing
 * (undefined / null / empty string). Booleans + numbers render as their string
 * form (so `refactor={{refactor}}` -> `refactor=true`).
 */
export function renderEventMessage(event: string, slots: Record<string, unknown> = {}): string {
  if (!isKnownEvent(event)) {
    throw new AgentLogEventError(
      `unknown agent-log event "${event}" (not in the closed vocabulary). Allowed: ${AGENT_LOG_EVENT_NAMES.join(", ")}`,
    );
  }
  const tmpl = EVENT_TEMPLATES[event].template;
  return tmpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, name: string) => {
    const v = slots[name];
    if (v === undefined || v === null || v === "") {
      throw new AgentLogEventError(`agent-log event "${event}" is missing required slot "${name}"`);
    }
    return String(v);
  });
}
