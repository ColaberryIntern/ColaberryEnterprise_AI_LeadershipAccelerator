/**
 * Render a lead's journey as the short card Rose and Taiwo read before they
 * call (T208). Pure: no database, no network, no clock of its own.
 *
 * WHO READS THIS: two people, on a phone, about to speak to a stranger. The
 * card is worth having only if everything on it is true. So:
 *
 *   - A section with nothing in it is OMITTED, never printed empty. An empty
 *     heading reads as "we have nothing on them", which is a different claim
 *     from "we did not look". `explorerWhyService` sets this precedent.
 *   - Nothing is inferred. "Opened" appears only where an open was recorded.
 *     Replies are never mentioned at all, in either direction, because we do
 *     not track them for these leads and "no replies" would read as a verdict
 *     on the person.
 *   - The card carries the date it was built, so a caller can see at a glance
 *     that last night's job did not run rather than trusting stale lines.
 *
 * WHY THERE IS A LENGTH CEILING: the GHL field is LARGE_TEXT, but a card nobody
 * finishes reading is not read at all. Six journey lines is roughly what fits
 * on a phone beside a dialer.
 */
import { ComposedSummary, JourneyEvent, JourneySummaryInput } from './journeySummaryTypes';

/** Most anyone reads before picking up the phone. */
export const MAX_EVENTS = 6;

/** Belt and braces against a pathological subject line. */
export const MAX_SUBJECT = 70;

const KIND_LABEL: Record<JourneyEvent['kind'], string> = {
  sent: 'we emailed',
  opened: 'they opened',
  clicked: 'they clicked',
};

/** YYYY-MM-DD in UTC, which is what every other dated surface here uses. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function trimSubject(subject: string | null): string {
  if (!subject) return '(subject not recorded)';
  const clean = subject.replace(/\s+/g, ' ').trim();
  if (!clean) return '(subject not recorded)';
  return clean.length > MAX_SUBJECT ? `${clean.slice(0, MAX_SUBJECT - 1)}…` : clean;
}

function renderEvents(events: JourneyEvent[]): string[] {
  const shown = events.slice(0, MAX_EVENTS);
  const lines = shown.map(
    (e) => `${isoDate(e.at)}  ${KIND_LABEL[e.kind]}: ${trimSubject(e.subject)}`,
  );
  const hidden = events.length - shown.length;
  // Say that older history exists rather than silently truncating: a caller who
  // can see there is more will ask, where one who cannot will assume this is all.
  if (hidden > 0) lines.push(`(${hidden} older ${hidden === 1 ? 'item' : 'items'} not shown)`);
  return lines;
}

/**
 * Compose the card. Returns `text: null` when every section would be empty,
 * which the caller should treat as "write nothing", not as a failure.
 */
export function composeJourneySummary(input: JourneySummaryInput): ComposedSummary {
  const sections: string[] = [];

  if (input.interest && input.interest.trim()) {
    sections.push(`INTERESTED IN\n${input.interest.trim()}`);
  }

  if (input.events.length > 0) {
    sections.push(`WHAT WE HAVE SENT, NEWEST FIRST\n${renderEvents(input.events).join('\n')}`);
  }

  const signals = input.signals.map((s) => s.trim()).filter(Boolean);
  if (signals.length > 0) {
    sections.push(`SIGNALS\n${signals.join('. ')}.`);
  }

  if (input.nextStep) {
    sections.push(
      `NEXT STEP (decided ${isoDate(input.nextStep.decidedOn)})\n`
        + `${input.nextStep.action}. ${input.nextStep.reason}`,
    );
  }

  if (input.caution) {
    // Stated as the fact it is. We do not say "do not call": the suppression is
    // recorded against outbound generally, and phone consent is separately
    // almost entirely unrecorded, so a stronger claim would not be supportable.
    sections.push(
      `CAUTION\nThis lead is marked ${input.caution.leadStatus} in our system, `
        + 'which stops our outbound. Check before contacting.',
    );
  }

  if (sections.length === 0) {
    return {
      text: null,
      emptyReason: 'no interest, no email history, no signals, no next step and no caution',
    };
  }

  const footer = `As of ${isoDate(input.generatedAt)}. Written automatically by enterprise. `
    + 'Anything typed here is overwritten.';

  return { text: `${sections.join('\n\n')}\n\n${footer}`, emptyReason: null };
}
