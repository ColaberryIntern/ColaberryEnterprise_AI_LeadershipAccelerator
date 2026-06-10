const {
  isApprovalTodo,
  approvalArtifactStatus,
  approvalAwaitingDeliverable,
  extractArtifactUrl,
  APPROVAL_LIST_NAME,
} = require('../approvalArtifactLink');

describe('approvalArtifactLink', () => {
  const visualsTodo = {
    id: 1,
    content: 'Review and approve Curriculum design visuals',
    description: '<div>HUMAN TASK ... Deliverable: Approved Curriculum design visuals</div>',
    tier: 'HUMAN',
  };

  describe('isApprovalTodo', () => {
    test('true for a todo in the Approval Queues list', () => {
      expect(isApprovalTodo({ content: 'Anything', tier: 'HUMAN' }, APPROVAL_LIST_NAME)).toBe(true);
    });
    test('true for an approval-titled todo outside the list', () => {
      expect(isApprovalTodo(visualsTodo, 'Curriculum')).toBe(true);
    });
    test('false for a normal task outside the list', () => {
      expect(isApprovalTodo({ content: 'Build the pricing page', tier: 'HUMAN' }, 'Marketing')).toBe(false);
    });
    test('AI-tier todo in the list is not a human approval gate', () => {
      expect(isApprovalTodo({ content: 'x', tier: 'AI' }, APPROVAL_LIST_NAME)).toBe(false);
    });
    test('absent tier (raw audit todo) does not disqualify', () => {
      expect(isApprovalTodo({ content: 'Approve brand kit' }, 'Marketing')).toBe(true);
    });
  });

  describe('approvalArtifactStatus', () => {
    test('awaiting when no marker present', () => {
      expect(approvalArtifactStatus(visualsTodo)).toBe('awaiting');
    });
    test('ready with the machine marker', () => {
      const t = { description: 'body <!-- artifact:ready url=https://x/y.png --> more' };
      expect(approvalArtifactStatus(t)).toBe('ready');
    });
    test('ready with the human-readable phrase', () => {
      expect(approvalArtifactStatus({ description: 'Artifact ready for review: see link' })).toBe('ready');
    });
    test('brief upload links alone do NOT count as ready', () => {
      const t = { description: 'Briefs: <a href="https://app.basecamp.com/x/uploads/9">brief</a>' };
      expect(approvalArtifactStatus(t)).toBe('awaiting');
    });
  });

  describe('extractArtifactUrl', () => {
    test('pulls the url out of the machine marker', () => {
      expect(extractArtifactUrl('<!-- artifact:ready url=https://drive/abc -->')).toBe('https://drive/abc');
    });
    test('null when no marker', () => {
      expect(extractArtifactUrl('no marker here')).toBeNull();
    });
  });

  describe('approvalAwaitingDeliverable (the gate predicate)', () => {
    test('holds the curriculum-visuals approval (no artifact wired)', () => {
      expect(approvalAwaitingDeliverable(visualsTodo, 'Approval Queues')).toBe(true);
    });
    test('does NOT hold once the artifact marker lands', () => {
      const ready = { ...visualsTodo, description: visualsTodo.description + ' <!-- artifact:ready url=https://x -->' };
      expect(approvalAwaitingDeliverable(ready, 'Approval Queues')).toBe(false);
    });
    test('never holds a non-approval task', () => {
      expect(approvalAwaitingDeliverable({ content: 'Ship website', tier: 'HUMAN' }, 'Marketing')).toBe(false);
    });
  });
});
