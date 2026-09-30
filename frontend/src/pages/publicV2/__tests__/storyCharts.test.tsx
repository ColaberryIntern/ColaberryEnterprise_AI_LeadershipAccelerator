import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StoryCharts } from '../StoryCharts';
import { chartsFor } from '../storyVisualModel';
import type {
  PublicCaseStudyMetric,
  PublicCaseStudyVisualChart,
  PublicCaseStudyVisualStory,
} from '../../../services/caseStudyPublicTypes';

/**
 * Charts are words first. Rendered statically, with no script and no
 * stylesheet, every figure must already be on the page as text, the table
 * must account for the whole, the caveat must be visible, and a zero must
 * print as "0".
 */

const metric = (label: string, valueDisplay: string): PublicCaseStudyMetric => ({
  label, valueDisplay, unit: null, verificationClass: 'verified', verificationMethod: 'internal',
  baseline: null, sample: null, methodology: null, limitations: [], shape: null, payload: null, plain: null, collection: null,
} as unknown as PublicCaseStudyMetric);

const chart = (over: Partial<PublicCaseStudyVisualChart>): PublicCaseStudyVisualChart => ({
  key: 'k', kind: 'share', title: 'Title', caption: null, metric: metric('Resolved', '97%'), denominator: 604,
  parts: [{ label: 'Resolved', value: 586, denominator: 604, status: 'resolved', caveat: null }],
  unit: null, axisMax: null, caveat: null, limitations: [],
  ...over,
});

const story = (charts: PublicCaseStudyVisualChart[]): PublicCaseStudyVisualStory => ({
  schemaVersion: 1, presentationVersion: 'v2', motion: 'auto', workflow: null, outcomeCards: [], charts,
});

const html = (charts: PublicCaseStudyVisualChart[]): string =>
  renderToStaticMarkup(<StoryCharts charts={chartsFor(story(charts))} />);

const doc = (markup: string): HTMLElement => {
  const el = document.createElement('div');
  el.innerHTML = markup;
  return el;
};

describe('StoryCharts', () => {
  it('prints every figure as text, with the status word, before any bar or script', () => {
    const out = html([chart({ key: 'share', title: 'Missing events resolved' })]);
    expect(out).toContain('586 of 604');
    expect(out).toContain('Resolved');
    expect(out).toContain('Share of 604.');
    expect(out).not.toMatch(/style="/);
    const root = doc(out);
    const fill = root.querySelector('.cbv2-story-visual__bar-fill--resolved')!;
    expect(Number(fill.getAttribute('width'))).toBeCloseTo((586 / 604) * 100, 1);
    expect(root.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('composition: the table rows sum to the denominator with the remainder named', () => {
    const out = html([chart({ key: 'comp', kind: 'composition', title: 'How they were recovered', denominator: 604, parts: [
      { label: 'Automatic', value: 301, denominator: 604, status: 'resolved', caveat: null },
      { label: 'Operator assisted', value: 285, denominator: 604, status: 'processing', caveat: null },
    ] })]);
    const root = doc(out);
    const cells = Array.from(root.querySelectorAll('[data-testid="story-chart-table"] tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('th, td')).map((c) => c.textContent));
    expect(cells).toEqual([
      ['Automatic', '301', '604', 'Resolved'],
      ['Operator assisted', '285', '604', 'In flow'],
      ['Not accounted for above', '18', '604', 'Unknown'],
      ['Total', '604', '604', ''],
    ]);
    expect(301 + 285 + 18).toBe(604);
    expect(out).toContain('Of 604 in total.');
    expect(root.querySelectorAll('.cbv2-story-visual__bar--stacked rect').length).toBe(4); // track + 2 parts + remainder
  });

  it('comparison: both windows, the caveat and the guardrail sentence are visible', () => {
    const out = html([chart({ key: 'cmp', kind: 'comparison', title: 'Then and now', caveat: 'Different windows, stated in the notes.', parts: [
      { label: 'During the incident', value: 245, denominator: 533, status: 'attention', caveat: 'August window' },
      { label: 'After', value: 586, denominator: 604, status: 'resolved', caveat: null },
    ] })]);
    expect(out).toContain('245 of 533');
    expect(out).toContain('586 of 604');
    expect(out).toContain('Different windows, stated in the notes.');
    expect(out).toContain('Two observation windows, not a controlled comparison.');
    expect(out).toContain('August window');
    expect(out).toContain('Needs attention');
  });

  it('two-value: says it is two statistics, not a trend, and names the axis', () => {
    const out = html([chart({ key: 'two', kind: 'two_value', title: 'Time to recovery', unit: 'min', axisMax: 60, parts: [
      { label: 'Median', value: 34, denominator: 60, status: 'processing', caveat: null },
      { label: 'p90', value: 47, denominator: 60, status: 'processing', caveat: null },
    ] })]);
    expect(out).toContain('34 min');
    expect(out).toContain('47 min');
    expect(out).toContain('Two summary statistics, not a trend.');
    expect(out).toContain('Bars scaled to 60 min.');
    expect(out).not.toMatch(/<polyline|<line /);
  });

  it('zero card: renders the zero and its denominator, never blank', () => {
    const out = html([chart({ key: 'z', kind: 'zero_card', title: 'Duplicate replays', denominator: 339, parts: [
      { label: 'Duplicate replays', value: 0, denominator: 339, status: 'resolved', caveat: null },
    ] })]);
    const root = doc(out);
    expect(root.querySelector('.cbv2-story-visual__zero-figure')!.textContent).toBe('0');
    expect(root.querySelector('.cbv2-story-visual__zero-of')!.textContent).toBe('of 339');
  });

  it('never renders a chart with no resolved row, so a missing value cannot appear as 0', () => {
    const out = html([chart({ key: 'empty', parts: [] })]);
    expect(out).toBe('');
    expect(renderToStaticMarkup(<StoryCharts charts={[]} />)).toBe('');
  });

  it('shows the metric verification badge and the limitations on every chart', () => {
    const out = html([chart({ key: 'lim', limitations: ['Contact-based attribution excluded.'] })]);
    expect(out).toContain('data-verification-class="verified"');
    expect(out).toContain('Contact-based attribution excluded.');
  });

  it('assigns every class inside the cbv2- namespace', () => {
    const root = doc(html([chart({ key: 'a' }), chart({ key: 'b', kind: 'zero_card', parts: [{ label: 'x', value: 0, denominator: 3, status: 'resolved', caveat: null }] })]));
    for (const el of Array.from(root.querySelectorAll('[class]'))) {
      for (const name of Array.from(el.classList)) expect({ name, ok: name.startsWith('cbv2-') }).toEqual({ name, ok: true });
    }
  });
});
