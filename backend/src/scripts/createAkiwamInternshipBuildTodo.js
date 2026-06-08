#!/usr/bin/env node
// Create Akiwam's "Colaberry Internship Build" BC todo under the
// Colaberry Internship Build System list in the Internship/Apprenticeship
// project (bucket 24865175, list 9538503852). Cloned from the Sarbjit
// template todo (9759912573) so she gets the same intake materials
// (video + audio + image + PDF + Mentor GPT link).
//
// Steps:
//   1. Grant Akiwam access to project 24865175 (she is account-wide but
//      not currently a member of this project).
//   2. Fetch the Sarbjit template, reuse its description verbatim — the
//      bc-attachment sgids are stable references to the same uploaded
//      assets, so re-using them costs no storage.
//   3. POST the new todo with title "Akiwam - Colaberry Internship Build",
//      assigned to Akiwam, due 2026-06-15.
//   4. POST an @-mention comment on the new todo explaining what she
//      needs to do (uses sgid mention so she actually gets the email).

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
const BUCKET = 24865175;            // Internship / Apprenticeship
const LIST = 9538503852;            // Colaberry Internship Build System
const TEMPLATE_TODO = 9759912573;   // Sarbjit's todo
const AKIWAM = {
  id: 33056069,
  name: 'Akiwam',
  email: 'akiwam.aps@gmail.com',
  sgid: 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMzMwNTYwNjk_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--9c5e5aeb0998f2e3997da0d1a585fadb3f4a2abb',
};
const DUE_ON = '2026-06-15';

function mention(sgid) {
  return `<bc-attachment sgid="${sgid}" content-type="application/vnd.basecamp.mention"></bc-attachment>`;
}

(async () => {
  // 1. Grant Akiwam project access (no-op if already member; BC returns 200 either way)
  console.log('1/4 granting project access...');
  const access = await axios.put(
    `${BC}/projects/${BUCKET}/people/users.json`,
    { grant: [AKIWAM.id] },
    { headers: BC_HEADERS },
  );
  console.log('    access status:', access.status,
    '| granted:', (access.data.granted || []).map(p => p.name).join(', ') || '(already member)');

  // 2. Fetch the template todo to copy its description
  console.log('2/4 fetching template todo description...');
  const template = (await axios.get(
    `${BC}/buckets/${BUCKET}/todos/${TEMPLATE_TODO}.json`,
    { headers: BC_HEADERS },
  )).data;
  console.log('    template title:', template.title);

  // 3. Create the new todo cloned from the template
  console.log('3/4 creating Akiwam todo...');
  const todo = (await axios.post(
    `${BC}/buckets/${BUCKET}/todolists/${LIST}/todos.json`,
    {
      content: 'Akiwam - Colaberry Internship Build',
      description: template.description,
      assignee_ids: [AKIWAM.id],
      notify: true,
      due_on: DUE_ON,
    },
    { headers: BC_HEADERS },
  )).data;
  console.log('    todo created:', todo.app_url);

  // 4. Tag her with what she needs to do
  console.log('4/4 posting kickoff comment with @-mention...');
  const COMMENT = `<div>${mention(AKIWAM.sgid)} welcome to your build workspace. This is your home base for the Colaberry Internship Build System.</div>

<div style="margin-top:14px"><strong>What you need to do this week (by ${DUE_ON}):</strong></div>
<ol>
<li><strong>Watch the Build System video</strong> (attached above, ~40MB MP4). It explains the human-in-the-loop philosophy and how interns move from <em>learning → building → ownership</em> without shortcuts or autopilot.</li>
<li><strong>Listen to "Why AI Autopilot Is Strictly Prohibited"</strong> (audio attached, ~34MB). This is non-negotiable framing — every AI tool you use here is a copilot, not a pilot. You make the decisions.</li>
<li><strong>Review the Pilot/Co-Pilot Build Architecture PDF</strong> (attached, ~13MB). This is the structural diagram for how your work flows through the system.</li>
<li><strong>Open the Mentor GPT</strong> and introduce yourself: <a href="https://chatgpt.com/g/g-69821a46a0ac81918dc48a39547eaa3d-colaberry-build-system-mentor-gpt">Colaberry Build System Mentor GPT</a>. It will guide you step-by-step from concepts → environment setup → first build. Do not skip ahead. Do not let it run on autopilot.</li>
<li><strong>Choose your development path</strong> with the Mentor GPT: VS Code + Claude Code, or VS Code + Continue.dev. Install locally on your own machine.</li>
<li><strong>Post a reply on this todo</strong> when you have completed steps 1-4, with: (a) the development path you chose and why, (b) one specific thing from the video or audio that surprised you, (c) any questions about the environment setup.</li>
</ol>

<div style="margin-top:14px"><strong>Ground rules:</strong></div>
<ul>
<li>Make decisions yourself. The GPT guides; it does not decide for you.</li>
<li>Verify every change with evidence (screenshots, test output, GitHub commits).</li>
<li>Ask questions early. Stuck for more than 30 minutes on the same thing? Post here.</li>
<li>No skipping the audio. The autopilot lesson is the most important file in this stack.</li>
</ul>

<div style="margin-top:14px">Due ${DUE_ON}. Reach out here or on the Gov Contracts project if you hit a wall. — Ali</div>`;

  const comment = await axios.post(
    `${BC}/buckets/${BUCKET}/recordings/${todo.id}/comments.json`,
    { content: COMMENT },
    { headers: BC_HEADERS },
  );
  console.log('    comment posted:', comment.data.app_url);

  console.log('\nDONE.');
  console.log('  todo:', todo.app_url);
  console.log('  comment:', comment.data.app_url);
  console.log('  due:', DUE_ON, '| assigned:', AKIWAM.name, '(' + AKIWAM.id + ')');
})().catch((e) => {
  console.error('FAIL:', e.response?.status, e.response?.data || e.message);
  process.exit(1);
});
