/**
 * The demo engine's trust surface, asserted against RENDERED OUTPUT.
 *
 * ## Why jsdom and not a string search
 *
 * The engine builds its entire page in JavaScript at run time: `index.html`'s `<body>` is three
 * lines and a script tag. So `expect(engineHtml).toContain('Simulated, not live')` would pass on a
 * file where that string sits in a function nobody calls, in a branch that never runs, or in a
 * comment. It would have passed on the version of this engine whose error page rendered with no
 * banner at all, because the success path's copy of the string was present in the source.
 *
 * These tests therefore boot the real engine in jsdom with a real spec and assert on
 * `document.body`. What is asserted is what a viewer would actually see.
 *
 * ## The hard gate these exist to defend
 *
 * The Agentic UX Trust Design Standard's blocking rule is that a demo must never claim an action
 * completed when it did not. The engine's `STATUS` table grants `done: true` to exactly one state,
 * and `statusOf()` resolves an unrecognized status to a danger-toned "Unrecognized state" rather
 * than to anything that reads as success. Both halves are tested, in both directions.
 */
import fs from 'fs';
import path from 'path';
// Typed in one place, because jsdom ships no types and is not a declared dependency.
// See `jsdomForTests.ts` for why that is a shim rather than an import.
import { JSDOM, VirtualConsole, type JsdomInstance } from './jsdomForTests';
import { ACTION_LIFECYCLE } from '../demoSpec/contract';

const ENGINE = fs.readFileSync(
  path.resolve(__dirname, '../demoKitAssets/index.html'),
  'utf8',
);

/** The spec tag the engine reads its spec from, exactly as it appears in the asset. */
const SPEC_TAG = '<script type="application/json" id="demo-spec">{}</script>';

type Loose = Record<string, unknown>;

/**
 * Put a spec into the engine and boot it.
 *
 * jsdom's CSS parser does not understand `color-mix()`, which this engine uses for its rail
 * colors, so a default virtual console would bury the real assertions under style noise. Errors
 * from the engine's own script are still surfaced, via `jsdomError`.
 */
function boot(spec: Loose): {
  dom: JsdomInstance;
  /** The rendered app's markup. See `appText` for why this is not `document.body`. */
  body: string;
  /**
   * The rendered app's visible text.
   *
   * Scoped to `#app` rather than `document.body` deliberately, and the reason matters beyond this
   * test. `document.body` contains two things besides the rendered page: the engine's own
   * `<script>` source, which includes the literal word "Succeeded" in its STATUS table, and the
   * `<script type="application/json">` tag holding the WHOLE SPEC. So a page-wide
   * `not.toContain('Succeeded')` passes or fails on the engine's source code rather than on what
   * the viewer sees, which would make the hard-gate assertion below meaningless.
   *
   * The second of those is a fact about the shipped feature, not just about this test: because the
   * spec is embedded in the served page, every value in it is readable by anyone who opens the
   * demo, whether or not any screen renders it. That is precisely why the restricted-content check
   * lives at the WRITE boundary in `demoSpec/contentPolicy.ts` and not at the response boundary.
   */
  appText: string;
  textOf: (sel: string) => string;
} {
  expect(ENGINE).toContain(SPEC_TAG); // the injection point must still exist
  const html = ENGINE.replace(
    SPEC_TAG,
    `<script type="application/json" id="demo-spec">${JSON.stringify(spec)}</script>`,
  );

  const vc = new VirtualConsole();
  const scriptErrors: string[] = [];
  vc.on('jsdomError', (e: Error) => scriptErrors.push(e.message));

  const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc });
  // A spec that throws inside boot() would otherwise leave an error page that happens to contain
  // the banner, and several assertions below would pass for entirely the wrong reason.
  expect(scriptErrors).toEqual([]);

  const doc = dom.window.document;
  const app = doc.getElementById('app');
  return {
    dom,
    body: app?.innerHTML || '',
    appText: app?.textContent || '',
    textOf: (sel: string) => (doc.querySelector(sel)?.textContent || '').replace(/\s+/g, ' ').trim(),
  };
}

/** One event, with every contract field populated, overridable per test. */
function event(over: Loose = {}): Loose {
  return {
    event_id: 'EV-1',
    occurred_at: '2026-11-21T14:32:00Z',
    work_id: 'WORK-1',
    trace_id: 'TRACE-1',
    parent_event_id: null,
    actor: { type: 'agent', id: 'agent.shiftfill.filler', label: 'Shift Filler', verified: true },
    human_owner_id: 'owner.ops.lead',
    action: 'Offered the open Saturday shift to three qualified nurses',
    status: 'succeeded',
    risk_level: 'low',
    autonomy_tier: 'A2',
    reason_summary: 'Three nurses matched the credential and hours rules.',
    evidence_refs: ['roster.csv#row-41'],
    policy_refs: ['POL-OVERTIME-1'],
    approval: { required: true, status: 'granted', assigned_to: 'owner.ops.lead' },
    side_effects: ['notifications'],
    reversible: true,
    recovery_ref: 'RUNBOOK-7',
    environment: 'demo',
    ...over,
  };
}

/** The minimum a spec needs. Empty screens and nav on purpose: the engine must supply the rest. */
function spec(events: Loose[], over: Loose = {}): Loose {
  return {
    schema_version: 2,
    environment: 'demo',
    app: { name: 'ShiftFill', descriptor: 'shift cover', persona: { name: 'Dana Reyes', role: 'Ops lead' } },
    screens: {},
    nav: [],
    entities: {},
    events,
    ...over,
  };
}

describe('the banner is in the rendered page, on every path', () => {
  it('renders the exact simulated label in VISIBLE TEXT, not just in the markup', () => {
    const { body, appText } = boot(spec([event()]));
    expect(body).toContain('Simulated, not live');
    // textContent, so a string hidden in an attribute or a comment cannot satisfy this.
    expect(appText).toContain('Simulated, not live');
  });

  it('renders it on the ERROR page too, which previously had no banner at all', () => {
    // `screens` stays an object so the engine takes the inline path rather than reaching for
    // fetch; `nav: null` then trips boot()'s own guard, which is the real failure this page is
    // for. (A spec with no `screens` at all makes the engine fetch demo-spec.json instead, so
    // that version of this test was exercising jsdom's missing fetch, not the engine.)
    const { appText } = boot(spec([], { nav: null }));
    expect(appText).toContain('The demo could not load');
    expect(appText).toContain('Simulated, not live');
  });

  it('names the app in the banner when the spec names one', () => {
    const { dom } = boot(spec([event()]));
    expect(dom.window.document.querySelector('.demo-strip')?.textContent).toContain('ShiftFill');
  });

  it('keeps ONE copy of the banner markup: the string appears once per render', () => {
    const { body } = boot(spec([event()]));
    expect(body.split('Simulated, not live').length - 1).toBe(1);
  });
});

describe('the action lifecycle renders the state the action is ACTUALLY in', () => {
  it('renders a distinct label for every one of the seven contract states', () => {
    const events = ACTION_LIFECYCLE.map((status, i) =>
      event({ event_id: `EV-${i}`, status, action: `action ${status}` }),
    );
    const { dom } = boot(spec(events as Loose[]));
    const labels = Array.from(dom.window.document.querySelectorAll('.tl .what')).map((n) =>
      (n.textContent || '').trim(),
    );
    expect(labels).toHaveLength(ACTION_LIFECYCLE.length);

    const expected: Record<string, string> = {
      proposed: 'Proposed',
      queued: 'Queued',
      executing: 'Executing',
      succeeded: 'Succeeded',
      failed: 'Failed',
      canceled: 'Canceled',
      reverted: 'Reverted',
    };
    ACTION_LIFECYCLE.forEach((status, i) => {
      expect(labels[i]).toContain(expected[status]);
    });
    // Distinct, not seven copies of one word.
    expect(new Set(Object.values(expected)).size).toBe(ACTION_LIFECYCLE.length);
  });

  it('A FAILED action renders as failed and NOWHERE as succeeded: the hard gate', () => {
    const { dom, appText } = boot(
      spec([event({ status: 'failed', action: 'Sent the overtime notice' })]),
    );
    const row = dom.window.document.querySelector('.tl > li');
    const text = row?.textContent || '';
    expect(text).toContain('Failed');
    // The direction that actually matters. Asserting only the line above would pass on an engine
    // that printed both words.
    expect(text).not.toContain('Succeeded');
    expect(appText).not.toContain('Succeeded');
    // And it is toned as a failure, not as the amber "a person should look" tone.
    expect(row?.querySelector('.pill.danger')?.textContent).toBe('Failed');
  });

  it('a REVERTED action does not read as a completed one either', () => {
    const { dom } = boot(spec([event({ status: 'reverted' })]));
    const text = dom.window.document.querySelector('.tl > li')?.textContent || '';
    expect(text).toContain('Reverted');
    expect(text).not.toContain('Succeeded');
  });

  it('an UNRECOGNIZED status renders as unrecognized, never as success', () => {
    // 'done' is the plausible wrong value: the word a hand-written spec reaches for.
    const { dom } = boot(spec([event({ status: 'done' })]));
    const text = dom.window.document.querySelector('.tl > li')?.textContent || '';
    expect(text).toContain('Unrecognized state');
    expect(text).not.toContain('Succeeded');
    expect(text).not.toContain('Proposed');
  });

  it('a status that names an Object prototype member does not render a function body', () => {
    // `STATUS[s] || fallback` would find Object.prototype.constructor here and render it.
    for (const trap of ['constructor', 'toString', 'hasOwnProperty']) {
      const { dom } = boot(spec([event({ status: trap })]));
      const text = dom.window.document.querySelector('.tl > li')?.textContent || '';
      expect(text).toContain('Unrecognized state');
      expect(text).not.toContain('function');
      expect(text).not.toContain('native code');
    }
  });
});

describe('every row answers who acted and who is accountable', () => {
  it('shows the actor label, its id, and that the identity was verified', () => {
    const { dom } = boot(spec([event()]));
    const text = dom.window.document.querySelector('.tl .actor')?.textContent || '';
    expect(text).toContain('Agent');
    expect(text).toContain('Shift Filler');
    expect(text).toContain('agent.shiftfill.filler');
    expect(text).toContain('identity verified');
  });

  it('says plainly when an identity was only ASSERTED, and marks it', () => {
    const { dom } = boot(
      spec([event({ actor: { type: 'agent', id: 'a.1', label: 'Shift Filler', verified: false } })]),
    );
    const who = dom.window.document.querySelector('.tl .actor');
    expect(who?.textContent).toContain('identity asserted, not verified');
    // Marked, not merely worded: a reader skimming tone must see it.
    expect(who?.querySelector('.unverified')).not.toBeNull();
  });

  it('shows the accountable human even when the actor IS a human', () => {
    const { dom } = boot(
      spec([
        event({
          actor: { type: 'human', id: 'u.9', label: 'Dana Reyes', verified: true },
          human_owner_id: 'owner.ops.lead',
        }),
      ]),
    );
    const text = dom.window.document.querySelector('.tl .actor')?.textContent || '';
    expect(text).toContain('Person');
    expect(text).toContain('accountable:');
    expect(text).toContain('owner.ops.lead');
  });

  it('distinguishes the four approval states, and a granted one names the approver', () => {
    const cases: Array<[string, string]> = [
      ['granted', 'Approved by'],
      ['pending', 'Waiting on'],
      ['denied', 'Refused by'],
      ['not_required', 'No approval needed'],
    ];
    for (const [status, label] of cases) {
      const { dom } = boot(
        spec([event({ approval: { required: true, status, assigned_to: 'owner.ops.lead' } })]),
      );
      const text = dom.window.document.querySelector('.tl .actor')?.textContent || '';
      expect(text).toContain(label);
    }
  });

  it('an unrecognized approval state is called out, not silently dropped', () => {
    const { dom } = boot(
      spec([event({ approval: { required: true, status: 'ok', assigned_to: null } })]),
    );
    expect(dom.window.document.querySelector('.tl .actor')?.textContent).toContain(
      'Approval state unrecognized',
    );
  });

  it('renders the autonomy tier in words, because "A3" alone says nothing', () => {
    const { dom } = boot(spec([event({ autonomy_tier: 'A3' })]));
    const text = dom.window.document.querySelector('.tl .what')?.textContent || '';
    expect(text).toContain('A3');
    expect(text).toContain('acted alone');
  });
});

describe('evidence, reversibility and side effects are stated, including when absent', () => {
  it('an empty evidence list says so out loud rather than rendering blank', () => {
    const { dom } = boot(spec([event({ evidence_refs: [] })]));
    const refs = dom.window.document.querySelector('.tl .refs');
    expect(refs?.textContent).toContain('no evidence attached');
    expect(refs?.querySelector('.unverified')).not.toBeNull();
  });

  it('an irreversible action is labelled as one, in the attention tone', () => {
    const { dom } = boot(spec([event({ reversible: false, recovery_ref: null })]));
    const refs = dom.window.document.querySelector('.tl .refs');
    expect(refs?.textContent).toContain('Cannot be undone');
    expect(refs?.querySelector('.pill.attention')).not.toBeNull();
  });

  it('a reversible action names its recovery path', () => {
    const { dom } = boot(spec([event({ reversible: true, recovery_ref: 'RUNBOOK-7' })]));
    const text = dom.window.document.querySelector('.tl .refs')?.textContent || '';
    expect(text).toContain('Reversible');
    expect(text).toContain('RUNBOOK-7');
  });

  it('no side effects is stated, not implied by an empty space', () => {
    const { dom } = boot(spec([event({ side_effects: [] })]));
    expect(dom.window.document.querySelector('.tl .refs')?.textContent).toContain('no side effects');
  });

  it('carries the trace id, so one row can be followed to the rest of its work', () => {
    const { dom } = boot(spec([event({ trace_id: 'TRACE-ABC' })]));
    expect(dom.window.document.querySelector('.tl .refs')?.textContent).toContain('TRACE-ABC');
  });
});

describe('a simulated screen is never labelled live', () => {
  it('renders each of the three demo environments by name', () => {
    const cases: Array<[string, string]> = [
      ['demo', 'Demo data'],
      ['sandbox', 'Sandbox'],
      ['simulation', 'Simulation'],
    ];
    for (const [env, label] of cases) {
      const { dom } = boot(spec([event({ environment: env })]));
      expect(dom.window.document.querySelector('.tl .what')?.textContent).toContain(label);
    }
  });

  it('REFUSES to print "production" even when a hand-edited spec says so', () => {
    // The Zod contract rejects this value, but the engine also ships standalone in a builder's
    // repo where nothing validates the file they edit. The allow-list is the second line.
    const { dom, appText } = boot(spec([event({ environment: 'production' })]));
    expect(dom.window.document.querySelector('.tl .what')?.textContent).toContain(
      'Not a live environment',
    );
    // Nowhere in the RENDERED page. The word is still present in the embedded spec JSON, which is
    // the point made in `appText`'s comment: the engine will not display it, and the write
    // boundary is what keeps it out of the document in the first place.
    expect(appText.toLowerCase()).not.toContain('production');
  });
});

describe('the timeline is universal: the engine supplies it when the spec does not', () => {
  it('synthesizes a trust screen and a nav entry for a spec that declares neither', () => {
    const { dom } = boot(spec([event()]));
    const doc = dom.window.document;
    expect(doc.querySelectorAll('.tl > li')).toHaveLength(1);
    const navLabels = Array.from(doc.querySelectorAll('.nav a .lbl')).map((n) => n.textContent);
    expect(navLabels).toContain('Trust and activity');
  });

  it('does NOT add a second one when the spec declares its own trust screen', () => {
    const declared = spec([event()], {
      screens: { activity: { type: 'trust', title: 'Activity' } },
      nav: [{ group: 'Main', items: [{ label: 'Activity', screen: 'activity', icon: 'list' }] }],
    });
    const { dom } = boot(declared);
    const navLabels = Array.from(dom.window.document.querySelectorAll('.nav a .lbl')).map(
      (n) => n.textContent,
    );
    expect(navLabels).toEqual(['Activity']);
    expect(navLabels).not.toContain('Trust and activity');
  });

  it('adds nothing when there are no events to show', () => {
    const empty = spec([], {
      screens: { home: { type: 'rules', title: 'Rules' } },
      nav: [{ group: 'Main', items: [{ label: 'Rules', screen: 'home', icon: 'shield' }] }],
    });
    const { dom } = boot(empty);
    const navLabels = Array.from(dom.window.document.querySelectorAll('.nav a .lbl')).map(
      (n) => n.textContent,
    );
    expect(navLabels).toEqual(['Rules']);
  });

  it('counts the actions it is showing, and says "action" in the singular', () => {
    const one = boot(spec([event()]));
    expect(one.textOf('.head')).toContain('1 action');
    const three = boot(spec([event({ event_id: 'a' }), event({ event_id: 'b' }), event({ event_id: 'c' })]));
    expect(three.textOf('.head')).toContain('3 actions');
  });
});

describe('determinism', () => {
  it('renders byte-identical bodies for the same spec across two independent boots', () => {
    const s = () =>
      spec(
        ACTION_LIFECYCLE.map((status, i) => event({ event_id: `EV-${i}`, status })) as Loose[],
      );
    expect(boot(s()).body).toBe(boot(s()).body);
  });

  it('formats times without a locale, so the output does not depend on the machine', () => {
    const { dom } = boot(spec([event({ occurred_at: '2026-11-21T14:32:00Z' })]));
    const t = dom.window.document.querySelector('.tl time');
    // The UTC fields straight out of the ISO string. `toLocaleString` would render this as
    // anything from "2:32 PM" to "21.11.2026" depending on where the test runs.
    expect(t?.textContent).toContain('14:32');
    expect(t?.textContent).toContain('2026-11-21');
    expect(t?.getAttribute('datetime')).toBe('2026-11-21T14:32:00Z');
  });

  it('preserves the order the producer gave, rather than re-sorting by time', () => {
    const events = [
      event({ event_id: 'late', occurred_at: '2026-11-21T18:00:00Z', action: 'second in the spec' }),
      event({ event_id: 'early', occurred_at: '2026-11-21T09:00:00Z', action: 'first in the spec' }),
    ];
    const { dom } = boot(spec(events));
    const actions = Array.from(dom.window.document.querySelectorAll('.tl .what b')).map(
      (n) => n.textContent,
    );
    expect(actions).toEqual(['second in the spec', 'first in the spec']);
  });
});

describe('untrusted spec content cannot inject markup', () => {
  it('escapes HTML in every field the timeline renders', () => {
    const payload = '<img src=x onerror="window.__pwned=1">';
    const { dom } = boot(
      spec([
        event({
          action: payload,
          reason_summary: payload,
          human_owner_id: payload,
          actor: { type: 'agent', id: payload, label: payload, verified: true },
          evidence_refs: [payload],
          side_effects: [payload],
        }),
      ]),
    );
    expect(dom.window.document.querySelector('.tl img')).toBeNull();
    expect((dom.window as unknown as Loose).__pwned).toBeUndefined();
    expect(dom.window.document.querySelector('.tl .what b')?.textContent).toBe(payload);
  });
});
