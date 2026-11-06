import { outlineRows } from './editorHelpers';
import type { GovVersionContent } from '../../../../services/govProjectPortalApi';

const sections: GovVersionContent['sections'] = [
  { sectionKey: 'b', heading: 'Plan', requirementIds: ['R-2'], order: 2, plan: 'hot button', contentHtml: '' },
  { sectionKey: 'a', heading: 'Approach', requirementIds: ['R-1'], order: 1, contentHtml: '<p>drafted</p>' },
];

describe('outlineRows', () => {
  it('orders by order, carries req chips, splits the budget, flags content + suggested', () => {
    const rows = outlineRows(sections, 10);
    expect(rows.map((r) => r.sectionKey)).toEqual(['a', 'b']);
    expect(rows[0]).toMatchObject({ requirementIds: ['R-1'], pageBudget: 5, hasContent: true, suggested: false });
    expect(rows[1]).toMatchObject({ pageBudget: 5, hasContent: false, suggested: true }); // has a plan, no content
  });

  it('uses a null budget with no page limit, and floors a tiny split at 0.5', () => {
    expect(outlineRows([sections[0]], null)[0].pageBudget).toBeNull();
    const many = Array.from({ length: 40 }, (_, i) => ({ sectionKey: `s${i}`, heading: 'h', requirementIds: [], order: i }));
    expect(outlineRows(many, 1)[0].pageBudget).toBe(0.5); // 1/40 floored to 0.5
  });

  it('is total on empty / junk', () => {
    expect(outlineRows([], 10)).toEqual([]);
    expect(outlineRows(undefined, 10)).toEqual([]);
  });
});
