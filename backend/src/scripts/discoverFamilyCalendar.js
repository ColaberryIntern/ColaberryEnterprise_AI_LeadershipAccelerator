#!/usr/bin/env node
/**
 * discoverFamilyCalendar — list the Google calendars the service account can see
 * (impersonating ali@colaberry.com) so we can wire GOOGLE_FAMILY_CALENDAR_ID.
 *
 * The Family Command Center V2 compiler needs the calendarId of the "Family"
 * calendar. This script enumerates calendarList for the impersonated owner and
 * prints id + summary + access role, highlighting the most likely Family match.
 * Read-only. Run on the prod VPS (service-account creds live there), or anywhere
 * GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_CALENDAR_OWNER_EMAIL
 * are set.
 *
 * Run: `node backend/src/scripts/discoverFamilyCalendar.js`
 * Output: prints calendar ids; set the chosen one as GOOGLE_FAMILY_CALENDAR_ID.
 *
 * Session originator: CC-20260610-k7m2
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { google } = require('googleapis');

async function main() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const subject = process.env.GOOGLE_CALENDAR_OWNER_EMAIL || 'ali@colaberry.com';

  if (!email || !key) {
    console.error('FATAL: GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY not set in env.');
    console.error('Run this on the prod VPS where the service-account creds live.');
    process.exit(1);
  }

  const auth = new google.auth.JWT({
    email, key,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    subject,
  });
  const cal = google.calendar({ version: 'v3', auth });

  console.log(`Impersonating: ${subject}\n`);
  const res = await cal.calendarList.list({ maxResults: 250, showHidden: true });
  const items = res.data.items || [];
  if (!items.length) {
    console.log('No calendars visible. The service account may lack domain-wide delegation for this user.');
    process.exit(0);
  }

  const rows = items.map((c) => ({
    id: c.id,
    summary: c.summary || c.summaryOverride || '(no name)',
    role: c.accessRole,
    primary: !!c.primary,
  }));

  console.log('All visible calendars:');
  for (const r of rows) {
    console.log(`  ${r.primary ? '[PRIMARY] ' : ''}${r.summary}`);
    console.log(`      id:   ${r.id}`);
    console.log(`      role: ${r.role}`);
  }

  const familyMatch = rows.find((r) => /\bfamily\b/i.test(r.summary));
  console.log('\n----------------------------------------');
  if (familyMatch) {
    console.log('LIKELY FAMILY CALENDAR:');
    console.log(`  summary: ${familyMatch.summary}`);
    console.log(`  set ->   GOOGLE_FAMILY_CALENDAR_ID=${familyMatch.id}`);
  } else {
    console.log('No calendar named "Family" found. Pick the right id from the list above');
    console.log('and set GOOGLE_FAMILY_CALENDAR_ID to it. If the Family calendar is owned');
    console.log('by Addie and only shared with her, it will not appear here — it must be');
    console.log('shared with ali@colaberry.com (or the service account) to be readable.');
  }
}

main().catch((e) => {
  console.error('FAIL:', e.stack || e.message);
  process.exit(1);
});
