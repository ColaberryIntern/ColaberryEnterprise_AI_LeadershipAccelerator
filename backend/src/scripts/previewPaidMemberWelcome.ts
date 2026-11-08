/**
 * Render the paid-member welcome (C10.18) to a file so a human can read it before it is enabled.
 *
 * This exists because `PAID_MEMBER_WELCOME_ENABLED` defaults to false, and the reason it defaults
 * to false is that the sweep sends unrecallable mail to paying customers with nobody in the loop.
 * The switch should not be flipped on the strength of a passing test suite - somebody should read
 * the actual email. This renders exactly what `paidMemberWelcomeCopy` will produce.
 *
 * NO DATABASE AND NO NETWORK. It builds the copy from the pure modules, so it runs anywhere and
 * cannot send anything by accident. The room URL is therefore a stand-in, labelled as one in the
 * output; everything else - the batch label, the orientation date and time, every line of copy -
 * is produced by the same functions the live sweep uses.
 *
 * Usage:
 *   node dist/scripts/previewPaidMemberWelcome.js                        (the current month)
 *   node dist/scripts/previewPaidMemberWelcome.js --month 2026-11
 *   node dist/scripts/previewPaidMemberWelcome.js --no-room              (a batch with no room yet)
 *   node dist/scripts/previewPaidMemberWelcome.js --out /path/to/file.html
 */

import fs from 'fs';
import path from 'path';
import { formatBatchMonth, orientationDateFor, formatOrientationDate, formatClockTime, DEFAULT_ORIENTATION_TIME } from '../services/batch/batchOrientation';
import { buildPaidMemberWelcomeCopy } from '../services/welcome/paidMemberWelcomeCopy';

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

function currentMonthKey(): string {
  // The preview's default only needs to be the month it is run in; the live path reads Central
  // time through centralDate, which this script deliberately does not pull in.
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function main(): void {
  const month = (arg('month') || currentMonthKey()).trim();
  const batchLabel = formatBatchMonth(month);
  if (!batchLabel) {
    console.error(`--month must be YYYY-MM; got "${month}"`);
    process.exit(1);
  }

  const date = orientationDateFor(month);
  const orientationLabel = date
    ? `${formatOrientationDate(date)} at ${formatClockTime(DEFAULT_ORIENTATION_TIME)} CT`
    : null;

  const withRoom = !process.argv.includes('--no-room');
  const copy = buildPaidMemberWelcomeCopy({
    fullName: 'Dana Okonkwo',
    batchLabel,
    orientationLabel,
    roomUrl: withRoom ? 'https://enterprise.colaberry.ai/portal/rooms/EXAMPLE-ROOM-ID' : null,
    portalUrl: 'https://enterprise.colaberry.ai/portal',
  });

  const out = path.resolve(arg('out') || `paid-member-welcome-${month}.html`);
  // The banner is part of the file on purpose: an HTML file sitting on a disk with no context is
  // exactly how a preview gets mistaken for something that was sent.
  const page = [
    '<!doctype html>',
    '<html><head><meta charset="utf-8">',
    `<title>Preview: paid member welcome, ${batchLabel}</title>`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '</head><body style="margin:0; background:#f7fafc; padding:24px; font-family: arial, sans-serif;">',
    '<div style="max-width:640px; margin:0 auto;">',
    '<div style="background:#fffaf0; border:1px solid #dd6b20; border-radius:6px; padding:12px 16px;'
    + ' margin-bottom:20px; color:#7b341e; font-size:13px; line-height:1.5;">',
    '<strong>PREVIEW. This email has not been sent to anyone.</strong><br>',
    `Batch <strong>${batchLabel}</strong>. Rendered by <code>previewPaidMemberWelcome.ts</code> from`,
    ' the same copy module the live sweep uses. The room link is a stand-in;',
    ' the live email resolves the batch\'s real room. Sending stays off until',
    ' <code>PAID_MEMBER_WELCOME_ENABLED=true</code>.',
    '</div>',
    `<div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:24px;">`,
    `<p style="margin:0 0 4px; color:#718096; font-size:12px;">Subject</p>`,
    `<p style="margin:0 0 20px; font-weight:700; color:#1a365d;">${copy.subject}</p>`,
    '<hr style="border:none; border-top:1px solid #e2e8f0; margin:0 0 20px;">',
    copy.html,
    '</div>',
    '<details style="margin-top:20px; font-size:13px; color:#4a5568;">',
    '<summary style="cursor:pointer;">Plain-text version (what a text-only client receives)</summary>',
    `<pre style="white-space:pre-wrap; background:#ffffff; border:1px solid #e2e8f0; padding:16px;`
    + ` border-radius:6px;">${copy.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
    '</details>',
    '</div></body></html>',
  ].join('\n');

  fs.writeFileSync(out, page, 'utf8');

  console.log(`=== Paid member welcome preview (${batchLabel}) ===`);
  console.log(`subject: ${copy.subject}`);
  console.log(`orientation: ${orientationLabel ?? '(none resolved)'}`);
  console.log(`room paragraph: ${withRoom ? 'included' : 'omitted (--no-room)'}`);
  console.log(`\n--- plain text ---\n${copy.text}`);
  console.log(`\nHTML written to: ${out}`);
  console.log('Nothing was sent. PAID_MEMBER_WELCOME_ENABLED gates the live sweep.');
}

if (require.main === module) {
  try {
    main();
    process.exit(0);
  } catch (err) {
    console.error('Preview failed:', err);
    process.exit(1);
  }
}
