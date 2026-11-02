/**
 * Which hosts a rehearsal can take out from under a live room.
 *
 * The judgement is between two tables that cannot see each other — the registry's
 * `purpose` and a count of rooms carrying each host's permanent link — which is why it
 * is a pure function and why it is worth testing on its own. Both allocators walk the
 * pool in priority order and take the first host that fits, so a host matching both is
 * not a rare collision; it is the one they both reach for first.
 */

import { crossPurposeHosts, type ZoomHostRow } from '../zoomHostRegistry';

type HostFixture = Pick<ZoomHostRow, 'host_email' | 'purpose' | 'enabled' | 'verified_at'>;

const host = (over: Partial<HostFixture> = {}): HostFixture => ({
  host_email: 'a@example.com',
  purpose: 'any',
  enabled: true,
  verified_at: new Date('2026-11-01T00:00:00Z'),
  ...over,
});

const rooms = (pairs: Record<string, number>) => new Map(Object.entries(pairs));

describe('crossPurposeHosts', () => {
  it('reports nothing for an empty registry', () => {
    expect(crossPurposeHosts([], rooms({}))).toEqual([]);
  });

  it('FLAGS an allocatable "any" host that already carries a room', () => {
    expect(crossPurposeHosts([host()], rooms({ 'a@example.com': 1 })))
      .toEqual([{ host_email: 'a@example.com', room_count: 1 }]);
  });

  it('does not flag an "any" host carrying no room — nothing can be taken from it', () => {
    expect(crossPurposeHosts([host()], rooms({ 'other@example.com': 3 }))).toEqual([]);
  });

  it.each(['room', 'practice'])(
    'does not flag purpose %s, which only one allocator matches', (purpose) => {
      expect(crossPurposeHosts([host({ purpose })], rooms({ 'a@example.com': 2 }))).toEqual([]);
    },
  );

  it('does not flag a disabled host, because no allocator can pick it', () => {
    expect(crossPurposeHosts([host({ enabled: false })], rooms({ 'a@example.com': 1 }))).toEqual([]);
  });

  it('does not flag an unverified host, for the same reason', () => {
    // Reporting un-pickable hosts would pad this list and train an operator to skim it.
    expect(crossPurposeHosts([host({ verified_at: null })], rooms({ 'a@example.com': 1 })))
      .toEqual([]);
  });

  it('matches the room count case-insensitively, since the registry lowercases on write', () => {
    expect(crossPurposeHosts([host({ host_email: 'Program.101@Colaberry.com' })],
      rooms({ 'program.101@colaberry.com': 1 })))
      .toEqual([{ host_email: 'Program.101@Colaberry.com', room_count: 1 }]);
  });

  it('matches a stored address with stray whitespace', () => {
    expect(crossPurposeHosts([host({ host_email: ' a@example.com ' })], rooms({ 'a@example.com': 4 })))
      .toEqual([{ host_email: 'a@example.com', room_count: 4 }]);
  });

  it('orders by rooms at risk, then by address, so the worst case is read first', () => {
    const result = crossPurposeHosts(
      [
        host({ host_email: 'b@example.com' }),
        host({ host_email: 'c@example.com' }),
        host({ host_email: 'a@example.com' }),
      ],
      rooms({ 'a@example.com': 1, 'b@example.com': 3, 'c@example.com': 1 }),
    );
    expect(result).toEqual([
      { host_email: 'b@example.com', room_count: 3 },
      { host_email: 'a@example.com', room_count: 1 },
      { host_email: 'c@example.com', room_count: 1 },
    ]);
  });

  it('reports a partitioned pool as clean even while every host carries rooms', () => {
    // The end state this whole feature is aiming at: six hosts, all busy, none shared.
    const pool = [
      host({ host_email: 'r1@example.com', purpose: 'room' }),
      host({ host_email: 'r2@example.com', purpose: 'room' }),
      host({ host_email: 'p1@example.com', purpose: 'practice' }),
    ];
    expect(crossPurposeHosts(pool, rooms({ 'r1@example.com': 1, 'r2@example.com': 1 }))).toEqual([]);
  });
});
