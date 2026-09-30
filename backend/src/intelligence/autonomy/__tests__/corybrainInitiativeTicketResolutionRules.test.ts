import fs from 'fs';
import path from 'path';
import { classifyCoryBrainInitiativeTicket } from '../corybrainInitiativeTicketResolutionRules';

describe('classifyCoryBrainInitiativeTicket — initiative cancelled', () => {
  it('parent ticket: linked initiative cancelled -> shouldClose true, targetStatus cancelled', () => {
    const result = classifyCoryBrainInitiativeTicket({
      ticketId: 't-parent-1',
      isSubtask: false,
      linkedInitiativeId: 'init-1',
      linkedInitiativeStatus: 'cancelled',
      linkedInitiativeTitle: 'CampaignQAAgent is slow',
    });
    expect(result.outcome).toBe('initiative_cancelled');
    expect(result.shouldClose).toBe(true);
    expect(result.targetStatus).toBe('cancelled');
    expect(result.evidenceNote).toContain('init-1');
    expect(result.evidenceNote).toContain('CampaignQAAgent is slow');
    expect(result.evidenceNote).toContain('parent ticket for');
  });

  it('subtask ticket: linked initiative cancelled -> shouldClose true, targetStatus cancelled, evidence says "subtask"', () => {
    const result = classifyCoryBrainInitiativeTicket({
      ticketId: 't-sub-1',
      isSubtask: true,
      linkedInitiativeId: 'init-2',
      linkedInitiativeStatus: 'cancelled',
      linkedInitiativeTitle: 'Admissions department triggered 9 alerts in 24h',
    });
    expect(result.outcome).toBe('initiative_cancelled');
    expect(result.shouldClose).toBe(true);
    expect(result.targetStatus).toBe('cancelled');
    expect(result.evidenceNote).toContain('a subtask of');
  });
});

describe('classifyCoryBrainInitiativeTicket — initiative completed', () => {
  it('subtask ticket: linked initiative completed -> shouldClose true, targetStatus done', () => {
    const result = classifyCoryBrainInitiativeTicket({
      ticketId: 't-sub-2',
      isSubtask: true,
      linkedInitiativeId: 'init-3',
      linkedInitiativeStatus: 'completed',
      linkedInitiativeTitle: 'System Resilience department triggered 7 alerts in 24h',
    });
    expect(result.outcome).toBe('initiative_completed');
    expect(result.shouldClose).toBe(true);
    expect(result.targetStatus).toBe('done');
    expect(result.evidenceNote).toContain('init-3');
  });

  it('parent ticket: linked initiative completed -> shouldClose true, targetStatus done', () => {
    const result = classifyCoryBrainInitiativeTicket({
      ticketId: 't-parent-2',
      isSubtask: false,
      linkedInitiativeId: 'init-4',
      linkedInitiativeStatus: 'completed',
      linkedInitiativeTitle: 'OpenclawLearningOptimizationAgent has 62% error rate',
    });
    expect(result.outcome).toBe('initiative_completed');
    expect(result.shouldClose).toBe(true);
    expect(result.targetStatus).toBe('done');
    expect(result.evidenceNote).toContain('the parent ticket for');
  });
});

describe('classifyCoryBrainInitiativeTicket — initiative still active', () => {
  it.each(['proposed', 'approved', 'in_progress'] as const)(
    'linked initiative status "%s" -> shouldClose false, left open',
    (status) => {
      const result = classifyCoryBrainInitiativeTicket({
        ticketId: 't-active',
        isSubtask: false,
        linkedInitiativeId: 'init-5',
        linkedInitiativeStatus: status,
        linkedInitiativeTitle: 'Some active finding',
      });
      expect(result.outcome).toBe('initiative_still_active');
      expect(result.shouldClose).toBe(false);
      expect(result.targetStatus).toBeNull();
      expect(result.evidenceNote).toContain(status);
    },
  );

  it('subtask variant also reports still-active correctly', () => {
    const result = classifyCoryBrainInitiativeTicket({
      ticketId: 't-active-sub',
      isSubtask: true,
      linkedInitiativeId: 'init-6',
      linkedInitiativeStatus: 'proposed',
      linkedInitiativeTitle: 'Some active finding',
    });
    expect(result.shouldClose).toBe(false);
    expect(result.evidenceNote).toContain('a subtask of');
  });
});

describe('classifyCoryBrainInitiativeTicket — no matching initiative row', () => {
  it('linkedInitiativeId null -> initiative_not_found, never closes', () => {
    const result = classifyCoryBrainInitiativeTicket({
      ticketId: 't-orphan',
      isSubtask: false,
      linkedInitiativeId: null,
      linkedInitiativeStatus: null,
      linkedInitiativeTitle: null,
    });
    expect(result.outcome).toBe('initiative_not_found');
    expect(result.shouldClose).toBe(false);
    expect(result.targetStatus).toBeNull();
    expect(result.evidenceNote).toContain('No matching strategic_initiatives row');
  });

  it('is total/never throws on an inconsistent input shape (id set but status null)', () => {
    expect(() =>
      classifyCoryBrainInitiativeTicket({
        ticketId: 't-weird',
        isSubtask: false,
        linkedInitiativeId: 'init-7',
        linkedInitiativeStatus: null,
        linkedInitiativeTitle: null,
      }),
    ).not.toThrow();
  });

  it('never throws and never closes on an unrecognized status value', () => {
    const result = classifyCoryBrainInitiativeTicket({
      ticketId: 't-unknown-status',
      isSubtask: false,
      linkedInitiativeId: 'init-8',
      // Defensive case: model's real enum never produces this, but the function must
      // stay total rather than assuming the caller always passes a known value.
      linkedInitiativeStatus: 'some_future_status' as any,
      linkedInitiativeTitle: 'x',
    });
    expect(result.shouldClose).toBe(false);
    expect(result.targetStatus).toBeNull();
  });
});

describe('NO time-based fallback closure — regression guard', () => {
  it("this file's own source contains none of the tokens a time-based close gate would use", () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../corybrainInitiativeTicketResolutionRules.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/Date\.now\(\)/);
    expect(source).not.toMatch(/getTime\(\)/);
    expect(source).not.toMatch(/daysSince/i);
    expect(source).not.toMatch(/ageInDays/i);
    expect(source).not.toMatch(/created_at\s*[<>]/);
    expect(source).not.toMatch(/createdAt\s*[<>]/);
  });
});
