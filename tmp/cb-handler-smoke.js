#!/usr/bin/env node
// Direct invocation of the CB handler against a synthetic mention.
// Posts to a private Ali-only project so we don't spam anything public.
//
// Project: pick Ali's "Project 1" personal/test project at account 3945211.
// Recording: pick any active todo or message to comment on.
//
// Usage:  OPENAI_API_KEY=... BASECAMP_ACCESS_TOKEN=... node tmp/cb-handler-smoke.js
const path = require('path');
const { handleOpenEnded } = require(path.resolve(__dirname, '../scripts/ops-engine/cb-system-handler'));

const ACCOUNT = '3945211';
const BASE = `https://3.basecampapi.com/${ACCOUNT}`;
const ALI_ID = 17454835;
const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';

const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '');
if (!TOKEN) { console.error('BASECAMP_ACCESS_TOKEN required'); process.exit(1); }
if (!process.env.OPENAI_API_KEY) { console.error('OPENAI_API_KEY required'); process.exit(1); }

const H = () => ({ Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'CB Smoke', Accept: 'application/json', 'Content-Type': 'application/json' });

async function bcGet(p) {
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { headers: H() });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return r.json();
}
async function bcPost(p, body) {
  const r = await fetch(p.startsWith('http') ? p : BASE + p, { method: 'POST', headers: H(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status} ${await r.text()}`);
  return r.json();
}
const mention = () => `<bc-attachment sgid="${ALI_SGID}" content-type="application/vnd.basecamp.mention"></bc-attachment>`;

// CB System task in Ali Personal project. Stable target known to exist.
// Bucket 7463955 = Ali Personal. Recording 9945676526 = CB System followups task.
const BUCKET = parseInt(process.env.SMOKE_BUCKET || '7463955', 10);
const RECORDING = parseInt(process.env.SMOKE_RECORDING || '9945676526', 10);

const fakeComment = {
  id: `smoke-${Date.now()}`,
  created_at: new Date().toISOString(),
  creator: { id: ALI_ID, name: 'Ali Muwwakkil' },
  content: process.env.SMOKE_PROMPT || '<div>@CB System smoke test - just confirm the handler runs end to end. Reply in this thread with whether the OpenAI tool-calling loop works and what tools you considered using. Then call finish.</div>',
};

(async () => {
  console.log(`Smoke: bucket=${BUCKET} recording=${RECORDING}`);
  // Verify recording exists
  try {
    const rec = await bcGet(`/buckets/${BUCKET}/recordings/${RECORDING}.json`);
    console.log(`Recording exists: ${rec.title || rec.subject || rec.type}`);
  } catch (e) {
    console.error(`Recording check failed: ${e.message}`);
    process.exit(1);
  }
  const result = await handleOpenEnded({
    bcGet, bcPost, mention,
    bucketId: BUCKET, recId: RECORDING, comment: fakeComment, aliId: ALI_ID,
  });
  console.log('Result:', JSON.stringify(result, null, 2));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
