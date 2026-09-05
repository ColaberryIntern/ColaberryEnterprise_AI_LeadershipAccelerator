/**
 * The diagram is the most persuasive thing on the scope page, which makes its failure mode
 * expensive: a step marked "runs itself" when nothing proposed covers it is a promise the
 * scope did not make, drawn in a box and coloured in.
 *
 * So the classifier is deliberately conservative, and these tests hold it there.
 */

import { renderWorkflowSvg, classifySteps, wrapLabel } from '../scopeDiagram';

describe('classifySteps — a mark has to be earned', () => {
  it('marks a step automated when an automation clearly refers to it', () => {
    const steps = classifySteps({
      workflow: ['Ralph rebuilds the Power BI report every morning'],
      automations: ['An agent rebuilds the Power BI report and emails it automatically'],
      decisions: [],
    });

    expect(steps[0].state).toBe('automated');
  });

  it('leaves a step manual when nothing proposed covers it', () => {
    const steps = classifySteps({
      workflow: ['The team meets to discuss operations'],
      automations: ['An agent rebuilds the Power BI report'],
      decisions: [],
    });

    expect(steps[0].state).toBe('manual');
  });

  it('does not mark on a single shared word — one is a coincidence', () => {
    // "report" appears in almost every automation ever proposed.
    const steps = classifySteps({
      workflow: ['Someone files the report'],
      automations: ['An agent emails a different report'],
      decisions: [],
    });

    expect(steps[0].state).toBe('manual');
  });

  it('ignores short words, which are shared by everything', () => {
    const steps = classifySteps({
      workflow: ['They send it over'],
      automations: ['We send it over'],
      decisions: [],
    });

    expect(steps[0].state).toBe('manual');
  });

  it('prefers a human decision over an automation when both could match', () => {
    // §3: authority stays human. If a step is both, it must not be drawn as automatic.
    const steps = classifySteps({
      workflow: ['Approving refusals above a threshold'],
      automations: ['Automatic approving of refusals above a threshold'],
      decisions: ['A person keeps approving refusals above a threshold'],
    });

    expect(steps[0].state).toBe('decision');
  });
});

describe('wrapLabel', () => {
  it('wraps on words, never mid-word', () => {
    const lines = wrapLabel('Ralph rebuilds the Power BI report every single morning before the meeting', 30);
    lines.forEach((l) => expect(l.length).toBeLessThanOrEqual(31));
    expect(lines.join(' ')).toContain('rebuilds');
  });

  it('truncates past three lines rather than letting one box dominate', () => {
    const lines = wrapLabel('word '.repeat(60), 20);
    expect(lines).toHaveLength(3);
    expect(lines[2].endsWith('…')).toBe(true);
  });

  it('returns nothing for empty input', () => {
    expect(wrapLabel('   ')).toEqual([]);
  });
});

describe('renderWorkflowSvg', () => {
  const steps = classifySteps({
    workflow: [
      'The team meets to discuss operations',
      'Ralph rebuilds the Power BI report every morning',
      'Refusals get noted in Slack',
    ],
    automations: ['An agent rebuilds the Power BI report every morning and emails it'],
    decisions: [],
  });

  const svg = renderWorkflowSvg(steps);

  it('renders one box per step', () => {
    expect((svg.match(/<rect/g) || []).length).toBe(3);
  });

  it('scales rather than fixing a pixel width, so it works on a phone', () => {
    expect(svg).toContain('viewBox="0 0 640');
    expect(svg).toContain('width="100%"');
  });

  it('states each step’s status in TEXT, not only in colour', () => {
    // Colour alone fails anyone who cannot see it, and this diagram's whole argument is
    // carried by which steps are marked.
    expect(svg).toContain('RUNS ITSELF');
    expect(svg).toContain('TODAY');
  });

  it('inherits the page theme through custom properties, with literal fallbacks', () => {
    expect(svg).toContain('var(--accent, #BA430E)');
    expect(svg).toContain('var(--fg, #1A1917)');
  });

  it('escapes label text rather than pasting it into markup', () => {
    const nasty = renderWorkflowSvg([{ label: 'Ralph & <script>alert(1)</script>', state: 'manual' }]);
    expect(nasty).not.toContain('<script>');
    expect(nasty).toContain('&amp;');
  });

  it('carries an accessible name', () => {
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<title>');
  });

  it('draws connectors between steps but not after the last one', () => {
    expect((svg.match(/<line/g) || []).length).toBe(2);
  });

  it('returns nothing for no steps, so a caller can omit the section', () => {
    expect(renderWorkflowSvg([])).toBe('');
  });
});
