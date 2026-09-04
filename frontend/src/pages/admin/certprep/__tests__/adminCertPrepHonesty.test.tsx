/**
 * Cert Prep admin surface — the claims that are product requirements, not styling.
 *
 * The student page has its own honesty test; this is the instructor half, and
 * the failures it guards against are different in kind. Here the risk is not
 * telling a student something untrue, it is letting an instructor believe a
 * decision was made by a person when it was made by a script, or believe a
 * statistic means something when it was computed from three answers, or approve
 * forty questions in one gesture and call that review.
 *
 * Uses the `renderToStaticMarkup` pattern already proven in
 * pages/portal/certprep/__tests__/certPrepHonesty.test.tsx — these are "does the
 * output contain this claim" assertions, which need no DOM harness. Components
 * that fetch on mount are given their data as props (the panels were factored so
 * the reviewable pieces take props), so nothing here depends on effects running.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CertBankPanel from '../CertBankPanel';
import { QuestionCard, isFixtureReviewer } from '../CertReviewPanel';
import { EvidenceRow } from '../CertEvidenceReviewPanel';
import { bankTrust } from '../AdminCertPrepPage';
import { sortForTriage } from '../CertCohortPanel';
import type { BankHealth, QuestionRevision, EvidenceMapping, CohortReadinessRow } from '../../../../services/certPrepAdminApi';

const noop = () => undefined;

const health = (over: Partial<BankHealth> = {}): BankHealth => ({
  blueprint_version: '1.0-2026-07',
  total_questions: 20,
  by_status: { approved: 18, draft: 2 },
  approved_by_domain: { D1: 5, D2: 3, D3: 4, D4: 4, D5: 2 },
  domains_with_no_approved: [],
  ...over,
});

const revision = (over: Partial<QuestionRevision> = {}): QuestionRevision => ({
  question_key: 'CCARF-A1',
  revision: 1,
  domain_id: 'D1',
  objective_id: 'D1.2',
  blueprint_version: '1.0-2026-07',
  difficulty: 'medium',
  stem: 'Why isolate a subagent context?',
  options: [{ key: 'A', text: 'To save tokens' }, { key: 'B', text: 'To bound what it can read' }],
  correct_keys: ['B'],
  rationale: 'Isolation is about blast radius, not cost.',
  distractor_rationales: { A: 'Cost is a side effect, not the reason.' },
  review_status: 'draft',
  reviewer: null,
  reviewed_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  ...over,
});

const mapping = (over: Partial<EvidenceMapping> = {}): EvidenceMapping => ({
  id: 'm1',
  enrollment_id: 'e1',
  track_id: 'ccar-f',
  blueprint_version: '1.0-2026-07',
  domain_id: 'D2',
  objective_id: 'D2.1',
  source_type: 'portfolio_artifact',
  source_id: 'artifact-9',
  mapping_state: 'pending',
  mapping_rationale: 'An MCP server the student built and shipped.',
  auto_matched: true,
  verified_by: null,
  verified_at: null,
  rejected_reason: null,
  created_at: '2026-09-01T00:00:00.000Z',
  ...over,
});

const readinessRow = (over: Partial<CohortReadinessRow> = {}): CohortReadinessRow => ({
  enrollment_id: 'e1', full_name: 'A Student', email: 'a@example.com',
  overall_state: 'building', overall_scaled: 600, knowledge_scaled: 640,
  sample_confidence: 0.8, evidence_coverage_pct: 20, answered_total: 30,
  computed_at: '2026-09-01T00:00:00.000Z',
  ...over,
});

// ── the review gate ──────────────────────────────────────────────────────────

describe('review queue', () => {
  const card = (q: QuestionRevision) => renderToStaticMarkup(<QuestionCard q={q} onMoved={noop} />);

  it('shows the answer key — reviewing a question means reading it', () => {
    // The one Cert Prep surface where answer data is intentional. If this ever
    // starts hiding the key, the gate has become a rubber stamp.
    const html = card(revision());
    expect(html).toContain('To bound what it can read');
    expect(html).toContain('Isolation is about blast radius');
  });

  it('has NO reviewer input — the server stamps the authenticated admin', () => {
    const html = card(revision());
    expect(html).not.toMatch(/name="reviewer"/);
    expect(html).not.toMatch(/<input[^>]*reviewer/i);
  });

  it('has NO bulk-select control — one question, one decision', () => {
    const html = card(revision());
    expect(html).not.toContain('type="checkbox"');
    expect(html.toLowerCase()).not.toContain('select all');
  });

  it('offers exactly one Approve action per revision', () => {
    const matches = card(revision()).match(/>Approve</g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('does not offer to approve something already approved', () => {
    expect(card(revision({ review_status: 'approved', reviewer: 'kes@colaberry.com' }))).not.toContain('>Approve<');
  });

  it('CALLS OUT a fixture approval rather than presenting it as review', () => {
    // The 20 seeded items were approved by a script in a scratch database. A row
    // that says "approved" without saying by what is the exact false comfort
    // this warning exists to remove.
    const html = card(revision({ review_status: 'approved', reviewer: 'dev-fixture@colaberry.test' }));
    expect(html).toContain('no human has read this item');
  });

  it('a real reviewer is shown plainly, with no warning', () => {
    const html = card(revision({ review_status: 'approved', reviewer: 'kes@colaberry.com', reviewed_at: '2026-09-02T00:00:00.000Z' }));
    expect(html).toContain('kes@colaberry.com');
    expect(html).not.toContain('no human has read this item');
  });
});

describe('isFixtureReviewer', () => {
  it.each(['dev-fixture@colaberry.test', 'seed@x.invalid', 'BOT@Y.LOCAL'])('flags %s as a script', (r) => {
    expect(isFixtureReviewer(r)).toBe(true);
  });
  it.each(['kes@colaberry.com', 'farhat@colaberry.com'])('leaves %s alone', (r) => {
    expect(isFixtureReviewer(r)).toBe(false);
  });
  it('boundary: null reviewer is not a fixture, it is simply unreviewed', () => {
    expect(isFixtureReviewer(null)).toBe(false);
    expect(isFixtureReviewer(undefined)).toBe(false);
  });
});

// ── evidence ─────────────────────────────────────────────────────────────────

describe('evidence review', () => {
  const row = (m: EvidenceMapping) => renderToStaticMarkup(<EvidenceRow m={m} onDecided={noop} />);

  it("shows the matcher's rationale — the reviewer is agreeing with a claim, not guessing", () => {
    expect(row(mapping())).toContain('An MCP server the student built and shipped.');
  });

  it('asks for a reason, because a rejection with none cannot answer "why not?"', () => {
    expect(row(mapping())).toContain('required to reject');
  });

  it('offers both decisions — verifying everything is not review either', () => {
    const html = row(mapping());
    expect(html).toContain('>Verify<');
    expect(html).toContain('>Reject<');
  });
});

// ── numbers that must not be invented ────────────────────────────────────────

describe('bank panel', () => {
  it('names the domains that cannot fill a form slot, and says what that causes', () => {
    const html = renderToStaticMarkup(<CertBankPanel health={health({ domains_with_no_approved: ['D5'] })} />);
    expect(html).toContain('No approved items in D5');
    expect(html).toContain('shorter');
  });

  it('says nothing about unfilled domains when every domain is covered', () => {
    expect(renderToStaticMarkup(<CertBankPanel health={health()} />)).not.toContain('No approved items in');
  });

  it('an empty statistics table reads as absence, not as zeroes', () => {
    // Effects do not run under static rendering, so this is the pre-fetch state —
    // which is exactly the state that must not display a fabricated table.
    const html = renderToStaticMarkup(<CertBankPanel health={health()} />);
    expect(html).not.toContain('0.00');
  });
});

describe('bankTrust', () => {
  it('is verified only when every domain has approved items', () => {
    expect(bankTrust(health(), false).level).toBe('verified');
  });

  it('goes STALE when a domain has nothing approved — the score means less than it looks', () => {
    const t = bankTrust(health({ domains_with_no_approved: ['D5'] }), false);
    expect(t.level).toBe('stale');
    expect(t.summary).toContain('cannot be filled');
  });

  it('is unverified when nothing is approved at all', () => {
    expect(bankTrust(health({ by_status: { draft: 20 } }), false).level).toBe('unverified');
  });

  it('is an error when health could not be loaded — not a silent green badge', () => {
    expect(bankTrust(null, true).level).toBe('error');
  });
});

describe('cohort triage order', () => {
  it('puts never-measured students FIRST — they are the ones to talk to', () => {
    const rows = [
      readinessRow({ enrollment_id: 'a', overall_state: 'sustained', full_name: 'Ada' }),
      readinessRow({ enrollment_id: 'b', overall_state: 'not_measured', overall_scaled: null, full_name: 'Bo' }),
      readinessRow({ enrollment_id: 'c', overall_state: 'building', full_name: 'Cy' }),
    ];
    expect(sortForTriage(rows).map((r) => r.enrollment_id)).toEqual(['b', 'c', 'a']);
  });

  it('does not rank by score inside a state — this is triage, not a leaderboard', () => {
    const rows = [
      readinessRow({ enrollment_id: 'z', full_name: 'Zoe', overall_scaled: 900 }),
      readinessRow({ enrollment_id: 'a', full_name: 'Abe', overall_scaled: 300 }),
    ];
    expect(sortForTriage(rows).map((r) => r.enrollment_id)).toEqual(['a', 'z']);
  });

  it('boundary: an empty cohort sorts to an empty list rather than throwing', () => {
    expect(sortForTriage([])).toEqual([]);
  });
});
