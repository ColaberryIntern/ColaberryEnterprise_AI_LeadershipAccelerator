/**
 * The engine draws the plan, in a browser.
 *
 * `visualPlan.test.ts` proves what the rules decide and `visualRulesInline.test.ts` proves the
 * browser copy agrees with the Node one. Neither proves anything renders: both would stay green
 * if the engine ignored the plan entirely. So this boots the real engine over the real fixtures
 * in jsdom and reads the DOM.
 *
 * The negatives carry as much weight as the positives. A thin spec must come back as it always
 * did, a capped block must say what it is hiding, and a spec whose data is malformed must still
 * produce a page, because the tables are the part that already worked and the rules are the part
 * that is new.
 */
import { JSDOM, VirtualConsole, type JsdomInstance } from './jsdomForTests';
import { demoKitFiles } from '../demoKit';
import { DEMO_KIT_ENGINE_PATH } from '../connectedDemoStory';
import {
  shiftCoverage, thinSpec, overCapSpec, documentReview, maintenanceQueue,
} from './visualFixtures';

const SPEC_TAG = '<script type="application/json" id="demo-spec">{}</script>';
const ENGINE = demoKitFiles().find((f) => f.path === DEMO_KIT_ENGINE_PATH)!.content;

interface Booted {
  dom: JsdomInstance;
  app: Element | null;
  text: string;
  all: (sel: string) => Element[];
}

function boot(spec: unknown, hash = ''): Booted {
  expect(ENGINE).toContain(SPEC_TAG);
  const html = ENGINE.replace(
    SPEC_TAG,
    `<script type="application/json" id="demo-spec">${JSON.stringify(spec)}</script>`,
  );
  const vc = new VirtualConsole();
  const errors: string[] = [];
  vc.on('jsdomError', (e: Error) => errors.push(e.message));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    virtualConsole: vc,
    url: `https://example.test/demo${hash ? `#${hash}` : ''}`,
  });
  // A throw inside boot() leaves an error page that still carries the banner, and half the
  // assertions below would pass for the wrong reason.
  expect(errors).toEqual([]);
  const doc = dom.window.document;
  const app = doc.getElementById('app');
  return {
    dom,
    app,
    text: (app?.textContent || '').replace(/\s+/g, ' ').trim(),
    all: (sel: string) => Array.from(doc.querySelectorAll(sel)),
  };
}

describe('the home screen becomes an analysis', () => {
  const home = boot(shiftCoverage);

  it('draws the timeline, one lane per work item', () => {
    const lanes = home.all('.chart svg .lane');
    expect(lanes.length).toBe(3);
    expect(home.text).toContain('Work in progress, item by item');
  });

  it('marks now from the spec, never from the clock', () => {
    // 13:30Z is the latest event in the fixture. A wall-clock read would put this line somewhere
    // else every day and the demo would stop being reproducible.
    const now = home.all('.nowline text')[0];
    expect(now).toBeDefined();
    expect(now.textContent).toContain('1:30 PM');
  });

  it('labels lanes with what the row is, not its id', () => {
    const labels = home.all('.lane-label').map((n) => n.textContent);
    expect(labels).toContain('North · open');
    expect(labels).not.toContain('g1');
  });

  it('counts the statuses into tiles', () => {
    // Read structurally rather than from textContent: the markup puts the number and the label in
    // adjacent elements with no whitespace between them, so a string assertion was matching
    // "2OpenGaps" and failing for a reason that had nothing to do with the count.
    const tiles = home.all('.tiles .tile').map((t) => ({
      n: (t.querySelector('.n')?.textContent || '').trim(),
      label: (t.querySelector('strong')?.textContent || '').trim(),
    }));
    expect(tiles).toEqual(expect.arrayContaining([
      { n: '2', label: 'Open' },
      { n: '1', label: 'Filled' },
    ]));
  });

  it('shows what is waiting on a person, with the entity\'s own action', () => {
    expect(home.text).toContain('Needs your decision');
    const buttons = home.all('.dcard button').map((b) => b.textContent);
    expect(buttons).toContain('Approve cover');
  });

  it('shows the funnel with a takeaway computed from the rows', () => {
    expect(home.text).toContain('1 of 3 reached accepted.');
  });
});

describe('a list screen keeps its table and adds what the table cannot show', () => {
  const people = boot(shiftCoverage, 'people');

  it('still renders the table', () => {
    expect(people.all('table').length).toBeGreaterThan(0);
    expect(people.text).toContain('Avery Stone');
  });

  it('compares the shared number as bars, labelled with the value', () => {
    const vals = people.all('.bars .brow .val').map((n) => (n.textContent || '').trim());
    expect(vals).toEqual(['41 h', '38 h', '36 h', '22 h']);
  });

  it('does NOT put the path of steps on a screen the events are not about', () => {
    // The events carry a work_id naming gaps, so "how the work went" on the people screen was a
    // true picture of the wrong thing.
    expect(people.text).not.toContain('How the work actually went');
  });

  it('does put it on the screen the events ARE about, with the wait between steps', () => {
    const gaps = boot(shiftCoverage, 'gaps');
    expect(gaps.text).toContain('How the work actually went');
    expect(gaps.text).toContain('18 min');
  });
});

describe('the roster is built from the events', () => {
  const who = boot(shiftCoverage, 'who');

  it('never claims there are no agents when the log names them', () => {
    // Guard 4. This screen used to print exactly that sentence over its own activity log.
    expect(who.text).not.toContain('The plan names no agents.');
    expect(who.text).toContain('First Agent');
    expect(who.text).toContain('Dana Reyes');
  });

  it('shows actions by autonomy tier when more than one tier was used', () => {
    expect(who.all('.tierbar .seg').length).toBeGreaterThanOrEqual(2);
  });
});

describe('what the rules refuse, the engine does not draw', () => {
  it('a thin spec renders with no charts at all', () => {
    const thin = boot(thinSpec);
    expect(thin.all('.chart').length).toBe(0);
    // And it is still a page, not a blank one.
    expect(thin.text).toContain('Start');
  });

  it('a spec with no narrowing child draws no funnel', () => {
    const docs = boot(documentReview);
    expect(docs.text).not.toContain('by stage');
  });

  it('a spec with no target draws no target bar on its list', () => {
    const deals = boot(maintenanceQueue, 'crews');
    expect(deals.all('.vbar').length).toBe(0);
  });
});

describe('caps are visible, not silent', () => {
  const wide = boot(overCapSpec);

  it('draws no more lanes than the cap allows', () => {
    expect(wide.all('.chart svg .lane').length).toBe(8);
  });

  it('says how many of how many it is showing', () => {
    expect(wide.text).toContain('Showing 8 of 30');
  });

  it('caps the headline tiles too', () => {
    expect(wide.all('.tiles .tile').length).toBe(6);
  });
});

describe('the visuals never take the page down with them', () => {
  it('renders a page when the data the rules read is malformed', () => {
    /*
     * The tables are the part that already worked; the rules are the part that is new. A spec
     * whose entities are not what the contract says must still produce a readable demo, with the
     * visuals absent rather than the page blank.
     */
    const broken = { ...shiftCoverage, entities: { gap: 'not an entity at all' } } as unknown;
    const page = boot(broken);
    expect(page.text).toContain('Good morning');

    // The ENTITY-derived visuals go, because their data is the part that is broken.
    expect(page.all('.bars .brow').length).toBe(0);
    expect(page.text).not.toContain('by stage');

    /*
     * The timeline STAYS, and that is correct rather than a leak. Its lanes come from the events,
     * which this spec still carries intact, so refusing to draw it would be discarding good data
     * because unrelated data was bad. An earlier version of this test asserted zero lanes and was
     * wrong about which half was broken.
     */
    expect(page.all('.chart svg .lane').length).toBe(3);
  });

  it('still carries the simulated banner on every one of these pages', () => {
    for (const spec of [shiftCoverage, thinSpec, overCapSpec]) {
      expect(boot(spec).text).toContain('Simulated, not live');
    }
  });
});
