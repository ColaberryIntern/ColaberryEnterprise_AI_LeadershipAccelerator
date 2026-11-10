/**
 * The interactive page, exercised in a real DOM: click a person, run the tour, copy a prompt, try
 * to inject.
 *
 * jsdom is NOT a declared backend dependency: it is present because CI (and local dev) run the
 * workspace-root `npm install`, which hoists the frontend's test tooling. It is required with a
 * minimal local type because no @types/jsdom is installed. Follow-up logged in the PR: declare it
 * as a backend devDependency if this suite ever runs without the workspace install.
 */
import { composeInternshipPortfolio } from '../compose';
import { renderDashboard, safeJson } from '../dashboard/renderDashboard';
import { internCard } from '../render';
import { buildSidecar } from '../sidecar/build';
import type { PortfolioReport } from '../types';
import type { Sidecar } from '../sidecar/types';
import { NOW, collected, daysAgo, rosterRow } from './fixtures';

/** The slice of jsdom this suite uses. */
interface JSDOM { window: Window & typeof globalThis }
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM: Dom } = require('jsdom') as { JSDOM: new (html: string, opts: { runScripts: 'dangerously'; url: string }) => JSDOM };

function build(): { report: PortfolioReport; s: Sidecar; html: string } {
  const d = collected({
    roster: [rosterRow(), rosterRow({ enrollment_id: 'e2', name: 'Megan Doe', email: 'megan@example.com', project: null, day: 50 })],
    emails: [{ email: 'kal@example.com', subject: 'Unable to push, access denied', snippet: 'blocked', received_at: daysAgo(2) }],
  });
  d.projects[0].commits = [{ sha: 'a', date: daysAgo(6), author: 'kal', message: 'feature' }];
  const report = composeInternshipPortfolio(d, { now: NOW });
  const s = buildSidecar(report, { reportDate: '2026-11-09', previous: null, lastOutbound: [] });
  return { report, s, html: renderDashboard(report, s) };
}
const load = (html: string, hash = ''): JSDOM => new Dom(html, { runScripts: 'dangerously', url: `https://report.local/${hash}` });
const visible = (dom: JSDOM, sel: string): Element[] => Array.from(dom.window.document.querySelectorAll(sel)).filter((e) => !(e as HTMLElement).hidden && !(e as HTMLElement).closest('[hidden]'));

describe('dashboard: the report, with the report\'s own formatting', () => {
  it('each intern card is the email card, plus only anchors', () => {
    const { report, html } = build();
    const c = report.groups.flatMap((g) => g.interns)[0];
    const stripAnchors = (s: string): string => s.replace(/<div id="(facts|artifacts|timeline|asks)-[^"]+">/g, '').replace(/<\/div>/g, '');
    expect(stripAnchors(internCard(c, { anchors: true }))).toBe(stripAnchors(internCard(c)));
    expect(html).toContain(internCard(c, { anchors: true }));
    expect(html).toContain('How to read the timelines');
    expect(html).toContain('Everyone on one timeline');
  });
});

describe('dashboard: click a person to filter everything', () => {
  it('filters the combined timeline, the glance table, the notes and the cards together', () => {
    const { html } = build();
    const dom = load(html);
    const doc = dom.window.document;
    expect(visible(dom, '.intern')).toHaveLength(2);
    (doc.querySelector('#side .person[data-person="e2"]') as HTMLButtonElement).click();
    expect(visible(dom, '.intern').map((e) => e.getAttribute('data-e'))).toEqual(['e2']);
    expect(visible(dom, '#combined .ct-line').every((e) => e.getAttribute('data-e') === 'e2')).toBe(true);
    expect(visible(dom, '.glance tr[data-e]').map((e) => e.getAttribute('data-e'))).toEqual(['e2']);
    expect(doc.getElementById('filter-name')!.textContent).toBe('Megan Doe');
    expect(dom.window.location.hash).toBe('#p=e2');
    (doc.getElementById('filter-clear') as HTMLButtonElement).click();
    expect(visible(dom, '.intern')).toHaveLength(2);
  });

  it('a name pill on the combined timeline filters too, and #p= opens filtered', () => {
    const { html } = build();
    const dom = load(html);
    (dom.window.document.querySelector('#combined .who[data-person="e1"]') as HTMLButtonElement).click();
    expect(visible(dom, '.intern').map((e) => e.getAttribute('data-e'))).toEqual(['e1']);
    expect(visible(load(html, '#p=e2'), '.intern').map((e) => e.getAttribute('data-e'))).toEqual(['e2']);
  });
});

describe('dashboard: the guided tour', () => {
  it('walks the highlights in order, outlining each target, and ends cleanly', () => {
    const { s, html } = build();
    expect(s.highlights.length).toBeGreaterThan(0);
    const dom = load(html);
    const doc = dom.window.document;
    (doc.getElementById('tour-start') as HTMLButtonElement).click();
    expect(doc.getElementById('tour')!.classList.contains('on')).toBe(true);
    expect(doc.getElementById('tour-title')!.textContent).toBe(s.highlights[0].title);
    expect(doc.querySelectorAll('.tour-hl')).toHaveLength(1);
    for (let i = 1; i < s.highlights.length; i += 1) {
      (doc.getElementById('tour-next') as HTMLButtonElement).click();
      expect(doc.getElementById('tour-title')!.textContent).toBe(s.highlights[i].title);
      expect(doc.querySelectorAll('.tour-hl')).toHaveLength(1);
    }
    (doc.getElementById('tour-end') as HTMLButtonElement).click();
    expect(doc.getElementById('tour')!.classList.contains('on')).toBe(false);
    expect(doc.querySelectorAll('.tour-hl')).toHaveLength(0);
  });
});

describe('dashboard: prompts are compact and copyable', () => {
  it('every prompt scrolls inside a short box and has a Copy button', () => {
    const { s, html } = build();
    expect(html).toContain('[id^="asks-"] pre{max-height:8.2em;overflow:auto}');
    const dom = load(html);
    const prompts = dom.window.document.querySelectorAll('[id^="asks-"] pre');
    const asks = s.interns.reduce((n, i) => n + i.asks.length, 0);
    expect(prompts.length).toBe(asks);
    expect(dom.window.document.querySelectorAll('[id^="asks-"] .cp').length).toBe(asks * 2);
  });
});

describe('dashboard: safety', () => {
  it('a highlight title cannot close the data script or inject markup', () => {
    const { report, s } = build();
    s.highlights[0].title = '</script><script>window.pwned=1</script><img src=x onerror="window.pwned=2">';
    const html = renderDashboard(report, s);
    expect(html).not.toContain('</script><script>window.pwned');
    const dom = load(html);
    (dom.window.document.getElementById('tour-start') as HTMLButtonElement).click();
    expect((dom.window as unknown as { pwned?: number }).pwned).toBeUndefined();
    expect(dom.window.document.getElementById('tour-title')!.textContent).toBe(s.highlights[0].title);
  });

  it('safeJson round-trips and never contains a raw "<"', () => {
    const v = { a: '<b>&</b>', b: 'line sep' };
    const out = safeJson(v);
    expect(out).not.toContain('<');
    expect(JSON.parse(out)).toEqual(v);
  });
});
