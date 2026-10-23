/**
 * One-off recovery: send the sign-in link to people who signed up and never got one.
 *
 * ── WHAT HAPPENED ───────────────────────────────────────────────────────────
 *
 * `/api/portal/free-signup` created accounts and emailed nobody. Its sibling door
 * `/api/create-free-account` always sent a branded welcome carrying a portal magic
 * link; this one never did. The paid-ad funnel points at the silent one.
 *
 * Measured in production on 2026-10-23: 116 signups over three days (44 on the
 * 23rd, 57 on the 22nd, against a ~3/day baseline), every one with an enrollment
 * row, and `communication_logs` rows for **zero** of them.
 *
 * Nobody was locked out at the moment of signup - `createFreeAccount` returns a
 * participant JWT, so they landed in the platform - but with no email they had no
 * way back in on another device and nothing in their inbox recording the account.
 *
 * The forward fix is in `freeSignupService`. This script is for the people who were
 * already stranded before it shipped.
 *
 * ── SAFETY ──────────────────────────────────────────────────────────────────
 *
 * DRY RUN BY DEFAULT. Without `SEND=1` it reads, renders one sample email to disk
 * for review, prints the roster and exits having sent nothing.
 *
 * Sends are SEQUENTIAL and SPACED. Production `max_sends_per_minute` is 10, so the
 * default gap is 7s. This is a recovery, not a blast; it may take a quarter of an
 * hour and that is correct.
 *
 * IDEMPOTENT TWICE OVER. The query excludes anyone with any `communication_logs`
 * row, and `sendPortalWelcome` independently refuses an address that already has a
 * `sent` welcome under either door's event name. A re-run after a partial failure
 * picks up only who is left. That double guard is the point: this mails real
 * people and a duplicate cannot be withdrawn.
 *
 *   PREVIEW_ONLY=1 npx ts-node src/scripts/sendStrandedFreeSignupWelcomes.ts  # copy only, no DB
 *   npx ts-node src/scripts/sendStrandedFreeSignupWelcomes.ts            # dry run
 *   DAYS=7 npx ts-node src/scripts/sendStrandedFreeSignupWelcomes.ts     # wider window
 *   SEND=1 npx ts-node src/scripts/sendStrandedFreeSignupWelcomes.ts     # actually send
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { Enrollment } from '../models';
import { sendPortalWelcome, type WelcomeEnrollment } from '../services/welcome/sendPortalWelcome';
import { buildTrainingWelcomeHtml } from '../services/emailService';

const DAYS = Number(process.env.DAYS || 7);
const SEND = process.env.SEND === '1';
const GAP_MS = Number(process.env.GAP_MS || 7000);
const PREVIEW_OUT = process.env.PREVIEW_OUT
  || path.join(os.tmpdir(), 'stranded-welcome-preview.html');

/** The copy Ali approved on 2026-10-23. */
const SUBJECT = 'Your Colaberry sign-in link';
const CLOSING = 'Once you are in, you will find the AI learning track you signed up for. '
  + 'No card needed. If anything does not work, reply to this message and a person will '
  + 'answer you.';

function introFor(signupDate: Date): string {
  // Central, written out, because that is the timezone every date in this project
  // is quoted in and a UTC date can name the wrong day for an evening signup.
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', month: 'long', day: 'numeric',
  }).format(signupDate);
  return `You created a Colaberry account on ${day}, and we never sent you your sign-in link. `
    + 'That was our mistake, not anything you did. Here it is now.';
}

interface StrandedRow {
  enrollment_id: string;
  lead_id: number;
  email: string;
  name: string | null;
  created_at: Date;
}

/**
 * Who is stranded.
 *
 * `DISTINCT ON (lower(email))` with the newest enrollment first is not tidiness:
 * one person can hold several enrollments, and mailing a token minted against the
 * wrong one signs them in to the wrong account. `enrollmentService` carries the
 * comment about that exact failure.
 *
 * Test and staff addresses are excluded by pattern rather than by hand, so a re-run
 * next week cannot quietly pick one up.
 */
async function findStranded(): Promise<StrandedRow[]> {
  return sequelize.query<StrandedRow>(
    `SELECT DISTINCT ON (lower(l.email))
            e.id         AS enrollment_id,
            l.id         AS lead_id,
            l.email      AS email,
            l.name       AS name,
            l.created_at AS created_at
       FROM leads l
       JOIN enrollments e ON lower(e.email) = lower(l.email)
      WHERE l.source = 'free_signup'
        AND l.created_at > now() - ($days || ' days')::interval
        AND l.email NOT LIKE '%colaberry-test.local'
        AND l.email NOT LIKE '%@colaberry.com'
        AND NOT EXISTS (
              SELECT 1 FROM communication_logs cl
               WHERE lower(cl.to_address) = lower(l.email)
            )
      ORDER BY lower(l.email), e.created_at DESC`,
    { bind: { days: String(DAYS) }, type: QueryTypes.SELECT },
  );
}

function writePreview(row: StrandedRow): void {
  const html = buildTrainingWelcomeHtml({
    to: row.email,
    fullName: row.name || 'there',
    portalLink: 'https://enterprise.colaberry.ai/portal/verify?token=PREVIEW-TOKEN-NOT-REAL',
    subjectOverride: SUBJECT,
    intro: introFor(new Date(row.created_at)),
    hideHighlights: true,
    closing: CLOSING,
  });
  fs.writeFileSync(PREVIEW_OUT, html, 'utf8');
  console.log(`\nPREVIEW of the exact email body written to:\n  ${PREVIEW_OUT}`);
  console.log(`  Subject: ${SUBJECT}`);
  console.log('  (the token in the preview is a placeholder; each real send mints its own)');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  // Render the exact body with no database and no network, so the copy can be
  // reviewed before this is anywhere near production. The real run mints a real
  // token per person; this one does not.
  if (process.env.PREVIEW_ONLY === '1') {
    writePreview({
      enrollment_id: 'preview',
      lead_id: 0,
      email: 'recipient@example.com',
      name: 'Dana Reyes',
      created_at: new Date(Date.now() - 2 * 86400000),
    });
    console.log('\nPREVIEW ONLY. No database was queried and nothing was sent.');
    return;
  }

  const rows = await findStranded();

  console.log(`STRANDED FREE-SIGNUP RECOVERY  (window: ${DAYS} days)`);
  console.log(`  found: ${rows.length} people with an account and no email of any kind`);
  if (rows.length === 0) {
    console.log('  nothing to do.');
    return;
  }

  const first = new Date(rows[0].created_at);
  const last = new Date(rows[rows.length - 1].created_at);
  console.log(`  signed up between ${first.toISOString()} and ${last.toISOString()}`);

  writePreview(rows[0]);

  if (!SEND) {
    console.log('\nDRY RUN. Nothing was sent. Re-run with SEND=1 to send.');
    console.log(`Would send ${rows.length} individual emails, ~${GAP_MS / 1000}s apart `
      + `(about ${Math.ceil((rows.length * GAP_MS) / 60000)} minutes).`);
    return;
  }

  console.log(`\nSENDING to ${rows.length} recipients, ${GAP_MS / 1000}s apart.\n`);
  let sent = 0; let skipped = 0; let failed = 0;

  for (const [i, row] of rows.entries()) {
    const enrollment = await Enrollment.findByPk(row.enrollment_id);
    if (!enrollment) {
      failed += 1;
      console.log(`  [${i + 1}/${rows.length}] NO ENROLLMENT ${row.enrollment_id} - skipped`);
      continue;
    }

    const result = await sendPortalWelcome({
      enrollment: enrollment as unknown as WelcomeEnrollment,
      leadId: row.lead_id,
      subjectOverride: SUBJECT,
      intro: introFor(new Date(row.created_at)),
      hideHighlights: true,
      closing: CLOSING,
    });

    if (result.sent) sent += 1;
    else if (result.skipped) skipped += 1;
    else failed += 1;

    const verdict = result.sent ? 'sent' : (result.skipped ? `skipped (${result.reason})` : `FAILED (${result.reason})`);
    console.log(`  [${i + 1}/${rows.length}] ${row.email} - ${verdict}`);

    if (i < rows.length - 1) await sleep(GAP_MS);
  }

  console.log(`\nDONE. sent=${sent} skipped=${skipped} failed=${failed} of ${rows.length}`);
  if (failed > 0) {
    console.log('Re-running is safe: everyone already sent is excluded on the next pass.');
  }
}

main()
  .catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(async () => { await sequelize.close(); });
