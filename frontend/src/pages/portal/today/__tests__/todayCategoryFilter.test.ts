import { classifyCategories, countByCategory, ALL_CATEGORIES } from '../todayCategoryFilter';

function item(type: string, kind: 'anchored' | 'ambient' = 'ambient') {
  return { type, kind };
}

describe('classifyCategories', () => {
  it('classifies one item per category (happy path, one real example each)', () => {
    expect(classifyCategories(item('ai_news_flash'))).toEqual(['ai_pulse']);
    expect(classifyCategories(item('implementation_task'))).toEqual(['projects']);
    expect(classifyCategories(item('community_discussion'))).toEqual(['community']);
    expect(classifyCategories(item('live_class'))).toEqual(['review']);
    expect(classifyCategories(item('deep_dive', 'anchored'))).toEqual(['my_path', 'classroom']);
    expect(classifyCategories(item('implementation_task', 'anchored'))).toEqual(['projects', 'my_path']);
  });

  it('an anchored non-classroom item is my_path only (no classroom membership)', () => {
    expect(classifyCategories(item('prompt_lab', 'anchored'))).toEqual(['my_path']);
  });

  it('an unclassifiable ambient item (e.g. blog) returns an empty array — still shown under "All", just no specific chip', () => {
    expect(classifyCategories(item('blog'))).toEqual([]);
  });

  it('an anchored ai_pulse-typed item would be both ai_pulse and my_path (boundary: overlapping categories)', () => {
    // Hypothetical overlap case — proves .includes() semantics work even if
    // real data never actually produces an anchored ai_news_flash today.
    expect(classifyCategories(item('ai_news_flash', 'anchored'))).toEqual(['ai_pulse', 'my_path']);
  });
});

describe('countByCategory', () => {
  it('counts real, non-zero, currently-loaded items per category', () => {
    const items = [
      item('ai_news_flash'), item('ai_news_flash'),
      item('implementation_task', 'anchored'),
      item('community_discussion'),
      item('blog'),
    ];
    const counts = countByCategory(items);
    expect(counts.ai_pulse).toBe(2);
    expect(counts.projects).toBe(1);
    expect(counts.my_path).toBe(1);
    expect(counts.community).toBe(1);
    expect(counts.classroom).toBe(0);
    expect(counts.review).toBe(0);
  });

  it('boundary: an empty items array returns all-zero counts, never throws', () => {
    const counts = countByCategory([]);
    for (const cat of ALL_CATEGORIES) expect(counts[cat]).toBe(0);
  });
});
