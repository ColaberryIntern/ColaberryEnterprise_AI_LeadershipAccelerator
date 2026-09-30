/**
 * getRoutingMap() fail-soft contract — found missing in a post-launch audit of the
 * ambient-provider-rebalance build: getFeedPolicy() (feedConfigService.ts) already
 * wraps its identical getSetting() read in try/catch, but getRoutingMap() did not,
 * so a transient SystemSetting read failure propagated as an unhandled rejection
 * through every caller (both anchored and ambient suppression read this per
 * Today-feed request) instead of degrading to "no routing overrides" like the
 * module's own docstring promises.
 */
jest.mock('../../settingsService', () => ({
  getSetting: jest.fn(),
  setSetting: jest.fn(),
}));

import { getRoutingMap } from '../feedControlService';
import { getSetting } from '../../settingsService';

const mockGetSetting = getSetting as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

it('happy path: returns the stored routing map as-is', async () => {
  mockGetSetting.mockResolvedValue({ blog: { feed_frequency_cap: 50 } });
  expect(await getRoutingMap()).toEqual({ blog: { feed_frequency_cap: 50 } });
});

it('boundary: a malformed (non-object) stored value returns an empty map, not an error', async () => {
  mockGetSetting.mockResolvedValue('not-an-object');
  expect(await getRoutingMap()).toEqual({});
});

it('boundary: no stored value (null) returns an empty map', async () => {
  mockGetSetting.mockResolvedValue(null);
  expect(await getRoutingMap()).toEqual({});
});

it('failure path: getSetting rejecting resolves to an empty map instead of throwing', async () => {
  mockGetSetting.mockRejectedValue(new Error('connection reset'));
  await expect(getRoutingMap()).resolves.toEqual({});
});
