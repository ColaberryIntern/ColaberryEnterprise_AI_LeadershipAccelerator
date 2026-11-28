/**
 * The demo on a phone (Ali, 2026-11-25: the client demo needs a phone view).
 *
 * At 390px the menu used to fill the whole first screen before any content, and every table was
 * 560px wide. Now, at 640px and below, the menu folds behind one button that names the current
 * page, and each table cell carries its column name so a row can be shown as a labelled stack.
 * A wide screen is unchanged: the menu box is open and its button hidden.
 *
 * Booted in jsdom like demoEngineTrust.test.ts. jsdom has no layout, so the stylesheet rules are
 * asserted as text and the behaviour (open or folded, labels) on the rendered DOM.
 */
import fs from 'fs';
import path from 'path';
import { JSDOM, VirtualConsole } from './jsdomForTests';

const ENGINE = fs.readFileSync(path.resolve(__dirname, '../demoKitAssets/index.html'), 'utf8');
const SPEC_TAG = '<script type="application/json" id="demo-spec">{}</script>';

const SPEC = {
  schema_version: 2,
  environment: 'demo',
  app: { name: 'ShiftFill', descriptor: 'shift cover', persona: { name: 'Dana Reyes', role: 'Ops lead' } },
  nav: [
    { group: 'Work', items: [{ screen: 'shifts', label: 'Open shifts', icon: 'list' }, { screen: 'activity', label: 'Activity log', icon: 'list' }] },
  ],
  screens: {
    shifts: { type: 'list', entity: 'shift', title: 'Open shifts' },
    activity: { type: 'feed', title: 'Activity log' },
  },
  entities: {
    shift: {
      label: 'Shift', plural: 'Shifts', table: 'shift', title: 'name', status: 'state', columns: ['hours', 'state'],
      fields: [
        { key: 'name', label: 'Shift', type: 'text' },
        { key: 'hours', label: 'Hours', type: 'text' },
        { key: 'state', label: 'Status', type: 'enum', values: ['open', 'filled'], tones: { filled: 'ok' }, labels: { open: 'Open', filled: 'Filled' } },
      ],
      rows: [{ id: 's1', name: 'Saturday night', hours: '8', state: 'open' }],
    },
  },
  events: [],
};

function boot(phone: boolean, hash = '') {
  const html = ENGINE.replace(SPEC_TAG, `<script type="application/json" id="demo-spec">${JSON.stringify(SPEC)}</script>`);
  const vc = new VirtualConsole();
  const errors: string[] = [];
  vc.on('jsdomError', (e: Error) => errors.push(e.message));
  const dom = new JSDOM(html, {
    url: `https://view.test/demo/${hash}`,
    runScripts: 'dangerously',
    virtualConsole: vc,
    beforeParse(window: any) {
      window.matchMedia = (q: string) => ({ matches: phone && q === '(max-width: 640px)', media: q, addListener() {}, removeListener() {} });
    },
  } as any);
  expect(errors).toEqual([]);
  return dom.window.document as Document;
}

describe('the demo on a phone', () => {
  it('folds the menu behind one button that names the page you are on', () => {
    const doc = boot(true, '#shifts');
    const box = doc.querySelector('details.navbox')!;
    expect(box).not.toBeNull();
    expect(box.hasAttribute('open')).toBe(false);
    expect(box.querySelector('summary')!.textContent).toBe('Menu · Open shifts');
    expect(box.querySelectorAll('.navlist a')).toHaveLength(2);
  });

  it('on a wide screen the menu is open, exactly as before', () => {
    const doc = boot(false, '#shifts');
    expect(doc.querySelector('details.navbox')!.hasAttribute('open')).toBe(true);
    expect(doc.querySelector('a[aria-current="page"]')!.textContent).toContain('Open shifts');
  });

  it('every table cell but the title carries its column name, for the stacked row', () => {
    const doc = boot(true, '#shifts');
    const cells = Array.from(doc.querySelectorAll('tbody td'));
    expect(cells.length).toBeGreaterThan(1);
    for (const td of cells) {
      if (td.classList.contains('title')) expect(td.hasAttribute('data-label')).toBe(false);
      else expect(td.getAttribute('data-label')).toBeTruthy();
    }
    expect(cells.map((c) => c.getAttribute('data-label'))).toEqual(expect.arrayContaining(['Hours', 'Status']));
  });

  it('a column name is escaped like everything else the spec supplies', () => {
    const hostile = JSON.parse(JSON.stringify(SPEC));
    hostile.entities.shift.fields[1].label = '"><img src=x onerror=alert(1)>';
    const html = ENGINE.replace(SPEC_TAG, `<script type="application/json" id="demo-spec">${JSON.stringify(hostile)}</script>`);
    const dom = new JSDOM(html, { url: 'https://view.test/demo/#shifts', runScripts: 'dangerously', virtualConsole: new VirtualConsole() } as any);
    expect(dom.window.document.querySelector('#app img')).toBeNull();
  });

  it('the phone rules exist and stay inside the phone breakpoint', () => {
    const phoneBlock = ENGINE.slice(ENGINE.indexOf('@media (max-width: 640px)'));
    const block = phoneBlock.slice(0, phoneBlock.indexOf('\n}') + 2);
    for (const rule of ['.navbox > summary { display: flex', 'thead { display: none; }', 'td::before { content: attr(data-label)', 'table, tbody { display: block;', 'td.title { display: block; text-align: left; font-weight: 600; white-space: normal;', 'dl.facts { grid-template-columns: minmax(0, 1fr);']) {
      expect(block).toContain(rule);
    }
    // Outside the breakpoint the summary is hidden and tables keep their desktop width.
    expect(ENGINE).toContain('.navbox > summary { display: none; }');
    expect(ENGINE).toContain('table { width: 100%; min-width: 560px;');
  });
});
