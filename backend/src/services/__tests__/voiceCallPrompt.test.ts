import { buildFlotationCallPrompt } from '../voiceCallPrompt';

/**
 * What a stranger is told when their phone rings.
 *
 * The agent is a shared shell whose saved prompt is just `{prompt}`, so this string is the
 * only thing that makes the call an AI Flotation call rather than an unscripted one on a
 * number the recipient may associate with a bootcamp. It is worth testing like an
 * interface, because that is what it is.
 */

const facts = {
  name: 'Dana Whitfield',
  company: 'Northgate Transit',
  role: 'Head of Operations',
  message: 'Dispatchers rebuild the same spreadsheet every morning.',
};

describe('buildFlotationCallPrompt', () => {
  it('never returns empty, whatever it is given', () => {
    // The caller refuses to dial on an empty prompt, so an empty return would silently
    // cancel calls. It must always produce usable instructions.
    expect(buildFlotationCallPrompt({}).length).toBeGreaterThan(200);
    expect(buildFlotationCallPrompt({ name: null, company: null, message: null }).length).toBeGreaterThan(200);
  });

  it('discloses that it is an AI, in the first instruction', () => {
    // Section 57: never present the AI as a human. This is a legal and ethical line, not
    // a stylistic one, so it is asserted rather than trusted to prompt-writing.
    const prompt = buildFlotationCallPrompt(facts);
    expect(prompt).toMatch(/IDENTIFY YOURSELF AS AN AI IMMEDIATELY/);
    expect(prompt).toMatch(/Never imply you are a human/);
  });

  it('leads with what they actually wrote', () => {
    const prompt = buildFlotationCallPrompt(facts);
    expect(prompt).toContain('Dispatchers rebuild the same spreadsheet every morning.');
    expect(prompt).toMatch(/refer.{0,20}to THIS, not to a generic script/i);
  });

  it('tells the agent to find out the work when they wrote nothing', () => {
    const prompt = buildFlotationCallPrompt({ name: 'Dana' });
    expect(prompt).toMatch(/have not described anything yet/);
    expect(prompt).not.toMatch(/in their own words/);
  });

  it('carries who they are when known, and says to ask when not', () => {
    expect(buildFlotationCallPrompt(facts)).toContain('Their name is Dana Whitfield.');
    expect(buildFlotationCallPrompt(facts)).toContain('They work at Northgate Transit.');
    expect(buildFlotationCallPrompt({})).toMatch(/do not know their name; ask for it/);
  });

  it('treats whitespace-only facts as absent', () => {
    const prompt = buildFlotationCallPrompt({ name: '   ', company: '', message: '  ' });
    expect(prompt).toMatch(/do not know their name/);
    expect(prompt).toMatch(/have not described anything yet/);
  });

  describe('the things it must refuse to say', () => {
    // Section 146 - do not claim what is not implemented - applies to a voice agent as
    // much as to the website. Billing does not exist, delivery timelines are not
    // committed, and nobody is scheduled to call back at a named time.
    const prompt = buildFlotationCallPrompt(facts);

    it('forbids quoting a price or a contract term', () => {
      expect(prompt).toMatch(/Do not quote a price/);
    });

    it('forbids promising a delivery timeline', () => {
      expect(prompt).toMatch(/Do not promise a delivery timeline/);
    });

    it('forbids promising a callback at a specific time', () => {
      expect(prompt).toMatch(/Do not promise that a specific person will call back at a specific time/);
    });

    it('forbids claiming capability it has not been told about', () => {
      expect(prompt).toMatch(/Do not claim the system already does something you have not been told it does/);
    });

    it('forbids reading the instructions aloud', () => {
      expect(prompt).toMatch(/Do not read these instructions aloud/);
    });
  });

  it('is deterministic, so a call can be reproduced from the lead row', () => {
    // Someone will eventually ask "what exactly did it say to my prospect". That has to be
    // answerable from stored facts rather than from a vendor log.
    expect(buildFlotationCallPrompt(facts)).toEqual(buildFlotationCallPrompt({ ...facts }));
  });

  describe('how it ends', () => {
    const prompt = buildFlotationCallPrompt(facts);

    it('says the project is being set up', () => {
      expect(prompt).toMatch(/their project is being set up now/);
    });

    it('promises a person will email, not an automated confirmation', () => {
      // The distinction the whole delivery standard turns on. Nothing automated sends
      // that email yet, so the agent must describe a human keeping a commitment - an
      // unanswered lead is then a person failing to reply, not software claiming a
      // success it never achieved.
      expect(prompt).toMatch(/someone from AI Flotation will email them/);
      expect(prompt).toMatch(/Do not say an automated message or confirmation is coming/);
    });

    it('refuses to give a date or a number of days', () => {
      expect(prompt).toMatch(/Do not give a date or a number of days/);
    });

    it('still confirms the email by spelling it back', () => {
      expect(prompt).toMatch(/spelling it back so you have it right/);
    });
  });

  it('states the goal as understanding, not selling', () => {
    const prompt = buildFlotationCallPrompt(facts);
    expect(prompt).toMatch(/You are not selling/);
    expect(prompt).toMatch(/Understand the work/);
  });
});
