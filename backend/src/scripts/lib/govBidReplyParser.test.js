#!/usr/bin/env node
// Run: node backend/src/scripts/lib/govBidReplyParser.test.js
const { parseReply } = require('./govBidReplyParser');

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { console.log(`  PASS ${name}`); pass++; }
  else { console.log(`  FAIL ${name}: ${detail || ''}`); fail++; }
}

// === 1. Happy path: structured comma-separated reply ===
console.log('Test 1: happy-path structured reply');
{
  const reply = `@CB System ready - here are the 3 bids:
1. Harris County - Agenda & Meeting Management (RFP 26_0075), deadline 2026-06-22, agency Harris County TX, uuid 7011f5af-1234-5678-9abc-def012345678, bonfire harriscountytx.bonfirehub.com/opportunities/228389
2. SLCC - Enterprise Analytics Platform (SLCC2026-M6006), deadline 2026-07-15, agency Salt Lake Community College, uuid 8022a6bf-2345-6789-abcd-ef0123456789, bonfire slcc.bonfirehub.com/opportunities/12345
3. TDCJ - Inmate Records System, deadline 2026-08-30, agency Texas Dept of Criminal Justice, uuid 9033b7c0-3456-789a-bcde-f01234567890, bonfire tdcj.bonfirehub.com/opportunities/234405`;
  const { bids, warnings } = parseReply(reply);
  assert('3 bids parsed', bids.length === 3, `got ${bids.length}`);
  assert('first title correct', bids[0]?.title?.startsWith('Harris County'), bids[0]?.title);
  assert('first deadline correct', bids[0]?.deadline === '2026-06-22', bids[0]?.deadline);
  assert('first agency correct', bids[0]?.agency === 'Harris County TX', bids[0]?.agency);
  assert('first uuid correct', bids[0]?.uuid === '7011f5af-1234-5678-9abc-def012345678', bids[0]?.uuid);
  assert('first bonfire url present', /harriscountytx/.test(bids[0]?.bonfireUrl || ''), bids[0]?.bonfireUrl);
  assert('no warnings on happy path', warnings.length === 0, JSON.stringify(warnings));
}

// === 2. HTML-wrapped (typical Basecamp reply) ===
console.log('Test 2: HTML-wrapped reply');
{
  const reply = `<div>&#64;CB System ready, here are the 2 bids:</div>
<ol>
<li>Harris County RFP 26_0075, deadline 2026-06-22, agency Harris County TX, uuid 7011f5af-aaaa-bbbb-cccc-ddddeeeeffff</li>
<li>Plano IT Modernization, deadline 2026-09-01, agency City of Plano, uuid 8888aaaa-1111-2222-3333-444455556666</li>
</ol>`;
  const { bids, warnings } = parseReply(reply);
  assert('2 bids parsed from HTML', bids.length === 2, `got ${bids.length} bids: ${JSON.stringify(bids)}`);
  assert('html title clean', bids[0]?.title === 'Harris County RFP 26_0075', bids[0]?.title);
  assert('html deadline parsed', bids[0]?.deadline === '2026-06-22', bids[0]?.deadline);
  assert('html no warnings', warnings.length === 0, JSON.stringify(warnings));
}

// === 3. Single bid, minimal fields ===
console.log('Test 3: single bid minimal fields');
{
  const reply = `@CB ready: 1. Austin Open Records Portal, deadline 2026-10-15, agency City of Austin`;
  const { bids } = parseReply(reply);
  assert('1 bid parsed', bids.length === 1);
  assert('title parsed', bids[0]?.title === 'Austin Open Records Portal');
  assert('no uuid is OK', bids[0]?.uuid === undefined);
  assert('no bonfire is OK', bids[0]?.bonfireUrl === undefined);
}

// === 4. Missing deadline -> warning but bid still extracted ===
console.log('Test 4: missing deadline');
{
  const reply = `@CB ready: 1. Mystery RFP No Deadline, agency Some Agency`;
  const { bids, warnings } = parseReply(reply);
  assert('1 bid still parsed', bids.length === 1);
  assert('warning about missing deadline', warnings.some((w) => /missing deadline/.test(w)), JSON.stringify(warnings));
}

// === 5. No numbered rows -> empty + warning ===
console.log('Test 5: no numbered rows');
{
  const reply = `@CB hey, just add Harris County deadline 2026-06-22, agency HCTX`;
  const { bids, warnings } = parseReply(reply);
  assert('no bids extracted', bids.length === 0, `got ${bids.length}`);
  assert('warning about format', warnings.length > 0);
}

// === 6. Multi-line per bid (Basecamp <li> splits) ===
console.log('Test 6: multi-line per bid (Basecamp list wrap)');
{
  const reply = `1. Harris County RFP 26_0075
deadline 2026-06-22
agency Harris County TX
uuid 7011f5af-aaaa-bbbb-cccc-ddddeeeeffff`;
  const { bids } = parseReply(reply);
  assert('1 bid joined from multi-line', bids.length === 1);
  assert('deadline picked up from continuation line', bids[0]?.deadline === '2026-06-22', bids[0]?.deadline);
  assert('agency picked up from continuation', bids[0]?.agency === 'Harris County TX', bids[0]?.agency);
}

// === 7. Date in title doesn't pollute deadline parse ===
console.log('Test 7: date in title ignored when explicit deadline present');
{
  const reply = `1. Q4 2026 IT Refresh (FY2026-07-01 to FY2027-06-30), deadline 2026-12-01, agency State of Texas`;
  const { bids } = parseReply(reply);
  // Title contains 2026-07-01 etc but deadline keyword wins
  assert('deadline = 2026-12-01 (not in-title date)', bids[0]?.deadline === '2026-12-01', bids[0]?.deadline);
}

// === 8. Zip URL via explicit keyword ===
console.log('Test 8: zip URL via "zip" keyword');
{
  const reply = `1. Harris County RFP 26_0075, deadline 2026-06-22, agency Harris County TX, zip https://3.basecamp.com/3945211/buckets/47346103/uploads/9912345678`;
  const { bids } = parseReply(reply);
  assert('1 bid parsed', bids.length === 1);
  assert('zipRef extracted', bids[0]?.zipRef === 'https://3.basecamp.com/3945211/buckets/47346103/uploads/9912345678', bids[0]?.zipRef);
  assert('title clean (no zip in it)', bids[0]?.title === 'Harris County RFP 26_0075', bids[0]?.title);
  assert('deadline still parsed', bids[0]?.deadline === '2026-06-22', bids[0]?.deadline);
}

// === 9. Zip URL detected without "zip" keyword (raw BC upload URL) ===
console.log('Test 9: raw BC upload URL detected as zipRef');
{
  const reply = `1. Plano Modernization, deadline 2026-09-01, agency Plano, https://3.basecampapi.com/3945211/buckets/47346103/uploads/12345.json`;
  const { bids } = parseReply(reply);
  assert('zipRef auto-detected from BC URL', /uploads\/12345/.test(bids[0]?.zipRef || ''), bids[0]?.zipRef);
}

// === 10. Non-BC URL (bonfire) does NOT become zipRef ===
console.log('Test 10: bonfire URL is bonfireUrl, not zipRef');
{
  const reply = `1. Austin Records, deadline 2026-10-15, agency Austin, bonfire https://austin.bonfirehub.com/opportunities/99`;
  const { bids } = parseReply(reply);
  assert('no zipRef', !bids[0]?.zipRef, bids[0]?.zipRef);
  assert('bonfireUrl set', /austin.bonfirehub/.test(bids[0]?.bonfireUrl || ''), bids[0]?.bonfireUrl);
}

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
