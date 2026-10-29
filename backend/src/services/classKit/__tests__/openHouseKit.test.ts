import { detectDayKind, BuildKitSpecInput } from '../kitSpec';
import { buildKitSpec } from '../kitSpecDaySlides';
import { renderKitHtml } from '../kitHtml';
import { DEFAULT_KIT_CONFIG, KitConfig } from '../kitConfig';
import { theaterHtml } from '../kitTheater';

/**
 * Open House day kind: every slide comes from the session's KitConfig, and no
 * week content leaks in, whatever the date. Plus the two theater extras it
 * uses — live-filling bars and the giveaway draw.
 */

const SESSION: BuildKitSpecInput['session'] = {
  id: '00000000-0000-0000-0000-0000000000oh', session_number: 1,
  title: 'Open House — The Forward Deployed Engineer', session_date: '2026-10-29',
  start_time: '18:30', end_time: '20:00', status: 'scheduled',
};

function input(config: KitConfig): BuildKitSpecInput {
  return { session: SESSION, cohortName: 'Cohort - November 2026', checkinUrl: 'https://x/checkin', qrSvg: '<svg/>', meetLink: null, config };
}

const CONFIG: KitConfig = {
  ...DEFAULT_KIT_CONFIG,
  teach: { enabled: true, max: null, overrides: [
    { segment: 'signal', eyebrow: 'News', title: 'Anthropic put $100M on it', body: 'b' },
    { segment: 'role', eyebrow: 'Role', title: 'What an FDE does', body: 'b' },
  ] },
  storyBeats: { enabled: true, max: null, overrides: [{ segment: 'architect', icon: '🏛️', eyebrow: 'e', title: 'Beat', body: 'b' }] },
  interactions: { enabled: true, max: null, overrides: [
    { segment: 'welcome', kind: 'poll', q: 'Where are you?', options: ['A', 'B'], theater: true, liveBars: true },
    { segment: 'books', kind: 'trivia', q: 'Enter?', options: ["I'm in"], answer: 0, theater: true, raffle: 3 },
  ] },
};

describe('Open House day kind', () => {
  it('is detected from the title on any weekday, ahead of the weekday fallback', () => {
    expect(detectDayKind('Open House — Tonight', '2026-10-29')).toBe('openhouse'); // Thursday
    expect(detectDayKind('Colaberry Open House', '2026-10-26')).toBe('openhouse'); // Monday
  });

  it('renders only cover, rules and the authored content, in run-of-show order', () => {
    const spec = buildKitSpec(input(CONFIG));
    expect(spec.meta.dayKind).toBe('openhouse');
    expect(spec.meta.week).toBeNull();
    expect(spec.slides.map((s) => s.kind)).toEqual(['cover', 'rules', 'interaction', 'teach', 'teach', 'storybeat', 'interaction']);
    expect(spec.slides.map((s) => s.segmentId)).toEqual(['welcome', 'welcome', 'welcome', 'signal', 'role', 'architect', 'books']);
    // No generated week content: no break, microbuild, assignment, or trailer slides.
    expect(spec.slides.some((s) => ['break', 'microbuild', 'assignment', 'cta', 'architecture'].includes(s.kind))).toBe(false);
  });

  it('scales the run of show to the real session length', () => {
    const spec = buildKitSpec(input(CONFIG));
    expect(spec.totalMinutes).toBe(90);
    expect(spec.segments[spec.segments.length - 1].endMin).toBe(90);
  });

  it('renders nothing but the opening when no overrides are authored (empty, not week content)', () => {
    const spec = buildKitSpec(input(DEFAULT_KIT_CONFIG));
    expect(spec.slides.map((s) => s.kind)).toEqual(['cover', 'rules']);
  });

  it('carries liveBars and raffle into the deck metadata and draws a raffle panel', () => {
    const spec = buildKitSpec(input(CONFIG));
    const html = renderKitHtml(spec);
    expect(html).toContain('"liveBars":true');
    expect(html).toContain('"raffle":3');
    const raffleSlide = spec.slides.find((s) => s.interaction?.raffle)!;
    expect(theaterHtml(raffleSlide)).toContain('data-action="draw"');
    expect(theaterHtml(raffleSlide)).toContain('data-count="3"');
    const pollSlide = spec.slides.find((s) => s.interaction?.liveBars)!;
    expect(theaterHtml(pollSlide)).not.toContain('data-action="draw"');
  });
});
