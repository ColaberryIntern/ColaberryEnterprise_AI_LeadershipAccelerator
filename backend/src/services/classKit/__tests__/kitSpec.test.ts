import QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import { detectDayKind, BuildKitSpecInput } from '../kitSpec';
import { buildKitSpec } from '../kitSpecDaySlides';
import { renderKitHtml } from '../kitHtml';
import { DEFAULT_KIT_CONFIG, KitConfig } from '../kitConfig';

/**
 * Unit tests for the Class Kit spec builder + HTML renderer. Also emits three
 * real sample decks (Orientation, Week 1 Architecture Day, Week 1 Build Day) to
 * the scratchpad so the deck can be eyeballed in a browser. Set KIT_SAMPLE_DIR
 * to override the output directory.
 */

const SAMPLE_DIR =
  process.env.KIT_SAMPLE_DIR ||
  'C:/Users/ali_m/AppData/Local/Temp/claude/c--Users-ali-m-OneDrive-Business-Colaberry-Novedea-AI-Projects-Colaberry-Enterprise-AI-Leadership-Accelerator-docs/1709f22c-d0a0-4c65-8487-b864abea7ce4/scratchpad/kit-samples';

async function inputFor(session: BuildKitSpecInput['session']): Promise<BuildKitSpecInput> {
  const checkin_url = `https://enterprise.colaberry.ai/portal/class-checkin/${session.id}`;
  const qr = await QRCode.toString(checkin_url, { type: 'svg', margin: 1, width: 240 });
  return { session, cohortName: 'Cohort - July 2026', checkinUrl: checkin_url, qrSvg: qr, meetLink: 'https://meet.google.com/abc-defg-hij' };
}

describe('detectDayKind', () => {
  it('detects orientation from the title', () => {
    expect(detectDayKind('Orientation — Welcome', '2026-07-23')).toBe('orientation');
  });
  it('detects architecture on a Monday and build on a Thursday', () => {
    expect(detectDayKind('Week 1: whatever', '2026-07-27')).toBe('architecture'); // Monday
    expect(detectDayKind('Week 1: whatever', '2026-07-30')).toBe('build'); // Thursday
  });
  it('honors an explicit day label over the weekday', () => {
    expect(detectDayKind('Week 3 · Build Day — X', '2026-08-10')).toBe('build');
  });
});

describe('buildKitSpec', () => {
  it('builds an Architecture Day spec grounded in the Week 1 blueprint', async () => {
    const spec = buildKitSpec(await inputFor({
      id: 's-mon', session_number: 2, title: 'Week 1: Business Analyst',
      session_date: '2026-07-27', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
    }));
    expect(spec.meta.dayKind).toBe('architecture');
    expect(spec.meta.week).toBe(1);
    expect(spec.meta.title).toBe('Claude Code Foundations + Workspace');
    // run-of-show came through and the cold-open payoff is week-specific
    expect(spec.segments.find((s) => s.id === 'architecture')).toBeTruthy();
    expect(spec.slides.some((s) => s.kind === 'cover')).toBe(true);
    expect(spec.slides.some((s) => /CLAUDE\.md/.test(s.body || '') || (s.bullets || []).some((b) => /CLAUDE\.md/.test(b)))).toBe(true);
    // pace segments cover the full duration
    expect(spec.totalMinutes).toBe(120);
    expect(spec.segments[spec.segments.length - 1].endMin).toBe(120);
  });

  it('builds a Build Day spec with prompts, a failure injection, and checkpoints', async () => {
    const spec = buildKitSpec(await inputFor({
      id: 's-thu', session_number: 3, title: 'Week 1: Business Analyst',
      session_date: '2026-07-30', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
    }));
    expect(spec.meta.dayKind).toBe('build');
    // A real copy-ready prompt exists somewhere in the guided build — as a plain
    // 'prompt' slide when no deep teaching is authored for the segment, or on a
    // 'teach' slide carrying code when it is (Week 1 has deep guided-build content).
    expect(spec.slides.some((s) => !!s.prompt)).toBe(true);
    expect(spec.slides.some((s) => s.kind === 'checkpoint')).toBe(true);
    // The failure-injection moment exists as either the plain 'failure' slide
    // (no deep teaching authored) or deep 'teach' content tagged to that segment
    // (Week 1 has both a break-it and fix-it deep-teaching pair).
    expect(spec.slides.some((s) => s.segmentId === 'failure')).toBe(true);
    expect(spec.slides.some((s) => s.kind === 'broadcast')).toBe(true);
  });

  it('builds an Orientation spec with the three presenter segments', async () => {
    const spec = buildKitSpec(await inputFor({
      id: 's-orient', session_number: 1, title: 'Orientation',
      session_date: '2026-07-23', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
    }));
    expect(spec.meta.dayKind).toBe('orientation');
    expect(spec.meta.week).toBeNull();
    const eyebrows = spec.slides.map((s) => s.eyebrow || '').join(' | ');
    expect(eyebrows).toMatch(/Ali/);
    expect(eyebrows).toMatch(/Taiwo/);
    expect(eyebrows).toMatch(/Swati/);
  });

  it('scales the run of show for a shorter session', async () => {
    const spec = buildKitSpec(await inputFor({
      id: 's-short', session_number: 2, title: 'Week 2 · Architecture Day',
      session_date: '2026-08-03', start_time: '18:30', end_time: '20:00', status: 'scheduled',
    }));
    expect(spec.totalMinutes).toBe(90);
    expect(spec.segments[spec.segments.length - 1].endMin).toBe(90);
  });
});

describe('buildKitSpec — KitConfig wiring', () => {
  const week1ThursdaySession: BuildKitSpecInput['session'] = {
    id: 's-thu', session_number: 3, title: 'Week 1: Business Analyst',
    session_date: '2026-07-30', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
  };
  const week1MondaySession: BuildKitSpecInput['session'] = {
    id: 's-mon', session_number: 2, title: 'Week 1: Business Analyst',
    session_date: '2026-07-27', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
  };

  it('teach.enabled:false removes deep-teaching slides and the guided-build falls back to plain prompts', async () => {
    const config: KitConfig = { ...DEFAULT_KIT_CONFIG, teach: { enabled: false, max: null, overrides: null } };
    const spec = buildKitSpec({ ...(await inputFor(week1ThursdaySession)), config });
    expect(spec.slides.some((s) => s.kind === 'teach')).toBe(false);
    // Week 1's guided-build normally renders via deep-teach; disabling teach
    // should engage the plain-prompts fallback instead of losing the segment.
    expect(spec.slides.some((s) => s.kind === 'prompt')).toBe(true);
  });

  it('teach.max caps the number of deep-teaching slides shown', async () => {
    const unconfigured = buildKitSpec(await inputFor(week1ThursdaySession));
    const teachCount = unconfigured.slides.filter((s) => s.kind === 'teach').length;
    expect(teachCount).toBeGreaterThan(1);
    const config: KitConfig = { ...DEFAULT_KIT_CONFIG, teach: { enabled: true, max: 1, overrides: null } };
    const capped = buildKitSpec({ ...(await inputFor(week1ThursdaySession)), config });
    expect(capped.slides.filter((s) => s.kind === 'teach').length).toBe(1);
  });

  it('teach.overrides fully replaces the authored deep-teaching content', async () => {
    const customTeach = [{ segment: 'guided-build', eyebrow: '🧪 Custom', title: 'Custom checkpoint', body: 'A custom step.' }];
    const config: KitConfig = { ...DEFAULT_KIT_CONFIG, teach: { enabled: true, max: null, overrides: customTeach } };
    const spec = buildKitSpec({ ...(await inputFor(week1ThursdaySession)), config });
    expect(spec.slides.some((s) => s.title === 'Custom checkpoint')).toBe(true);
    expect(spec.slides.some((s) => s.title === 'Everyone at the same starting line')).toBe(false);
  });

  it('prompts.overrides only takes effect once teach is disabled (the fallback path)', async () => {
    const customPrompts = [{ label: 'Custom prompt', prompt: 'Do the custom thing.' }];
    const config: KitConfig = {
      ...DEFAULT_KIT_CONFIG,
      teach: { enabled: false, max: null, overrides: null },
      prompts: { enabled: true, max: null, overrides: customPrompts },
    };
    const spec = buildKitSpec({ ...(await inputFor(week1ThursdaySession)), config });
    expect(spec.slides.some((s) => s.prompt?.label === 'Custom prompt')).toBe(true);
  });

  it('prompts.enabled:false suppresses the fallback prompt slides entirely', async () => {
    const config: KitConfig = {
      ...DEFAULT_KIT_CONFIG,
      teach: { enabled: false, max: null, overrides: null },
      prompts: { enabled: false, max: null, overrides: null },
    };
    const spec = buildKitSpec({ ...(await inputFor(week1ThursdaySession)), config });
    expect(spec.slides.some((s) => s.kind === 'prompt')).toBe(false);
  });

  it('interactions.enabled:false removes every survey question slide', async () => {
    const config: KitConfig = { ...DEFAULT_KIT_CONFIG, interactions: { enabled: false, max: null, overrides: null } };
    const spec = buildKitSpec({ ...(await inputFor(week1ThursdaySession)), config });
    expect(spec.slides.some((s) => s.kind === 'interaction')).toBe(false);
  });

  it('interactions.overrides fully replaces the authored defaults, placed by segment', async () => {
    const custom = [{ segment: 'readiness', kind: 'trivia' as const, q: 'Custom trivia?', options: ['A', 'B'], answer: 0 }];
    const config: KitConfig = { ...DEFAULT_KIT_CONFIG, interactions: { enabled: true, max: null, overrides: custom } };
    const spec = buildKitSpec({ ...(await inputFor(week1ThursdaySession)), config });
    expect(spec.slides.some((s) => s.interaction?.q === 'Custom trivia?')).toBe(true);
    expect(spec.slides.some((s) => s.eyebrow === '🧠 Warm-up')).toBe(false); // the authored default is gone
  });

  it('interactions.max caps the total number of survey questions across the whole class', async () => {
    const unconfigured = buildKitSpec(await inputFor(week1MondaySession));
    const defaultCount = unconfigured.slides.filter((s) => s.kind === 'interaction').length;
    expect(defaultCount).toBeGreaterThan(1); // Monday has 3 by default (poll shown twice + trivia)
    const config: KitConfig = { ...DEFAULT_KIT_CONFIG, interactions: { enabled: true, max: 1, overrides: null } };
    const capped = buildKitSpec({ ...(await inputFor(week1MondaySession)), config });
    expect(capped.slides.filter((s) => s.kind === 'interaction').length).toBe(1);
  });

  it('an added question placed on a new segment via overrides renders only there ("strategically place on the timeline")', async () => {
    const custom = [{ segment: 'deconstruct', kind: 'poll' as const, q: 'Where should this live?', options: ['A', 'B'] }];
    const config: KitConfig = { ...DEFAULT_KIT_CONFIG, interactions: { enabled: true, max: null, overrides: custom } };
    const spec = buildKitSpec({ ...(await inputFor(week1MondaySession)), config });
    const hit = spec.slides.find((s) => s.interaction?.q === 'Where should this live?');
    expect(hit?.segmentId).toBe('deconstruct');
  });

  it('opening.coldOpen.enabled:false removes the cold-open slide but leaves the hook alone', async () => {
    const baseline = buildKitSpec(await inputFor(week1MondaySession));
    expect(baseline.slides.some((s) => s.title === 'By Thursday, this will exist')).toBe(true);
    expect(baseline.slides.some((s) => s.kind === 'hook')).toBe(true); // Week 1 has an authored hook

    const config: KitConfig = { ...DEFAULT_KIT_CONFIG, opening: { ...DEFAULT_KIT_CONFIG.opening, coldOpen: { enabled: false, override: null } } };
    const spec = buildKitSpec({ ...(await inputFor(week1MondaySession)), config });
    expect(spec.slides.some((s) => s.title === 'By Thursday, this will exist')).toBe(false);
    expect(spec.slides.some((s) => s.kind === 'hook')).toBe(true); // independent of coldOpen
  });

  it('opening.hook.enabled:false removes the hook slide but leaves cold-open alone', async () => {
    const config: KitConfig = { ...DEFAULT_KIT_CONFIG, opening: { ...DEFAULT_KIT_CONFIG.opening, hook: { enabled: false, override: null } } };
    const spec = buildKitSpec({ ...(await inputFor(week1MondaySession)), config });
    expect(spec.slides.some((s) => s.kind === 'hook')).toBe(false);
    expect(spec.slides.some((s) => s.title === 'By Thursday, this will exist')).toBe(true);
  });

  it('opening.coldOpen.override replaces the cold-open title/body', async () => {
    const config: KitConfig = {
      ...DEFAULT_KIT_CONFIG,
      opening: { ...DEFAULT_KIT_CONFIG.opening, coldOpen: { enabled: true, override: { title: 'Custom cold open', body: 'Custom body.' } } },
    };
    const spec = buildKitSpec({ ...(await inputFor(week1MondaySession)), config });
    expect(spec.slides.some((s) => s.title === 'Custom cold open' && s.body === 'Custom body.')).toBe(true);
    expect(spec.slides.some((s) => s.title === 'By Thursday, this will exist')).toBe(false);
  });

  it('opening.hook.override replaces the hook headline/caption', async () => {
    const config: KitConfig = {
      ...DEFAULT_KIT_CONFIG,
      opening: { ...DEFAULT_KIT_CONFIG.opening, hook: { enabled: true, override: { headline: 'Custom hook', caption: 'Custom caption.' } } },
    };
    const spec = buildKitSpec({ ...(await inputFor(week1MondaySession)), config });
    const hookSlide = spec.slides.find((s) => s.kind === 'hook');
    expect(hookSlide?.title).toBe('Custom hook');
    expect(hookSlide?.body).toBe('Custom caption.');
  });

  it('opening.resultPreview.enabled:false removes it on Build Day; override replaces its content', async () => {
    const disabledConfig: KitConfig = { ...DEFAULT_KIT_CONFIG, opening: { ...DEFAULT_KIT_CONFIG.opening, resultPreview: { enabled: false, override: null } } };
    const disabledSpec = buildKitSpec({ ...(await inputFor(week1ThursdaySession)), config: disabledConfig });
    expect(disabledSpec.slides.some((s) => s.eyebrow === '🎯 Result preview')).toBe(false);

    const overrideConfig: KitConfig = {
      ...DEFAULT_KIT_CONFIG,
      opening: { ...DEFAULT_KIT_CONFIG.opening, resultPreview: { enabled: true, override: { title: 'Custom preview', body: 'Custom body.' } } },
    };
    const overrideSpec = buildKitSpec({ ...(await inputFor(week1ThursdaySession)), config: overrideConfig });
    expect(overrideSpec.slides.some((s) => s.title === 'Custom preview' && s.body === 'Custom body.')).toBe(true);
  });
});

describe('renderKitHtml', () => {
  it('produces a self-contained document and escapes text', async () => {
    const spec = buildKitSpec(await inputFor({
      id: 's-mon', session_number: 2, title: 'Week 1: Business Analyst',
      session_date: '2026-07-27', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
    }));
    const html = renderKitHtml(spec, { live: { enabled: false } });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('window.__KIT__');
    expect(html).toContain('id="kpace"'); // pace bar present
    expect(html).toContain('id="krail"'); // pulse rail present
    expect(html).toContain('<svg'); // inline QR
    expect(html).not.toContain('<script>alert'); // sanity
    // Dedicated nav buttons exist, and the old whole-page click-to-advance
    // fallback (a click anywhere past 28% of screen width) is gone.
    expect(html).toContain('id="kprev"');
    expect(html).toContain('id="knext"');
    expect(html).not.toContain('window.innerWidth * 0.28');
  });

  it('emits the three sample decks to the scratchpad', async () => {
    fs.mkdirSync(SAMPLE_DIR, { recursive: true });
    const samples: Array<{ file: string; session: BuildKitSpecInput['session'] }> = [
      { file: 'orientation.html', session: { id: 'demo-orientation', session_number: 1, title: 'Orientation', session_date: '2026-07-23', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled' } },
      { file: 'week1-architecture.html', session: { id: 'demo-wk1-mon', session_number: 2, title: 'Week 1: Business Analyst', session_date: '2026-07-27', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled' } },
      { file: 'week1-build.html', session: { id: 'demo-wk1-thu', session_number: 3, title: 'Week 1: Business Analyst', session_date: '2026-07-30', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled' } },
    ];
    for (const s of samples) {
      const spec = buildKitSpec(await inputFor(s.session));
      const html = renderKitHtml(spec, { live: { enabled: false } });
      fs.writeFileSync(path.join(SAMPLE_DIR, s.file), html, 'utf8');
      expect(html.length).toBeGreaterThan(4000);
    }
  });
});
