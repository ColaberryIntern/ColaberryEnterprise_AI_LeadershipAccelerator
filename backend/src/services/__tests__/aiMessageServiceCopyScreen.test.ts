import { FREE_WORD_RULE } from '../content/bannedCopyRule';

/**
 * Banned-copy screening on the campaign composition path.
 *
 * ## Why this suite exists
 *
 * Measured on production 2026-11-02: 11 steps across 5 ACTIVE campaign sequences carry the
 * banned word in `ai_instructions`, which the sender treats as the primary content source at
 * send time. Nothing screened the result - `aiMessageService` had no banned-copy check of any
 * kind, and repo-wide the guard had exactly one runtime importer, the Explorer draft renderer.
 *
 * ## What is asserted, and why it is shaped this way
 *
 * `generateMessage` has four channel outcomes across three return statements - SMS and voice
 * share a tail. Each OUTCOME is driven separately rather than trusting a wrapper to cover them,
 * because "there is one chokepoint" is the claim under test: a reader can see the wrapper, but
 * only a test per outcome proves no path escapes it.
 *
 * The suite also pins the thing a second matcher would have broken - the idiom must NOT be
 * flagged here either - and the negative control that makes the zeroes mean something.
 */

const W = FREE_WORD_RULE.word;

const create = jest.fn();

jest.mock('../openaiInstrumented', () => ({
  getInstrumentedOpenAI: () => ({ chat: { completions: { create } } }),
}));
jest.mock('../settingsService', () => ({ getSetting: jest.fn().mockResolvedValue(null) }));
jest.mock('../../models', () => ({ Activity: {} }));
jest.mock('../../config/env', () => ({
  env: { openaiApiKey: 'test-key', aiModel: 'test-model', aiMaxTokens: 400 },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generateMessage } = require('../aiMessageService');

function reply(content: string): void {
  create.mockResolvedValueOnce({
    choices: [{ message: { content } }],
    usage: { total_tokens: 7 },
  });
}

const params = (channel: 'email' | 'sms' | 'voice') => ({
  channel,
  ai_instructions: 'Invite them to the next session.',
  lead: { name: 'Jane' },
  campaignContext: { name: 'Alumni Win-Back', step_number: 2 },
});

beforeEach(() => {
  create.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore();
});

describe('every return path of generateMessage is screened', () => {
  it('path 1: email, parsed JSON', async () => {
    reply(JSON.stringify({ subject: 'Your next step', body: `The course is ${W}.` }));
    const result = await generateMessage(params('email'));
    expect(result.copy_flags).toEqual([{ rule_id: FREE_WORD_RULE.id, text: W }]);
  });

  it('path 2: email, unparseable JSON falls back to raw content', async () => {
    reply(`not json at all, and the course is ${W}`);
    const result = await generateMessage(params('email'));
    expect(result.copy_flags).toHaveLength(1);
  });

  it('path 3: sms', async () => {
    reply(`Join us, it is ${W}`);
    const result = await generateMessage(params('sms'));
    expect(result.copy_flags).toHaveLength(1);
  });

  it('path 4: voice', async () => {
    reply(`Tell them it is ${W}`);
    const result = await generateMessage(params('voice'));
    expect(result.copy_flags).toHaveLength(1);
  });

  it('CONTROL: clean copy returns an empty array on every path, not a missing field', async () => {
    for (const channel of ['email', 'sms', 'voice'] as const) {
      reply('No card needed to start.');
      const result = await generateMessage(params(channel));
      // An absent field would also satisfy "no flags" while proving nothing was screened.
      expect(result.copy_flags).toEqual([]);
      expect(Array.isArray(result.copy_flags)).toBe(true);
    }
  });
});

describe('what the screen must not do', () => {
  it('does not flag the idiom, on this path either', async () => {
    reply(`Feel ${W} to reply with any questions.`);
    const result = await generateMessage(params('sms'));
    expect(result.copy_flags).toEqual([]);
  });

  it('flags a breach in the SUBJECT, not only the body', async () => {
    reply(JSON.stringify({ subject: `A ${W} course for you`, body: 'No card needed.' }));
    const result = await generateMessage(params('email'));
    expect(result.copy_flags).toHaveLength(1);
  });

  it('does not let a subject ending in the idiom word exempt a breach in the body', async () => {
    // Subject and body are screened separately for exactly this reason. Joined, the lookback
    // would see the subject's trailing word and exempt the body's first occurrence.
    reply(JSON.stringify({ subject: 'Do feel', body: `${W} for members` }));
    const result = await generateMessage(params('email'));
    expect(result.copy_flags).toHaveLength(1);
  });

  it('does not change the copy it screens', async () => {
    const body = `The course is ${W}.`;
    reply(JSON.stringify({ subject: 'Hello', body }));
    const result = await generateMessage(params('email'));
    // It reports; it does not rewrite. A guard that silently edits outbound copy is how a
    // citation gets corrupted to satisfy a lint.
    expect(result.body).toBe(body);
  });
});

describe('the rule is stated to the model, not only checked afterwards', () => {
  it('appends the compliance instruction to the system prompt', async () => {
    reply('No card needed.');
    await generateMessage(params('email'));
    const sent = create.mock.calls[0][0].messages.find(
      (m: { role: string }) => m.role === 'system',
    ).content;
    expect(sent).toContain('COPY COMPLIANCE');
    for (const alt of FREE_WORD_RULE.approvedAlternatives) expect(sent).toContain(alt);
  });

  it('tells the model what actually happens here, not what happens on the Explorer path', async () => {
    reply('No card needed.');
    await generateMessage(params('email'));
    const sent = create.mock.calls[0][0].messages.find(
      (m: { role: string }) => m.role === 'system',
    ).content;
    expect(sent).toContain('flagged for review');
    expect(sent).not.toContain('discarded rather than edited');
  });

  it('CONTROL: the original prompt survives alongside the instruction', async () => {
    reply('No card needed.');
    await generateMessage(params('email'));
    const sent = create.mock.calls[0][0].messages.find(
      (m: { role: string }) => m.role === 'system',
    ).content;
    // Without this, an instruction that REPLACED the prompt would pass every check above.
    expect(sent).toContain('Colaberry');
  });
});

describe('observability', () => {
  it('logs one structured line naming the rule, and never the copy itself', async () => {
    reply(JSON.stringify({ subject: 'Hello', body: `It is ${W} to join` }));
    await generateMessage(params('email'));

    expect(console.warn).toHaveBeenCalledTimes(1);
    const line = JSON.parse((console.warn as jest.Mock).mock.calls[0][0]);
    expect(line.event).toBe('banned_copy_in_generated_message');
    expect(line.error_class).toBe('ContractViolation');
    expect(line.context.rule_ids).toEqual([FREE_WORD_RULE.id]);
    expect(line.context.campaign_name).toBe('Alumni Win-Back');
    // The body is addressed to a real person and the flags already say what the breach was.
    expect((console.warn as jest.Mock).mock.calls[0][0]).not.toContain('to join');
  });

  it('stays silent on clean copy', async () => {
    reply('No card needed.');
    await generateMessage(params('email'));
    expect(console.warn).not.toHaveBeenCalled();
  });
});
