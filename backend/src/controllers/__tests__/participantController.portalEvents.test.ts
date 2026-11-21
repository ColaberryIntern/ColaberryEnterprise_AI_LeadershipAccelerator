jest.mock('../../services/publicEventsService', () => ({ getUpcomingPublicEvents: jest.fn(), annotateRegistration: jest.fn(async (e: unknown[]) => e) }));
jest.mock('../../services/commsHub/portalHubEvents', () => {
  const actual = jest.requireActual('../../services/commsHub/portalHubEvents');
  return { ...actual, getPortalHubEvents: jest.fn() };
});
jest.mock('../../models', () => ({ ...jest.requireActual('../../models'), Enrollment: { findByPk: jest.fn(async () => ({ email: 'm@example.com', cohort_id: 'c1' })) } }));

import { handleGetPublicEvents } from '../participantController';
import { getUpcomingPublicEvents } from '../../services/publicEventsService';
import { getPortalHubEvents } from '../../services/commsHub/portalHubEvents';

/** CH2.3 GET /api/portal/events: CCPP and hub are independent; one failing never hides the other. */
const ccppCard = { id: 'ccpp-1', title: 'AI Friday', starts_at: new Date('2026-11-27T15:00:00Z'), registration_url: 'https://www.eventbrite.com/e/1111111111' };
const hubCard = { id: 'hub:1', title: 'Demo Tuesday', starts_at: new Date('2026-11-25T00:00:00Z'), registration_url: null, source: 'hub' };

async function run() {
  const req: any = { query: { days: '30' }, participant: { sub: 'enr-1' } };
  const res: any = { body: undefined, json(b: unknown) { this.body = b; return this; } };
  const next = jest.fn();
  await handleGetPublicEvents(req, res, next);
  return { res, next };
}

let warn: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => warn.mockRestore());

describe('CH2.3 portal events merge', () => {
  it('both sources: merged and sorted, the hub read with the member cohort', async () => {
    (getUpcomingPublicEvents as jest.Mock).mockResolvedValue([ccppCard]);
    (getPortalHubEvents as jest.Mock).mockResolvedValue([hubCard]);
    const { res } = await run();
    expect(res.body.events.map((e: { id: string }) => e.id)).toEqual(['hub:1', 'ccpp-1']);
    expect(getPortalHubEvents).toHaveBeenCalledWith('c1', 30);
  });

  it('CCPP down: hub events still listed, a warning logged', async () => {
    (getUpcomingPublicEvents as jest.Mock).mockRejectedValue(new Error('mssql timeout'));
    (getPortalHubEvents as jest.Mock).mockResolvedValue([hubCard]);
    const { res, next } = await run();
    expect(next).not.toHaveBeenCalled();
    expect(res.body.events.map((e: { id: string }) => e.id)).toEqual(['hub:1']);
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ event: 'portal_events_source_failed', context: { source: 'ccpp' } });
  });

  it('hub down: the CCPP page is exactly as before', async () => {
    (getUpcomingPublicEvents as jest.Mock).mockResolvedValue([ccppCard]);
    (getPortalHubEvents as jest.Mock).mockRejectedValue(new Error('pg down'));
    const { res } = await run();
    expect(res.body.events.map((e: { id: string }) => e.id)).toEqual(['ccpp-1']);
  });

  it('both down: the error goes to next(), as before this change', async () => {
    (getUpcomingPublicEvents as jest.Mock).mockRejectedValue(new Error('mssql timeout'));
    (getPortalHubEvents as jest.Mock).mockRejectedValue(new Error('pg down'));
    const { next } = await run();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'mssql timeout' }));
  });
});
