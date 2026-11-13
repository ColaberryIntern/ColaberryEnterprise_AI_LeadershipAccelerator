/**
 * morningFeed (one feed of lists and tasks, ranked by impact) and tourLinks (the copy and tour links).
 */
const { buildFeed, listCopyText } = require('../morningFeed');
const { copyLink, tourLink, decode, pack, payloadOf, DEFAULT_BASE, MAX_URL } = require('../tourLinks');

const task = (id, score, over = {}) => ({ id: `p1/${id}`, title: `Task ${id}`, url: `https://app.basecamp.com/3945211/buckets/p1/todos/${id}`,
  path: 'Cat / Proj / List', dueOn: '2026-11-10', late: 2, score, isDecision: false, category: null, disposition: 'act',
  dispositionReason: 'a session can do it', reasons: [{ pts: score, why: 'due' }, { pts: 0, why: 'zero, hidden' }], ...over });
const list = (id, score, over = {}) => ({ id: `p2/${id}`, key: `List ${id}`, projectId: 'p2', listId: id,
  url: `https://app.basecamp.com/3945211/buckets/p2/todolists/${id}`, path: 'Cat / Proj', score, total: 6, live: 5, dormant: 1,
  reasons: [{ pts: score, why: 'lead' }], proposal: { label: 'Decide its 2 pending decisions in one sitting', why: 'they are yours' },
  pressing: [{ id: 'p2/9', title: 'Lead task', late: 3, score }], ...over });
const wo = () => 'WORK ORDER';

describe('buildFeed', () => {
  it('ranks lists and tasks together by impact, most impactful first', () => {
    const f = buildFeed({ tasks: [task('a', 70), task('b', 95)], lists: [list('L', 80)], workOrderTextFor: wo });
    expect(f.map((x) => `${x.kind}:${x.score}`)).toEqual(['task:95', 'list:80', 'task:70']);
    expect(f.map((x) => x.rank)).toEqual([1, 2, 3]);
  });

  it('marks exactly one golden item, #1, whichever kind it is', () => {
    const f = buildFeed({ tasks: [task('a', 70)], lists: [list('L', 90)], workOrderTextFor: wo });
    expect(f.filter((x) => x.golden)).toHaveLength(1);
    expect(f[0]).toMatchObject({ golden: true, kind: 'list' });
  });

  it('breaks a tie in favour of the list (one decision covers more)', () => {
    const f = buildFeed({ tasks: [task('a', 80)], lists: [list('L', 80)], workOrderTextFor: wo });
    expect(f[0].kind).toBe('list');
  });

  it('gives a task the claim prompt and a list the /ata-list prompt', () => {
    const f = buildFeed({ tasks: [task('a', 70)], lists: [list('L', 90)], workOrderTextFor: wo });
    expect(f[0].copyText.split('\n')[0]).toBe('/ata-list "List L"');
    expect(f[1].copyText.split('\n')[0]).toBe('/ata-work-task p1/a');
    expect(f[1].copyText).toContain('WORK ORDER');
  });

  it('drops zero-point reasons from the card', () => {
    const f = buildFeed({ tasks: [task('a', 70)], lists: [], workOrderTextFor: wo });
    expect(f[0].reasons.map((r) => r.why)).toEqual(['due']);
  });

  it('copes with nothing at all', () => {
    expect(buildFeed({ tasks: [], lists: [], workOrderTextFor: wo })).toEqual([]);
  });
});

describe('listCopyText', () => {
  it('pins the list by id, carries the move, and keeps decisions Ali\'s', () => {
    const t = listCopyText(list('L', 90), 1, true);
    expect(t).toContain('List id: p2/L');
    expect(t).toContain('THE ONE MOVE today');
    expect(t).toContain('PROPOSED MOVE: Decide its 2 pending decisions in one sitting.');
    expect(t).toMatch(/do not make it/);
    expect(t).toMatch(/never close or change a Basecamp ticket/);
  });
});

describe('tourLinks', () => {
  const feed = buildFeed({ tasks: [task('a', 70)], lists: [list('L', 90)], workOrderTextFor: wo });

  it('round-trips an item through the fragment, losslessly', () => {
    const href = copyLink(feed[0]);
    expect(href.startsWith(`${DEFAULT_BASE}?c=`)).toBe(true);
    expect(decode(payloadOf(href))).toEqual(pack(feed[0]));
  });

  it('puts every tour stop in one link, in rank order', () => {
    const d = decode(payloadOf(tourLink(feed, 'Thursday, November 12')));
    expect(d.d).toBe('Thursday, November 12');
    expect(d.i.map((x) => [x.n, x.k, x.g])).toEqual([[1, 'list', 1], [2, 'task', 0]]);
  });

  /** The tracker and some clients choke on "(", "&", spaces; base64url has none of them. */
  it('uses only URL-safe characters in the payload', () => {
    expect(tourLink(feed, 'd (x) & y')).toMatch(/\?t=[A-Za-z0-9_-]+$/);
  });

  it('keeps a realistic ten well under common URL limits', () => {
    const ten = buildFeed({ tasks: Array.from({ length: 5 }, (_, i) => task(`t${i}`, 70 - i, { title: 'A'.repeat(120) })),
      lists: Array.from({ length: 5 }, (_, i) => list(`l${i}`, 90 - i)), workOrderTextFor: () => 'W'.repeat(1500) });
    expect(tourLink(ten, 'day').length).toBeLessThan(16000);
  });

  /** Ali, 2026-11-12: the button opened the bare page. Gmail's redirect had dropped the "#" part. */
  it('carries the data in the query string, not a fragment a redirect can drop', () => {
    expect(tourLink(feed, 'd')).not.toContain('#');
    expect(copyLink(feed[0])).not.toContain('#');
  });

  /** Production nginx refuses a request line over ~8K with 414 (probed 2026-11-12). */
  it('holds every link under the server limit by clipping prompts, keeping the command line', () => {
    const noisy = (n) => Array.from({ length: n }, (_, i) => `${i}-${((i * 2654435761) % 4294967296).toString(36)}`).join(' ');
    const big = buildFeed({ tasks: Array.from({ length: 5 }, (_, i) => task(`t${i}`, 70 - i)),
      lists: Array.from({ length: 5 }, (_, i) => list(`l${i}`, 90 - i)), workOrderTextFor: () => noisy(1500) });
    const t = tourLink(big, 'day');
    expect(t.length).toBeLessThanOrEqual(MAX_URL);
    const stops = decode(payloadOf(t)).i;
    stops.forEach((s, i) => expect(s.c.split('\n')[0]).toBe(big[i].copyText.split('\n')[0]));
    expect(stops.some((s) => /Shortened to fit the link/.test(s.c))).toBe(true);
    expect(copyLink(big[5]).length).toBeLessThanOrEqual(MAX_URL);
  });

  it('leaves a link that already fits untouched', () => {
    expect(decode(payloadOf(copyLink(feed[0])))).toEqual(pack(feed[0]));
  });
});
