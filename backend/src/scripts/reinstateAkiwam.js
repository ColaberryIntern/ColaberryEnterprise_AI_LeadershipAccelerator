#!/usr/bin/env node
// Reinstate Akiwam (InternID 263) after the 2026-06-08 22:00 UTC auto-exit.
//
// The daily intern nudge cycle fired BLACK on her ~5 hours after her first
// onboarding todo was assigned. Root cause: her earliest BC assignment was
// the LinkedIn Building Custom GPT todo (9451187103) created weeks ago when
// she was a candidate, so the grace-period guard in internActivityTracker.js
// didn't classify her as a new intern. Ali flagged the auto-exit was wrong —
// she's part of the new Federal Contract program — and asked to reinstate.
//
// What this script does (idempotent; safe to re-run):
//   1. CCPP: InternIsActive 0 -> 1, InternEndDate -> NULL, InternCancelReasonID -> NULL
//      (via lib/internReinstate.executeReinstate)
//   2. Basecamp: re-assigns Akiwam to the 2 todos un-assigned at exit
//      (9973935267 build, 9451187103 LinkedIn GPT)
//   3. Nudge state: deletes her entry from tmp/ops-engine/intern-nudge-state.json
//      so tomorrow's run starts her fresh
//   4. Apologetic email FROM Ali (not CB System) via sendWithBcAttach,
//      attached to her Internship Build ticket 9973935267
//   5. Closure comment on the auto-exit tracking todo in Ali Personal
//      (9975369307), marking it complete

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { executeReinstate } = require(path.resolve(__dirname, './lib/internReinstate'));
const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const AKIWAM = {
  internId: 263,
  bcPersonId: 33056069,
  email: 'akiwam.aps@gmail.com',
  name: 'Akiwam',
  sgid: 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMzMwNTYwNjk_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--9c5e5aeb0998f2e3997da0d1a585fadb3f4a2abb',
};
const INTERNSHIP_BUCKET = 24865175;
const ALI_PERSONAL_BUCKET = 7463955;
const BUILD_TICKET_ID = 9973935267;        // "Akiwam - Colaberry Internship Build"
const LINKEDIN_TICKET_ID = 9451187103;     // "LinkedIn Building Custom GPT"
const NOTIFY_TODO_ID = 9975369307;         // auto-exit tracking todo in Ali Personal
const NUDGE_STATE_PATH = path.resolve(__dirname, '../../../tmp/ops-engine/intern-nudge-state.json');

function bcHeaders() {
  const t = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '');
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN required');
  return { Authorization: 'Bearer ' + t, 'User-Agent': 'Colaberry ReinstateAkiwam', Accept: 'application/json', 'Content-Type': 'application/json' };
}

function mention(sgid) {
  return `<bc-attachment sgid="${sgid}" content-type="application/vnd.basecamp.mention"></bc-attachment>`;
}

function resetNudgeState() {
  if (!fs.existsSync(NUDGE_STATE_PATH)) return { changed: false, reason: 'state file missing' };
  const before = JSON.parse(fs.readFileSync(NUDGE_STATE_PATH, 'utf8'));
  const key = String(AKIWAM.bcPersonId);
  if (!(key in before)) return { changed: false, reason: 'no entry for Akiwam' };
  const removed = before[key];
  delete before[key];
  fs.writeFileSync(NUDGE_STATE_PATH, JSON.stringify(before, null, 2));
  return { changed: true, removedEntry: removed };
}

(async () => {
  console.log('=== Reinstating Akiwam (InternID 263) ===\n');

  // 1) CCPP reactivate + BC re-assign
  console.log('1/5 reinstating CCPP record + re-assigning BC todos...');
  const reinstate = await executeReinstate({
    internId: AKIWAM.internId,
    confirmedBy: 'ali',
    note: 'Reverse of 2026-06-08 22:00 UTC auto-exit. Akiwam is part of the Federal Contract program; the BLACK auto-exit was wrong.',
    reassignTodoIds: [BUILD_TICKET_ID, LINKEDIN_TICKET_ID],
    reassignAssigneeId: AKIWAM.bcPersonId,
  });
  console.log('   CCPP before:', reinstate.before);
  console.log('   CCPP after: ', reinstate.after);
  console.log('   BC re-assign results:');
  for (const r of reinstate.basecampReassignments) {
    console.log(`     - ${r.todoId} ${r.ok ? (r.alreadyAssigned ? 'already-assigned' : 're-assigned') : 'FAIL: ' + r.error}  ${r.title || ''}`);
  }

  // 2) Reset her nudge state so tomorrow's run starts her at a clean slate
  console.log('\n2/5 resetting nudge state...');
  const stateReset = resetNudgeState();
  console.log('  ', stateReset);

  // 3) Apologetic email from Ali, attached to her Build ticket
  console.log('\n3/5 sending apologetic reinstatement email from Ali...');
  const subject = `Welcome back, Akiwam - your Colaberry seat is restored`;
  const html = `<div style="font-family:arial,sans-serif;color:#1a202c;font-size:14px;line-height:1.6">
<div>Akiwam,</div>
<div><br></div>
<div>You received an automated exit notice from our CB System earlier today flagging "No Call No Show". <strong>That notice was wrong, and I am sorry for the confusion it caused.</strong></div>
<div><br></div>
<div>Here is what actually happened: my internship-activity tracker has a 30-day grace period for new interns, but it keyed off your first Basecamp assignment date (from when you were still a candidate weeks ago) rather than your real onboarding date this morning. The system saw a long-running profile with no recent posts and treated you like a 10-day-dark exit. That is a bug on our side, not a performance issue on yours.</div>
<div><br></div>
<div><strong>Your status:</strong> I have restored your seat in the Colaberry internship program. You are part of the new <strong>Federal Contract program</strong> and your Basecamp assignments have been re-attached. Nothing on your end is required.</div>
<div><br></div>
<div><strong>What's next this week:</strong></div>
<ol>
<li>Continue with the Colaberry Internship Build onboarding I sent you this morning (video, audio, PDF, Mentor GPT intro).</li>
<li>Post your first substantive Basecamp update on the build ticket once you have made it through the intake materials and chosen your dev path.</li>
<li>Ignore the earlier exit notice entirely - the reinstatement protocol it described does not apply to you.</li>
</ol>
<div><br></div>
<div>Welcome (again) to the program. Looking forward to your work on the Federal Contract side.</div>
<div><br></div>
<div>Ali Muwwakkil<br>Managing Director, Colaberry Inc.</div>
</div>`;
  const text = `Akiwam,

You received an automated exit notice from our CB System earlier today flagging "No Call No Show". That notice was wrong, and I am sorry for the confusion it caused.

Here is what actually happened: my internship-activity tracker has a 30-day grace period for new interns, but it keyed off your first Basecamp assignment date (from when you were still a candidate weeks ago) rather than your real onboarding date this morning. The system saw a long-running profile with no recent posts and treated you like a 10-day-dark exit. That is a bug on our side, not a performance issue on yours.

Your status: I have restored your seat in the Colaberry internship program. You are part of the new Federal Contract program and your Basecamp assignments have been re-attached. Nothing on your end is required.

What's next this week:
  1. Continue with the Colaberry Internship Build onboarding I sent you this morning (video, audio, PDF, Mentor GPT intro).
  2. Post your first substantive Basecamp update on the build ticket once you have made it through the intake materials and chosen your dev path.
  3. Ignore the earlier exit notice entirely - the reinstatement protocol it described does not apply to you.

Welcome (again) to the program. Looking forward to your work on the Federal Contract side.

Ali Muwwakkil
Managing Director, Colaberry Inc.`;

  const emailResult = await sendWithBcAttach({
    bucketId: INTERNSHIP_BUCKET,
    ticketId: BUILD_TICKET_ID,
    to: AKIWAM.email,
    bcc: ['ali@colaberry.com'],
    subject,
    html,
    text,
    bcSummary: `<div style="font-size:13px;color:#475569">Apologetic reinstatement email sent from Ali. Reverses the 22:00 UTC CB System auto-exit (no-call-no-show). CCPP record reactivated (InternID 263), 2 BC todos re-assigned (this one + 9451187103), nudge state cleared for fresh start.</div>`,
  });
  console.log('   Mandrill:', emailResult.mandrillId);
  console.log('   BC comment:', emailResult.commentUrl);

  // 4) Close the auto-exit tracking todo in Ali Personal with a closure comment
  console.log('\n4/5 closing auto-exit tracking todo (9975369307)...');
  const closureHtml = `<div>${mention(AKIWAM.sgid)} reinstated by Ali at ${new Date().toISOString()}. Reverses the auto-exit logged above.</div>
<div style="margin-top:10px"><strong>Actions taken:</strong></div>
<ul>
<li>CCPP: InternIsActive 0 -&gt; 1, InternEndDate cleared, InternCancelReasonID cleared (InternID 263)</li>
<li>Basecamp: re-assigned to ${reinstate.basecampReassignments.length} todos (${reinstate.basecampReassignments.filter(r => r.ok).length} ok)</li>
<li>Nudge state: ${stateReset.changed ? 'entry removed (fresh-start tomorrow)' : 'no change (' + stateReset.reason + ')'}</li>
<li>Email: apologetic reinstatement sent to ${AKIWAM.email} from Ali, attached to her Build ticket</li>
</ul>
<div style="margin-top:10px;font-size:12px;color:#475569">Root cause logged for follow-up: the grace-period guard in lib/internActivityTracker.js keys off earliestAssignmentAt (first BC todo assignment), which can predate actual program start. Needs a separate fix so this doesn't fire on the next re-onboarded intern.</div>`;

  const postR = await fetch(`https://3.basecampapi.com/3945211/buckets/${ALI_PERSONAL_BUCKET}/recordings/${NOTIFY_TODO_ID}/comments.json`, {
    method: 'POST', headers: bcHeaders(), body: JSON.stringify({ content: closureHtml }),
  });
  if (!postR.ok) { console.error('   FAIL closure comment:', postR.status, await postR.text()); }
  else { const cj = await postR.json(); console.log('   closure comment:', cj.app_url); }

  console.log('\n5/5 completing the tracking todo...');
  const compR = await fetch(`https://3.basecampapi.com/3945211/buckets/${ALI_PERSONAL_BUCKET}/todos/${NOTIFY_TODO_ID}/completion.json`, {
    method: 'POST', headers: bcHeaders(), body: JSON.stringify({}),
  });
  console.log('   completion status:', compR.status, compR.ok ? 'ok' : await compR.text());

  console.log('\nDONE. Akiwam reinstated.');
})().catch((e) => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
