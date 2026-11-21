const mockQuery = jest.fn();
jest.mock('../../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
const mockFindByPk = jest.fn();
jest.mock('../../../../models/CommsHubEvent', () => ({ __esModule: true, default: { findByPk: (...a: unknown[]) => mockFindByPk(...a) } }));
const mockList = jest.fn();
jest.mock('../registrants', () => ({ listRegistrants: (...a: unknown[]) => mockList(...a) }));

import { registrantEnrollmentIds, registrantReach, RegistrantsUnavailableError } from '../registrantAudience';
import { ConnectorPermanentError } from '../../connectors/types';

/**
 * CH9.6 who an "event registrants" message reaches: the managed event's registrants who are on the
 * platform (active, portal-enabled, with a community profile). Never a partial list: Eventbrite
 * unreadable is a retry, not a send. A hub-made event has no registrants to message.
 */
const ROWS = [{ email: 'ada@x.test' }, { email: 'bo@x.test' }, { email: 'cy@x.test' }];
beforeEach(() => {
  jest.clearAllMocks();
  mockFindByPk.mockResolvedValue({ id: 'hub-1', ccpp_event_id: '777', title: 'AI Open House' });
  mockList.mockResolvedValue({ event: {}, eventbrite: 'ok', rows: ROWS });
  mockQuery.mockResolvedValue([{ id: 'e-ada' }, { id: 'e-bo' }]);
});

it('resolves the registrants of the managed event to platform members by email', async () => {
  expect(await registrantEnrollmentIds('hub-1')).toEqual(['e-ada', 'e-bo']);
  expect(mockList).toHaveBeenCalledWith('777');
  const [sql, opts] = mockQuery.mock.calls[0];
  expect(sql).toMatch(/JOIN community_members m ON m\.enrollment_id = e\.id/);
  expect(sql).toMatch(/LOWER\(TRIM\(e\.email\)\) IN \(:emails\) AND e\.status = 'active' AND e\.portal_enabled = true/);
  expect(opts.replacements.emails).toEqual(['ada@x.test', 'bo@x.test', 'cy@x.test']);
});

it('Eventbrite unreadable: a retryable error, and nobody is looked up (never a partial send)', async () => {
  mockList.mockResolvedValue({ event: {}, eventbrite: 'unavailable', rows: [{ email: 'site@x.test' }] });
  const err = await registrantEnrollmentIds('hub-1').catch((e) => e);
  expect(err).toBeInstanceOf(RegistrantsUnavailableError);
  expect(err).not.toBeInstanceOf(ConnectorPermanentError);
  expect(err.name).toBe('UpstreamUnavailable');
  expect(mockQuery).not.toHaveBeenCalled();
});

it('a hub-made event, or a missing one, is a permanent refusal', async () => {
  mockFindByPk.mockResolvedValueOnce({ id: 'hub-2', ccpp_event_id: null });
  await expect(registrantEnrollmentIds('hub-2')).rejects.toMatchObject({ reason: 'not_managed' });
  mockFindByPk.mockResolvedValueOnce(null);
  await expect(registrantEnrollmentIds('gone')).rejects.toBeInstanceOf(ConnectorPermanentError);
});

it('nobody registered: no lookup, nobody reached', async () => {
  mockList.mockResolvedValue({ event: {}, eventbrite: 'ok', rows: [] });
  expect(await registrantEnrollmentIds('hub-1')).toEqual([]);
  expect(mockQuery).not.toHaveBeenCalled();
});

it('reach, for Compose: "2 of 3 registrants have platform accounts"; it reports Eventbrite trouble instead of throwing', async () => {
  expect(await registrantReach('hub-1')).toEqual({ registrants: 3, reachable: 2, eventbrite: 'ok' });
  mockList.mockResolvedValue({ event: {}, eventbrite: 'unavailable', rows: [{ email: 'site@x.test' }] });
  mockQuery.mockResolvedValue([]);
  expect(await registrantReach('hub-1')).toEqual({ registrants: 1, reachable: 0, eventbrite: 'unavailable' });
});
