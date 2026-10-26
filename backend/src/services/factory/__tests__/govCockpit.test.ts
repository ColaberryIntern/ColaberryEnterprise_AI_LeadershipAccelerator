/**
 * govCockpit — the pure read-model helpers behind the Build Cockpit. The load-bearing rail under test: a COMMIT
 * NEVER VERIFIES. deriveBuildStoryStage reaches `done` only from reviewer-`verified` evidence, `matched` from any
 * submitted evidence, never from a commit's mere presence. The feed carries public commit facts and no identity;
 * the provenance reader carries only the agency + key dates, never the dossier's contacts.
 */
import { deriveBuildStoryStage, deriveProposalStage, toCommitFeed, readGovProvenanceFacts } from '../govCockpit';
import type { EvidenceView } from '../govBuildEvidence';

const ev = (over: Partial<EvidenceView> = {}): EvidenceView => ({
  id: 'ev', storyId: 'STORY-R1', canonicalReqId: 'R1', description: 'work', artifactRef: null,
  status: 'submitted', submittedAt: '2026-10-09T00:00:00.000Z', source: 'student', commitSha: null, ...over,
});

describe('deriveBuildStoryStage — evidence wins, and a commit never self-verifies', () => {
  it('verified evidence ⇒ done (even alongside submitted rows)', () => {
    expect(deriveBuildStoryStage({ assigned: true, evidence: [ev({ status: 'submitted' }), ev({ status: 'verified' })] })).toBe('done');
  });
  it('any submitted evidence (no verified) ⇒ matched — a claim awaiting review, NOT done', () => {
    expect(deriveBuildStoryStage({ assigned: true, evidence: [ev({ status: 'submitted', source: 'github_push', commitSha: 'a' })] })).toBe('matched');
  });
  it('assigned with no evidence ⇒ build; unassigned with no evidence ⇒ todo', () => {
    expect(deriveBuildStoryStage({ assigned: true, evidence: [] })).toBe('build');
    expect(deriveBuildStoryStage({ assigned: false, evidence: [] })).toBe('todo');
  });
  it('a rejected-only story falls back by presence: it is still `matched` (evidence exists, none verified)', () => {
    expect(deriveBuildStoryStage({ assigned: true, evidence: [ev({ status: 'rejected' })] })).toBe('matched');
  });
  it('is total on garbage', () => {
    expect(deriveBuildStoryStage({ assigned: false, evidence: null as any })).toBe('todo');
  });
});

describe('deriveProposalStage — approval closes it; there is no `matched`', () => {
  it('approved ⇒ done, unanswered ⇒ todo, anything mid-flight ⇒ build', () => {
    expect(deriveProposalStage({ status: 'approved', approved: true })).toBe('done');
    expect(deriveProposalStage({ status: 'unanswered', approved: false })).toBe('todo');
    expect(deriveProposalStage({ status: 'draft', approved: false })).toBe('build');
    expect(deriveProposalStage({ status: 'revision_required', approved: false })).toBe('build');
  });
  it('approved flag wins even if status text disagrees; total on garbage', () => {
    expect(deriveProposalStage({ status: 'draft', approved: true })).toBe('done');
    expect(deriveProposalStage({} as any)).toBe('todo');
  });
});

describe('toCommitFeed — only github_push rows with a sha, newest-first order preserved, no identity', () => {
  it('keeps pushes (with sha), drops manual hand-ins and push rows missing a sha', () => {
    const feed = toCommitFeed([
      ev({ id: '1', source: 'github_push', commitSha: 'aaa', canonicalReqId: 'R1', description: 'feat R1', status: 'verified', submittedAt: '2026-10-10T00:00:00.000Z' }),
      ev({ id: '2', source: 'student', commitSha: null, description: 'manual hand-in' }),
      ev({ id: '3', source: 'github_push', commitSha: null, description: 'push without a sha' }),
      ev({ id: '4', source: 'github_push', commitSha: 'bbb', canonicalReqId: 'R2', description: 'feat R2', status: 'submitted', submittedAt: '2026-10-09T00:00:00.000Z' }),
    ]);
    expect(feed).toEqual([
      { sha: 'aaa', message: 'feat R1', storyKey: 'R1', at: '2026-10-10T00:00:00.000Z', verified: true },
      { sha: 'bbb', message: 'feat R2', storyKey: 'R2', at: '2026-10-09T00:00:00.000Z', verified: false },
    ]);
    // no identity field carried
    expect(JSON.stringify(feed)).not.toContain('submitted_by');
  });
  it('is total on garbage', () => {
    expect(toCommitFeed(undefined)).toEqual([]);
    expect(toCommitFeed([null as any])).toEqual([]);
  });
});

describe('readGovProvenanceFacts — agency + key dates only, defensive on free-form JSON', () => {
  it('reads agency from provenance and key dates from the dossier, and carries NEITHER contacts nor internals', () => {
    const facts = readGovProvenanceFacts({
      provenance: { agency: '  TDCJ Office of Inspector General  ', uuid: 'x' },
      dossier: { keyDates: [{ date: '2026-11-01', text: 'Proposals due' }, { nonsense: true }], contacts: [{ email: 'phishing@irs.gov' }], evaluation: { secret: 1 } },
    });
    expect(facts.agency).toBe('TDCJ Office of Inspector General'); // trimmed
    expect(facts.keyDates).toEqual([{ date: '2026-11-01', text: 'Proposals due' }]); // the undated junk row is dropped
    expect(JSON.stringify(facts)).not.toContain('phishing@irs.gov');
    expect(JSON.stringify(facts)).not.toContain('secret');
  });
  it('falls back to dossier.opportunity.agency, and is total on missing/garbage shapes', () => {
    expect(readGovProvenanceFacts({ dossier: { opportunity: { agency: 'Fallback Agency' } } }).agency).toBe('Fallback Agency');
    expect(readGovProvenanceFacts(null)).toEqual({ agency: null, keyDates: [] });
    expect(readGovProvenanceFacts({ provenance: { agency: '   ' } })).toEqual({ agency: null, keyDates: [] });
  });
});
