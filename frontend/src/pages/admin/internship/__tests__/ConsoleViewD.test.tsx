import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import InternConsoleMode from '../InternConsoleMode';
import ConsoleViewD from '../ConsoleViewD';

/**
 * Agent nudges, rendered.
 *
 * The composer's wording and the send service's rules have their own suites on the backend. These
 * check the three things only a render can show, each of which is a way this screen could mislead
 * the person holding it:
 *
 *   1. **Nothing sends on one click.** A single click arms the row and says so; only the second
 *      sends. A one-click send on a screen listing seven real people is the mistake worth making
 *      structurally impossible.
 *   2. **The words are readable before the send**, and the composed HTML is never injected - the
 *      body renders as text, so this panel cannot execute markup the composer produced.
 *   3. **A row the weekday run would hold still has a working Send button**, because overriding it
 *      is the manual button's whole purpose, and the result says which verdict it overrode.
 */

const mockFetchNudges = jest.fn();
const mockNudgeOne = jest.fn();
const mockNudgeAll = jest.fn();
jest.mock('../../../../services/agentNudgeApi', () => ({
  fetchAgentNudges: (...a: unknown[]) => mockFetchNudges(...a),
  nudgeOneBuilder: (...a: unknown[]) => mockNudgeOne(...a),
  nudgeAllBuilders: (...a: unknown[]) => mockNudgeAll(...a),
  DECISION_LABEL: {
    quiet_and_silent: 'Quiet, and has not written in',
    never_started: 'Has never started',
    awaiting_our_reply: 'We owe them a reply',
    moved_recently: 'Committed since yesterday',
    no_recipient: 'No email address on file',
    not_a_builder: 'Not an assigned builder',
  },
}));

const mockFetchRoster = jest.fn();
jest.mock('../../../../services/adminInternConsoleApi', () => ({
  fetchConsoleRoster: (...a: unknown[]) => mockFetchRoster(...a),
}));

const DISCLOSURE = 'Preview only. Nothing has been sent.';

const builder = (over: Record<string, unknown> = {}) => ({
  domain: 'hr',
  agent: 'Dara',
  firstName: 'Robin',
  email: 'robin@example.test',
  band: 'red',
  daysSinceCommit: 8,
  verified: 1,
  stories: 12,
  overdue: 3,
  gradeableStories: 12,
  awaitingOurReply: false,
  priorNudgeCount: 0,
  nextStory: { storyId: 'HR.004', title: 'Wire the intake form', dueOn: '2026-10-20', gradeable: true },
  decision: { send: true, reason: 'quiet_and_silent' },
  nudge: {
    variant: 'next_story',
    subject: 'Your next step on Dara',
    text: 'THE COMPOSED BODY, which is long enough to be a real message and should not be on screen until asked for.',
    html: '<p>THE COMPOSED BODY</p><img src="x" id="injected-marker" />',
  },
  ...over,
});

let container: HTMLDivElement;
let root: Root;

const mount = async (node: React.ReactElement) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(node); });
};

/** Mounts the view on its own, which is how it loads: it takes no props and fetches its own data. */
const render = async (builders: unknown[]) => {
  mockFetchNudges.mockResolvedValue({ builders, disclosure: DISCLOSURE });
  await mount(<ConsoleViewD />);
};

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
  jest.clearAllMocks();
});

const text = () => container.textContent ?? '';
const buttons = () => Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
/**
 * EXACT label first, substring only as a fallback.
 *
 * A pure substring match picked the wrong button: the row's "Send" is a prefix of the header's
 * "Send to all N who need it", so asking for "Send" returned the bulk control - which is disabled
 * when nobody is due, making the per-row override look broken when it was not.
 */
const byLabel = (label: string) => {
  const all = buttons();
  return all.find((b) => (b.textContent ?? '').trim() === label)
    ?? all.find((b) => (b.textContent ?? '').includes(label));
};
const click = async (label: string) => {
  const b = byLabel(label);
  if (!b) throw new Error(`no button matching "${label}". Buttons: ${buttons().map((x) => x.textContent).join(' | ')}`);
  await act(async () => { b.click(); });
};

// ─────────────────────────── it opens from the URL ───────────────────────────

describe('the view opens from the URL', () => {
  it('renders the nudge view when ?cv=D, and not the Command Center', async () => {
    mockFetchRoster.mockResolvedValue({
      interns: [{
        enrollment_id: 'e1', name: 'Someone', email: null, application_state: 'active',
        application_id: 'a1', joined_at: null, day: 1, cohort: null,
        activity: { last_activity_at: null, last_activity_source: null, days_since: 1, level: 'yellow', days: [], graced: false },
        training: { weeks: [], weeks_completed: 0, weeks_1_3_clear: false, pace: null, pace_unavailable: null },
        cert: { sittings: 0, completed: 0, last_sitting_at: null, available: true },
        project: null,
      }],
      counts: {
        interns: 1, weeks_1_3_clear: 0, no_project: 1, quiet_4_plus: 0, dark_10_plus: 0,
        never_active: 0, cert_started: 0, paused: 0, pace_unavailable: 0,
      },
      stages: [],
    });
    mockFetchNudges.mockResolvedValue({ builders: [builder()], disclosure: DISCLOSURE });

    await mount(
      <MemoryRouter initialEntries={['/admin/internship?view=console&cv=D']}>
        <InternConsoleMode />
      </MemoryRouter>,
    );

    // "Agent nudges" is the tab label and renders on every view, so it proves nothing on its own.
    expect(text()).toContain('Weekday run');
    expect(text()).toContain('Dara');
    expect(mockFetchNudges).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────── nothing sends on one click ───────────────────────────

describe('a send takes two deliberate clicks', () => {
  it('the first click sends nothing and asks for confirmation', async () => {
    await render([builder()]);

    await click('Send');
    expect(mockNudgeOne).not.toHaveBeenCalled();
    expect(text()).toContain('Confirm send');
  });

  it('the second click is what sends', async () => {
    mockNudgeOne.mockResolvedValue({
      domain: 'hr', email: 'robin@example.test', outcome: 'sent',
      subject: 'Your next step on Dara', variant: 'next_story',
      decision: { send: true, reason: 'quiet_and_silent' },
    });
    await render([builder()]);

    await click('Send');
    await click('Confirm send');
    expect(mockNudgeOne).toHaveBeenCalledWith('hr', { send: true });
    expect(text()).toContain('Sent');
  });

  it('cancelling disarms the row without sending', async () => {
    await render([builder()]);

    await click('Send');
    await click('Cancel');
    expect(mockNudgeOne).not.toHaveBeenCalled();
    expect(text()).not.toContain('Confirm send');
  });

  it('the bulk button arms too, and names how many people it will email', async () => {
    await render([builder(), builder({ domain: 'curriculum', agent: 'Kai' })]);

    await click('Send to all');
    expect(mockNudgeAll).not.toHaveBeenCalled();
    expect(text()).toContain('Confirm: email 2 builders');

    await click('Confirm: email 2 builders');
    expect(mockNudgeAll).toHaveBeenCalledWith({ send: true });
  });

  it('previewing the whole run does not pass send', async () => {
    mockNudgeAll.mockResolvedValue({ attempted: 0, sent: 0, outcomes: [] });
    await render([builder()]);

    await click('Preview the whole run');
    expect(mockNudgeAll).toHaveBeenCalledWith({ send: false });
  });
});

// ─────────────────────────── the words, before the send ───────────────────────────

describe('the message is readable and never injected', () => {
  it('hides the body until it is asked for', async () => {
    await render([builder()]);

    expect(text()).toContain('Your next step on Dara');     // the subject is always visible
    expect(text()).not.toContain('THE COMPOSED BODY');       // the body is not
    await click('Read the message');
    expect(text()).toContain('THE COMPOSED BODY');
  });

  /**
   * MUTATION PROOF. Render the body with `dangerouslySetInnerHTML={{ __html: b.nudge.html }}` and
   * this test dies: `#injected-marker` appears in the DOM. The composer escapes its own output, so
   * this is defence in depth rather than the only guard - but it is the guard that survives
   * somebody later adding an unescaped field to the composer.
   */
  it('renders the body as TEXT, so the composed HTML cannot be injected', async () => {
    await render([builder()]);

    await click('Read the message');
    expect(container.querySelector('#injected-marker')).toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(0);
    // And the markup arrives as visible characters rather than as elements.
    expect(text()).toContain('THE COMPOSED BODY');
  });

  it('shows which variant today is, so five weekdays running are visibly different', async () => {
    await render([builder()]);

    await click('Read the message');
    expect(text()).toContain('next_story');
  });
});

// ─────────────────────────── the verdict, and overriding it ───────────────────────────

describe('the weekday verdict is shown and can be overruled', () => {
  const held = builder({
    daysSinceCommit: 0, band: 'green',
    decision: { send: false, reason: 'moved_recently' },
  });

  it('says it would hold, and why, in words rather than an enum', async () => {
    await render([held]);

    expect(text()).toContain('would hold');
    expect(text()).toContain('Committed since yesterday');
    expect(text()).not.toContain('moved_recently');
  });

  it('still offers a working Send on a row it would hold', async () => {
    // The manual button exists precisely for this case: a manager looking at the state knows
    // something the rule does not.
    await render([held]);

    const send = byLabel('Send');
    expect(send).toBeDefined();
    expect(send!.disabled).toBe(false);
  });

  it('reports the verdict it overrode rather than quietly contradicting the row', async () => {
    mockNudgeOne.mockResolvedValue({
      domain: 'hr', email: 'robin@example.test', outcome: 'sent', subject: 's', variant: 'v',
      decision: { send: false, reason: 'moved_recently' },
    });
    await render([held]);

    await click('Send');
    await click('Confirm send');
    expect(text()).toContain('the weekday run would have held this');
  });

  it('disables the bulk send when nobody is due, instead of emailing nobody', async () => {
    await render([held]);

    const all = byLabel('Send to all');
    expect(all!.disabled).toBe(true);
    expect(text()).toContain('would send 0 today');
  });
});

// ─────────────────────────── states that are not failures ───────────────────────────

describe('states that are not failures', () => {
  it('an empty roster explains itself instead of looking broken', async () => {
    await render([]);

    expect(text()).toContain('No agent domain has an assigned builder');
    expect(buttons().filter((b) => (b.textContent ?? '').includes('Send'))).toHaveLength(0);
  });

  it('renders the disclosure verbatim, because it is the sentence that says nothing was sent', async () => {
    await render([builder()]);

    expect(text()).toContain(DISCLOSURE);
  });

  /**
   * A builder whose stories carry no acceptance criteria cannot have anything verified. Showing
   * "0 verified" without that caveat would be the system blaming someone for its own gap.
   */
  it('says when nothing CAN be graded, rather than showing a bare zero', async () => {
    await render([builder({ verified: 0, gradeableStories: 0 })]);

    expect(text()).toContain('none gradeable');
  });

  it('a builder with no commit ever reads "never", not "0 days ago"', async () => {
    await render([builder({ daysSinceCommit: null, band: 'unknown' })]);

    expect(text()).toContain('never');
    expect(container.querySelector('.lv-unknown')).not.toBeNull();
  });

  it('a load failure offers a retry and shows no roster', async () => {
    mockFetchNudges.mockRejectedValue({ response: { data: { error: 'nope' } } });
    await mount(<ConsoleViewD />);

    expect(text()).toContain('nope');
    expect(byLabel('Try again')).toBeDefined();
    expect(text()).not.toContain('Dara');
  });
});
