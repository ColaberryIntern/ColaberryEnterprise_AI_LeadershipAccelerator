// "Throw Back Pics" (Ali, 2026-11-14): older photos that match this week, always dated, and under the
// same one-time rule as new photos.
const F = require('../familyPhotoFeed');
const T = require('../familyThrowbacks');
const { renderThrowbacks, sectionsText } = require('../renderFamilyDashboardSections');

const h = F.helpers;
const item = (id, name, hash) => ({ id, name, file: { hashes: { sha1Hash: hash || `h-${id}` } } });
const fam = (L, ids, quality = 3, caption = 'kids at a game') => { for (const id of ids) L.labels[id] = { family: true, quality, caption }; return L; };
const TODAY = '2026-11-14';
const WINDOW = '2026-11-01';
const kit = { C: { ink: '#111', muted: '#666', navy: '#123', lineSoft: '#eee' }, FONT: 'Arial', esc: (s) => String(s), chip: (t) => `[${t}]`, sectionOpen: (t) => `<section>${t}`, sectionClose: () => '</section>', hTitle: (a, b) => `<h2>${a}</h2><p>${b}</p>` };

describe('season helpers', () => {
  test('season gap wraps the new year (Dec 30 and Jan 2 are close)', () => {
    expect(T.seasonGap('2024-12-30', '2026-01-02')).toBeLessThanOrEqual(4);
  });
  test('years ago only counts a full year once the date has passed', () => {
    expect(T.yearsAgo('2024-11-20', TODAY)).toBe(1);
    expect(T.yearsAgo('2024-11-10', TODAY)).toBe(2);
  });
});

describe('throwbackPool', () => {
  test('only labelled family photos from before the new-photo window, with a real capture date', () => {
    const items = [
      item('old', '20241120_101010.jpg'), // eligible
      item('new', '20261106_101010.jpg'), // inside the window: belongs to the new-photo section
      item('rcpt', '20241121_090000.jpg'), // a receipt
      item('nodate', 'IMG_5000.jpg'), // upload date only: never shown with a guessed date
    ];
    const L = fam(F.emptyLedger(), ['old', 'new', 'nodate']);
    L.labels.rcpt = { family: false, kind: 'document', quality: 5 };
    expect(T.throwbackPool(items, L, WINDOW, h).map((i) => i.id)).toEqual(['old']);
  });

  test('a photo already posted (as new or as a throwback) is never a throwback again, nor is its moment', () => {
    const items = [item('a', '20241120_101010.jpg'), item('a2', '20241120_101300.jpg'), item('b', '20231115_120000.jpg')];
    const L = fam(F.emptyLedger(), ['a', 'a2', 'b']);
    F.markPosted(L, [items[0]], '2026-11-13', 'throwback');
    expect(T.throwbackPool(items, L, WINDOW, h).map((i) => i.id)).toEqual(['b']);
  });

  test('a copy of a posted photo under another name is refused', () => {
    const items = [item('a', '20241120_101010.jpg', 'same'), item('copy', '20250301_080000.jpg', 'same')];
    const L = fam(F.emptyLedger(), ['a', 'copy']);
    F.markPosted(L, [items[0]], '2026-11-13', 'throwback');
    expect(T.throwbackPool(items, L, WINDOW, h)).toEqual([]);
  });
});

describe('picking', () => {
  test('the fallback prefers this time of year and never two from the same day', () => {
    const items = [item('m', '20250601_100000.jpg'), item('n1', '20241115_100000.jpg'), item('n2', '20241115_150000.jpg'), item('n3', '20231112_100000.jpg')];
    const L = fam(F.emptyLedger(), items.map((i) => i.id));
    const picks = T.fallbackPicks(T.throwbackPool(items, L, WINDOW, h), L, TODAY, h);
    expect(picks.map((p) => p.item.id).sort()).toEqual(['n1', 'n3'].sort());
    expect(picks.find((p) => p.item.id === 'n1').why).toBe('This time of year, 1 year ago');
  });

  test('model picks are validated: invented numbers, repeats and same-day pairs are dropped, dashes removed', () => {
    const c = [item('x', '20241120_100000.jpg'), item('y', '20241120_160000.jpg'), item('z', '20231225_100000.jpg')];
    const raw = { picks: [{ n: 9, why: 'made up' }, { n: 1, why: 'Thanksgiving — this week' }, { n: 1, why: 'again' }, { n: 2, why: 'same day as 1' }, { n: 3, why: 'Christmas' }] };
    const out = T.validateRanking(raw, c, TODAY, h);
    expect(out.map((p) => p.item.id)).toEqual(['x', 'z']);
    expect(out[0].why).toBe('Thanksgiving, this week');
  });

  test('a same-day resend reuses the day\'s throwbacks instead of choosing new ones', async () => {
    const items = [item('a', '20241120_101010.jpg'), item('b', '20231115_120000.jpg')];
    const L = fam(F.emptyLedger(), ['a', 'b']);
    F.markPosted(L, [items[0]], TODAY, 'throwback', { a: 'Thanksgiving week' });
    const r = await T.chooseThrowbacks({ items, ledger: L, today: TODAY, windowStart: WINDOW, h });
    expect(r.reused).toBe(true);
    expect(r.picks).toEqual([{ item: items[0], why: 'Thanksgiving week' }]);
  });

  test('when the ranking call fails, time-of-year picks still fill the section', async () => {
    const items = [item('a', '20241118_101010.jpg')];
    const L = fam(F.emptyLedger(), ['a']);
    const failing = { ...h, fetchJson: async () => { throw new Error('upstream 503'); } };
    const r = await T.chooseThrowbacks({ items, ledger: L, today: TODAY, windowStart: WINDOW, topics: ['Thanksgiving lunch'], h: failing });
    expect(r.picks.map((p) => p.item.id)).toEqual(['a']);
  });

  test('throwbacks posted today do not count as today\'s new photos on a resend', () => {
    const tb = item('a', '20241120_101010.jpg');
    const fresh = item('n', '20261110_090000.jpg');
    const L = fam(F.emptyLedger(), ['a', 'n']);
    F.markPosted(L, [tb], TODAY, 'throwback');
    expect(F.choosePicks([tb, fresh], L, TODAY).picks.map((p) => p.id)).toEqual(['n']);
  });
});

describe('rendering', () => {
  const data = { throwbacks: [{ cid: 'c1', takenAt: '2024-11-20T10:10:10', caption: 'kids at a game', why: 'Thanksgiving week' }] };
  test('the section is called "Throw Back Pics" and every picture carries its date', () => {
    const html = renderThrowbacks(data, kit);
    expect(html).toContain('Throw Back Pics');
    expect(html).toContain('November 20, 2024');
    expect(sectionsText(data)).toContain('THROW BACK PICS');
    expect(sectionsText(data)).toContain('November 20, 2024');
  });
  test('no throwbacks renders nothing', () => {
    expect(renderThrowbacks({ throwbacks: [] }, kit)).toBe('');
  });
});
