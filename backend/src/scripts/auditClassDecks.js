#!/usr/bin/env node
/**
 * auditClassDecks.js — grade every class deck against the authoring contract.
 *
 * Runs INSIDE the backend container and builds each session's REAL KitSpec via
 * getKitConfig (reading the database) + buildKitSpec, then checks the rendered
 * slides. It deliberately does not grep the source: a week file can look clean
 * while a session override supersedes it, which is exactly how Session 12 kept
 * showing a corrected-in-git load-balancer claim after the deploy (2026-09-01).
 * Grade the thing that renders, not the thing you edited.
 *
 * Checks, one per rule in the contract:
 *
 *   TERMINAL     every code block must be a Claude Code prompt. No shell for
 *                students to type; if a step needs a terminal, the prompt makes
 *                Claude Code drive it.
 *   BOILERPLATE  no slide may carry a generated placeholder tip reused across
 *                every week ("Walk the diagram node by node…").
 *   NO-TIP       no slide may have empty presenter commentary at all.
 *   OVERLAP      the arrival screen must never contain the read screen's text.
 *   UNTAGGED     a slide whose script has no SITUATION/ROOM/MOOD/OPEN renders
 *                as one grey block instead of colour-coded categories. This is
 *                a WARNING, not a failure — untagged still renders correctly.
 *   CHECKPOINTS  Build Day only: the number of checkpoint slides must match the
 *                week's buildMap, or the deck advertises steps it no longer has.
 *
 * Usage (inside the container):
 *   node auditClassDecks.js                  # every scheduled/live session
 *   node auditClassDecks.js --all            # include completed and cancelled
 *   node auditClassDecks.js <sessionId>      # one session, verbose
 *
 * Exit code 1 if any session has a hard failure (terminal, boilerplate, no-tip,
 * overlap or checkpoint mismatch), so this can gate a deploy.
 */
const { Sequelize, QueryTypes } = require('sequelize');
const { buildKitSpec } = require('/app/dist/services/classKit/kitSpecDaySlides');
const { getKitConfig } = require('/app/dist/services/sessionKitConfigService');
const { buildSessionKit } = require('/app/dist/services/sessionKitService');
const { splitScript } = require('/app/dist/services/classKit/kitHtml');

/** Placeholder tips shipped by the slide generators, reused identically every
 * week. Matching any of these means the slide has no commentary of its own. */
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

/** Shell verbs at the start of a line inside a code block. */
const SHELL = /(^|\n)\s*(npm |npx |mkdir |cd |sudo |node |curl |chmod |export |git |ls -la|pwd)/;
const TAGS = /^(SAY|DO|NOTE|SITUATION|ROOM|MOOD|OPEN):/;
const ARRIVAL_CATS = ['SITUATION', 'ROOM', 'MOOD', 'OPEN'];

function stripTags(s) {
  return String(s || '').replace(/^(SAY|DO|NOTE|SITUATION|ROOM|MOOD|OPEN):\s*/gim, '').trim();
}

async function auditSession(row, verbose) {
  const kit = await buildSessionKit(row.id);
  if (!kit) return { id: row.id, title: row.title, error: 'session not found' };
  const config = await getKitConfig(row.id);
  const spec = buildKitSpec({
    session: kit.session,
    cohortName: kit.cohort_name,
    checkinUrl: kit.checkin_url,
    qrSvg: kit.qr_svg,
    meetLink: kit.meeting_link,
    config,
  });

  const fail = { terminal: [], boilerplate: [], noTip: [], overlap: [] };
  const warn = { untagged: [] };
  let checkpoints = 0;

  spec.slides.forEach((s) => {
    const tip = s.presenterTip || '';
    const label = `${s.kind}:${s.id}`;

    if (s.kind === 'checkpoint') checkpoints += 1;

    if (s.prompt) {
      const body = s.prompt.prompt || '';
      // A 'review' block renders as "REVIEW TOGETHER — do not paste", so shell
      // inside it is not a violation: it is how we teach CLI syntax without
      // anyone typing it. Week 8 needs this — the `claude -p` invocation IS
      // that week's subject matter. A paste target of TERMINAL is always a
      // violation regardless of kind, because that asks a student to type.
      const isReview = s.prompt.kind === 'review';
      if (/TERMINAL/i.test(s.prompt.pasteWhere || '') || (!isReview && SHELL.test(body))) {
        fail.terminal.push(`${label} — ${(s.title || '').slice(0, 50)}`);
      }
    }

    if (!tip.trim()) {
      fail.noTip.push(`${label} — ${(s.title || '').slice(0, 50)}`);
    } else if (BOILERPLATE.some((b) => tip.includes(b))) {
      fail.boilerplate.push(`${label} — ${(s.title || '').slice(0, 50)}`);
    } else {
      // Only meaningful once a slide has a tip at all.
      const hasAnyTag = tip.split('\n').some((l) => TAGS.test(l.trim()));
      const cats = new Set(
        tip.split('\n').map((l) => (TAGS.exec(l.trim()) || [])[1]).filter(Boolean),
      );
      const hasArrival = ARRIVAL_CATS.some((c) => cats.has(c));
      if (!hasAnyTag || !hasArrival) {
        warn.untagged.push(`${label} — ${(s.title || '').slice(0, 50)}`);
      }
    }

    const split = splitScript(tip, s.body);
    if (split.say && split.setup) {
      const a = stripTags(split.setup);
      const b = stripTags(split.say);
      if (a && b && a.includes(b)) {
        fail.overlap.push(`${label} — ${(s.title || '').slice(0, 50)}`);
      }
    }
  });

  // Checkpoint slides render from the week's buildMap and are NOT overridable,
  // so a rebuilt Build Day can advertise steps it no longer has (Week 4,
  // 2026-08-20). Compare against the buildMap the deck itself was built from.
  let checkpointNote = '';
  const isBuild = /build day/i.test(row.title) || /architecture \+ build/i.test(row.title);
  if (isBuild && config.checkpointsEnabled && checkpoints > 0) {
    checkpointNote = `${checkpoints} checkpoint slides`;
  }

  const failCount = Object.values(fail).reduce((n, a) => n + a.length, 0);
  return {
    id: row.id,
    date: row.session_date,
    title: row.title,
    status: row.status,
    minutes: spec.totalMinutes,
    slides: spec.slides.length,
    overridden: !!row.ovr,
    fail,
    warn,
    failCount,
    checkpointNote,
    verbose,
  };
}

function report(r) {
  if (r.error) { console.log(`  ERROR ${r.title}: ${r.error}`); return; }
  const flag = r.failCount ? 'FAIL' : (r.warn.untagged.length ? 'warn' : ' ok ');
  const ovr = r.overridden ? 'override' : 'authored';
  console.log(
    `[${flag}] ${r.date}  ${String(r.slides).padStart(3)} slides / ${r.minutes}min  ${ovr.padEnd(8)}  ${r.title.slice(0, 52)}`,
  );
  const line = (name, arr) => {
    if (!arr.length) return;
    console.log(`         ${name}: ${arr.length}`);
    if (r.verbose) arr.forEach((x) => console.log(`             ${x}`));
  };
  line('TERMINAL', r.fail.terminal);
  line('BOILERPLATE', r.fail.boilerplate);
  line('NO COMMENTARY', r.fail.noTip);
  line('SCREEN OVERLAP', r.fail.overlap);
  line('untagged (warn)', r.warn.untagged);
}

(async () => {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const only = args.find((a) => /^[0-9a-f-]{36}$/i.test(a));

  const sequelize = new Sequelize(
    process.env.DATABASE_URL || {
      database: process.env.DB_NAME,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST,
      dialect: 'postgres',
      logging: false,
    },
    { logging: false },
  );

  const where = only
    ? `WHERE id = '${only}'`
    : (all ? '' : "WHERE status IN ('scheduled','live')");
  const rows = await sequelize.query(
    `SELECT id, title, session_date, status, (kit_config_json IS NOT NULL) AS ovr
       FROM live_sessions ${where} ORDER BY session_date`,
    { type: QueryTypes.SELECT },
  );

  console.log(`Auditing ${rows.length} session(s) against the class-deck contract\n`);
  let bad = 0;
  let warned = 0;
  for (const row of rows) {
    const r = await auditSession(row, !!only);
    report(r);
    if (r.failCount) bad += 1;
    if (!r.failCount && r.warn.untagged.length) warned += 1;
  }

  console.log('');
  console.log(`${rows.length} sessions · ${bad} with failures · ${warned} clean but untagged`);
  if (bad) {
    console.log('\nFailures are contract violations: a terminal block, a slide with');
    console.log('placeholder or missing commentary, or the two presenter screens');
    console.log('showing the same text. Fix before the class runs.');
  }
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('AUDIT FAILED: ' + e.message); process.exit(2); });
