/**
 * OH1d (Ali, 2026-11-17): "What is passing in their 360 profile? ... Nothing personal in there."
 * The profile Maya's messages are written from. Shapes taken from real Nov 19 registrants
 * (names and emails removed).
 */
import { renderPersonProfile, emptyProfile, stageLabel } from '../openHouseProfile';
import { sourceLabel } from '../openHouseCountdownContext';
import { buildEventUserPrompt, buildSystemPrompt } from '../aiMessageService';
import { screenEventReminderCopy, PORTAL_TODAY_URL } from '../openHouseCountdown';

const JOIN = 'https://enterprise.colaberry.ai/portal/class-checkin/8c92ba87-4766-4a83-9da4-ad529f68b2dc';

// "Exploring": no lesson finished, but 29 visits and three lessons opened (a real registrant's shape).
const exploring = {
  ...emptyProfile(), first_name: 'Sam', signed_up_on: 'November 16', signup_source: 'a Facebook or Instagram ad',
  stage: stageLabel('NEW_EXPLORER'),
  opened_not_finished: ['Self Study', 'Quick check: how this program works', 'Video: A welcome from Ali'],
  portal_areas: ['the campus', 'the classroom', 'the Today page'], sessions: 29, last_visit_on: 'November 17',
  videos_played: 3, intent_level: 'very_high',
};
// "Deep in lessons": 70 completed, a 65-day streak.
const deep = {
  ...emptyProfile(), first_name: 'Ana', title: 'Data Analyst', signed_up_on: 'July 21',
  completed_count: 70, completed: [{ title: 'Claude Studio - Research and Evidence Studio', on: 'November 17' }],
  campus_area: 'the Classroom', knowledge_checks: 5, streak_days: 65, points: 4991, community_last_active_on: 'November 17',
};

describe('renderPersonProfile', () => {
  it('turns what they DID into usable facts: lessons opened but not finished, areas visited, momentum', () => {
    const r = renderPersonProfile(exploring);
    expect(r).toContain('WHAT THEY HAVE DONE ON THE PLATFORM');
    expect(r).toContain('Opened but has not finished: "Self Study"');
    expect(r).toContain('Has visited the campus, the classroom and the Today page');
    expect(r).toContain('Visited 29 times, most recently on November 17');
    expect(r).toContain('Came in through a Facebook or Instagram ad');
  });
  it('describes a deep learner by what they finished and their streak', () => {
    const r = renderPersonProfile(deep);
    expect(r).toContain('Completed 70 lessons. Most recent: "Claude Studio - Research and Evidence Studio" (November 17)');
    expect(r).toContain('daily learning streak on 65 days');
    expect(r).toContain('Works as Data Analyst');
  });
  it('fences the intent level off as tone-only, never to be mentioned', () => {
    expect(renderPersonProfile(exploring)).toMatch(/FOR YOUR TONE ONLY \(never mention this to them\)\n- Interest level from their behavior: very_high/);
  });
  it('leaves empty sections out entirely, and says "do not guess" when there is nothing', () => {
    expect(renderPersonProfile(deep)).not.toContain('FOR YOUR TONE ONLY');
    expect(renderPersonProfile(emptyProfile())).toMatch(/no recorded activity.*Do not guess/);
  });
});

describe('labels a person would recognize', () => {
  it('names the ad sign-up sources, and never passes the raw tracking code through', () => {
    expect(sourceLabel('myfreeaiclass')).toBe('our AI class sign-up page');
    expect(sourceLabel('open_house_signup')).toBe('the Open House sign-up page');
    expect(sourceLabel('fb|paid')).toBe('a Facebook or Instagram ad');
    expect(sourceLabel('ig|paid')).toBe('a Facebook or Instagram ad');
  });
  it('maps journey stages to plain words and leaves unknown ones out', () => {
    expect(stageLabel('ACTIVE_LEARNER')).toBe('actively learning on the platform');
    expect(stageLabel('SOMETHING_NEW')).toBeNull();
  });
});

describe('the profile reaches the AI', () => {
  const params: any = {
    channel: 'email', ai_instructions: 'Six days out.', lead: { name: 'Sam Lee' },
    campaignContext: { system_prompt: 'You are Maya.' },
    compositeContext: { previousMessages: [{ channel: 'email', subject: 'Glad you are coming', bodyPreview: '<p>Hi Sam, welcome</p>', sentAt: 'Nov 9', outcome: 'opened' }] },
    eventContext: {
      title: 'Colaberry Open House', when: 'Thursday, November 19 at 6:30 PM CST', join_url: JOIN, minutes_before: 8640,
      person_profile: renderPersonProfile(exploring), step_goal: 'Momentum: one small next step', portal_url: PORTAL_TODAY_URL,
    },
  };
  it('puts the whole sectioned profile, the step job and what was already sent into the user prompt', () => {
    const u = buildEventUserPrompt(params);
    expect(u).toContain('THE PERSON');
    expect(u).toContain('Opened but has not finished: "Self Study"');
    expect(u).toContain("THIS MESSAGE'S JOB: Momentum: one small next step");
    expect(u).toContain('"Glad you are coming": Hi Sam, welcome');
    expect(u).toContain(PORTAL_TODAY_URL);
  });
  it('allows the Today page as the one extra link, in the rules and in the screen', () => {
    // OH1f: the rule now lists every link this email may carry (the Today page, or a brain piece's links).
    expect(buildSystemPrompt('email', params)).toContain(`The ONLY other links allowed are these, exactly as written, and only the ones THIS email's content piece calls for: ${PORTAL_TODAY_URL}`);
    const body = `<p>Hi Sam, pick up Self Study: <a href="${PORTAL_TODAY_URL}">${PORTAL_TODAY_URL}</a>. Join: <a href="${JOIN}">${JOIN}</a></p>`;
    expect(screenEventReminderCopy('See you soon', body, JOIN)).toEqual([]);
    expect(screenEventReminderCopy('x', `${body}<p>https://enterprise.colaberry.ai/ai-architect</p>`, JOIN).length).toBeGreaterThan(0);
  });
});
