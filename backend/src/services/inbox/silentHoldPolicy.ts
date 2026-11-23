/**
 * What a SILENT_HOLD classification actually DOES to the message in the mailbox.
 *
 * WHY THIS EXISTS (2026-11-23, CC-20261123-8lfn). SILENT_HOLD was documented as
 * "stored and accessible but not surfaced", and the dispatcher took no action
 * at all. Not surfacing it requires moving it out of the inbox, so in practice
 * every SILENT_HOLD message stayed in Gmail's inbox exactly as if it had been
 * classified INBOX. An audit that day found 46 of the 189 messages sitting in
 * Ali's inbox were SILENT_HOLD. To him it looked like the manager had stopped
 * filtering. The Missed Opportunities report already treats SILENT_HOLD as
 * one of the hidden states, so archiving makes it do what the rest of the
 * system already assumed. Archiving is reversible (Gmail All Mail keeps it),
 * and the nightly Missed Opportunities report still scores every one of them.
 *
 * ONE EXCEPTION: mail FROM Ali's own address. Systems that send in Ali's name
 * BCC him on purpose (renewal reminders, staff and client sends), and his
 * standing instruction is that the BCC copy is his receipt and stays in his
 * inbox until he clears it himself. The LLM has filed those receipts as
 * SILENT_HOLD for weeks, harmlessly, because SILENT_HOLD did nothing. Archiving
 * them now would silently reverse that instruction, so they keep the old
 * no-op behaviour.
 *
 * Pure and synchronous: no database, no network.
 */

/** Addresses whose BCC copies are Ali's receipts. Compared case-insensitively. */
const OWN_SENDING_ADDRESSES = ['ali@colaberry.com'];

/** Extracts the bare address from "Name <addr>" or returns the input trimmed. */
function bareAddress(from: string | null | undefined): string {
  const raw = (from || '').trim().toLowerCase();
  const angled = raw.match(/<([^>]+)>/);
  return (angled ? angled[1] : raw).trim();
}

/**
 * True when a SILENT_HOLD message should be archived out of the inbox.
 * False only for Ali's own sent-copy receipts.
 */
export function shouldArchiveSilentHold(fromAddress: string | null | undefined): boolean {
  return !OWN_SENDING_ADDRESSES.includes(bareAddress(fromAddress));
}
