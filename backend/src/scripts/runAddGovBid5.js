#!/usr/bin/env node
// One-off: actually add bid 5 from the Top-5 MB UPDATE that CB posted earlier
// (msg 9950817863), since the live system was misrouting "@CB add bid 5" to
// post_gov_bid_download_instructions. Uses the new addBidsByNumber library
// function that the cb-system-handler now also exposes.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { parseBidCardsFromMbUpdate, addBidsByNumber } = require(path.resolve(__dirname, './lib/govBidOps'));

const TOKEN_FALLBACK = '';
process.env.BASECAMP_ACCESS_TOKEN = process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK;
const TOKEN = process.env.BASECAMP_ACCESS_TOKEN.replace(/^bearer\s+/i, '').trim();
const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry CB-OneOff', Accept: 'application/json', 'Content-Type': 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211';
const BUCKET = 47346103; // Gov Contracts
const MSG = 9950817863;

const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';

(async () => {
  console.log('[bid5] Parsing prior MB UPDATE...');
  const msg = await (await fetch(`${BASE}/buckets/${BUCKET}/messages/${MSG}.json`, { headers: H })).json();
  const cards = parseBidCardsFromMbUpdate(msg.content || '');
  console.log(`  parsed ${cards.length} cards`);
  for (const c of cards) console.log(`   bid ${c.number}: "${(c.title || '').slice(0, 50)}" / ${c.agency || '-'} / deadline ${c.deadline || '?'} / uuid ${c.uuid || '?'}`);

  const bid5 = cards.find((c) => c.number === 5);
  if (!bid5) { console.error('No bid 5 found'); process.exit(1); }
  console.log(`\n[bid5] Adding bid 5: ${bid5.title}`);

  const result = await addBidsByNumber({ messageId: MSG, bidNumbers: [5], bucketId: BUCKET });
  console.log(`  result: ok=${result.ok}`);
  for (const r of result.results) console.log(`    ${r.bidNumber}: ${r.ok ? `OK list=${r.listId} url=${r.appUrl}` : `FAIL ${r.error}`}`);

  // Post a follow-up CB-styled comment on the MB UPDATE explaining what happened
  console.log('\n[bid5] Posting CB-styled correction comment...');
  const successOne = result.results.find((r) => r.ok);
  const aliMention = `<bc-attachment sgid="${ALI_SGID}" content-type="application/vnd.basecamp.mention"></bc-attachment>`;
  const commentHtml = successOne
    ? `<div>${aliMention} bid 5 added.</div>
<div style="margin-top:8px"><strong>${bid5.title}</strong></div>
<div style="font-size:12px;color:#475569;margin-top:4px">Agency ${bid5.agency || '-'} &middot; Deadline ${bid5.deadline} &middot; CCPP UUID ${bid5.uuid || '-'}</div>
<div style="margin-top:8px"><a href="${successOne.appUrl}">Open the bid project in Gov Contracts &rarr;</a></div>
<div style="margin-top:16px;padding:10px 14px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:0 4px 4px 0;font-size:12px;color:#78350f">My earlier reply mis-routed "@CB add bid 5" to the discovery flow (treating 5 as the bid COUNT instead of the bid NUMBER). Shipping a fix now so the next time you say "add bid N" on a numbered list, I parse the card directly and build the project without re-posting download instructions.</div>`
    : `<div>${aliMention} could not add bid 5 deterministically. Parser result:</div>
<pre style="background:#f1f5f9;padding:10px 14px;border-radius:4px;font-size:11px">${JSON.stringify(result, null, 2)}</pre>`;

  const r = await fetch(`${BASE}/buckets/${BUCKET}/recordings/${MSG}/comments.json`, {
    method: 'POST', headers: H, body: JSON.stringify({ content: commentHtml }),
  });
  console.log(`  status: ${r.status}`);
  if (r.ok) console.log(`  ${(await r.json()).app_url}`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
