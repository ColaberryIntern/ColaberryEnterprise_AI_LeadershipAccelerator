import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ConsoleViewD from '../ConsoleViewD';
import type { InternRow } from '../../../../services/adminInternConsoleApi';

/**
 * Nudges, rendered.
 *
 * The composer's wording and the send route's rules have their own suites on the backend. These
 * check the four things only a render can show, each of which is a way this screen could mislead
 * the person holding it:
 *
 *   1. **Every intern is listed**, not only the ones building an agent. That was the actual defect:
 *      a gov-contract intern and an intern with no project owned no agent domain and so did not
 *      appear at all, on a screen whose whole job is "who needs a message today".
 *   2. **Nothing is generated until asked, and nothing sends on one click.** A single click arms
 *      the row and says so; only the second sends.
 *   3. **The message is re-fetched every time a row is opened**, so a copy that has been sitting on
 *      screen cannot be sent by accident after the facts have moved.
 *   4. **What is on screen is what is posted**, including an edit the manager typed.
 */

const mockFetchBrief = jest.fn();
const mockFetchAll = jest.fn();
const mockSendBrief = jest.fn();
jest.mock('../../../../services/internNudgeApi', () => ({
  fetchBrief: (...a: unknown[]) => mockFetchBrief(...a),
  fetchAllBriefs: (...a: unknown[]) => mockFetchAll(...a),
  sendBriefMessage: (...a: unknown[]) => mockSendBrief(...a),
  HOLD_LABEL: {
    no_email: 'No address', unsendable_text: 'Would be refused',
    paused: 'Paused', messaged_today: 'Written to today',
  },
  TIER_LABEL: {
    blocked_waiting_on_ali: 'Waiting on you', no_project_at_day_N: 'No project',
    never_started_building: 'Never started', overdue_backlog: 'Overdue backlog',
    quiet: 'Gone quiet', on_track: 'On track',
  },
  TIER_RANK: {
    blocked_waiting_on_ali: 0, no_project_at_day_N: 1, never_started_building: 2,
    overdue_backlog: 3, quiet: 4, on_track: 5,
  },
  TIER_TONE: {
    blocked_waiting_on_ali: 'alert', no_project_at_day_N: 'alert', never_started_building: 'alert',
    overdue_backlog: 'warn', quiet: 'warn', on_track: 'ok',
  },
}));

const row = (over: Partial<InternRow> = {}): InternRow => ({
  enrollment_id: 'e-agent', name: 'Kalkidan Bezabeh', email: 'k@example.test',
  application_state: 'active', application_id: 'a1', joined_at: '2026-09-21', day: 50,
  cohort: { id: null, name: null, type: null },
  activity: { level: 'orange' } as InternRow['activity'],
  training: {} as InternRow['training'],
  cert: {} as InternRow['cert'],
  project: { name: 'Admissions' } as InternRow['project'],
  ...over,
});

const SIGNALS = {
  day: 50, percentBuilt: 40, storiesVerified: 4, storiesTotal: 10, overdueTasks: 6,
  daysSinceBuildWork: 2, artifacts: 0, trainingWeeksCompleted: 3, trainingWeeksTotal: 10,
  gateCleared: true, openQuestions: 0, hasRepo: true,
};

const brief = (over: Record<string, unknown> = {}) => ({
  enrollmentId: 'e-gov', name: 'Omolola Makinde', firstName: 'Omolola', email: 'o@example.test',
  tier: 'overdue_backlog', tierReason: 'Six tasks are past their due date.',
  trackLabel: 'Saratoga', projectName: 'Saratoga',
  signals: SIGNALS, lastOutbound: null, inboundSince: null,
  deadline: { what: 'case study package', dueOn: '2026-11-12', daysLeft: 2, outstanding: ['Record Your Working-System Demo'] },
  promises: [], subject: '2 days to your case study package',
  body: 'Omolola,\n\nTwo days. Your case study package is due on November 12.',
  attachment: null, warnings: [], generatedAt: new Date().toISOString(),
  ...over,
});

/** A prepared batch: one to send, one held, one that could not be generated at all. */
const batch = (over: Record<string, unknown> = {}) => ({
  generatedAt: new Date().toISOString(),
  attempts: [
    { ok: true, brief: brief(), hold: null },
    {
      ok: true,
      brief: brief({
        enrollmentId: 'e-agent', name: 'Kalkidan Bezabeh', firstName: 'Kalkidan',
        email: 'k@example.test', tier: 'on_track', projectName: 'Admissions',
        body: 'Kalkidan,\n\nYour Capability Map is the next thing.',
        lastOutbound: { sentAt: new Date().toISOString(), subject: 'This morning' },
      }),
      hold: { reason: 'messaged_today', detail: 'We already wrote to them today, and they have not replied since.' },
    },
    { ok: false, enrollmentId: 'e-ali', name: 'Ali Muwwakkil', errorClass: 'UnknownInternError', error: 'No active intern with that enrollment' },
  ],
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

const click = async (el: Element | null | undefined) => {
  await act(async () => { (el as HTMLElement).click(); });
};

const buttonText = (text: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(text));

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchBrief.mockResolvedValue(brief());
  mockFetchAll.mockResolvedValue(batch());
  mockSendBrief.mockResolvedValue({ enrollmentId: 'e-gov', email: 'o@example.test', outcome: 'sent', subject: 'x' });
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
});

describe('every intern is listed, not only agent builders', () => {
  it('lists a gov-contract intern and an intern with no project alongside an agent builder', async () => {
    await mount(<ConsoleViewD rows={[
      row(),
      row({ enrollment_id: 'e-gov', name: 'Omolola Makinde', project: { name: 'Saratoga RFP' } as InternRow['project'] }),
      row({ enrollment_id: 'e-none', name: 'Harpreet Kaur', project: null }),
    ]} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Kalkidan Bezabeh');
    expect(text).toContain('Omolola Makinde');
    expect(text).toContain('Harpreet Kaur');
  });

  it('says so plainly when a filter leaves nothing, rather than rendering an empty table', async () => {
    await mount(<ConsoleViewD rows={[]} />);
    expect(container.textContent).toContain('No interns match this filter');
  });

  it('flags the missing project on the row before any message is generated', async () => {
    await mount(<ConsoleViewD rows={[row({ enrollment_id: 'e-none', project: null })]} />);
    expect(container.textContent).toContain('No project');
  });
});

describe('nothing is generated or sent without asking', () => {
  it('generates no message on mount', async () => {
    await mount(<ConsoleViewD rows={[row(), row({ enrollment_id: 'e-gov' })]} />);
    expect(mockFetchBrief).not.toHaveBeenCalled();
  });

  it('fetches that one intern\'s message when the row is opened', async () => {
    await mount(<ConsoleViewD rows={[row({ enrollment_id: 'e-gov' })]} />);
    await click(buttonText('Write the message'));
    expect(mockFetchBrief).toHaveBeenCalledWith('e-gov');
    expect(container.textContent).toContain('Two days. Your case study package is due on November 12.');
  });

  /** The reason a brief is never cached: this screen sends what it shows. */
  it('re-fetches on every open, so a stale copy cannot be sent', async () => {
    await mount(<ConsoleViewD rows={[row({ enrollment_id: 'e-gov' })]} />);
    await click(buttonText('Write the message'));
    await click(buttonText('Close'));
    await click(buttonText('Write the message'));
    expect(mockFetchBrief).toHaveBeenCalledTimes(2);
  });

  it('ONE click arms, it does not send', async () => {
    await mount(<ConsoleViewD rows={[row({ enrollment_id: 'e-gov' })]} />);
    await click(buttonText('Write the message'));
    await click(buttonText('Send this message'));
    expect(mockSendBrief).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Send to o@example.test?');
  });

  it('the second click sends, and reports the outcome', async () => {
    await mount(<ConsoleViewD rows={[row({ enrollment_id: 'e-gov' })]} />);
    await click(buttonText('Write the message'));
    await click(buttonText('Send this message'));
    await click(buttonText('Yes, send it'));
    expect(mockSendBrief).toHaveBeenCalledTimes(1);
    expect(mockSendBrief.mock.calls[0][1]).toMatchObject({ send: true });
    expect(container.textContent).toContain('Sent to o@example.test');
  });
});

describe('what is on screen is what goes out', () => {
  it('posts the edited body, not the generated one', async () => {
    await mount(<ConsoleViewD rows={[row({ enrollment_id: 'e-gov' })]} />);
    await click(buttonText('Write the message'));
    const area = container.querySelector('textarea') as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(area, 'Omolola,\n\nAn edited message.');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(buttonText('Send this message'));
    await click(buttonText('Yes, send it'));
    expect(mockSendBrief.mock.calls[0][1].body).toBe('Omolola,\n\nAn edited message.');
  });

  it('cannot send to an intern with no address, and says why', async () => {
    mockFetchBrief.mockResolvedValue(brief({ email: null }));
    await mount(<ConsoleViewD rows={[row({ enrollment_id: 'e-gov', email: null })]} />);
    await click(buttonText('Write the message'));
    expect(container.textContent).toContain('No email address on file');
    expect((buttonText('Send this message') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('what the row surfaces that the report never did', () => {
  it('shows the deadline in days remaining, not days late', async () => {
    await mount(<ConsoleViewD rows={[row({ enrollment_id: 'e-gov' })]} />);
    await click(buttonText('Write the message'));
    expect(container.textContent).toContain('2 days left');
    expect(container.textContent).toContain('to the case study package');
  });

  it('surfaces a dated promise we made, which nothing else tracks', async () => {
    mockFetchBrief.mockResolvedValue(brief({
      promises: [{ sentAt: '2026-11-09T19:49:37.000Z', subject: 'Re: R2', quote: 'I am getting you the exact answer, by Tuesday.' }],
    }));
    await mount(<ConsoleViewD rows={[row({ enrollment_id: 'e-gov' })]} />);
    await click(buttonText('Write the message'));
    expect(container.textContent).toContain('You promised, and it has a date in it');
    expect(container.textContent).toContain('by Tuesday');
  });

  it('shows a warning rather than hiding what the message could not evidence', async () => {
    mockFetchBrief.mockResolvedValue(brief({ warnings: ['This project carries no repository URL.'] }));
    await mount(<ConsoleViewD rows={[row({ enrollment_id: 'e-gov' })]} />);
    await click(buttonText('Write the message'));
    expect(container.textContent).toContain('no repository URL');
  });
});

/**
 * Preparing the whole day.
 *
 *     "we need a button that can prepare the messages that need to be sent out and also show of
 *      the interns that shouldn't get messages."  (Ali, 10 Nov 2026)
 *
 * The three things that would make this button dangerous rather than useful, each asserted:
 * that it does not send, that the held are shown rather than hidden, and that a row which could
 * not be generated is reported rather than silently dropped from a count the manager then trusts.
 */
describe('preparing every message at once', () => {
  /** The real roster shape: two interns and the operator account that sits on it alongside them. */
  const theRoster = () => [
    row({ enrollment_id: 'e-gov', name: 'Omolola Makinde' }),
    row({ enrollment_id: 'e-agent', name: 'Kalkidan Bezabeh' }),
    row({ enrollment_id: 'e-ali', name: 'Ali Muwwakkil' }),
  ];

  const prepare = async () => {
    await mount(<ConsoleViewD rows={theRoster()} />);
    await click(buttonText('Prepare the messages'));
  };

  it('prepares nothing until the button is pressed', async () => {
    await mount(<ConsoleViewD rows={theRoster()} />);
    expect(mockFetchAll).not.toHaveBeenCalled();
    expect(buttonText('Prepare the messages')).toBeTruthy();
  });

  /** The single most important assertion on this screen. Preparing is a read. */
  it('SENDS NOTHING', async () => {
    await prepare();
    expect(mockSendBrief).not.toHaveBeenCalled();
  });

  it('splits the roster into who to write to and who to leave alone', async () => {
    await prepare();
    const text = container.textContent ?? '';
    expect(text).toContain('1 of 3 interns needs a message');
    expect(text).toContain('Send these');
    expect(text).toContain('Not sending');
  });

  /**
   * The filter chips must reach the failures too. A row the chip excluded appearing under "could
   * not be generated" would make the headline describe a different roster from the one on screen.
   */
  it('leaves a failed row out when the filter has excluded that intern', async () => {
    await mount(<ConsoleViewD rows={[row({ enrollment_id: 'e-gov', name: 'Omolola Makinde' })]} />);
    await click(buttonText('Prepare the messages'));
    expect(container.textContent).not.toContain('No message could be generated');
    expect(container.textContent).toContain('1 of 1 intern needs a message');
  });

  it('names the reason an intern is being held, not just that they are', async () => {
    await prepare();
    expect(container.textContent).toContain('We already wrote to them today');
    expect(container.textContent).toContain('Written to today');
  });

  /** A held intern is a default, never a lock: their message is there and still sendable. */
  it('still offers the held message, and sends it on the same two clicks', async () => {
    await prepare();
    await click(buttonText('Read it anyway'));
    expect(container.textContent).toContain('Your Capability Map is the next thing.');
    await click(buttonText('Send this message'));
    expect(mockSendBrief).not.toHaveBeenCalled();
    await click(buttonText('Yes, send it'));
    expect(mockSendBrief).toHaveBeenCalledTimes(1);
    expect(mockSendBrief.mock.calls[0][0]).toBe('e-agent');
  });

  /** The text already exists after a batch, so opening a card must not quietly re-run anything. */
  it('does not re-fetch a single brief when a prepared card is opened', async () => {
    await prepare();
    await click(buttonText('Read and send'));
    expect(mockFetchBrief).not.toHaveBeenCalled();
  });

  it('reports the rows it could not generate rather than dropping them from the count', async () => {
    await prepare();
    expect(container.textContent).toContain('No message could be generated');
    expect(container.textContent).toContain('Ali Muwwakkil');
  });

  it('shows the evidence behind the message on the card, not only the words', async () => {
    await prepare();
    const text = container.textContent ?? '';
    expect(text).toContain('Six tasks are past their due date.');
    expect(text).toContain('2 days left');
    expect(text).toContain('overdue');
  });

  /**
   * The rows where the composer deliberately stops. The generated text only acknowledges their
   * question, so the card has to say that on its face or the row looks like an ordinary review and
   * a holding note goes out as if it were an answer.
   */
  it('tells you to write it yourself when the intern is waiting on your decision', async () => {
    mockFetchAll.mockResolvedValue({
      generatedAt: new Date().toISOString(),
      attempts: [{
        ok: true,
        hold: null,
        brief: brief({
          enrollmentId: 'e-gov', tier: 'blocked_waiting_on_ali',
          body: 'Quincy,\n\nYour message of November 10 is still sitting with me and I have not answered it yet.',
        }),
      }],
    });
    await mount(<ConsoleViewD rows={[row({ enrollment_id: 'e-gov', name: 'Omolola Makinde' })]} />);
    await click(buttonText('Prepare the messages'));
    expect(container.textContent).toContain('Write this one yourself');
    expect(container.textContent).toContain('It does not answer it');
  });

  it('says what went wrong if preparing fails, and stays on the roster', async () => {
    mockFetchAll.mockRejectedValue({ response: { data: { error: 'The report pipeline is down.' } } });
    await prepare();
    expect(container.textContent).toContain('The report pipeline is down.');
    expect(buttonText('Write the message')).toBeTruthy();
  });

  /** A brief for somebody the current filter has excluded must not appear under that filter. */
  it('shows only the interns the active filter left on the roster', async () => {
    await mount(<ConsoleViewD rows={[row({ enrollment_id: 'e-gov', name: 'Omolola Makinde' })]} />);
    await click(buttonText('Prepare the messages'));
    expect(container.textContent).toContain('Omolola Makinde');
    expect(container.textContent).not.toContain('Kalkidan Bezabeh');
  });
});
