import * as fs from 'fs';
import * as path from 'path';
import { normalizeTitleCategory } from '../../../leadTitleCategory';
import { SCORE_DIMENSIONS, sourcedKeys } from '../dimensions';
import { AUTHORITY_POINTS, scoreSubject, type SubjectSignals } from '../scoreVector';

/**
 * T407 — the three sources that existed all along, now wired.
 *
 * `relationship_engagement` and `friction_risk` read the counted
 * `interaction_outcomes` and `appointments` rows; `authority_stakeholder_readiness`
 * reads `leads.title` through the SAME `normalizeTitleCategory` the interaction
 * aggregations use. The property every test here turns on: for a subject WITH
 * a lead, ZERO counts are a measurement (scored 0) and NULL counts (no lead,
 * tables unavailable) are a named gap - and an unknown title is the floor,
 * never null.
 */

const AT = new Date('2026-09-16T12:00:00Z');
const zeroInbound = { replied: 0, booked_meeting: 0, answered: 0, declined: 0, no_response: 0 };
const zeroAppointments = { scheduled: 0, completed: 0, no_show: 0, cancelled: 0 };
const signals = (over: Partial<SubjectSignals> = {}): SubjectSignals => ({
  lead: { title: null },
  observed: null,
  inbound: { ...zeroInbound },
  appointments: { ...zeroAppointments },
  computed_at: AT,
  ...over,
});
const dim = (v: ReturnType<typeof scoreSubject>, key: string) => v.dimensions.find((d) => d.key === key)!;

describe('the registry', () => {
  it('sourcedKeys(business) has six entries; consulting still three; sixteen dimensions in all', () => {
    expect(sourcedKeys('business')).toHaveLength(6);
    expect(sourcedKeys('consulting')).toHaveLength(3);
    expect(SCORE_DIMENSIONS).toHaveLength(16);
  });
});

describe('zero is a measurement, null is a gap', () => {
  it('a lead with every count read as zero scores 0 on engagement and on friction, with a factor that says so', () => {
    const v = scoreSubject(signals(), 'business');
    expect(dim(v, 'relationship_engagement').value).toBe(0);
    expect(dim(v, 'relationship_engagement').factors).toEqual([expect.objectContaining({ factor: 'no_engagement', points: 0 })]);
    expect(dim(v, 'friction_risk').value).toBe(0);
    expect(dim(v, 'friction_risk').factors).toEqual([expect.objectContaining({ factor: 'no_friction', points: 0 })]);
    expect(v.gaps.some((g) => g.startsWith('relationship_engagement') || g.startsWith('friction_risk'))).toBe(false);
  });

  it('null counts (no lead to count for, or the tables unavailable) are a named gap on both, never 0', () => {
    for (const over of [{ inbound: null }, { appointments: null }, { inbound: null, appointments: null }]) {
      const v = scoreSubject(signals(over as Partial<SubjectSignals>), 'business');
      expect(dim(v, 'relationship_engagement').value).toBeNull();
      expect(dim(v, 'friction_risk').value).toBeNull();
      expect(v.gaps).toEqual(expect.arrayContaining(['relationship_engagement:counts_unavailable', 'friction_risk:counts_unavailable']));
      expect(v.summary).toBeNull();
    }
  });
});

describe('relationship engagement - the counterparty side', () => {
  it('replies, bookings, answers, completed and scheduled appointments each score, and the total is capped at the dimension', () => {
    const v = scoreSubject(signals({ inbound: { ...zeroInbound, replied: 1, booked_meeting: 1, answered: 1 }, appointments: { ...zeroAppointments, completed: 1, scheduled: 1 } }), 'business');
    const d = dim(v, 'relationship_engagement');
    expect(d.factors.map((f) => [f.factor, f.points])).toEqual([['replied', 25], ['booked_meeting', 30], ['answered', 20], ['appointments_completed', 30], ['appointments_scheduled', 15]]);
    expect(d.value).toBe(100); // 120, capped
    expect(dim(scoreSubject(signals({ inbound: { ...zeroInbound, replied: 2 } }), 'business'), 'relationship_engagement').value).toBe(50);
  });

  it('declines and silence move friction, never engagement', () => {
    const v = scoreSubject(signals({ inbound: { ...zeroInbound, declined: 1, no_response: 3 } }), 'business');
    expect(dim(v, 'relationship_engagement').value).toBe(0);
    expect(dim(v, 'friction_risk').value).toBe(75);
  });
});

describe('friction and risk - the inverse dimension', () => {
  it('declines, no_response, no-shows and cancellations each score; no_response reaches the scorer by that name', () => {
    const v = scoreSubject(signals({ inbound: { ...zeroInbound, declined: 1, no_response: 1 }, appointments: { ...zeroAppointments, no_show: 1, cancelled: 1 } }), 'business');
    expect(dim(v, 'friction_risk').factors.map((f) => [f.factor, f.points])).toEqual([['declined', 30], ['no_response', 15], ['no_show', 20], ['cancelled', 15]]);
    expect(dim(v, 'friction_risk').value).toBe(80);
  });

  it('is declared inverse, and the summary falls as friction rises while the dimension itself rises', () => {
    expect(SCORE_DIMENSIONS.find((d) => d.key === 'friction_risk')?.inverse).toBe(true);
    const lead = { title: 'CEO', industry: 'Manufacturing', evaluating_90_days: true };
    const calm = scoreSubject(signals({ lead, observed: { page_events: 0, behavioral_signals: 0 } }), 'business');
    const tense = scoreSubject(signals({ lead, observed: { page_events: 0, behavioral_signals: 0 }, inbound: { ...zeroInbound, declined: 3 } }), 'business');
    expect(dim(calm, 'friction_risk').value).toBe(0);
    expect(dim(tense, 'friction_risk').value).toBe(90);
    expect(calm.summary).not.toBeNull();
    expect(tense.summary).not.toBeNull();
    expect(tense.summary!).toBeLessThan(calm.summary!);
    // Exactly: friction weight .1, so 90 points of friction cost 9 summary points.
    expect(calm.summary! - tense.summary!).toBe(9);
  });
});

describe('authority - the title, through the one existing rule', () => {
  it('"VP Engineering" scores authority > 0; "unknown" scores the floor, never null; a lead with no title is unknown', () => {
    const vp = scoreSubject(signals({ lead: { title: 'VP Engineering' } }), 'business');
    expect(dim(vp, 'authority_stakeholder_readiness').value).toBe(80);
    expect(dim(vp, 'authority_stakeholder_readiness').factors[0]).toMatchObject({ factor: 'title_category', label: 'title reads as VP', points: 80 });
    const unknown = scoreSubject(signals({ lead: { title: 'unknown' } }), 'business');
    expect(dim(unknown, 'authority_stakeholder_readiness').value).toBe(AUTHORITY_POINTS.unknown);
    expect(dim(unknown, 'authority_stakeholder_readiness').value).not.toBeNull();
    const untitled = scoreSubject(signals({ lead: { title: null } }), 'business');
    expect(dim(untitled, 'authority_stakeholder_readiness').value).toBe(0);
    expect(dim(untitled, 'authority_stakeholder_readiness').factors[0].label).toBe('title reads as unknown');
    expect(untitled.gaps.some((g) => g.startsWith('authority'))).toBe(false);
  });

  it('no lead at all is the gap (null), by the same rule as fit', () => {
    const v = scoreSubject(signals({ lead: null }), 'business');
    expect(dim(v, 'authority_stakeholder_readiness').value).toBeNull();
    expect(v.gaps).toContain('authority_stakeholder_readiness:no_value_for_subject');
  });

  it('every category the rule can answer has a point value, and the ladder is monotone from IC to C-Suite', () => {
    const titles: Array<[string, string]> = [['Chief Technology Officer', 'C-Suite'], ['SVP Sales', 'SVP'], ['Vice President, Ops', 'VP'], ['Head of Data', 'Director'], ['Senior Manager', 'Sr. Manager'], ['Engineering Manager', 'Manager'], ['Staff Engineer', 'Senior IC'], ['Co-Founder', 'Founder'], ['Analyst', 'IC']];
    for (const [title, category] of titles) {
      expect(normalizeTitleCategory(title)).toBe(category);
      expect(AUTHORITY_POINTS[category]).toBeGreaterThan(AUTHORITY_POINTS.unknown);
    }
    expect(AUTHORITY_POINTS.IC).toBeLessThan(AUTHORITY_POINTS['Senior IC']);
    expect(AUTHORITY_POINTS.Manager).toBeLessThan(AUTHORITY_POINTS.Director);
    expect(AUTHORITY_POINTS.Director).toBeLessThan(AUTHORITY_POINTS.VP);
    expect(AUTHORITY_POINTS.VP).toBeLessThan(AUTHORITY_POINTS['C-Suite']);
  });

  it('the rule is REUSED, never copied: interactionService imports and re-exports the pure module by name, and the scorer imports the same module', () => {
    const svc = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'interactionService.ts'), 'utf8');
    expect(svc).toMatch(/import \{ normalizeTitleCategory \} from '\.\/leadTitleCategory'/);
    expect(svc).toMatch(/export \{ normalizeTitleCategory \}/);
    expect(svc).not.toMatch(/export function normalizeTitleCategory/);
    const scorer = fs.readFileSync(path.join(__dirname, '..', 'countedScorers.ts'), 'utf8');
    expect(scorer).toMatch(/import \{ normalizeTitleCategory \} from '\.\.\/\.\.\/leadTitleCategory'/);
    expect(scorer).not.toMatch(/\b(ceo|cto|cfo)\b/i); // no regex of its own
  });
});

describe('a business subject with every source present', () => {
  it('has a numeric summary', () => {
    const v = scoreSubject(
      signals({
        lead: { title: 'CEO', industry: 'Manufacturing', annual_revenue: 25_000_000, employee_count: 400, technology_stack: 'salesforce', evaluating_90_days: true, selected_systems: 'crm' },
        observed: { page_events: 10, behavioral_signals: 5 },
        inbound: { ...zeroInbound, replied: 1 },
        appointments: { ...zeroAppointments, scheduled: 1 },
      }),
      'business',
    );
    expect(typeof v.summary).toBe('number');
    expect(v.gaps.filter((g) => !g.endsWith(':no_source'))).toEqual([]);
    expect(v.dimensions.filter((d) => d.source !== 'none' && d.value === null)).toEqual([]);
  });
});

describe('the scorer still defaults nothing to zero', () => {
  it('the new scorers spell no `?? 0` and no `|| 0` in code (the control: the plan\'s text scan)', () => {
    // The counted scorers live in their own file since the close-out (the vector crossed 500 lines); the scan reads it whole.
    const src = fs.readFileSync(path.join(__dirname, '..', 'countedScorers.ts'), 'utf8');
    const block = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(block).toContain('function scoreRelationshipEngagement');
    expect(block).toContain('function scoreFrictionRisk');
    expect(block).toContain('function scoreAuthority');
    // And the vector itself stays under CLAUDE.md's hard ceiling now that they are out.
    expect(fs.readFileSync(path.join(__dirname, '..', 'scoreVector.ts'), 'utf8').split(String.fromCharCode(10)).length).toBeLessThan(500);
    expect(block).not.toMatch(/\?\?\s*0\b/);
    expect(block).not.toMatch(/\|\|\s*0\b/);
    // The control the scan would catch: a scorer that read a missing count as zero.
    expect(/\?\?\s*0\b/.test("const replied = inbound?.replied ?? 0;")).toBe(true);
  });
});
