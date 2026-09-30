/**
 * Contract tests for the AI-native Opportunity Map.
 *
 * The rule these enforce is master plan §Gate 4's closing instruction — "do not force AI
 * everywhere" — plus the coherence checks that stop a row claiming autonomy without
 * saying what it means or what trust it needs.
 */
import type { DeliveryOpportunityAttributes } from '../../../models/DeliveryOpportunity';
import {
  assessOpportunityMap,
  isAutonomous,
  requiredInpactDimensions,
  validateOpportunity,
} from '../deliveryOpportunityMap';

const base = (
  overrides: Partial<DeliveryOpportunityAttributes> = {},
): DeliveryOpportunityAttributes => ({
  delivery_project_id: 'p1',
  capability: 'Invoice triage',
  disposition: 'traditional_software',
  traditional_software: 'A queue and a status field.',
  value_score: 3,
  complexity_score: 2,
  ...overrides,
});

const blocking = (row: DeliveryOpportunityAttributes) =>
  validateOpportunity(row).filter((i) => i.severity === 'blocking');

describe('a well-formed row passes', () => {
  it('traditional software with a description', () => {
    expect(blocking(base())).toEqual([]);
  });

  it('an acting agent that declares permitted', () => {
    const row = base({
      disposition: 'agent_acts',
      agent_opportunity: 'Routes invoices to the right approver.',
      trust_requirement: ['permitted', 'transparent'],
    });
    expect(blocking(row)).toEqual([]);
  });
});

describe('autonomy must declare its trust requirements', () => {
  it.each(['agent_acts', 'full_automation'] as const)(
    '%s with NO trust requirement is blocking',
    (disposition) => {
      // An agent acting on someone's behalf with no declared trust requirement is exactly
      // what Trust Before Intelligence exists to prevent.
      const row = base({
        disposition,
        agent_opportunity: 'Acts.',
        automation: 'Acts.',
        trust_requirement: [],
      });
      const rules = blocking(row).map((i) => i.rule);
      expect(rules).toContain('autonomy_without_trust_requirement');
    },
  );

  it('an acting agent that omits `permitted` is blocking', () => {
    // Without the authorization dimension, nobody has said who may stop it.
    const row = base({
      disposition: 'agent_acts',
      agent_opportunity: 'Acts.',
      trust_requirement: ['instant', 'transparent'],
    });
    expect(blocking(row).map((i) => i.rule)).toContain('autonomy_without_permitted');
  });

  it('a RECOMMENDING capability needs no trust requirement', () => {
    // Advice is not action. Requiring the same declaration would be noise.
    const row = base({
      disposition: 'ai_recommends',
      ai_recommendation: 'Suggests an approver; a human still assigns.',
      trust_requirement: [],
    });
    expect(blocking(row)).toEqual([]);
  });

  it('a human-only decision needs no trust requirement', () => {
    const row = base({
      disposition: 'human_only',
      human_only_decision: 'Whether to write off a disputed balance.',
    });
    expect(blocking(row)).toEqual([]);
  });
});

describe('trust requirements reference the INPACT registry, not free text', () => {
  it('rejects an unrecognised dimension', () => {
    // Free text here would make Gate 9's Trust coverage unanswerable by query.
    const row = base({ trust_requirement: ['fast', 'trustworthy'] });
    const issue = blocking(row).find((i) => i.rule === 'trust_requirement_not_an_inpact_dimension');
    expect(issue).toBeDefined();
    expect(issue!.detail).toContain('fast');
  });

  it('accepts every real INPACT dimension', () => {
    const row = base({
      trust_requirement: [
        'instant',
        'natural',
        'permitted',
        'adaptive',
        'contextual',
        'transparent',
      ],
    });
    expect(blocking(row)).toEqual([]);
  });
});

describe('a disposition must say what it means', () => {
  it.each([
    ['traditional_software', 'traditional_software'],
    ['ai_recommends', 'ai_recommendation'],
    ['agent_acts', 'agent_opportunity'],
    ['full_automation', 'automation'],
    ['human_only', 'human_only_decision'],
  ] as const)('%s with an empty %s is blocking', (disposition) => {
    const row = base({
      disposition,
      traditional_software: null,
      ai_recommendation: null,
      agent_opportunity: null,
      automation: null,
      human_only_decision: null,
      trust_requirement: ['permitted'],
    });
    expect(blocking(row).map((i) => i.rule)).toContain('disposition_undescribed');
  });

  it('an unnamed capability is blocking', () => {
    expect(blocking(base({ capability: '   ' })).map((i) => i.rule)).toContain(
      'capability_unnamed',
    );
  });
});

describe('scores warn rather than block', () => {
  it('a missing value score does not block', () => {
    // The row still tells the truth about what the system will do.
    const issues = validateOpportunity(base({ value_score: null }));
    const issue = issues.find((i) => i.rule === 'value_score_missing_or_invalid');
    expect(issue!.severity).toBe('warning');
    expect(blocking(base({ value_score: null }))).toEqual([]);
  });

  it.each([0, 6, 2.5, null])('score %p is flagged', (score) => {
    const issues = validateOpportunity(base({ complexity_score: score as any }));
    expect(issues.some((i) => i.rule === 'complexity_score_missing_or_invalid')).toBe(true);
  });
});

describe('do not force AI everywhere', () => {
  it('flags a map with nothing human-only and nothing traditional', () => {
    const rows = [
      base({
        capability: 'A',
        disposition: 'agent_acts',
        agent_opportunity: 'x',
        trust_requirement: ['permitted'],
      }),
      base({ capability: 'B', disposition: 'ai_recommends', ai_recommendation: 'y' }),
    ];
    const assessment = assessOpportunityMap(rows);
    expect(assessment.aiEverywhere).toBe(true);
    expect(assessment.issues.some((i) => i.rule === 'ai_everywhere')).toBe(true);
  });

  it('ai_everywhere WARNS but does not block', () => {
    // There are real projects where nearly everything is an agent opportunity. The signal
    // exists so a human looks, not so the tool decides.
    const rows = [
      base({
        capability: 'A',
        disposition: 'agent_acts',
        agent_opportunity: 'x',
        trust_requirement: ['permitted'],
      }),
    ];
    const assessment = assessOpportunityMap(rows);
    expect(assessment.aiEverywhere).toBe(true);
    expect(assessment.passes).toBe(true);
  });

  it('a map with a human-only capability is not flagged', () => {
    const rows = [
      base({
        capability: 'A',
        disposition: 'agent_acts',
        agent_opportunity: 'x',
        trust_requirement: ['permitted'],
      }),
      base({ capability: 'B', disposition: 'human_only', human_only_decision: 'z' }),
    ];
    expect(assessOpportunityMap(rows).aiEverywhere).toBe(false);
  });

  it('an empty map is not "AI everywhere"', () => {
    expect(assessOpportunityMap([]).aiEverywhere).toBe(false);
  });
});

describe('map assessment', () => {
  it('counts dispositions and autonomy', () => {
    const rows = [
      base({ capability: 'A' }),
      base({
        capability: 'B',
        disposition: 'agent_acts',
        agent_opportunity: 'x',
        trust_requirement: ['permitted'],
      }),
      base({ capability: 'C', disposition: 'human_only', human_only_decision: 'z' }),
    ];
    const assessment = assessOpportunityMap(rows);
    expect(assessment.total).toBe(3);
    expect(assessment.autonomousCount).toBe(1);
    expect(assessment.humanOnlyCount).toBe(1);
    expect(assessment.byDisposition.traditional_software).toBe(1);
  });

  it('fails when any row has a blocking issue', () => {
    const rows = [base({ capability: 'A' }), base({ capability: '  ' })];
    const assessment = assessOpportunityMap(rows);
    expect(assessment.passes).toBe(false);
    expect(assessment.blockingIssues.length).toBeGreaterThan(0);
  });

  it('isAutonomous distinguishes acting from advising', () => {
    expect(isAutonomous('agent_acts')).toBe(true);
    expect(isAutonomous('full_automation')).toBe(true);
    expect(isAutonomous('ai_recommends')).toBe(false);
    expect(isAutonomous('human_only')).toBe(false);
  });
});

describe('required INPACT dimensions feed Gate 5', () => {
  it('collects the union in canonical order', () => {
    const rows = [
      base({ capability: 'A', trust_requirement: ['transparent', 'instant'] }),
      base({ capability: 'B', trust_requirement: ['instant', 'permitted'] }),
    ];
    expect(requiredInpactDimensions(rows)).toEqual(['instant', 'permitted', 'transparent']);
  });

  it('ignores unrecognised entries', () => {
    const rows = [base({ trust_requirement: ['nonsense', 'natural'] })];
    expect(requiredInpactDimensions(rows)).toEqual(['natural']);
  });

  it('returns nothing for a map with no trust requirements', () => {
    expect(requiredInpactDimensions([base()])).toEqual([]);
  });
});
