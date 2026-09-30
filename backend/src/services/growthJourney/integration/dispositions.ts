/**
 * The two dispositions that reach the existing systems, and the pipeline stage
 * each may imply (Phase 4 T406). Pure - no runtime import - so the handoff
 * machine can ask the question without loading a writer, and a route test can
 * mock the orchestrator at its boundary alone.
 *
 *   qualified  -> meeting_scheduled   a human has qualified the buyer; a meeting is the next fact
 *   converted  -> proposal_sent       a proposal is a human's fact; `negotiation` and `enrolled` stay admin-only
 */

export const STAGE_BY_DISPOSITION = Object.freeze({
  qualified: 'meeting_scheduled',
  converted: 'proposal_sent',
} as const);

export type IntegratingDisposition = keyof typeof STAGE_BY_DISPOSITION;

export const isIntegratingDisposition = (d: string): d is IntegratingDisposition => Object.prototype.hasOwnProperty.call(STAGE_BY_DISPOSITION, d);
