#!/usr/bin/env node
// Smoke test for finalizeBidsFromReply.
//
// We inject a fake addBidFn so the smoke test does NOT hit Basecamp.
// (Previous version of this smoke patched the export — that didn't work
// because the orchestrator captured the reference at module load time. We
// learned this the painful way by creating 2 phantom bids in Basecamp during
// the first run. Now finalizeBidsFromReply accepts addBidFn as a parameter.)
//
// Run: node backend/src/scripts/lib/govBidOps.smoke.js

const { finalizeBidsFromReply } = require('./govBidOps');

const reply = `<div>&#64;CB System ready - here are the 3 bids:</div>
<ol>
<li>Harris County - Agenda &amp; Meeting Management (RFP 26_0075), deadline 2026-06-22, agency Harris County TX, uuid 7011f5af-1234-5678-9abc-def012345678, bonfire harriscountytx.bonfirehub.com/opportunities/228389</li>
<li>SLCC - Enterprise Analytics Platform (SLCC2026-M6006), deadline 2026-07-15, agency Salt Lake Community College</li>
<li>Mystery RFP without deadline, agency City of Nowhere</li>
</ol>`;

const calls = [];
const fakeAddBid = async (args) => {
  calls.push(args);
  return {
    listId: `fake-${calls.length}`,
    listName: args.displayTitle,
    appUrl: `https://example.test/buckets/fake-${calls.length}`,
    tasksCreated: 14,
    tasks: [],
  };
};

(async () => {
  const result = await finalizeBidsFromReply({ replyBody: reply, addBidFn: fakeAddBid });
  console.log('=== finalizeBidsFromReply result ===');
  console.log(JSON.stringify(result, null, 2));
  console.log('\n=== addBidFn was called with ===');
  console.log(JSON.stringify(calls, null, 2));

  const expectations = [
    [result.parsedCount === 3, `parsedCount should be 3, got ${result.parsedCount}`],
    [result.results.length === 3, `results length should be 3, got ${result.results.length}`],
    [result.results[0].ok && /example\.test/.test(result.results[0].listUrl || ''), 'Harris bid succeeded via fakeAddBid (not real Basecamp)'],
    [result.results[1].ok, 'SLCC bid should succeed'],
    [!result.results[2].ok && /no deadline/.test(result.results[2].error || ''), 'Mystery RFP should fail with "no deadline" error'],
    [calls.length === 2, `addBidFn should be called 2x (skipping no-deadline), got ${calls.length}`],
    [calls[0].displayTitle?.startsWith('Harris County'), 'first call displayTitle is Harris County'],
    [calls[0].deadline === '2026-06-22', 'first call deadline is 2026-06-22'],
    [calls[0].agencyName === 'Harris County TX', 'first call agencyName is Harris County TX'],
    [calls[0].opportunityUuid === '7011f5af-1234-5678-9abc-def012345678', 'first call opportunityUuid is correct'],
    [calls[1].displayTitle?.startsWith('SLCC'), 'second call displayTitle is SLCC'],
    [calls[1].deadline === '2026-07-15', 'second call deadline is 2026-07-15'],
  ];

  let fail = 0;
  for (const [cond, msg] of expectations) {
    if (cond) console.log(`  PASS ${msg}`);
    else { console.log(`  FAIL ${msg}`); fail++; }
  }
  if (fail > 0) { console.log(`\n${fail} failures`); process.exit(1); }
  console.log('\nAll smoke checks passed.');
})();
