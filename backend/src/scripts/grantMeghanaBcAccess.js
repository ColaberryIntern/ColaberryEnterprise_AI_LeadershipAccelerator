#!/usr/bin/env node
// Re-attempt granting Meghana access to the Internship project using BC's
// "create" flow (for new users not yet in the account).
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const TOKEN_FALLBACK = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry InternOnboard', Accept: 'application/json', 'Content-Type': 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211';

const INTERNSHIP_BUCKET = 24865175;
const MEGHANA_EMAIL = 'b.meghana.chowdary02@gmail.com';
const MEGHANA_NAME = 'Meghana Chowdary';
const ONBOARDING_TODO = 9950486302;
const BUILD_TODO = 9950486363;

(async () => {
  console.log('[grant] trying create flow...');
  const r = await fetch(`${BASE}/projects/${INTERNSHIP_BUCKET}/people/users.json`, {
    method: 'PUT', headers: H,
    body: JSON.stringify({
      create: [{ name: MEGHANA_NAME, email_address: MEGHANA_EMAIL, title: 'Intern' }],
    }),
  });
  const txt = await r.text();
  console.log(`  status ${r.status}`);
  console.log(`  body: ${txt.slice(0, 800)}`);
  if (!r.ok) {
    console.error('create flow failed - aborting');
    process.exit(1);
  }
  const resp = JSON.parse(txt);
  const created = Array.isArray(resp.granted) && resp.granted.length ? resp.granted[0]
                : Array.isArray(resp.created) && resp.created.length ? resp.created[0]
                : null;
  if (!created) {
    console.error('no granted/created person in response');
    console.log(JSON.stringify(resp, null, 2));
    process.exit(1);
  }
  console.log(`  Meghana BC id = ${created.id}`);

  // Assign Meghana to both todos now that we have her ID
  for (const todoId of [ONBOARDING_TODO, BUILD_TODO]) {
    console.log(`[assign] todo ${todoId}`);
    const cur = await (await fetch(`${BASE}/buckets/${INTERNSHIP_BUCKET}/todos/${todoId}.json`, { headers: H })).json();
    const existing = (cur.assignees || []).map((a) => a.id);
    const newAssignees = Array.from(new Set([...existing, created.id]));
    const pr = await fetch(`${BASE}/buckets/${INTERNSHIP_BUCKET}/todos/${todoId}.json`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({
        content: cur.content, description: cur.description,
        assignee_ids: newAssignees, completion_subscriber_ids: newAssignees,
        notify: false,
      }),
    });
    console.log(`  status ${pr.status}`);
  }
  console.log('\nDone. Meghana BC person ID:', created.id);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
