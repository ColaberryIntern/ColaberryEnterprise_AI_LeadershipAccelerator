#!/usr/bin/env node
/**
 * dumpDeck.js — print the RENDERED slide order for one session.
 *
 * WHY THIS EXISTS
 * The audit grades tags and boilerplate. It does not tell you WHERE a slide
 * lands. `kitSpecDaySlides.ts` builds every segment in the same fixed order —
 * the generated opener, then teach slides (`<seg>-200+i`), then story beats
 * (`<seg>-900+i`), then interactions (`<seg>-950+i`) — so a story beat keyed
 * to a segment always renders AFTER every teach slide in that segment, never
 * between two of them. On 2026-09-21 five presenter notes were written as
 * "right before build 1" / "fires after CP1" and were all wrong on the first
 * apply. The only way to catch that is to read the order back from the
 * database.
 *
 * It also reports which slideNotes keys actually matched a slide. A key that
 * matches nothing is silent: the note simply never appears, and the slide
 * keeps its generated boilerplate.
 *
 * Usage (inside the backend container, from /app so module resolution works):
 *   node /app/dumpDeck.js <sessionId>
 *   node /app/dumpDeck.js <sessionId> --notes    # also print each note
 *
 * Exit 1 if any configured slideNotes key matched no rendered slide.
 */
const { buildKitSpec } = require('/app/dist/services/classKit/kitSpecDaySlides');
const { getKitConfig } = require('/app/dist/services/sessionKitConfigService');
const { buildSessionKit } = require('/app/dist/services/sessionKitService');

/** Placeholder tips the generators ship, reused identically every week. */
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

const isBoilerplate = (tip) => BOILERPLATE.some((b) => String(tip || '').includes(b));

async function main() {
  const sessionId = process.argv[2];
  const withNotes = process.argv.includes('--notes');
  if (!sessionId) {
    console.error('usage: node dumpDeck.js <sessionId> [--notes]');
    process.exit(2);
  }

  const kit = await buildSessionKit(sessionId);
  if (!kit) {
    console.error('session not found: ' + sessionId);
    process.exit(2);
  }
  const config = await getKitConfig(sessionId);
  const spec = buildKitSpec({
    session: kit.session,
    cohortName: kit.cohort_name,
    checkinUrl: kit.checkin_url,
    qrSvg: kit.qr_svg,
    meetLink: kit.meeting_link,
    config,
  });

  const noteKeys = Object.keys((config && config.slideNotes) || {});
  const matched = new Set();

  console.log(`SESSION ${sessionId}`);
  console.log(`TITLE   ${kit.session.title}`);
  console.log(`SLIDES  ${spec.slides.length}`);
  console.log('');
  console.log('  #  kind:id                        say  tip  title');
  console.log('  -  -----------------------------  ---  ---  -----------------------------------------');

  spec.slides.forEach((s, i) => {
    const key = `${s.kind}:${s.id}`;
    if (noteKeys.includes(key)) matched.add(key);
    const tip = s.presenterTip || '';
    const say = String(s.script || '').split('\n').filter((l) => /^SAY:/.test(l.trim())).length;
    // ok = authored commentary; BOIL = generated placeholder; NONE = nothing.
    const tipFlag = !tip.trim() ? 'NONE' : isBoilerplate(tip) ? 'BOIL' : ' ok ';
    console.log(
      `  ${String(i).padStart(2)}  ${key.padEnd(29)}  ${String(say).padStart(3)}  ${tipFlag}  ${String(s.title || '').slice(0, 60)}`,
    );
    if (withNotes && tip.trim()) {
      tip.split('\n').forEach((l) => console.log(`        | ${l}`));
    }
  });

  const orphans = noteKeys.filter((k) => !matched.has(k));
  console.log('');
  console.log(`slideNotes keys: ${noteKeys.length} configured, ${matched.size} matched a rendered slide`);
  if (orphans.length) {
    console.log('ORPHAN KEYS (these notes render NOWHERE):');
    orphans.forEach((k) => console.log('  ' + k));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
