import { expectNoRoomUrl, findRoomUrl, SENTINEL_PROVIDER_URL } from './noRoomUrl';

/** The deep scan itself is tested, so a check that "passes" cannot be a scan that sees nothing. */
describe('expectNoRoomUrl', () => {
  it('a clean body passes, including the consent-room PAGE link (roomPage)', () => {
    expect(() => expectNoRoomUrl({ booked: { startsAt: '2026-11-23T15:00:00.000Z', roomPage: 'https://hire.refactored.ai/room/?i=x&e=1&t=y' }, list: [1, 'a', null] })).not.toThrow();
  });
  it('the sentinel anywhere fails, even deep in a nested array', () => {
    const body = { a: [{ b: [{ c: `see ${SENTINEL_PROVIDER_URL}?pwd=1` }] }] };
    expect(findRoomUrl(body)).toEqual(['$.a[0].b[0].c']);
    expect(() => expectNoRoomUrl(body)).toThrow(/room link leaked at \$\.a\[0\]\.b\[0\]\.c/);
  });
  it('a banned key fails whatever its value, even null', () => {
    for (const k of ['room_url', 'roomUrl', 'joinUrl', 'join_url', 'providerEventId']) expect(findRoomUrl({ x: { [k]: null } })).toEqual([`$.x.${k}`]);
  });
});
