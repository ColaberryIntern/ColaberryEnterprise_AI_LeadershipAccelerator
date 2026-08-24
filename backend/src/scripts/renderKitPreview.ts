/**
 * renderKitPreview.ts — render any week/day's Class Kit deck to a local HTML
 * file, with no DB and no server.
 *
 * The deck is normally only reachable by pressing "Present" against the running
 * production backend, which makes a content change impossible to eyeball before
 * it is deployed in front of a live class. buildKitSpec/renderKitHtml are pure,
 * so the same deck can be produced offline from the authored week data alone.
 *
 * Usage:  ts-node src/scripts/renderKitPreview.ts <week> <monday|thursday> [outfile]
 *
 * Renders from the authored week pack only — a session that carries a
 * kit_config_json override in the database will NOT match this preview.
 */
import fs from 'fs';
import path from 'path';
import { buildKitSpec } from '../services/classKit/kitSpecDaySlides';
import { renderKitHtml } from '../services/classKit/kitHtml';

const WEEK = parseInt(process.argv[2] || '5', 10);
const DAY = (process.argv[3] || 'monday').toLowerCase() === 'thursday' ? 'thursday' : 'monday';
const OUT = process.argv[4] || path.join(process.cwd(), `week${WEEK}-${DAY}-preview.html`);

// detectDayKind reads the title, and the run of show is scaled from the times —
// so a synthetic session with the real title and the real 2-hour window produces
// the same slide list the live "Present" button would.
const DAY_LABEL = DAY === 'thursday' ? 'Build Day' : 'Architecture Day';

const spec = buildKitSpec({
  session: {
    id: `preview-week-${WEEK}-${DAY}`,
    session_number: 0,
    title: `Week ${WEEK} · ${DAY_LABEL} — preview`,
    session_date: DAY === 'thursday' ? '2026-08-27' : '2026-08-24',
    start_time: '18:30',
    end_time: '20:30',
    status: 'scheduled',
  },
  cohortName: 'Preview cohort',
  checkinUrl: 'https://enterprise.colaberry.ai/portal/class',
  qrSvg: '',
  meetLink: null,
});

const html = renderKitHtml(spec);
fs.writeFileSync(OUT, html, 'utf8');

const teach = spec.slides.filter((s) => s.kind === 'teach');
const withDefs = teach.filter((s) => s.definitions && s.definitions.length);
const prompts = teach.filter((s) => s.prompt);
const reviews = prompts.filter((s) => s.prompt && s.prompt.kind === 'review');

console.log('wrote %s (%d KB)', OUT, Math.round(html.length / 1024));
console.log('slides total       : %d', spec.slides.length);
console.log('teach slides       : %d', teach.length);
console.log('with definitions   : %d', withDefs.length);
console.log('with a prompt      : %d', prompts.length);
console.log('still read-only    : %d', reviews.length);
console.log('carrying MY PROJECT: %d', prompts.filter((s) => (s.prompt!.prompt || '').indexOf('MY PROJECT') >= 0).length);
console.log('---');
teach.forEach((s) => {
  const bits = [
    s.definitions && s.definitions.length ? 'DEF:' + s.definitions.length : '',
    s.prompt ? (s.prompt.kind === 'review' ? 'REVIEW' : 'PROMPT') : '',
  ].filter(Boolean).join(' ');
  console.log('  [%s] %s %s', s.segmentId, s.title.slice(0, 62), bits ? '(' + bits + ')' : '');
});
