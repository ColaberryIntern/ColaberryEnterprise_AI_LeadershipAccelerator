#!/usr/bin/env node
// Add Ram Katamaraja to the Anthropic Partner Network cohort (bucket 47477101).
// Same shape as every other cohort member: one personal todolist with 4 course
// todos due 2026-06-09 through 2026-06-12 (the partner-network cohort deadline).
//
// Steps:
//   1. PUT grant Ram on the project (no-op since he is already a member — kept
//      for idempotency).
//   2. POST a new todolist "Anthropic onboarding - Ram Katamaraja".
//   3. POST 4 course todos in order with descriptions copied verbatim from
//      John McBride's list (the most recent cohort addition), assigned to Ram
//      with the cohort due dates.
//   4. POST an @-mention kickoff comment on the new todolist so Ram gets the
//      email notification with the framing + deadline.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const axios = require(path.resolve(__dirname, '../../../node_modules/axios'));

const BC_HEADERS = {
  Authorization: `Bearer ${process.env.BASECAMP_ACCESS_TOKEN}`,
  'User-Agent': 'Colaberry Accelerator (ali@colaberry.com)',
  'Content-Type': 'application/json',
};

const BC = 'https://3.basecampapi.com/3945211';
const BUCKET = 47477101;        // Anthropic Partner Network - 10-Person Onboarding
const TODOSET = 9940690816;     // Project todoset id (parent of all per-person lists)

const RAM = {
  id: 17346350,
  name: 'Ram Katamaraja',
  sgid: 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTczNDYzNTA_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--254fc9cd8ba7a61de9c4fece9e85784525ef65d6',
};

const COURSES = [
  {
    title: 'Course 1: Introduction to agent skills',
    due_on: '2026-06-09',
    description: '<div><strong>Course 1: Introduction to agent skills</strong><br>Sign in: use your @colaberry.com email at <a href="https://anthropic.skilljar.com" target="_blank" rel="noreferrer">anthropic.skilljar.com</a>.<br>Course: <a href="https://anthropic.skilljar.com/introduction-to-agent-skills" target="_blank" rel="noreferrer" class="autolinked" data-behavior="truncate">https://anthropic.skilljar.com/introduction-to-agent-skills</a><br>Evidence: drop your Skilljar completion certificate PDF as a comment on this todo when done.<br>Rules + full course list: see course-links-and-rules.md on the project.</div>',
  },
  {
    title: 'Course 2: Building with the Claude API',
    due_on: '2026-06-10',
    description: '<div><strong>Course 2: Building with the Claude API</strong><br>Sign in: use your @colaberry.com email at <a href="https://anthropic.skilljar.com" target="_blank" rel="noreferrer">anthropic.skilljar.com</a>.<br>Course: <a href="https://anthropic.skilljar.com/claude-with-the-anthropic-api" target="_blank" rel="noreferrer" class="autolinked" data-behavior="truncate">https://anthropic.skilljar.com/claude-with-the-anthropic-api</a><br>Evidence: drop your Skilljar completion certificate PDF as a comment on this todo when done.<br>Rules + full course list: see course-links-and-rules.md on the project.</div>',
  },
  {
    title: 'Course 3: Introduction to Model Context Protocol',
    due_on: '2026-06-11',
    description: '<div><strong>Course 3: Introduction to Model Context Protocol</strong><br>Sign in: use your @colaberry.com email at <a href="https://anthropic.skilljar.com" target="_blank" rel="noreferrer">anthropic.skilljar.com</a>.<br>Course: <a href="https://anthropic.skilljar.com/introduction-to-model-context-protocol" target="_blank" rel="noreferrer" class="autolinked" data-behavior="truncate">https://anthropic.skilljar.com/introduction-to-model-context-protocol</a><br>Evidence: drop your Skilljar completion certificate PDF as a comment on this todo when done.<br>Rules + full course list: see course-links-and-rules.md on the project.</div>',
  },
  {
    title: 'Course 4: Claude Code in Action',
    due_on: '2026-06-12',
    description: '<div><strong>Course 4: Claude Code in Action</strong><br>Sign in: use your @colaberry.com email at <a href="https://anthropic.skilljar.com" target="_blank" rel="noreferrer">anthropic.skilljar.com</a>.<br>Course: <a href="https://anthropic.skilljar.com/claude-code-in-action" target="_blank" rel="noreferrer" class="autolinked" data-behavior="truncate">https://anthropic.skilljar.com/claude-code-in-action</a><br>Evidence: drop your Skilljar completion certificate PDF as a comment on this todo when done.<br>Rules + full course list: see course-links-and-rules.md on the project.</div>',
  },
];

function mention(sgid) {
  return `<bc-attachment sgid="${sgid}" content-type="application/vnd.basecamp.mention"></bc-attachment>`;
}

(async () => {
  // 1. PUT grant Ram (idempotent — he is already a project member)
  console.log('1/4 ensuring Ram has project access...');
  const access = await axios.put(
    `${BC}/projects/${BUCKET}/people/users.json`,
    { grant: [RAM.id] },
    { headers: BC_HEADERS },
  );
  console.log('    access:', access.status,
    '| granted:', (access.data.granted || []).map(p => p.name).join(', ') || '(already member)');

  // 2. Create the personal todolist
  console.log('2/4 creating Ram\'s onboarding todolist...');
  const list = (await axios.post(
    `${BC}/buckets/${BUCKET}/todosets/${TODOSET}/todolists.json`,
    {
      name: 'Anthropic onboarding - Ram Katamaraja',
      description: '<div>Personal cohort list for Ram Katamaraja. Added 2026-06-08 by Ali. 4 courses, due 2026-06-09 through 2026-06-12. Drop your Skilljar completion certificate as a comment on each todo when done.</div>',
    },
    { headers: BC_HEADERS },
  )).data;
  console.log('    list created:', list.app_url, '(id', list.id + ')');

  // 3. Create the 4 course todos in order
  console.log('3/4 creating 4 course todos...');
  const createdTodos = [];
  for (const c of COURSES) {
    const todo = (await axios.post(
      `${BC}/buckets/${BUCKET}/todolists/${list.id}/todos.json`,
      {
        content: c.title,
        description: c.description,
        assignee_ids: [RAM.id],
        notify: true,
        due_on: c.due_on,
      },
      { headers: BC_HEADERS },
    )).data;
    createdTodos.push(todo);
    console.log('    +', todo.id, '|', c.title, '| due', c.due_on);
  }

  // 4. Post the @-mention kickoff comment on the LIST so Ram gets one email
  //    with the full picture (deadline + 4 courses).
  console.log('4/4 posting kickoff comment with @-mention on the list...');
  const COMMENT = `<div>${mention(RAM.sgid)} you have been added to the Anthropic Partner Network onboarding cohort.</div>

<div style="margin-top:14px"><strong>What this is</strong></div>
<div>The 4 required Anthropic Academy Skilljar courses to unlock confirmed Claude Partner Network status for Colaberry. Cohort deadline is <strong>Friday 2026-06-12</strong> — 4 days from today.</div>

<div style="margin-top:14px"><strong>What you need to do</strong></div>
<ol>
<li>Sign in at <a href="https://anthropic.skilljar.com">anthropic.skilljar.com</a> with your @colaberry.com email.</li>
<li>Complete the 4 courses on the schedule below (each todo has its own URL + instructions):
  <ul>
    <li><strong>Tue 6/9</strong> &middot; Course 1: Introduction to agent skills</li>
    <li><strong>Wed 6/10</strong> &middot; Course 2: Building with the Claude API</li>
    <li><strong>Thu 6/11</strong> &middot; Course 3: Introduction to Model Context Protocol</li>
    <li><strong>Fri 6/12</strong> &middot; Course 4: Claude Code in Action</li>
  </ul>
</li>
<li>For each course: drop your Skilljar completion certificate PDF as a comment on that todo when done. That is the evidence that closes the loop with Anthropic.</li>
</ol>

<div style="margin-top:14px">All 4 todos are assigned to you under "Anthropic onboarding - Ram Katamaraja" in this project. Same structure as every other cohort member.</div>

<div style="margin-top:14px"><em>— Ali</em></div>`;

  const comment = await axios.post(
    `${BC}/buckets/${BUCKET}/recordings/${list.id}/comments.json`,
    { content: COMMENT },
    { headers: BC_HEADERS },
  );
  console.log('    comment posted:', comment.data.app_url);

  console.log('\nDONE.');
  console.log('  list:', list.app_url);
  console.log('  todos:', createdTodos.map(t => t.id).join(', '));
  console.log('  comment:', comment.data.app_url);
})().catch((e) => {
  console.error('FAIL:', e.response?.status, e.response?.data || e.message);
  process.exit(1);
});
