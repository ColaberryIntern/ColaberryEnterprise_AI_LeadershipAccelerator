/**
 * teachingGuide.test.ts — the pre-class teaching guide must render for EVERY
 * session the programme runs, not just the one it was designed against.
 *
 * The guide is a projection of the same KitSpec the deck renders from, so the
 * contracts worth asserting are the ones that would silently degrade it:
 *   • it renders for every week and every day kind, with a card per slide
 *   • it never leaks raw HTML from authored content
 *   • diagrams survive into the page as mermaid source
 *   • the glossary only carries terms the session actually uses
 *   • the workload badge points at the block with the prompts (the regression
 *     that shipped first time round: slides ÷ minutes called the 50-minute
 *     guided build "roomy" and the 5-minute opening "dense")
 */
import { buildKitSpec } from '../kitSpecDaySlides';
import { renderTeachingGuide } from '../teachingGuideHtml';
import { parseScript, flagsFor, slideText } from '../teachingGuideSlides';
import { termsIn, GUIDE_TERMS } from '../teachingGuideTerms';
import { KitSlide } from '../kitSpec';

function specFor(title: string, sessionNumber = 1) {
  return buildKitSpec({
    session: {
      id: 'test-session', session_number: sessionNumber, title,
      session_date: '2026-09-03', start_time: '18:30', end_time: '20:30', status: 'scheduled',
    },
    cohortName: 'Test Cohort',
    checkinUrl: 'https://example.test/checkin/x',
    qrSvg: '<svg/>',
    meetLink: null,
  });
}

/** Every session the programme actually runs: 12 weeks x 2 days, + orientation. */
const WEEK_TITLES: [number, string][] = [
  [1, 'Claude Code Foundations + Workspace'],
  [2, 'Agent Skills (build 3 skills)'],
  [3, 'Claude API + Workflow Assistant'],
  [4, 'Prompt Engineering + Prompt Library'],
  [5, 'MCP Foundations + First MCP Server'],
  [6, 'Advanced MCP + System Integration'],
  [7, 'Subagents + Multi-Agent Team'],
  [8, 'Claude Code Workflows + Automation'],
  [9, 'Reliability Engineering + Quality Layer'],
  [10, 'Governance + Governance Engine'],
  [11, 'Systems Architecture + Architecture Package'],
  [12, 'Capstone + Architect Expo'],
];

const ALL_SESSIONS: string[] = [
  'Orientation',
  ...WEEK_TITLES.flatMap(([w, t]) => [
    `Week ${w} · Architecture Day — ${t}`,
    `Week ${w} · Build Day — ${t}`,
  ]),
];

describe('renderTeachingGuide — every session', () => {
  it.each(ALL_SESSIONS)('renders a complete guide for "%s"', (title) => {
    const spec = specFor(title);
    const html = renderTeachingGuide(spec);

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);

    // One card per slide, and the deck is never empty.
    expect(spec.slides.length).toBeGreaterThan(10);
    expect((html.match(/<article class="card"/g) || []).length).toBe(spec.slides.length);

    // Every slide's title reaches the page.
    for (const s of spec.slides) {
      const needle = s.title.slice(0, 24);
      if (needle.length > 8 && !/[<>&"']/.test(needle)) expect(html).toContain(needle);
    }

    // The two generated overview diagrams are always present.
    expect(html).toContain('flowchart LR');
    expect(html).toContain('gantt');
  });
});

describe('renderTeachingGuide — content contracts', () => {
  const spec = specFor('Week 6 · Build Day — Advanced MCP + System Integration', 13);
  const html = renderTeachingGuide(spec);

  it('carries every authored diagram through as mermaid source', () => {
    const authored = spec.slides.filter((s) => s.diagram).length;
    // +2 for the generated segment flow and the run-of-show gantt.
    expect((html.match(/<pre class="mermaid">/g) || []).length).toBe(authored + 2);
  });

  it('escapes authored content rather than letting it inject markup', () => {
    const hostile: KitSlide = {
      ...spec.slides[0],
      title: '<img src=x onerror=alert(1)>',
      body: '"><script>alert(2)</script>',
    };
    const evil = renderTeachingGuide({ ...spec, slides: [hostile] });
    expect(evil).not.toContain('<img src=x');
    expect(evil).not.toContain('<script>alert(2)');
    expect(evil).toContain('&lt;img src=x');
  });

  it('shows the prompt, its paste target, and its stop condition', () => {
    const withPrompt = spec.slides.find((s) => s.prompt && s.prompt.kind !== 'review');
    expect(withPrompt).toBeDefined();
    expect(html).toContain('Paste into');
    expect(html).toContain('Stop when');
  });

  it('only lists glossary terms the session actually uses', () => {
    const cards = (html.match(/class="gcard"/g) || []).length;
    expect(cards).toBeGreaterThan(0);
    expect(cards).toBeLessThan(GUIDE_TERMS.length);
    // Week 6 is the MCP week: sampling and roots must be defined for the room.
    expect(html).toContain('>Sampling<');
    expect(html).toContain('>Roots<');
    // ...and a term from a week this session never touches must not be.
    expect(html).not.toContain('>ABAC<');
  });

  it('flags the guided build as the crunch, not the five-minute opening', () => {
    // The regression this replaces: slides / minutes ranked the opening as the
    // densest block and the 50-minute guided build as the roomiest.
    expect(html).toMatch(/8 prompts · crunch/);
    const openIdx = html.indexOf('Result preview');
    const openBadge = html.slice(openIdx, openIdx + 400);
    expect(openBadge).not.toContain('crunch');
  });
});

describe('parseScript', () => {
  it('splits spoken lines from direction', () => {
    const r = parseScript([
      'SITUATION: The room just sat down.',
      'MOOD: Calm.',
      'OPEN: Welcome back.',
      'SAY: Tonight it becomes real.',
      'DO: Start the clock.',
      'NOTE: Do not rush this.',
    ].join('\n'));
    expect(r.spoken.map((s) => s.tag)).toEqual(['OPEN', 'SAY']);
    expect(r.direction.map((s) => s.tag)).toEqual(['SITUATION', 'MOOD', 'DO', 'NOTE']);
    expect(r.spoken[1].text).toBe('Tonight it becomes real.');
  });

  it('treats an untagged tip as direction, never as words to say', () => {
    const r = parseScript('Walk the diagram node by node.');
    expect(r.spoken).toHaveLength(0);
    expect(r.direction).toEqual([{ tag: 'NOTE', text: 'Walk the diagram node by node.' }]);
  });

  it('is empty for a slide with no tip', () => {
    expect(parseScript(undefined)).toEqual({ spoken: [], direction: [] });
  });
});

describe('flagsFor', () => {
  const base = { id: 'x', segmentId: 's', segmentLabel: 'S', segStartMin: 0, segEndMin: 10,
    mode: 'build', kind: 'teach', title: 'T' } as unknown as KitSlide;

  it('separates a prompt you run from code you read together', () => {
    expect(flagsFor({ ...base, prompt: { label: 'a', prompt: 'b' } })).toContain('run');
    expect(flagsFor({ ...base, prompt: { label: 'a', prompt: 'b', kind: 'review' } })).toContain('read');
  });

  it('marks a trivia question that has a right answer', () => {
    const q = { kind: 'trivia' as const, q: 'x', options: ['a', 'b'], answer: 1 };
    expect(flagsFor({ ...base, interaction: q })).toContain('answer');
    expect(flagsFor({ ...base, interaction: { ...q, answer: undefined } })).not.toContain('answer');
  });
});

describe('termsIn', () => {
  it('finds the vocabulary a slide actually uses', () => {
    const found = termsIn('The server asks the client to think, using MCP sampling, with an explicit timeout.')
      .map((t) => t.term);
    expect(found).toContain('Sampling');
    expect(found).toContain('Timeout');
  });

  it('does not fire on a slide that never mentions the term', () => {
    const found = termsIn('Welcome back. Tonight we look at the plan.').map((t) => t.term);
    expect(found).not.toContain('Sampling');
    expect(found).not.toContain('ABAC');
  });

  it('is stable across repeated calls — a global RegExp must not carry lastIndex', () => {
    const text = 'MCP sampling and roots and a timeout.';
    const a = termsIn(text).map((t) => t.term);
    const b = termsIn(text).map((t) => t.term);
    const c = termsIn(text).map((t) => t.term);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('caps how many chips one slide can carry', () => {
    const kitchenSink = GUIDE_TERMS.map((t) => t.term).join(' ');
    expect(termsIn(kitchenSink, 8)).toHaveLength(8);
    expect(termsIn(kitchenSink, 3)).toHaveLength(3);
  });

  it('reads every field of a slide, not just the body', () => {
    const s = { title: 'A', prompt: { label: 'p', prompt: 'use a bound parameter' },
      interaction: { kind: 'poll', q: 'stateless or stateful?', options: [] } } as unknown as KitSlide;
    const text = slideText(s);
    expect(text).toContain('bound parameter');
    expect(text).toContain('stateless');
  });
});

describe('every guide term is usable', () => {
  it('has a plain-English definition and a compilable match pattern', () => {
    for (const t of GUIDE_TERMS) {
      expect(t.term.trim()).not.toBe('');
      expect(t.plain.trim().length).toBeGreaterThan(20);
      if (t.match) expect(() => new RegExp(t.match!.source, 'i')).not.toThrow();
    }
  });

  it('defines each term exactly once', () => {
    const names = GUIDE_TERMS.map((t) => t.term.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});
