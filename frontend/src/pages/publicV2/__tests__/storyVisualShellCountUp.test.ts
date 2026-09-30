import type { PublicCaseStudyMetric, PublicCaseStudyVisualStory } from '../../../services/caseStudyPublicTypes';

/* eslint-disable @typescript-eslint/no-var-requires */
// The framework-free band the other brand sites mount. Its count-up is a
// private function, so this drives it the way a page does: mount the band,
// let the observer fire, run one animation frame, read the digits.
const shell = require('../../../../../packages/case-study-shell/case-study-visual-story.js') as {
  mount: (container: HTMLElement, story: PublicCaseStudyVisualStory) => { element: HTMLElement; destroy: () => void } | null;
};
/* eslint-enable @typescript-eslint/no-var-requires */

type IOCallback = (entries: { isIntersecting: boolean }[]) => void;
const observers: IOCallback[] = [];
const frames: FrameRequestCallback[] = [];

class FakeObserver {
  constructor(cb: IOCallback) { observers.push(cb); }
  observe(): void {}
  disconnect(): void {}
}

const metric = (over: Partial<PublicCaseStudyMetric>): PublicCaseStudyMetric => ({
  label: 'Time from launch completion to automatic recovery', valueDisplay: 'median 34 minutes, p90 47 minutes',
  unit: 'minutes', baseline: null, sample: null, methodology: null, limitations: [], verificationClass: 'verified', verificationMethod: null,
  payload: { shape: 'count', value: 34.2 } as PublicCaseStudyMetric['payload'], ...over,
} as PublicCaseStudyMetric);

const story: PublicCaseStudyVisualStory = {
  schemaVersion: 1, presentationVersion: 'v2', motion: 'auto', workflow: null,
  outcomeCards: [metric({}), metric({ label: 'Decision records', valueDisplay: '1,400 decision records', unit: 'records', payload: { shape: 'count', value: 1400 } as PublicCaseStudyMetric['payload'] })],
  charts: [],
};

describe('the shell count-up', () => {
  beforeEach(() => {
    observers.length = 0;
    frames.length = 0;
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeObserver;
    window.matchMedia = () => ({ matches: false } as MediaQueryList);
    window.requestAnimationFrame = (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; };
    window.cancelAnimationFrame = () => {};
  });

  it('keeps the space between the count and its unit on every frame, thousands grouped', () => {
    const mounted = shell.mount(document.createElement('div'), story);
    expect(mounted).not.toBeNull();
    const digits = Array.from(mounted!.element.querySelectorAll('[data-testid=story-card-digits]')) as HTMLElement[];
    expect(digits.map((d) => d.textContent)).toEqual(['34 minutes', '1,400 records']);

    // One observer per card; each fires when its card scrolls into view.
    expect(observers.length).toBe(2);
    observers.forEach((cb) => cb([{ isIntersecting: true }]));
    expect(frames.length).toBe(2);
    const startedAt = performance.now();
    frames.splice(0).forEach((cb) => cb(startedAt + 300));

    expect(digits[0].textContent).toMatch(/^\d+ minutes$/);
    expect(digits[0].textContent).not.toBe('34 minutes');
    expect(digits[1].textContent).toMatch(/^[\d,]+ records$/);
    expect(digits.map((d) => d.getAttribute('data-settled'))).toEqual(['false', 'false']);

    frames.splice(0).forEach((cb) => cb(startedAt + 5000));
    expect(digits.map((d) => d.textContent)).toEqual(['34 minutes', '1,400 records']);
    expect(digits.map((d) => d.getAttribute('data-settled'))).toEqual(['true', 'true']);
    mounted!.destroy();
  });
});
