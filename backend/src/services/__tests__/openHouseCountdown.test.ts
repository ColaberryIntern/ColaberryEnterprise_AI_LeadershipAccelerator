/**
 * OH1 (Ali, 2026-11-17): Maya's Open House countdown campaign. The parts that decide
 * WHEN a step goes and WHETHER an AI draft may be sent are pure, and pinned here.
 */
import { eventStepTime, screenEventReminderCopy, softenIdioms, fallbackReminderBody, fallbackReminderSms, countdownCallBrief } from '../openHouseCountdown';
import { activitySentence, meaningfulHistory, sourceLabel } from '../openHouseCountdownContext';
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
  it('spreads five emails across the two weeks before the event, plus one text, and no call step yet', () => {
    const emails = COUNTDOWN_STEPS.filter((s) => s.channel === 'email').map((s) => s.minutes_before_event);
    expect(emails).toEqual([14400, 8640, 4320, 1440, 240]); // 10, 6, 3, 1 day(s), 4 hours
    expect(COUNTDOWN_STEPS.filter((s) => s.channel === 'sms')).toHaveLength(1);
    // Calls come back in their own PR, on our own agent, after a test call to Ali.
    expect(COUNTDOWN_STEPS.filter((s) => s.channel === 'voice')).toHaveLength(0);
  });
  it('gives every email its own job, and no job the validator would turn into a booking link', () => {
    const goals = COUNTDOWN_STEPS.map((s) => s.step_goal || '');
    expect(new Set(goals).size).toBe(goals.length);
    // messageValidatorService injects "Book Your Strategy Call" when a step goal says book/schedule.
    for (const g of goals) expect(g.toLowerCase()).not.toMatch(/book|schedule|strategy call/);
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
  it('never tells the AI to sell: the steps ask for none of it, and the system prompt forbids all of it', () => {
    const steps = COUNTDOWN_STEPS.map((s) => s.ai_instructions || '').join(' ').toLowerCase();
    for (const w of ['discount', 'early bird', 'scholarship', '$', 'free', 'book a call', 'seats', 'price', 'offer']) expect(steps).not.toContain(w);
    const sys = MAYA_SYSTEM_PROMPT.toLowerCase();
    expect(sys).toContain('you are not selling');
    for (const w of ['price', 'discount', 'offer', 'scholarship', 'seats', 'f-r-e-e']) expect(sys).toContain(w);
    expect(sys).not.toMatch(/free/); // the prompt itself never uses the word
  });
  it('is at the depth of the existing campaign prompts (Ali: "I want that level of detail")', () => {
    expect(MAYA_SYSTEM_PROMPT.length).toBeGreaterThan(4000);
    for (const h of ['THE SITUATION', 'YOUR OBJECTIVES', 'WHAT THE OPEN HOUSE IS', 'HOW TO USE THEIR PROFILE', 'THE QUESTIONS PEOPLE CARRY', 'TONE AND VOICE', 'HARD RULES', 'POSITIONING']) {
      expect(MAYA_SYSTEM_PROMPT).toContain(h);
    }
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

describe('countdownCallBrief (what the voice agent is given: purpose + details, then it flows)', () => {
  const base = {
    signed_up_on: 'November 3', signup_source: 'facebook', completed_count: 0, completed: [], in_progress: [],
    last_active_on: null, tour: null, title: null, company: null, industry: null, interest: null, their_note: null,
  };
  const sam = countdownCallBrief({
    firstName: 'Sam', event: EVENT, history: '2026-11-16 email from Maya: "Looking forward to seeing you"',
    facts: { ...base, completed_count: 9, completed: [{ title: 'Claude Code 101', on: 'November 15' }], in_progress: ['Build your first agent'], last_active_on: 'November 16', tour: 'started the campus tour (stop 4 of 8)' },
  });
  const ana = countdownCallBrief({
    firstName: 'Ana', event: EVENT,
    facts: { ...base, title: 'Nurse', company: 'Baylor Scott & White', their_note: 'I want to move into healthcare AI' },
  });

  it('is built per person: two people get two different calls', () => {
    expect(sam).not.toEqual(ana);
    expect(sam).toContain('"Claude Code 101" (November 15)');
    expect(sam).toContain('"Build your first agent"');
    expect(sam).toContain('stop 4 of 8');
    expect(ana).toContain('Nurse at Baylor Scott & White');
    expect(ana).toContain('I want to move into healthcare AI');
    expect(ana).toContain('Has not completed an assignment');
  });
  it('states the purpose and lets the conversation flow instead of a numbered script', () => {
    expect(sam).toMatch(/PURPOSE OF THIS CALL/);
    expect(sam).toMatch(/really looking forward to seeing them/);
    expect(sam).toMatch(/You are not selling/);
    expect(sam).toMatch(/LET THE CONVERSATION FLOW/);
    expect(sam).not.toMatch(/^\d\./m);
  });
  it('passes what we have already said to each other', () => {
    expect(sam).toContain('Looking forward to seeing you');
    expect(ana).not.toMatch(/ALREADY SAID/);
  });
  it('with nothing on record, asks instead of guessing', () => {
    const none = countdownCallBrief({ firstName: null, event: EVENT, facts: null });
    expect(none).toMatch(/no platform activity or background recorded/);
    expect(none).toContain('calling them');
  });
  it('sends pricing questions and buying signals to a person, never answers them', () => {
    expect(sam).toMatch(/covered live at the Open House/);
    expect(sam).toMatch(/Do not quote numbers/);
    expect(sam).toMatch(/admissions advisor will call them/);
  });
  it('carries no price, percentage, link or seat count', () => {
    for (const b of [sam, ana]) expect(b).not.toMatch(/\$\s?\d|\d+\s?%|https?:\/\/|seats? (left|remaining)/i);
  });
  it('honors a do-not-call request', () => {
    expect(sam).toMatch(/ask not to be called again/);
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

describe('what a call may say about the person (no internal labels, no system noise)', () => {
  // Lines taken from a real buildConversationHistory output (Ali's own lead, Nov 17).
  const raw = [
    '- Apr 22: email sent — Sequence email sent: Introducing a pilot',
    '- Apr 22: status change — Pipeline auto-advanced: new_lead → contacted',
    '- Apr 23: call — Maya called Ali',
    '- May 7: system — Lead opted out via email',
    '- May 18: system — Strategy call no-show detected',
  ].join('\n');
  it('keeps real exchanges and drops pipeline and system rows', () => {
    const h = meaningfulHistory(raw);
    expect(h).toContain('Maya called Ali');
    expect(h).toContain('email sent');
    expect(h).not.toMatch(/status change|system|opted out|Pipeline/);
  });
  it('names only sign-up sources a person would recognize', () => {
    expect(sourceLabel('facebook')).toBe('a Facebook or Instagram ad');
    expect(sourceLabel('google_cpc')).toBe('Google');
    expect(sourceLabel('manual_test')).toBeNull();
    expect(sourceLabel('oh_nov_retarget_v3')).toBeNull();
    expect(sourceLabel(null)).toBeNull();
  });
  it('the brief drops the noise too', () => {
    const b = countdownCallBrief({ firstName: 'Ali', event: EVENT, facts: null, history: raw });
    expect(b).toContain('Maya called Ali');
    expect(b).not.toMatch(/opted out|status change/);
  });
});

describe('softenIdioms (OH1e: the phrases that threw away half the personal drafts)', () => {
  // Real sentences from prod drafts, Nov 18.
  const JOINLINK = `<a href="${JOIN}">${JOIN}</a>`;
  it.each([
    ['Feel free to bring any questions you have.', "You're welcome to bring any questions you have."],
    ['Keep your phone handy, and feel free to bring any questions.', "Keep your phone handy, and you're welcome to bring any questions."],
    ["It's a great way to get familiar with what we offer.", "It's a great way to get familiar with what we do."],
  ])('rewrites "%s"', (input, out) => {
    expect(softenIdioms(input)).toBe(out);
    expect(screenEventReminderCopy('Reminder', `<p>${softenIdioms(input)}</p><p>${JOINLINK}</p>`, JOIN)).toEqual([]);
  });
  it('leaves real offers and the bare word alone, so the screen still rejects them', () => {
    for (const t of ['A special offer is waiting', 'This session is free']) {
      expect(screenEventReminderCopy('Reminder', `<p>${softenIdioms(t)}</p><p>${JOINLINK}</p>`, JOIN).length).toBeGreaterThan(0);
    }
  });
});
