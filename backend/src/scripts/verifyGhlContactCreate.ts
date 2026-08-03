/**
 * GHL contact-creation verification — one-time manual check that
 * createContact() actually works against the live GHL account (BC
 * investigation: Valentine Obiora / alumni win-back GHL sync gap).
 *
 * verifyGhlConversationLog.ts only exercises an EXISTING contact (lookup +
 * Conversations write). This script tests the other half: what actually
 * happens when syncLeadToGhl's create-if-missing branch fires for a lead
 * that has no GHL contact yet — the exact scenario the original bug
 * (Valentine Obiora) hit. Creates one real, obviously-fake, tagged test
 * contact in the live GHL account so it can be manually verified/deleted
 * afterward. Confirms first that the throwaway email has no existing
 * contact, so this never accidentally overwrites a real record.
 *
 * Run: `npx ts-node backend/src/scripts/verifyGhlContactCreate.ts`
 */

import { connectDatabase } from '../config/database';
import { findContactByEmail, createContact } from '../services/ghlService';

async function run(): Promise<void> {
  const testEmail = `ghl-create-test+${Date.now()}@colaberry.com`;

  await connectDatabase();

  console.log(`[verifyGhlContactCreate] Confirming no existing contact for: ${testEmail}`);
  const existing = await findContactByEmail(testEmail);
  if (existing) {
    console.error(`[verifyGhlContactCreate] Unexpected: a contact already exists for this throwaway email (id=${existing.id}). Aborting — pick a different test email rather than risk touching an existing record.`);
    process.exit(1);
  }

  console.log('[verifyGhlContactCreate] Confirmed no existing contact. Creating a new one...');
  const result = await createContact(
    {
      name: 'GHL Create Test (safe to delete)',
      email: testEmail,
      company: 'Colaberry Internal Test',
    },
    'ghl_create_verification_test'
  );

  if (result.success) {
    console.log(`[verifyGhlContactCreate] Success. New GHL contact id: ${result.contactId}`);
    console.log(`[verifyGhlContactCreate] Search "${testEmail}" (or tag "ghl_create_verification_test") in GHL to find and delete this test contact.`);
    process.exit(0);
  } else {
    console.error(`[verifyGhlContactCreate] Failed: ${result.error}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('[verifyGhlContactCreate] Unexpected error:', err.message);
  process.exit(1);
});
