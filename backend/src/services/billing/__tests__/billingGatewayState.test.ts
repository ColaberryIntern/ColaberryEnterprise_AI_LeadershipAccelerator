/**
 * The gateway side of the "schedules match the book" check.
 *
 * Found live 2026-09-17: three members who cancelled had their PaySimple schedule
 * Suspended (correct) and the id cleared from the book (correct), and the watch
 * then reported them every morning as "at gateway but not in our book", an ACT
 * NOW alarm for schedules that cannot charge anyone.
 */
jest.mock('../../paysimpleService', () => ({ apiRequest: jest.fn() }));

import { apiRequest } from '../../paysimpleService';
import { getPaySimpleGatewayState } from '../billingGatewayState';

const api = apiRequest as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('getPaySimpleGatewayState', () => {
  it('keeps only Active schedules at our prices, so a cancelled member\'s suspended schedule never counts as orphaned', async () => {
    api.mockResolvedValueOnce([
      { Id: 4511911, PaymentAmount: 199, ScheduleStatus: 'Active' },
      { Id: 4504746, PaymentAmount: 199, ScheduleStatus: 'Suspended' },
      { Id: 4511896, PaymentAmount: 199, ScheduleStatus: 'Suspended' },
      { Id: 4400001, PaymentAmount: 1788, ScheduleStatus: 'Active' },
      { Id: 3491878, PaymentAmount: 250, ScheduleStatus: 'Active' }, // school-side, not our price
      { Id: 4400002, PaymentAmount: 199, ScheduleStatus: 'Expired' },
    ]);
    const state = await getPaySimpleGatewayState();
    expect(state.scheduleIds).toEqual(['4511911', '4400001']);
  });

  it('treats a row with no ScheduleStatus as active rather than silently dropping it', async () => {
    api.mockResolvedValueOnce([{ Id: 1, PaymentAmount: 199 }]);
    expect((await getPaySimpleGatewayState()).scheduleIds).toEqual(['1']);
  });

  it('pages until a short page and stops on an empty one', async () => {
    const page = (n: number) => Array.from({ length: n }, (_, i) => ({ Id: i + 1, PaymentAmount: 199, ScheduleStatus: 'Active' }));
    api.mockResolvedValueOnce(page(200)).mockResolvedValueOnce(page(3));
    const state = await getPaySimpleGatewayState();
    expect(api).toHaveBeenCalledTimes(2);
    expect(state.scheduleIds).toHaveLength(203);
  });

  it('swallows a gateway outage into a warning and returns no schedule list (the check then says it could not run)', async () => {
    api.mockRejectedValueOnce(new Error('502'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const state = await getPaySimpleGatewayState();
    expect(state.scheduleIds).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('gateway_schedules_unavailable'));
    warn.mockRestore();
  });
});
