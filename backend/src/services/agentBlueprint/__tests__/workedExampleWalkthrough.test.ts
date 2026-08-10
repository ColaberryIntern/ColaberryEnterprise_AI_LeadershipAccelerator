/**
 * Reese Phase 3 (Agent Blueprint) — worked-example walkthrough for a hypothetical
 * "CurriculumQA" agent, proving the build-platform-agent skill's PREVIEW mode works
 * end to end with STRUCTURALLY ZERO real writes. Every model call in this file is
 * mocked (jest.mock below) — there is no live DB connection anywhere in this test,
 * so the "0 real writes" claim is true by construction, not by assertion alone.
 *
 * This is the evidence source for
 * .loop-architect/runs/20260810-reese-phase3-agent-blueprint/worked-example-walkthrough.md
 * — every value quoted in that doc is copied verbatim from an assertion in this file,
 * not paraphrased. Re-run this file to reproduce the same output.
 */
jest.mock('../../../models/AdminUser', () => ({ findOrCreate: jest.fn(), findOne: jest.fn() }));
jest.mock('../../../models/Enrollment', () => ({ findOrCreate: jest.fn(), findOne: jest.fn() }));
jest.mock('../../../models/CommunityMember', () => ({ findOrCreate: jest.fn(), findOne: jest.fn() }));
jest.mock('../../../models/AiAgent', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/Cohort', () => ({ findOne: jest.fn() }));
jest.mock('../../learnerContextService', () => ({ getLearnerContextBlock: jest.fn() }));

import AdminUser from '../../../models/AdminUser';
import Enrollment from '../../../models/Enrollment';
import CommunityMember from '../../../models/CommunityMember';
import AiAgent from '../../../models/AiAgent';
import { getLearnerContextBlock } from '../../learnerContextService';
import { previewAgentIdentity, type AgentIdentityConfig } from '../agentIdentitySeed';
import { buildAgentSystemPrompt } from '../agentSystemPrompt';

const mockAiAgentFindOne = AiAgent.findOne as unknown as jest.Mock;
const mockEnrollmentFindOne = Enrollment.findOne as unknown as jest.Mock;
const mockCommunityMemberFindOne = CommunityMember.findOne as unknown as jest.Mock;
const mockAdminUserFindOne = AdminUser.findOne as unknown as jest.Mock;
const mockLearnerContext = getLearnerContextBlock as unknown as jest.Mock;

// The exact config a producer would hand the build-platform-agent skill for
// "CurriculumQA — reviews generated curriculum content for factual/pedagogical
// quality before it reaches students."
export const CURRICULUM_QA_CONFIG: AgentIdentityConfig = {
  agentName: 'CurriculumQA',
  email: 'curriculumqa@colaberry.com',
  displayName: 'CurriculumQA',
  role: 'ai_staff',
  communityRole: 'staff',
  enrollmentDefaults: {
    company: 'Colaberry',
    payment_status: 'paid',
    payment_method: 'invoice',
    payment_mode: 'live',
    enrollment_type: 'standard',
    portal_enabled: false,
  },
};

export const CURRICULUM_QA_PERSONA_BLOCK = `You are CurriculumQA, a review agent that checks generated curriculum content for
factual and pedagogical quality before it reaches students — a careful second set of
eyes on every AI-generated lesson, working from real curriculum blueprints, never from
assumption.

VOICE PRINCIPLES (locked):
- Precise over vague. Cite the exact line, claim, or section under review.
- Never fake confidence — flag uncertainty rather than approve blind.
- Evidence over opinion. A flag without a specific cited reason is not a valid flag.

GUARDRAILS (never do these):
- Never approve content you have not actually checked against its source blueprint.
- No mascot energy, no manufactured urgency.
- Never pretend to be human or hide that you are an AI.
- Neutral pronouns — you are referred to as "they/them," never gendered.`;

beforeEach(() => {
  jest.clearAllMocks();
  // Nothing exists yet for CurriculumQA anywhere in the system — the honest starting
  // state for a genuinely new agent proposal.
  mockAiAgentFindOne.mockResolvedValue(null);
  mockEnrollmentFindOne.mockResolvedValue(null);
  mockCommunityMemberFindOne.mockResolvedValue(null);
  mockAdminUserFindOne.mockResolvedValue(null);
  mockLearnerContext.mockRejectedValue(new Error('no enrollment exists yet for a brand-new agent preview'));
});

describe('Worked example — CurriculumQA identity-seed preview (Artifact 1)', () => {
  it('reports the real preview shape and zero real writes', async () => {
    const preview = await previewAgentIdentity(CURRICULUM_QA_CONFIG);

    expect(preview).toEqual({
      agentName: 'CurriculumQA',
      email: 'curriculumqa@colaberry.com',
      aiAgent: { exists: false, id: null },
      enrollment: { wouldCreate: true, id: null },
      communityMember: { wouldCreate: true, id: null },
      adminUser: { wouldCreate: true, id: null, wouldLinkAgentId: false },
      pilotCohortGate: { requested: false, wouldPopulate: false, existingCohortIds: [] },
    });

    // Structural zero-write proof: previewAgentIdentity()'s own source only ever
    // calls .findOne on every model (verified by direct read of agentIdentitySeed.ts —
    // it does not import findOrCreate/create/update at all in that function), and
    // re-confirmed here at the mock level: even though the mock factories above
    // define findOrCreate (shared with the writing seedAgentIdentity() tests),
    // preview's own real code path never touches it.
    expect((AdminUser as any).findOrCreate).not.toHaveBeenCalled();
    expect((Enrollment as any).findOrCreate).not.toHaveBeenCalled();
    expect((CommunityMember as any).findOrCreate).not.toHaveBeenCalled();
  });
});

describe('Worked example — CurriculumQA draft system prompt (Artifact 2)', () => {
  it('produces a real, persona-only prompt (no learner history exists yet for a brand-new agent)', async () => {
    const prompt = await buildAgentSystemPrompt(CURRICULUM_QA_PERSONA_BLOCK, 'preview-no-such-enrollment', {
      agentLabel: 'curriculumqa',
      closingLine:
        '\nThis is an asynchronous review queue, not a live chat — flag issues with a ' +
        'specific citation, or approve, and move to the next item.',
    });

    expect(prompt).toContain('CurriculumQA');
    expect(prompt).toContain('they/them');
    expect(prompt).toContain('asynchronous review queue');
    // No learner-context block was injected — honest for a brand-new agent with no history.
    expect(prompt).not.toContain('LEARNER PROFILE');

    // eslint-disable-next-line no-console -- deliberate: this is the walkthrough's real captured output
    console.log('WORKED_EXAMPLE_PROMPT_OUTPUT:\n' + prompt);
  });
});
