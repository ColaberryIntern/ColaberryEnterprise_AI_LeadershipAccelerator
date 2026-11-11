/**
 * The triage board.
 *
 * A report is only worth testing on the things that would mislead a reader. So: that the headline
 * number is the real one, that a dormant item never appears in the live queue, that colour is
 * never the only carrier of meaning, and that nothing user-supplied can inject markup. The exact
 * pixels are not asserted - they are meant to change.
 */
const { renderTriageBoard } = require('../renderTriageBoard');

const TODAY = '2026-11-11T12:00:00Z';
const item = (due, score, title, projectName = 'Ali Personal') => ({
  todo: { due_on: due, title }, score, projectName,
});

const items = [
  item('2026-11-20', 60, 'Not due yet'),
  item('2026-11-10', 88, 'One day late'),
  item('2026-10-20', 70, 'Three weeks late'),
  item('2026-09-20', 75, 'Seven weeks late'),
  item('2026-07-29', 85, 'Review Women Applying AI Pilot draft'),
  item('2026-01-05', 95, 'Truly ancient'),
];

const html = () => renderTriageBoard({ items, today: TODAY, runId: 'ATA-TEST' });

describe('the headline', () => {
  it('states the dormant count and the total, because that is the decision', () => {
    const h = html();
    expect(h).toContain('>2<'); // dormant count tile
    expect(h).toContain('>6<'); // total tile
    expect(h).toMatch(/active tasks have been overdue/);
  });

  it('names the oldest item, so the number is concrete rather than abstract', () => {
    expect(html()).toContain('Truly ancient');
  });
});

describe('the two queues stay separate', () => {
  /**
   * Scoped to the SECTION, not to the first mention of the words.
   *
   * The first version of this test sliced from the stat tile captioned "Live queue" and swept in
   * the scatter, which plots every task including dormant ones and names each in a hover title.
   * It failed for the right reason and the wrong cause: the board was correct, the assertion was
   * lazy. Worth keeping the note, because the scatter SHOULD span both sets - that span is the
   * whole argument it makes.
   */
  const sectionAfter = (h, heading) => {
    const start = h.indexOf(`<h2>${heading}`);
    const end = h.indexOf('</section>', start);
    return h.slice(start, end === -1 ? undefined : end);
  };

  it('puts a 105-day-old task in dormant and not in the live queue', () => {
    const h = html();
    expect(sectionAfter(h, 'Live queue')).not.toContain('Review Women Applying AI Pilot draft');
    expect(sectionAfter(h, 'Dormant')).toContain('Review Women Applying AI Pilot draft');
  });

  it('keeps a not-yet-due task in the live queue', () => {
    expect(sectionAfter(html(), 'Live queue')).toContain('Not due yet');
  });

  it('does not leak a live task into the dormant table', () => {
    expect(sectionAfter(html(), 'Dormant')).not.toContain('One day late');
  });
});

describe('accessibility and honesty', () => {
  /** The palette validator raised a contrast WARN; the relief is labels plus a table, not luck. */
  it('labels every band with a word and an icon, never colour alone', () => {
    const h = html();
    ['Overdue', 'Aging', 'Dormant', 'Not yet due'].forEach((w) => expect(h).toContain(w));
    expect(h).toContain('pill-icon');
  });

  it('gives both charts a text alternative', () => {
    const h = html();
    const labels = h.match(/aria-label="[^"]+"/g) || [];
    expect(labels.length).toBeGreaterThanOrEqual(2);
    expect(h).toMatch(/aria-label="Task count by how overdue/);
    expect(h).toMatch(/aria-label="Urgency score against days overdue/);
  });

  it('repeats the charted data as a table, which is the contrast relief', () => {
    expect(html()).toContain('<table class="grid">');
  });

  it('defines dark mode explicitly rather than relying on a filter flip', () => {
    const h = html();
    expect(h).toContain('prefers-color-scheme: dark');
    expect(h).toContain('[data-theme="dark"]');
  });

  it('carries the written rule under the diagram, so a failed CDN loses nothing', () => {
    expect(html()).toContain('<noscript>');
    expect(html()).toMatch(/dismiss it when the answer is no/);
  });

  it('pins an exact mermaid version rather than floating', () => {
    expect(html()).toMatch(/mermaid@10\.9\.1/);
  });

  it('says plainly that it changed nothing', () => {
    expect(html()).toMatch(/Nothing in this report was posted to a ticket/);
  });
});

describe('untrusted input', () => {
  it('escapes markup in a task title instead of rendering it', () => {
    const h = renderTriageBoard({
      items: [item('2026-11-10', 50, '<img src=x onerror=alert(1)>')], today: TODAY,
    });
    expect(h).not.toContain('<img src=x');
    expect(h).toContain('&lt;img src=x');
  });

  it('escapes a hostile project name too', () => {
    const h = renderTriageBoard({
      items: [item('2026-11-10', 50, 'ok', '</td><script>bad()</script>')], today: TODAY,
    });
    expect(h).not.toContain('<script>bad()');
  });
});

describe('degenerate input', () => {
  it('renders a coherent page with no tasks at all', () => {
    const h = renderTriageBoard({ items: [], today: TODAY });
    expect(h).toContain('Nothing live. That is a good day.');
    expect(h).toContain('Nothing dormant.');
    expect(h).not.toContain('NaN');
  });

  it('does not emit NaN when scores are missing', () => {
    const h = renderTriageBoard({ items: [{ todo: { due_on: '2026-11-10', title: 'x' } }], today: TODAY });
    expect(h).not.toContain('NaN');
  });

  it('survives a null items list', () => {
    expect(() => renderTriageBoard({ items: null, today: TODAY })).not.toThrow();
  });
});

/**
 * Overplotting. Found by running the board against production, not by reading the code: 2,694
 * points produced an unreadable slab and a 512KB file. The fix samples, and the fix is only
 * acceptable because the chart admits it on its face.
 */
describe('a large backlog', () => {
  const many = Array.from({ length: 2000 }, (_, i) => ({
    todo: { due_on: `2026-0${(i % 9) + 1}-10`, title: `task ${i}` },
    score: 40 + (i % 60),
    projectName: 'Ali Personal',
  }));

  it('does not draw a circle per task', () => {
    const h = renderTriageBoard({ items: many, today: TODAY });
    const circles = (h.match(/<circle /g) || []).length;
    expect(circles).toBeLessThanOrEqual(600);
  });

  it('says on the chart that it is showing a sample, rather than implying completeness', () => {
    const h = renderTriageBoard({ items: many, today: TODAY });
    expect(h).toMatch(/evenly sampled/);
    expect(h).toMatch(/of 2000/);
  });

  it('keeps the page a sane size', () => {
    const h = renderTriageBoard({ items: many, today: TODAY });
    expect(h.length).toBeLessThan(400 * 1024);
  });

  it('samples deterministically, so the same backlog draws the same chart', () => {
    const a = renderTriageBoard({ items: many, today: TODAY });
    const b = renderTriageBoard({ items: many, today: TODAY });
    expect(a).toBe(b);
  });

  it('still draws every point when the set is small, with no sampling note', () => {
    const h = renderTriageBoard({ items, today: TODAY });
    expect(h).not.toMatch(/evenly sampled/);
  });
});
