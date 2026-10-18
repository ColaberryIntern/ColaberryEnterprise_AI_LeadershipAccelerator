import { proposalPermissionsFor, toSharedProposalView } from '../govProposalShare';

const slots = [
  { requirementId: 'R1', statement: 'Describe your delivery team.', status: 'draft', content: 'Our team has...',
    gaps: [{ id: 'g1', question: 'Who led the Dallas project?', suggestions: ['Jane Doe'], resolution: 'open', answer: 'SECRET-ANSWER' }],
    authoredByIdentityId: 'admin-SECRET', reviewedByIdentityId: 'rev-SECRET' },
  { requirementId: 'RP', statement: 'Total not to exceed $4,200,000.', status: 'approved', content: '$4,200,000', gaps: [] },
];
const established = [
  { id: 'R1', text: 'Describe your delivery team.', kind: 'technical' },
  { id: 'RP', text: 'Total not to exceed.', kind: 'pricing' },
];

describe('proposalPermissionsFor', () => {
  it('is monotonic: none < view < comment < edit', () => {
    expect(proposalPermissionsFor('none')).toEqual({ read: false, comment: false, edit: false });
    expect(proposalPermissionsFor('view')).toEqual({ read: true, comment: false, edit: false });
    expect(proposalPermissionsFor('comment')).toEqual({ read: true, comment: true, edit: false });
    expect(proposalPermissionsFor('edit')).toEqual({ read: true, comment: true, edit: true });
  });
});

describe('toSharedProposalView (the trust boundary)', () => {
  it('none: shows nothing', () => {
    const v = toSharedProposalView(slots, established, 'none');
    expect(v.responses).toEqual([]);
    expect(v.canComment).toBe(false);
  });

  it('view: shows the non-pricing response read-only, with NO pricing, NO identities, NO gaps', () => {
    const v = toSharedProposalView(slots, established, 'view');
    expect(v.responses.map((r) => r.requirementId)).toEqual(['R1']); // RP (pricing) dropped
    const blob = JSON.stringify(v);
    expect(blob).not.toContain('4,200,000');     // pricing figure never reaches the member
    expect(blob).not.toContain('admin-SECRET');  // author identity never leaks
    expect(blob).not.toContain('rev-SECRET');     // reviewer identity never leaks
    expect(v.responses[0].gaps).toBeUndefined();  // a view-level member does not see gaps
    expect(v.responses[0].openGapCount).toBe(1);  // but does see that one item still needs input
  });

  it('comment/edit: shows gap QUESTIONS but never the stored answer', () => {
    const v = toSharedProposalView(slots, established, 'comment');
    expect(v.canComment).toBe(true);
    expect(v.responses[0].gaps).toHaveLength(1);
    expect(v.responses[0].gaps![0].question).toBe('Who led the Dallas project?');
    expect(JSON.stringify(v)).not.toContain('SECRET-ANSWER'); // the gap's own answer is never shared
    expect(toSharedProposalView(slots, established, 'edit').canEdit).toBe(true);
  });

  it('is total on garbage', () => {
    expect(toSharedProposalView(undefined as any, undefined as any, 'view').responses).toEqual([]);
  });
});
