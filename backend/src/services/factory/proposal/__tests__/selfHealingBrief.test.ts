jest.mock('../../../maya/mayaOutboundQueue', () => ({ enqueueOutbound: jest.fn() }));

import { composeSelfHealingBrief, draftSelfHealingBrief, type DefectBrief } from '../selfHealingBrief';
import { enqueueOutbound } from '../../../maya/mayaOutboundQueue';

const mock = <T>(fn: T) => fn as unknown as jest.Mock;

const defect = (over: Partial<DefectBrief> = {}): DefectBrief => ({
  key: 'revise-stalled',
  title: 'The revise loop stalled below target',
  problem: 'The clarity check is at 60 and the reviser cannot raise it on its own.',
  whyItMatters: 'The proposal cannot pass the Gold gate, so it is not submittable before the deadline.',
  fix: 'Rewrite section 3 for clarity, then re-run the checks.',
  whatToDo: 'Approve a human pass on section 3, or confirm we submit at the current score.',
  deliveryProjectId: 'dp-1',
  ...over,
});

describe('composeSelfHealingBrief (M4-T4)', () => {
  it('contains all four sections, each with its content', () => {
    const { subject, body } = composeSelfHealingBrief(defect());
    expect(subject).toContain('The revise loop stalled below target');
    for (const label of ['PROBLEM', 'WHY IT MATTERS', 'THE FIX', 'WHAT TO DO']) {
      expect(body).toContain(label);
    }
    expect(body).toContain('clarity check is at 60');
    expect(body).toContain('Rewrite section 3');
  });

  it('still emits all four sections when a field is missing (never a dropped section)', () => {
    const { body } = composeSelfHealingBrief(defect({ fix: '' }));
    for (const label of ['PROBLEM', 'WHY IT MATTERS', 'THE FIX', 'WHAT TO DO']) {
      expect(body).toContain(label);
    }
    expect(body).toContain('(not specified)');
  });
});

describe('draftSelfHealingBrief (M4-T4)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('enqueues the brief as a DRAFT (pending_approval queue), never sending it', async () => {
    mock(enqueueOutbound).mockResolvedValue({ id: 'q1', idempotencyKey: 'k', deduped: false });
    await draftSelfHealingBrief(defect());
    expect(mock(enqueueOutbound)).toHaveBeenCalledTimes(1);
    const arg = mock(enqueueOutbound).mock.calls[0][0];
    expect(arg.recipientAddress).toBe('ali@colaberry.com');
    expect(arg.channel).toBe('email');
    expect(arg.capability).toBe('gov_proposal_self_healing_brief');
    expect(arg.subject).toContain('The revise loop stalled below target');
    expect(arg.body).toContain('WHAT TO DO');
    // idempotency keyed on project + defect, so the same defect does not pile up drafts
    expect(arg.idempotencyKey).toBe('gov-self-heal:dp-1:revise-stalled');
  });

  it('keys idempotency on "global" when there is no delivery project', async () => {
    mock(enqueueOutbound).mockResolvedValue({ id: 'q2', idempotencyKey: 'k', deduped: false });
    await draftSelfHealingBrief(defect({ deliveryProjectId: null, key: 'boot-fail' }));
    expect(mock(enqueueOutbound).mock.calls[0][0].idempotencyKey).toBe('gov-self-heal:global:boot-fail');
  });
});
