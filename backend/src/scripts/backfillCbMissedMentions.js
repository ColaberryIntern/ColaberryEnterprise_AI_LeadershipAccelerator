#!/usr/bin/env node
// Backfill two CB-System actions that the dispatcher missed earlier today
// due to (a) the bcGet pagination bug (now fixed) and (b) the 2-hour
// LOOKBACK_HOURS window dropping older comments before the fix landed.
//
// 1. ShipCES todo 9946715807 - CB twice promised to close the ticket but
//    had no complete_todo tool. Now does (tool added in same commit).
//    This one-off script closes the ticket + posts a CB-System-styled
//    apology comment explaining what happened.
//
// 2. Internship PIOS todo 9570979826 - Ali asked "What's up with Tyra's
//    activity" at 9:08am. The dispatcher couldn't see it because that todo
//    has 51 comments and the old bcGet only returned page 1 (March posts).
//    Now answers the question.
//
// Token = CB System persona (37708014). Comments will appear as CB System.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const TOKEN_FALLBACK = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
function getToken() {
  let t = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).trim();
  if (t.toLowerCase().startsWith('bearer ')) t = t.slice(7).trim();
  return t;
}
const H = () => ({ Authorization: `Bearer ${getToken()}`, 'User-Agent': 'Colaberry CBBackfill', Accept: 'application/json', 'Content-Type': 'application/json' });
const BASE = 'https://3.basecampapi.com/3945211';

async function bcPost(p, body) {
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { method: 'POST', headers: H(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`);
  // /completion.json returns empty body; tolerate that
  const txt = await r.text();
  return txt ? JSON.parse(txt) : { ok: true };
}

const ALI_MENTION = `<bc-attachment sgid="BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab" content-type="application/vnd.basecamp.mention"></bc-attachment>`;

(async () => {
  // 1. ShipCES 9946715807 - apology + close
  console.log('[backfill] ShipCES 9946715807 ...');
  const shipcesApology = `<div>${ALI_MENTION} closing this ticket now.</div>
<div><br></div>
<div><strong>What happened earlier:</strong> I told you twice this morning that I would close this ticket. Both times I lacked the tool to actually do it - my toolset had basecamp_reply, email_ali, queue_followup, modes, gov-bid ops, and file generators, but no complete_todo. Saying I would close it when I could not was the failure pattern, sorry.</div>
<div><br></div>
<div><strong>What changed:</strong> Added a complete_todo tool to my handler and rewrote my system prompt so I cannot promise a close without calling the tool in the same turn. Shipped 2026-06-01. Going forward, "close this" works.</div>
<div><br></div>
<div><em>Closing now.</em></div>`;
  await bcPost(`/buckets/47126345/recordings/9946715807/comments.json`, { content: shipcesApology });
  console.log('  posted apology comment');
  await bcPost(`/buckets/47126345/todos/9946715807/completion.json`, {});
  console.log('  marked complete');

  // 2. Internship PIOS 9570979826 - answer Tyra activity question
  console.log('[backfill] Internship PIOS 9570979826 ...');
  const tyraAnswer = `<div>${ALI_MENTION} late answer on your 9:08am question about Tyra's activity, sorry for the delay.</div>
<div><br></div>
<div><strong>Tyra Forbes activity status:</strong></div>
<ul>
<li>Last activity on this PIOS thread: <strong>2026-03-17</strong> (Project #3 status update)</li>
<li>Days since last post: <strong>76 days</strong></li>
<li>No comments, no updates, no progress since</li>
</ul>
<div><strong>On your exit-Tyra request (9:18am):</strong> the exit_intern tool in my handler is preview-only by design - personnel actions require a human-in-the-loop CLI run. The command to actually execute is:</div>
<div><br></div>
<div><code>node backend/src/scripts/confirmInternExit.js "Tyra Forbes" quit</code></div>
<div><br></div>
<div>Run on the VPS at <code>/opt/colaberry-accelerator</code>. It updates CCPP candidate status and un-assigns from any active Basecamp todos.</div>
<div><br></div>
<div><strong>Why my reply was 8 hours late:</strong> two compounding bugs. (a) My dispatcher was using bcGet for comments, which only fetches page 1 of paginated results - this thread has 51 comments and your question sat on page 4, invisible to me. (b) By the time the pagination fix shipped at 17:28 UTC, your 9:08am comment was outside my 2-hour lookback window. Both bugs fixed in the same session; going forward I will see mentions on threads of any length, within 3 minutes of posting.</div>`;
  await bcPost(`/buckets/24865175/recordings/9570979826/comments.json`, { content: tyraAnswer });
  console.log('  posted Tyra answer');

  console.log('\nDone.');
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
