jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn(), close: jest.fn() } }));
jest.mock('../../services/settingsService', () => ({ getSetting: jest.fn(), setSetting: jest.fn() }));

import { nextAllowList } from '../seedCareerPrepFlag';

const A = 'aced5b39-0b47-496a-b172-e1f5c042bf8a';
const B = '1950b213-5e4e-4cc1-b9cb-04fea1bbe4b0';

describe('nextAllowList', () => {
  it('adds an id to an empty or missing list', () => {
    expect(nextAllowList(null, A, false)).toEqual({ list: [A], changed: true });
  });
  it('is idempotent: adding a listed id changes nothing', () => {
    expect(nextAllowList([A], A, false)).toEqual({ list: [A], changed: false });
  });
  it('keeps other ids and removes only the one asked (rollback)', () => {
    expect(nextAllowList([A, B], A, true)).toEqual({ list: [B], changed: true });
    expect(nextAllowList([B], A, true)).toEqual({ list: [B], changed: false });
  });
  it('replaces a malformed stored value rather than crashing', () => {
    expect(nextAllowList('{bad', A, false)).toEqual({ list: [A], changed: true });
  });
});
