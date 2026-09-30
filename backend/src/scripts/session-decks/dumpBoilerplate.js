/**
 * dumpBoilerplate.js — list the slides in one session that still carry a
 * generated placeholder tip, with enough content to write real commentary for
 * each. Companion to auditClassDecks.js: the audit says HOW MANY, this says
 * WHICH and WHAT THEY SAY.
 *
 * Runs inside the backend container:
 *   node /app/dumpBoilerplate.js <sessionId>
 */
const { buildKitSpec } = require('/app/dist/services/classKit/kitSpecDaySlides');
const { getKitConfig } = require('/app/dist/services/sessionKitConfigService');
const { buildSessionKit } = require('/app/dist/services/sessionKitService');

const BOILERPLATE = [
  'Walk the diagram node by node',
  'Change of pace — tell the story, let it land',
  'Read the question, take responses, reveal when ready',
  'Show the finished result first',
  'Wait for the pulse to catch up before the next checkpoint',
  'Show the finished artifact first',
  'Show the good and the broken',
  'This is the LinkedIn clip',
  'One sentence. Let it land',
  'Open loop. Leave them wanting Build Day',
  'Watch the pulse. If people go',
  'Stretch, questions, individual catch-up',
];

(async () => {
  const sid = process.argv[2];
  const kit = await buildSessionKit(sid);
  const spec = buildKitSpec({
    session: kit.session,
    cohortName: kit.cohort_name,
    checkinUrl: kit.checkin_url,
    qrSvg: kit.qr_svg,
    meetLink: kit.meeting_link,
    config: await getKitConfig(sid),
  });
  console.log('### ' + kit.session.title + '  (' + kit.session.session_date + ')');
  console.log('### ' + spec.slides.length + ' slides / ' + spec.totalMinutes + ' min');
  console.log('');
  spec.slides.forEach((s, i) => {
    const tip = s.presenterTip || '';
    if (!tip.trim() || BOILERPLATE.some((b) => tip.includes(b))) {
      console.log('KEY  ' + s.kind + ':' + s.id + '   [slide ' + (i + 1) + ', segment ' + s.segmentId + ']');
      console.log('  title: ' + (s.title || ''));
      if (s.eyebrow) console.log('  eyebrow: ' + s.eyebrow);
      if (s.body) console.log('  body: ' + String(s.body).slice(0, 260));
      if (s.punch) console.log('  punch: ' + s.punch);
      if (s.bullets && s.bullets.length) console.log('  bullets: ' + s.bullets.slice(0, 3).join(' | ').slice(0, 200));
      console.log('');
    }
  });
  process.exit(0);
})().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
