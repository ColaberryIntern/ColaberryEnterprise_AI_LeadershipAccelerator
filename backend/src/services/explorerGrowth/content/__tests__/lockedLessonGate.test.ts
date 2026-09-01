const queryMock = jest.fn();
jest.mock('../../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => queryMock(...a) },
}));

import * as fs from 'fs';
import * as path from 'path';
import { resolveContentAssets, resolveAllForCandidate } from '../resolveContentAssets';
import { audienceTagsForWeek } from '../syncTimelineCards';
import type { ContentAssetQuery } from '../../governor/types';

/**
 * EPIC 7's Definition of Done: **no locked lesson is ever recommended.**
 *
 * THE DEFECT THIS CLOSES, measured on production before the fix:
 *
 *   week 0  -> 130 decisions   (free preview — openable)
 *   week 9  ->  13 decisions   (locked)
 *   of those 13, TWELVE learners were free-preview and would have hit a paywall
 *
 * EPIC 5 shipped the resolver with no entitlement filter at all. Nothing sent,
 * so nobody received it — but it was one flag away.
 *
 * THE RULE IS THE PORTAL'S OWN, not a second opinion:
 *
 *   timelineService.ts:231 — `isFreeTier ? allCards.filter(c => c.week === 0) : allCards`
 *
 * A free-preview learner sees week 0 and NOTHING else. Note the consequence for
 * an undated card: `null !== 0`, so it is locked too.
 */

const AS_OF = new Date('2026-09-01T12:00:00Z');
const q = (over: Partial<ContentAssetQuery> = {}): ContentAssetQuery =>
  ({ asset_type: 'lesson_recommendation', ...over }) as ContentAssetQuery;

beforeEach(() => {
  queryMock.mockReset().mockResolvedValue([
    { id: 'a1', asset_type: 'LESSON', title: 'Welcome', url: '/x', source_system: 'timeline_cards', source_id: 'c1' },
  ]);
});

describe('the sync tags who can open each card', () => {
  it('marks week 0 openable by BOTH tiers', () => {
    expect(audienceTagsForWeek(0)).toEqual(['free_preview', 'full_access']);
  });

  it.each([1, 2, 9, 12])('marks week %p full-access only', (wk) => {
    expect(audienceTagsForWeek(wk)).toEqual(['full_access']);
  });

  it('marks an UNDATED card full-access only — null is not week 0', () => {
    // The trap. 332 of 585 cards have no week, and `journey_stage_tags` calls
    // them `evergreen`, which sounds portable. The portal filters on
    // `week === 0`, so an undated card is locked for a free learner. Two
    // different questions — where content sits, and who may open it.
    expect(audienceTagsForWeek(null)).toEqual(['full_access']);
    expect(audienceTagsForWeek(undefined)).toEqual(['full_access']);
  });

  it('never marks anything free_preview without also allowing full_access', () => {
    // A card a paying learner cannot open would be a different bug entirely.
    for (const wk of [null, 0, 1, 5, 12]) {
      const tags = audienceTagsForWeek(wk as number | null);
      if (tags.includes('free_preview')) expect(tags).toContain('full_access');
    }
  });
});

describe('the resolver filters on tier — at the point of selection', () => {
  it('binds the tier into the query for a free-preview learner', async () => {
    await resolveContentAssets(q(), AS_OF, 'free_preview');
    expect(queryMock.mock.calls[0][1].replacements.tier).toBe('free_preview');
  });

  it('binds the tier for a full-access learner', async () => {
    await resolveContentAssets(q(), AS_OF, 'full_access');
    expect(queryMock.mock.calls[0][1].replacements.tier).toBe('full_access');
  });

  it('filters in SQL rather than after the fact', async () => {
    // Post-filtering would let the LIMIT be consumed by locked rows and return
    // an empty list that reads as "no content" rather than "none you can open".
    await resolveContentAssets(q(), AS_OF, 'free_preview');
    expect(String(queryMock.mock.calls[0][0])).toContain(':tier = ANY(audience_tags)');
  });

  it('applies the gate BEFORE the row limit', async () => {
    const sql = String(queryMock.mock.calls.length ? queryMock.mock.calls[0][0] : '');
    await resolveContentAssets(q(), AS_OF, 'free_preview');
    const text = sql || String(queryMock.mock.calls[0][0]);
    expect(text.indexOf('audience_tags')).toBeLessThan(text.indexOf('LIMIT'));
  });

  it('passes the tier through resolveAllForCandidate to every query', async () => {
    await resolveAllForCandidate([q(), q({ asset_type: 'weekly_digest' })], AS_OF, 'free_preview');
    for (const call of queryMock.mock.calls) {
      expect(call[1].replacements.tier).toBe('free_preview');
    }
  });
});

describe('the tier cannot be omitted or defaulted', () => {
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'resolveContentAssets.ts'), 'utf8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('read real code, not just comments', () => {
    expect(CODE).toContain('export async function resolveContentAssets');
    expect(CODE.length).toBeGreaterThan(1000);
  });

  it('takes tier as a REQUIRED parameter', () => {
    // Not `tier?:` and not `tier = 'full_access'`. A default would have hidden
    // the original defect: defaulting to full_access silently leaks locked
    // content, and defaulting to free_preview silently narrows for paying
    // learners. The caller must say which.
    expect(CODE).toContain('tier: AudienceTier');
    expect(CODE).not.toContain('tier?: AudienceTier');
    expect(CODE).not.toMatch(/tier: AudienceTier = /);
  });

  it('is enforced by the Governor using the portal own gate, not a copy of it', () => {
    const gov = fs.readFileSync(path.join(__dirname, '..', '..', 'governor', 'runGovernor.ts'), 'utf8');
    // Asking a second source, or re-deriving `week === 0` here, is exactly the
    // drift that produced the disjoint vocabularies earlier in this programme.
    expect(gov).toContain('isFreePreviewTier');
    expect(gov).toContain("'free_preview' : 'full_access'");
    expect(gov).not.toContain('week === 0');
  });
});
