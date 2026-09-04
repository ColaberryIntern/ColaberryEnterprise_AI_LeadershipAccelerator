/**
 * Cert Prep — the presentation claims that are product requirements, not styling.
 *
 * These are the assertions that stop the page telling a student something untrue:
 * an unmeasured score rendered as zero, an untouched domain rendered as 0%, an
 * unverified weight presented with Anthropic's authority, or a readiness number
 * captioned as a predicted exam score. Each has a specific way of going wrong
 * during a redesign, and each is cheap to guard.
 *
 * Uses the `renderToStaticMarkup` pattern already proven in
 * pages/portal/__tests__/SkillMeter.flagOff.smoke.test.tsx — no DOM harness
 * needed for what is essentially "does the output contain this claim".
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CertReadinessHero from '../CertReadinessHero';
import CertDomainMap from '../CertDomainMap';
import CertProgressRail from '../CertProgressRail';
import type { CertReadiness, CertTrackInfo, CertDomain } from '../../../../services/certPrepApi';

const TRACK: CertTrackInfo = {
  track_id: 'ccar-f',
  display_name: 'Claude Certified Architect – Foundations',
  issuer: 'Anthropic',
  blueprint_version: '1.0-2026-07',
  blueprint_source: 'official',
  exam_item_count: 60,
  exam_duration_minutes: 120,
  passing_scaled_score: 720,
};

function readiness(over: Partial<CertReadiness> = {}): CertReadiness {
  return {
    track_id: 'ccar-f',
    blueprint_version: '1.0-2026-07',
    readiness_policy_version: 'v1-knowledge-dominant',
    knowledge_scaled: 800,
    evidence_coverage_pct: 40,
    sample_confidence: 0.9,
    overall_scaled: 740,
    overall_state: 'approaching',
    weights_available: true,
    domain_breakdown: [],
    qualifying_sittings: 1,
    answered_total: 60,
    ...over,
  };
}

const noop = () => undefined;
const hero = (r: CertReadiness | null) =>
  renderToStaticMarkup(
    <CertReadinessHero
      readiness={r}
      track={TRACK}
      onSeeWhy={noop}
      onNextAction={noop}
      nextActionLabel="Take the baseline diagnostic"
    />,
  );

describe('CertReadinessHero — the score never overclaims', () => {
  it('an unmeasured readiness renders "Not measured", NEVER a zero or a floor score', () => {
    const html = hero(readiness({ overall_state: 'not_measured', overall_scaled: null, answered_total: 0 }));
    expect(html).toContain('Not');
    expect(html).toContain('measured');
    // the floor of the scale must not be presented as an achieved score
    expect(html).not.toMatch(/>100</);
    expect(html).not.toMatch(/cp-dial-num/);
  });

  it('a null readiness object is handled the same way, not crashed on', () => {
    expect(() => hero(null)).not.toThrow();
    expect(hero(null)).toContain('measured');
  });

  it('always captions the number as a Colaberry readiness ESTIMATE', () => {
    const html = hero(readiness());
    expect(html).toContain('Colaberry readiness estimate');
  });

  it('never claims to predict the real exam result', () => {
    const html = hero(readiness({ overall_state: 'sustained', overall_scaled: 880, qualifying_sittings: 3 }));
    expect(html).not.toMatch(/will pass|predicted|guarantee|Anthropic score/i);
  });

  it('warns when the sample is narrow — a high score on thin coverage is the worst thing to show plainly', () => {
    const html = hero(readiness({ sample_confidence: 0.3 }));
    expect(html).toMatch(/not covered every domain/i);
    expect(html).toMatch(/provisional/i);
  });

  it('does NOT warn when coverage is broad', () => {
    const html = hero(readiness({ sample_confidence: 0.95 }));
    expect(html).not.toMatch(/provisional/i);
  });

  it('says so when official weights are missing, rather than implying exam weighting', () => {
    const html = hero(readiness({ weights_available: false }));
    expect(html).toMatch(/coverage estimate rather than an exam-weighted one/i);
  });

  it('shows the gap to the target in points when below it', () => {
    const html = hero(readiness({ overall_scaled: 660 }));
    expect(html).toContain('60 points from the 720 target');
  });
});

const DOMAINS: CertDomain[] = [
  {
    domain_id: 'D1', label: 'Agentic Architecture & Orchestration', description: null,
    weight_pct: 27, weight_source: 'official', display_order: 1,
    objectives: [{ objective_id: 'D1.1', label: 'Design and implement agentic loops' }],
    state: null,
  },
  {
    domain_id: 'D2', label: 'Tool Design & MCP Integration', description: null,
    weight_pct: 18, weight_source: 'community', display_order: 2,
    objectives: [], state: null,
  },
];

const map = (r: CertReadiness | null, compact = false) =>
  renderToStaticMarkup(
    <CertDomainMap domains={DOMAINS} readiness={r} compact={compact} onDrill={noop} />,
  );

describe('CertDomainMap — unmeasured is not the same as zero', () => {
  it('a domain with no answers reads "Not attempted", never 0%', () => {
    const html = map(readiness({
      domain_breakdown: [
        { domain_id: 'D1', knowledge_pct: null, answered: 0, evidence_verified: 0, objectives_total: 1, objectives_evidenced: 0 },
      ],
    }));
    expect(html).toContain('Not attempted');
    expect(html).not.toContain('>0%<');
  });

  it('a domain answered and scored badly DOES show its real percentage', () => {
    const html = map(readiness({
      domain_breakdown: [
        { domain_id: 'D1', knowledge_pct: 0.25, answered: 8, evidence_verified: 0, objectives_total: 1, objectives_evidenced: 0 },
      ],
    }));
    // Scope to D1's own block. Asserting on the whole document would also catch
    // D2, which has no responses and CORRECTLY reads "Not attempted" — the exact
    // aggregate-vs-extraction mistake this suite exists to prevent elsewhere.
    const d1Block = html.slice(html.indexOf('Agentic'), html.indexOf('Tool Design'));
    expect(d1Block).toContain('25%');
    expect(d1Block).toContain('across 8 questions');
    expect(d1Block).not.toContain('Not attempted');
  });

  it('labels an unverified weight, and does not label the official one', () => {
    const html = map(null);
    expect(html).toMatch(/unverified/);
    // D1 is official and must NOT be flagged
    const d1Block = html.slice(html.indexOf('Agentic'), html.indexOf('Tool Design'));
    expect(d1Block).not.toMatch(/unverified/);
  });

  it('renders domains in the blueprint display order, not sorted by weight', () => {
    const html = map(null);
    expect(html.indexOf('Agentic Architecture')).toBeLessThan(html.indexOf('Tool Design'));
  });

  it('the compact view omits the objective list; the full view includes it', () => {
    expect(map(null, true)).not.toContain('Design and implement agentic loops');
    expect(map(null, false)).toContain('Design and implement agentic loops');
  });

  it('renders an empty state rather than throwing when no domains are configured', () => {
    const html = renderToStaticMarkup(
      <CertDomainMap domains={[]} readiness={null} onDrill={noop} />,
    );
    expect(html).toMatch(/No certification domains are configured/i);
  });
});


/**
 * The sticky rail is on screen the whole time a student works, so a number that
 * lies there is worse than one buried in a tab. It obeys the same rules the hero
 * does, and these assertions exist because the rail was written second and could
 * easily have drifted from them.
 */
describe('CertProgressRail', () => {
  const rail = (r: CertReadiness | null, doms: CertDomain[] = []) =>
    renderToStaticMarkup(
      <CertProgressRail
        readiness={r}
        domains={doms}
        track={TRACK}
        nextActionLabel="Take the baseline diagnostic"
        onNextAction={noop}
      />,
    );

  it('renders "Not measured" rather than the number underneath it', () => {
    // The server computes a scaled value before it means anything; the state is
    // what decides whether it may be shown.
    const html = rail(readiness({ overall_state: 'not_measured', overall_scaled: 195 }));
    expect(html).toContain('Not measured');
    expect(html).not.toContain('195');
  });

  it('shows the score once the state says it means something', () => {
    expect(rail(readiness({ overall_state: 'approaching', overall_scaled: 740 }))).toContain('740');
  });

  it('labels a thin sample provisional instead of presenting it as settled', () => {
    expect(rail(readiness({ overall_state: 'building', overall_scaled: 600, sample_confidence: 0.2 })))
      .toContain('provisional');
  });

  it('a domain with no answers shows a dash, never 0%', () => {
    const doms = [{ domain_id: 'D4', name: 'Prompt Engineering', weight_pct: 20, weight_source: 'official', objectives: [] }] as unknown as CertDomain[];
    const html = rail(readiness({ domain_breakdown: [] }), doms);
    expect(html).toContain('—');
  });

  it('counts domains attempted out of the real domain count, not a hardcoded five', () => {
    const doms = [
      { domain_id: 'D1', name: 'a', weight_pct: 50, weight_source: 'official', objectives: [] },
      { domain_id: 'D2', name: 'b', weight_pct: 50, weight_source: 'official', objectives: [] },
    ] as unknown as CertDomain[];
    const html = rail(readiness({
      domain_breakdown: [
        { domain_id: 'D1', knowledge_pct: 0.5, answered: 4, evidence_verified: 0, objectives_total: 3, objectives_evidenced: 0 },
        { domain_id: 'D2', knowledge_pct: null, answered: 0, evidence_verified: 0, objectives_total: 3, objectives_evidenced: 0 },
      ],
    }), doms);
    expect(html).toContain('1 of 2');
  });

  it('boundary: no readiness at all renders without throwing, and claims nothing', () => {
    const html = rail(null);
    expect(html).toContain('Not measured');
    expect(html).not.toMatch(/\d{3}/);
  });
});
