#!/usr/bin/env node
// Daily PMO heartbeat entry point.
//
// Cron entry on VPS: 0 13 * * 1-5 (8am CST Mon-Fri = 13:00 UTC during CDT).
// Adjust to 14:00 UTC after DST shifts back to CST in November.
//
// Pass --force to run on a weekend or off-hour for testing.
// Pass --to=someone@example.com to send the email to that address only (no CC) -
// used for a private verification send without notifying the standard CC list.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { runDailyUpdate } = require('./lib/launchPmoDailyUpdate');

const force = process.argv.includes('--force');
const toArg = process.argv.find((a) => a.startsWith('--to='));
const recipients = toArg ? { to: toArg.slice('--to='.length), cc: [] } : undefined;

runDailyUpdate({ force, recipients })
  .then((r) => { console.log('Daily PMO update:', JSON.stringify(r, null, 2)); })
  .catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
