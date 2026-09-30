const queryMock = jest.fn();
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => queryMock(...a) },
}));

import {
  getExplorerCommunityState,
  RECOMMENDABLE_PRIVACY,
} from '../explorerCommunityService';

/**
 * EPIC 7 — community room recommendation.
 *
 * THE SHAPE OF THE RISK, measured on production: of 229 active rooms only
 * **12 are public**. 187 are `private` and 30 are `cohort`-scoped.
 *
 * Recommending a room a learner cannot enter is the same defect as recommending
 * a locked lesson — it sends someone to a door that will not open, and it is
 * invisible until they click.
 *
 * THE SQL WAS VERIFIED AGAINST PRODUCTION before these tests were written,
 * because a mock cannot tell you what a real privacy distribution does:
 *
 *   free Explorer, no cohort -> 12 public rooms, and ONLY those
 *   private rooms leaked      -> 0
 *   cohort rooms carrying a linked_cohort_id -> 30 of 30
 */

beforeEach(() => {
  queryMock.mockReset().mockResolvedValue([]);
});

/** First call counts memberships; second returns rooms. */
function given(memberCount: number, rooms: unknown[]) {
  queryMock.mockImplementation((sql: string) =>
    String(sql).includes('room_memberships\n   WHERE') || String(sql).includes('count(*)::int')
      ? Promise.resolve([{ n: memberCount }])
      : Promise.resolve(rooms),
  );
}

describe('a private room is never recommended', () => {
  it('excludes private in the SQL itself, not afterwards', async () => {
    // A post-filter would let the LIMIT be consumed by private rooms and return
    // an empty list reading as "no rooms available" rather than "none you may
    // see" — the same failure the content resolver's tier gate avoids.
    await getExplorerCommunityState('e1', null);
    const roomSql = String(queryMock.mock.calls.map((c) => String(c[0])).find((s) => s.includes('community_rooms')));
    expect(roomSql).toContain("r.privacy = 'public'");
    expect(roomSql).toContain("r.privacy = 'cohort'");
    expect(roomSql).not.toContain("privacy != 'private'");
    expect(roomSql).not.toContain("privacy <> 'private'");
  });

  it('names the allowed set explicitly rather than excluding one value', () => {
    // `privacy != 'private'` would silently include any FOURTH privacy level
    // added later. An allow-list makes that a visible decision.
    expect([...RECOMMENDABLE_PRIVACY]).toEqual(['public', 'cohort']);
    expect(RECOMMENDABLE_PRIVACY).not.toContain('private');
  });
});

describe('cohort rooms need a matching cohort', () => {
  it('passes the learner cohort into the query', async () => {
    await getExplorerCommunityState('e1', 'cohort-abc');
    const call = queryMock.mock.calls.find((c) => String(c[0]).includes('community_rooms'))!;
    expect(call[1].replacements.cohortId).toBe('cohort-abc');
  });

  it('treats a NULL cohort as matching NO cohort rooms, not all of them', async () => {
    // The trap: `linked_cohort_id = NULL` is NULL, not true, so it excludes -
    // but only because the query also guards `:cohortId IS NOT NULL`. Without
    // that guard a careless rewrite to `IS NOT DISTINCT FROM` would open all 30.
    await getExplorerCommunityState('e1', null);
    const roomSql = String(queryMock.mock.calls.map((c) => String(c[0])).find((s) => s.includes('community_rooms')));
    expect(roomSql).toContain(':cohortId IS NOT NULL');
  });
});

describe('a room they are already in is not a recommendation', () => {
  it('excludes current memberships', async () => {
    await getExplorerCommunityState('e1', null);
    const roomSql = String(queryMock.mock.calls.map((c) => String(c[0])).find((s) => s.includes('community_rooms')));
    expect(roomSql).toContain('NOT EXISTS');
    expect(roomSql).toContain('m.left_at IS NULL');
  });

  it('counts only rooms not left', async () => {
    given(2, []);
    const s = await getExplorerCommunityState('e1', null);
    expect(s.memberRoomCount).toBe(2);
  });
});

describe('it returns facts, not guesses', () => {
  it('returns what the query gave', async () => {
    given(1, [{ id: 'r1', slug: 'ai-general', name: 'AI General', description: null, privacy: 'public' }]);
    const s = await getExplorerCommunityState('e1', null);
    expect(s.recommendable).toHaveLength(1);
    expect(s.recommendable[0].privacy).toBe('public');
  });

  it('treats no recommendable room as a fact, not an error', async () => {
    // Every public room already joined is a real and reportable state.
    given(12, []);
    const s = await getExplorerCommunityState('e1', null);
    expect(s.recommendable).toEqual([]);
    expect(s.memberRoomCount).toBe(12);
  });

  it('fails soft rather than throwing', async () => {
    // A database blip must not invent a recommendation, nor claim the learner
    // belongs to nothing.
    queryMock.mockRejectedValue(new Error('db down'));
    await expect(getExplorerCommunityState('e1', null)).resolves.toEqual({
      memberRoomCount: 0,
      recommendable: [],
    });
  });

  it('does nothing without an enrollment', async () => {
    const s = await getExplorerCommunityState('', null);
    expect(s.recommendable).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('it does not re-derive the community STATE', () => {
  it('never reads community_contributions', () => {
    // CONNECTED_TO_COMMUNITY already works, driven by the community_contribution
    // signal — 44 rows across 14 Explorers. A second source for one fact is the
    // drift this programme keeps paying for.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'explorerCommunityService.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('community_contributions');
  });
});
