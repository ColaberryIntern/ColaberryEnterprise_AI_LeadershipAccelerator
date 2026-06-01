#!/usr/bin/env node
// One-off intern onboarding for Meghana Chowdary (b.meghana.chowdary02@gmail.com)
// per Ali's 2026-06-01 request triggered by Swati's 2026-05-29 email to Dhee.
//
// What this does (Basecamp only; CCPP add is deferred - see note at bottom):
//   1. Grants Meghana access to the Internship project (bucket 24865175)
//   2. Reads source todo 1 (9732705547 - the "Sarbjit" New Internship Onboarding template)
//      and duplicates it for Meghana into list 9506875341.
//   3. Reads source todo 2 (9541162475 - the "OBI" Internship Build System template)
//      and duplicates it for Meghana into list 9538503852.
//   4. Posts a welcome comment on the onboarding todo tagging @Meghana + @Dhee + @Ali.
//
// Outputs a summary block to stdout so the Dhee/Swati reply email can quote it.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const TOKEN_FALLBACK = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
function getToken() {
  let t = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).trim();
  if (t.toLowerCase().startsWith('bearer ')) t = t.slice(7).trim();
  return t;
}
const H = () => ({ Authorization: `Bearer ${getToken()}`, 'User-Agent': 'Colaberry InternOnboard', Accept: 'application/json', 'Content-Type': 'application/json' });
const BASE = 'https://3.basecampapi.com/3945211';

const INTERNSHIP_BUCKET = 24865175;
const NEW_INTERN_NAME = 'Meghana Chowdary';
const NEW_INTERN_EMAIL = 'b.meghana.chowdary02@gmail.com';
const SOURCE_TODO_ONBOARDING = 9732705547;
const DEST_LIST_ONBOARDING = 9506875341;
const SOURCE_TODO_BUILD_SYSTEM = 9541162475;
const DEST_LIST_BUILD_SYSTEM = 9538503852;
const ALI_BC_ID = 17454835;
const DHEE_BC_ID = 34920126;
const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';
// Dhee SGID is encoded the same shape: gid://bc3/Person/34920126
function bcPersonSgid(personId) {
  const inner = Buffer.from(`gid://bc3/Person/${personId}?expires_in`).toString('base64');
  // Note: actual SGIDs are signed by BC and not derivable. We rely on mention HTML
  // that just wraps person id in a recognized form. Falling back to plain @-mention.
  return null;
}

async function bcGet(p) {
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { headers: H() });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status} ${await r.text().catch(() => '')}`);
  return r.json();
}
async function bcPost(p, body) {
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { method: 'POST', headers: H(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text().catch(() => '')}`);
  const t = await r.text();
  return t ? JSON.parse(t) : {};
}
async function bcPut(p, body) {
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { method: 'PUT', headers: H(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PUT ${p} -> ${r.status} ${await r.text().catch(() => '')}`);
  const t = await r.text();
  return t ? JSON.parse(t) : {};
}

(async () => {
  console.log(`[onboard] Starting onboarding for ${NEW_INTERN_NAME} <${NEW_INTERN_EMAIL}>`);

  // -----------------------------------------------------------------------
  // 1. Read the two source templates
  // -----------------------------------------------------------------------
  console.log('[onboard] Reading source todos...');
  const src1 = await bcGet(`/buckets/${INTERNSHIP_BUCKET}/todos/${SOURCE_TODO_ONBOARDING}.json`);
  console.log(`  source 1: "${src1.content}" (parent list ${src1.parent.id})`);
  const src2 = await bcGet(`/buckets/${INTERNSHIP_BUCKET}/todos/${SOURCE_TODO_BUILD_SYSTEM}.json`);
  console.log(`  source 2: "${src2.content}" (parent list ${src2.parent.id})`);

  // -----------------------------------------------------------------------
  // 2. Grant Meghana access to the project. Idempotent: if already granted, BC
  //    just returns the existing person record.
  // -----------------------------------------------------------------------
  console.log(`[onboard] Granting BC access for ${NEW_INTERN_EMAIL}...`);
  let meghanaPersonId = null;
  try {
    const grantResp = await bcPut(`/projects/${INTERNSHIP_BUCKET}/people/users.json`, {
      grant: [{ email_address: NEW_INTERN_EMAIL, name: NEW_INTERN_NAME, title: 'Intern' }],
    });
    console.log('  grant response:', JSON.stringify(grantResp).slice(0, 400));
    if (Array.isArray(grantResp.granted) && grantResp.granted.length) {
      meghanaPersonId = grantResp.granted[0].id;
    }
  } catch (e) {
    console.warn(`  initial grant call failed: ${e.message}`);
  }
  // Fallback: look her up in the project people listing.
  if (!meghanaPersonId) {
    console.log('  looking up Meghana in project people listing...');
    const people = await bcGet(`/projects/${INTERNSHIP_BUCKET}/people.json`);
    const m = (people || []).find((p) => (p.email_address || '').toLowerCase() === NEW_INTERN_EMAIL.toLowerCase());
    if (m) { meghanaPersonId = m.id; console.log(`  found Meghana in project people: id=${m.id}`); }
    else { console.warn(`  Meghana not found in project people listing - access grant may have failed.`); }
  }

  // -----------------------------------------------------------------------
  // 3. Duplicate source todo 1 into destination list 1 (assigned to Meghana)
  // -----------------------------------------------------------------------
  console.log(`[onboard] Creating onboarding todo for Meghana in list ${DEST_LIST_ONBOARDING}...`);
  const onboardingTitle = `${NEW_INTERN_NAME} - New Internship Onboarding`;
  const onboardingBody = {
    content: onboardingTitle,
    description: src1.description || '',
    assignee_ids: meghanaPersonId ? [meghanaPersonId] : [],
    due_on: null,
    notify: false,
  };
  let onboardingTodo;
  try {
    onboardingTodo = await bcPost(`/buckets/${INTERNSHIP_BUCKET}/todolists/${DEST_LIST_ONBOARDING}/todos.json`, onboardingBody);
    console.log(`  onboarding todo id=${onboardingTodo.id} url=${onboardingTodo.app_url}`);
  } catch (e) {
    console.error(`  FAILED to create onboarding todo: ${e.message}`);
    throw e;
  }

  // -----------------------------------------------------------------------
  // 4. Duplicate source todo 2 into destination list 2 (assigned to Meghana)
  // -----------------------------------------------------------------------
  console.log(`[onboard] Creating build system todo for Meghana in list ${DEST_LIST_BUILD_SYSTEM}...`);
  const buildTitle = `${NEW_INTERN_NAME} - Colaberry Internship Build System`;
  const buildBody = {
    content: buildTitle,
    description: src2.description || '',
    assignee_ids: meghanaPersonId ? [meghanaPersonId] : [],
    due_on: null,
    notify: false,
  };
  let buildTodo;
  try {
    buildTodo = await bcPost(`/buckets/${INTERNSHIP_BUCKET}/todolists/${DEST_LIST_BUILD_SYSTEM}/todos.json`, buildBody);
    console.log(`  build system todo id=${buildTodo.id} url=${buildTodo.app_url}`);
  } catch (e) {
    console.error(`  FAILED to create build system todo: ${e.message}`);
    throw e;
  }

  // -----------------------------------------------------------------------
  // 5. Welcome comment on the onboarding todo tagging @Meghana + @Dhee + @Ali
  // -----------------------------------------------------------------------
  console.log('[onboard] Posting welcome comment...');
  const meghanaMention = meghanaPersonId ? `<bc-attachment sgid="" content-type="application/vnd.basecamp.mention" data-person-id="${meghanaPersonId}"></bc-attachment>` : `<strong>${NEW_INTERN_NAME}</strong>`;
  // Ali SGID we have; Dhee we don't, so plain text @ for him.
  const aliMention = `<bc-attachment sgid="${ALI_SGID}" content-type="application/vnd.basecamp.mention"></bc-attachment>`;
  const dheeMention = `<strong>@Dheeraj Garg</strong>`;
  const welcomeHtml = `<div>Welcome to the Colaberry internship, ${NEW_INTERN_NAME}.</div>
<div><br></div>
<div>${meghanaMention} ${dheeMention} ${aliMention} - posting this here so all three of you have the kickoff context in one place.</div>
<div><br></div>
<div><strong>Meghana, your two starting tasks:</strong></div>
<ol>
<li><strong>This todo (Onboarding)</strong> - <a href="${onboardingTodo.app_url}">${onboardingTitle}</a><br>
   Watch the Colaberry Blueprint video + listen to the podcast embedded in the description above. Then follow the steps in the description. When complete, post a comment here summarizing what you took away.</li>
<li><strong>Internship Build System</strong> - <a href="${buildTodo.app_url}">${buildTitle}</a><br>
   Complete the training described in that todo's description. After the training, you will be assigned a build ticket on the same list.</li>
</ol>
<div><strong>The program standard:</strong> 3 substantive updates per day on Basecamp, every weekday. The standard is enforced by an automated system - 4-6 days dark gets you a warning, 7-9 days dark is a formal warning, 10+ days dark and you are processed out of the program with a 72-hour reinstatement window. Do not let this happen to you. Post updates, ask questions, comment on your tasks.</div>
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
<div style="font-size:11px;color:#64748b">Posted on behalf of Ali by CB System. ${new Date().toISOString().slice(0, 10)}.</div>`;
  const welcomeComment = await bcPost(`/buckets/${INTERNSHIP_BUCKET}/recordings/${onboardingTodo.id}/comments.json`, { content: welcomeHtml });
  console.log(`  welcome comment id=${welcomeComment.id}`);

  // -----------------------------------------------------------------------
  // Summary for the Dhee+Swati reply email
  // -----------------------------------------------------------------------
  console.log('\n=== ONBOARDING SUMMARY ===');
  console.log(JSON.stringify({
    intern: { name: NEW_INTERN_NAME, email: NEW_INTERN_EMAIL, basecampPersonId: meghanaPersonId },
    onboardingTodo: { id: onboardingTodo.id, title: onboardingTitle, url: onboardingTodo.app_url },
    buildSystemTodo: { id: buildTodo.id, title: buildTitle, url: buildTodo.app_url },
    welcomeCommentId: welcomeComment.id,
    ccppStatus: 'DEFERRED - awaiting safe schema-write helper, see PROGRESS.md',
  }, null, 2));
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
