const mockAudience = jest.fn();
jest.mock('../campusAudience', () => ({ campusAudienceFor: (...a: unknown[]) => mockAudience(...a) }));
jest.mock('../../../config/env', () => ({ env: { campusAudienceSwitchIds: '' } }));

import { onSwitchList, mayPreviewAudiences } from '../campusAudienceSwitch';

/**
 * WP-7: who may preview the campus as another account type. Staff by default; a listed enrollment too (Ali's own account);
 * everyone else, and every failure, gets "no".
 */
describe('onSwitchList', () => {
  it('matches a listed id exactly, trimming blanks; never an empty id or a prefix', () => {
    expect(onSwitchList('enr-1', ' enr-0 , enr-1 ')).toBe(true);
    expect(onSwitchList('enr-1', 'enr-10')).toBe(false);
    expect(onSwitchList('', 'enr-1')).toBe(false);
    expect(onSwitchList('  ', ' , ')).toBe(false);
    expect(onSwitchList(undefined, '')).toBe(false);
  });
});

describe('mayPreviewAudiences', () => {
  beforeEach(() => mockAudience.mockReset());

  it('a listed account may switch without any database read', async () => {
    expect(await mayPreviewAudiences('enr-1', 'enr-1')).toBe(true);
    expect(mockAudience).not.toHaveBeenCalled();
  });

  it('staff may switch by default; business, explorer and member may not', async () => {
    for (const [kind, want] of [['staff', true], ['business', false], ['explorer', false], ['member', false]] as const) {
      mockAudience.mockResolvedValueOnce(kind);
      expect(await mayPreviewAudiences('enr-2', '')).toBe(want);
    }
  });

  it('a failed audience read answers no (a failure never widens access) and logs it', async () => {
    mockAudience.mockRejectedValueOnce(Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' }));
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await mayPreviewAudiences('enr-2', '')).toBe(false);
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({ event: 'campus_audience_switch_check', error_class: 'SequelizeConnectionError' });
    log.mockRestore();
  });

  it('reads the env list by default', async () => {
    mockAudience.mockResolvedValueOnce('member');
    expect(await mayPreviewAudiences('enr-3')).toBe(false);
  });
});
