import { filterExcluded } from '../todayFeedDedupe';

describe('filterExcluded', () => {
  it('empty excludeRefs -> identity, same length, same order', () => {
    const items = [{ ref: 'a' }, { ref: 'b' }, { ref: 'c' }];
    expect(filterExcluded(items, new Set())).toEqual(items);
    expect(filterExcluded(items, undefined)).toEqual(items);
  });

  it('a full match excludes everything -> []', () => {
    const items = [{ ref: 'a' }, { ref: 'b' }];
    expect(filterExcluded(items, new Set(['a', 'b']))).toEqual([]);
  });

  it('a partial match removes only the excluded refs, preserving order of survivors', () => {
    const items = [{ ref: 'a' }, { ref: 'b' }, { ref: 'c' }, { ref: 'd' }];
    expect(filterExcluded(items, new Set(['b', 'd']))).toEqual([{ ref: 'a' }, { ref: 'c' }]);
  });
});
