/**
 * `buildSystemPrompt` took a brand. This pins what that did and did not change.
 *
 * ## Why a characterization test and not just the new-feature tests
 *
 * Three template literals in this function build the system prompt for EVERY campaign
 * email, SMS and voice call in the product - ten call sites across campaigns, automation,
 * the GHL webhook, the campaign simulator and the admin preview. Adding a brand replaced a
 * hard-coded company name in all three. If the unbranded output drifted by one character,
 * every one of those prompts would have changed and nothing in the repo would have said so,
 * because the function was private and had NO test.
 *
 * So the unbranded strings are asserted verbatim, copied from the pre-change source. These
 * assertions are deliberately literal: a test written as `toContain(DEFAULT_BRAND_VOICE.name)`
 * would pass just as happily if both the constant and the prompt had been renamed together,
 * which is the drift it is supposed to catch.
 */

jest.mock('../../models', () => ({ Activity: { create: jest.fn() } }));
jest.mock('../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
jest.mock('../settingsService', () => ({ getSetting: jest.fn().mockResolvedValue(null) }));

import {
  buildSystemPrompt,
  DEFAULT_BRAND_VOICE,
  type BrandVoice,
  type GenerateMessageParams,
} from '../aiMessageService';

function params(over: Partial<GenerateMessageParams> = {}): GenerateMessageParams {
  return {
    channel: 'email',
    ai_instructions: 'Say hello.',
    lead: { name: 'Dana' },
    ...over,
  };
}

const PUBLISHED: BrandVoice = {
  name: 'AI Flotation',
  teamName: 'AI Flotation',
  tone: 'plain, technical, no exclamation marks',
  guidance: 'Name the constraint before the benefit. Never use the word "transform".',
  rulesVersion: 3,
};

describe('with no brand, the prompt is exactly what it was before brands existed', () => {
  it('uses the historical persona, verbatim', () => {
    expect(buildSystemPrompt('email', params())).toContain(
      "You are a professional outreach specialist for Colaberry Enterprise AI Division."
      + " You write personalized, consultative messages that feel like 1:1 conversations,"
      + " not marketing templates. You reference the lead's specific context naturally."
      + " You never sound like a mass email.",
    );
  });

  it('uses the historical email framing and sign-off, verbatim', () => {
    const prompt = buildSystemPrompt('email', params());

    expect(prompt).toContain(
      'You are writing a professional business email for Colaberry Enterprise AI Division.',
    );
    // The sign-off has always used the SHORTER form - "Colaberry Enterprise AI team", not
    // "Colaberry Enterprise AI Division team". That asymmetry is why BrandVoice carries a
    // separate `teamName`, and dropping it would silently reword every campaign sign-off.
    expect(prompt).toContain('Sign off as the Colaberry Enterprise AI team.');
    expect(prompt).not.toContain('Colaberry Enterprise AI Division team');
  });

  it('uses the historical voice framing, verbatim', () => {
    expect(buildSystemPrompt('voice', params({ channel: 'voice' }))).toContain(
      'a voice call by Maya, Director of Admissions at Colaberry Enterprise AI Division.',
    );
  });

  it('adds no brand-voice block at all', () => {
    for (const channel of ['email', 'sms', 'voice'] as const) {
      expect(buildSystemPrompt(channel, params({ channel }))).not.toContain('BRAND VOICE');
    }
  });

  it('still lets a campaign system prompt replace the persona, as it always has', () => {
    const prompt = buildSystemPrompt(
      'email',
      params({ campaignContext: { system_prompt: 'You are Cory.' } }),
    );

    expect(prompt.startsWith('You are Cory.')).toBe(true);
    expect(prompt).not.toContain('professional outreach specialist');
  });

  it('is the same string as passing DEFAULT_BRAND_VOICE explicitly', () => {
    // The fallback and the constant must not be two different identities.
    expect(buildSystemPrompt('email', params())).toBe(
      buildSystemPrompt('email', params({ brandVoice: DEFAULT_BRAND_VOICE })),
    );
  });
});

describe('with a brand, the identity follows the brand', () => {
  it('replaces the company name in the persona and the channel framing', () => {
    const prompt = buildSystemPrompt('email', params({ brandVoice: PUBLISHED }));

    expect(prompt).toContain('a professional outreach specialist for AI Flotation.');
    expect(prompt).toContain('a professional business email for AI Flotation.');
    expect(prompt).toContain('Sign off as the AI Flotation team.');
    // The whole point: no trace of the other brand in a message sent as this one.
    expect(prompt).not.toContain('Colaberry');
  });

  it('replaces it in the voice channel too', () => {
    const prompt = buildSystemPrompt('voice', params({ channel: 'voice', brandVoice: PUBLISHED }));
    expect(prompt).toContain('Director of Admissions at AI Flotation.');
    expect(prompt).not.toContain('Colaberry');
  });

  it('falls back to the long name for the sign-off when no short form is published', () => {
    const prompt = buildSystemPrompt(
      'email',
      params({ brandVoice: { name: 'Colaberry Pro Network', rulesVersion: 2 } }),
    );
    expect(prompt).toContain('Sign off as the Colaberry Pro Network team.');
  });
});

describe('the published voice becomes a prompt input', () => {
  it('renders tone and guidance, and states the rule-set version', () => {
    const prompt = buildSystemPrompt('email', params({ brandVoice: PUBLISHED }));

    expect(prompt).toContain('BRAND VOICE (published rule set v3;');
    expect(prompt).toContain('Tone: plain, technical, no exclamation marks');
    expect(prompt).toContain('Name the constraint before the benefit.');
  });

  it('places the voice where the model reads it as a rule, above the output format', () => {
    const prompt = buildSystemPrompt('email', params({ brandVoice: PUBLISHED }));
    expect(prompt.indexOf('BRAND VOICE')).toBeLessThan(prompt.indexOf('OUTPUT FORMAT'));
  });

  it('applies the voice even when a campaign supplies its own persona', () => {
    // A campaign's system prompt is a persona choice; a published brand voice is a
    // governance rule. A persona must not be able to opt out of the brand's rules.
    const prompt = buildSystemPrompt(
      'email',
      params({
        brandVoice: PUBLISHED,
        campaignContext: { system_prompt: 'You are Cory.' },
      }),
    );

    expect(prompt.startsWith('You are Cory.')).toBe(true);
    expect(prompt).toContain('BRAND VOICE (published rule set v3;');
  });

  it('renders nothing when a brand has published no voice, rather than an empty heading', () => {
    // version 0 is "nobody has written one down", which must not read on screen or in the
    // prompt as "this brand has no opinion".
    const prompt = buildSystemPrompt(
      'email',
      params({ brandVoice: { name: 'AI Flotation', rulesVersion: 0 } }),
    );

    expect(prompt).not.toContain('BRAND VOICE');
    // The identity still changes - only the voice is absent.
    expect(prompt).toContain('a professional business email for AI Flotation.');
  });

  it('renders a tone without guidance, and guidance without a tone', () => {
    const toneOnly = buildSystemPrompt(
      'email',
      params({ brandVoice: { name: 'B', tone: 'dry', rulesVersion: 1 } }),
    );
    expect(toneOnly).toContain('Tone: dry');

    const guidanceOnly = buildSystemPrompt(
      'email',
      params({ brandVoice: { name: 'B', guidance: 'Lead with the number.', rulesVersion: 1 } }),
    );
    expect(guidanceOnly).toContain('Lead with the number.');
    expect(guidanceOnly).not.toContain('Tone:');
  });
});
