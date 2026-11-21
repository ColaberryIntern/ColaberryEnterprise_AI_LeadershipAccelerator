/**
 * `renderConnectedDemo`: the server-side render of engine + spec.
 *
 * Two kinds of assertion live here, and the difference matters.
 *
 * The string-level ones (determinism, escaping, refusal) test the function directly, because they
 * are properties of the bytes it returns and a browser would not make them any truer.
 *
 * The "the banner is present in the output" one is NOT a string search. The banner is drawn by the
 * engine at run time, so searching the returned HTML for the phrase would pass on a document that
 * renders a blank page. Those assertions boot the rendered document in jsdom, the same way
 * `demoEngineTrust.test.ts` does, and read the DOM.
 */
import fs from 'fs';
import path from 'path';
import { JSDOM, VirtualConsole } from 'jsdom';
import {
  renderConnectedDemo,
  DemoRenderError,
  DEMO_SPEC_SLOT,
  DEMO_TITLE_SLOT,
} from '../demoRender';
import { demoKitFiles } from '../demoKit';
import { DEMO_KIT_ENGINE_PATH } from '../connectedDemoStory';

/** The engine exactly as the platform ships it, not a copy read off disk. */
const ENGINE = demoKitFiles().find((f) => f.path === DEMO_KIT_ENGINE_PATH)!.content;

type Loose = Record<string, unknown>;

function event(over: Loose = {}): Loose {
  return {
    event_id: 'EV-1',
    occurred_at: '2026-11-21T14:32:00Z',
    work_id: 'WORK-1',
    trace_id: 'TRACE-1',
    parent_event_id: null,
    actor: { type: 'agent', id: 'agent.filler', label: 'Shift Filler', verified: true },
    human_owner_id: 'dana.reyes',
    action: 'Offered the open shift to three nurses',
    status: 'succeeded',
    risk_level: 'low',
    autonomy_tier: 'A2',
    reason_summary: 'Three nurses matched the rules.',
    evidence_refs: ['roster.csv#row-41'],
    policy_refs: ['POL-1'],
    approval: { required: true, status: 'granted', assigned_to: 'dana.reyes' },
    side_effects: ['notifications'],
    reversible: true,
    recovery_ref: 'RUNBOOK-7',
    environment: 'demo',
    ...over,
  };
}

function spec(over: Loose = {}): Loose {
  return {
    schema_version: 2,
    environment: 'demo',
    app: { name: 'ShiftFill', descriptor: 'shift cover', persona: { name: 'Dana Reyes', role: 'Ops lead' } },
    screens: {},
    nav: [],
    entities: {},
    events: [event()],
    ...over,
  };
}

/** Boot a rendered document and hand back what a viewer would actually see. */
function open(html: string): { doc: Document; appText: string; errors: string[] } {
  const vc = new VirtualConsole();
  const errors: string[] = [];
  vc.on('jsdomError', (e: Error) => errors.push(e.message));
  const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc });
  const doc = dom.window.document;
  return { doc, appText: doc.getElementById('app')?.textContent || '', errors };
}

describe('it refuses rather than rendering something half-true', () => {
  it('throws DemoSpecInvalid for a spec that fails the contract, and names the fields', () => {
    const bad = spec({ events: [event({ status: 'done' })] });
    expect(() => renderConnectedDemo(bad, ENGINE)).toThrow(DemoRenderError);
    try {
      renderConnectedDemo(bad, ENGINE);
      throw new Error('should not reach here');
    } catch (e) {
      const err = e as DemoRenderError;
      expect(err.error_class).toBe('DemoSpecInvalid');
      expect(err.problems.length).toBeGreaterThan(0);
      expect(err.problems.map((p) => p.path).join(' ')).toContain('events');
    }
  });

  it.each([
    ['a missing actor', { actor: undefined }],
    ['a missing accountable human', { human_owner_id: undefined }],
    ['an environment of production', { environment: 'production' }],
    ['an autonomy tier outside the five', { autonomy_tier: 'A9' }],
    ['an approval state outside the four', { approval: { required: true, status: 'ok', assigned_to: null } }],
  ])('refuses %s', (_label, over) => {
    expect(() => renderConnectedDemo(spec({ events: [event(over as Loose)] }), ENGINE)).toThrow(
      DemoRenderError,
    );
  });

  it.each([[null], [undefined], ['a string'], [42], [[]]])(
    'refuses a spec that is not an object: %p',
    (value) => {
      expect(() => renderConnectedDemo(value, ENGINE)).toThrow(DemoRenderError);
    },
  );

  it('throws DemoEngineUnusable when the engine has no slot, rather than returning it unchanged', () => {
    // The failure this catches: an engine edit that renames or removes the slot would otherwise
    // serve a page that boots, fetches a demo-spec.json that is not there, and shows an error -
    // with the real reason three steps away from where it happened.
    expect(() => renderConnectedDemo(spec(), '<html><body>no slot here</body></html>')).toThrow(
      /nowhere to put the spec/,
    );
    try {
      renderConnectedDemo(spec(), '<html></html>');
    } catch (e) {
      expect((e as DemoRenderError).error_class).toBe('DemoEngineUnusable');
    }
  });

  it('accepts the valid spec these refusals are measured against', () => {
    // Without this, every refusal above could be passing because the fixture is broken.
    expect(() => renderConnectedDemo(spec(), ENGINE)).not.toThrow();
  });
});

describe('determinism', () => {
  it('returns byte-identical html across two calls with the same spec', () => {
    expect(renderConnectedDemo(spec(), ENGINE)).toBe(renderConnectedDemo(spec(), ENGINE));
  });

  /*
   * The keys that are varied here are `screens` and `entities`, and that is the whole point.
   *
   * `DemoSpecSchema` declares those as `z.record`, and a record passes its input's key order
   * straight through, while every key the schema names is rebuilt in SCHEMA order by `parse`.
   * So a test that shuffled only `app`, `environment` and the rest would pass whether or not this
   * module sorts anything - Zod would be doing the work, and `sortKeys` could be deleted with the
   * suite still green. A mutation run found exactly that: removing the sort survived.
   *
   * This is the real hazard, too. `demo_spec` is a JSONB column, Postgres does not promise the key
   * order it hands back, and `screens` is the part of the spec most likely to be large.
   */
  it('is identical for one spec whose RECORD keys arrive in a different order', () => {
    const screensA = { alpha: { type: 'rules', title: 'A' }, beta: { type: 'rules', title: 'B' } };
    const screensB = { beta: { type: 'rules', title: 'B' }, alpha: { type: 'rules', title: 'A' } };
    const nav = [{ group: 'Main', items: [{ label: 'A', screen: 'alpha', icon: 'shield' }] }];

    const a = spec({ screens: screensA, entities: { x: { label: 'X' }, y: { label: 'Y' } }, nav });
    const b = spec({ screens: screensB, entities: { y: { label: 'Y' }, x: { label: 'X' } }, nav });

    expect(renderConnectedDemo(a, ENGINE)).toBe(renderConnectedDemo(b, ENGINE));
  });

  it('and that test is not vacuous: unsorted JSON of those two specs really does differ', () => {
    // Without this, the assertion above would also pass on an implementation that threw both
    // inputs away. It pins that the two fixtures are genuinely different objects.
    const screensA = { alpha: { title: 'A' }, beta: { title: 'B' } };
    const screensB = { beta: { title: 'B' }, alpha: { title: 'A' } };
    expect(JSON.stringify(screensA)).not.toBe(JSON.stringify(screensB));
  });

  it('is NOT identical when the content differs, so the test above is not vacuous', () => {
    const other = spec({ events: [event({ action: 'A different action entirely' })] });
    expect(renderConnectedDemo(other, ENGINE)).not.toBe(renderConnectedDemo(spec(), ENGINE));
  });

  it('preserves array order, which is the producer\'s meaning rather than an ordering detail', () => {
    const ordered = spec({
      events: [
        event({ event_id: 'b', occurred_at: '2026-11-21T18:00:00Z', action: 'ZZ_LATER_IN_THE_DAY' }),
        event({ event_id: 'a', occurred_at: '2026-11-21T09:00:00Z', action: 'AA_EARLIER_IN_THE_DAY' }),
      ],
    });
    const html = renderConnectedDemo(ordered, ENGINE);
    // Scoped to the embedded spec, and with marker strings that cannot occur in the engine. The
    // first version of this searched the whole document for "first" and "second" and failed on
    // the engine's own `var first = ...`, which would have read as a renderer bug.
    const block = html.slice(html.indexOf('id="demo-spec"'));
    const json = block.slice(0, block.indexOf('</script>'));
    expect(json.indexOf('ZZ_LATER_IN_THE_DAY')).toBeLessThan(json.indexOf('AA_EARLIER_IN_THE_DAY'));
    // The sort is by KEY, so a key-sorted spec must not have reordered the array by value.
    expect(json.indexOf('ZZ_LATER_IN_THE_DAY')).toBeGreaterThan(-1);
  });
});

describe('the spec cannot break out of its script tag', () => {
  it('escapes every < so a spec string cannot close the tag early', () => {
    const hostile = spec({
      events: [event({ action: '</script><img src=x onerror="window.__pwned=1">' })],
    });
    const html = renderConnectedDemo(hostile, ENGINE);
    const block = html.slice(
      html.indexOf('id="demo-spec"'),
      html.indexOf('</script>', html.indexOf('id="demo-spec"')),
    );
    expect(block).not.toContain('<');
    expect(block).toContain('\\u003c');
  });

  it('and the browser agrees: the payload stays data, and the spec still parses', () => {
    const hostile = spec({
      events: [event({ action: '</script><img src=x onerror="window.__pwned=1">' })],
    });
    const { doc, errors } = open(renderConnectedDemo(hostile, ENGINE));
    expect(errors).toEqual([]);
    expect(doc.querySelector('img')).toBeNull();
    // The value survives the round trip intact: escaping, not stripping.
    expect(doc.querySelector('.tl .what b')?.textContent).toBe(
      '</script><img src=x onerror="window.__pwned=1">',
    );
  });

  it('escapes the JavaScript line terminators that are legal inside JSON', () => {
    const html = renderConnectedDemo(
      spec({ events: [event({ reason_summary: 'line one\u2028line two\u2029end' })] }),
      ENGINE,
    );
    expect(html).toContain('\\u2028');
    expect(html).toContain('\\u2029');
  });

  it('does not let a spec value be read as a regex replacement pattern', () => {
    // `String.replace` with a string replacement treats `$&` as "the whole match". A spec carrying
    // it would silently inject the entire slot back into itself.
    const { doc } = open(
      renderConnectedDemo(spec({ events: [event({ action: 'cost $& and $1 and $$' })] }), ENGINE),
    );
    expect(doc.querySelector('.tl .what b')?.textContent).toBe('cost $& and $1 and $$');
  });

  it('escapes the app name before putting it in the title', () => {
    const html = renderConnectedDemo(
      spec({ app: { name: '<script>x</script>', descriptor: 'd', persona: { name: 'p', role: 'r' } } }),
      ENGINE,
    );
    expect(html).toContain('&lt;script&gt;');
    // Escaped in the markup, intact as a value: the title reads as text, not as a tag.
    const noScripts = new JSDOM(html);
    expect(noScripts.window.document.title).toBe('<script>x</script> demo (simulated)');
    expect(noScripts.window.document.querySelectorAll('script')).toHaveLength(2);
  });
});

describe('the rendered document actually works', () => {
  it('boots with no script errors and draws the timeline', () => {
    const { doc, errors } = open(renderConnectedDemo(spec(), ENGINE));
    expect(errors).toEqual([]);
    expect(doc.querySelectorAll('.tl > li')).toHaveLength(1);
  });

  it('shows the banner in VISIBLE TEXT for every valid spec', () => {
    const specs = [
      spec(),
      spec({ events: [event({ status: 'failed' })] }),
      spec({ events: [] }),
      spec({
        screens: { rules: { type: 'rules', title: 'Rules' } },
        nav: [{ group: 'Main', items: [{ label: 'Rules', screen: 'rules', icon: 'shield' }] }],
      }),
    ];
    for (const s of specs) {
      const { appText } = open(renderConnectedDemo(s, ENGINE));
      expect(appText).toContain('Simulated, not live');
    }
  });

  it('says "simulated" in the tab title BEFORE and AFTER the engine boots', () => {
    const html = renderConnectedDemo(spec(), ENGINE);

    // Before: the server-rendered <title>, which is what a scraper or a viewer with JavaScript
    // off reads, and what shows in the tab for the moment before the engine runs.
    const noScripts = new JSDOM(html);
    expect(noScripts.window.document.title).toBe('ShiftFill demo (simulated)');

    // After: the engine overwrites document.title on every render. The two have to agree, or the
    // disclosure would quietly disappear from the tab the instant the page became usable - and
    // the tab is the one surface that survives into a screenshot or a screen share, where the
    // banner does not. The first version of this test found exactly that gap.
    const { doc } = open(html);
    expect(doc.title).toBe('ShiftFill demo (simulated)');
  });

  it('leaves no empty slot behind, so the engine never falls through to fetching a file', () => {
    const html = renderConnectedDemo(spec(), ENGINE);
    expect(html).not.toContain(DEMO_SPEC_SLOT);
    expect(html).toContain('id="demo-spec"');
  });
});

describe('the no-JavaScript state still discloses', () => {
  it('carries the banner before any script runs', () => {
    // Parsed with scripts OFF: this is the document as a viewer with JavaScript disabled, or a
    // scraper, or anyone reading the page in the moment before it boots, would see it.
    const dom = new JSDOM(renderConnectedDemo(spec(), ENGINE));
    const text = dom.window.document.getElementById('app')?.textContent || '';
    expect(text).toContain('Simulated, not live');
    expect(text).toContain('Loading the demo');
  });

  it('keeps the static fallback bound to the engine constant, so the two cannot drift', () => {
    // The fallback is static HTML and cannot call strip(), so it is a second copy of the phrase.
    // This is the thing that makes a second copy safe: change one without the other and it fails.
    const declared = ENGINE.match(/var SIMULATED = '([^']+)'/);
    expect(declared).not.toBeNull();
    const fallback = ENGINE.slice(ENGINE.indexOf('<div id="app">'), ENGINE.indexOf('</div>', ENGINE.indexOf('<div id="app">')));
    expect(fallback).toContain(declared![1]);
  });
});

describe('the slots this module depends on are the ones the engine ships', () => {
  it('finds the spec slot byte-exactly in the shipped engine', () => {
    expect(ENGINE).toContain(DEMO_SPEC_SLOT);
  });

  it('finds the title slot byte-exactly in the shipped engine', () => {
    expect(ENGINE).toContain(DEMO_TITLE_SLOT);
  });

  it('tolerates an engine with no title slot rather than throwing', () => {
    // The spec slot is load-bearing; the title is cosmetic. They are treated differently on
    // purpose, and this pins that difference so a later refactor does not quietly swap them.
    const noTitle = ENGINE.replace(DEMO_TITLE_SLOT, '<title>something else</title>');
    expect(() => renderConnectedDemo(spec(), noTitle)).not.toThrow();
  });
});
