import { mergeEnrichment } from '../enrichmentMerge';
import type { StoryTruthEnrichment } from '../storyEnrichmentContract';
import type { UnderstandingItem } from '../../delivery/projectUnderstanding';

/**
 * The four words the brief uses for this merge, one describe each:
 * additive, deterministic, idempotent, conflict-aware. Plus the line a
 * repository may not cross.
 */

const PROJECT = 'cce94c20-a398-45b3-a6fb-b3fc87b6b1ef';
const NOW = () => '2026-09-11T12:00:00.000Z';

const item = (over: Partial<UnderstandingItem>): UnderstandingItem => ({
  dimension: 'integrations',
  value: 'Reads tickets from the Zendesk API.',
  classification: 'FACT',
  provenance: 'source_message',
  source_quote: 'Reads tickets from the Zendesk API.',
  ...over,
});

const event = (over: Partial<StoryTruthEnrichment> = {}): StoryTruthEnrichment => ({
  schemaVersion: '1',
  projectId: PROJECT,
  storyId: 'STORY-003',
  projectTruthBaseRevision: 1,
  observedAt: NOW(),
  sourceCommitSha: 'abc1234',
  factProposals: [],
  decisions: [],
  limitations: [],
  demonstrationEvidence: [],
  measurementEvents: [],
  ...over,
});

describe('additive', () => {
  it('appends a statement no item makes yet, as repo evidence with its reference', () => {
    const r = mergeEnrichment([item({})], event({
      factProposals: [{ dimension: 'systems', value: 'Runs as a nightly GitHub Action.', evidence: '.github/workflows/nightly.yml', classification: 'FACT' }],
    }), NOW);
    expect(r.changed).toBe(true);
    expect(r.counts).toMatchObject({ added: 1, refused: 0 });
    expect(r.items).toHaveLength(2);
    expect(r.items[1]).toEqual({
      dimension: 'systems', value: 'Runs as a nightly GitHub Action.', classification: 'FACT',
      provenance: 'repo_evidence', source_quote: '.github/workflows/nightly.yml',
    });
  });

  it('never deletes, never reorders what was there', () => {
    const before = [item({ dimension: 'actors', value: 'Priya.' }), item({ dimension: 'systems', value: 'Zendesk.' })];
    const r = mergeEnrichment(before, event({
      factProposals: [{ dimension: 'outputs', value: 'A draft reply per ticket.', evidence: 'src/draft.ts', classification: 'FACT' }],
    }), NOW);
    expect(r.items.slice(0, 2)).toEqual(before);
  });

  it('files a decision and a limitation under constraints, a decision as DECISION', () => {
    const r = mergeEnrichment([], event({
      decisions: [{ statement: 'Poll every 5 minutes.', rationale: 'no webhook access', evidence: 'src/poll.ts' }],
      limitations: [{ statement: 'Attachments over 10MB are skipped.', evidence: 'src/client.ts#L40' }],
    }), NOW);
    expect(r.items).toEqual([
      { dimension: 'constraints', value: 'Poll every 5 minutes. (because no webhook access)', classification: 'DECISION', provenance: 'repo_evidence', source_quote: 'src/poll.ts' },
      { dimension: 'constraints', value: 'Attachments over 10MB are skipped.', classification: 'FACT', provenance: 'repo_evidence', source_quote: 'src/client.ts#L40' },
    ]);
  });

  it('does not turn measurement events or demonstration evidence into truth', () => {
    const r = mergeEnrichment([], event({
      measurementEvents: [{ name: 'tickets_per_run', value: 12, evidence: 'logs/run.json' }],
      demonstrationEvidence: [{ kind: 'test', ref: 'client.test.ts' }],
    }), NOW);
    expect(r.items).toEqual([]);
    expect(r.changed).toBe(false);
  });
});

describe('the line a repository may not cross', () => {
  it('refuses a fact on a business dimension, and reports it rather than softening it', () => {
    const r = mergeEnrichment([], event({
      factProposals: [
        { dimension: 'success_definition', value: 'Zero mismatched payments.', evidence: 'README.md', classification: 'FACT' },
        { dimension: 'desired_outcome', value: 'Fewer complaints.', evidence: 'README.md', classification: 'FACT' },
        { dimension: 'pain_points', value: 'Manual review is slow.', evidence: 'README.md', classification: 'FACT' },
      ],
    }), NOW);
    expect(r.items).toEqual([]);
    expect(r.counts.refused).toBe(3);
    expect(r.refused[0].reason).toMatch(/cannot establish "success_definition"/);
    expect(r.changed).toBe(false);
  });

  it('refuses a proposal the contract would refuse for any other reason, e.g. a fact under unknowns', () => {
    const r = mergeEnrichment([], event({
      factProposals: [{ dimension: 'unknowns', value: 'x', evidence: 'y', classification: 'FACT' }],
    }), NOW);
    expect(r.counts.refused).toBe(1);
  });
});

describe('strengthening', () => {
  it('turns a matching ASSUMPTION into a FACT and keeps the guess in history', () => {
    const guess = item({ dimension: 'systems', value: 'Probably Postgres.', classification: 'ASSUMPTION', provenance: 'ai_inferred', source_quote: undefined });
    const r = mergeEnrichment([guess], event({
      factProposals: [{ dimension: 'systems', value: 'probably postgres.', evidence: 'docker-compose.yml', classification: 'FACT' }],
    }), NOW);
    expect(r.counts).toMatchObject({ strengthened: 1, added: 0 });
    expect(r.items[0]).toMatchObject({
      value: 'Probably Postgres.', classification: 'FACT', provenance: 'repo_evidence', source_quote: 'docker-compose.yml',
    });
    expect(r.items[0].history).toEqual([{
      value: 'Probably Postgres.', classification: 'ASSUMPTION', provenance: 'ai_inferred',
      replaced_at: NOW(), replaced_by: 'repo_evidence',
    }]);
  });

  it('leaves a matching FACT exactly as it was: the first evidence is enough', () => {
    const r = mergeEnrichment([item({})], event({
      factProposals: [{ dimension: 'integrations', value: 'Reads tickets from the Zendesk API.', evidence: 'src/client.ts', classification: 'FACT' }],
    }), NOW);
    expect(r.counts).toMatchObject({ unchanged: 1, added: 0, strengthened: 0 });
    expect(r.items).toEqual([item({})]);
    expect(r.changed).toBe(false);
  });
});

describe('conflict-aware', () => {
  const confirmed = item({ dimension: 'actors', value: 'Priya reviews every draft.', provenance: 'client_confirmed' });

  it('never replaces a confirmed value; it files a question naming both', () => {
    const r = mergeEnrichment([confirmed], event({
      factProposals: [{ dimension: 'actors', value: 'The dispatcher on shift reviews drafts.', evidence: 'src/review.ts', classification: 'FACT' }],
    }), NOW);
    expect(r.items[0]).toEqual(confirmed);
    expect(r.counts.questions).toBe(1);
    expect(r.items[1]).toMatchObject({
      dimension: 'actors', classification: 'QUESTION', provenance: 'repo_evidence', source_quote: 'src/review.ts',
      value: 'STORY-003 found "The dispatcher on shift reviews drafts.", but you confirmed "Priya reviews every draft.". Which is right?',
    });
  });

  it('an unconfirmed disagreement is simply another statement, appended', () => {
    const heard = item({ dimension: 'actors', value: 'Priya reviews every draft.' });
    const r = mergeEnrichment([heard], event({
      factProposals: [{ dimension: 'actors', value: 'The dispatcher reviews drafts.', evidence: 'src/review.ts', classification: 'FACT' }],
    }), NOW);
    expect(r.counts).toMatchObject({ added: 1, questions: 0 });
    expect(r.items).toHaveLength(2);
  });

  it('an ASSUMPTION that disagrees with a confirmed value is appended as an assumption, not asked', () => {
    const r = mergeEnrichment([confirmed], event({
      factProposals: [{ dimension: 'actors', value: 'Maybe the dispatcher too.', evidence: 'src/review.ts', classification: 'ASSUMPTION' }],
    }), NOW);
    expect(r.counts).toMatchObject({ added: 1, questions: 0 });
  });
});

describe('idempotent and deterministic', () => {
  const ev = event({
    factProposals: [
      { dimension: 'systems', value: 'Nightly GitHub Action.', evidence: 'nightly.yml', classification: 'FACT' },
      { dimension: 'actors', value: 'The dispatcher reviews drafts.', evidence: 'src/review.ts', classification: 'FACT' },
    ],
    decisions: [{ statement: 'Poll, do not subscribe.', evidence: 'src/poll.ts' }],
  });
  const start = [item({ dimension: 'actors', value: 'Priya reviews every draft.', provenance: 'client_confirmed' })];

  it('applying the same event twice is the same as once', () => {
    const once = mergeEnrichment(start, ev, NOW);
    const twice = mergeEnrichment(once.items, ev, NOW);
    expect(twice.items).toEqual(once.items);
    expect(twice.changed).toBe(false);
    expect(twice.counts).toMatchObject({ added: 0, questions: 0, unchanged: 3 });
  });

  it('gives the same answer in the same order every time', () => {
    const a = mergeEnrichment(start, ev, NOW);
    const b = mergeEnrichment(start, ev, NOW);
    expect(a).toEqual(b);
  });

  it('does not mutate its input', () => {
    const frozen = JSON.stringify(start);
    mergeEnrichment(start, ev, NOW);
    expect(JSON.stringify(start)).toBe(frozen);
  });
});
