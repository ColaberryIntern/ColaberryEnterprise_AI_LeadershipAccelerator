/**
 * How much a student may hand the intake as their idea, in characters.
 *
 * ONE number, because four places have to agree on it: the interview-questions
 * route, the preview route, the start route, and the questions prompt that
 * quotes the idea back to the model. They each had their own 20,000, and a
 * scope document a student uploads (L12.2) is routinely longer than that.
 * Raised to 60,000 on 2026-11-19 (Ali): about 18 pages, the same cap the
 * case-study document extractor already uses (MAX_EXTRACT_CHARS).
 *
 * The wizard mirrors this as IDEA_MAX in ProjectWizard.tsx so the limit is met
 * in the box rather than as a refusal after Confirm.
 */
export const INTAKE_IDEA_MAX = 60_000;

/** The most an uploaded scope document may weigh on the wire. */
export const INTAKE_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;
