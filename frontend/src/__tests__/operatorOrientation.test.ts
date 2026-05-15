/**
 * Operator Orientation Sprint, 2026-05-14.
 *
 * Covers the pure derivation layer of the operator-orientation surfaces:
 *   - deriveOperatorFocus  (hooks/useOperatorFocus)
 *   - the language builders (utils/operatorOrientationLanguage)
 *
 * Per the project test contract, each unit has happy-path, failure-path,
 * and boundary coverage. The language builders must return `null` (not an
 * empty string) when there is nothing meaningful to say, so the surfaces
 * can simply not render.
 */
import { deriveOperatorFocus, type OperatorFocus } from '../hooks/useOperatorFocus';
import {
  dominantSignal,
  orientationSentence,
  flowsIntoSentence,
  impactSentence,
  contributionLine,
} from '../utils/operatorOrientationLanguage';
import type { OperationalMomentum } from '../hooks/useOperationalMomentum';

// --- builders ---------------------------------------------------------------

function momentum(over: Partial<OperationalMomentum> = {}): OperationalMomentum {
  return {
    readinessDelta: null,
    coverageDelta: null,
    queueDelta: null,
    healthDelta: null,
    minutesSinceVisit: null,
    minutesSinceBuilt: null,
    hasMomentum: false,
    netForwardMotion: 0,
    ...over,
  };
}

const NOW = new Date('2026-05-14T12:00:00Z').getTime();
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

// ---------------------------------------------------------------------------
describe('deriveOperatorFocus', () => {
  test('no focus signal → empty focus (genuine first visit)', () => {
    const f = deriveOperatorFocus({}, NOW);
    expect(f).toEqual({ domain: null, confidence: null, minutesSince: null });
  });

  test('stale / unknown domain key degrades silently to empty', () => {
    const f = deriveOperatorFocus({ lastBpDomain: 'a_domain_that_was_removed', lastBpDomainAt: minutesAgo(5) }, NOW);
    expect(f.domain).toBeNull();
    expect(f.confidence).toBeNull();
  });

  test('recent engagement (<2h) → confidence "recent" with resolved profile', () => {
    const f = deriveOperatorFocus({ lastBpDomain: 'lead_intelligence', lastBpDomainAt: minutesAgo(10) }, NOW);
    expect(f.domain?.label).toBe('Lead Intelligence');
    expect(f.confidence).toBe('recent');
    expect(f.minutesSince).toBe(10);
    // profile carries the static downstream graph
    expect(f.domain?.downstreamLabels).toEqual(
      expect.arrayContaining(['Marketing Operations', 'Execution Systems', 'Reporting & Analytics']),
    );
  });

  test('boundary: exactly 120 minutes is no longer "recent"', () => {
    const f = deriveOperatorFocus({ lastBpDomain: 'lead_intelligence', lastBpDomainAt: minutesAgo(120) }, NOW);
    expect(f.confidence).toBe('ambient');
  });

  test('old engagement → confidence "ambient"', () => {
    const f = deriveOperatorFocus({ lastBpDomain: 'intake', lastBpDomainAt: minutesAgo(600) }, NOW);
    expect(f.confidence).toBe('ambient');
    expect(f.minutesSince).toBe(600);
  });

  test('domain known but no timestamp → ambient, minutesSince null', () => {
    const f = deriveOperatorFocus({ lastBpDomain: 'reporting' }, NOW);
    expect(f.domain?.label).toBe('Reporting & Analytics');
    expect(f.confidence).toBe('ambient');
    expect(f.minutesSince).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('dominantSignal', () => {
  test('no forward motion → null', () => {
    expect(dominantSignal(momentum())).toBeNull();
    expect(dominantSignal(momentum({ readinessDelta: 0, coverageDelta: 0 }))).toBeNull();
  });

  test('ignores backward movement', () => {
    // readiness fell, coverage rose — only coverage counts
    const s = dominantSignal(momentum({ readinessDelta: -5, coverageDelta: 3 }));
    expect(s?.key).toBe('coverage');
  });

  test('picks the largest-magnitude forward signal', () => {
    const s = dominantSignal(momentum({ readinessDelta: 2, coverageDelta: 6 }));
    expect(s?.key).toBe('coverage');
    expect(s?.amount).toBe(6);
  });

  test('queue drain counts as forward motion (negative delta)', () => {
    const s = dominantSignal(momentum({ queueDelta: -4 }));
    expect(s?.key).toBe('queue');
    expect(s?.amount).toBe(4);
    expect(s?.clause).toBe('the queue got lighter');
  });

  test('tie breaks by priority order (readiness > coverage > health > queue)', () => {
    const s = dominantSignal(momentum({ readinessDelta: 3, coverageDelta: 3 }));
    expect(s?.key).toBe('readiness');
  });
});

// ---------------------------------------------------------------------------
describe('orientationSentence', () => {
  const recentFocus: OperatorFocus = deriveOperatorFocus(
    { lastBpDomain: 'lead_intelligence', lastBpDomainAt: minutesAgo(5) }, NOW);
  const ambientFocus: OperatorFocus = deriveOperatorFocus(
    { lastBpDomain: 'lead_intelligence', lastBpDomainAt: minutesAgo(600) }, NOW);

  test('no domain → null', () => {
    expect(orientationSentence({ domain: null, confidence: null, minutesSince: null })).toBeNull();
  });

  test('recent focus → present-tense "currently shaping"', () => {
    expect(orientationSentence(recentFocus)).toBe('You are currently shaping Lead Intelligence.');
  });

  test('ambient focus → softer "recent operational focus"', () => {
    expect(orientationSentence(ambientFocus)).toBe('Your recent operational focus has been Lead Intelligence.');
  });

  test('calm guardrail: never exclamatory or congratulatory', () => {
    const out = orientationSentence(recentFocus)!;
    expect(out).not.toMatch(/[!]/);
    expect(out.toLowerCase()).not.toMatch(/great|nice|awesome|congrat|well done/);
  });
});

// ---------------------------------------------------------------------------
describe('flowsIntoSentence', () => {
  test('no domain → null', () => {
    expect(flowsIntoSentence({ domain: null, confidence: null, minutesSince: null })).toBeNull();
  });

  test('domain with downstream → lists the influenced areas', () => {
    const focus = deriveOperatorFocus({ lastBpDomain: 'lead_intelligence', lastBpDomainAt: minutesAgo(5) }, NOW);
    const out = flowsIntoSentence(focus)!;
    expect(out).toMatch(/^Your work here flows into /);
    expect(out).toContain('Marketing Operations');
    expect(out).toMatch(/, and |and /); // calm prose join
  });

  test('boundary: domain with no downstream relationships → null', () => {
    // reporting consolidates from others but feeds / supports nothing
    const focus = deriveOperatorFocus({ lastBpDomain: 'reporting', lastBpDomainAt: minutesAgo(5) }, NOW);
    expect(focus.domain?.downstreamLabels).toEqual([]);
    expect(flowsIntoSentence(focus)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('impactSentence', () => {
  const focus = deriveOperatorFocus({ lastBpDomain: 'lead_intelligence', lastBpDomainAt: minutesAgo(5) }, NOW);
  const noFocus: OperatorFocus = { domain: null, confidence: null, minutesSince: null };

  test('no forward motion → null', () => {
    expect(impactSentence(focus, momentum())).toBeNull();
  });

  test('with focus domain → honest temporal framing, not claimed causation', () => {
    const out = impactSentence(focus, momentum({ readinessDelta: 4 }))!;
    expect(out).toBe('While you were shaping Lead Intelligence, readiness strengthened.');
    // "while" = temporal correlation; must not assert the work *caused* the move
    expect(out.toLowerCase()).not.toMatch(/because|caused|thanks to|resulted in/);
  });

  test('without focus domain → falls back to "since your last visit"', () => {
    const out = impactSentence(noFocus, momentum({ coverageDelta: 2 }))!;
    expect(out).toBe('Since your last visit, coverage expanded.');
  });
});

// ---------------------------------------------------------------------------
describe('contributionLine', () => {
  test('no contribution memory → null', () => {
    expect(contributionLine(undefined)).toBeNull();
  });

  test('formats contribution as "<signal> in <domain>"', () => {
    expect(contributionLine({ domainLabel: 'Reporting & Analytics', signal: 'coverage', at: minutesAgo(30) }))
      .toBe('coverage in Reporting & Analytics');
  });
});
