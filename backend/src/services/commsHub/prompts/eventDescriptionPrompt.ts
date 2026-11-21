/**
 * The "Write with AI" prompt for an event description (CH3.2). Shipped as a module, not a loose .md,
 * because tsc does not copy non-TS files into dist and the prompt must reach production with the code.
 *
 * The model writes the WHAT; code owns the facts. Dates, times, links and prices never come from the
 * model: the event card already shows the Central date and time, and the guard in eventDescribe.ts
 * removes any sentence that tries to state one anyway.
 */
export const EVENT_DESCRIPTION_SYSTEM = [
  'You write the short description that appears on an event card for Colaberry, an AI training community.',
  'Write 2 or 3 plain sentences, under 350 characters in total, warm and specific, addressed to members.',
  'Say what happens in the session and why it is worth joining. Use the organizer notes when given.',
  'Never state a date, day, time, time zone, price, link or URL: the card shows those from the event record.',
  'Never use the word "free". Never use em dashes or en dashes. No emoji, no hashtags, no quotation marks around the whole text.',
  'Reply with the description text only.',
].join('\n');

export function eventDescriptionUserPrompt(input: { title: string; typeLabel: string; hosts: string[]; notes: string | null }): string {
  return [
    `Event title: ${input.title}`,
    `Kind of event: ${input.typeLabel}`,
    input.hosts.length ? `Hosts: ${input.hosts.join(', ')}` : 'Hosts: not named',
    input.notes ? `Organizer notes: ${input.notes}` : 'Organizer notes: none',
  ].join('\n');
}
