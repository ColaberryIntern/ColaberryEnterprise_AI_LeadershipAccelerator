import { getLegacyCreatorIds, buildCreatorIdMatchList } from '../legacyCreatorAliases';

describe('getLegacyCreatorIds', () => {
  it('happy path: returns the real string array from config.legacy_creator_ids', () => {
    const agent = { config: { legacy_creator_ids: ['cory-engine'] } };
    expect(getLegacyCreatorIds(agent)).toEqual(['cory-engine']);
  });

  it('boundary: no config at all returns an empty array, never throws', () => {
    expect(getLegacyCreatorIds({})).toEqual([]);
    expect(getLegacyCreatorIds({ config: null })).toEqual([]);
    expect(getLegacyCreatorIds({ config: undefined })).toEqual([]);
  });

  it('boundary: config present but no legacy_creator_ids key returns an empty array (e.g. Reese)', () => {
    expect(getLegacyCreatorIds({ config: { pilot_cohort_ids: ['cohort-1'] } })).toEqual([]);
  });

  it('failure path: a corrupted/non-array value degrades to empty rather than throwing', () => {
    expect(getLegacyCreatorIds({ config: { legacy_creator_ids: 'cory-engine' } })).toEqual([]);
    expect(getLegacyCreatorIds({ config: { legacy_creator_ids: { bad: true } } })).toEqual([]);
  });

  it('failure path: filters out non-string / empty-string entries from a mixed-type array, keeps the real ones', () => {
    const agent = { config: { legacy_creator_ids: ['CoryBrain', 42, null, '', 'InboxCaseEngine'] } };
    expect(getLegacyCreatorIds(agent)).toEqual(['CoryBrain', 'InboxCaseEngine']);
  });
});

describe('buildCreatorIdMatchList', () => {
  it('happy path: real AdminUser id plus every legacy alias, deduplicated', () => {
    const agent = { config: { legacy_creator_ids: ['cory-engine'] } };
    const list = buildCreatorIdMatchList('admin-uuid-1', agent);
    expect(new Set(list)).toEqual(new Set(['admin-uuid-1', 'cory-engine']));
    expect(list).toHaveLength(2);
  });

  it('boundary: zero legacy aliases (e.g. Reese) returns a match list of exactly one id — the real one, unaffected', () => {
    const list = buildCreatorIdMatchList('admin-reese', {});
    expect(list).toEqual(['admin-reese']);
  });

  it('boundary: an alias that happens to equal the real id does not produce a duplicate entry', () => {
    const agent = { config: { legacy_creator_ids: ['admin-uuid-1'] } };
    const list = buildCreatorIdMatchList('admin-uuid-1', agent);
    expect(list).toEqual(['admin-uuid-1']);
  });
});
