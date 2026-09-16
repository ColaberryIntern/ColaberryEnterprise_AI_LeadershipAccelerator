/**
 * milestonePromotion — the write path: sync, compute, latch, persist. Proves
 * the two properties the ladder promises (docs/POINTS_LADDER_DECISIONS.md):
 * it lands a student on the HIGHEST cleared rung in one pass, and it NEVER
 * lowers anyone — including someone holding a legacy rank.
 */
jest.mock('../../../models/StudentLevel', () => ({ __esModule: true, default: { findOrCreate: jest.fn() } }));
jest.mock('../milestoneService', () => ({ syncMilestones: jest.fn(), getMilestoneState: jest.fn() }));

import StudentLevel from '../../../models/StudentLevel';
import { syncMilestones, getMilestoneState } from '../milestoneService';
import { evaluateMilestonePromotion, getMilestonePromotionStatus } from '../milestonePromotion';

const findOrCreate = StudentLevel.findOrCreate as unknown as jest.Mock;
const sync = syncMilestones as unknown as jest.Mock;
const state = getMilestoneState as unknown as jest.Mock;

function row(level_slug: string, rank: number) {
  const r: any = { level_slug, rank, promoted_at: null, update: jest.fn(async (patch: any) => Object.assign(r, patch)) };
  return r;
}
const st = (curriculumComplete: boolean, projectsComplete: number, certificationApproved = false) =>
  ({ curriculumComplete, projectsComplete, certificationApproved });

beforeEach(() => jest.clearAllMocks());

describe('evaluateMilestonePromotion', () => {
  it('lands a rank-0 student with curriculum + one project on AI Builder II in ONE pass', async () => {
    const r = row('builder', 0);
    findOrCreate.mockResolvedValue([r]);
    sync.mockResolvedValue({ state: st(true, 1), newlyLatched: [{ type: 'project_complete', source_ref: 'p1' }] });

    const out = await evaluateMilestonePromotion('e1');

    expect(out).toMatchObject({ promoted: true, level: 'builder_ii', rank: 2, previous: { level: 'builder', rank: 0 } });
    expect(r.update).toHaveBeenCalledWith(expect.objectContaining({
      level_slug: 'builder_ii', rank: 2,
      promotion_evidence: expect.objectContaining({ ladder: 'milestone', computed_rank: 2, held_rank: 0 }),
    }));
    expect(r.update.mock.calls[0][0].promoted_at).toBeInstanceOf(Date);
  });

  it('a legacy Junior Builder with no milestones keeps AI Builder I (D5), on the new slug', async () => {
    const r = row('junior_builder', 1);
    findOrCreate.mockResolvedValue([r]);
    sync.mockResolvedValue({ state: st(false, 0), newlyLatched: [] });

    const out = await evaluateMilestonePromotion('e1');

    expect(out).toMatchObject({ promoted: false, level: 'builder_i', rank: 1 });
    // The slug changes ladder, the rank does not move, and promoted_at is untouched.
    expect(r.update).toHaveBeenCalledWith(expect.objectContaining({ level_slug: 'builder_i', rank: 1 }));
    expect(r.update.mock.calls[0][0].promoted_at).toBeNull();
  });

  it('never lowers: a rank-3 row whose milestones now read 1 stays at 3', async () => {
    const r = row('builder_iii', 3);
    findOrCreate.mockResolvedValue([r]);
    sync.mockResolvedValue({ state: st(false, 1), newlyLatched: [] });
    const out = await evaluateMilestonePromotion('e1');
    expect(out).toMatchObject({ promoted: false, level: 'builder_iii', rank: 3 });
    expect(r.update).not.toHaveBeenCalled();
  });

  it('is idempotent: the same truth twice writes once', async () => {
    const r = row('builder', 0);
    findOrCreate.mockResolvedValue([r]);
    sync.mockResolvedValue({ state: st(true, 3), newlyLatched: [] });
    const a = await evaluateMilestonePromotion('e1');
    const b = await evaluateMilestonePromotion('e1');
    expect(a.rank).toBe(4);
    expect(b).toMatchObject({ promoted: false, rank: 4, level: 'builder_iv' });
    expect(r.update).toHaveBeenCalledTimes(1);
  });

  it('Program Graduate + approved certification → AI Architect', async () => {
    const r = row('builder_iv', 4);
    findOrCreate.mockResolvedValue([r]);
    sync.mockResolvedValue({ state: st(true, 3, true), newlyLatched: [{ type: 'certification_approved', source_ref: 'c1' }] });
    expect(await evaluateMilestonePromotion('e1')).toMatchObject({ promoted: true, level: 'ai_architect', rank: 5 });
  });

  it('a certification alone does not move a rank-0 student', async () => {
    const r = row('builder', 0);
    findOrCreate.mockResolvedValue([r]);
    sync.mockResolvedValue({ state: st(false, 0, true), newlyLatched: [] });
    expect(await evaluateMilestonePromotion('e1')).toMatchObject({ promoted: false, rank: 0, level: 'builder' });
    expect(r.update).not.toHaveBeenCalled();
  });
});

describe('getMilestonePromotionStatus (read-only)', () => {
  it('reports the rung, the next rung and student-language gaps, and never writes', async () => {
    const r = row('builder_ii', 2);
    findOrCreate.mockResolvedValue([r]);
    state.mockResolvedValue(st(true, 1));
    const s = await getMilestonePromotionStatus('e1');
    expect(s).toMatchObject({ rank: 2, rungName: 'AI Builder II', next_level: 'builder_iii', next_rung_name: 'AI Builder III', at_max: false });
    expect(s.gaps.map((g) => g.text)).toEqual(['Projects verified — 1 of 3']);
    expect(r.update).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });

  it('reads a legacy slug through the mapping so the gaps are computed from the right rung', async () => {
    findOrCreate.mockResolvedValue([row('junior_builder', 1)]);
    state.mockResolvedValue(st(false, 0));
    const s = await getMilestonePromotionStatus('e1');
    expect(s.rank).toBe(1);
    expect(s.rungName).toBe('AI Builder I');
    expect(s.next_rung_name).toBe('AI Builder II');
  });

  it('is at max at AI Architect (Senior is manual)', async () => {
    findOrCreate.mockResolvedValue([row('ai_architect', 5)]);
    state.mockResolvedValue(st(true, 3, true));
    const s = await getMilestonePromotionStatus('e1');
    expect(s.at_max).toBe(true);
    expect(s.next_level).toBeNull();
    expect(s.gaps).toEqual([]);
  });
});
