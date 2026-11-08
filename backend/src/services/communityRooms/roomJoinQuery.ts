import { Op, type WhereOptions } from 'sequelize';
import type { CommunityRoomAttributes } from '../../models/CommunityRoom';
import { ROOM_JOIN_TOKEN_KEY } from './roomJoinToken';

/**
 * The lookup that turns a join token into a room, isolated here for one reason:
 * it needs a type assertion, and an assertion belongs somewhere it can be
 * explained and pinned by a test rather than buried in a route.
 *
 * WHY THE ASSERTION. Sequelize does not model JSONB containment in its types.
 * For an attribute declared `Record<string, unknown>`, `Op.contains` is typed to
 * accept only `Fn | Col | Literal | ...`, so handing it a match object is a
 * compile error (TS2769) even though the SQL it generates is exactly right.
 *
 * WHY IT IS SAFE. Verified against the production database that this produces
 *
 *     WHERE "community_rooms"."metadata" @> '{"join_token":"<token>"}'
 *
 * and, validated both ways, that it matches on key AND value: an absent value
 * returns nothing, and a key whose value differs returns nothing.
 *
 * WHY THE TOKEN'S SHAPE MATTERS HERE. That value is **interpolated into the
 * statement** by Sequelize's query generator, not bound as a parameter. The
 * generator escapes it, and `isJoinTokenShape` restricts it to `[0-9a-f]{32}`
 * before it ever reaches this function. Anything that relaxes that check has to
 * re-establish this property first.
 *
 * `roomJoinQuery.test.ts` asserts the generated statement so the assertion
 * cannot quietly start producing something else.
 */
export function joinTokenWhere(token: string): WhereOptions<CommunityRoomAttributes> {
  return {
    metadata: { [Op.contains]: { [ROOM_JOIN_TOKEN_KEY]: token } },
  } as unknown as WhereOptions<CommunityRoomAttributes>;
}
