#!/usr/bin/env node
interface SiblingAc {
    ac_id: string;
    status?: string;
    layer?: string;
    given?: string;
    when?: string;
    then?: string;
    architectural_notes?: string;
}
interface SiblingStory {
    story: string;
    acs: SiblingAc[];
}
interface OpenDecision {
    id: string;
    question?: string;
    decision_status?: string;
    resolved_by_story?: string;
    resolution?: string;
}
interface RequiredField {
    /** The `not_null` persistence-invariant id (e.g. PI2-pick-actor-not-null). */
    invariant_id: string;
    table?: string;
    /** The invariant brief – names the mandated field + why (e.g. "actor is NOT NULL: every pick records who made it"). */
    brief?: string;
}
interface RequiredRequestField {
    /** The endpoint this field is required on (api_contracts[].id, e.g. EP4-adjust-stock-record). */
    contract_id: string;
    /** The required request-field name (e.g. "actor"). */
    field: string;
    /** The story that made it required. A prior writer story of this endpoint whose fixtures don't
     *  yet supply the field must reconcile (the test-side mirror of the not-null field-contract gap). */
    since_story?: string;
    /** Prior writer stories already reconciled (their fixtures supply it) — those still missing are the ones to flag. */
    reconciled_stories?: string[];
}
interface CrossStoryContext {
    current_story: string;
    /** Every OTHER story's ACs in this feature (status carried so the reviewer weighs a
     *  gated/approved sibling AC as a hard constraint). */
    sibling_stories: SiblingStory[];
    /** The architecture's deliberately-unresolved decisions (schema `open_decisions`). */
    open_decisions: OpenDecision[];
    /** The feature's MANDATED fields – the architecture's `not_null` persistence invariants. A field
     *  the schema requires must reach the DB through some story's WRITE path; if that path is a user
     *  submit, the submit's AC must SUPPLY it. Surfaced so the reviewer can catch a story that adds a
     *  required field (e.g. actor NOT NULL) that an earlier user-submit story never supplies – a
     *  field-CONTRACT gap (missing supply), NOT a contradiction, so check #8's opposite-outcome test
     *  misses it (the actor-not-sent defect: a required column with no client path to fill it). */
    required_persistence_fields: RequiredField[];
    /** The feature's newly-required REQUEST fields — api_contracts[].request_fields with required:true +
     *  a since_story. Surfaced so the reviewer catches a prior writer story whose fixtures don't yet
     *  supply a field a later story made required on a shared endpoint (the actor-required-on-EP4 class;
     *  the request-side mirror of required_persistence_fields). */
    required_request_fields: RequiredRequestField[];
}

/** Render the context as a compact, reviewer-friendly summary. */
declare function renderContext(ctx: CrossStoryContext): string;

export { renderContext };
