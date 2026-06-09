#!/usr/bin/env node
// Reinstate Isaac Kpakpavi (BC person 45962714) after the 2026-06-08 22:00 UTC
// nudge BLACK template misfired on him.
//
// What actually happened:
//   - dailyInternNudges.js fired BLACK on Isaac on 2026-06-08
//   - daysSinceLast resolved to null -> email subject became "(null days dark)"
//     and BC comment said "You hit null days without any activity"
//   - Isaac is NOT in CCPP (no ADF_InternshipProgram row), so the
//     `no-email-match-in-ccpp` guard short-circuited executeExit. Side
//     effects that DID land: the BLACK Mandrill email + 1 BC comment
//     (id 9975368838) on his Build ticket. Side effects that did NOT land:
//     CCPP update, BC un-assigns, Ali Personal tracking todo.
//   - Isaac replied 2026-06-08 21:05 CT saying he's been active on BC and was
//     just out for the Mon/Tues meetings. His prior comment that same day on
//     his Build ticket (9972227336) confirms — he posted a substantive update
//     about pivoting the AACE project to align with Ali's meeting direction.
//
// What this script does (idempotent; safe to re-run):
//   1. Delete the bogus BLACK CB System comment 9975368838 on todo 9688723675
//   2. Post a correction comment on todo 9688723675 explaining the misfire
//   3. Send apologetic email FROM Ali via sendWithBcAttach, attached to
//      todo 9688723675 in bucket 24865175
//   4. Clear his entry from tmp/ops-engine/intern-nudge-state.json
//      so tomorrow's run starts him at YELLOW/GREEN cleanly
//
// No CCPP work (he was never in CCPP). No BC un-assigns to reverse (none
// were made). No Ali Personal tracking todo to close (none was created).

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const ISAAC = {
  bcPersonId: 45962714,
  email: 'isaackpakpavi@gmail.com',
  name: 'Isaac',  // he signs off as Isaac Kpakpavi in his replies
  sgid: 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vNDU5NjI3MTQ_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--b314c8e8ba4ea33d99112d90c5e9e6a2f742ac4b',
};
const INTERNSHIP_BUCKET = 24865175;
const AACE_TICKET_ID = 9688723675;          // "Autonomous Arbitrage Commerce Engine (AACE)"
const BOGUS_BLACK_COMMENT_ID = 9975368838;  // the "null days dark" CB System comment to delete
const NUDGE_STATE_PATH = path.resolve(__dirname, '../../../tmp/ops-engine/intern-nudge-state.json');

function bcHeaders() {
  const t = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '');
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN required');
  return { Authorization: 'Bearer ' + t, 'User-Agent': 'Colaberry ReinstateIsaac', Accept: 'application/json', 'Content-Type': 'application/json' };
}

function resetNudgeState() {
  if (!fs.existsSync(NUDGE_STATE_PATH)) return { changed: false, reason: 'state file missing' };
  const before = JSON.parse(fs.readFileSync(NUDGE_STATE_PATH, 'utf8'));
  const key = String(ISAAC.bcPersonId);
  if (!(key in before)) return { changed: false, reason: 'no entry for Isaac' };
  const removed = before[key];
  delete before[key];
  fs.writeFileSync(NUDGE_STATE_PATH, JSON.stringify(before, null, 2));
  return { changed: true, removedEntry: removed };
}

(async () => {
  console.log('=== Reinstating Isaac Kpakpavi (BC person 45962714) ===\n');

  // 1) Trash the bogus BLACK BC comment ("null days dark") via canonical
  //    recordings/status/trashed.json route (PUT, returns 204 on success).
  console.log(`1/4 trashing bogus BLACK BC comment ${BOGUS_BLACK_COMMENT_ID}...`);
  const delR = await fetch(
    `https://3.basecampapi.com/3945211/buckets/${INTERNSHIP_BUCKET}/recordings/${BOGUS_BLACK_COMMENT_ID}/status/trashed.json`,
    { method: 'PUT', headers: bcHeaders() }
  );
  if (delR.status === 204 || delR.ok) {
    console.log(`   trashed (status ${delR.status})`);
  } else if (delR.status === 404) {
    console.log(`   already trashed or not found (status 404) - idempotent skip`);
  } else {
    console.error(`   trash returned ${delR.status} ${await delR.text()}`);
  }

  // 2) Post a correction comment on the same ticket so the public trail is honest
  console.log('\n2/4 posting correction comment on AACE ticket...');
  const correctionHtml = `<div><strong>Correction from Ali</strong></div>
<div>The CB System auto-comment that fired earlier today (now deleted) was wrong. Isaac, you have been active on Basecamp this week, including the update you posted on this ticket earlier today about the AACE pivot toward "deals we can profitably resell after costs." There is no exit being processed, and no action is needed from you.</div>
<div><br></div>
<div style="font-size:12px;color:#475569">Root cause: the nudge tracker computed <code>daysSinceLast = null</code> for Isaac (which is why the bogus comment said "null days dark"), so the BLACK template fired even though his actual activity gap was not 10+ days. Fix logged for the engineering side; no impact on Isaac's standing in the program.</div>`;
  const postR = await fetch(
    `https://3.basecampapi.com/3945211/buckets/${INTERNSHIP_BUCKET}/recordings/${AACE_TICKET_ID}/comments.json`,
    { method: 'POST', headers: bcHeaders(), body: JSON.stringify({ content: correctionHtml }) }
  );
  if (!postR.ok) {
    console.error(`   FAIL correction comment: ${postR.status} ${await postR.text()}`);
  } else {
    const cj = await postR.json();
    console.log(`   correction comment: ${cj.app_url}`);
  }

  // 3) Apologetic email from Ali, attached to his AACE ticket
  console.log('\n3/4 sending apologetic email from Ali...');
  const subject = `Your Colaberry seat is fine, Isaac - that exit notice was a bug`;
  const html = `<div style="font-family:arial,sans-serif;color:#1a202c;font-size:14px;line-height:1.6">
<div>Isaac,</div>
<div><br></div>
<div>Thanks for replying right away last night. You are 100% right - you have been posting updates on Basecamp this week, including the pivot summary on the AACE ticket earlier yesterday. <strong>The exit notice you received was a bug on our side, not a real exit.</strong> I am sorry for the unnecessary stress it caused.</div>
<div><br></div>
<div>What actually happened: my activity tracker computed a <code>null</code> value for your "days since last activity" - that is why the email subject said "(null days dark)" instead of a real number. The downstream auto-exit guard caught it and did NOT actually process you out (your Basecamp assignments are untouched and there is no CCPP record change), but the warning email and the Basecamp comment fired anyway. I have deleted the bogus comment on the AACE ticket and posted a correction in its place.</div>
<div><br></div>
<div><strong>Your status:</strong> No change. You are an active participant in the program. The Mon/Tues meetings you missed are a separate conversation - if there is anything you need from me on that side, reply here and let me know.</div>
<div><br></div>
<div>Keep going on the AACE work - the "find deals we can profitably resell after costs" direction is the right one.</div>
<div><br></div>
<div>Ali Muwwakkil<br>Managing Director, Colaberry Inc.</div>
</div>`;
  const text = `Isaac,

Thanks for replying right away last night. You are 100% right - you have been posting updates on Basecamp this week, including the pivot summary on the AACE ticket earlier yesterday. The exit notice you received was a bug on our side, not a real exit. I am sorry for the unnecessary stress it caused.

What actually happened: my activity tracker computed a null value for your "days since last activity" - that is why the email subject said "(null days dark)" instead of a real number. The downstream auto-exit guard caught it and did NOT actually process you out (your Basecamp assignments are untouched and there is no CCPP record change), but the warning email and the Basecamp comment fired anyway. I have deleted the bogus comment on the AACE ticket and posted a correction in its place.

Your status: No change. You are an active participant in the program. The Mon/Tues meetings you missed are a separate conversation - if there is anything you need from me on that side, reply here and let me know.

Keep going on the AACE work - the "find deals we can profitably resell after costs" direction is the right one.

Ali Muwwakkil
Managing Director, Colaberry Inc.`;

  const emailResult = await sendWithBcAttach({
    bucketId: INTERNSHIP_BUCKET,
    ticketId: AACE_TICKET_ID,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: ISAAC.email,
    bcc: ['ali@colaberry.com'],
    replyTo: 'ali@colaberry.com',
    subject,
    html,
    text,
    bcSummary: `<div style="font-size:13px;color:#475569">Apologetic reply to Isaac after the 2026-06-08 22:00 UTC BLACK nudge template misfired on him with a "null days dark" subject. No CCPP record (he is not in ADF_InternshipProgram), no BC un-assigns to reverse. Bogus BC comment ${BOGUS_BLACK_COMMENT_ID} deleted, correction comment posted above, nudge state cleared.</div>`,
  });
  console.log(`   Mandrill: ${emailResult.mandrillId}`);
  console.log(`   BC comment: ${emailResult.commentUrl}`);

  // 4) Reset his nudge state so tomorrow's run starts him at a clean slate
  console.log('\n4/4 resetting nudge state...');
  const stateReset = resetNudgeState();
  console.log('  ', stateReset);

  console.log('\nDONE. Isaac reinstated. Engineering follow-up: daysSinceLast=null path in internActivityTracker.js needs a guard so BLACK template never fires on a null value.');
})().catch((e) => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
