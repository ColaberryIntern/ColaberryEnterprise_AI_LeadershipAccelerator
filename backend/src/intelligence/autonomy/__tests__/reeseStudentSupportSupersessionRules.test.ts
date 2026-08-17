import fs from 'fs';
import path from 'path';
import { classifyStudentSupportSupersession } from '../reeseStudentSupportSupersessionRules';

const T0 = new Date('2026-08-09T20:10:00.000Z');
const T1 = new Date('2026-08-11T01:32:00.000Z');
const T2 = new Date('2026-08-14T00:01:00.000Z');

describe('classifyStudentSupportSupersession — sole ticket', () => {
  it('leaves a room with only one ticket open, regardless of how old it is', () => {
    const result = classifyStudentSupportSupersession({
      ticketId: 'old-ticket',
      ticketStatus: 'backlog',
      createdAt: T0,
      siblings: [],
    });
    expect(result.outcome).toBe('sole_ticket');
    expect(result.shouldClose).toBe(false);
    expect(result.supersededByTicketId).toBeNull();
  });
});

describe('classifyStudentSupportSupersession — superseded (happy path)', () => {
  it('closes the older ticket when a strictly newer sibling exists for the same room', () => {
    const result = classifyStudentSupportSupersession({
      ticketId: 'old-ticket',
      ticketStatus: 'backlog',
      createdAt: T0,
      siblings: [{ id: 'new-ticket', createdAt: T1 }],
    });
    expect(result.outcome).toBe('superseded');
    expect(result.shouldClose).toBe(true);
    expect(result.supersededByTicketId).toBe('new-ticket');
    expect(result.reason).toContain('new-ticket');
  });

  it('points at the NEWEST sibling when more than one newer ticket exists (3-ticket room)', () => {
    const result = classifyStudentSupportSupersession({
      ticketId: 'oldest-ticket',
      ticketStatus: 'backlog',
      createdAt: T0,
      siblings: [
        { id: 'middle-ticket', createdAt: T1 },
        { id: 'newest-ticket', createdAt: T2 },
      ],
    });
    expect(result.shouldClose).toBe(true);
    expect(result.supersededByTicketId).toBe('newest-ticket');
  });
});

describe('classifyStudentSupportSupersession — current ticket (not superseded)', () => {
  it('leaves the NEWEST ticket in a multi-ticket room open', () => {
    const result = classifyStudentSupportSupersession({
      ticketId: 'newest-ticket',
      ticketStatus: 'backlog',
      createdAt: T2,
      siblings: [
        { id: 'oldest-ticket', createdAt: T0 },
        { id: 'middle-ticket', createdAt: T1 },
      ],
    });
    expect(result.outcome).toBe('current');
    expect(result.shouldClose).toBe(false);
    expect(result.supersededByTicketId).toBeNull();
  });

  it('does not close a ticket whose only siblings are OLDER (never looks backward)', () => {
    const result = classifyStudentSupportSupersession({
      ticketId: 'middle-ticket',
      ticketStatus: 'backlog',
      createdAt: T1,
      siblings: [{ id: 'oldest-ticket', createdAt: T0 }],
    });
    expect(result.shouldClose).toBe(false);
  });
});

describe('classifyStudentSupportSupersession — already terminal (defense in depth)', () => {
  it('never closes a ticket that is already done, even with a newer sibling', () => {
    const result = classifyStudentSupportSupersession({
      ticketId: 'old-ticket',
      ticketStatus: 'done',
      createdAt: T0,
      siblings: [{ id: 'new-ticket', createdAt: T1 }],
    });
    expect(result.outcome).toBe('already_terminal');
    expect(result.shouldClose).toBe(false);
  });

  it('never closes a ticket that is already cancelled, even with a newer sibling', () => {
    const result = classifyStudentSupportSupersession({
      ticketId: 'old-ticket',
      ticketStatus: 'cancelled',
      createdAt: T0,
      siblings: [{ id: 'new-ticket', createdAt: T1 }],
    });
    expect(result.shouldClose).toBe(false);
  });
});

describe('classifyStudentSupportSupersession — exact-timestamp tie (boundary)', () => {
  it('resolves deterministically and never throws when two tickets share the exact same created_at', () => {
    const tiedTime = new Date('2026-08-11T01:32:32.669Z');
    const call = () =>
      classifyStudentSupportSupersession({
        ticketId: 'ticket-aaa',
        ticketStatus: 'backlog',
        createdAt: tiedTime,
        siblings: [{ id: 'ticket-zzz', createdAt: tiedTime }],
      });
    expect(call).not.toThrow();
    const first = call();
    const second = call();
    // Same input -> same answer every time (no flapping across repeated calls).
    expect(first).toEqual(second);
  });

  it('tie-break is consistent in both directions (whichever id is lexicographically greater wins "newer")', () => {
    const tiedTime = new Date('2026-08-11T01:32:32.669Z');
    const lower = classifyStudentSupportSupersession({
      ticketId: 'ticket-aaa',
      ticketStatus: 'backlog',
      createdAt: tiedTime,
      siblings: [{ id: 'ticket-zzz', createdAt: tiedTime }],
    });
    const higher = classifyStudentSupportSupersession({
      ticketId: 'ticket-zzz',
      ticketStatus: 'backlog',
      createdAt: tiedTime,
      siblings: [{ id: 'ticket-aaa', createdAt: tiedTime }],
    });
    // Exactly one side of a tie is ever treated as "superseded" — never both, never neither.
    expect([lower.shouldClose, higher.shouldClose].filter(Boolean)).toHaveLength(1);
  });
});

describe('NO time-based fallback closure — regression guard', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../reeseStudentSupportSupersessionRules.ts'),
    'utf8',
  );

  it("this file's own CODE (comments stripped) never reads the current wall clock", () => {
    // A structural-ordering comparison between two PERSISTED created_at values is
    // allowed and expected (see the positive test below) — what must never appear in
    // the executable code is a comparison against the CURRENT time, which is what
    // turns "a real fact" into the forbidden "close after N days elapsed" fallback.
    // The header comment's own PROSE discusses `Date.now()` by name as the pattern
    // being forbidden, so comments are stripped before matching — this assertion is
    // about code, not about whether the file is allowed to explain itself.
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/Date\.now\(\)/);
    expect(codeOnly).not.toMatch(/new Date\(\)/); // constructing "now" with no arguments
  });

  it("this file's own CODE (comments stripped) contains no age/elapsed-duration threshold tokens", () => {
    // Strip `//` and `/* */` comments before matching — the file's own prose
    // legitimately discusses "elapsed time" and "N days" as the concept being
    // forbidden (see the header comment), which must not itself trip this guard.
    // What must never appear in the executable code is an actual age/threshold
    // computation.
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/daysSince/i);
    expect(codeOnly).not.toMatch(/ageInDays/i);
    expect(codeOnly).not.toMatch(/ageInHours/i);
    expect(codeOnly).not.toMatch(/24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/); // a day-in-ms constant
    expect(codeOnly).not.toMatch(/60\s*\*\s*60\s*\*\s*1000/); // an hour-in-ms constant
  });

  it('DOES use a structural comparison between two persisted timestamps (positive control)', () => {
    // Confirms the guard above isn't accidentally passing because the real signal was
    // removed — the classifier's actual closure logic must still be present.
    expect(source).toMatch(/getTime\(\)/);
    expect(source).toMatch(/createdAt/);
  });
});
