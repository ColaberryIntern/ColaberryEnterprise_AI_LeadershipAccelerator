/**
 * R11 — the revenue opportunity scan.
 *
 * The ticket asks for one test above all: "The stage literals match the column vocabulary,
 * enforced by a test that fails if they ever diverge again. A hardcoded list that drifts
 * silently is what caused this."
 *
 * That is the first describe block below, and it reads the source rather than the behaviour
 * on purpose. The old predicate named two stages that have never existed, and no behavioural
 * test could catch it: the query was valid SQL, returned zero rows, and zero rows is exactly
 * what a correct scan looks like on a quiet day. Only the literals themselves give it away.
 */
import fs from 'fs';
import path from 'path';
import { PIPELINE_STAGES, HIGH_INTENT_SCORE, SCAN_LIMIT } from '../revenueOpportunityService';

const SERVICE = path.join(__dirname, '..', 'revenueOpportunityService.ts');
const source = fs.readFileSync(SERVICE, 'utf8');

describe('the stage vocabulary cannot drift from the column again', () => {
  /**
   * The stages the old predicate named. If either reappears as a filter value, this fails.
   * They are listed explicitly rather than derived, because the point is to name the exact
   * mistake so a reader of a future failure knows what happened.
   */
  const NEVER_EXISTED = ['qualified', 'proposal'];

  it('names no stage the column does not have', () => {
    // Every quoted string that sits inside a pipeline_stage filter in this file.
    const filters = source.match(/pipeline_stage:[\s\S]{0,160}?\]/g) ?? [];
    expect(filters.length).toBeGreaterThan(0);

    for (const f of filters) {
      const literals = (f.match(/'([a-z_]+)'/g) ?? []).map((s) => s.replace(/'/g, ''));
      for (const lit of literals) {
        expect(PIPELINE_STAGES as readonly string[]).toContain(lit);
      }
    }
  });

  it('does not reintroduce "qualified" or "proposal" as a filter value', () => {
    for (const bad of NEVER_EXISTED) {
      expect(source).not.toMatch(new RegExp(`\\[\\s*Op\\.(in|notIn)\\s*\\]:\\s*\\[[^\\]]*'${bad}'`));
    }
  });

  it('keeps the vocabulary in step with what the ticket measured', () => {
    expect([...PIPELINE_STAGES].sort()).toEqual([
      'contacted', 'enrolled', 'meeting_scheduled', 'negotiation', 'new_lead', 'proposal_sent',
    ]);
  });
});

describe('the scan is capped in a defined order, not sampled arbitrarily', () => {
  it('orders by score descending, so the cap takes the best and not the first found', () => {
    expect(source).toMatch(/order:\s*\[\['lead_score',\s*'DESC'\]\]/);
  });

  it('has a cap, and it is a named constant rather than a bare number', () => {
    expect(source).toMatch(/limit:\s*SCAN_LIMIT/);
    expect(SCAN_LIMIT).toBeGreaterThan(0);
  });

  it('never pairs a limit with no order again', () => {
    // The original bug: `limit: 20` with no ORDER BY, which is a random sample wearing a
    // priority's clothes. If a limit appears, an order must appear with it.
    const queries = source.match(/Lead\.findAll\(\{[\s\S]*?\}\);/g) ?? [];
    for (const query of queries) {
      if (/limit:/.test(query)) expect(query).toMatch(/order:/);
    }
  });
});

describe('the predicate is score-led, which is the decision that was taken', () => {
  it('filters on the score threshold', () => {
    expect(HIGH_INTENT_SCORE).toBe(70);
    expect(source).toMatch(/lead_score:\s*\{\s*\[Op\.gte\]:\s*HIGH_INTENT_SCORE\s*\}/);
  });

  it('does not require a late stage, because that set has never intersected the scored one', () => {
    expect(source).not.toMatch(/pipeline_stage:\s*\{\s*\[Op\.in\]/);
  });

  it('excludes the enrolled, who are customers rather than opportunities', () => {
    expect(source).toMatch(/EXCLUDED_STAGES/);
    expect(source).toMatch(/const EXCLUDED_STAGES[^=]*=\s*\['enrolled'\]/);
  });

  it('still excludes campaign test traffic', () => {
    expect(source).toMatch(/source:\s*\{\s*\[Op\.ne\]:\s*'campaign_test'\s*\}/);
  });
});

describe('what it writes stays idempotent on re-run', () => {
  it('uses findOrCreate keyed so a second scan cannot duplicate a row', () => {
    expect(source).toMatch(/RevenueOpportunity\.findOrCreate/);
    expect(source).toMatch(/where:\s*\{\s*entity_type:[\s\S]{0,140}entity_id:/);
  });

  it('counts value only for rows it actually created', () => {
    // `if (created)` is what stops a re-run inflating the total by recounting existing rows.
    expect(source).toMatch(/if\s*\(created\)\s*totalValue\s*\+=/);
  });
});

describe('the figure it reports is labelled as modelled, not measured', () => {
  it('says so in the text a reader sees, not only in a comment', () => {
    expect(source).toMatch(/modelled/);
    expect(source).toMatch(/not measured from anything agreed/);
  });

  it('does not call a scored lead an open deal', () => {
    expect(source).toMatch(/high-intent signal rather than an open deal/);
  });
});
