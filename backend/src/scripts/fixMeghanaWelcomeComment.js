#!/usr/bin/env node
// Edit the live welcome comment on Meghana's onboarding todo to fix the
// program standard wording (3 per day -> 3 per week) per Ali 2026-06-01.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const TOKEN_FALLBACK = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry InternOnboard', Accept: 'application/json', 'Content-Type': 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211';

const COMMENT_ID = 9950486397;
const ONBOARDING_TODO = 9950486302;
const BUILD_TODO = 9950486363;
const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';

(async () => {
  // Get current to find the right onboarding/build URLs
  const onboardingUrl = `https://app.basecamp.com/3945211/buckets/24865175/todos/${ONBOARDING_TODO}`;
  const buildUrl = `https://app.basecamp.com/3945211/buckets/24865175/todos/${BUILD_TODO}`;
  const aliMention = `<bc-attachment sgid="${ALI_SGID}" content-type="application/vnd.basecamp.mention"></bc-attachment>`;
  const meghanaMention = `<strong>Meghana Chowdary</strong>`;
  const dheeMention = `<strong>@Dheeraj Garg</strong>`;

  const fixedHtml = `<div>Welcome to the Colaberry internship, Meghana Chowdary.</div>
<div><br></div>
<div>${meghanaMention} ${dheeMention} ${aliMention} - posting this here so all three of you have the kickoff context in one place.</div>
<div><br></div>
<div><strong>Meghana, your two starting tasks:</strong></div>
<ol>
<li><strong>This todo (Onboarding)</strong> - <a href="${onboardingUrl}">Meghana Chowdary - New Internship Onboarding</a><br>
   Watch the Colaberry Blueprint video + listen to the podcast embedded in the description above. Then follow the steps in the description. When complete, post a comment here summarizing what you took away.</li>
<li><strong>Internship Build System</strong> - <a href="${buildUrl}">Meghana Chowdary - Colaberry Internship Build System</a><br>
   Complete the training described in that todo's description. After the training, you will be assigned a build ticket on the same list.</li>
</ol>
<div><strong>The program standard:</strong> 3 substantive updates per week on Basecamp. The standard is enforced by an automated system that watches for activity gaps - 4-6 days dark gets a soft warning, 7-9 days dark gets a formal warning, 10+ days dark and you are processed out of the program with a 72-hour reinstatement window. Stay on top of weekly updates, ask questions, comment on your tasks.</div>
<div><br></div>
<div><strong>Who to ping:</strong></div>
<ul>
<li>For technical questions on the training or build: comment on the relevant todo, Dheeraj (${dheeMention}) leads Colaberry-side coordination for new interns.</li>
<li>For program-level questions: Ali (${aliMention}).</li>
<li>For administrative questions (access, accounts, payments): Dheeraj.</li>
</ul>
<div><br></div>
<div>Once you have started on todo #1, reply on this thread so we know you are off to a clean start. Looking forward to seeing your work.</div>
<div><br></div>
<div style="font-size:11px;color:#64748b">Posted on behalf of Ali by CB System. ${new Date().toISOString().slice(0, 10)}. (Edited 2026-06-01 to correct the program standard from "per day" to "per week".)</div>`;

  console.log(`[fix-comment] PUT comment ${COMMENT_ID}...`);
  const r = await fetch(`${BASE}/buckets/24865175/recordings/${COMMENT_ID}/comments.json`, {
    method: 'PUT', headers: H, body: JSON.stringify({ content: fixedHtml }),
  });
  console.log(`  status: ${r.status}`);
  if (!r.ok) {
    const t = await r.text();
    console.error(`PUT failed: ${t}`);
    // Fallback: try a different URL shape (BC API quirks)
    const r2 = await fetch(`${BASE}/buckets/24865175/comments/${COMMENT_ID}.json`, {
      method: 'PUT', headers: H, body: JSON.stringify({ content: fixedHtml }),
    });
    console.log(`  fallback PUT /comments/{id}.json status: ${r2.status}`);
    if (!r2.ok) {
      console.error('Both edit attempts failed. Posting a correction comment instead.');
      const r3 = await fetch(`${BASE}/buckets/24865175/recordings/${ONBOARDING_TODO}/comments.json`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ content: `<div><strong>Correction:</strong> the welcome comment above said "3 substantive updates per day" - the actual program standard is <strong>3 substantive updates per week</strong>. The activity-gap thresholds (4-6 / 7-9 / 10+ days) are unchanged.</div>` }),
      });
      console.log(`  POST correction status: ${r3.status}`);
    }
  } else {
    console.log('Comment edited in place.');
  }
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
