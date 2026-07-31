import { groupCandidates, deriveCaseTitle, ScoredCandidate } from '../caseGroupingService';
import { RawCandidateItem } from '../sources/caseSourceAdapter';

function candidate(overrides: Partial<RawCandidateItem> & { score?: number }): ScoredCandidate {
  return {
    source_type: 'email',
    source_id: Math.random().toString(36),
    provider: 'gmail_colaberry',
    source_url: null,
    title: 'Untitled',
    occurred_at: new Date('2026-07-01'),
    participants: [],
    subject_normalized: '',
    thread_id: null,
    message_id: null,
    in_reply_to: [],
    basecamp_refs: [],
    attachment_names: [],
    body_excerpt: '',
    snapshot: {},
    score: 0.9,
    reasons: [],
    sourceHash: Math.random().toString(36),
    inclusionStatus: 'INCLUDED',
    ...overrides,
  };
}

describe('groupCandidates — thread/reply-chain merging', () => {
  it('merges two items sharing the same Gmail thread id', () => {
    const a = candidate({ thread_id: 't1' });
    const b = candidate({ thread_id: 't1' });
    const c = candidate({ thread_id: 't2' });
    const groups = groupCandidates([a, b, c]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.length === 2)).toBeDefined();
  });

  it('merges a reply via message_id -> in_reply_to chain', () => {
    const original = candidate({ message_id: '<msg1@x>' });
    const reply = candidate({ in_reply_to: ['<msg1@x>'] });
    const unrelated = candidate({});
    const groups = groupCandidates([original, reply, unrelated]);
    expect(groups).toHaveLength(2);
  });
});

describe('groupCandidates — Basecamp reference merging', () => {
  it('merges two items referencing the same Basecamp recording id', () => {
    const ref = { url: 'https://3.basecamp.com/1/buckets/2/todos/999', accountId: '1', projectId: '2', recordingType: 'todos', recordingId: '999' };
    const a = candidate({ basecamp_refs: [ref] });
    const b = candidate({ basecamp_refs: [ref] });
    const groups = groupCandidates([a, b]);
    expect(groups).toHaveLength(1);
  });
});

describe('groupCandidates — the "avoid combining unrelated conversations" guard', () => {
  it('does NOT merge two items that only share a participant (no thread/subject overlap)', () => {
    const a = candidate({ participants: ['kes@colaberry.com'], subject_normalized: 'invoice question' });
    const b = candidate({ participants: ['kes@colaberry.com'], subject_normalized: 'basecamp assignment update' });
    const groups = groupCandidates([a, b]);
    expect(groups).toHaveLength(2);
  });

  it('does NOT merge two items that only share a normalized subject with no common participant', () => {
    const a = candidate({ subject_normalized: 'ai flotation llc update', participants: ['x@x.com'] });
    const b = candidate({ subject_normalized: 'ai flotation llc update', participants: ['y@y.com'] });
    const groups = groupCandidates([a, b]);
    expect(groups).toHaveLength(2);
  });

  it('DOES merge when both same_normalized_subject AND shared participant are present', () => {
    const a = candidate({ subject_normalized: 'contract renewal', participants: ['kes@colaberry.com'] });
    const b = candidate({ subject_normalized: 'contract renewal', participants: ['kes@colaberry.com', 'ali@colaberry.com'] });
    const groups = groupCandidates([a, b]);
    expect(groups).toHaveLength(1);
  });

  it('seven emails from the same person with three distinct threads produce three cases, not one', () => {
    const items = [
      candidate({ thread_id: 'thread-A', participants: ['kes@colaberry.com'] }),
      candidate({ thread_id: 'thread-A', participants: ['kes@colaberry.com'] }),
      candidate({ thread_id: 'thread-B', participants: ['kes@colaberry.com'] }),
      candidate({ thread_id: 'thread-B', participants: ['kes@colaberry.com'] }),
      candidate({ thread_id: 'thread-B', participants: ['kes@colaberry.com'] }),
      candidate({ thread_id: 'thread-C', participants: ['kes@colaberry.com'] }),
      candidate({ participants: ['kes@colaberry.com'] }), // no thread id — isolated informational email
    ];
    const groups = groupCandidates(items);
    expect(groups).toHaveLength(4); // A, B, C, + the isolated singleton
  });
});

describe('groupCandidates — singleton handling', () => {
  it('an item with no connectors to anything else becomes its own single-item group', () => {
    const isolated = candidate({});
    const groups = groupCandidates([isolated]);
    expect(groups).toEqual([[isolated]]);
  });

  it('an empty candidate list returns no groups', () => {
    expect(groupCandidates([])).toEqual([]);
  });
});

describe('groupCandidates — ordering', () => {
  it('sorts groups by their highest-scoring member, descending', () => {
    const low = candidate({ score: 0.3, thread_id: 'low' });
    const high = candidate({ score: 0.95, thread_id: 'high' });
    const groups = groupCandidates([low, high]);
    expect(groups[0][0].score).toBe(0.95);
  });
});

describe('deriveCaseTitle', () => {
  it('titles the case after the most common normalized subject in the cluster', () => {
    const cluster = [
      candidate({ subject_normalized: 'ai flotation llc invoice' }),
      candidate({ subject_normalized: 'ai flotation llc invoice' }),
      candidate({ subject_normalized: 'different topic' }),
    ];
    expect(deriveCaseTitle(cluster)).toBe('Ai Flotation Llc Invoice');
  });

  it('falls back to the highest-scored item title when no subjects are present', () => {
    const cluster = [candidate({ score: 0.5, title: 'Low score item' }), candidate({ score: 0.9, title: 'High score item' })];
    expect(deriveCaseTitle(cluster)).toBe('High score item');
  });
});
