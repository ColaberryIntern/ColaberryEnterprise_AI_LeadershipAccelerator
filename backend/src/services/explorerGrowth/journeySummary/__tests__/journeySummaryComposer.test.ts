/**
 * The composer's job is not to produce text, it is to produce only TRUE text.
 * These tests are mostly about what must NOT appear.
 */
import {
  MAX_EVENTS,
  MAX_SUBJECT,
  composeJourneySummary,
} from '../journeySummaryComposer';
import { JourneySummaryInput } from '../journeySummaryTypes';

const AT = new Date('2026-11-27T12:00:00Z');

function input(over: Partial<JourneySummaryInput> = {}): JourneySummaryInput {
  return {
    generatedAt: AT,
    interest: null,
    signals: [],
    events: [],
    nextStep: null,
    caution: null,
    ...over,
  };
}

describe('composeJourneySummary', () => {
  describe('the happy path', () => {
    it('renders every section it has content for', () => {
      const { text } = composeJourneySummary(input({
        interest: 'Moving into an AI engineering role',
        signals: ['High intent', 'Last active 4 days ago'],
        events: [
          { at: new Date('2026-11-25T09:00:00Z'), kind: 'opened', subject: 'Your next step' },
          { at: new Date('2026-11-20T09:00:00Z'), kind: 'sent', subject: 'Welcome' },
        ],
        nextStep: {
          action: 'Send the lesson recap',
          reason: 'Opened twice but has not booked',
          decidedOn: new Date('2026-11-26T00:00:00Z'),
        },
      }));

      expect(text).toContain('INTERESTED IN');
      expect(text).toContain('Moving into an AI engineering role');
      expect(text).toContain('WHAT WE HAVE SENT, NEWEST FIRST');
      expect(text).toContain('2026-11-25  they opened: Your next step');
      expect(text).toContain('2026-11-20  we emailed: Welcome');
      expect(text).toContain('SIGNALS');
      expect(text).toContain('High intent. Last active 4 days ago.');
      expect(text).toContain('NEXT STEP (decided 2026-11-26)');
      expect(text).toContain('As of 2026-11-27');
    });

    it('tells the reader the card is overwritten, so nobody edits it', () => {
      const { text } = composeJourneySummary(input({ interest: 'Anything' }));
      expect(text).toContain('overwritten');
    });
  });

  describe('what must never appear', () => {
    it('never mentions replies, in either direction', () => {
      // We do not track replies for these leads. "No replies" would read as a
      // verdict on the person rather than a gap in our data.
      const { text } = composeJourneySummary(input({
        interest: 'AI leadership',
        events: [{ at: AT, kind: 'sent', subject: 'Hello' }],
        signals: ['High intent'],
      }));
      expect(text!.toLowerCase()).not.toContain('repl');
    });

    it('does not claim an open when only a send was recorded', () => {
      const { text } = composeJourneySummary(input({
        events: [{ at: AT, kind: 'sent', subject: 'Hello' }],
      }));
      expect(text).toContain('we emailed');
      expect(text).not.toContain('they opened');
    });

    it('omits a section entirely rather than printing an empty heading', () => {
      const { text } = composeJourneySummary(input({
        interest: 'AI leadership',
      }));
      expect(text).toContain('INTERESTED IN');
      expect(text).not.toContain('WHAT WE HAVE SENT');
      expect(text).not.toContain('SIGNALS');
      expect(text).not.toContain('NEXT STEP');
      expect(text).not.toContain('CAUTION');
    });

    it('does not tell a caller "do not call", which the data cannot support', () => {
      const { text } = composeJourneySummary(input({
        interest: 'AI leadership',
        caution: { leadStatus: 'unsubscribed' },
      }));
      expect(text).toContain('CAUTION');
      expect(text).toContain('marked unsubscribed');
      expect(text!.toLowerCase()).not.toContain('do not call');
    });
  });

  describe('the empty case', () => {
    it('returns null text and a stated reason when there is nothing to say', () => {
      const { text, emptyReason } = composeJourneySummary(input());
      expect(text).toBeNull();
      expect(emptyReason).toBeTruthy();
    });

    it('treats whitespace-only interest as nothing', () => {
      const { text } = composeJourneySummary(input({ interest: '   ' }));
      expect(text).toBeNull();
    });

    it('drops blank signals rather than rendering stray full stops', () => {
      const { text } = composeJourneySummary(input({
        interest: 'AI leadership',
        signals: ['', '   '],
      }));
      expect(text).not.toContain('SIGNALS');
    });
  });

  describe('boundaries', () => {
    it('caps the journey list and says how much was hidden', () => {
      const events = Array.from({ length: MAX_EVENTS + 3 }, (_, i) => ({
        at: new Date(`2026-11-${String(20 - i).padStart(2, '0')}T09:00:00Z`),
        kind: 'sent' as const,
        subject: `Email ${i}`,
      }));
      const { text } = composeJourneySummary(input({ events }));
      expect(text).toContain('(3 older items not shown)');
      expect(text).toContain('Email 0');
      expect(text).not.toContain(`Email ${MAX_EVENTS + 2}`);
    });

    it('uses the singular when exactly one item is hidden', () => {
      const events = Array.from({ length: MAX_EVENTS + 1 }, (_, i) => ({
        at: AT, kind: 'sent' as const, subject: `Email ${i}`,
      }));
      const { text } = composeJourneySummary(input({ events }));
      expect(text).toContain('(1 older item not shown)');
    });

    it('says so plainly when a subject was never recorded', () => {
      const { text } = composeJourneySummary(input({
        events: [{ at: AT, kind: 'opened', subject: null }],
      }));
      expect(text).toContain('(subject not recorded)');
    });

    it('truncates an overlong subject instead of flooding the card', () => {
      const long = 'x'.repeat(MAX_SUBJECT + 40);
      const { text } = composeJourneySummary(input({
        events: [{ at: AT, kind: 'sent', subject: long }],
      }));
      expect(text).toContain('…');
      expect(text!.length).toBeLessThan(long.length + 300);
    });

    it('collapses newlines in a subject so one email cannot fake extra lines', () => {
      const { text } = composeJourneySummary(input({
        events: [{ at: AT, kind: 'sent', subject: 'Line one\nCAUTION\nfake' }],
      }));
      const cautionCount = (text!.match(/CAUTION/g) || []).length;
      expect(cautionCount).toBe(1); // the injected one only, not a real section
      expect(text).toContain('Line one CAUTION fake');
    });
  });

  describe('determinism', () => {
    it('produces identical text for identical input, so an unchanged card is detectable', () => {
      const a = composeJourneySummary(input({ interest: 'AI', signals: ['High intent'] }));
      const b = composeJourneySummary(input({ interest: 'AI', signals: ['High intent'] }));
      expect(a.text).toBe(b.text);
    });
  });
});
