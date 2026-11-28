/**
 * The visual rules: what the demo draws, decided from the shape of the data alone.
 *
 * Three properties carry this file, and two of them are negative.
 *
 *  1. DOMAIN INDEPENDENCE. The same function must find a timeline in shift coverage, in a sales
 *     pipeline and in a maintenance queue, for structural reasons, and must find none in a spec
 *     that has not earned one. A rule that reads a domain word passes one fixture and fails the
 *     rest, which is why there are six in unrelated shapes.
 *  2. REFUSALS ARE ASSERTED WITH THEIR CAUSE. "No funnel" is not a result; "no funnel because
 *     every stage holds the same number of rows" is. Asserting only absence would pass if the
 *     detection were deleted outright.
 *  3. NOTHING IS INVENTED. Every id a block names must exist in the spec it came from, and a
 *     `private` field may never appear in any block, on any screen, in any fixture.
 */
import fs from 'fs';
import path from 'path';
import { validateDemoSpecShape } from '../demoSpec/contract';
import { visualPlan, primaryWorkEntity, type VisualPlanResult } from '../demoVisual/visualPlan';
import { entitiesOf } from '../demoVisual/specReaders';
import {
  MAX_BAR_ROWS, MAX_FUNNEL_STAGES, MAX_TIMELINE_LANES, MIN_BAR_ROWS, MIN_TIMELINE_LANES,
} from '../demoVisual/visualRules';
import {
  ALL_FIXTURES, documentReview, maintenanceQueue, overCapSpec, salesPipeline, shiftCoverage, thinSpec,
} from './visualFixtures';

const kinds = (plan: VisualPlanResult, screen: string): string[] =>
  (plan.screens.find((s) => s.screen === screen)?.blocks || []).map((b) => b.kind);

const skipFor = (plan: VisualPlanResult, screen: string, kind: string) =>
  (plan.screens.find((s) => s.screen === screen)?.skipped || []).find((s) => s.kind === kind);

const allBlocks = (plan: VisualPlanResult) =>
  [...plan.global, ...plan.screens.flatMap((s) => s.blocks)];

describe('the fixtures are real specs, so nothing below is proved against a shape that cannot exist', () => {
  it.each(ALL_FIXTURES.map((f) => [f.name, f.spec] as const))('%s passes the demo-spec contract', (_name, spec) => {
    expect(validateDemoSpecShape(spec)).toEqual([]);
  });

  it('covers six structurally different specs, not six wordings of one', () => {
    const plans = ALL_FIXTURES.map((f) => visualPlan(f.spec));
    const shapes = plans.map((p) => JSON.stringify(p.screens.map((s) => s.blocks.map((b) => b.kind))));
    expect(new Set(shapes).size).toBe(ALL_FIXTURES.length);
  });
});

describe('determinism', () => {
  it.each(ALL_FIXTURES.map((f) => [f.name, f.spec] as const))('%s plans identically twice', (_name, spec) => {
    expect(visualPlan(spec)).toEqual(visualPlan(spec));
  });

  it('takes "now" from the latest event, never from the wall clock', () => {
    // The whole demo is reproducible only if this is true: a clock read would make the same spec
    // render differently tomorrow, and the timeline's now line is drawn from this value.
    expect(visualPlan(shiftCoverage).now).toBe('2026-11-25T13:30:00Z');
    expect(visualPlan(thinSpec).now).toBe('2026-11-25T14:00:00Z');
  });

  it('answers null for "now" when a spec records no events at all', () => {
    const empty = { ...thinSpec, events: [] };
    expect(visualPlan(empty).now).toBeNull();
  });
});

describe('the primary work entity is found structurally', () => {
  it('picks the entity the events and the other entities point at', () => {
    expect(primaryWorkEntity(entitiesOf(shiftCoverage), shiftCoverage.events)).toBe('gap');
    expect(primaryWorkEntity(entitiesOf(salesPipeline), salesPipeline.events)).toBe('deal');
    expect(primaryWorkEntity(entitiesOf(maintenanceQueue), maintenanceQueue.events)).toBe('work_order');
  });

  it('answers null rather than guessing when nothing points anywhere', () => {
    // thinSpec's one event names a work id no row carries, and no entity refs another.
    expect(primaryWorkEntity(entitiesOf(thinSpec), thinSpec.events)).toBeNull();
  });
});

describe('timeline: two routes to the same picture', () => {
  it('draws lanes from the WORK ITEMS when they carry two times of their own', () => {
    const plan = visualPlan(shiftCoverage);
    const block = plan.screens.find((s) => s.screen === 'today')?.blocks.find((b) => b.kind === 'timeline');
    expect(block).toBeDefined();
    expect(block!.entity).toBe('gap');
    expect(block!.fields).toEqual(['opens_at', 'closes_at']);
    expect(block!.items).toEqual(['g1', 'g2', 'g3']);
  });

  it('falls back to lanes from the EVENTS when rows carry only one time', () => {
    // The sales fixture exists for this: `deal` has `opened_on` and nothing else, so route 1
    // cannot fire and route 2 must. A rule that only knew route 1 would silently lose the
    // timeline for every project whose work items have a single date.
    const block = visualPlan(salesPipeline).screens
      .find((s) => s.screen === 'board')?.blocks.find((b) => b.kind === 'timeline');
    expect(block).toBeDefined();
    expect(block!.fields).toEqual(['work_id', 'occurred_at']);
    expect(block!.items).toEqual(['deal1', 'deal2', 'deal3']);
  });

  it('refuses a timeline the data has not earned, and says why', () => {
    const skip = skipFor(visualPlan(thinSpec), 'home', 'timeline');
    expect(skip).toBeDefined();
    expect(skip!.reason).toBe('below_minimum');
    expect(skip!.fallback).toBe('table');
    expect(skip!.detail).toContain(`needs ${MIN_TIMELINE_LANES} lanes`);
  });
});

describe('funnel: narrowing is the whole point', () => {
  it('draws stages in narrowing order for child rows of the work item', () => {
    const block = visualPlan(shiftCoverage).screens
      .find((s) => s.screen === 'today')?.blocks.find((b) => b.kind === 'funnel');
    expect(block).toBeDefined();
    expect(block!.entity).toBe('offer');
    expect(block!.items).toEqual(['sent', 'replied', 'accepted']);
  });

  it('refuses a funnel whose stages all hold the same count, because nothing narrows', () => {
    /*
     * Built here rather than taken from a fixture, because this needs the ONE shape no fixture
     * has: a real child of the work entity whose stages are all the same size. An earlier version
     * of this test asserted against `documentReview` and accepted either skip reason, which made
     * it pass for the wrong cause (that spec has no child entity at all, so it never reaches the
     * narrowing check). Equal counts drawn as a funnel imply a drop-off that is not in the data.
     */
    const flat = {
      ...documentReview,
      entities: {
        ...(documentReview as { entities?: Record<string, unknown> }).entities,
        step: {
          label: 'Step', plural: 'Steps', status: 'state',
          fields: [
            { key: 'doc', type: 'ref', ref: 'doc' },
            { key: 'state', type: 'enum', labels: { a: 'A', b: 'B' } },
          ],
          rows: [
            { id: 'st1', doc: 'doc1', state: 'a' }, { id: 'st2', doc: 'doc2', state: 'a' },
            { id: 'st3', doc: 'doc1', state: 'b' }, { id: 'st4', doc: 'doc2', state: 'b' },
          ],
        },
      },
    } as typeof documentReview;
    expect(validateDemoSpecShape(flat)).toEqual([]);

    const skip = (visualPlan(flat).screens.find((s) => s.screen === 'desk')?.skipped || [])
      .find((s) => s.kind === 'funnel' && s.entity === 'step');
    expect(skip).toBeDefined();
    expect(skip!.reason).toBe('no_variation');
    expect(skip!.detail).toContain('nothing narrows');
  });

  it('refuses a funnel on an entity that is not a child of the work item', () => {
    const skip = skipFor(visualPlan(documentReview), 'desk', 'funnel');
    expect(skip).toBeDefined();
    expect(skip!.reason).toBe('no_candidate_data');
  });

  it('refuses a funnel when the spec has no child entity at all', () => {
    const skip = skipFor(visualPlan(maintenanceQueue), 'desk', 'funnel');
    expect(skip).toBeDefined();
    expect(skip!.reason).toBe('no_candidate_data');
  });
});

describe('bars', () => {
  it('draws a comparison when enough rows share one number', () => {
    const block = visualPlan(shiftCoverage).screens
      .find((s) => s.screen === 'people')?.blocks.find((b) => b.kind === 'comparison_bars');
    expect(block).toBeDefined();
    expect(block!.fields).toEqual(['hours']);
    expect(block!.items).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('refuses a comparison below the minimum and names the count it had', () => {
    const skip = skipFor(visualPlan(thinSpec), 'items', 'comparison_bars');
    expect(skip).toBeDefined();
    expect(skip!.reason).toBe('below_minimum');
    expect(skip!.detail).toContain(`needs ${MIN_BAR_ROWS}`);
  });

  it('draws a meter against its stated target rather than alone', () => {
    const block = visualPlan(maintenanceQueue).screens
      .find((s) => s.screen === 'orders')?.blocks.find((b) => b.kind === 'target_bar');
    expect(block).toBeDefined();
    expect(block!.fields).toEqual(['response_minutes']);
  });

  it('refuses a target bar where no number states what it is measured against', () => {
    const skip = skipFor(visualPlan(salesPipeline), 'deals', 'target_bar');
    expect(skip).toBeDefined();
    expect(skip!.reason).toBe('no_candidate_data');
  });
});

describe('events become pictures of their own', () => {
  it('draws a path of steps from causally linked events', () => {
    const block = visualPlan(shiftCoverage).screens
      .find((s) => s.screen === 'gaps')?.blocks.find((b) => b.kind === 'step_path');
    expect(block).toBeDefined();
    expect(block!.items).toEqual(['g1', 'g2']);
  });

  it('refuses a path when no event names a parent', () => {
    const skip = skipFor(visualPlan(documentReview), 'docs', 'step_path');
    expect(skip).toBeDefined();
    expect(skip!.reason).toBe('below_minimum');
  });

  it('builds the roster from the EVENTS, not from a roster the plan may have left empty', () => {
    // Guard 4, and the defect it comes from: the old engine printed "the plan names no agents"
    // on a screen whose activity log named twelve.
    const plan = visualPlan(shiftCoverage);
    const block = plan.global.find((b) => b.kind === 'actor_summary');
    expect(block).toBeDefined();
    expect(block!.items).toEqual(['agent.one', 'person.dana']);
    expect(block!.fields).toContain('autonomy_tier');
  });

  it('leaves the tier bar out when every action shares one tier', () => {
    const block = visualPlan(documentReview).global.find((b) => b.kind === 'actor_summary');
    expect(block).toBeDefined();
    expect(block!.fields).not.toContain('autonomy_tier');
  });
});

describe('decisions', () => {
  it('collects the rows an action is waiting on', () => {
    const block = visualPlan(shiftCoverage).global.find((b) => b.kind === 'decision_cards');
    expect(block).toBeDefined();
    expect(block!.items).toEqual(['gap:g1', 'gap:g2']);
  });

  it('skips the decisions view when no action declares a condition', () => {
    const skip = visualPlan(thinSpec).globalSkipped.find((s) => s.kind === 'decision_cards');
    expect(skip).toBeDefined();
    expect(skip!.reason).toBe('no_candidate_data');
  });
});

describe('caps', () => {
  const plan = visualPlan(overCapSpec);

  it('trims timeline lanes and reports the total so the rest stays reachable', () => {
    const block = plan.screens.find((s) => s.screen === 'board')?.blocks.find((b) => b.kind === 'timeline');
    expect(block).toBeDefined();
    expect(block!.items).toHaveLength(MAX_TIMELINE_LANES);
    expect(block!.capped).toEqual({ shown: MAX_TIMELINE_LANES, total: 30 });
  });

  it('trims bars the same way', () => {
    const block = plan.screens.find((s) => s.screen === 'cases')?.blocks.find((b) => b.kind === 'comparison_bars');
    expect(block).toBeDefined();
    expect(block!.items).toHaveLength(MAX_BAR_ROWS);
    expect(block!.capped!.total).toBe(30);
  });

  it('leaves blocks under the cap untrimmed, so the cap is a limit and not a target', () => {
    const block = visualPlan(shiftCoverage).screens
      .find((s) => s.screen === 'today')?.blocks.find((b) => b.kind === 'timeline');
    expect(block!.capped).toBeNull();
    expect(block!.items.length).toBeLessThan(MAX_TIMELINE_LANES);
  });

  it('never draws more funnel stages than the cap', () => {
    for (const f of ALL_FIXTURES) {
      for (const s of visualPlan(f.spec).screens) {
        for (const b of s.blocks.filter((x) => x.kind === 'funnel')) {
          expect(b.items.length).toBeLessThanOrEqual(MAX_FUNNEL_STAGES);
        }
      }
    }
  });
});

describe('nothing is invented, and private stays private', () => {
  it('every id a block names exists in the spec it came from', () => {
    for (const f of ALL_FIXTURES) {
      const plan = visualPlan(f.spec);
      const entities = entitiesOf(f.spec);
      const rowIds = new Set(entities.flatMap((e) => e.rows.map((r) => `${e.key}:${String(r.id)}`)));
      const bareIds = new Set(entities.flatMap((e) => e.rows.map((r) => String(r.id))));
      const workIds = new Set(f.spec.events.map((e) => e.work_id));
      const actorIds = new Set(f.spec.events.map((e) => e.actor.id));
      for (const block of allBlocks(plan)) {
        if (block.kind === 'funnel' || block.kind === 'status_pills') continue; // items are values
        for (const id of block.items) {
          expect(
            rowIds.has(id) || bareIds.has(id) || workIds.has(id) || actorIds.has(id),
          ).toBe(true);
        }
      }
    }
  });

  it('never puts a private field in any block of any fixture', () => {
    // documentReview carries one. The contract says the row holds no value for it at all, so a
    // chart of it could only be a chart of nothing presented as something.
    for (const f of ALL_FIXTURES) {
      const privateKeys = entitiesOf(f.spec)
        .flatMap((e) => e.fields.filter((x) => x.type === 'private').map((x) => x.key));
      if (!privateKeys.length) continue;
      for (const block of allBlocks(visualPlan(f.spec))) {
        for (const key of privateKeys) expect(block.fields).not.toContain(key);
      }
    }
    // Proves the loop above had something to find, rather than passing on an empty set.
    expect(entitiesOf(documentReview).flatMap((e) => e.fields.filter((x) => x.type === 'private'))).toHaveLength(1);
  });

  it('quotes long text instead of charting it', () => {
    const block = visualPlan(documentReview).screens
      .find((s) => s.screen === 'docs')?.blocks.find((b) => b.kind === 'quote_block');
    expect(block).toBeDefined();
    expect(block!.fields).toEqual(['summary']);
  });
});

describe('the rules carry no domain knowledge', () => {
  const SRC = path.join(__dirname, '..', 'demoVisual');
  const sources = fs.readdirSync(SRC).filter((f) => f.endsWith('.ts'))
    .map((f) => ({ f, text: fs.readFileSync(path.join(SRC, f), 'utf8') }));

  it('reads the rule source, so the sweep below cannot pass by scanning nothing', () => {
    expect(sources.map((s) => s.f).sort()).toEqual(['specReaders.ts', 'visualPlan.ts', 'visualRules.ts']);
    expect(sources.every((s) => s.text.length > 500)).toBe(true);
  });

  it('names no domain term from any fixture or from the reference', () => {
    // The reference target is one project in one domain. Nothing in the engine may depend on it.
    const banned = [
      'shiftfill', 'hygienist', 'dental', 'gap', 'deal', 'work_order', 'crew', 'offer', 'doc',
    ];
    for (const { f, text } of sources) {
      // Comments are where domain words legitimately appear as examples, so they are stripped
      // first. Checking the whole file would fail on the word "deal" inside a sentence and would
      // then be loosened until it checked nothing.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const word of banned) {
        expect({ file: f, word, found: new RegExp(`['"\`]${word}['"\`]`, 'i').test(code) })
          .toEqual({ file: f, word, found: false });
      }
    }
  });
});
