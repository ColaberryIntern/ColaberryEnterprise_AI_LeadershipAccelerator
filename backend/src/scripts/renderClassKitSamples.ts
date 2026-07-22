/**
 * renderClassKitSamples.ts — render sample Class Kit decks to disk so the deck
 * can be eyeballed in a browser without a running server. Pure (no DB/env): it
 * only touches the classKit render path + the qrcode lib.
 *
 * Usage: compile + run (out dir defaults to the scratchpad; override with
 * KIT_SAMPLE_DIR). One-off dev tool; safe to re-run (overwrites the samples).
 */
import QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import { buildKitSpec, BuildKitSpecInput } from '../services/classKit/kitSpec';
import { renderKitHtml } from '../services/classKit/kitHtml';

const OUT =
  process.env.KIT_SAMPLE_DIR ||
  path.join(process.cwd(), 'kit-samples');

const SAMPLES: Array<{ file: string; session: BuildKitSpecInput['session'] }> = [
  { file: 'orientation.html', session: { id: 'demo-orientation', session_number: 1, title: 'Orientation', session_date: '2026-07-23', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled' } },
  { file: 'week1-architecture.html', session: { id: 'demo-wk1-mon', session_number: 2, title: 'Week 1: Business Analyst', session_date: '2026-07-27', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled' } },
  { file: 'week1-build.html', session: { id: 'demo-wk1-thu', session_number: 3, title: 'Week 1: Business Analyst', session_date: '2026-07-30', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled' } },
  { file: 'week9-build.html', session: { id: 'demo-wk9-thu', session_number: 19, title: 'Week 9: Reliability', session_date: '2026-09-24', start_time: '18:30:00', end_time: '20:30:00', status: 'scheduled' } },
];

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  for (const s of SAMPLES) {
    const checkinUrl = `https://enterprise.colaberry.ai/portal/class-checkin/${s.session.id}`;
    const qrSvg = await QRCode.toString(checkinUrl, { type: 'svg', margin: 1, width: 240 });
    const spec = buildKitSpec({ session: s.session, cohortName: 'Cohort - July 2026', checkinUrl, qrSvg, meetLink: 'https://meet.google.com/abc-defg-hij' });
    const html = renderKitHtml(spec, { live: { enabled: false } });
    fs.writeFileSync(path.join(OUT, s.file), html, 'utf8');
    // eslint-disable-next-line no-console
    console.log('wrote', path.join(OUT, s.file), `(${html.length} bytes, ${spec.slides.length} slides)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
