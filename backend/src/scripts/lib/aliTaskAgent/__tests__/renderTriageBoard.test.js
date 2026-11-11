/**
 * The Backlog Navigator page.
 *
 * REWRITTEN with the renderer. The previous suite asserted a page that no longer exists - static
 * SVG charts, a live/dormant table split, a Mermaid block. Those assertions were deleted
 * deliberately and the ones that guarded REAL risks were kept and re-pointed: untrusted markup in
 * a list name, NaN leaking into a count, and the page claiming to have changed something.
 *
 * Two properties are new and carry the whole redesign:
 *   - no prompt text is rendered anywhere, because the page is meant to be clicked, not read
 *   - the page ships its data, so filtering can rebuild the charts instead of hiding rows
 */
const { renderTriageBoard, sizeStep } = require('../renderTriageBoard');

const TODAY = '2026-11-11T12:00:00Z';

const list = (over = {}) => ({
  // A real government list name, so the category mapping is genuinely exercised. The earlier
  // fixture ('9. Ensuring Data Security') maps to UNSORTED, which is correct behaviour and made
  // the assertion wrong rather than the code.
  key: 'R3 - Set-Aside Entity + JV - The Veteran/Minority Company',
  name: 'Set-Aside Entity + JV',
  position: 9,
  total: 39,
  live: 0,
  dormant: 39,
  generatedShare: 1,
  humanShare: 0.56,
  oldestDue: '2026-07-19',
  bands: [{ band: 'fresh', n: 0 }, { band: 'overdue', n: 0 }, { band: 'aging', n: 0 }, { band: 'dormant', n: 39 }],
  tasks: [],
  lead: { id: '7463955/1', title: 'Limit access to sensitive information' },
  suggestions: [{ key: 'dismiss_list', label: 'Dismiss all 39 with a reason', why: 'all dormant', command: '/ata-list "x" --dismiss' }],
  phaseOf: { position: 9, of: 9 },
  siblings: [],
  ...over,
});

const items = [
  { todo: { due_on: '2026-07-19', title: 'a' }, score: 60 },
  { todo: { due_on: '2026-11-20', title: 'b' }, score: 40 },
];

const html = (over = {}) => renderTriageBoard({
  items, lists: [list()], today: TODAY, runId: 'TRIAGE-TEST', ...over,
});

describe('the page is clicked, not read', () => {
  /** The whole point of the redesign. A visible prompt is a wall of text Ali asked not to see. */
  it('renders no prompt text in the body', () => {
    const h = html();
    const body = h.slice(h.indexOf('<body'), h.indexOf('<script>window.__BOARD__'));
    expect(body).not.toMatch(/HOW TO GET THE REST OF IT/);
    expect(body).not.toMatch(/WHAT TO PRODUCE/);
    expect(body).not.toMatch(/docker exec/);
    expect(body).not.toMatch(/ataListAction/);
  });

  it('carries the prompt in the data payload instead, keyed by list', () => {
    const h = html();
    expect(h).toMatch(/window\.__BOARD__ = \{/);
    expect(h).toMatch(/HOW TO GET THE REST OF IT/); // present, but only inside the JSON
    expect(h).toMatch(/"prompts"/);
  });

  it('gives every list a clickable target carrying its key', () => {
    const h = html();
    expect(h).toMatch(/data-prompt="R3 - Set-Aside Entity/);
    expect(h).toMatch(/Copy the prompt for this list/);
  });

  /**
   * Because nothing is rendered, a clipboard failure makes the prompt UNREACHABLE rather than
   * merely inconvenient. The page has to say so.
   */
  it('tells the user when the browser blocks the copy', () => {
    expect(html()).toMatch(/copy blocked by the browser/);
  });
});

describe('filtering rebuilds rather than hides', () => {
  it('ships the per-list data the charts are drawn from', () => {
    const h = html();
    expect(h).toMatch(/"lists":\[/);
    expect(h).toMatch(/"bands":\{/);
    expect(h).toMatch(/"cat":"government"/);
  });

  it('provides the chart mount points the runtime fills', () => {
    const h = html();
    ['f-tiles', 'f-gauge', 'f-bands', 'f-cats', 'f-lists', 'f-note']
      .forEach((id) => expect(h).toContain(`id="${id}"`));
  });

  it('tags every filterable element with its category', () => {
    expect(html()).toMatch(/data-cat="government"/);
  });

  /** Level 2 (Ali, 2026-11-11): Category / Project, filterable on both levels. */
  it('tags every filterable element with its project as well as its category', () => {
    const h = html({ lists: [list({ key: 'TMS - Transportation lifecycle', name: 'TMS', projectId: '47126345' })] });
    expect(h).toMatch(/data-cat="delivery" data-sub="47126345"/);
    expect(h).toMatch(/"sub":"47126345"/);
    expect(h).toMatch(/"subs":{"47126345":"ShipCES"}/);
    expect(h).toContain('Client delivery / ShipCES');
  });

  it('provides the project row the runtime fills', () => {
    expect(html()).toContain('id="subs"');
  });

  it('puts both levels into the copied prompt', () => {
    const h = html({ lists: [list({ key: 'TMS - Transportation lifecycle', name: 'TMS', projectId: '47126345' })] });
    expect(h).toContain('It sits under \\"Client delivery / ShipCES\\"');
  });

  it('escapes a hostile project label on the way into the page', () => {
    const h = html({ lists: [list({ projectId: '<b>x</b>' })] });
    expect(h).not.toContain('data-sub="<b>');
  });

  it('says, in the page, that the numbers describe the selection', () => {
    expect(html()).toMatch(/rebuilds every chart|describe what you selected|Rebuilt from the current selection/i);
  });
});

describe('colour is never the only signal', () => {
  it('gives each category an icon and a word beside its swatch', () => {
    const h = html();
    expect(h).toContain('cat-swatch');
    expect(h).toContain('cat-label');
    expect(h).toContain('cat-icon');
  });

  it('defines the category colours as variables in both modes', () => {
    const h = html();
    expect(h).toMatch(/--cat-government:#c2410c/);
    expect(h).toMatch(/prefers-color-scheme: dark/);
    expect(h).toMatch(/\[data-theme="dark"\]/);
  });

  it('uses the Colaberry brand colour for the title, not a generic blue', () => {
    expect(html()).toMatch(/--brand:#FB2832/);
  });
});

describe('untrusted input', () => {
  it('escapes markup in a list name instead of rendering it', () => {
    const h = html({ lists: [list({ name: '<img src=x onerror=alert(1)>', key: 'evil' })] });
    expect(h).not.toContain('<img src=x');
    expect(h).toContain('&lt;img src=x');
  });

  it('does not let a list name break out of the JSON payload', () => {
    const h = html({ lists: [list({ key: '</script><script>bad()</script>' })] });
    expect(h).not.toContain('</script><script>bad()');
  });
});

describe('degenerate input', () => {
  it('renders a coherent page with nothing in it', () => {
    const h = renderTriageBoard({ items: [], lists: [], today: TODAY });
    expect(h).toContain('Backlog Navigator');
    expect(h).not.toContain('NaN');
    expect(h).toContain('No lists.');
  });

  it('does not emit NaN when counts are missing', () => {
    const h = html({ lists: [{ key: 'x', name: 'x', total: 0, live: 0, dormant: 0, bands: [], suggestions: [] }] });
    expect(h).not.toContain('NaN');
    expect(h).not.toContain('undefined');
  });

  it('survives null lists and items', () => {
    expect(() => renderTriageBoard({ items: null, lists: null, today: TODAY })).not.toThrow();
  });
});

describe('honesty', () => {
  it('says plainly that it changed nothing', () => {
    expect(html()).toMatch(/Nothing here was posted to a ticket or changed in Basecamp/);
  });

  it('names the run and the time it describes', () => {
    expect(html()).toContain('TRIAGE-TEST');
    expect(html()).toMatch(/2026-11-11 12:00 UTC/);
  });

  it('counts lists that matched no category rule, rather than hiding them', () => {
    const h = html({ lists: [list(), list({ key: 'Qqqq wibble', name: 'Qqqq wibble', total: 5 })] });
    expect(h).toMatch(/matched no category rule/);
  });
});

describe('sizeStep', () => {
  it('stays within five steps', () => {
    [1, 5, 12, 20, 39].forEach((n) => {
      const v = sizeStep(n, 39);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(5);
    });
  });

  it('gives the largest list the largest step', () => {
    expect(sizeStep(39, 39)).toBe(5);
  });

  it('does not divide by zero on a single-list backlog', () => {
    expect(sizeStep(1, 1)).toBe(1);
  });
});
