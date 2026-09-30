/**
 * One worked sample contract project — a government RFP-response tool — as a typed
 * FactoryProject the whole Phase-1 contract is exercised against. Deterministic (no randomness),
 * so building it twice is identical; factoryValidate() returns zero errors on it. This is the
 * data half of Phase 1's exit; the seed script persists it and the render script shows it.
 *
 * It deliberately includes the hard cases: an AGENT performer with a human ACCOUNTABLE (the
 * OVERSIGHT rule), a DECISION with two labeled outcomes, evidence-cited tasks (SOURCE_COVERAGE),
 * both tracks (proposal + solution_build), and a human/AI allocation with an old→new role map.
 */
import type { FactoryProject } from '../contracts/factoryContract';
import { factoryId } from '../factoryIds';

const DELIVERY_PROJECT_ID = factoryId('delivery_project', ['sample', 'ai-government-contract-finder']);
const STUDENT_PROJECT_ID = factoryId('student_project', ['sample', 'ai-government-contract-finder']);

export function buildSampleContractProject(): FactoryProject {
  return {
    delivery_project_id: DELIVERY_PROJECT_ID,
    tracks: [
      { id: factoryId('track', [DELIVERY_PROJECT_ID, 'proposal']), delivery_project_id: DELIVERY_PROJECT_ID, track_type: 'proposal', status: 'in_progress', owner_identity_id: 'person.proposal_lead', solution_student_project_id: null },
      { id: factoryId('track', [DELIVERY_PROJECT_ID, 'solution_build']), delivery_project_id: DELIVERY_PROJECT_ID, track_type: 'solution_build', status: 'in_progress', owner_identity_id: 'person.analyst', solution_student_project_id: STUDENT_PROJECT_ID },
    ],
    source_blocks: [
      { id: 'blk-1', locator: 'L.3.1', text: 'The system shall extract requirements from a solicitation document.', kind: 'requirement' },
      { id: 'blk-2', locator: 'L.3.2', text: 'The system shall classify each requirement as technical or administrative.', kind: 'requirement' },
      { id: 'blk-3', locator: 'L.3.3', text: 'Administrative requirements shall be mapped to proposal sections.', kind: 'requirement' },
      { id: 'blk-4', locator: 'L.3.4', text: 'Technical requirements shall be mapped to build stories.', kind: 'requirement' },
      { id: 'blk-ctx', locator: 'A.1', text: 'The contract is a tool that helps a small business respond to government RFPs.', kind: 'context' },
    ],
    requirements: [
      { id: 'REQ-1', statement: 'Extract requirements from a solicitation', kind: 'technical', priority: 'must', tracks: ['solution_build'], source_document: 'RFP-SAMPLE-01', amendment_version: '0', section: 'L.3.1', extracted_text: 'shall extract requirements', interpretation: 'Parse the RFP into addressable requirement blocks.', human_confirmed: true, evidence_state: 'planned', source_evidence: ['blk-1'] },
      { id: 'REQ-2', statement: 'Classify each requirement', kind: 'technical', priority: 'must', tracks: ['solution_build'], source_document: 'RFP-SAMPLE-01', amendment_version: '0', section: 'L.3.2', extracted_text: 'shall classify', interpretation: 'Technical vs administrative, with a reason.', human_confirmed: true, evidence_state: 'planned', source_evidence: ['blk-2'] },
      { id: 'REQ-3', statement: 'Map administrative requirements to proposal sections', kind: 'administrative', priority: 'should', tracks: ['proposal'], source_document: 'RFP-SAMPLE-01', amendment_version: '0', section: 'L.3.3', extracted_text: 'mapped to proposal sections', interpretation: 'Traceability on the proposal side.', human_confirmed: true, evidence_state: 'planned', source_evidence: ['blk-3'] },
      { id: 'REQ-4', statement: 'Map technical requirements to build stories', kind: 'technical', priority: 'must', tracks: ['solution_build'], source_document: 'RFP-SAMPLE-01', amendment_version: '0', section: 'L.3.4', extracted_text: 'mapped to build stories', interpretation: 'Traceability on the build side.', human_confirmed: true, evidence_state: 'planned', source_evidence: ['blk-4'] },
    ],
    processes: [
      { id: 'PROC-1', business_outcome: 'A traceable compliance matrix is produced from a solicitation.', success_criterion: 'Every requirement is classified and mapped to a proposal section or a build story.', trigger: 'A new solicitation document is uploaded.', inputs: ['solicitation document'], outputs: ['compliance matrix'], decision_branches: ['technical vs administrative'], future_owner_role_id: 'role-analyst', exceptions: ['an ambiguous requirement is flagged for a human'] },
    ],
    tasks: [
      task('t-start', 'START', 's0', 'Solicitation received', [], 'EXPLICIT'),
      task('t-extract', 'TASK', 's1', 'Extract requirements from the solicitation', ['blk-1'], 'LLM', { judgment_level: 'medium', decision_authority: 'recommend', data_sensitivity: 'confidential', effort_minutes: 30, effort_basis: 'ESTIMATED', confidence: 0.72, required_skills: ['skill.requirements_analysis'] }),
      task('t-classify', 'DECISION', 's2', 'Classify each requirement as technical or administrative', ['blk-2'], 'LLM', { judgment_level: 'high', decision_authority: 'recommend', data_sensitivity: 'confidential', confidence: 0.68, required_skills: ['skill.compliance'] }),
      task('t-route-admin', 'TASK', 's3', 'Map administrative requirements to proposal sections', ['blk-3'], 'INFERRED', { judgment_level: 'medium', decision_authority: 'decide_bounded', data_sensitivity: 'internal' }),
      task('t-route-tech', 'TASK', 's3', 'Map technical requirements to build stories', ['blk-4'], 'INFERRED', { judgment_level: 'medium', decision_authority: 'decide_bounded', data_sensitivity: 'internal' }),
      task('t-end', 'END', 's4', 'Compliance matrix complete', [], 'EXPLICIT'),
    ],
    roles: [
      { id: 'role-analyst', name: 'Compliance Analyst', definition: 'Owns the compliance matrix and confirms ambiguous requirements.' },
      { id: 'role-extract-agent', name: 'Requirement Extraction Agent', definition: 'AI employee that extracts and classifies requirements from the solicitation.' },
      { id: 'role-proposal-lead', name: 'Proposal Lead', definition: 'Owns the proposal-side mapping and submission readiness.' },
    ],
    assignments: [
      // t-extract: an AGENT performs, a HUMAN is accountable (OVERSIGHT).
      asg('t-extract', 'role-extract-agent', 'PERFORMER', { type: 'agent', id: 'agent.extract' }, 30, 'ESTIMATED'),
      asg('t-extract', 'role-analyst', 'ACCOUNTABLE', { type: 'person', id: 'person.analyst' }),
      // t-classify: same shape — agent performs, human accountable.
      asg('t-classify', 'role-extract-agent', 'PERFORMER', { type: 'agent', id: 'agent.extract' }),
      asg('t-classify', 'role-analyst', 'ACCOUNTABLE', { type: 'person', id: 'person.analyst' }),
      // routing tasks: humans perform.
      asg('t-route-admin', 'role-proposal-lead', 'PERFORMER', { type: 'person', id: 'person.proposal' }),
      asg('t-route-tech', 'role-analyst', 'PERFORMER', { type: 'person', id: 'person.analyst' }),
    ],
    transitions: [
      edge('t-start', 't-extract'),
      edge('t-extract', 't-classify'),
      edge('t-classify', 't-route-admin', 'administrative'),
      edge('t-classify', 't-route-tech', 'technical'),
      edge('t-route-admin', 't-end'),
      edge('t-route-tech', 't-end'),
    ],
    allocation: [
      { task_id: 't-extract', execution_class: 'ai_with_approval', rationale: 'Extraction is pattern work the agent drafts; a human confirms before it counts.', accountable_role_id: 'role-analyst' },
      { task_id: 't-classify', execution_class: 'ai_with_approval', rationale: 'Classification needs judgment on ambiguous items, so a human is accountable.', accountable_role_id: 'role-analyst' },
      { task_id: 't-route-admin', execution_class: 'human', rationale: 'Proposal-side mapping is owned by the Proposal Lead.', accountable_role_id: 'role-proposal-lead' },
      { task_id: 't-route-tech', execution_class: 'human', rationale: 'Build-side mapping is owned by the Compliance Analyst.', accountable_role_id: 'role-analyst' },
    ],
    role_map: [
      { previous_function: 'Manual compliance reviewer', ai_contribution: 'Extracts and classifies requirements from the solicitation', new_role_id: 'role-analyst', retained_responsibilities: ['confirm ambiguous requirements', 'approve the compliance matrix'] },
    ],
  };
}

export const SAMPLE_DELIVERY_PROJECT_ID = DELIVERY_PROJECT_ID;
export const SAMPLE_STUDENT_PROJECT_ID = STUDENT_PROJECT_ID;

// ── local builders (keep the fixture readable) ──
type T = FactoryProject['tasks'][number];
function task(id: string, kind: T['kind'], stage_id: string, title: string, source_evidence: string[], method: T['method'], over: Partial<T> = {}): T {
  return {
    id, process_id: 'PROC-1', title, description: title, kind, stage_id, source_evidence,
    required_skills: [], judgment_level: 'low', decision_authority: 'none', data_sensitivity: 'internal',
    interaction_pattern: null, frequency: 'per solicitation', effort_minutes: null, effort_basis: 'UNKNOWN',
    confidence: null, method, ...over,
  };
}
type A = FactoryProject['assignments'][number];
function asg(task_id: string, role_id: string, responsibility: A['responsibility'], executor: A['executor'], minutes: number | null = null, basis: A['basis'] = 'UNKNOWN'): A {
  return { id: factoryId('assignment', [task_id, role_id, responsibility]), task_id, role_id, responsibility, executor, minutes, basis, evidence_note: null };
}
type E = FactoryProject['transitions'][number];
function edge(from_task_id: string, to_task_id: string, condition: string | null = null): E {
  return { id: factoryId('edge', [from_task_id, to_task_id, condition ?? '']), from_task_id, to_task_id, condition, is_rework: false };
}
