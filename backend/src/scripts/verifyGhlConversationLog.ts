/**
 * GHL Conversations write verification — one-time manual connectivity check
 * for ghlConversationLogService.ts (BC investigation: Valentine Obiora /
 * alumni win-back GHL sync gap).
 *
 * Looks up a real GHL contact by email (v1 API, existing findContactByEmail)
 * and, only when --write is passed, posts one clearly-labeled test
 * InternalComment to that contact's Conversations tab (v2 API) via the same
 * writeGhlInternalComment() the production email pipeline will call. Without
 * --write it's read-only: prints the contact it found and the message it
 * WOULD send, but makes no v2 call.
 *
 * Requires ghl_api_key (v1) and ghl_conversations_api_key (v2, Private
 * Integration token scoped for conversations.readonly +
 * conversations/message.write) already saved as system settings — set both
 * via Admin > Settings > Integrations > GoHighLevel CRM. This script never
 * reads or prints either key.
 *
 * Run: `npx ts-node backend/src/scripts/verifyGhlConversationLog.ts [email] [--write]`
 *   Defaults email to kesetebirhan@gmail.com if not given.
 */

import { connectDatabase } from '../config/database';
import { findContactByEmail } from '../services/ghlService';
import { writeGhlInternalComment } from '../services/ghlConversationLogService';

const DEFAULT_EMAIL = 'kesetebirhan@gmail.com';

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes('--write');
  const email = args.find((a) => !a.startsWith('--')) || DEFAULT_EMAIL;

  await connectDatabase();

  console.log(`[verifyGhlConversationLog] Searching GHL (v1) for a contact matching: ${email}`);
  const contact = await findContactByEmail(email);

  if (!contact) {
    console.error(`[verifyGhlConversationLog] No GHL contact found for ${email}. Nothing to write. Confirm ghl_api_key is configured and this email has a real GHL contact.`);
    process.exit(1);
  }

  const contactName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  console.log(`[verifyGhlConversationLog] Found contact: id=${contact.id} name="${contactName}" email=${contact.email}`);

  const message = [
    'TEST MESSAGE — Colaberry Enterprise AI GHL Conversations integration check.',
    `Sent by verifyGhlConversationLog.ts at ${new Date().toISOString()}.`,
    'This is a manual connectivity test, not a real campaign send — safe to delete.',
  ].join('\n');

  if (!shouldWrite) {
    console.log('[verifyGhlConversationLog] Dry run (pass --write to actually post this). Message that would be sent:\n' + message);
    process.exit(0);
  }

  console.log(`[verifyGhlConversationLog] Writing InternalComment to contact ${contact.id}...`);
  const result = await writeGhlInternalComment(contact.id, message);

  if (result.success) {
    console.log(`[verifyGhlConversationLog] Success. GHL response id: ${result.data?.id || result.data?.messageId || '(no id in response)'}`);
    console.log('[verifyGhlConversationLog] Check the Conversations tab on this contact in GHL to confirm it landed there (not Notes).');
    process.exit(0);
  } else {
    console.error(`[verifyGhlConversationLog] Failed: ${result.error}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('[verifyGhlConversationLog] Unexpected error:', err.message);
  process.exit(1);
});
