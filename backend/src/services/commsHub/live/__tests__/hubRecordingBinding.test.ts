/**
 * CH5.3: a hub event's recording is bound by the EXISTING health loop (L8.4), not by hub code. This
 * proves it rather than reimplementing it: an occurrence shaped exactly as CH5.1 writes it (shared
 * Cloudflare input, no room, source ref 'community_event') is loaded by the loop's own query, which
 * filters on state only, and the real runner binds the provider's recording uid to it.
 */
import { sequelize } from '../../../../config/database';
import { runHealthTick, __resetHealthMemory } from '../../../broadcast/broadcastHealthRunner';
import { loadObservableOccurrences } from '../../../broadcast/broadcastHealthLoop';

const UID = 'f256e6ea9341d51eea64c9454659e576';
const hubOccurrence = { id: 'hub-occ-1', editorial_state: 'live', provider: 'cloudflare', provider_session_id: UID, provider_instance_uuid: null, version: 4 };

let mockQuery: jest.SpyInstance;
beforeEach(() => { mockQuery = jest.spyOn(sequelize, 'query'); __resetHealthMemory(); });
afterEach(() => mockQuery.mockRestore());

it('the loop\'s own query picks occurrences by state only, so hub occurrences (no room, any source) are observed', async () => {
  mockQuery.mockResolvedValue([[hubOccurrence], 1] as never);
  expect(await loadObservableOccurrences()).toEqual([hubOccurrence]);
  const [sql, opts] = mockQuery.mock.calls[0];
  expect(sql).toMatch(/FROM broadcast_occurrences\s+WHERE editorial_state IN \(:states\)/);
  expect(sql).not.toMatch(/source_type|room_id|source_refs/);
  expect(opts.replacements.states).toEqual(['backstage', 'live', 'reconnecting']);
});

it('the real runner binds the recording uid the provider reports to the hub occurrence', async () => {
  const bindRecording = jest.fn(async () => undefined);
  await runHealthTick({
    loadObservable: async () => [hubOccurrence],
    observe: async () => ({ live: true, videoUid: 'a1b2c3d4e5f60718293a4b5c6d7e8f90' }),
    applyEvent: async () => undefined,
    bindRecording,
    log: () => undefined,
  });
  expect(bindRecording).toHaveBeenCalledWith('hub-occ-1', 'a1b2c3d4e5f60718293a4b5c6d7e8f90');
});
