/* eslint-disable */
// Regression tests for the pagination blind spot that bit twice on 26 Oct.
//
// Ellis's ticket crossed fifteen comments and two jobs broke at once: the mail sweep filed the
// same email twice, and the ticket sync posted on every tick instead of staying silent. Neither
// had changed. The data grew into a bug both had carried since they were written.
//
// The case that matters most is the one nobody writes by accident: a last page that happens to be
// exactly full. Stopping on an EMPTY page is the obvious rule and it costs one extra request;
// stopping on a SHORT page is the correct one. Getting that backwards truncates silently, which
// is the failure this file exists to prevent.

const { fetchAllPages, BC_PAGE } = require('../basecampPaging');

/** Serve `total` items in pages of `size`. Records which pages were asked for. */
const server = (total: number, size: number = BC_PAGE) => {
  const asked: number[] = [];
  const items = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
  return {
    asked,
    fetchPage: async (page: number) => {
      asked.push(page);
      return items.slice((page - 1) * size, page * size);
    },
  };
};

describe('reading every page', () => {
  it('returns everything when there are more than one page', async () => {
    // The real shape: Ellis had 22 comments across a 15 and a 7.
    const s = server(22);
    const out = await fetchAllPages(s.fetchPage);
    expect(out).toHaveLength(22);
    expect(s.asked).toEqual([1, 2]);
  });

  it('stops after one short page', async () => {
    const s = server(7);
    expect(await fetchAllPages(s.fetchPage)).toHaveLength(7);
    expect(s.asked).toEqual([1]);
  });

  it('asks again after an EXACTLY FULL page, rather than assuming it is the end', async () => {
    // 15 items in pages of 15. Stopping here would be indistinguishable from the bug.
    const s = server(15);
    expect(await fetchAllPages(s.fetchPage)).toHaveLength(15);
    expect(s.asked).toEqual([1, 2]);
  });

  it('handles an empty collection without asking twice', async () => {
    const s = server(0);
    expect(await fetchAllPages(s.fetchPage)).toEqual([]);
    expect(s.asked).toEqual([1]);
  });

  it('spans several pages', async () => {
    const s = server(47);
    expect(await fetchAllPages(s.fetchPage)).toHaveLength(47);
    expect(s.asked).toEqual([1, 2, 3, 4]);
  });
});

describe('it refuses to loop forever', () => {
  it('stops at the page cap when the server always returns a full page', async () => {
    let calls = 0;
    const always = async () => { calls += 1; return Array.from({ length: BC_PAGE }, () => ({})); };
    const out = await fetchAllPages(always, BC_PAGE, 5);
    expect(calls).toBe(5);
    expect(out).toHaveLength(5 * BC_PAGE);
  });
});

describe('it does not throw on a server that answers oddly', () => {
  it('treats a non-array as the end rather than crashing the sweep', async () => {
    expect(await fetchAllPages(async () => null as any)).toEqual([]);
    expect(await fetchAllPages(async () => ({} as any))).toEqual([]);
  });
});

describe('the duplicate the bug actually produced', () => {
  it('finds a comment on page two that the unpaginated read could not see', async () => {
    const pages = [
      Array.from({ length: 15 }, (_, i) => ({ content: `old ${i}` })),
      [{ content: 'EMAIL FROM Quincy ... pmid=1a16abc' }],
    ];
    const paged = await fetchAllPages(async (p: number) => pages[p - 1] ?? []);
    const unpaginated = pages[0];

    const marker = '1a16abc';
    expect(paged.some((c: any) => String(c.content).includes(marker))).toBe(true);
    // The old behavior, kept here so the difference is visible rather than asserted in prose.
    expect(unpaginated.some((c: any) => String(c.content).includes(marker))).toBe(false);
  });
});
