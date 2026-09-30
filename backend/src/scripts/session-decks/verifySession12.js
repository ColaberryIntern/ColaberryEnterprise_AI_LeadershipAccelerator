/**
 * verifySession12.js — dry-run placement check for the Session 12 deck override.
 *
 * Runs INSIDE the prod backend container against the compiled dist. Builds the
 * real KitSpec with the candidate config WITHOUT writing anything to the
 * database, then asserts that every authored item is actually placed in the
 * rendered deck.
 *
 * This exists because of the failure mode documented in
 * reference_class_deck_kit_config_override: teachToSlides() filters by segment
 * id, so a slide tagged with a segment that is not a real run-of-show id renders
 * NOWHERE and does so silently. A deck can look fine in the DB and be missing a
 * third of its content on screen. Counting the rows you wrote proves nothing —
 * this asserts the extraction.
 *
 * Usage (inside the container):
 *   node verifySession12.js /tmp/session12.json
 * Exit 0 = every item placed. Exit 1 = something vanished; do not apply.
 */
const fs = require('fs');

const cfgPath = process.argv[2] || '/tmp/session12.json';
const payload = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const sessionId = payload.sessionId;
const candidate = payload.config;

const { buildKitSpec } = require('/app/dist/services/classKit/kitSpecDaySlides');
const { mergeKitConfig } = require('/app/dist/services/classKit/kitConfig');
const { buildSessionKit } = require('/app/dist/services/sessionKitService');

/** Flatten every text field of a slide so we can look for an authored string. */
function slideText(s) {
  return JSON.stringify(s);
}

(async () => {
  const kit = await buildSessionKit(sessionId);
  if (!kit) {
    console.error('FAIL: session not found:', sessionId);
    process.exit(1);
  }

  const config = mergeKitConfig(candidate);
  const spec = buildKitSpec({
    session: kit.session,
    cohortName: kit.cohort_name,
    checkinUrl: kit.checkin_url,
    qrSvg: kit.qr_svg,
    meetLink: kit.meeting_link,
    config,
  });

  const slides = spec.slides || [];
  const blob = slides.map(slideText).join('\n');

  console.log('SESSION :', kit.session.title);
  console.log('DATE    :', kit.session.session_date, '| status:', kit.session.status);
  console.log('SLIDES  :', slides.length, 'rendered');
  console.log('');

  const failures = [];

  // --- every teach slide must appear, by its exact title ---
  const teach = candidate.teach.overrides || [];
  teach.forEach((t) => {
    if (!blob.includes(JSON.stringify(t.title).slice(1, -1))) {
      failures.push('TEACH slide not placed [' + t.segment + '] ' + t.title);
    }
  });

  // --- every story beat must appear ---
  (candidate.storyBeats.overrides || []).forEach((b) => {
    if (!blob.includes(JSON.stringify(b.title).slice(1, -1))) {
      failures.push('STORY BEAT not placed [' + b.segment + '] ' + b.title);
    }
  });

  // --- every interaction must appear, by its question text ---
  (candidate.interactions.overrides || []).forEach((i) => {
    if (!blob.includes(JSON.stringify(i.q).slice(1, -1))) {
      failures.push('INTERACTION not placed [' + i.segment + '] ' + i.q.slice(0, 60));
    }
  });

  // --- opening slots ---
  const co = candidate.opening?.coldOpen?.override;
  if (co && !blob.includes(JSON.stringify(co.title).slice(1, -1))) {
    failures.push('COLD OPEN not placed: ' + co.title);
  }
  const hk = candidate.opening?.hook?.override;
  if (hk && !blob.includes(JSON.stringify(hk.headline).slice(1, -1))) {
    failures.push('HOOK not placed: ' + hk.headline);
  }

  // --- every code block must survive onto its slide ---
  teach.filter((t) => t.code).forEach((t) => {
    const marker = t.code.label;
    if (!blob.includes(JSON.stringify(marker).slice(1, -1))) {
      failures.push('CODE BLOCK not placed: ' + marker);
    }
  });

  // --- report the per-segment shape of what actually rendered ---
  const bySeg = {};
  slides.forEach((s) => {
    const k = s.segmentId || s.segment || '(none)';
    bySeg[k] = (bySeg[k] || 0) + 1;
  });
  console.log('RENDERED BY SEGMENT:');
  Object.entries(bySeg).forEach(([k, v]) => console.log('  ' + k.padEnd(20) + v));
  console.log('');

  console.log('CHECKED: ' + teach.length + ' teach, '
    + (candidate.storyBeats.overrides || []).length + ' beats, '
    + (candidate.interactions.overrides || []).length + ' questions, '
    + teach.filter((t) => t.code).length + ' code blocks');

  if (failures.length) {
    console.error('\n❌ ' + failures.length + ' ITEM(S) VANISHED:');
    failures.forEach((f) => console.error('   - ' + f));
    process.exit(1);
  }
  console.log('\n✅ ALL ITEMS PLACED — safe to apply.');
  process.exit(0);
})().catch((e) => {
  console.error('FAIL:', e && e.message ? e.message : e);
  process.exit(1);
});
