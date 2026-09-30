import { sourcedKeys } from '../scoring/dimensions';
import { scoreSubject } from '../scoring/scoreVector';
import { AT, fullLead, signals, zeroCounts } from './fixtures/scoreFixtures';

/**
 * T306 — what the SCORER does with a subject.
 *
 * The property under test throughout: a dimension nobody can measure is `null`
 * and appears in `gaps`, a dimension that WAS measured carries visible
 * components, and the two are never confused. §5.3 forbids collapsing the
 * dimensions into an unexplained score, so the summary exists only when every
 * dimension that has a source produced a value.
 *
 * The registry's own declarations are tested in `scoreDimensions.test.ts`.
 */

describe('a sourceless dimension is null and named, never zero', () => {
  it('scores null and appears in gaps with :no_source', () => {
    const v = scoreSubject(signals({ lead: fullLead }), 'business');
    const sourceless = v.dimensions.filter((d) => d.source === 'none' && d.key !== 'recorded_signals');
    expect(sourceless).toHaveLength(4); // T407: seven became four
    for (const d of sourceless) {
      expect({ key: d.key, value: d.value, factors: d.factors.length }).toEqual({
        key: d.key,
        value: null,
        factors: 0,
      });
      expect(v.gaps).toContain(`${d.key}:no_source`);
    }
  });

  it('never produces a number for one, for either programme, WITH labels present', () => {
    // The labels matter: the verifier's mutation scored `friction_risk` from
    // `opportunity_score`, and it only fired when labels were supplied — which
    // no test combined with a check on sourceless values. It does now.
    for (const program of ['business', 'consulting'] as const) {
      const v = scoreSubject(
        signals({
          lead: fullLead,
          observed: { page_events: 9, behavioral_signals: 3 },
          labels: { lead_temperature: 'hot', opportunity_score: 12, recommended_offer: 'ai_consulting' },
        }),
        program,
      );
      for (const d of v.dimensions) {
        if (d.source === 'none') {
          expect({ key: d.key, value: d.value }).toEqual({ key: d.key, value: null });
        }
      }
    }
  });
});

describe('a measured zero and an unmeasured null are different answers', () => {
  it('signals that were READ and were empty score 0, not null', () => {
    // The sharpest distinction in this file: we looked, and there was nothing.
    // That is a measurement.
    //
    // The lead declares no systems either, deliberately: a declared system adds
    // an intent factor (§7.1 — declared intent outranks observed), so leaving one
    // in would have made this case about the declaration rather than about the
    // measured zero. That bump has its own case below.
    const v = scoreSubject(
      signals({
        lead: { industry: 'Manufacturing', evaluating_90_days: true },
        observed: { page_events: 0, behavioral_signals: 0 },
      }),
      'business',
    );
    const intent = v.dimensions.find((d) => d.key === 'intent');
    expect(intent?.value).toBe(0);
    expect(intent?.factors.map((f) => f.factor)).toEqual(['page_events', 'behavioral_signals']);
    expect(v.gaps).not.toContain('intent:no_value_for_subject');
  });

  it('a declared system lifts intent above an observed zero, and says which', () => {
    const v = scoreSubject(
      signals({ lead: fullLead, observed: { page_events: 0, behavioral_signals: 0 } }),
      'business',
    );
    const intent = v.dimensions.find((d) => d.key === 'intent');
    expect(intent?.value).toBe(10);
    expect(intent?.factors.find((f) => f.factor === 'selected_systems')?.detail).toContain(
      'declared intent',
    );
  });

  it('signals that were NOT read score null and name the gap', () => {
    const v = scoreSubject(signals({ lead: fullLead, observed: null }), 'business');
    expect(v.dimensions.find((d) => d.key === 'intent')?.value).toBeNull();
    expect(v.gaps).toContain('intent:no_value_for_subject');
  });

  it('a FALSE timeline is null, because the column default is false', () => {
    // The defect attempt 1 shipped: `leads.evaluating_90_days` is
    // `allowNull: false, defaultValue: false`, so `false` is what the column
    // holds for every lead nobody asked. Reading it as "not evaluating" turned a
    // column default into a declared measurement, on the one dimension both
    // programmes depend on.
    const v = scoreSubject(
      signals({ lead: { ...fullLead, evaluating_90_days: false }, observed: { page_events: 1, behavioral_signals: 0 } }),
      'business',
    );
    expect(v.dimensions.find((d) => d.key === 'urgency')?.value).toBeNull();
    expect(v.gaps).toContain('urgency:default_not_distinguishable_from_unasked');
    expect(v.summary).toBeNull();
  });

  it('a null timeline is the same answer, by the same reason', () => {
    const v = scoreSubject(
      signals({ lead: { ...fullLead, evaluating_90_days: null }, observed: { page_events: 1, behavioral_signals: 0 } }),
      'business',
    );
    expect(v.dimensions.find((d) => d.key === 'urgency')?.value).toBeNull();
    expect(v.gaps).toContain('urgency:default_not_distinguishable_from_unasked');
  });

  it('a negative answer counts ONLY when the caller confirms it was asked', () => {
    // The seam for a source that records the asking. Nothing in the repo does
    // today, so a caller that cannot answer leaves it undefined — and then the
    // dimension stays null rather than inventing a negative.
    const v = scoreSubject(
      signals({
        lead: { ...fullLead, evaluating_90_days: false },
        observed: { page_events: 1, behavioral_signals: 0 },
        asked: { evaluating_90_days: true },
      }),
      'business',
    );
    const urgency = v.dimensions.find((d) => d.key === 'urgency');
    expect(urgency?.value).toBe(10);
    expect(urgency?.factors[0].label).toBe('Asked, and not evaluating within 90 days');
  });

  it('a confirmed negative still needs the row it was read from', () => {
    // The verifier's hole: `asked` with `lead: null` scored the negative 10. A
    // caller that never loaded the lead cannot know the answer was negative.
    const v = scoreSubject(
      signals({ lead: null, observed: null, asked: { evaluating_90_days: true } }),
      'business',
    );
    expect(v.dimensions.find((d) => d.key === 'urgency')?.value).toBeNull();
    expect(v.available).toBe(false);
  });

  it('JSON that arrived as raw text is not a list of one', () => {
    // `technology_stack: '[]'` scored "1 technologies named" and flipped fit from
    // null to 10 — a fabricated measurement, which is this file's whole subject.
    for (const raw of ['[]', '{}', '["crm"]', 'null', 'undefined']) {
      const v = scoreSubject(signals({ lead: { technology_stack: raw } }), 'business');
      expect({ raw, fit: v.dimensions.find((d) => d.key === 'fit')?.value }).toEqual({ raw, fit: null });
    }
  });

  it('but a real comma-separated list still counts', () => {
    // The other direction: the filter must not eat honest input.
    const v = scoreSubject(signals({ lead: { technology_stack: 'salesforce, snowflake' } }), 'business');
    expect(v.dimensions.find((d) => d.key === 'fit')?.factors[0].label).toBe('2 technologies named');
  });

  it('a positive timeline is a real answer and scores the cap', () => {
    const v = scoreSubject(
      signals({ lead: { ...fullLead, evaluating_90_days: true }, observed: { page_events: 1, behavioral_signals: 0 } }),
      'business',
    );
    expect(v.dimensions.find((d) => d.key === 'urgency')?.value).toBe(100);
  });

  it('a string that is not an answer does not become one', () => {
    // `'yes'` is not in the truthy set, and attempt 1 scored it as "not
    // evaluating" — a third way to render a non-answer as a measurement.
    const v = scoreSubject(
      signals({ lead: { ...fullLead, evaluating_90_days: 'yes' }, observed: null }),
      'business',
    );
    expect(v.dimensions.find((d) => d.key === 'urgency')?.value).toBeNull();
  });

  it('a lead row that is absent entirely leaves fit null', () => {
    const v = scoreSubject(signals({ lead: null, observed: { page_events: 2, behavioral_signals: 1 } }), 'business');
    expect(v.dimensions.find((d) => d.key === 'fit')?.value).toBeNull();
  });

  it('(a) a TEXT value in a numeric column does not become a measured zero', () => {
    // `annual_revenue` is a VARCHAR. Attempt 1 stripped the non-digits, got `''`,
    // and `Number('')` is 0 — so "confidential" scored 10 points for "Annual
    // revenue recorded".
    const v = scoreSubject(signals({ lead: { annual_revenue: 'confidential' } }), 'business');
    expect(v.dimensions.find((d) => d.key === 'fit')?.value).toBeNull();
    // T407: a lead row exists, so authority measures its floor (no title = unknown); nothing else scores.
    expect(v.dimensions.filter((d) => d.value !== null).map((d) => d.key)).toEqual(['authority_stakeholder_readiness']);
    expect(v.summary).toBeNull();
  });

  it('(a2) an unparseable employee count is absent, not zero employees', () => {
    const v = scoreSubject(signals({ lead: { employee_count: 'unknown' } }), 'business');
    expect(v.dimensions.find((d) => d.key === 'fit')?.value).toBeNull();
  });

  it('(b) an EMPTY array is not a recorded list', () => {
    // `[]` is truthy, so attempt 1 awarded it the same 10 points as a populated
    // list and labelled it "0 technologies named". The advisory mapper really
    // does store `[]` when the advisor sends nothing.
    const v = scoreSubject(
      signals({ lead: { technology_stack: [], departments_impacted: [], selected_systems: [] } }),
      'business',
    );
    const fit = v.dimensions.find((d) => d.key === 'fit');
    expect(fit?.value).toBeNull();
    expect(fit?.factors).toEqual([]);
  });

  it('(c) an ALL-EMPTY lead has no summary, for EITHER programme', () => {
    // Attempt 1: summary 26 for business and 3 for consulting, from a subject
    // with nothing measured at all. This is the case the whole task exists for.
    // `employee_count: ''`, not `0`: every numeric column here is nullable with
    // NO default, so a real 0 is something somebody wrote — case (c2) asserts
    // that — and putting one in this fixture would have made "nothing was
    // measured" quietly untrue.
    const empty = {
      industry: '',
      annual_revenue: '',
      employee_count: '',
      company_size: '',
      technology_stack: [],
      evaluating_90_days: false,
      maturity_score: '',
      estimated_roi: '',
      departments_impacted: [],
      selected_systems: [],
    };
    for (const program of ['business', 'consulting'] as const) {
      const v = scoreSubject(signals({ lead: empty }), program);
      // T407: for a BUSINESS lead the title dimension measures its floor (a lead exists, its seniority is
      // unknown), so one dimension holds 0; every other one is null and there is no summary. Consulting
      // has no title dimension and measures nothing at all.
      const valued = v.dimensions.filter((d) => d.value !== null).map((d) => d.key);
      expect({ program, summary: v.summary, available: v.available, valued }).toEqual(
        program === 'business' ? { program, summary: null, available: true, valued: ['authority_stakeholder_readiness'] } : { program, summary: null, available: false, valued: [] },
      );
      if (program === 'business') expect(v.dimensions.find((d) => d.key === 'authority_stakeholder_readiness')?.value).toBe(0);
    }
  });

  it('(c2) a zero employee_count IS a measurement when it is a real zero', () => {
    // The other direction: 0 as a NUMBER is an answer, and must not be swept up
    // by the fix for the empty string.
    const v = scoreSubject(signals({ lead: { employee_count: 0, industry: 'Consulting' } }), 'business');
    const fit = v.dimensions.find((d) => d.key === 'fit');
    expect(fit?.value).not.toBeNull();
    expect(fit?.factors.find((f) => f.factor === 'employee_count')?.label).toBe('0 employees');
  });

  it('(d) an unmeasured maturity score leaves consulting feasibility null', () => {
    // The hole the verifier's own mutation walked through: a zero default with no
    // `?? 0` in sight would have produced a full non-null consulting summary
    // from a column nobody wrote.
    const v = scoreSubject(
      signals({ lead: { selected_systems: 'crm', evaluating_90_days: true } }),
      'consulting',
    );
    expect(v.dimensions.find((d) => d.key === 'technical_feasibility')?.value).toBeNull();
    expect(v.gaps).toContain('technical_feasibility:no_value_for_subject');
    expect(v.summary).toBeNull();
  });

  it('(d2) a maturity score of 0 IS a measurement', () => {
    const v = scoreSubject(signals({ lead: { maturity_score: 0, selected_systems: 'crm' } }), 'consulting');
    expect(v.dimensions.find((d) => d.key === 'technical_feasibility')?.value).toBe(0);
  });

  it('a lead row with none of the fit fields recorded is null, not 0', () => {
    const v = scoreSubject(signals({ lead: {}, observed: null }), 'business');
    expect(v.dimensions.find((d) => d.key === 'fit')?.value).toBeNull();
  });
});

describe('every scored dimension shows its components', () => {
  it('each non-null dimension carries at least one factor with a readable label', () => {
    const v = scoreSubject(
      signals({ lead: fullLead, observed: { page_events: 4, behavioral_signals: 2 } }),
      'business',
    );
    const scored = v.dimensions.filter((d) => d.value !== null);
    expect(scored.length).toBeGreaterThanOrEqual(3);
    for (const d of scored) {
      expect(d.factors.length).toBeGreaterThan(0);
      for (const f of d.factors) {
        expect(f.label.length).toBeGreaterThan(8);
        expect(f.label).not.toMatch(/^[a-z_]+$/); // a key is not a label
        expect(typeof f.points).toBe('number');
      }
    }
  });

  it('names the field behind each factor, so a number can be traced', () => {
    const v = scoreSubject(signals({ lead: fullLead, observed: null }), 'consulting');
    const fit = v.dimensions.find((d) => d.key === 'solution_fit');
    expect(fit?.factors.map((f) => f.factor).sort()).toEqual(['selected_systems', 'technology_stack']);
  });
});

describe('the summary exists only when every sourced dimension produced a value', () => {
  it('all six answered gives a weighted number (T407: the counts and the title joined the three)', () => {
    const v = scoreSubject(
      signals({ lead: fullLead, observed: { page_events: 10, behavioral_signals: 5 }, ...zeroCounts }),
      'business',
    );
    expect(v.summary).not.toBeNull();
    expect(v.summary).toBeGreaterThan(0);
    expect(v.summary).toBeLessThanOrEqual(100);
  });

  it('ONE missing sourced dimension makes the summary null, not partial', () => {
    // A partial summary is a number whose meaning changes per subject.
    const v = scoreSubject(signals({ lead: fullLead, observed: null, ...zeroCounts }), 'business');
    expect(v.summary).toBeNull();
    // And the counts missing alone does the same (T407): a lead whose tables were not read has no summary.
    expect(scoreSubject(signals({ lead: fullLead, observed: { page_events: 1, behavioral_signals: 1 } }), 'business').summary).toBeNull();
  });

  it('the sourceless four never suppress the summary on their own', () => {
    // They are not "contributing" dimensions: if they suppressed it, the summary
    // could never exist at all and the field would be decorative.
    const v = scoreSubject(
      signals({ lead: fullLead, observed: { page_events: 1, behavioral_signals: 1 }, ...zeroCounts }),
      'business',
    );
    expect(v.gaps.filter((g) => g.endsWith(':no_source'))).toHaveLength(4);
    expect(v.summary).not.toBeNull();
  });

  it('is the weighted mean of the sourced dimensions, computed by hand here', () => {
    const v = scoreSubject(
      signals({
        lead: { evaluating_90_days: true, industry: 'Manufacturing' },
        observed: { page_events: 0, behavioral_signals: 0 },
        ...zeroCounts,
      }),
      'business',
    );
    // T407, six sourced dimensions: fit = industry only = 20 (weight .2), intent = 0 (.15), urgency = 100 (.3),
    // relationship_engagement = 0 (.15), friction_risk = 0 but INVERSE so it counts 100 - 0 = 100 (.1),
    // authority = no title = unknown = 0 (.1).
    // (20*.2 + 0*.15 + 100*.3 + 0*.15 + 100*.1 + 0*.1) / 1.0 = 4 + 30 + 10 = 44
    expect(v.dimensions.find((d) => d.key === 'fit')?.value).toBe(20);
    expect(v.dimensions.find((d) => d.key === 'intent')?.value).toBe(0);
    expect(v.dimensions.find((d) => d.key === 'urgency')?.value).toBe(100);
    expect(v.dimensions.find((d) => d.key === 'relationship_engagement')?.value).toBe(0);
    expect(v.dimensions.find((d) => d.key === 'friction_risk')?.value).toBe(0);
    expect(v.dimensions.find((d) => d.key === 'authority_stakeholder_readiness')?.value).toBe(0);
    expect(v.summary).toBe(44);
    // The inverse dimension pulls the summary DOWN as friction rises: 2 declines (60) -> friction counts 40 -> 4 + 30 + 4 = 38.
    const frictional = scoreSubject(signals({ lead: { evaluating_90_days: true, industry: 'Manufacturing' }, observed: { page_events: 0, behavioral_signals: 0 }, ...zeroCounts, inbound: { ...zeroCounts.inbound, declined: 2 } }), 'business');
    expect(frictional.dimensions.find((d) => d.key === 'friction_risk')?.value).toBe(60);
    expect(frictional.summary).toBe(38);
  });
});

describe('the three repo scores are recorded, never scored', () => {
  it('appear as zero-point factors on a dimension that cannot score', () => {
    const v = scoreSubject(
      signals({
        lead: fullLead,
        observed: null,
        labels: { lead_temperature: 'hot', opportunity_score: 87, recommended_offer: 'ai_consulting' },
      }),
      'business',
    );
    const recorded = v.dimensions.find((d) => d.key === 'recorded_signals');
    expect(recorded?.value).toBeNull();
    expect(recorded?.source).toBe('none');
    expect(recorded?.factors.map((f) => f.factor).sort()).toEqual([
      'lead_temperature',
      'opportunity_score',
      'recommended_offer',
    ]);
    for (const f of recorded?.factors ?? []) expect(f.points).toBe(0);
  });

  it('move no dimension value and no summary', () => {
    const withLabels = scoreSubject(
      signals({
        lead: fullLead,
        observed: { page_events: 2, behavioral_signals: 1 },
        labels: { lead_temperature: 'hot', opportunity_score: 99 },
      }),
      'business',
    );
    const without = scoreSubject(
      signals({ lead: fullLead, observed: { page_events: 2, behavioral_signals: 1 } }),
      'business',
    );
    expect(withLabels.summary).toBe(without.summary);
    for (const key of sourcedKeys('business')) {
      expect(withLabels.dimensions.find((d) => d.key === key)?.value).toBe(
        without.dimensions.find((d) => d.key === key)?.value,
      );
    }
  });

  it('an opportunity score of 0 is still recorded, not dropped as falsy', () => {
    const v = scoreSubject(signals({ lead: fullLead, labels: { opportunity_score: 0 } }), 'business');
    const recorded = v.dimensions.find((d) => d.key === 'recorded_signals');
    expect(recorded?.factors.map((f) => f.factor)).toEqual(['opportunity_score']);
  });
});

describe('a learner journey does not score here', () => {
  it('answers available:false and names where learner scores live', () => {
    // CPN and Colaberry Training score through Explorer's own three learner
    // scores. A learner dimension set here would be a second learner scorer.
    const v = scoreSubject(signals({ lead: fullLead }), 'learner');
    expect(v).toEqual({
      dimensions: [],
      summary: null,
      gaps: ['no_dimensions_for_program:learner'],
      available: false,
      computed_at: AT,
    });
  });
});

describe('nothing measurable at all', () => {
  it('available is false when nothing at all could be measured', () => {
    const v = scoreSubject(signals(), 'business');
    expect(v.available).toBe(false);
    expect(v.summary).toBeNull();
    expect(v.dimensions.every((d) => d.value === null)).toBe(true);
  });
});
