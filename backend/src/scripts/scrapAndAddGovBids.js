#!/usr/bin/env node
// Scrap the current 5 gov bids + add 5 placeholder bids with the standard template.
// Ali's session 2026-05-31. All 5 scored LIKELY SCRAP; Ali asked to start fresh.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { scrapBid, addBid } = require(path.resolve(__dirname, './lib/govBidOps'));

const SCRAP_NAMES = [
  'Harris County',
  'SLCC',
  'TDCJ',
  'Southlake',
  'Detroit',
];

// 5 placeholder slots. Ali populates with real opportunity data via
// `@CB add bid <title> deadline <YYYY-MM-DD>` or by editing in BC.
// Default deadlines spaced 30 days out to give realistic working windows.
function isoOffset(days) { const d = new Date(); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }

const NEW_BIDS = [
  { displayTitle: '[NEW SLOT] Bid 1 - awaiting Opportunity Pulse selection',  deadline: isoOffset(45), agencyName: 'TBD', fitThesis: 'Placeholder - replace with real opportunity. Tag @CB System with the opportunity UUID + RFP zip path to populate.' },
  { displayTitle: '[NEW SLOT] Bid 2 - awaiting Opportunity Pulse selection',  deadline: isoOffset(45), agencyName: 'TBD', fitThesis: 'Placeholder - replace with real opportunity.' },
  { displayTitle: '[NEW SLOT] Bid 3 - awaiting Opportunity Pulse selection',  deadline: isoOffset(45), agencyName: 'TBD', fitThesis: 'Placeholder - replace with real opportunity.' },
  { displayTitle: '[NEW SLOT] Bid 4 - awaiting Opportunity Pulse selection',  deadline: isoOffset(45), agencyName: 'TBD', fitThesis: 'Placeholder - replace with real opportunity.' },
  { displayTitle: '[NEW SLOT] Bid 5 - awaiting Opportunity Pulse selection',  deadline: isoOffset(45), agencyName: 'TBD', fitThesis: 'Placeholder - replace with real opportunity.' },
];

(async () => {
  console.log('=== SCRAP PHASE ===');
  const scrapped = [];
  for (const name of SCRAP_NAMES) {
    try {
      const r = await scrapBid(name);
      console.log(`  trashed "${r.name}" (id ${r.trashed})`);
      scrapped.push(r);
    } catch (e) {
      console.error(`  fail "${name}": ${e.message}`);
      scrapped.push({ name, error: e.message });
    }
  }

  console.log('\n=== ADD PHASE ===');
  const added = [];
  for (const bid of NEW_BIDS) {
    try {
      const r = await addBid(bid);
      console.log(`  created "${r.listName}" (id ${r.listId}, ${r.tasksCreated} tasks, deadline ${bid.deadline})`);
      added.push({ ...r, deadline: bid.deadline });
    } catch (e) {
      console.error(`  fail ${bid.displayTitle}: ${e.message}`);
      added.push({ title: bid.displayTitle, error: e.message });
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Scrapped: ${scrapped.filter((s) => !s.error).length}/${SCRAP_NAMES.length}`);
  console.log(`Added: ${added.filter((a) => !a.error).length}/${NEW_BIDS.length}`);
  console.log(JSON.stringify({ scrapped, added }, null, 2));
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
