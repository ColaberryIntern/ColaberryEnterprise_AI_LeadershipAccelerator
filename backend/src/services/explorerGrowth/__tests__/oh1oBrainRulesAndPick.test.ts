/**
 * OH1o: the brain rules as data (brainRules.ts) and the choice they feed (explorerBrainPick.ts).
 * Ali, 2026-11-18: "where will the rules for the brain be stored ... how do I program it", "never the
 * same shelf in the last 2 emails", and the Monday "plan your week" email.
 */
import {
  DEFAULT_BRAIN_RULES, MIN_PICK_HOURS, ROTATABLE_SHELVES, enabledRotation, loadBrainRules, neverSayIssues,
  resolveBrainRules, saveBrainRules, validateBrainRules, BrainRulesError,
} from '../brainRules';
import {
  EXPLORER_MAYA_HARD_RULES, EXPLORER_MAYA_PROMPT, EXPLORER_MAYA_VOICE, NURTURE_ROTATION,
  allowBrainDates, brainPickHeld, explorerMayaPrompt, isWeekAheadTouch, pieceOrder, weekKey,
  type BrainPickRecord,
} from '../explorerBrainPick';

const valid = () => ({
  explorerVoice: EXPLORER_MAYA_VOICE,
  neverSay: ['circle back'],
  rotation: ROTATABLE_SHELVES.map((piece) => ({ piece, enabled: true })),
  brainPickMinHours: 72,
  weekAhead: true,
});

const rec = (piece: BrainPickRecord['piece'], decision_date: string, item_id: string | null = null): BrainPickRecord =>
  ({ piece, decision_date, item_id });

describe('brain rules: defaults are what shipped before the setting existed', () => {
  it('no stored rules = the code defaults, with no problems', () => {
    const { rules, problems } = resolveBrainRules(null);
    expect(problems).toEqual([]);
    expect(rules.explorerVoice).toBe(EXPLORER_MAYA_VOICE);
    expect(enabledRotation(rules)).toEqual([...NURTURE_ROTATION]);
    expect(rules.brainPickMinHours).toBe(72);
    expect(rules.openHouseHold).toBe(true);
    expect(rules.weekAhead).toBe(true);
  });
  it('the default prompt is the voice plus the locked hard rules', () => {
    expect(EXPLORER_MAYA_PROMPT).toBe(`${EXPLORER_MAYA_VOICE}\n\n${EXPLORER_MAYA_HARD_RULES}`);
  });
  it('an edited voice can never drop the hard rules', () => {
    const p = explorerMayaPrompt('You are Maya. Be brief and kind, and always talk about the weather first, at length, every time.');
    expect(p.endsWith(EXPLORER_MAYA_HARD_RULES)).toBe(true);
    expect(p).toContain('Never sell');
    expect(p).toContain('ONLY from the section WHO THEY ARE');
  });
});

describe('brain rules: saving is strict', () => {
  it('accepts a valid rule set', () => {
    expect(validateBrainRules(valid())).toEqual([]);
  });
  it.each([
    [{ brainPickMinHours: 12 }, 'cannot go below 24'],
    [{ brainPickMinHours: 60 }, 'whole days'],
    [{ explorerVoice: 'Hi, I am a bot that writes emails for everyone in a very generic way, all day.' }, 'start with "You are Maya"'],
    [{ explorerVoice: `${EXPLORER_MAYA_VOICE} Mention our free classes.` }, 'banned word'],
    [{ rotation: ROTATABLE_SHELVES.map((piece) => ({ piece, enabled: false })) }, 'at least one shelf'],
    [{ rotation: [{ piece: 'day_of', enabled: true }] }, 'not a shelf'],
    [{ openHouseHold: false }, 'cannot be turned off'],
    [{ weekAhead: 'yes' }, 'on or off'],
  ])('refuses %j', (over, problem) => {
    expect(validateBrainRules({ ...valid(), ...over }).join(' | ')).toContain(problem);
  });
  it('writes nothing when there is a problem, and every problem is named', async () => {
    const setSetting = jest.fn();
    await expect(saveBrainRules({ ...valid(), brainPickMinHours: 1 }, 'ali@colaberry.com', null, { getSetting: jest.fn(), setSetting }))
      .rejects.toBeInstanceOf(BrainRulesError);
    expect(setSetting).not.toHaveBeenCalled();
  });
  it('saves the cleaned rules under the one setting, with who saved them', async () => {
    const setSetting = jest.fn(async () => undefined);
    const saved = await saveBrainRules({ ...valid(), neverSay: [' circle back ', 'Circle Back'] }, 'ali@colaberry.com', null, { getSetting: jest.fn(), setSetting });
    expect(saved.neverSay).toEqual(['circle back']);
    expect(setSetting).toHaveBeenCalledWith('maya_brain_rules', expect.objectContaining({ openHouseHold: true }), 'ali@colaberry.com');
  });
});

describe('brain rules: reading never fails', () => {
  it('a bad field falls back to its default and says so; the good fields stay', () => {
    const { rules, problems } = resolveBrainRules({ ...valid(), brainPickMinHours: 5, neverSay: ['synergy'] });
    expect(rules.brainPickMinHours).toBe(72);
    expect(rules.neverSay).toEqual(['synergy']);
    expect(problems.join(' ')).toContain('cadence');
  });
  it('unreadable JSON is the defaults', () => {
    expect(resolveBrainRules('{nope').rules.brainPickMinHours).toBe(72);
  });
  it('an unreadable setting is the defaults, flagged', async () => {
    const r = await loadBrainRules(null, { getSetting: async () => { throw new Error('db down'); }, setSetting: jest.fn() });
    expect(r.rules).toEqual(resolveBrainRules(null).rules);
    expect(r.problems[0]).toContain('could not be read');
  });
  it('the Open House hold is locked on whatever is stored', () => {
    expect(resolveBrainRules({ ...valid(), openHouseHold: false }).rules.openHouseHold).toBe(true);
  });
  it('a shelf missing from the stored list is kept, switched off', () => {
    const r = resolveBrainRules({ ...valid(), rotation: [{ piece: 'ai_fact', enabled: true }] }).rules;
    expect(enabledRotation(r)).toEqual(['ai_fact']);
    expect(r.rotation).toHaveLength(ROTATABLE_SHELVES.length);
  });
  it('never-say phrases match whole words, case-insensitively, outside tags', () => {
    expect(neverSayIssues('<p>Let us Circle Back soon</p>', ['circle back'])).toEqual(['never-say: "circle back"']);
    expect(neverSayIssues('<p>circled backward</p>', ['circle back'])).toEqual([]);
  });
});

describe('the choice: never the same shelf in the last two emails', () => {
  const d = (decision_date: string) => ({ enrollment_id: 'e1', selected_action: 'SEND_EMAIL', reason: '', decision_date });
  it('drops both of the last two shelves', () => {
    const order = pieceOrder(d('2026-11-19'), [rec('community_pulse', '2026-11-16'), rec('builder_spotlight', '2026-11-13')], { weekAhead: false });
    expect(order).not.toContain('community_pulse');
    expect(order).not.toContain('builder_spotlight');
    expect(order.length).toBe(NURTURE_ROTATION.length - 2);
  });
  it('rotates only across the shelves the rules switch on, in their order', () => {
    const order = pieceOrder(d('2026-11-19'), [], { rotation: ['ai_fact', 'live_event'], weekAhead: false });
    expect(new Set(order)).toEqual(new Set(['ai_fact', 'live_event']));
  });
});

describe('the choice: the Monday "plan your week" email', () => {
  const d = (decision_date: string) => ({ enrollment_id: 'e1', selected_action: 'SEND_EMAIL', reason: '', decision_date });
  it('leads on a Monday or Tuesday, once per week', () => {
    expect(weekKey('2026-11-18')).toBe('2026-11-16');
    expect(isWeekAheadTouch('2026-11-16', [])).toBe(true); // Monday
    expect(isWeekAheadTouch('2026-11-17', [])).toBe(true); // Tuesday
    expect(isWeekAheadTouch('2026-11-18', [])).toBe(false); // Wednesday
    expect(isWeekAheadTouch('2026-11-17', [rec('week_ahead', '2026-11-16')])).toBe(false);
    expect(isWeekAheadTouch('2026-11-23', [rec('week_ahead', '2026-11-16')])).toBe(true); // next week
    expect(pieceOrder(d('2026-11-16'), [])[0]).toBe('week_ahead');
  });
  it('takes precedence over a lesson decision too, and the rule can switch it off', () => {
    const lesson = { ...d('2026-11-16'), selected_action: 'RECOMMEND_LESSON' };
    expect(pieceOrder(lesson, [])[0]).toBe('week_ahead');
    expect(pieceOrder(lesson, [], { weekAhead: false })[0]).toBe('their_progress');
  });
});

describe('the cadence', () => {
  it('uses the rule, never below 24 hours', () => {
    const h = [rec('ai_fact', '2026-11-17')];
    expect(brainPickHeld('2026-11-18', h, 24).held).toBe(false);
    expect(brainPickHeld('2026-11-18', h, 48).held).toBe(true);
    expect(brainPickHeld('2026-11-18', [rec('ai_fact', '2026-11-18')], 0).held).toBe(true);
    expect(MIN_PICK_HOURS).toBe(24);
  });
});

describe('a date the brain supplied is a resolved fact', () => {
  const issue = 'Explorer copy states a date not present in the resolved context: "November 20" (plan §11.4 — it must come from a resolved fact, or not be stated)';
  it('drops the issue when the piece block carries that date (the Nov 18 builder email)', () => {
    const block = 'THE NEXT LIVE EVENT\n- AI Build Night, Thursday, November 20, 6:30 PM CT';
    expect(allowBrainDates([issue], block)).toEqual([]);
  });
  it('keeps it for any other date, and keeps every other issue', () => {
    expect(allowBrainDates([issue, 'Unknown URL found: x'], 'Live: December 3')).toEqual([issue, 'Unknown URL found: x']);
    expect(allowBrainDates([issue], '')).toEqual([issue]);
  });
});

describe('defaults stay safe', () => {
  it('DEFAULT_BRAIN_RULES is frozen', () => {
    expect(Object.isFrozen(DEFAULT_BRAIN_RULES)).toBe(true);
  });
});
