/**
 * OH1 (Ali, 2026-11-17): Maya's Open House countdown campaign. The parts that decide
 * WHEN a step goes and WHETHER an AI draft may be sent are pure, and pinned here.
 */
import { eventStepTime, screenEventReminderCopy, fallbackReminderBody, fallbackReminderSms, countdownCallScript } from '../openHouseCountdown';
import { activitySentence } from '../openHouseCountdownContext';
import { buildSystemPrompt, buildEventUserPrompt } from '../aiMessageService';
import { isWithinSendWindow, isWithinCallSchedule } from '../campaignSendWindow';
import { COUNTDOWN_STEPS, COUNTDOWN_SETTINGS, MAYA_SYSTEM_PROMPT } from '../../scripts/ensureOpenHouseCountdownCampaign';

const JOIN = 'https://enterprise.colaberry.ai/portal/class-checkin/8c92ba87-4766-4a83-9da4-ad529f68b2dc';
const START = new Date('2026-11-20T00:30:00Z'); // Thu Nov 19, 6:30 PM CST
const EVENT = { title: 'Colaberry Forward Deployed AI Engineer Accelerator Open House', when_label: 'Thursday, November 19 at 6:30 PM CST', join_url: JOIN };

describe('eventStepTime', () => {
  it('times a step back from the event start', () => {
    const now = new Date('2026-11-17T12:00:00Z');
    expect(eventStepTime(START, 1440, now)?.toISOString()).toBe('2026-11-19T00:30:00.000Z');
    expect(eventStepTime(START, 60, now)?.toISOString()).toBe('2026-11-19T23:30:00.000Z');
  });
  it('returns null for a moment already gone, so a late registrant never gets a stale step', () => {
    const now = new Date('2026-11-19T01:00:00Z'); // after T-24h, before T-1h
    expect(eventStepTime(START, 1440, now)).toBeNull();
    expect(eventStepTime(START, 60, now)).not.toBeNull();
  });
  it('returns null for a bad date or a negative offset', () => {
    expect(eventStepTime(new Date('nope'), 60, new Date())).toBeNull();
    expect(eventStepTime(START, -5, new Date('2026-11-01T00:00:00Z'))).toBeNull();
  });
});

describe('screenEventReminderCopy (an AI draft that fails is not sent)', () => {
  const ok = `<p>Hi Sam,</p><p>See you Thursday. Join here: <a href="${JOIN}">${JOIN}</a></p>`;
  it('passes a plain reminder carrying the Join link', () => {
    expect(screenEventReminderCopy('See you Thursday', ok, JOIN)).toEqual([]);
  });
  it.each([
    ['a discount', 'Ask about our discount tonight'],
    ['a percentage', 'Save 50% tonight'],
    ['an offer', 'A special offer is waiting'],
    ['early bird', 'Early Bird pricing ends soon'],
    ['free', 'This free session'],
    ['a dollar amount', 'Only $894 tonight'],
    ['a scholarship', 'Scholarships available'],
    ['a sales call', 'Book a strategy call at https://enterprise.colaberry.ai/ai-architect'],
    ['seat scarcity', 'Only a few seats left'],
    ['a placeholder', 'Hi [First Name]'],
  ])('rejects %s', (_label, text) => {
    expect(screenEventReminderCopy('Reminder', `${ok}<p>${text}</p>`, JOIN).length).toBeGreaterThan(0);
  });
  it('rejects a draft that dropped the Join link', () => {
    expect(screenEventReminderCopy('Reminder', '<p>See you Thursday.</p>', JOIN)).toContain('missing the Join link');
  });
  it('rejects a link to anywhere else', () => {
    const problems = screenEventReminderCopy('Reminder', `${ok}<p>https://calendly.com/x</p>`, JOIN);
    expect(problems.some((p) => p.startsWith('links somewhere else'))).toBe(true);
  });
  it('checks the subject too', () => {
    expect(screenEventReminderCopy('50% off tonight', ok, JOIN).length).toBeGreaterThan(0);
  });
});

describe('fallbackReminderBody (what is sent when the AI draft is rejected)', () => {
  it.each(COUNTDOWN_STEPS.filter((s) => s.channel === 'email').map((s) => [s.minutes_before_event!]))('passes its own screen at T-%i minutes', (mins) => {
    const body = fallbackReminderBody('Sam', EVENT, mins as number);
    expect(screenEventReminderCopy('Reminder', body, JOIN)).toEqual([]);
  });
  it('greets without a name and escapes one', () => {
    expect(fallbackReminderBody(null, EVENT, 60)).toContain('<p>Hi,</p>');
    expect(fallbackReminderBody('<b>', EVENT, 60)).not.toContain('<b>');
  });
});

describe('the countdown campaign definition', () => {
  it('is a fixed-date countdown: every step has minutes_before_event and no delay', () => {
    for (const s of COUNTDOWN_STEPS) {
      expect(s.delay_days).toBe(0);
      expect(typeof s.minutes_before_event).toBe('number');
      // Emails are AI-written per person; the call script and the text are fixed copy.
      if (s.channel === 'email') expect(s.ai_instructions).toBeTruthy();
      else expect(s.ai_instructions).toBeFalsy();
    }
  });
  it('has the emails, one call and one text (Ali: voice calls, and texts through the GHL field)', () => {
    expect(COUNTDOWN_STEPS.filter((s) => s.channel === 'email')).toHaveLength(3);
    expect(COUNTDOWN_STEPS.filter((s) => s.channel === 'voice')).toHaveLength(1);
    expect(COUNTDOWN_STEPS.filter((s) => s.channel === 'sms')).toHaveLength(1);
  });

  // Each step must fire INSIDE the window the scheduler enforces with these settings,
  // or it is deferred, and a deferred countdown step is cancelled at the start.
  // (The first version stored the window under keys the scheduler never reads, so the
  // default 5 PM close would have held the day-of email past the Open House.)
  describe('every step fires inside the window the scheduler enforces', () => {
    afterEach(() => jest.useRealTimers());
    it.each(COUNTDOWN_STEPS.map((s) => [s.channel, s.minutes_before_event!]))('%s at T-%i minutes', (channel, mins) => {
      const at = eventStepTime(START, mins as number, new Date('2026-11-10T00:00:00Z'))!;
      jest.useFakeTimers().setSystemTime(at);
      const ok = channel === 'voice' ? isWithinCallSchedule(COUNTDOWN_SETTINGS) : isWithinSendWindow(COUNTDOWN_SETTINGS);
      expect(ok).toBe(true);
    });
  });
  it('turns off the 120-second gap between sends, or ~170 emails take hours', () => {
    expect(COUNTDOWN_SETTINGS.delay_between_sends).toBe(0);
  });
  it('leaves the last email time to go out at ~120 an hour before the start', () => {
    const lastEmail = Math.min(...COUNTDOWN_STEPS.filter((s) => s.channel === 'email').map((s) => s.minutes_before_event!));
    expect(lastEmail).toBeGreaterThanOrEqual(180);
  });
  it('never tells the AI to sell', () => {
    const all = (MAYA_SYSTEM_PROMPT + COUNTDOWN_STEPS.map((s) => s.ai_instructions).join(' ')).toLowerCase();
    for (const w of ['discount', 'early bird', 'scholarship', '$', 'free', 'book a call', 'seats']) expect(all).not.toContain(w);
    expect(all).toContain('not selling');
  });
});

describe('the AI prompt for a countdown step', () => {
  const params: any = {
    channel: 'email',
    ai_instructions: 'Remind them',
    lead: { name: 'Sam Lee' },
    campaignContext: { system_prompt: MAYA_SYSTEM_PROMPT },
    cohortContext: { name: 'Jan cohort', seats_remaining: 3 },
    eventContext: { title: EVENT.title, when: EVENT.when_label, join_url: JOIN, minutes_before: 1440, platform_activity: 'This person has completed 9 assignments.' },
  };
  it('replaces the sales rules with event rules', () => {
    const sys = buildSystemPrompt('email', params);
    expect(sys).toContain('OPEN HOUSE REMINDER RULES');
    expect(sys).toContain(JOIN);
    expect(sys).not.toContain('ai-architect');
    expect(sys).not.toMatch(/Sign off as the/);
  });
  it('gives only the event facts: no cohort, no seats, no booking link', () => {
    const user = buildEventUserPrompt(params);
    expect(user).toContain(EVENT.when_label);
    expect(user).toContain('completed 9 assignments');
    expect(user).toContain('Sam');
    expect(user).not.toMatch(/seat|cohort|ai-architect/i);
  });
  it('leaves every other campaign prompt unchanged', () => {
    const { eventContext, ...rest } = params;
    expect(buildSystemPrompt('email', rest)).toContain('IMPORTANT RULES:');
  });
});

describe('countdownCallScript (what Maya\'s voice agent is told)', () => {
  const script = countdownCallScript('Sam', EVENT, 'This person has completed 9 assignments.');
  it('helps, relates to what they are doing, and says we look forward to seeing them', () => {
    expect(script).toContain('Sam');
    expect(script).toContain(EVENT.when_label);
    expect(script).toContain('completed 9 assignments');
    expect(script).toMatch(/NOT selling/);
    expect(script).toMatch(/looking forward to seeing them/);
  });
  it('sends pricing questions and buying signals to a person, never answers them', () => {
    expect(script).toMatch(/Do not discuss pricing/);
    expect(script).toMatch(/admissions advisor will call them/);
  });
  it('carries no price, number of dollars, link or seat count', () => {
    expect(script).not.toMatch(/\$\s?\d|\d+\s?%|https?:\/\/|seats? (left|remaining)/i);
  });
  it('honors a do-not-call request', () => {
    expect(script).toMatch(/ask not to be called/);
  });
});

describe('fallbackReminderSms (the text, sent through the GHL field)', () => {
  it('names the time today, carries the Join link, and passes the screen', () => {
    const t = fallbackReminderSms('Sam', EVENT);
    expect(t).toContain('6:30 PM CST today');
    expect(t).toContain(JOIN);
    expect(t).toContain("it's Maya at Colaberry");
    expect(screenEventReminderCopy('', t, JOIN)).toEqual([]);
  });
});

describe('activitySentence', () => {
  it('states only recorded facts', () => {
    expect(activitySentence({ assignments_completed: 9, last_assignment_title: 'Claude Code 101', tour_furthest: 4, tour_total: 8, tour_finished: false }))
      .toBe('This person has completed 9 assignments on the platform, most recently "Claude Code 101" and has started the campus tour (stop 4 of 8).');
    expect(activitySentence({ assignments_completed: 0, last_assignment_title: null, tour_furthest: null, tour_total: null, tour_finished: false }))
      .toMatch(/has not completed anything/);
    expect(activitySentence(null)).toBe('');
  });
});
