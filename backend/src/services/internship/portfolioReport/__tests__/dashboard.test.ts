/**
 * The interactive page, exercised in a real DOM: click a person, click a tier, try to inject.
 *
 * jsdom is NOT a declared backend dependency: it is present because CI (and local dev) run the
 * workspace-root `npm install`, which hoists the frontend's test tooling. It is required with a
 * minimal local type because no @types/jsdom is installed. Follow-up logged in the PR: declare it
 * as a backend devDependency if this suite ever runs without the workspace install.
 */
import { composeInternshipPortfolio } from '../compose';
import { renderDashboard, safeJson } from '../dashboard/renderDashboard';
import { buildSidecar } from '../sidecar/build';
import type { Sidecar } from '../sidecar/types';
import { NOW, collected, daysAgo, rosterRow } from './fixtures';

/** The slice of jsdom this suite uses. */
interface JSDOM { window: Window & typeof globalThis }
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM: Dom } = require('jsdom') as { JSDOM: new (html: string, opts: { runScripts: 'dangerously'; url: string }) => JSDOM };

function sidecar(): Sidecar {
  const d = collected({
    roster: [rosterRow(), rosterRow({ enrollment_id: 'e2', name: 'Megan Doe', email: 'megan@example.com', project: null, day: 50 })],
    conversations: [
      { from_address: 'kal@example.com', to_text: 'ali@colaberry.com', subject: 'Unable to push: access denied on STORY-1', body: `Found the root cause in .github/workflows/ci.yml. ${'detail '.repeat(90)}`, received_at: daysAgo(1) },
      { from_address: 'megan@example.com', to_text: 'ali@colaberry.com', subject: 'Which project should I pick?', body: `Should I build the scheduler or the intake bot? ${'context '.repeat(90)}`, received_at: daysAgo(2) },
    ],
  });
  const report = composeInternshipPortfolio(d, { now: NOW });
  return buildSidecar(report, { reportDate: '2026-11-09', previous: null, lastOutbound: [], conversations: d.conversations });
}
const load = (html: string, hash = ''): JSDOM => new Dom(html, { runScripts: 'dangerously', url: `https://report.local/${hash}` });
const text = (dom: JSDOM, sel: string): string[] => Array.from(dom.window.document.querySelectorAll(sel)).map((e) => (e.textContent || '').trim());

describe('dashboard: click a person to filter', () => {
  it('lists every intern in the sidebar and shows everyone by default', () => {
    const dom = load(renderDashboard(sidecar()));
    expect(text(dom, '.side .pname')).toEqual(['All interns (2)', 'Kalkidan Bezabeh', 'Megan Doe']);
    expect(dom.window.document.querySelectorAll('article.card')).toHaveLength(2);
  });

  it('clicking a person shows only them: their card, their communications, their JSON', () => {
    const dom = load(renderDashboard(sidecar()));
    const btn = dom.window.document.querySelector('.side button[data-id="e2"]') as HTMLButtonElement;
    btn.click();
    const doc = dom.window.document;
    expect(doc.querySelectorAll('article.card')).toHaveLength(1);
    expect(doc.querySelector('.cname')!.textContent).toBe('Megan Doe');
    expect(doc.querySelector('#comms h2')!.textContent).toBe("Megan's most insightful communications");
    expect(text(dom, '.comm .subj')).toEqual(['Which project should I pick?']);
    expect(JSON.parse(doc.querySelector('pre.json')!.textContent!).enrollment_id).toBe('e2');
    expect(dom.window.location.hash).toBe('#p=e2');
    (doc.querySelector('.filter button') as HTMLButtonElement).click();
    expect(doc.querySelectorAll('article.card')).toHaveLength(2);
  });

  it('a bookmarked #p= link opens filtered, and clicking a tier filters by tier', () => {
    const s = sidecar();
    const dom = load(renderDashboard(s), '#p=e1');
    expect(dom.window.document.querySelectorAll('article.card')).toHaveLength(1);
    const all = load(renderDashboard(s));
    const tierBtn = Array.from(all.window.document.querySelectorAll('.bar-row')).find((b) => /No project/.test(b.textContent || '')) as HTMLButtonElement;
    tierBtn.click();
    expect(text(all, '.cname')).toEqual(['Megan Doe']);
  });
});

describe('dashboard: the suggested prompts, in full', () => {
  it('every ask shows its full prompt and nudge with copy buttons', () => {
    const s = sidecar();
    const dom = load(renderDashboard(s));
    const prompts = text(dom, 'pre.prompt');
    const expected = s.interns.flatMap((i) => i.asks.map((a) => a.prompt.trim()));
    expect(expected.length).toBeGreaterThan(0);
    expect(prompts).toEqual(expected);
    expect(text(dom, '.copy').filter((t) => t === 'Copy prompt')).toHaveLength(expected.length);
    expect(text(dom, '.copy').filter((t) => t === 'Copy nudge')).toHaveLength(expected.length);
  });
});

describe('dashboard: safety', () => {
  it('a subject line cannot close the data script or inject markup', () => {
    const s = sidecar();
    s.top_communications[0].subject = '</script><script>window.pwned=1</script><img src=x onerror="window.pwned=2">';
    s.interns[0].communications[0] = s.top_communications[0];
    const html = renderDashboard(s);
    expect(html).not.toContain('</script><script>window.pwned');
    const dom = load(html);
    expect((dom.window as unknown as { pwned?: number }).pwned).toBeUndefined();
    expect(dom.window.document.querySelector('.comm .subj')!.textContent).toBe(s.top_communications[0].subject);
    expect(dom.window.document.querySelector('.comm img')).toBeNull();
  });

  it('safeJson round-trips and never contains a raw "<"', () => {
    const v = { a: '<b>&</b>', b: 'line sep' };
    const out = safeJson(v);
    expect(out).not.toContain('<');
    expect(JSON.parse(out)).toEqual(v);
  });

  it('only https links become hrefs', () => {
    const s = sidecar();
    s.interns[0].artifacts = [{ ...s.interns[0].artifacts[0] ?? {}, id: 'x', kind: 'build_artifact', kind_label: 'Build Artifact', title: 'evil', published_at: daysAgo(1), url: 'javascript:alert(1)', source: 'repo', provenance: '', file_type: 'pdf', wrong_format: false, classification: 'training_upload' }];
    const dom = load(renderDashboard(s));
    const a = Array.from(dom.window.document.querySelectorAll('a.art')).find((x) => x.textContent?.includes('evil'))!;
    expect(a.getAttribute('href')).toBeNull();
  });
});
