/**
 * applyWeekNotes.js — apply a week's slideNotes to its sessions, and prove it.
 *
 * Takes a notes module exporting { sessions: [{ id, label, slideNotes }] },
 * merges each session's notes into its existing KitConfig, saves, then rebuilds
 * the deck FROM THE DATABASE and reports what is left. Reading back is the
 * point: a saved key that matches no slide id is a silent no-op, and counting
 * the rows you wrote would not catch it.
 *
 * Runs inside the backend container:
 *   node /app/applyWeekNotes.js /app/week8-notes.js
 */
const { buildKitSpec } = require('/app/dist/services/classKit/kitSpecDaySlides');
const { getKitConfig, saveKitConfig } = require('/app/dist/services/sessionKitConfigService');
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
const TAGS = /^(SAY|DO|NOTE|SITUATION|ROOM|MOOD|OPEN):/;
const ARRIVAL = ['SITUATION', 'ROOM', 'MOOD', 'OPEN'];

async function specFor(sid) {
  const kit = await buildSessionKit(sid);
  const config = await getKitConfig(sid);
  return {
    config,
    spec: buildKitSpec({
      session: kit.session,
      cohortName: kit.cohort_name,
      checkinUrl: kit.checkin_url,
      qrSvg: kit.qr_svg,
      meetLink: kit.meeting_link,
      config,
    }),
  };
}

(async () => {
  const mod = require(process.argv[2]);
  let problems = 0;

  for (const s of mod.sessions) {
    // Every note must be authored to the contract before it goes anywhere.
    const badNotes = Object.entries(s.slideNotes).filter(([, v]) => {
      const lines = String(v).split('\n').filter(Boolean);
      const cats = new Set(lines.map((l) => (TAGS.exec(l.trim()) || [])[1]).filter(Boolean));
      return lines.some((l) => !TAGS.test(l.trim())) || !ARRIVAL.every((c) => cats.has(c));
    });
    if (badNotes.length) {
      console.log(`${s.label}: ${badNotes.length} note(s) untagged or missing an arrival category`);
      badNotes.forEach(([k]) => console.log(`    ${k}`));
      problems += 1;
      continue;
    }

    // Confirm every key actually matches a slide BEFORE saving, so a typo is a
    // loud failure rather than a note that renders nowhere.
    const before = await specFor(s.id);
    const ids = new Set(before.spec.slides.map((x) => `${x.kind}:${x.id}`));
    const orphans = Object.keys(s.slideNotes).filter((k) => !ids.has(k));
    if (orphans.length) {
      console.log(`${s.label}: ${orphans.length} key(s) match no slide — would render nowhere`);
      orphans.forEach((k) => console.log(`    ${k}`));
      problems += 1;
      continue;
    }

    const merged = { ...before.config, slideNotes: { ...(before.config.slideNotes || {}), ...s.slideNotes } };
    await saveKitConfig(s.id, merged);

    const after = await specFor(s.id);
    let boiler = 0;
    let noTip = 0;
    after.spec.slides.forEach((x) => {
      const t = x.presenterTip || '';
      if (!t.trim()) noTip += 1;
      else if (BOILERPLATE.some((b) => t.includes(b))) boiler += 1;
    });
    const ok = boiler === 0 && noTip === 0;
    if (!ok) problems += 1;
    console.log(
      `${ok ? ' ok ' : 'FAIL'}  ${s.label}: ${after.spec.slides.length} slides, `
      + `${Object.keys(s.slideNotes).length} notes applied, boilerplate=${boiler} noCommentary=${noTip}`,
    );
  }

  console.log(problems ? `\n${problems} session(s) need attention` : '\nAll sessions clean.');
  process.exit(problems ? 1 : 0);
})().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
