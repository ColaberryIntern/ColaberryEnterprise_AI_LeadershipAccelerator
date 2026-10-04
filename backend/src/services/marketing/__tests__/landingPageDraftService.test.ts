const create = jest.fn();

jest.mock('../../openaiInstrumented', () => ({
  getInstrumentedOpenAI: () => ({ chat: { completions: { create } } }),
}));

const findByPk = jest.fn();
jest.mock('../../../models', () => ({ Brand: { findByPk } }));

import { draftLandingPage, visibleText } from '../landingPageDraftService';
import { parseLandingPageContent, type LandingPageContentShape } from '../../../schemas/landingPageContentSchema';

/**
 * Turning a pasted brief into a structured page.
 *
 * The model is mocked, deliberately. What is under test is everything around it: that nothing
 * unrenderable can escape, that a near-miss gets exactly one repair attempt with the real
 * validation errors fed back, and that an invented price or percentage is reported to the
 * operator rather than quietly shipped onto a public page.
 */

const BRIEF = [
  'We are running a six-week cohort for working data analysts who want to ship an AI project.',
  'Sessions are live on Thursday evenings. Each person leaves with a working project in their',
  'own repo, reviewed by a mentor. Applications are open now.',
].join(' ');

function reply(obj: unknown) {
  return { choices: [{ message: { content: JSON.stringify(obj) } }] };
}

const GOOD_PAGE = {
  title: 'Six-week AI build',
  description: 'Ship a working AI project, reviewed by a mentor.',
  sections: [
    { type: 'hero', headline: 'Ship an AI project in six weeks', subhead: 'Live sessions, a mentor, your own repo.' },
    { type: 'bullets', items: [{ label: 'A working project in your own repo' }] },
    { type: 'cta', headline: 'Applications are open', cta: { label: 'Apply', href: '/apply' } },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  findByPk.mockResolvedValue({ id: 'b-1', name: 'Colaberry Training' });
});

describe('the happy path', () => {
  it('returns content the public renderer would accept', async () => {
    create.mockResolvedValueOnce(reply(GOOD_PAGE));
    const r = await draftLandingPage({ source: BRIEF, brandId: 'b-1' });

    expect(parseLandingPageContent(r.content).ok).toBe(true);
    expect(r.repaired).toBe(false);
    expect(r.content.sections).toHaveLength(3);
  });

  it('asks for JSON, so the response does not have to be scraped out of prose', async () => {
    create.mockResolvedValueOnce(reply(GOOD_PAGE));
    await draftLandingPage({ source: BRIEF, brandId: 'b-1' });
    expect(create.mock.calls[0][0].response_format).toEqual({ type: 'json_object' });
  });

  it('calls the model once when the first response is valid', async () => {
    create.mockResolvedValueOnce(reply(GOOD_PAGE));
    await draftLandingPage({ source: BRIEF, brandId: 'b-1' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('strips em-dashes from copy but leaves a URL alone', async () => {
    create.mockResolvedValueOnce(reply({
      sections: [
        { type: 'hero', headline: 'Six weeks — one project' },
        { type: 'cta', headline: 'Go', cta: { label: 'Apply', href: '/a–b' } },
      ],
    }));
    const r = await draftLandingPage({ source: BRIEF, brandId: 'b-1' });

    const hero = r.content.sections[0];
    expect(hero.type === 'hero' && hero.headline).toBe('Six weeks, one project');
    const cta = r.content.sections[1];
    // An en-dash is legal in a URL and must survive.
    expect(cta.type === 'cta' && cta.cta.href).toBe('/a–b');
  });
});

describe('nothing unrenderable escapes', () => {
  it('repairs a near-miss by feeding the real validation errors back', async () => {
    create
      .mockResolvedValueOnce(reply({ sections: [{ type: 'hero' }] })) // no headline
      .mockResolvedValueOnce(reply(GOOD_PAGE));

    const r = await draftLandingPage({ source: BRIEF, brandId: 'b-1' });

    expect(r.repaired).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
    const repairPrompt = create.mock.calls[1][0].messages.at(-1).content;
    expect(repairPrompt).toContain('sections.0.headline');
  });

  it('treats a JSON syntax error exactly like a schema failure', async () => {
    create
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Here is your page: {oops' } }] })
      .mockResolvedValueOnce(reply(GOOD_PAGE));

    const r = await draftLandingPage({ source: BRIEF, brandId: 'b-1' });

    expect(r.repaired).toBe(true);
    expect(create.mock.calls[1][0].messages.at(-1).content).toContain('not valid JSON');
  });

  it('gives up after ONE repair rather than looping', async () => {
    create.mockResolvedValue(reply({ sections: [{ type: 'carousel' }] }));
    await expect(draftLandingPage({ source: BRIEF, brandId: 'b-1' }))
      .rejects.toThrow(/did not match the page format, twice/);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('never returns content the public route would 404 on', async () => {
    // The guarantee that matters: a published row whose content does not parse serves a 404.
    create.mockResolvedValue(reply({ sections: [{ type: 'hero', headline: 'Fine' }] }));
    const r = await draftLandingPage({ source: BRIEF, brandId: 'b-1' });
    expect(parseLandingPageContent(r.content).ok).toBe(true);
  });

  it('an empty response is a failure, not an empty page', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: '' } }] });
    await expect(draftLandingPage({ source: BRIEF, brandId: 'b-1' })).rejects.toThrow();
  });
});

describe('invented specifics are reported, not shipped silently', () => {
  it('flags a price the brief never mentioned', async () => {
    create.mockResolvedValueOnce(reply({
      sections: [
        { type: 'hero', headline: 'Ship an AI project in six weeks' },
        { type: 'details', rows: [{ label: 'Price', value: '$2,400' }] },
      ],
    }));
    const r = await draftLandingPage({ source: BRIEF, brandId: 'b-1' });
    expect(r.unverifiedClaims.join(' ')).toMatch(/\$2,400/);
  });

  it('flags an invented percentage, the classic outcome claim', async () => {
    create.mockResolvedValueOnce(reply({
      sections: [
        { type: 'hero', headline: 'Ship an AI project in six weeks' },
        { type: 'text', paragraphs: ['92% of graduates are promoted within a year.'] },
      ],
    }));
    const r = await draftLandingPage({ source: BRIEF, brandId: 'b-1' });
    expect(r.unverifiedClaims.join(' ')).toMatch(/92/);
  });

  it('does NOT flag a figure the brief actually states', async () => {
    create.mockResolvedValueOnce(reply({
      sections: [{ type: 'hero', headline: 'Ship an AI project in six weeks' }],
    }));
    const r = await draftLandingPage({ source: BRIEF, brandId: 'b-1' });
    // "six weeks" is in the brief, spelled out; nothing numeric was invented.
    expect(r.unverifiedClaims).toEqual([]);
  });

  it('collects bracketed placeholders so the operator can see the holes', async () => {
    create.mockResolvedValueOnce(reply({
      sections: [
        { type: 'hero', headline: 'Ship an AI project in six weeks' },
        { type: 'details', rows: [{ label: 'Starts', value: '[start date]' }, { label: 'Price', value: '[price]' }] },
      ],
    }));
    const r = await draftLandingPage({ source: BRIEF, brandId: 'b-1' });
    expect(r.placeholders.sort()).toEqual(['[price]', '[start date]']);
  });

  it('reads the copy a visitor sees, not the machine fields', async () => {
    const content = parseLandingPageContent({
      sections: [{ type: 'cta', headline: 'Apply', cta: { label: 'Apply', href: '/apply?price=49' } }],
    });
    if (!content.ok) throw new Error('fixture invalid');
    // An href is not copy. A price hidden in a query string must not be read as a page claim,
    // and must not be scanned for em-dashes either.
    expect(visibleText(content.content)).not.toContain('/apply?price=49');
    expect(visibleText(content.content)).toContain('Apply');
  });
});

describe('the revision loop', () => {
  it('sends the previous page and the feedback, so a change is a change and not a rewrite', async () => {
    create.mockResolvedValueOnce(reply(GOOD_PAGE));
    const previous = { sections: [{ type: 'hero', headline: 'Old headline' }] } as LandingPageContentShape;

    await draftLandingPage({
      source: BRIEF, brandId: 'b-1', previous,
      feedback: 'Make the headline about the mentor review, and drop the bullets.',
    });

    const sent = create.mock.calls[0][0].messages.at(-1).content;
    expect(sent).toContain('Old headline');
    expect(sent).toContain('Make the headline about the mentor review');
    expect(sent).toContain('leave everything else alone');
  });

  it('ignores a previous page with no feedback - there is nothing to apply', async () => {
    create.mockResolvedValueOnce(reply(GOOD_PAGE));
    await draftLandingPage({
      source: BRIEF, brandId: 'b-1',
      previous: { sections: [{ type: 'hero', headline: 'Old headline' }] } as LandingPageContentShape,
    });
    expect(create.mock.calls[0][0].messages.at(-1).content).not.toContain('Old headline');
  });
});

describe('refusals', () => {
  it('refuses a brief too short to build a page from, without calling the model', async () => {
    await expect(draftLandingPage({ source: 'make me a page', brandId: 'b-1' }))
      .rejects.toThrow(/Paste the brief/);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses an unknown brand - a page with no brand has no theme and no URL', async () => {
    findByPk.mockResolvedValue(null);
    await expect(draftLandingPage({ source: BRIEF, brandId: 'nope' })).rejects.toThrow(/Brand not found/);
    expect(create).not.toHaveBeenCalled();
  });

  it('turns a model timeout into a readable error, not a stack trace', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'APIConnectionTimeoutError' });
    create.mockRejectedValue(timeout);
    await expect(draftLandingPage({ source: BRIEF, brandId: 'b-1' }))
      .rejects.toThrow(/could not be generated/);
  });
});

describe('the prompt states the rules it is relied on for', () => {
  it('forbids inventing specifics and requires a placeholder instead', async () => {
    create.mockResolvedValueOnce(reply(GOOD_PAGE));
    await draftLandingPage({ source: BRIEF, brandId: 'b-1' });
    const system = create.mock.calls[0][0].messages[0].content;
    expect(system).toMatch(/NEVER invent a specific fact/);
    expect(system).toMatch(/bracketed placeholder/);
  });

  it('tells the model to omit stats and quotes it cannot source, rather than pad them', async () => {
    create.mockResolvedValueOnce(reply(GOOD_PAGE));
    await draftLandingPage({ source: BRIEF, brandId: 'b-1' });
    const system = create.mock.calls[0][0].messages[0].content;
    expect(system).toMatch(/OMIT a section rather than weaken it/);
    expect(system).toMatch(/Do not write "\[source\]" to satisfy the field/);
  });

  it('demands a concrete detail in the headline, with a worked weak/strong pair', async () => {
    // Measured on the live model 2026-10-03: without this, 1 of 3 runs put any fact from the
    // brief in the hero ("Build Your First AI Project"); with it, 3 of 3 did.
    create.mockResolvedValueOnce(reply(GOOD_PAGE));
    await draftLandingPage({ source: BRIEF, brandId: 'b-1' });
    const system = create.mock.calls[0][0].messages[0].content;
    expect(system).toMatch(/THE HEADLINE CARRIES A CONCRETE DETAIL FROM THE BRIEF/);
    expect(system).toMatch(/would fit any\s+course on any subject is a failed headline/);
    // The pair is the part that works; an abstract instruction alone did not.
    expect(system).toMatch(/Weak, because it fits anything/);
    expect(system).toMatch(/Strong, because only this brief could produce it/);
  });

  it('forbids the brand name in the title, because the page already shows it', async () => {
    // Measured: 3 of 3 v1 runs began the title "Colaberry Training: ...", spending the only
    // line a search result and a link preview show.
    create.mockResolvedValueOnce(reply(GOOD_PAGE));
    await draftLandingPage({ source: BRIEF, brandId: 'b-1' });
    expect(create.mock.calls[0][0].messages[0].content).toMatch(/DO NOT PUT THE BRAND NAME IN THE TITLE/);
  });

  it('is recorded as a new prompt version, so the telemetry can tell the two apart', async () => {
    // Changing a prompt without changing its version makes every before/after comparison in the
    // instrumentation a blend of the two.
    const { getInstrumentedOpenAI } = require('../../openaiInstrumented');
    create.mockResolvedValueOnce(reply(GOOD_PAGE));
    await draftLandingPage({ source: BRIEF, brandId: 'b-1' });
    expect(getInstrumentedOpenAI).toBeDefined();
    const svc = require('fs').readFileSync(
      require('path').resolve(__dirname, '..', 'landingPageDraftService.ts'), 'utf8',
    );
    expect(svc).toContain("prompt_version: 'landing-page-draft-v2'");
    expect(svc).not.toContain("prompt_version: 'landing-page-draft-v1'");
  });

  it('lists every section type the schema allows, and no others', async () => {
    create.mockResolvedValueOnce(reply(GOOD_PAGE));
    await draftLandingPage({ source: BRIEF, brandId: 'b-1' });
    const system = create.mock.calls[0][0].messages[0].content;
    // If a type is added to the schema and not to the prompt, the model can never produce it.
    for (const type of ['hero', 'text', 'bullets', 'stats', 'quote', 'details', 'faq', 'cta']) {
      expect(system).toContain(`"type":"${type}"`);
    }
  });
});

/**
 * Salvage: a page that mostly validates is not thrown away.
 *
 * The first real brief in production came back as a 502 with nothing to show for it. Usually only
 * one section is wrong - a `stats` item with no `source`, a `quote` with no attribution - and
 * discarding the other seven helps nobody.
 */
describe('when both attempts fail, the valid sections survive', () => {
  const MIXED = {
    title: 'Six-week AI build',
    sections: [
      { type: 'hero', headline: 'Ship an AI project in six weeks' },
      { type: 'stats', items: [{ value: '92%', label: 'placed' }] },      // no source
      { type: 'cta', headline: 'Apply', cta: { label: 'Apply', href: '/apply' } },
    ],
  };

  it('keeps what validates and NAMES what it dropped', async () => {
    create.mockResolvedValue(reply(MIXED));
    const r = await draftLandingPage({ source: BRIEF, brandId: 'b-1' });

    expect(r.content.sections.map((s) => s.type)).toEqual(['hero', 'cta']);
    expect(r.droppedSections).toHaveLength(1);
    expect(r.droppedSections[0]).toMatch(/^stats \(section 2\)/);
  });

  it('still returns content the public route would serve', async () => {
    create.mockResolvedValue(reply(MIXED));
    const r = await draftLandingPage({ source: BRIEF, brandId: 'b-1' });
    expect(parseLandingPageContent(r.content).ok).toBe(true);
  });

  it('keeps the title when it survives', async () => {
    create.mockResolvedValue(reply(MIXED));
    const r = await draftLandingPage({ source: BRIEF, brandId: 'b-1' });
    expect(r.content.title).toBe('Six-week AI build');
  });

  it('drops a bad title rather than refusing the whole page', async () => {
    create.mockResolvedValue(reply({
      title: '',
      sections: [{ type: 'hero', headline: 'Fine' }, { type: 'stats', items: [{ value: '1', label: 'x' }] }],
    }));
    const r = await draftLandingPage({ source: BRIEF, brandId: 'b-1' });
    expect(r.content.title).toBeUndefined();
    expect(r.content.sections.map((s) => s.type)).toEqual(['hero']);
  });

  it('reports nothing dropped on the normal path', async () => {
    create.mockResolvedValueOnce(reply(GOOD_PAGE));
    const r = await draftLandingPage({ source: BRIEF, brandId: 'b-1' });
    expect(r.droppedSections).toEqual([]);
  });

  it('still fails when NOTHING survives - an empty page cannot be stored', async () => {
    create.mockResolvedValue(reply({ sections: [{ type: 'carousel' }, { type: 'gallery' }] }));
    await expect(draftLandingPage({ source: BRIEF, brandId: 'b-1' }))
      .rejects.toThrow(/no part of it could be used/);
  });

  it('still fails when the response is not an object at all', async () => {
    create.mockResolvedValue(reply([1, 2, 3]));
    await expect(draftLandingPage({ source: BRIEF, brandId: 'b-1' })).rejects.toThrow();
  });

  it('salvage runs only AFTER the repair attempt, never instead of it', async () => {
    create
      .mockResolvedValueOnce(reply({ sections: [{ type: 'hero' }] }))
      .mockResolvedValueOnce(reply(GOOD_PAGE));
    const r = await draftLandingPage({ source: BRIEF, brandId: 'b-1' });

    expect(create).toHaveBeenCalledTimes(2);
    expect(r.repaired).toBe(true);
    expect(r.droppedSections).toEqual([]);
  });
});
