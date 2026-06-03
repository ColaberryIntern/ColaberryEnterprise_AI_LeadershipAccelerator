#!/usr/bin/env node
// Add 6 people to the Anthropic Partner Network cohort (project 47477101).
// 5 came via Ram's BC asks on the kickoff thread 9940691196 (amitav, Nagendra,
// David Lahme, Nate Taylor, John McBride); 1 came via Ali's discretionary add
// (Farhat). All 6 already exist as Basecamp users so we just grant project
// access + clone the 4-course todo template per person. Then post a single
// confirmation comment addressed to Ram on the kickoff thread.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const BC = process.env.BASECAMP_ACCESS_TOKEN || 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const H = { Authorization: 'Bearer ' + BC, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' };
const ACCOUNT = '3945211';
const PROJECT_ID = 47477101;
const BASE = `https://3.basecampapi.com/${ACCOUNT}/buckets/${PROJECT_ID}`;
const TODOSET_ID = 9940690816;
const KICKOFF_MSG_ID = 9940691196;

// People to add. All confirmed to exist in BC (queried 2026-06-03).
const PEOPLE = [
  { name: 'Amitav Sahoo',     bcUserId: 51924059, email: 'amitav@colaberry.com',         askedBy: 'Ram (BC comment 9959594513)' },
  { name: 'Narendra Nadella', bcUserId: 18507208, email: 'Narendra@colaberry.com (new GWS — uses existing BC account)', askedBy: 'Ram (BC comment 9959594513) + Ali (use existing BC account, do NOT create new BC user)' },
  { name: 'David Lahme',      bcUserId: 44729762, email: 'dlahme@colaberry.com',         askedBy: 'Ram (BC comment 9959645894)' },
  { name: 'Nate Taylor',      bcUserId: 47120913, email: 'ntaylor@colaberry.com',        askedBy: 'Ram (BC comment 9959645894)' },
  { name: 'John McBride',     bcUserId: 17489704, email: 'john@colaberry.com',           askedBy: 'Ram (BC comment 9959680853)' },
  { name: 'Farhat',           bcUserId: 33623049, email: 'Farhat@colaberry.com',         askedBy: 'Ali (discretionary)' },
];

// 4-course template lifted from Angela Mezo's list (9942692753) verbatim.
const COURSES = [
  { num: 1, title: 'Course 1: Introduction to agent skills',           dueOn: '2026-06-09', url: 'https://anthropic.skilljar.com/introduction-to-agent-skills' },
  { num: 2, title: 'Course 2: Building with the Claude API',           dueOn: '2026-06-10', url: 'https://anthropic.skilljar.com/claude-with-the-anthropic-api' },
  { num: 3, title: 'Course 3: Introduction to Model Context Protocol', dueOn: '2026-06-11', url: 'https://anthropic.skilljar.com/introduction-to-model-context-protocol' },
  { num: 4, title: 'Course 4: Claude Code in Action',                  dueOn: '2026-06-12', url: 'https://anthropic.skilljar.com/claude-code-in-action' },
];
// NOTE: original cohort had due dates 6/2, 6/5, 6/9, 6/12. These 6 joined on
// 2026-06-03 — first 2 of the original dates are already past. Compressed
// to 6/9–6/12 so the new joiners have a fair runway without the layout
// silently flagging them all overdue on day 1.

function todoDesc(course) {
  return `<div><strong>${course.title}</strong><br>Sign in: use your @colaberry.com email at <a href="https://anthropic.skilljar.com">anthropic.skilljar.com</a>.<br>Course: <a href="${course.url}">${course.url}</a><br>Evidence: drop your Skilljar completion certificate PDF as a comment on this todo when done.<br>Rules + full course list: see course-links-and-rules.md on the project.</div>`;
}

async function bc(method, p, body) {
  const url = p.startsWith('http') ? p : BASE + p;
  const init = { method, headers: H };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch(url, init);
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${method} ${p} -> ${r.status} ${t.slice(0, 300)}`);
  }
  if (r.status === 204) return {};
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

(async () => {
  // 1. Grant project access for all 6 (PUT /projects/{id}/people/users.json)
  console.log('Granting project access to 6 users...');
  await bc('PUT', `https://3.basecampapi.com/${ACCOUNT}/projects/${PROJECT_ID}/people/users.json`, {
    grant: PEOPLE.map(p => p.bcUserId),
  });
  console.log('  granted:', PEOPLE.map(p => `${p.name} (${p.bcUserId})`).join(', '));

  // 2. Create 6 todo lists + 4 todos each
  const results = [];
  for (const p of PEOPLE) {
    console.log(`\nCreating list for ${p.name}...`);
    const list = await bc('POST', `/todosets/${TODOSET_ID}/todolists.json`, {
      name: `Anthropic onboarding - ${p.name}`,
      description: `<div>Personal cohort list for ${p.name}. Added 2026-06-03. ${p.askedBy}. 4 courses, due ${COURSES[0].dueOn} through ${COURSES[3].dueOn}. Drop your Skilljar completion certificate as a comment on each todo when done.</div>`,
    });
    console.log('  list:', list.id, list.app_url);
    const todos = [];
    for (const c of COURSES) {
      const td = await bc('POST', `/todolists/${list.id}/todos.json`, {
        content: c.title,
        description: todoDesc(c),
        due_on: c.dueOn,
        assignee_ids: [p.bcUserId],
      });
      console.log(`    todo: ${td.id} | due ${c.dueOn} | ${c.title}`);
      todos.push(td.id);
    }
    results.push({ ...p, listId: list.id, listUrl: list.app_url, todoIds: todos });
  }

  // 3. Post reply comment to Ram on kickoff thread
  console.log('\nPosting reply on kickoff thread...');
  const tableRows = results.map(r => `<tr><td style="padding:4px 8px"><strong>${r.name}</strong></td><td style="padding:4px 8px">${r.email}</td><td style="padding:4px 8px"><a href="${r.listUrl}">list</a></td><td style="padding:4px 8px;font-size:11px;color:#64748b">${r.askedBy}</td></tr>`).join('');
  const replyHtml = `<div>
<p>Ram &mdash; all 6 added to the cohort. Project access granted, personal onboarding lists created with the same 4-course template, due dates 6/9 &ndash; 6/12 to give the new joiners fair runway.</p>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0;border-radius:4px">
<thead><tr style="background:#1a365d;color:white"><th align="left" style="padding:6px 8px">Name</th><th align="left">Email</th><th align="left">List</th><th align="left">Source</th></tr></thead>
<tbody>${tableRows}</tbody>
</table>
<p style="margin-top:10px"><strong>Notes:</strong> Narendra Nadella keeps his existing BC account (no new BC user created per Ali); his new @colaberry.com email is Google Workspace only. Farhat is the 6th add per Ali; Ali will loop her in directly. The daily Anthropic Partner Network countdown report + Basecamp message-board thread will pick up the new 6 starting tomorrow's 11 AM CT post (script update committed in same session).</p>
</div>`;
  const reply = await bc('POST', `/recordings/${KICKOFF_MSG_ID}/comments.json`, { content: replyHtml });
  console.log('  reply comment:', reply.id, reply.app_url);

  // 4. Summary
  console.log('\n=== SUMMARY ===');
  console.log('Project access granted to: 6 users');
  console.log('Onboarding lists created: 6');
  console.log('Todos created: ' + (6 * 4));
  console.log('Reply comment:', reply.app_url);
  console.log('\nNEW LIST IDS (for COHORT_LIST_IDS in dailyAnthropicPartnerCountdown.js):');
  for (const r of results) {
    console.log(`  { id: ${r.listId}, name: '${r.name}' },`);
  }
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
