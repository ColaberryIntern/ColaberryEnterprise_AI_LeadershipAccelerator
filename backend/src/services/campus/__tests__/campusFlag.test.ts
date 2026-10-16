import { campusEnabledFor, parseCampusMode, parseIdList } from '../campusFlag';

const viewer = { enrollmentId: 'enr-1', cohortId: 'coh-9' };
const s = (mode: string | undefined, enrollmentIds = '', cohortIds = '') => ({ mode, enrollmentIds, cohortIds });

describe('parseCampusMode', () => {
  it.each([[undefined, 'off'], [null, 'off'], ['', 'off'], ['   ', 'off'], ['off', 'off'], ['true', 'off'], ['ON', 'off'], ['yes', 'off'],
    ['all', 'all'], [' ALL ', 'all'], ['allowlist', 'allowlist'], ['Allowlist', 'allowlist']])('%p -> %p', (raw, want) => {
    expect(parseCampusMode(raw as string | undefined)).toBe(want);
  });
});

describe('parseIdList', () => {
  it('trims and drops blank entries', () => {
    expect(parseIdList(' a, ,b ,, c ')).toEqual(['a', 'b', 'c']);
    expect(parseIdList(undefined)).toEqual([]);
    expect(parseIdList('')).toEqual([]);
  });
});

describe('campusEnabledFor', () => {
  it('is off by default and for any unrecognised mode, even when the viewer is listed', () => {
    expect(campusEnabledFor(viewer, s(undefined, 'enr-1', 'coh-9'))).toBe(false);
    expect(campusEnabledFor(viewer, s('true', 'enr-1', 'coh-9'))).toBe(false);
    expect(campusEnabledFor(viewer, s('off', 'enr-1', 'coh-9'))).toBe(false);
  });

  it('is on for everyone in "all", including a viewer with no ids', () => {
    expect(campusEnabledFor(viewer, s('all'))).toBe(true);
    expect(campusEnabledFor({ enrollmentId: null, cohortId: undefined }, s('all'))).toBe(true);
  });

  it('allowlist admits by enrollment id', () => {
    expect(campusEnabledFor(viewer, s('allowlist', 'enr-0, enr-1'))).toBe(true);
    expect(campusEnabledFor(viewer, s('allowlist', 'enr-0'))).toBe(false);
  });

  it('allowlist admits by cohort id', () => {
    expect(campusEnabledFor(viewer, s('allowlist', '', 'coh-9'))).toBe(true);
    expect(campusEnabledFor(viewer, s('allowlist', '', 'coh-8'))).toBe(false);
  });

  it('allowlist with empty lists admits nobody', () => {
    expect(campusEnabledFor(viewer, s('allowlist'))).toBe(false);
  });

  it('a viewer with blank ids never matches a list that contains a blank entry', () => {
    expect(campusEnabledFor({ enrollmentId: '  ', cohortId: '' }, s('allowlist', ' , ', ','))).toBe(false);
  });

  it('matches exactly, not by prefix', () => {
    expect(campusEnabledFor(viewer, s('allowlist', 'enr-10'))).toBe(false);
  });
});
