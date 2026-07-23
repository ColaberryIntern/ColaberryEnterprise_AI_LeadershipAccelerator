import QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import { detectDayKind, BuildKitSpecInput } from '../kitSpec';
import { buildKitSpec } from '../kitSpecDaySlides';
import { renderKitHtml } from '../kitHtml';

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
