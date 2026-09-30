const outcomeFindAll = jest.fn();
const appointmentFindAll = jest.fn();
const engagementCount = jest.fn();
jest.mock('../../../../models', () => ({
  InteractionOutcome: { findAll: (...a: unknown[]) => outcomeFindAll(...a) },
  Appointment: { findAll: (...a: unknown[]) => appointmentFindAll(...a) },
  DeliveryEngagement: { count: (...a: unknown[]) => engagementCount(...a) },
  Lead: {},
}));

import { loadLifecycleSourceCounts } from '../lifecycleInputs';

/**
 * T407 — the counted rows, as the two lifecycles and the scorer read them.
 *
 * The one behavioural change this task makes here: `no_response` is counted.
 * It was in `interaction_outcomes`' vocabulary all along and is deal risk (the
 * friction dimension reads it); it needs none of the opt-out status literals
 * T304 bans, which is why it can be counted by name.
 */

const row = (outcome: string) => ({ get: (k: string) => (k === 'outcome' ? outcome : undefined) });
const appt = (status: string) => ({ get: (k: string) => (k === 'status' ? status : undefined) });

beforeEach(() => {
  outcomeFindAll.mockReset().mockResolvedValue([]);
  appointmentFindAll.mockReset().mockResolvedValue([]);
  engagementCount.mockReset().mockResolvedValue(0);
});

describe('loadLifecycleSourceCounts', () => {
  it('no_response reaches the counts, beside the four the lifecycles already read; the other outcome kinds are not counted', async () => {
    outcomeFindAll.mockResolvedValue(['replied', 'no_response', 'no_response', 'booked_meeting', 'answered', 'declined', 'sent', 'opened', 'clicked', 'voicemail'].map(row));
    const c = await loadLifecycleSourceCounts(501);
    expect(c.inbound).toEqual({ replied: 1, booked_meeting: 1, answered: 1, declined: 1, no_response: 2 });
    expect(outcomeFindAll).toHaveBeenCalledWith({ where: { lead_id: 501 }, attributes: ['outcome'] });
  });

  it('zero rows are zero counts (a measurement) with no_response present as 0, and the appointment statuses count by name', async () => {
    appointmentFindAll.mockResolvedValue(['scheduled', 'completed', 'no_show', 'cancelled', 'cancelled', 'rescheduled'].map(appt));
    const c = await loadLifecycleSourceCounts(501);
    expect(c.inbound).toEqual({ replied: 0, booked_meeting: 0, answered: 0, declined: 0, no_response: 0 });
    expect(c.appointments).toEqual({ scheduled: 1, completed: 1, no_show: 1, cancelled: 2 });
    expect(c.hasDeliveryEngagement).toBe(false);
  });

  it('a subject with no lead reads nothing and answers the empty counts, no_response included', async () => {
    const c = await loadLifecycleSourceCounts(null);
    expect(c).toEqual({ inbound: { replied: 0, booked_meeting: 0, answered: 0, declined: 0, no_response: 0 }, appointments: { scheduled: 0, completed: 0, no_show: 0, cancelled: 0 }, hasDeliveryEngagement: false });
    expect(outcomeFindAll).not.toHaveBeenCalled();
    expect(appointmentFindAll).not.toHaveBeenCalled();
    expect(engagementCount).not.toHaveBeenCalled();
  });

  it('a delivery engagement that is not cancelled counts as one', async () => {
    engagementCount.mockResolvedValue(2);
    expect((await loadLifecycleSourceCounts(501)).hasDeliveryEngagement).toBe(true);
  });
});
