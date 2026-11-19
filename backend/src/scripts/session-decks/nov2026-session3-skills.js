/**
 * nov2026-session3-skills.js — Cohort - November 2026, Session 3, Monday
 * 2026-11-23 (moved from Tue 11-24 on 2026-11-19: the weekly live is Mondays), 6:30-7:30 PM CT: "Your Know-How Is Now a Product (Week 2 ·
 * Agent Skills)". A 60-minute TEST class on the generated Class Kit, composed
 * from the plan-live-session blueprint's deckHandoff.
 *
 * WHY THIS EXISTS
 * Ali, 2026-11-19: "use the other skill to build out the class but make it
 * more like nov batch open house as far as presentation but July batch Week
 * 10 classes for the hands on stuff. If they download claude on your phone
 * you can scan the QR code to access the class online and participate. The
 * Test class should be built in the Nov batch as session 3."
 *
 * WHAT IS COMPOSED, NOT TRANSCRIBED
 * The blueprint (docs/live-sessions/2026-11-23-your-know-how-is-now-a-product/
 * blueprint.json, validated VALID, dayKind architecture) already carries a
 * KitConfig-shaped deckHandoff: teach slides, interactions, story beats,
 * opening and slideNotes. This file reads it and layers three things on top:
 *
 *   1. OPEN HOUSE PACING (the Nov 2026 Open House, Oct 29). Phones out in the
 *      first minutes, a question every two or three slides, statement-style
 *      story beats that end on a punch line, and nothing longer than a minute
 *      without the room doing something. The "Phones out" slide tells the room
 *      to download Claude on their phone and scan the QR code to join; the QR
 *      itself is on the cover and in the corner of every slide (Q = full
 *      screen), and it encodes /portal/class-checkin/<session id>.
 *   2. JULY WEEK 10 HANDS-ON (sessions 20 + 21). Every build is a Claude Code
 *      paste prompt with a folder rule (everything inside ./morning-check/,
 *      nothing outside it changes), a ⏱ estimate in the label, # WHY comments
 *      inside the prompt, expectedResult / stopCondition / rescue, and a
 *      from-empty start so a student who was not at the demo machine can still
 *      do it: Build 1 creates the two neighbouring skills the routing test
 *      needs if they are not there. Two live builds; the teardown is a light
 *      prompt.
 *   3. COMMENTARY ON EVERY GENERATED SLIDE, tagged SITUATION / ROOM / MOOD /
 *      OPEN for the arrival screen and SAY for the read screen, including the
 *      node-by-node walk of Week 2's Architecture Story diagram.
 *
 * TITLE CONTRACT
 * The title has "Week 2" (parseWeek) and no "Open House" (that would switch on
 * the openhouse day kind: guest join and draws). A Monday with neither
 * "architecture day" nor "build day" in the title resolves to architecture
 * (detectDayKind's weekday rule), which is the blueprint's dayKind.
 *
 * TEST CLASS: NO STUDENT MAIL
 * The reminder sweep mails every active enrollment 24 h and 1 h before a
 * scheduled session unless reminder_24h_sent_at / reminder_1h_sent_at are set.
 * --create sets both at creation. The lifecycle cron is a separate hazard:
 * 15 min before start it flips status to live (and posts the check-in QR into
 * the session's Commons room), and 30 min after the end it marks it completed,
 * marks every non-attendee absent and sends each of them a missed-session
 * email. There is no per-session flag for that; the status has to leave
 * 'scheduled' before 2026-11-23 18:15 CT (or PR #4229 deployed). See the session log.
 *
 * MODES
 *   node nov2026-session3-skills.js --check            local lint, no DB
 *   node /app/s3.js --preview                           in the container: render the deck for a
 *                                                       synthetic session, run the audit rules,
 *                                                       no DB writes
 *   node /app/s3.js --create [--dry]                    create the session if missing (admin
 *                                                       service path), pre-arm the reminders
 *   node /app/s3.js [--dry]                             save the KitConfig and verify from the DB
 * The blueprint path: --blueprint=<path>, else the repo copy, else
 * /tmp/s3-blueprint.json.
 * Rollback: the BEFORE line printed on every save, or
 *           UPDATE live_sessions SET kit_config_json = NULL WHERE id = <id>.
 */
const fs = require('fs');
const path = require('path');

const COHORT_NAME = 'Cohort - November 2026';
const SESSION = {
  session_number: 3,
  title: 'Your Know-How Is Now a Product (Week 2 · Agent Skills)',
  description: 'Week 2 · Agent Skills. Turn a check you run by hand into a Claude skill that fires from a plain question, break it on purpose, and hand its result to leadership. Bring your phone: polls and questions run on it.',
  session_date: '2026-11-23',
  start_time: '18:30',
  end_time: '19:30',
  session_type: 'core',
  status: 'scheduled',
};
const L = (...lines) => lines.join('\n');
const FOLDER = 'morning-check';

/* ----------------------------------------------------------- blueprint ---- */
function blueprintPath() {
  const arg = process.argv.find((a) => a.startsWith('--blueprint='));
  if (arg) return arg.slice('--blueprint='.length);
  const repo = path.join(__dirname, '../../../../docs/live-sessions/2026-11-23-your-know-how-is-now-a-product/blueprint.json');
  if (fs.existsSync(repo)) return repo;
  return '/tmp/s3-blueprint.json';
}
const BLUEPRINT = JSON.parse(fs.readFileSync(blueprintPath(), 'utf8'));
const H = BLUEPRINT.deckHandoff;
if (!H || !H.session || H.session.dayKind !== 'architecture') {
  throw new Error('blueprint deckHandoff missing or not an Architecture Day handoff');
}
const byTitle = (t) => {
  const s = H.teach.find((x) => x.title === t);
  if (!s) throw new Error('blueprint teach slide not found: ' + t);
  return s;
};

/* ------------------------------------------------- 1. Open House pacing ---- */
// The first thing the room does is get their phone into the class. The QR is
// on the cover and pinned to the corner of every slide; Q puts it full screen.
const PHONES_OUT = {
  segment: 'checkin',
  eyebrow: '📱 Phones out',
  title: 'Download Claude on your phone. Scan the QR code to join the class.',
  body: 'Tonight runs on your phone as well as this screen. Download the Claude app so you have Claude with you after class, then point your camera at the QR code and sign in with the email you enrolled with. The polls, the I’m stuck button and your questions all live on that page.',
  bullets: [
    'Download the Claude app on your phone',
    'Scan the QR code on the screen with your camera',
    'Sign in with the email you enrolled with',
    'The first poll opens in one minute',
  ],
  script: L(
    'SITUATION: Minute three. The cold open has shown the finished BLOCK report; nobody has a phone in the class yet.',
    'ROOM: Press Q so the QR fills the screen while they scan, then Q again to come back. Watch the check-in count on your presenter phone.',
    'MOOD: Light and practical, like the Open House: this is the room joining the show, not admin.',
    'OPEN: Phones out, everybody.',
    'DO: Wait until the check-in count stops climbing before you advance. Do not talk over the scanning.',
    'NOTE: Signing in sends a link to their email, so anyone not already signed in on the phone needs a minute. Tell mentors to help in chat; the roll-call poll is next and it is how you know they made it.',
    'SAY: Download Claude on your phone, then scan the code on the screen.',
    'SAY: Sign in with the email you enrolled with. Every question tonight shows up there, and so does the I’m stuck button.',
  ),
};

/* -------------------------------------------- 2. July Week 10 hands-on ---- */
const FOLDER_RULE = [
  `RULES FOR TONIGHT — read them before you write a file:`,
  `  - Everything lives in ./${FOLDER}/ inside the folder this Claude Code session is open on. Do not create, edit or delete anything outside ./${FOLDER}/.`,
  `  - The data is fictional. Nothing here connects to a real company system.`,
  `  - Run every step yourself. Do not print commands for me to copy and paste.`,
];

const B1 = byTitle('Build 1: data-quality-gate');
const BUILD_1 = {
  ...B1,
  eyebrow: '🛠️ Build 1 · ⏱ 3–4 min',
  code: {
    ...B1.code,
    label: 'Claude Code prompt — Build 1: the data-quality-gate skill (⏱ 3–4 min)',
    code: L(
      ...FOLDER_RULE,
      '',
      `0. If ./${FOLDER}/ does not exist yet, create it. Inside it, make sure two small project skills exist, each in ${FOLDER}/.claude/skills/<name>/SKILL.md with a real one-line description and three short steps:`,
      '     etl-failure-triage — "Use when an ETL or data pipeline run failed or produced invalid data and the cause has to be found."',
      '     csv-summary — "Use when the user wants a quick summary of the columns, row count and value ranges in a CSV file."',
      '   If they are already there, leave them exactly as they are.',
      '   # WHY: a skill has to win against other skills to be picked. Two real neighbours make tonight’s routing test honest.',
      `1. Create a sample-data folder inside ${FOLDER}.`,
      '   # WHY: a sandbox. Nothing in this folder touches a real company system.',
      '2. Generate a fictional orders file for a made-up retailer, about 40 rows: order id, region, revenue amount, load timestamp. Put SAMPLE DATA as the first line. Plant exactly four problems: one duplicate order id, one missing region, one negative revenue amount, and a load timestamp older than 48 hours.',
      '   # WHY: these are the four problems the analyst catches by hand. Planting them means we know the right answer before Claude does.',
      `3. Create a project skill named data-quality-gate at ${FOLDER}/.claude/skills/data-quality-gate/SKILL.md. Description: "Use when the user asks to validate a dataset, CSV, ETL output, query result, or dashboard source before publication." Steps: check freshness, duplicate keys, required fields and unreasonable amounts; give each check PASS, WARN or FAIL with the row that proves it; end with PUBLISH or BLOCK.`,
      '   # WHY: the description says when, the steps say how. The description is the only part Claude reads before deciding to use it.',
      '4. List the skills you can see now, with their descriptions, then stop. I will ask, in my own words and without naming the skill, whether the orders file is safe to publish.',
      '   # WHY: if a skill is not in that list, no question will ever load it. Better to find out now than after the question.',
      'Stop when the report finds all four planted problems and says BLOCK.',
    ),
    rescue: L(
      `If data-quality-gate is not in the list, open Claude Code on the ${FOLDER} folder itself (in VS Code: File, Open Folder, ${FOLDER}) and ask it to list the skills again; project skills load from the folder Claude Code is working in.`,
      'If the report misses a planted problem, ask Claude Code to show the four planted rows and run the skill again.',
    ),
  },
  // July Week 10 rhythm: paste, then ADVANCE while it runs. The deck renders a
  // segment's teach slides before its questions, so the gate slide and the
  // "what makes a skill fire?" check are what the room does while Build 1
  // builds, and the plain question is asked after the reveal.
  script: L(
    'SITUATION: First build of the night; the room has just seen the whole workflow on the Architecture Story.',
    'ROOM: Prompt block on screen. Claude Code open on an empty folder in tab 1; tab 2 has the recorded run.',
    'MOOD: Hands-on and brisk while they paste, unhurried once it is running.',
    'OPEN: Paste this with me, and while it builds, look up here.',
    'DO: Paste it into your own Claude Code at the same moment as the room. Watch the pulse for thirty seconds for anyone whose Claude Code is not open on a folder, then ADVANCE: the next slide and the quick check run while it builds.',
    'NOTE: If it stalls past two minutes, switch to tab 2 and narrate the recording. The plain question comes after the quick check, not now.',
    ...B1.script.split('\n').filter((l) => /^SAY:/.test(l)),
  ),
};
const GATE = {
  ...byTitle('The gate decides before anyone sees it'),
  script: L(
    'SITUATION: Build 1 is running in everyone’s Claude Code. Explain what its report will look like before it lands.',
    'ROOM: The flowchart on screen; Claude Code in tab 1 still working.',
    'MOOD: Teacher, with a little anticipation.',
    'OPEN: Here is what you are about to get back.',
    'DO: Point at the PASS, WARN, FAIL box, then at the PUBLISH or BLOCK split. Ask the room to tap I’m building or I’m stuck.',
    'NOTE: Send mentors to anyone who taps I’m stuck before the teardown starts.',
    ...byTitle('The gate decides before anyone sees it').script.split('\n').filter((l) => /^SAY:/.test(l)),
  ),
};

const TD = byTitle("Break it: 'Helps with data.'");
const TEARDOWN = {
  ...TD,
  eyebrow: '💥 Break it on purpose · light prompt · ⏱ 2 min',
  code: {
    ...TD.code,
    label: 'Claude Code prompt — light: break the description, test it, delete the copy (⏱ 2 min)',
    code: L(
      `Stay inside ./${FOLDER}/ — nothing outside it changes. Run every step yourself; do not print commands for me to copy and paste.`,
      '',
      `1. Make a throwaway copy of data-quality-gate called data-helper, at ${FOLDER}/.claude/skills/data-helper/SKILL.md, with the same steps, but set its description to "Helps with data." Leave data-quality-gate, etl-failure-triage and csv-summary in the skills folder.`,
      '   # WHY: only the trigger changes, so whatever happens next is the description’s doing.',
      '2. Tell me when it is ready and stop. I will ask the same plain question about the orders file.',
      '   # WHY: a slash command proves the steps run; a plain question tests whether Claude can tell when this skill applies.',
      '3. After my question, report which skill loaded, and what in data-helper’s description helped or failed to help it compete.',
      '4. Delete data-helper and list the skills that remain.',
      '   # WHY: a vague skill left in a shared folder is worse than none. It costs every teammate a wrong guess.',
      'Stop when data-helper is gone and data-quality-gate, etl-failure-triage and csv-summary remain.',
    ),
  },
};

const B2 = byTitle('Build 2: executive-dashboard-brief');
const BUILD_2 = {
  ...B2,
  eyebrow: '📣 Build 2 · ⏱ 3 min',
  code: {
    ...B2.code,
    label: 'Claude Code prompt — Build 2: the executive brief skill (⏱ 3 min)',
    code: L(
      `Stay inside ./${FOLDER}/ — nothing outside it changes. Run every step yourself; do not print commands for me to copy and paste.`,
      '',
      `1. Create a second project skill named executive-dashboard-brief at ${FOLDER}/.claude/skills/executive-dashboard-brief/SKILL.md. Description: "Use when a data-quality or incident report must be turned into an update for executives or leadership." Steps: write status, business impact, evidence, decision needed, owner and next update time, in under 150 words, with no SQL and no log lines.`,
      '   # WHY: the technical report is right but written for the wrong reader.',
      '2. Run data-quality-gate on the orders file again, then hand its report to executive-dashboard-brief.',
      '   # WHY: detect, then communicate. Two skills, one workflow.',
      '3. Show me the brief and its word count, then list every skill in the folder with its description.',
      '   # WHY: the list is what your teammates will see. Each line should tell them when to use it without opening the file.',
      'Stop when the brief names the BLOCK decision, an owner and a next-update time in under 150 words.',
    ),
  },
  // Same rhythm as Build 1: the pattern slide, the CFO beat and the brief poll
  // render after this slide, so they run while Build 2 builds.
  script: L(
    'SITUATION: The teardown is done and data-helper is deleted. The incident is not over: leadership is waiting.',
    'ROOM: Prompt block on screen; Claude Code in tab 1 on the same folder.',
    'MOOD: Purposeful, a recovery.',
    'OPEN: The data team has the answer. The CFO still does not.',
    'DO: Paste it with the room, watch the pulse for thirty seconds, then ADVANCE: the pattern, the CFO story and the brief poll run while it builds.',
    'NOTE: After the poll reveal, switch to tab 1 and read the finished brief aloud as if you were the CFO. Ask the room whether they could act on it.',
    ...B2.script.split('\n').filter((l) => /^SAY:/.test(l)),
  ),
};
const PATTERN = {
  ...byTitle('Detect, diagnose, communicate'),
  script: L(
    'SITUATION: Build 2 is running in the background. Give the room the pattern to take home while it works.',
    'ROOM: The three-step flowchart; keep tab 1 one click away.',
    'MOOD: Summing up, confident.',
    'OPEN: Every incident needs three things.',
    'DO: Point at Diagnose and leave it there while you speak.',
    'NOTE: This sets up the build-along, so name it clearly: etl-failure-triage is the middle step, and it is already in the folder.',
    ...byTitle('Detect, diagnose, communicate').script.split('\n').filter((l) => /^SAY:/.test(l)),
  ),
};

/* Teach slides in run order. The phone slide opens the check-in. */
const TEACH = [
  PHONES_OUT,
  byTitle('Know-how is shipping as skills'),
  byTitle('What a skill is'),
  BUILD_1,
  GATE,
  TEARDOWN,
  BUILD_2,
  PATTERN,
];

// The check-in story beat (the 8:05 AM analyst) tells the same incident as the
// hook and the generated business-problem slide right after it, and made five
// slides in a row without a question. Its punch line moves to that slide's
// OPEN, so the Open House cadence (a question every few slides) holds.
const STORY_BEATS = H.storyBeats.filter((b) => b.segment !== 'checkin');
// Presenter tips that said "before Build N runs": with paste-then-advance the
// question is asked while the build runs.
const TIP = {
  architecture: 'Asked while Build 1 finishes. Lock, reveal, then ask the plain question in Claude Code; the build proves the answer.',
  'micro-build': 'Asked while Build 2 runs. Reveal, then switch to Claude Code and read the brief aloud.',
};
const INTERACTIONS = H.interactions.map((q) => (TIP[q.segment] ? { ...q, presenterTip: TIP[q.segment] } : q));
const COLD_OPEN = H.opening.coldOpen;

/* ------------------------------------- 3. commentary on every slide ---- */
// Keyed kind:id where an id is shared (cover + cold-open segment are both
// cold-open-0). Arrival = SITUATION / ROOM / MOOD / OPEN (+ DO / NOTE); the
// read screen is the slide's own body, or these SAY lines where it has none.
const SLIDE_NOTES = {
  'cover:cold-open-0': L(
    'SITUATION: Doors open. This is the November batch’s first class on Agent Skills, and a test run of the 60-minute live format.',
    'ROOM: Cover up with the QR on the right. Claude Code open on an empty folder in tab 1, the recorded run in tab 2. Presenter phone on this page.',
    'MOOD: Open House energy: warm, quick, a show that starts on time.',
    'OPEN: Welcome in. One hour, two builds, and your phone is part of it.',
    'DO: Press Start class the moment you begin, so the pace bar tracks you from here.',
    'SAY: Last week you learned to direct Claude Code. Tonight you stop repeating yourself to it.',
    'SAY: By minute twenty-three you will have taught it a check once, and it will run that check every time someone asks.',
  ),
  'rules:cold-open-1': L(
    'SITUATION: Slide two. The phone controller rules; the Download Claude slide follows the cold open.',
    'ROOM: QR in the corner; press Q if anyone asks for it bigger.',
    'MOOD: Brisk. Thirty seconds, not a lecture.',
    'OPEN: Here is how your phone works tonight.',
    'DO: Point at I’m stuck in the list; that is the button you care about most during the builds.',
    'SAY: When you tap I’m stuck, I see it, and a mentor comes to you in chat. You will never be the only one.',
    'SAY: Hold on to that thought. In two minutes I ask everyone to scan.',
  ),
  'hook:cold-open--1': L(
    'SITUATION: The Week 2 hook: the ETL job says SUCCESS and the revenue number is wrong.',
    'ROOM: Full-screen statement. Nothing else on screen.',
    'MOOD: Quiet. Let the line sit like the Open House statement slides.',
    'OPEN: (Read the headline, then pause for three seconds.)',
    'DO: One sentence, let it land, then move to the finished check.',
    'SAY: A green pipeline proves the job ran. It never proved the data was trustworthy.',
  ),
  'segment:cold-open-0': L(
    'SITUATION: The cold open: show the finished BLOCK report before any theory.',
    'ROOM: Tab 1 has the finished skill ready to ask; tab 2 has the recording if the live ask stalls.',
    'MOOD: Show, do not tell. Confident.',
    'OPEN: Let me show you where we end up tonight.',
    'DO: Ask the plain question live in tab 1: is this orders file safe to publish? Let the report scroll.',
    'NOTE: If it takes more than forty seconds, switch to tab 2 and narrate the recording.',
  ),
  'checkin-950': L(
    'SITUATION: Roll call. This is also the proof that phones made it into the class.',
    'ROOM: The poll is live on every phone; the bars fill on screen.',
    'MOOD: Curious, a little playful. You are meeting the room.',
    'OPEN: Where are you, and what do you check by hand?',
    'DO: Read three answers out loud by name and write two down. They are your hot-seat volunteers at minute forty-one.',
    'NOTE: If fewer than half the room has voted, give it twenty more seconds and press Q again.',
    'SAY: Keep that check in your head. By the end of tonight it has a description.',
  ),
  'bullets:business-problem-0': L(
    'SITUATION: The Week 2 business problem: the 8:05 AM incident, an illustrative scenario from the curriculum, with the four planted problems named.',
    'ROOM: The authored paragraph on screen; it is long, so do not read it.',
    'MOOD: Storyteller, then matter-of-fact.',
    'OPEN: It is 8:05 in the morning, and the analyst who checks these numbers by hand is out today. She should not be the control. The check should.',
    'DO: Say the word illustrative once. Count the four problems on your fingers: duplicate id, missing region, negative amount, stale load. Then move on.',
    'NOTE: Forty seconds here at most. The two announcements are next and they carry the why-now.',
  ),
  'business-problem-900': L(
    'SITUATION: Anthropic’s own steel-shipment example, told as their example, not ours.',
    'ROOM: Story-beat card, amber.',
    'MOOD: Grounded. This is the real world doing what we are about to do.',
    'OPEN: Anthropic used this exact idea in a factory.',
    'DO: Stress the last clause: only after the buyer approves.',
    'SAY: The know-how is packaged. The decision stays hers.',
  ),
  'business-problem-950': L(
    'SITUATION: The judgment-call poll on the green job and the wrong number.',
    'ROOM: Poll live on phones; lock it after about forty seconds.',
    'MOOD: Let them commit. No hints.',
    'OPEN: Your call, before I say anything.',
    'DO: Lock, then reveal. Expect most of the room on validate the output and a loud minority on rerun.',
    'NOTE: Ask one person who chose rerun why. Their answer is the misconception tonight fixes.',
    'SAY: A green pipeline proves that the job ran. It does not prove that the data it produced is trustworthy.',
    'SAY: So the first move is to check the output against what good data looks like. That check is what we are about to write down.',
  ),
  'architecture:architecture-0': L(
    'SITUATION: The Architecture Story: Week 2’s whole system on one diagram. Tonight builds the first box and the last two; the middle one is the build-along.',
    'ROOM: Click the diagram to full screen. Point at each node as you name it.',
    'MOOD: Calm architect. One minute, not twenty: the Build 1 slides carry the detail.',
    'OPEN: Here is the whole workflow, top to bottom.',
    'DO: Walk the nodes in order; pause on the FAIL edge.',
    'SAY: At the top, the orders file and the ETL output. That is the data that just came in overnight, and nobody has looked at it yet.',
    'SAY: It goes straight into data-quality-gate. That is the analyst’s morning check, written down once as a skill. It is Build 1, in a few minutes.',
    'SAY: If the gate says PASS, the data is published to the dashboard and nobody has to think about it.',
    'SAY: If the gate says FAIL, it hands off to etl-failure-triage, which works out why the pipeline produced bad data. That one is your build-along this week.',
    'SAY: Triage hands its findings to executive-dashboard-brief, which turns them into five lines leadership can read. That is Build 2.',
    'SAY: And at the bottom, a person makes one decision: publish or block. Three skills, one incident, and the decision stays with a human.',
  ),
  'architecture-950': L(
    'SITUATION: Quick check while Build 1 finishes: which part makes a skill fire.',
    'ROOM: Trivia live on phones; Claude Code in tab 1 should be saying the skill is ready.',
    'MOOD: Fast. Twenty seconds.',
    'OPEN: While that finishes, a quick guess.',
    'DO: Lock and reveal. Then switch to tab 1 and ask in a colleague’s words: is this orders file safe to publish to the revenue dashboard? Watch which skill loads.',
    'NOTE: Do not explain the answer; the plain question proves it. If the report misses a planted problem, run the rescue from the Build 1 slide.',
    'SAY: Hold on to that answer. You are about to watch it decide.',
  ),
  'example:deconstruct-0': L(
    'SITUATION: The Week 2 deconstruct slide: the working description next to the vague one.',
    'ROOM: Both descriptions on screen; the teardown prompt is the next slide.',
    'MOOD: Playful, setting up a trick.',
    'OPEN: Two descriptions. Same steps underneath.',
    'DO: Read both descriptions aloud, slowly, then go to the teardown.',
    'SAY: Same steps, one sentence different. Watch which one Claude can find.',
  ),
  'deconstruct-950': L(
    'SITUATION: The teardown’s diagnosis question: slash works, plain words do not.',
    'ROOM: Trivia live right after the vague skill was tested.',
    'MOOD: Detective.',
    'OPEN: You just watched it lose. Why?',
    'DO: Lock, reveal, and read the reveal line word for word.',
    'NOTE: If the vague skill fired anyway in the teardown, say so here: it won by luck against the neighbours, and luck is not a control.',
    'SAY: Typing the slash command proves the steps run. A plain question tests whether the description lets Claude recognize when the skill applies.',
    'SAY: When a skill works by name but not by question, read the description first. It is almost always the description.',
  ),
  'break:reset-0': L(
    'SITUATION: The template’s break slide. A 60-minute live has no break.',
    'ROOM: Nothing to show.',
    'MOOD: Keep moving.',
    'OPEN: (No words. Advance.)',
    'DO: Arrow straight past it.',
    'NOTE: It renders only because the Architecture Day run-of-show carries a reset segment.',
  ),
  'microbuild:micro-build-0': L(
    'SITUATION: The Week 2 micro-build slide names the two skills that finish the incident: triage and the brief.',
    'ROOM: Paragraph on screen; Build 2 is the next slide.',
    'MOOD: Turning the corner from detect to communicate.',
    'OPEN: The gate stopped the bleeding. Now leadership needs an answer it can act on.',
    'DO: Say that etl-failure-triage is already in the folder and is this week’s build-along, then go to Build 2.',
    'NOTE: Skip the paragraph; it is the plan for the whole week, and tonight builds only the brief.',
  ),
  'micro-build-900': L(
    'SITUATION: The CFO story beat, told while Build 2 runs.',
    'ROOM: Story-beat card, berry. Claude Code in tab 1 still building the brief.',
    'MOOD: Slight pressure: a board call in an hour.',
    'OPEN: Meanwhile, upstairs.',
    'DO: Pause before the punch line.',
    'SAY: A technically correct answer can still be the wrong communication product.',
  ),
  'micro-build-950': L(
    'SITUATION: What belongs in the executive update, asked while Build 2 finishes.',
    'ROOM: Poll live on phones; the finished brief is waiting in tab 1.',
    'MOOD: Quick consensus.',
    'OPEN: The CFO has five minutes. What goes in?',
    'DO: Take responses, reveal, then switch to tab 1 and read the brief aloud as if you were the CFO.',
    'SAY: Status, impact, evidence, decision, owner, next update. That list is the skill’s steps.',
  ),
  'challenge-950': L(
    'SITUATION: The hot seat: two volunteers, their own checks, no real data on screen.',
    'ROOM: The self-check poll; a blank skill card (name, when, steps, output, never-do) in a text editor next to it.',
    'MOOD: Generous. The volunteers are the stars, like the Open House live questions.',
    'OPEN: Who has a check that would stop if you were out tomorrow?',
    'DO: Pick volunteers from the last two options and the names you wrote down at roll call. Fill the skill card with each one.',
    'NOTE: Ask everyone else to answer in chat while the volunteers are on. Never put a volunteer’s real company data on screen.',
    'SAY: Tell me the check, and the words a colleague would use to ask for it. I will write its description with you.',
  ),
  'trivia-950': L(
    'SITUATION: Knowledge check on allowed-tools. The expendable slide if time is short.',
    'ROOM: Trivia live.',
    'MOOD: Precise.',
    'OPEN: One detail people get wrong.',
    'DO: If you are past minute fifty-two, skip it. Otherwise lock and read the reveal exactly as written.',
    'SAY: Pre-approving a tool is not the same as restricting the skill to it.',
  ),
  'trivia-951': L(
    'SITUATION: The closing self-check: from I watched to I could build it from memory.',
    'ROOM: Poll live; the close is the next slide.',
    'MOOD: Honest. No right answer.',
    'OPEN: Be honest with yourself for a second.',
    'DO: Read the spread out loud without judging it.',
    'SAY: If you said I watched, start with instruction one tonight. With the three instructions is exactly where this week wants you.',
  ),
  'cta:trailer-0': L(
    // The card's title, eyebrow and paragraph are generated from Week 2's
    // authored Thursday trailer and cannot be overridden without a deploy; the
    // paragraph is also the phone's read screen. So the correction lives here.
    'SITUATION: The template’s trailer card says Thursday we make it work. There is no Thursday class: the weekly live is Mondays, and the next one is Monday, November 30, Week 3. Tonight this card is the close and the open loop.',
    'ROOM: Trailer card. Stop sharing tabs; this is face to camera. Do not read the card’s Thursday line aloud.',
    'MOOD: Warm finish, like the Open House close: thank them, then one clear ask.',
    'OPEN: Here is your week, and I will see you next Monday.',
    'DO: Say the build-along proof line, then: next Monday, November 30, is Week 3, Build Your First AI Workflow Assistant. Ask the 2 AM question, then stop talking.',
    'SAY: Rebuild all three skills on sample data, including the diagnosis one that sat prepared in the folder. Prove each fires from a plain question.',
    'SAY: Next Monday, November 30, is Week 3: Build Your First AI Workflow Assistant. Tonight it ran a check you wrote once, and it still waited for you to decide.',
  ),
};

/* --------------------------------------------------------------- config ---- */
function buildConfig(before) {
  const b = before && typeof before === 'object' ? before : {};
  return {
    ...b,
    customDeck: null,
    theaterEnabled: true,
    buildBayDetail: true,
    checkpointsEnabled: false,
    evidenceOverrides: null,
    teach: { enabled: true, max: null, overrides: TEACH },
    storyBeats: { enabled: true, max: null, overrides: STORY_BEATS },
    interactions: { enabled: true, max: null, overrides: INTERACTIONS },
    prompts: { enabled: true, max: null, overrides: null },
    opening: {
      coldOpen: { enabled: true, override: COLD_OPEN },
      hook: { enabled: true, override: null },
      resultPreview: { enabled: true, override: null },
    },
    slideNotes: SLIDE_NOTES,
  };
}

/* ----------------------------------------------------------------- lint ---- */
const TAGS = /^(SAY|DO|NOTE|SITUATION|ROOM|MOOD|OPEN):/;
const ARRIVAL = ['SITUATION', 'ROOM', 'MOOD', 'OPEN'];
const SHELL_LINE = /(^|\n)\s*(npm |npx |mkdir |cd |sudo |curl |chmod |git |ls -la|touch |pwd\b|node )/;
const ARCH_SEGMENTS = ['cold-open', 'checkin', 'business-problem', 'architecture', 'deconstruct', 'reset', 'micro-build', 'challenge', 'trivia', 'trailer'];
// Segments whose teach slides the Architecture Day generator actually renders.
const TEACH_SEGMENTS = ['checkin', 'business-problem', 'architecture', 'deconstruct', 'micro-build'];
const BANNED = new RegExp('\\b(fr' + 'ee|guarant' + 'eed?)\\b', 'i');

function lintTagged(label, text) {
  const bad = [];
  const lines = String(text || '').split('\n').filter(Boolean);
  if (!lines.length) bad.push(label + ': empty');
  const cats = new Set(lines.map((l) => (TAGS.exec(l.trim()) || [])[1]).filter(Boolean));
  if (lines.some((l) => !TAGS.test(l.trim()))) bad.push(label + ': untagged line');
  ARRIVAL.forEach((c) => { if (!cats.has(c)) bad.push(label + ': missing ' + c); });
  return bad;
}

function lint() {
  const bad = [];
  const everything = [];
  TEACH.forEach((s, i) => {
    const label = `teach[${i}] "${s.title.slice(0, 40)}"`;
    if (!TEACH_SEGMENTS.includes(s.segment)) bad.push(label + ': segment renders nowhere on Architecture Day');
    if (!s.eyebrow || !s.title || !s.body) bad.push(label + ': missing eyebrow/title/body');
    bad.push(...lintTagged(label + ' script', s.script));
    if (s.code) {
      if (s.code.kind !== 'paste') bad.push(label + ': code block is not a paste prompt');
      if (!/Claude Code/i.test(s.code.pasteWhere || '')) bad.push(label + ': pasteWhere is not Claude Code');
      if (/TERMINAL/i.test(s.code.pasteWhere || '') || SHELL_LINE.test(s.code.code || '')) bad.push(label + ': terminal-shaped code block');
      ['expectedResult', 'stopCondition', 'rescue', 'label'].forEach((k) => { if (!s.code[k]) bad.push(label + ': code missing ' + k); });
      if (!s.code.code.includes(`./${FOLDER}/`)) bad.push(label + ': prompt does not state the folder rule');
      if (!/do not print commands/i.test(s.code.code)) bad.push(label + ': prompt does not tell Claude Code to run the steps itself');
      if (!/# WHY:/.test(s.code.code)) bad.push(label + ': prompt teaches nothing (no # WHY)');
      if (!/⏱/.test(s.eyebrow) || !/⏱/.test(s.code.label)) bad.push(label + ': build slide without a ⏱ estimate');
      everything.push(s.code.code, s.code.expectedResult, s.code.stopCondition, s.code.rescue, s.code.label);
    }
    everything.push(s.title, s.body, s.script, ...(s.bullets || []));
  });
  STORY_BEATS.forEach((b, i) => {
    if (!TEACH_SEGMENTS.includes(b.segment)) bad.push(`storyBeat[${i}]: segment renders nowhere`);
    ['icon', 'eyebrow', 'title', 'body', 'punch', 'tone'].forEach((k) => { if (!b[k]) bad.push(`storyBeat[${i}]: missing ${k}`); });
    everything.push(b.title, b.body, b.punch);
  });
  INTERACTIONS.forEach((q, i) => {
    const label = `interaction[${i}] "${q.q.slice(0, 40)}"`;
    if (!ARCH_SEGMENTS.includes(q.segment)) bad.push(label + ': bad segment');
    if (!Array.isArray(q.options) || q.options.length !== 4) bad.push(label + ': needs exactly 4 options');
    if (q.kind === 'trivia' && typeof q.answer !== 'number') bad.push(label + ': trivia needs an answer');
    if (!q.reveal) bad.push(label + ': no reveal');
    everything.push(q.q, q.reveal, ...q.options);
  });
  Object.entries(SLIDE_NOTES).forEach(([k, v]) => {
    bad.push(...lintTagged('slideNote ' + k, v));
    everything.push(v);
  });
  const archSay = (SLIDE_NOTES['architecture:architecture-0'] || '').split('\n').filter((l) => /^SAY:/.test(l));
  if (archSay.length < 5) bad.push('architecture:architecture-0 needs a node-by-node SAY walk (has ' + archSay.length + ')');
  everything.push(COLD_OPEN.title, COLD_OPEN.body);
  everything.filter(Boolean).forEach((t) => { const m = BANNED.exec(t); if (m) bad.push(`TWC banned word "${m[0]}" in: ${String(t).slice(0, 60)}`); });
  if (!/Download Claude/i.test(PHONES_OUT.title) || !/QR/.test(PHONES_OUT.title)) bad.push('phones-out slide must say download Claude + scan the QR');
  if (/open house/i.test(SESSION.title)) bad.push('title contains "Open House": would switch on the openhouse day kind');
  if (!/week\s+2\b/i.test(SESSION.title)) bad.push('title must contain "Week 2" for parseWeek');
  const builds = TEACH.filter((s) => s.code && /^Claude Code prompt — Build/.test(s.code.label)).length;
  if (builds > 2) bad.push(`${builds} live builds; at most 2`);
  return bad;
}

function summary() {
  const prose = TEACH.reduce((n, s) => n + (s.body || '').length, 0);
  return `teach=${TEACH.length} prompts=${TEACH.filter((s) => s.code).length} builds=${TEACH.filter((s) => s.code && /— Build/.test(s.code.label)).length} `
    + `bodyProse=${prose} storyBeats=${STORY_BEATS.length} interactions=${INTERACTIONS.length} slideNotes=${Object.keys(SLIDE_NOTES).length}`;
}

module.exports = { COHORT_NAME, SESSION, TEACH, STORY_BEATS, INTERACTIONS, SLIDE_NOTES, buildConfig, lint, summary };

/* ------------------------------------------------------- audit (render) ---- */
// The same rules as auditClassDecks.js, applied to a rendered spec, so
// --preview grades the deck before any row exists.
const BOILERPLATE = [
  'Walk the diagram node by node', 'Change of pace — tell the story, let it land', 'Read the question, take responses, reveal when ready',
  'Show the finished result first', 'Wait for the pulse to catch up before the next checkpoint', 'Show the finished artifact first',
  'Show the good and the broken', 'This is the LinkedIn clip', 'One sentence. Let it land', 'Open loop. Leave them wanting Build Day',
  'Watch the pulse. If people go', 'Stretch, questions, individual catch-up',
];
const AUDIT_SHELL = /(^|\n)\s*(npm |npx |mkdir |cd |sudo |curl |chmod |git |ls -la|touch |pwd\b)/;
function auditSpec(spec, splitScript) {
  const strip = (s) => String(s || '').replace(/^(SAY|DO|NOTE|SITUATION|ROOM|MOOD|OPEN):\s*/gim, '').trim();
  const fail = [];
  const warn = [];
  spec.slides.forEach((s, i) => {
    const tip = s.presenterTip || '';
    const label = `#${i + 1} ${s.kind}:${s.id} ${String(s.title || '').slice(0, 50)}`;
    if (s.prompt && (/TERMINAL/i.test(s.prompt.pasteWhere || '') || (s.prompt.kind !== 'review' && AUDIT_SHELL.test(s.prompt.prompt || '')))) fail.push('TERMINAL ' + label);
    if (s.prompt && s.prompt.kind === 'review') fail.push('REVIEW ' + label);
    if (!tip.trim()) fail.push('NO-TIP ' + label);
    else if (BOILERPLATE.some((b) => tip.includes(b))) fail.push('BOILERPLATE ' + label);
    else {
      const cats = new Set(tip.split('\n').map((l) => (TAGS.exec(l.trim()) || [])[1]).filter(Boolean));
      if (!ARRIVAL.some((c) => cats.has(c))) warn.push('UNTAGGED ' + label);
    }
    const sp = splitScript(tip, s.body);
    if (sp.say && sp.setup && strip(sp.setup).includes(strip(sp.say))) fail.push('OVERLAP ' + label);
  });
  return { fail, warn };
}

function describe(spec, splitScript) {
  let since = 0;
  let maxGap = 0;
  const rows = spec.slides.map((s, i) => {
    const q = s.interaction || s.question;
    // Open House cadence: count slides between questions; the break slide is
    // arrowed past in a 60-minute live, so it does not count.
    if (q || s.kind === 'interaction') since = 0; else if (s.kind !== 'break') maxGap = Math.max(maxGap, ++since);
    const sp = splitScript(s.presenterTip, s.body);
    return `${String(i + 1).padStart(2)} ${String(s.segStartMin).padStart(3)}m ${s.kind.padEnd(12)} ${s.id.padEnd(22)} ${String(s.title || '').slice(0, 56)}`
      + `${s.prompt ? ` [PROMPT ${s.prompt.kind}]` : ''}  (arrival ${sp.setup.length}c / read ${sp.say.length}c)`;
  });
  return { rows, maxGap };
}

/* ---------------------------------------------------------------- main ---- */
if (require.main === module) {
  const dry = process.argv.includes('--dry');
  const problems = lint();
  if (problems.length) { console.error('LINT FAIL\n  ' + problems.join('\n  ')); process.exit(1); }
  console.error('LINT OK  ' + summary());
  if (process.argv.includes('--check')) {
    const json = JSON.stringify(buildConfig(null));
    console.error(`CHECK OK  ${json.length} bytes`);
    process.exit(0);
  }

  const { buildKitSpec } = require('/app/dist/services/classKit/kitSpecDaySlides');
  const { splitScript } = require('/app/dist/services/classKit/kitHtml');
  const { mergeKitConfig } = require('/app/dist/services/classKit/kitConfig');

  if (process.argv.includes('--preview')) {
    const fake = { id: '00000000-0000-4000-8000-000000000003', ...SESSION };
    const spec = buildKitSpec({
      session: fake, cohortName: COHORT_NAME, checkinUrl: 'https://enterprise.colaberry.ai/portal/class-checkin/' + fake.id,
      qrSvg: '<svg></svg>', meetLink: null, config: mergeKitConfig(buildConfig(null)),
    });
    const { rows, maxGap } = describe(spec, splitScript);
    console.log(`PREVIEW dayKind=${spec.meta.dayKind} week=${spec.meta.week} title="${spec.meta.title}" minutes=${spec.totalMinutes} slides=${spec.slides.length} longestRunWithoutQuestion=${maxGap}`);
    rows.forEach((r) => console.log('  ' + r));
    const a = auditSpec(spec, splitScript);
    console.log(`AUDIT failures=${a.fail.length} warnings=${a.warn.length}`);
    a.fail.concat(a.warn).forEach((x) => console.log('  ' + x));
    // The deck ▶ Present would serve, rendered offline (live off).
    const { renderKitHtml } = require('/app/dist/services/classKit/kitHtml');
    const html = renderKitHtml(spec, { live: { enabled: false } });
    console.log(`RENDER html=${html.length}B paste-prompts=${spec.slides.filter((s) => s.prompt && s.prompt.kind === 'paste').length}`);
    if (process.argv.includes('--dump')) {
      fs.writeFileSync('/tmp/s3-spec.json', JSON.stringify(spec, null, 1));
      fs.writeFileSync('/tmp/s3-deck.html', html);
    }
    process.exit(a.fail.length ? 1 : 0);
  }

  const { Op } = require('sequelize');
  const { Cohort, LiveSession } = require('/app/dist/models');

  (async () => {
    const cohort = await Cohort.findOne({ where: { name: COHORT_NAME } });
    if (!cohort) throw new Error('cohort not found: ' + COHORT_NAME);
    let session = await LiveSession.findOne({ where: { cohort_id: cohort.id, title: SESSION.title } });

    if (process.argv.includes('--create')) {
      if (session) { console.error(`EXISTS id=${session.id} #${session.session_number}`); process.exit(0); }
      const clash = await LiveSession.findOne({ where: { cohort_id: cohort.id, session_number: SESSION.session_number } });
      if (clash) throw new Error(`session_number ${SESSION.session_number} already used by "${clash.title}"`);
      if (dry) { console.error('DRY: would create ' + JSON.stringify(SESSION)); process.exit(0); }
      // The admin "Add Session" path: acceleratorService.createSession (room
      // provisioning included), live_enabled false as the form defaults it.
      const { createSession } = require('/app/dist/services/acceleratorService');
      session = await createSession({ cohort_id: cohort.id, ...SESSION }, { liveEnabled: false });
      // TEST CLASS: arm both reminder markers so the 24 h / 1 h sweep never
      // mails the cohort for this session (schedulerService SessionReminders).
      await session.update({ reminder_24h_sent_at: new Date(), reminder_1h_sent_at: new Date() });
      // The admin page's "Generate meet link" button, same service.
      const { ensureSessionMeetLink } = require('/app/dist/services/meetingService');
      const link = await ensureSessionMeetLink(session).catch(() => null);
      const fresh = await LiveSession.findByPk(session.id);
      console.error(`CREATED id=${fresh.id} #${fresh.session_number} ${fresh.session_date} ${fresh.start_time}-${fresh.end_time} `
        + `status=${fresh.status} meet=${link ? 'yes' : 'no'} reminders_armed=${!!fresh.reminder_24h_sent_at && !!fresh.reminder_1h_sent_at}`);
      process.exit(0);
    }

    if (!session) throw new Error('session not found; run --create first');
    const { getKitConfig, saveKitConfig } = require('/app/dist/services/sessionKitConfigService');
    const before = await getKitConfig(session.id);
    console.log('BEFORE ' + JSON.stringify(before).slice(0, 4000));
    if (dry) { console.error('DRY RUN — not saving. ' + summary()); process.exit(0); }
    await saveKitConfig(session.id, buildConfig(null));

    // Verify from the database, not from the object in memory.
    const after = await getKitConfig(session.id);
    const saved = (after.teach && after.teach.overrides) || [];
    const shared = saved.filter((s) => { const sp = splitScript(s.script, s.body); return sp.setup && sp.say && sp.setup.includes(sp.say); });
    const nonPrompt = saved.filter((s) => s.code && s.code.kind !== 'paste');
    console.error(`SAVED id=${session.id} teach=${saved.length} codeBlocks=${saved.filter((s) => s.code).length} nonPrompt=${nonPrompt.length} `
      + `screensShareText=${shared.length} storyBeats=${(after.storyBeats.overrides || []).length} interactions=${(after.interactions.overrides || []).length} `
      + `slideNotes=${Object.keys(after.slideNotes || {}).length} customDeck=${after.customDeck ? 'SET' : 'none'}`);
    const ok = saved.length === TEACH.length && !shared.length && !nonPrompt.length
      && (after.interactions.overrides || []).length === INTERACTIONS.length && !after.customDeck;
    process.exit(ok ? 0 : 1);
  })().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
}
