#!/usr/bin/env node
// Replace the description on Meg's build-system todo (9950486363) with the
// richer content from todo 9759912573 (Sarbjit - Colaberry Internship Build),
// which has the video, audio, image, PDF, and CustomGPT link.
// Silent update - no comments, no notifications.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const TOKEN_FALLBACK = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry InternOnboard', Accept: 'application/json', 'Content-Type': 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211';

const SOURCE_TODO = 9759912573; // Sarbjit - Colaberry Internship Build (rich)
const MEG_BUILD_TODO = 9950486363;
const BUCKET = 24865175;

(async () => {
  console.log(`[fix-build-todo] Reading source ${SOURCE_TODO}...`);
  const src = await (await fetch(`${BASE}/buckets/${BUCKET}/todos/${SOURCE_TODO}.json`, { headers: H })).json();
  console.log(`  source title: "${src.content}"`);
  console.log(`  source description length: ${(src.description || '').length}`);

  console.log(`[fix-build-todo] Reading current Meg todo ${MEG_BUILD_TODO}...`);
  const cur = await (await fetch(`${BASE}/buckets/${BUCKET}/todos/${MEG_BUILD_TODO}.json`, { headers: H })).json();
  const existingAssignees = (cur.assignees || []).map((a) => a.id);
  console.log(`  current title: "${cur.content}"`);
  console.log(`  current description length: ${(cur.description || '').length}`);
  console.log(`  assignees: ${existingAssignees.join(', ')}`);

  console.log(`[fix-build-todo] PUT updated description (preserve title + assignees)...`);
  const body = {
    content: cur.content,
    description: src.description,
    assignee_ids: existingAssignees,
    completion_subscriber_ids: existingAssignees,
    notify: false,
  };
  const r = await fetch(`${BASE}/buckets/${BUCKET}/todos/${MEG_BUILD_TODO}.json`, {
    method: 'PUT', headers: H, body: JSON.stringify(body),
  });
  console.log(`  status: ${r.status}`);
  if (!r.ok) {
    console.error('PUT failed:', await r.text());
    process.exit(1);
  }
  const updated = await r.json();
  console.log(`  new description length: ${(updated.description || '').length}`);
  console.log('Done.');
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
