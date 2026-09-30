import fs from 'fs';
import path from 'path';
import { classifyBposCapabilityTicket } from '../bposCapabilityTicketResolutionRules';

describe('classifyBposCapabilityTicket — capability deleted', () => {
  it('closes to cancelled when the referenced capability row no longer exists', () => {
    const result = classifyBposCapabilityTicket({
      ticketId: 'ticket-1',
      ticketStatus: 'in_progress',
      entityId: 'cap-deleted',
      capability: null,
    });
    expect(result.outcome).toBe('capability_deleted');
    expect(result.shouldClose).toBe(true);
    expect(result.closeToStatus).toBe('cancelled');
    expect(result.reason).toContain('cap-deleted');
  });
});

describe('classifyBposCapabilityTicket — capability verified (happy path sync gap)', () => {
  it('closes to done when the capability is verified', () => {
    const result = classifyBposCapabilityTicket({
      ticketId: 'ticket-2',
      ticketStatus: 'in_progress',
      entityId: 'cap-verified',
      capability: { userStatus: 'verified' },
    });
    expect(result.outcome).toBe('capability_verified');
    expect(result.shouldClose).toBe(true);
    expect(result.closeToStatus).toBe('done');
    expect(result.reason).toContain('cap-verified');
    expect(result.reason.toLowerCase()).toContain('verified');
  });
});

describe('classifyBposCapabilityTicket — capability still in_progress (genuine stall)', () => {
  it('leaves the ticket open, no signal', () => {
    const result = classifyBposCapabilityTicket({
      ticketId: 'ticket-3',
      ticketStatus: 'in_progress',
      entityId: 'cap-inprogress',
      capability: { userStatus: 'in_progress' },
    });
    expect(result.outcome).toBe('no_signal');
    expect(result.shouldClose).toBe(false);
    expect(result.closeToStatus).toBeNull();
  });
});

describe('classifyBposCapabilityTicket — capability archived', () => {
  it('leaves the ticket open, no signal (archived is not treated as verified/done)', () => {
    const result = classifyBposCapabilityTicket({
      ticketId: 'ticket-4',
      ticketStatus: 'in_progress',
      entityId: 'cap-archived',
      capability: { userStatus: 'archived' },
    });
    expect(result.outcome).toBe('no_signal');
    expect(result.shouldClose).toBe(false);
  });
});

describe('classifyBposCapabilityTicket — already terminal (defense in depth)', () => {
  it('never closes a ticket that is already done, even if the capability is verified', () => {
    const result = classifyBposCapabilityTicket({
      ticketId: 'ticket-5',
      ticketStatus: 'done',
      entityId: 'cap-verified',
      capability: { userStatus: 'verified' },
    });
    expect(result.outcome).toBe('already_terminal');
    expect(result.shouldClose).toBe(false);
  });

  it('never closes a ticket that is already cancelled, even if the capability was deleted', () => {
    const result = classifyBposCapabilityTicket({
      ticketId: 'ticket-6',
      ticketStatus: 'cancelled',
      entityId: 'cap-deleted',
      capability: null,
    });
    expect(result.outcome).toBe('already_terminal');
    expect(result.shouldClose).toBe(false);
  });
});

describe('classifyBposCapabilityTicket — missing entity_id (defense in depth)', () => {
  it('leaves the ticket open, no signal, never throws', () => {
    const call = () =>
      classifyBposCapabilityTicket({
        ticketId: 'ticket-7',
        ticketStatus: 'in_progress',
        entityId: null,
        capability: null,
      });
    expect(call).not.toThrow();
    const result = call();
    expect(result.outcome).toBe('no_signal');
    expect(result.shouldClose).toBe(false);
  });
});

describe('classifyBposCapabilityTicket — unknown user_status value (defense in depth)', () => {
  it('treats any non-verified status as no_signal, never throws, never closes', () => {
    const result = classifyBposCapabilityTicket({
      ticketId: 'ticket-8',
      ticketStatus: 'in_progress',
      entityId: 'cap-weird',
      capability: { userStatus: null },
    });
    expect(result.outcome).toBe('no_signal');
    expect(result.shouldClose).toBe(false);
  });
});

describe('NO time-based fallback closure — regression guard', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../bposCapabilityTicketResolutionRules.ts'),
    'utf8',
  );

  it("this file's own CODE (comments stripped) never reads the current wall clock", () => {
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/Date\.now\(\)/);
    expect(codeOnly).not.toMatch(/new Date\(\)/);
  });

  it("this file's own CODE (comments stripped) contains no age/elapsed-duration threshold tokens", () => {
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/daysSince/i);
    expect(codeOnly).not.toMatch(/ageInDays/i);
    expect(codeOnly).not.toMatch(/ageInHours/i);
    expect(codeOnly).not.toMatch(/24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
    expect(codeOnly).not.toMatch(/60\s*\*\s*60\s*\*\s*1000/);
  });

  it('DOES use the real capability.userStatus / row-existence checks (positive control)', () => {
    expect(source).toMatch(/userStatus === 'verified'/);
    expect(source).toMatch(/capability === null/);
  });
});
