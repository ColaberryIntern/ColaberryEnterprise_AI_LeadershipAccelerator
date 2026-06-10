/**
 * Opportunity Scoring Engine tests (Missed Opportunities Report).
 *
 * The score must be deterministic and fully explainable, so these tests pin
 * the factor contributions, the 0-100 clamp, band thresholds, idempotency
 * (same input => same output), and the failure path (empty email).
 *
 * scoreEmail / extractTopics are pure (no DB), so we feed synthetic rows and
 * a hand-built corpus directly — no database coupling.
 */
import { scoreEmail, extractTopics } from '../opportunityScoringService';

// Minimal corpus matching the PositiveCorpus shape used by scoreEmail.
function mkCorpus(overrides: Partial<Record<string, Set<string>>> = {}) {
  return {
    vipSenders: new Set<string>(),
    repliedSenders: new Set<string>(),
    repliedDomains: new Set<string>(),
    rescuedSenders: new Set<string>(),
    feedbackSenders: new Set<string>(),
    prefSenders: new Set<string>(),
    prefDomains: new Set<string>(),
    prefTopics: new Set<string>(),
    ...overrides,
  } as any;
}

function mkRow(overrides: Partial<any> = {}) {
  return {
    id: 'e1',
    from_address: 'someone@acme.com',
    from_name: 'Someone',
    subject: 'Hello there',
    body_text: 'Just checking in.',
    headers: {},
    to_addresses: [{ email: 'ali@colaberry.com' }],
    state: 'SILENT_HOLD',
    confidence: 80,
    reasoning: 'routine',
    ...overrides,
  };
}

describe('scoreEmail — factor contributions', () => {
  it('happy path: VIP + replied + contract keyword scores high', () => {
    const row = mkRow({
      from_address: 'ceo@partner.com',
      subject: 'Contract for our partnership',
      body_text: 'Please review the agreement and let us schedule a meeting.',
      to_addresses: [{ email: 'ali@colaberry.com' }],
    });
    const corpus = mkCorpus({
      vipSenders: new Set(['ceo@partner.com']),
      repliedSenders: new Set(['ceo@partner.com']),
    });
    const r = scoreEmail(row, corpus);
    expect(r.band).toBe('high');
    expect(r.score).toBeGreaterThanOrEqual(65);
    const keys = r.factors.map((f) => f.factor);
    expect(keys).toContain('vip_sender');
    expect(keys).toContain('replied_sender');
    expect(keys).toContain('strategic_keyword');
  });

  it('bulk newsletter with unsubscribe gets penalized and lands low', () => {
    const row = mkRow({
      subject: 'Weekly Newsletter — 50% off sale',
      body_text: 'Click to unsubscribe at the bottom.',
      headers: { 'List-Unsubscribe': '<mailto:x@y.com>' },
      to_addresses: [{ email: 'a@b.com' }, { email: 'c@d.com' }],
    });
    const r = scoreEmail(row, mkCorpus());
    expect(r.factors.map((f) => f.factor)).toContain('bulk_mail');
    expect(r.band).toBe('low');
  });

  it('surface preference for sender is the dominant boost', () => {
    const row = mkRow({ from_address: 'always@show.com' });
    const r = scoreEmail(row, mkCorpus({ prefSenders: new Set(['always@show.com']) }));
    expect(r.factors.find((f) => f.factor === 'surface_pref_sender')?.points).toBe(40);
  });

  it('low classifier confidence in a hidden state adds an uncertainty factor', () => {
    const row = mkRow({ confidence: 45, state: 'AUTOMATION' });
    const r = scoreEmail(row, mkCorpus());
    expect(r.factors.map((f) => f.factor)).toContain('low_confidence_hide');
  });
});

describe('scoreEmail — boundaries & determinism', () => {
  it('clamps to 0-100 even with many stacked positive factors', () => {
    const row = mkRow({
      from_address: 'ceo@partner.com',
      subject: 'Urgent contract partnership proposal — meeting & invoice',
      body_text: 'acquisition investment board enterprise pilot deadline asap',
      to_addresses: [{ email: 'ali@colaberry.com' }],
    });
    const corpus = mkCorpus({
      vipSenders: new Set(['ceo@partner.com']),
      repliedSenders: new Set(['ceo@partner.com']),
      rescuedSenders: new Set(['ceo@partner.com']),
      feedbackSenders: new Set(['ceo@partner.com']),
      prefSenders: new Set(['ceo@partner.com']),
    });
    const r = scoreEmail(row, corpus);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it('failure path: empty/blank email never throws and scores low', () => {
    const row = mkRow({ subject: null, body_text: null, headers: null, from_address: '', to_addresses: null, confidence: null });
    const r = scoreEmail(row, mkCorpus());
    expect(r.score).toBe(0);
    expect(r.band).toBe('low');
  });

  it('idempotent: same input yields identical score and factors', () => {
    const row = mkRow({ subject: 'Partnership proposal', from_address: 'x@vip.com' });
    const corpus = mkCorpus({ vipSenders: new Set(['x@vip.com']) });
    const a = scoreEmail(row, corpus);
    const b = scoreEmail(row, corpus);
    expect(a.score).toBe(b.score);
    expect(JSON.stringify(a.factors)).toBe(JSON.stringify(b.factors));
  });
});

describe('extractTopics', () => {
  it('pulls sender org and meaningful subject tokens, drops stopwords', () => {
    const row = mkRow({ from_address: 'rep@suralink.com', subject: 'Procurement bid for the new platform' });
    const topics = extractTopics(row, ['Deal / revenue signal']);
    const names = topics.map((t) => t.topic);
    expect(names).toContain('suralink');
    expect(names).toContain('procurement');
    expect(names).not.toContain('the'); // stopword
    expect(names).not.toContain('for'); // stopword
  });

  it('weights the sender org above single subject tokens', () => {
    const row = mkRow({ from_address: 'rep@acmecorp.com', subject: 'platform update' });
    const topics = extractTopics(row, []);
    const org = topics.find((t) => t.topic === 'acmecorp');
    expect(org).toBeDefined();
    expect(org!.weight).toBeGreaterThanOrEqual(2);
  });
});
