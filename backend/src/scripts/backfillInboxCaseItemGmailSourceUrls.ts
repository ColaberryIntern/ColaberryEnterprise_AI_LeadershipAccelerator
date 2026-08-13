/**
 * Backfill script: populate source_url on existing InboxCaseItem rows
 * whose evidence came from Gmail, so their "Open" link in the Resolve
 * Work case workspace actually works. The fix in gmailCaseSource.ts only
 * populates source_url for NEWLY discovered items — every item already
 * in the table before that fix landed still has source_url: NULL.
 *
 * Computes the same deep-link formula gmailCaseSource.ts uses
 * (https://mail.google.com/mail/u/0/#all/<source_id>) directly from data
 * already stored on each row — no Gmail API call, no external side
 * effect.
 *
 * Run: `node backend/dist/scripts/backfillInboxCaseItemGmailSourceUrls.js`
 * (compiled) or `npx ts-node src/scripts/backfillInboxCaseItemGmailSourceUrls.ts`
 * from backend/. Safe to run multiple times — the WHERE clause only ever
 * touches rows still missing a source_url.
 */
import '../config/database';
import InboxCaseItem from '../models/InboxCaseItem';
import { Op } from 'sequelize';

const GMAIL_PROVIDERS = ['gmail_colaberry', 'gmail_personal'];
const EMAIL_SOURCE_TYPES = ['email', 'sent_email'];

export function buildGmailSourceUrl(sourceId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${sourceId}`;
}

export async function backfillGmailSourceUrls(): Promise<{ updated: number; scanned: number }> {
  const rows = await InboxCaseItem.findAll({
    where: {
      source_url: null,
      provider: { [Op.in]: GMAIL_PROVIDERS },
      source_type: { [Op.in]: EMAIL_SOURCE_TYPES },
    } as any,
  });

  let updated = 0;
  for (const row of rows) {
    await row.update({ source_url: buildGmailSourceUrl(row.source_id), updated_at: new Date() });
    updated++;
  }

  return { updated, scanned: rows.length };
}

if (require.main === module) {
  backfillGmailSourceUrls()
    .then(({ updated, scanned }) => {
      console.log(JSON.stringify({ event: 'backfill_gmail_source_urls_complete', scanned, updated }));
      process.exit(0);
    })
    .catch((err) => {
      console.error(JSON.stringify({ event: 'backfill_gmail_source_urls_failed', error: err?.message }));
      process.exit(1);
    });
}
