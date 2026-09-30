/**
 * The one-page design: what it is refused for, and what the prompt has to keep saying.
 *
 * Two of these tests exist because of things a person said after looking at the output, not
 * because of a failing assertion:
 *
 *   "There's no navigation - it's just a long page no one wants to read through."
 *   "when you click on anything, it takes you to a current screen inside the screen."
 *
 * Both are decidable, so both are checked here rather than hoped for in a prompt.
 */

const mockChatJson = jest.fn();

jest.mock('../../runtime/runtimeAi', () => ({
  chatJson: (...a: any[]) => mockChatJson(...a),
}));

import {
  buildWebsiteDesignPrompt,
  navigationViolation,
  stockPaletteViolation,
  emptyLinkViolation,
  emptySvgViolation,
  generateWebsiteDesign,
  MIN_NAV_LINKS,
  DESIGN_MODEL,
  DESIGN_RETRIES,
} from '../websiteDesignGenerator';
import type { DesignBrief } from '../designBrief';

const brief: DesignBrief = {
  project_title: 'City Tour Guide',
  roles: ['A visitor walking the city', 'A guide who writes the routes'],
  workflows: ['A visitor picks a route and follows it on foot'],
  actions: ['Publish a route', 'Follow a route'],
  surfaces: ['A phone the visitor holds while walking'],
  distinctive_terms: ['Deep Ellum', 'Dallas', 'QR'],
  not_discussed: ['payments', 'reviews'],
} as DesignBrief;

/** A page that passes every other gate, so each test isolates the one thing it changes. */
const page = (nav: string, ids: string) => `
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; background: #FBFAF8; color: #10243A; margin: 0; }
  header { padding: 16px 24px; border-bottom: 1px solid #E3E1DC; }
  nav a { margin-right: 24px; color: #5B6B7B; text-decoration: none; }
  h1 { font-size: 3rem; letter-spacing: -0.02em; margin: 0 0 16px; }
  section { padding: 48px 24px; }
  .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  @media (max-width: 52rem) { .steps { grid-template-columns: 1fr; } }
</style>
<header><strong>Deep Ellum walks</strong><nav>${nav}</nav></header>
<main>${ids}</main>
<p>Concept — illustrative only. A Dallas QR route.</p>`;

const goodNav = '<a href="#how">How it works</a><a href="#routes">Routes</a><a href="#start">Start</a>';
const goodIds = '<section id="how">how</section><section id="routes">routes</section><section id="start">start</section>';

describe('navigationViolation', () => {
  it('passes a page whose nav links all resolve', () => {
    expect(navigationViolation(page(goodNav, goodIds))).toBeNull();
  });

  it('refuses a bare href="#", which navigates out of the frame entirely', () => {
    const html = page('<a href="#">Menu</a>' + goodNav, goodIds);
    expect(navigationViolation(html)).toMatch(/bare href/i);
  });

  it('refuses a long page with a header instead of navigation', () => {
    const html = page('<a href="#how">How it works</a>', '<section id="how">how</section>');
    expect(navigationViolation(html)).toContain(`needs ${MIN_NAV_LINKS}`);
  });

  it('counts distinct destinations, not repeated links to the same one', () => {
    const repeated = '<a href="#how">a</a><a href="#how">b</a><a href="#how">c</a>';
    expect(navigationViolation(page(repeated, '<section id="how">how</section>'))).toContain('1 in-page link');
  });

  it('names the sections a link points at when nothing declares them', () => {
    const html = page(goodNav, '<section id="how">how</section>');
    const violation = navigationViolation(html);
    expect(violation).toContain('#routes');
    expect(violation).toContain('#start');
  });

  it('survives markup with no links at all rather than throwing', () => {
    expect(navigationViolation('<p>hello</p>')).toContain('0 in-page link');
  });
});

describe('stockPaletteViolation', () => {
  it('refuses the framework blue both models reached for unprompted', () => {
    expect(stockPaletteViolation('<style>.btn{background:#007BFF}</style>')).toMatch(/#007bff/);
  });

  it('is case-insensitive, because the model writes it either way', () => {
    expect(stockPaletteViolation('a { color: #0d6efd }')).not.toBeNull();
  });

  it('names every stock colour it found, not just the first', () => {
    const violation = stockPaletteViolation('#007bff #28a745');
    expect(violation).toContain('#007bff');
    expect(violation).toContain('#28a745');
  });

  it('allows a blue somebody actually picked', () => {
    // A hue is not the problem. An unchosen default is.
    expect(stockPaletteViolation('<style>:root{--accent:#10243A}</style>')).toBeNull();
  });
});

describe('emptyLinkViolation', () => {
  it('refuses a button with no label', () => {
    expect(emptyLinkViolation('<a class="btn" href="#start"></a>')).toMatch(/no text/);
  });

  it('refuses one whose only content is whitespace', () => {
    expect(emptyLinkViolation('<a href="#a">\n  \n</a>')).not.toBeNull();
  });

  it('counts an SVG-only link as empty, because nothing readable is in it', () => {
    expect(emptyLinkViolation('<a href="#a"><svg viewBox="0 0 1 1"></svg></a>')).not.toBeNull();
  });

  it('passes a link wrapping a mark and a word', () => {
    expect(emptyLinkViolation('<a href="#top"><svg viewBox="0 0 1 1"></svg> Wayfinder</a>')).toBeNull();
  });
});

describe('emptySvgViolation', () => {
  it('refuses an svg with nothing in it', () => {
    // It rendered as a blank circle in the middle of the product drawing.
    expect(emptySvgViolation('<svg viewBox="0 0 24 24"></svg>')).toMatch(/empty <svg>/);
  });

  it('refuses one holding only whitespace or a title', () => {
    expect(emptySvgViolation('<svg><title>arrow</title>\n</svg>')).not.toBeNull();
  });

  it('accepts any real drawing primitive', () => {
    expect(emptySvgViolation('<svg><path d="M8 13 L12 7 Z"></path></svg>')).toBeNull();
    expect(emptySvgViolation('<svg><circle cx="12" cy="12" r="11"></circle></svg>')).toBeNull();
  });

  it('counts every empty one, not just the first', () => {
    expect(emptySvgViolation('<svg></svg><svg><path d="M0 0"/></svg><svg></svg>')).toContain('2 empty');
  });

  it('says nothing about a page with no svg at all', () => {
    expect(emptySvgViolation('<p>hello</p>')).toBeNull();
  });
});

describe('buildWebsiteDesignPrompt', () => {
  it('carries their words, so the design can be refused for not using them', () => {
    const prompt = buildWebsiteDesignPrompt(brief);
    expect(prompt).toContain('Deep Ellum');
    expect(prompt).toContain('City Tour Guide');
  });

  it('names what was never discussed, so it does not get invented', () => {
    expect(buildWebsiteDesignPrompt(brief)).toContain('payments');
  });

  it('asks for the product to be drawn, not described', () => {
    // The difference between a page about a product and a page that shows one.
    expect(buildWebsiteDesignPrompt(brief)).toMatch(/THE PRODUCT ITSELF, DRAWN/);
  });

  it('forbids hiding the navigation on a phone', () => {
    // A one-page site with the nav hidden is the long scroll nobody reads, and there is no
    // JavaScript here to open a menu.
    expect(buildWebsiteDesignPrompt(brief)).toMatch(/DO NOT HIDE THE NAVIGATION ON A PHONE/);
  });

  it('ships the house stylesheet, because craft lives in the CSS and not in the markup', () => {
    const prompt = buildWebsiteDesignPrompt(brief);
    expect(prompt).toContain('START FROM THIS SCAFFOLD');
    // The container is why the page does not come out flush against the window edge, and it
    // lives on the landmarks so there is no wrapper div for the model to forget.
    expect(prompt).toContain('header, footer, section, .hero { padding-inline:');
    expect(prompt).toContain('--accent');
  });

  it('tells it to replace the identity rather than reuse the example', () => {
    const prompt = buildWebsiteDesignPrompt(brief);
    expect(prompt).toContain('REPLACE-DISPLAY');
    expect(prompt).toContain('Replace every value in :root');
    // The failure mode of shipping an example is a page with the nouns swapped.
    expect(prompt).toMatch(/nouns swapped/);
  });

  it('states both viewports it will actually be shown at', () => {
    const prompt = buildWebsiteDesignPrompt(brief);
    expect(prompt).toContain('1280px');
    expect(prompt).toContain('390px');
  });
});

describe('generateWebsiteDesign', () => {
  const reply = (html: string) => ({ parsed: { rationale: 'why', html }, runtime_ms: 10, cost_usd: 0.01 });
  const bad = page('<a href="#">Menu</a>', goodIds);
  const good = page(goodNav, goodIds);

  beforeEach(() => jest.clearAllMocks());

  it('returns a design that clears every gate', async () => {
    mockChatJson.mockResolvedValue(reply(good));

    const result = await generateWebsiteDesign({ brief });
    expect(result).toMatchObject({ ok: true });
  });

  it('reports an empty model response as its own class, not as a violation', async () => {
    mockChatJson.mockResolvedValue({ parsed: { rationale: 'why' }, runtime_ms: 10, cost_usd: 0 });

    expect(await generateWebsiteDesign({ brief })).toMatchObject({ ok: false, error_class: 'EmptyModelResponse' });
  });

  it('gives a whole page room rather than truncating it mid-markup', async () => {
    mockChatJson.mockResolvedValue(reply(good));
    await generateWebsiteDesign({ brief });

    // A truncated design reads as a broken one, not as a truncated one.
    expect(mockChatJson.mock.calls[0][4]).toBeGreaterThanOrEqual(8000);
  });

  it('draws it with the named design model, not the platform default', async () => {
    mockChatJson.mockResolvedValue(reply(good));
    await generateWebsiteDesign({ brief });

    expect(mockChatJson.mock.calls[0][3]).toBe(DESIGN_MODEL);
  });

  it('still lets a caller name a different model', async () => {
    mockChatJson.mockResolvedValue(reply(good));
    await generateWebsiteDesign({ brief, model: 'gpt-4o-mini' });

    expect(mockChatJson.mock.calls[0][3]).toBe('gpt-4o-mini');
  });

  it('retries once on a refusal, telling it exactly what was wrong', async () => {
    // A refusal used to end the whole thing and the prospect saw no design at all, which is
    // worse than anything the gates were protecting them from.
    mockChatJson.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(good));

    const result = await generateWebsiteDesign({ brief });

    expect(result).toMatchObject({ ok: true });
    expect(mockChatJson).toHaveBeenCalledTimes(2);
    expect(mockChatJson.mock.calls[1][2]).toContain('REFUSED');
    expect(mockChatJson.mock.calls[1][2]).toMatch(/bare href/i);
  });

  it('does not retry the first attempt when it already passes', async () => {
    mockChatJson.mockResolvedValue(reply(good));
    await generateWebsiteDesign({ brief });

    expect(mockChatJson).toHaveBeenCalledTimes(1);
  });

  it('gives up after one retry rather than looping', async () => {
    // Infinite retry is prohibited, and a second refusal means the brief is the problem.
    mockChatJson.mockResolvedValue(reply(bad));

    const result = await generateWebsiteDesign({ brief });

    expect(mockChatJson).toHaveBeenCalledTimes(1 + DESIGN_RETRIES);
    expect(result).toMatchObject({ ok: false, error_class: 'ContractViolation' });
    expect((result as any).error).toMatch(/bare href/i);
  });

  it('reports what the whole attempt cost, not just the last call', async () => {
    mockChatJson.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(good));

    const result: any = await generateWebsiteDesign({ brief });

    expect(result.cost_usd).toBeCloseTo(0.02);
    expect(result.runtime_ms).toBe(20);
  });

  it('does not retry an empty response, which says nothing to act on', async () => {
    mockChatJson.mockResolvedValue({ parsed: {}, runtime_ms: 10, cost_usd: 0 });
    await generateWebsiteDesign({ brief });

    expect(mockChatJson).toHaveBeenCalledTimes(1);
  });
});
