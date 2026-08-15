import {
  isCoryEngineDuplicate,
  isWorkforceDuplicate,
  isDuplicateTicket,
  clusterOf,
  pickRepresentative,
  buildRepresentativeComment,
  buildDuplicatePointerComment,
  CORY_ENGINE_DUPLICATE_TITLE,
  CORY_ENGINE_DUPLICATE_DESCRIPTION_SUBSTRING,
  WORKFORCE_DUPLICATE_DESCRIPTION,
  type TicketLike,
} from '../openclawDuplicateTicketClusters';

function coryDuplicate(overrides: Partial<TicketLike> = {}): TicketLike {
  return {
    id: 'c-1',
    created_by_id: 'cory-engine',
    title: CORY_ENGINE_DUPLICATE_TITLE,
    description: `**Problem:** ${CORY_ENGINE_DUPLICATE_DESCRIPTION_SUBSTRING}\n**Root Cause:** ...`,
    status: 'todo',
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function workforceDuplicate(overrides: Partial<TicketLike> = {}): TicketLike {
  return {
    id: 'w-1',
    created_by_id: 'workforce_intelligence_engine',
    title: '[Workforce] High error rate detected: 80%',
    description: WORKFORCE_DUPLICATE_DESCRIPTION,
    status: 'backlog',
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('isCoryEngineDuplicate', () => {
  it('happy path: matches the real cory-engine duplicate shape', () => {
    expect(isCoryEngineDuplicate(coryDuplicate())).toBe(true);
  });

  it('excludes a real, different finding under the same created_by_id: a different agent\'s "out of shared memory" error', () => {
    const otherAgent = coryDuplicate({
      description:
        '**Problem:** Agent "PartnershipSuperAgent" is in error state: out of shared memory\n**Root Cause:** ...',
    });
    expect(isCoryEngineDuplicate(otherAgent)).toBe(false);
  });

  it('excludes a real, different finding under the same created_by_id: the update_campaign_config title', () => {
    const campaignFinding = coryDuplicate({
      title: '[Review] update_campaign_config',
      description: '**Problem:** Lead generation dropped 98% in last 48h (6 vs expected 248)\n...',
    });
    expect(isCoryEngineDuplicate(campaignFinding)).toBe(false);
  });

  it('excludes tickets from a different created_by_id even with the exact matching title/description', () => {
    const wrongCreator = coryDuplicate({ created_by_id: 'workforce_intelligence_engine' });
    expect(isCoryEngineDuplicate(wrongCreator)).toBe(false);
  });

  it('boundary: null/empty description does not match, and does not throw', () => {
    expect(isCoryEngineDuplicate(coryDuplicate({ description: null }))).toBe(false);
    expect(isCoryEngineDuplicate(coryDuplicate({ description: '' }))).toBe(false);
  });

  it('boundary: null ticket does not throw', () => {
    expect(isCoryEngineDuplicate(null as unknown as TicketLike)).toBe(false);
  });
});

describe('isWorkforceDuplicate', () => {
  it('happy path: matches the real workforce_intelligence_engine duplicate shape regardless of the varying title percentage', () => {
    expect(isWorkforceDuplicate(workforceDuplicate({ title: '[Workforce] High error rate detected: 43%' }))).toBe(true);
    expect(isWorkforceDuplicate(workforceDuplicate({ title: '[Workforce] High error rate detected: 84%' }))).toBe(true);
  });

  it('excludes a workforce ticket with any different description (a genuinely different finding)', () => {
    const different = workforceDuplicate({ description: 'Review a completely different agent for a completely different reason' });
    expect(isWorkforceDuplicate(different)).toBe(false);
  });

  it('excludes tickets from a different created_by_id even with the exact matching description', () => {
    const wrongCreator = workforceDuplicate({ created_by_id: 'cory-engine' });
    expect(isWorkforceDuplicate(wrongCreator)).toBe(false);
  });

  it('boundary: null description does not match, and does not throw', () => {
    expect(isWorkforceDuplicate(workforceDuplicate({ description: null }))).toBe(false);
  });
});

describe('isDuplicateTicket / clusterOf', () => {
  it('identifies both true clusters and returns the right cluster name', () => {
    expect(isDuplicateTicket(coryDuplicate())).toBe(true);
    expect(clusterOf(coryDuplicate())).toBe('cory-engine');
    expect(isDuplicateTicket(workforceDuplicate())).toBe(true);
    expect(clusterOf(workforceDuplicate())).toBe('workforce_intelligence_engine');
  });

  it('returns false/null for InboxCaseEngine and bpos_orchestrator tickets (explicitly out of scope)', () => {
    const inbox: TicketLike = {
      id: 'i-1', created_by_id: 'InboxCaseEngine', title: 'Case review',
      description: 'A real inbox case', status: 'in_progress', created_at: '2026-08-01T00:00:00.000Z',
    };
    const bpos: TicketLike = {
      id: 'b-1', created_by_id: 'bpos_orchestrator', title: 'Execution task',
      description: 'A real bpos task', status: 'done', created_at: '2026-08-01T00:00:00.000Z',
    };
    expect(isDuplicateTicket(inbox)).toBe(false);
    expect(clusterOf(inbox)).toBeNull();
    expect(isDuplicateTicket(bpos)).toBe(false);
    expect(clusterOf(bpos)).toBeNull();
  });
});

describe('pickRepresentative', () => {
  it('picks the most recently created row', () => {
    const older = coryDuplicate({ id: 'c-old', created_at: '2026-04-05T20:05:01.356Z' });
    const newer = coryDuplicate({ id: 'c-new', created_at: '2026-08-14T16:15:17.378Z' });
    const middle = coryDuplicate({ id: 'c-mid', created_at: '2026-06-01T00:00:00.000Z' });
    expect(pickRepresentative([older, middle, newer]).id).toBe('c-new');
    expect(pickRepresentative([newer, older, middle]).id).toBe('c-new');
  });

  it('boundary: empty array returns null rather than throwing', () => {
    expect(pickRepresentative([])).toBeNull();
  });

  it('boundary: single-row array returns that row', () => {
    const only = coryDuplicate({ id: 'c-only' });
    expect(pickRepresentative([only]).id).toBe('c-only');
  });
});

describe('buildRepresentativeComment', () => {
  it('cites the real fix commit SHAs, PR numbers, and the real duplicate count/date range for cory-engine', () => {
    const comment = buildRepresentativeComment({
      clusterName: 'cory-engine',
      duplicateCount: 2781,
      earliestSeenAt: '2026-04-05T20:05:01.356Z',
      latestSeenAt: '2026-08-14T16:15:17.378Z',
    });
    expect(comment).toContain('6456abb4');
    expect(comment).toContain('#1465');
    expect(comment).toContain('3e95ac8b');
    expect(comment).toContain('#1468');
    expect(comment).toContain('2781');
    expect(comment).toContain('2026-04-05');
    expect(comment).toContain('2026-08-14');
    expect(comment).toContain('OpenclawLearningOptimizationAgent');
  });

  it('cites the real facts for workforce_intelligence_engine with different finding text than cory-engine', () => {
    const comment = buildRepresentativeComment({
      clusterName: 'workforce_intelligence_engine',
      duplicateCount: 438,
      earliestSeenAt: '2026-04-24T14:26:36.132Z',
      latestSeenAt: '2026-08-14T23:00:03.446Z',
    });
    expect(comment).toContain('438');
    expect(comment).toContain('workforce_intelligence_engine');
    expect(comment).toContain('6456abb4');
    expect(comment).toContain('3e95ac8b');
  });

  it('does not fabricate a ticket number (none exist for these rows in production)', () => {
    const comment = buildRepresentativeComment({
      clusterName: 'cory-engine', duplicateCount: 2781,
      earliestSeenAt: '2026-04-05T20:05:01.356Z', latestSeenAt: '2026-08-14T16:15:17.378Z',
    });
    expect(comment).not.toMatch(/TK-\d+|ticket #\d+/i);
  });
});

describe('buildDuplicatePointerComment', () => {
  it('references the representative ticket by its real UUID', () => {
    const comment = buildDuplicatePointerComment('574c2023-d136-4a4d-adca-3332e27e0bbe');
    expect(comment).toContain('574c2023-d136-4a4d-adca-3332e27e0bbe');
    expect(comment.toLowerCase()).toContain('duplicate');
  });
});
