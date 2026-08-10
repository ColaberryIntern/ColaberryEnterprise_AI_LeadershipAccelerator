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

  it('opening.hook override replaces an authored hook, and enabled:false removes it', async () => {
    // Every week 1-12 now ships an authored hook (weeks 4-12 gained one with
    // their content packs), so the meaningful instructor controls are
    // replace-and-remove rather than add-where-none-exists.
    const week4MondaySession: BuildKitSpecInput['session'] = {
      id: 's-wk4-mon', session_number: 6, title: 'Week 4: Something',
      session_date: '2026-08-17', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
    };
    const baseline = buildKitSpec(await inputFor(week4MondaySession));
    const authored = baseline.slides.find((s) => s.kind === 'hook');
    expect(authored).toBeDefined();

    const overridden = buildKitSpec({
      ...(await inputFor(week4MondaySession)),
      config: {
        ...DEFAULT_KIT_CONFIG,
        opening: { ...DEFAULT_KIT_CONFIG.opening, hook: { enabled: true, override: { headline: 'Added hook', caption: 'Added caption.' } } },
      } as KitConfig,
    });
    const hookSlide = overridden.slides.find((s) => s.kind === 'hook');
    expect(hookSlide?.title).toBe('Added hook');
    expect(hookSlide?.body).toBe('Added caption.');
    expect(hookSlide?.title).not.toBe(authored!.title);

    const removed = buildKitSpec({
      ...(await inputFor(week4MondaySession)),
      config: {
        ...DEFAULT_KIT_CONFIG,
        opening: { ...DEFAULT_KIT_CONFIG.opening, hook: { enabled: false, override: null } },
      } as KitConfig,
    });
    expect(removed.slides.some((s) => s.kind === 'hook')).toBe(false);
  });

  it('Week 3 Architecture Day has its own authored hook + teach slides in the check-in segment (week3-api-and-billing)', async () => {
    const week3MondaySession: BuildKitSpecInput['session'] = {
      id: 's-wk3-mon', session_number: 4, title: 'Week 3: Something',
      session_date: '2026-08-10', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
    };
    const spec = buildKitSpec(await inputFor(week3MondaySession));
    expect(spec.slides.find((s) => s.kind === 'hook')?.title).toContain('becomes a build');
    // The celebration/launch arc renders in check-in — the segment that carried
    // no teach slides at all before this week was authored.
    expect(spec.slides.filter((s) => s.kind === 'teach' && s.segmentId === 'checkin').length).toBeGreaterThan(0);
    // Ram's standing rule, applied to this class: every teach slide carries a diagram.
    const teach = spec.slides.filter((s) => s.kind === 'teach');
    expect(teach.length).toBeGreaterThanOrEqual(20);
    expect(teach.every((s) => !!s.diagram && s.diagram.includes('flowchart'))).toBe(true);
  });

  it('a teach slide\'s code block carries its Build Bay metadata through to the prompt (kind / pasteWhere)', async () => {
    // Regression: teachToSlides used to map only {label, code}, silently
    // dropping pasteWhere/kind — so shell commands rendered as "PASTE INTO
    // Claude Code" and read-along code claimed to be pasteable.
    const spec = buildKitSpec(await inputFor({
      id: 's-wk3-mon-meta', session_number: 4, title: 'Week 3: Something',
      session_date: '2026-08-10', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
    }));
    const withPrompts = spec.slides.filter((s) => s.kind === 'teach' && s.prompt);
    expect(withPrompts.length).toBeGreaterThan(0);

    // The terminal slide must NOT claim to be a Claude Code prompt.
    const terminal = withPrompts.find((s) => /TERMINAL/i.test(s.prompt!.pasteWhere || ''));
    expect(terminal).toBeDefined();
    expect(terminal!.prompt!.pasteWhere).not.toBe('Claude Code');

    // The read-along Python must be marked review, not paste.
    const review = withPrompts.find((s) => s.prompt!.kind === 'review');
    expect(review).toBeDefined();

    // And the richer rows must survive the mapping too.
    expect(withPrompts.some((s) => !!s.prompt!.expectedResult)).toBe(true);
  });

  it('Week 3 Build Day is hand-authored: diagrams everywhere, current API, no superseded model ids', async () => {
    const spec = buildKitSpec(await inputFor({
      id: 's-wk3-thu', session_number: 7, title: 'Week 3 · Build Day — Claude API + Workflow Assistant',
      session_date: '2026-08-13', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
    }));
    expect(spec.meta.dayKind).toBe('build');
    const teach = spec.slides.filter((s) => s.kind === 'teach');
    expect(teach.length).toBeGreaterThanOrEqual(12);
    expect(teach.every((s) => !!s.diagram && s.diagram.includes('flowchart'))).toBe(true);

    const json = JSON.stringify(spec.slides);
    // The generated content this replaced carried a superseded model id.
    expect(json).not.toContain('claude-opus-4-8');
    expect(json).toContain('claude-opus-5');
    // Structured output must use the current parameter. `output_format` may
    // still appear, but ONLY inside an explicit "not the deprecated" warning.
    expect(json).toContain('output_config');
    const badUses = (json.match(/output_format/g) || []).length;
    const warnings = (json.match(/deprecated[^"]{0,40}output_format/g) || []).length;
    expect(badUses).toBe(warnings);

    // Build Day teaches direct-then-review too.
    expect(spec.slides.some((s) => s.prompt?.kind === 'review')).toBe(true);
  });

  it('failure-segment story beats render even when the segment has deep teach slides', async () => {
    // Regression: these were pushed only in the no-teach fallback branch, and
    // even there with `undefined` instead of the authored set — so an authored
    // thursday.storyBeats.failure never rendered on any path.
    const spec = buildKitSpec(await inputFor({
      id: 's-wk3-thu-beats', session_number: 7, title: 'Week 3 · Build Day — Claude API + Workflow Assistant',
      session_date: '2026-08-13', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
    }));
    const failBeats = spec.slides.filter((s) => s.kind === 'storybeat' && s.segmentId === 'failure');
    expect(failBeats.length).toBeGreaterThan(0);
    // and the segment genuinely has deep teach slides, i.e. the fallback path
    // is NOT what produced them.
    expect(spec.slides.some((s) => s.kind === 'teach' && s.segmentId === 'failure')).toBe(true);
  });

  it('renders the enriched full-screen diagram layer: title, key points, brand, run-location', async () => {
    // The zoomed diagram is what the room (and the class recording) sees while
    // the instructor talks over it, so it has to carry more than the picture.
    const spec = buildKitSpec(await inputFor({
      id: 's-wk3-mon-zoom', session_number: 4, title: 'Week 3: Something',
      session_date: '2026-08-10', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
    }));
    const html = renderKitHtml(spec, { live: { enabled: false } });
    expect(html).toContain('kdiag-hd-title');   // slide title in the zoom layer
    expect(html).toContain('kdiag-side-list');  // key points beside the diagram
    expect(html).toContain('kdiag-brand');      // program mark, for the recording
    expect(html).toContain('kdiag-where');      // where this code gets run
    // The run-location must name the AUTHORED target, not always the default.
    expect(html).toContain('your TERMINAL (not Claude Code)');
    // Review code says read-along instead of offering a paste target.
    expect(html).toContain('Read-along');
    expect(html).toContain('kbb-chip-review');
  });

  it('Week 2 now has its own authored hook (the dashboard-incident cold open, week2-architecture-day-redesign)', async () => {
    const week2MondaySession: BuildKitSpecInput['session'] = {
      id: 's-wk2-mon', session_number: 2, title: 'Week 2: Something',
      session_date: '2026-08-03', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
    };
    const spec = buildKitSpec(await inputFor(week2MondaySession));
    const hookSlide = spec.slides.find((s) => s.kind === 'hook');
    expect(hookSlide?.title).toContain('SUCCESS');
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

/**
 * week2-architecture-day-redesign — the redesigned Week 2 Architecture Day
 * session (data-quality-gate / etl-failure-triage / executive-dashboard-brief
 * incident story). Also emits a real sample deck to the scratchpad for visual
 * verification (screenshots), matching the pattern above.
 */
describe('Week 2 Architecture Day — data-incident redesign (week2-architecture-day-redesign)', () => {
  const WEEK2_SESSION: BuildKitSpecInput['session'] = {
    id: 'demo-wk2-mon', session_number: 4, title: 'Week 2 · Architecture Day — Agent Skills (build 3 skills)',
    session_date: '2026-08-03', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
  };

  it('resolves to Week 2, Architecture Day, with the correct title', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_SESSION));
    expect(spec.meta.dayKind).toBe('architecture');
    expect(spec.meta.week).toBe(2);
    expect(spec.meta.title).toContain('Agent Skills (build 3 skills)');
  });

  it('the timeline remains exactly 120 minutes, unchanged run-of-show', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_SESSION));
    expect(spec.totalMinutes).toBe(120);
    const last = spec.segments[spec.segments.length - 1];
    expect(last.endMin).toBe(120);
  });

  it('the story is the dashboard/ETL incident, and all three Skill names appear in the rendered slides', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_SESSION));
    const text = JSON.stringify(spec.slides);
    expect(text).toContain('data-quality-gate');
    expect(text).toContain('etl-failure-triage');
    expect(text).toContain('executive-dashboard-brief');
    expect(text).toMatch(/ETL job says SUCCESS/i);
  });

  it('all four story beats appear, in run-of-show segment order', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_SESSION));
    const beatSlides = spec.slides.filter((s) => s.kind === 'storybeat');
    expect(beatSlides.length).toBe(4);
    const segmentOrder = spec.segments.map((s) => s.id);
    const beatSegmentIndices = beatSlides.map((s) => segmentOrder.indexOf(s.segmentId));
    const sorted = [...beatSegmentIndices].sort((a, b) => a - b);
    expect(beatSegmentIndices).toEqual(sorted); // beats appear in the same order as their segments run
  });

  it('the four primary/extra polls resolve into the correct segments', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_SESSION));
    const interactionSlides = spec.slides.filter((s) => s.kind === 'interaction');
    // checkin + challenge (same designChoice) + trivia (2, base + extra) +
    // deconstruct (1) + micro-build (2) was 7; the content-pack migration added
    // four more authored questions. The placements below are the real subject
    // of this test, so assert those exactly and the total as a floor.
    expect(interactionSlides.length).toBeGreaterThanOrEqual(7);
    expect(interactionSlides.filter((s) => s.segmentId === 'micro-build').length).toBe(2);
    expect(interactionSlides.filter((s) => s.segmentId === 'trivia').length).toBe(2);
  });

  it('each of the three Skills has a separate build slide and a separate automatic-invocation test slide', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_SESSION));
    const teachSlides = spec.slides.filter((s) => s.kind === 'teach');
    // Build/test labeling lives in the slide's eyebrow (e.g. "🧪 Test Automatic
    // Invocation"), not necessarily the title — check both.
    const labels = spec.slides.map((s) => `${s.eyebrow || ''} ${s.title || ''}`);
    const buildLabels = labels.filter((t) => /Build (data-quality-gate|etl-failure-triage|executive-dashboard-brief)|First Skill|Second Skill|Third Skill/i.test(t));
    const testLabels = labels.filter((t) => /Test Automatic Invocation|Three-Way Retest|Test \+ Complete/i.test(t));
    expect(buildLabels.length).toBeGreaterThanOrEqual(3);
    expect(testLabels.length).toBeGreaterThanOrEqual(3);
    expect(teachSlides.length).toBeGreaterThan(0); // sanity: teach content actually renders
  });

  it('no slide anywhere INSTRUCTS students to use the Downloads folder (the negation "no downloads folder" is expected and fine)', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_SESSION));
    const text = JSON.stringify(spec.slides).toLowerCase();
    expect(text).not.toMatch(/(save|move|copy|export|download)[^.]{0,40}(to|into|in)[^.]{0,20}downloads/);
    expect(text).not.toContain('~/downloads');
    // Confirm the deck actively states the opposite, rather than just being silent on it.
    expect(text).toContain('no downloads folder');
  });

  it('every file-producing code prompt asks Claude to report exact project-relative paths', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_SESSION));
    const codeSlides = spec.slides.filter((s) => s.kind === 'teach' && /CREATE|Build/i.test(s.title || ''));
    const withReportInstruction = spec.slides.filter((s) => /WHEN FINISHED, REPORT/.test(JSON.stringify(s)));
    expect(withReportInstruction.length).toBeGreaterThanOrEqual(6); // 6 file-producing prompts author this instruction
  });

  it('the first Skill-build prompt checks for and creates .claude/skills/ if missing', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_SESSION));
    const text = JSON.stringify(spec.slides);
    expect(text).toMatch(/WORKSPACE AND SKILLS DIRECTORY CHECK/);
    expect(text).toMatch(/If \.claude\/skills\/ does not exist, create it/);
  });

  it('allowed-tools is never described as a permanent restriction anywhere in the rendered deck', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_SESSION));
    const text = JSON.stringify(spec.slides);
    expect(text).not.toMatch(/allowed-tools[^"]{0,60}permanently restrict/i);
    expect(text).toContain('Pre-approval and restriction are different controls');
  });

  it('renders a slide count reflecting genuinely distinct, non-repetitive content (actual: 35 — see plan disclosure)', async () => {
    // The plan's illustrative ~29-31 estimate undercounted: covering the
    // file-location slide, all 4 architecture-story teach slides, and the
    // full build+test pair for all 3 Skills (per the spec's own explicit
    // "separate build and test slide" requirement) genuinely needs 35 slides.
    // None of it is repetitive/unrelated content (the complaint about the old
    // 32-slide deck) — every slide ties directly to the one incident. Locked
    // to the exact current count so a future change to this deck is a
    // deliberate, reviewed decision, not silent drift.
    //
    // 35 → 39: the content-pack migration added 4 authored participation
    // questions to Monday. The 14 teach slides were carried over
    // field-for-field and independently verified identical — this is the
    // reviewed decision the lock exists to force, not drift.
    const spec = buildKitSpec(await inputFor(WEEK2_SESSION));
    expect(spec.slides.length).toBe(39);
  });

  it('QR/phone-controller, status rail, and pace-tracking chrome still render (rendered HTML, not just the spec)', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_SESSION));
    const html = renderKitHtml(spec, { live: { enabled: true } });
    expect(html).toContain('id="kprogress"');
    expect(html).toContain('id="kpaceclock"');
    expect(html).toContain('krail');
    expect(html).toContain('Your phone is your class controller');
  });

  it('emits a real sample deck to the scratchpad for visual verification', async () => {
    fs.mkdirSync(SAMPLE_DIR, { recursive: true });
    const spec = buildKitSpec(await inputFor(WEEK2_SESSION));
    const html = renderKitHtml(spec, { live: { enabled: false } });
    fs.writeFileSync(path.join(SAMPLE_DIR, 'week2-architecture-redesign.html'), html, 'utf8');
    expect(html.length).toBeGreaterThan(4000);
  });

  it('Week 2 Build Day (Thursday) still renders successfully (content redesigned separately, see week2-buildday-architecture-blueprint below)', async () => {
    const thursdaySession: BuildKitSpecInput['session'] = {
      id: 'demo-wk2-thu', session_number: 5, title: 'Week 2 · Build Day — Agent Skills (build 3 skills)',
      session_date: '2026-08-06', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
    };
    const spec = buildKitSpec(await inputFor(thursdaySession));
    expect(spec.meta.dayKind).toBe('build');
    const text = JSON.stringify(spec.slides);
    expect(text).toContain('system-architect');
  });

  it('Weeks 1 and 3-12 are unaffected — spot-check Week 1 and Week 3 still build cleanly', async () => {
    const week1: BuildKitSpecInput['session'] = {
      id: 'demo-wk1-check', session_number: 2, title: 'Week 1: Business Analyst',
      session_date: '2026-07-27', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
    };
    const week3: BuildKitSpecInput['session'] = {
      id: 'demo-wk3-check', session_number: 6, title: 'Week 3: Something',
      session_date: '2026-08-10', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
    };
    const spec1 = buildKitSpec(await inputFor(week1));
    const spec3 = buildKitSpec(await inputFor(week3));
    expect(spec1.meta.week).toBe(1);
    expect(spec3.meta.week).toBe(3);
    const text1 = JSON.stringify(spec1.slides);
    const text3 = JSON.stringify(spec3.slides);
    expect(text1).not.toContain('data-quality-gate');
    expect(text3).not.toContain('data-quality-gate');
  });
});

/**
 * week2-buildday-architecture-blueprint — Week 2 Build Day (Thursday), turning
 * one paragraph of a (possibly not-yet-final) project idea into a real system
 * architecture diagram, a justified tech stack, and a visual demo (mockup.html
 * + one-pager). Also emits a real sample deck for visual verification.
 */
describe('Week 2 Build Day — architecture blueprint redesign (week2-buildday-architecture-blueprint)', () => {
  const WEEK2_THURSDAY_SESSION: BuildKitSpecInput['session'] = {
    id: 'demo-wk2-thu-bp', session_number: 5, title: 'Week 2 · Build Day — Agent Skills (build 3 skills)',
    session_date: '2026-08-06', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
  };

  it('resolves to Week 2, Build Day, with the correct title', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_THURSDAY_SESSION));
    expect(spec.meta.dayKind).toBe('build');
    expect(spec.meta.week).toBe(2);
    expect(spec.meta.title).toContain('Agent Skills (build 3 skills)');
  });

  it('the timeline remains exactly 120 minutes, unchanged run-of-show', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_THURSDAY_SESSION));
    expect(spec.totalMinutes).toBe(120);
  });

  it('all three Skill names appear, and the idea-stage framing is present', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_THURSDAY_SESSION));
    const text = JSON.stringify(spec.slides);
    expect(text).toContain('system-architect');
    expect(text).toContain('tech-stack-recommender');
    expect(text).toContain('mvp-scoper');
    expect(text).toMatch(/does not need to be final/i);
  });

  it('every teach slide carries a real mermaid diagram (Ram feedback)', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_THURSDAY_SESSION));
    const teachSlides = spec.slides.filter((s) => s.kind === 'teach');
    expect(teachSlides.length).toBeGreaterThan(0);
    teachSlides.forEach((s) => {
      expect(s.diagram).toBeTruthy();
      expect(s.diagram).toContain('flowchart');
    });
  });

  it('each of the three Skills has a separate build slide and a separate automatic-invocation test slide', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_THURSDAY_SESSION));
    const labels = spec.slides.map((s) => `${s.eyebrow || ''} ${s.title || ''}`);
    const buildLabels = labels.filter((t) => /Build system-architect|Build tech-stack-recommender|Build \+ Scope mvp-scoper/i.test(t));
    const testLabels = labels.filter((t) => /Test Automatic Invocation|Test \+ Demo/i.test(t));
    expect(buildLabels.length).toBeGreaterThanOrEqual(3);
    expect(testLabels.length).toBeGreaterThanOrEqual(3);
  });

  it('mvp-scoper is scoped to Read, Write, Bash — Bash for real PDF generation — and produces a visual mockup.html and a PDF one-pager (week2-mvp-scoper-run-prompt)', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_THURSDAY_SESSION));
    const text = JSON.stringify(spec.slides);
    expect(text).toContain('mockup.html');
    expect(text).toContain('one-pager.pdf');
    expect(text).not.toContain('one-pager.md');
    expect(text).toMatch(/allowed-tools:\s*Read,\s*Write,\s*Bash/);
  });

  it('the tech-stack-recommender output is described as colorful/icon-led with a learn-more prompt per technology', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_THURSDAY_SESSION));
    const text = JSON.stringify(spec.slides);
    expect(text).toMatch(/🟢|🟡|🔴/);
    expect(text).toMatch(/learn.more/i);
  });

  it('no slide anywhere instructs students to use the Downloads folder', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_THURSDAY_SESSION));
    const text = JSON.stringify(spec.slides).toLowerCase();
    expect(text).not.toMatch(/(save|move|copy|export|download)[^.]{0,40}(to|into|in)[^.]{0,20}downloads/);
  });

  it('the checkpoints reflect the new arc: diagram fires (CP1), all 3 authored (CP2), mvp-scoper scoped + shown off (CP3)', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_THURSDAY_SESSION));
    const checkpointSlides = spec.slides.filter((s) => s.kind === 'checkpoint');
    expect(checkpointSlides.length).toBe(4);
    expect(JSON.stringify(checkpointSlides[1])).toMatch(/system-architect/);
    expect(JSON.stringify(checkpointSlides[3])).toMatch(/mvp-scoper/);
  });

  it('QR/phone-controller, status rail, and pace-tracking chrome still render', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_THURSDAY_SESSION));
    const html = renderKitHtml(spec, { live: { enabled: true } });
    expect(html).toContain('id="kprogress"');
    expect(html).toContain('id="kpaceclock"');
    expect(html).toContain('Your phone is your class controller');
  });

  it('emits a real sample deck to the scratchpad for visual verification', async () => {
    fs.mkdirSync(SAMPLE_DIR, { recursive: true });
    const spec = buildKitSpec(await inputFor(WEEK2_THURSDAY_SESSION));
    const html = renderKitHtml(spec, { live: { enabled: false } });
    fs.writeFileSync(path.join(SAMPLE_DIR, 'week2-buildday-architecture-blueprint.html'), html, 'utf8');
    expect(html.length).toBeGreaterThan(4000);
  });

  it('the git lesson replaces the old Skill-description failure injection in the failure segment', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_THURSDAY_SESSION));
    const text = JSON.stringify(spec.slides);
    expect(text).toMatch(/git status/);
    expect(text).toMatch(/git commit/i);
    expect(text).toMatch(/git log/);
    expect(text).toMatch(/README\.md/);
    expect(text).toMatch(/\.gitignore/);
    expect(text).not.toContain('helps with my idea');
  });

  it('extra participation polls render for build-map, guided-build, and the (git lesson) failure segment', async () => {
    const spec = buildKitSpec(await inputFor(WEEK2_THURSDAY_SESSION));
    const interactionSlides = spec.slides.filter((s) => s.kind === 'interaction');
    const bySegment = (id: string) => interactionSlides.filter((s) => s.segmentId === id);
    expect(bySegment('build-map').length).toBeGreaterThanOrEqual(1);
    expect(bySegment('guided-build').length).toBeGreaterThanOrEqual(2);
    expect(bySegment('failure').length).toBeGreaterThanOrEqual(1);
    const text = JSON.stringify(interactionSlides);
    expect(text).toMatch(/how cool your deliverable/i);
    expect(text).toMatch(/creative juices/i);
  });

  it('the opening story beats render before the guided-build (skills) segment starts', async () => {
    // Scoped to the beats this test was written about — the ones that set the
    // scene BEFORE building begins. The content-pack migration added two more
    // beats in the `failure` segment, which runs after the guided build by
    // design, so "every beat precedes the guided build" is no longer the
    // property to assert; "the opening beats do" still is.
    const spec = buildKitSpec(await inputFor(WEEK2_THURSDAY_SESSION));
    const openingBeats = spec.slides.filter(
      (s) => s.kind === 'storybeat' && ['result-preview', 'build-map'].includes(s.segmentId),
    );
    expect(openingBeats.length).toBeGreaterThanOrEqual(2);
    const guidedBuildStart = spec.slides.findIndex((s) => s.segmentId === 'guided-build');
    openingBeats.forEach((s) => {
      expect(spec.slides.indexOf(s)).toBeLessThan(guidedBuildStart);
    });
  });

  it('Week 2 Monday (Architecture Day) is unaffected by this Thursday-only change', async () => {
    const mondaySession: BuildKitSpecInput['session'] = {
      id: 'demo-wk2-mon-check', session_number: 4, title: 'Week 2 · Architecture Day — Agent Skills (build 3 skills)',
      session_date: '2026-08-03', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled',
    };
    const spec = buildKitSpec(await inputFor(mondaySession));
    const text = JSON.stringify(spec.slides);
    expect(text).toContain('data-quality-gate');
    expect(text).not.toContain('system-architect');
  });
});
