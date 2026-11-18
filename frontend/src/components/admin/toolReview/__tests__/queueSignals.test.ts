/**
 * The decide console's arithmetic. Every test here is named after the wrong picture it prevents.
 *
 * The overview exists to tell Ali what to do next about letting an agent act on real systems, so a
 * rule that rounds the wrong way is not a cosmetic bug: it is a picture arguing for approving
 * something nobody checked.
 */
import {
  ageDays,
  ageTone,
  decideOrder,
  queueSummary,
  readinessOf,
  riskOf,
  suggestedStep,
  topDuplicate,
  PACKAGE_BLOCKS,
} from '../queueSignals';
import type {
  ChangeRequest,
  PackageReadiness,
  ToolRequestDetail,
} from '../../../../services/agentDomainApi';

const NOW = new Date('2026-11-17T18:00:00Z');

function detail(over: Partial<ToolRequestDetail> = {}): ToolRequestDetail {
  return {
    agent_id: 'a1',
    domain_key: 'admissions',
    tool_name: 'read_explorers',
    purpose: 'Read unpaid Explorer accounts',
    reads: ['explorers'],
    produces: ['a list'],
    capability_id: 'c1',
    task_unblocked: 'Send the weekly report',
    task_key: 'weekly_unpaid_explorer_report',
    manual_today: 'Kalkidan reads it by hand',
    acts_on_output: 'ali@colaberry.com',
    judged_threshold: '20 accounts a week',
    judged_measured_from: 'enrollments',
    tried_in_product: 'not_built',
    missing_from_product: 'No such report exists',
    needed_by: '2026-12-01',
    run_frequency: 'weekly',
    touches: ['accelerator_prod'],
    environment: 'production',
    read_datasets: ['explorers'],
    inputs: [],
    writes: false,
    side_effects: null,
    reversible: null,
    reversibility_note: null,
    ...over,
  } as ToolRequestDetail;
}

function readiness(over: Partial<PackageReadiness> = {}): PackageReadiness {
  return {
    has_package: true,
    ready_for_a_human: true,
    bounced_blocks: [],
    bounce_reasons: [],
    ...over,
  };
}

function req(over: Partial<ChangeRequest> = {}): ChangeRequest {
  return {
    id: 'r1',
    kind: 'tool',
    domain_key: 'admissions',
    title: 'read_explorers: read unpaid Explorer accounts',
    description: null,
    status: 'submitted',
    requested_by_identity: 'kalkidankin@gmail.com',
    requested_at: '2026-11-16T10:00:00Z',
    approved_by_identity: null,
    approved_at: null,
    declined_reason: null,
    tool_request: detail(),
    duplicate_check: null,
    decision_package: null,
    readiness: readiness(),
    ...over,
  };
}

describe('the readiness meter', () => {
  it('counts against ten, because the package has ten blocks', () => {
    expect(PACKAGE_BLOCKS).toHaveLength(10);
  });

  it('a package the API calls ready is 100, not a count of its bounces', () => {
    // The API owns that judgement. Re-deriving it here would put two answers on one screen.
    const r = readinessOf(readiness({ ready_for_a_human: true, bounced_blocks: ['problem'] }));
    expect(r.percent).toBe(100);
    expect(r.tone).toBe('ready');
  });

  it('no package at all is zero and HAZARD, not "ten blocks outstanding"', () => {
    const r = readinessOf(readiness({ has_package: false, ready_for_a_human: false }));
    expect(r.percent).toBe(0);
    expect(r.tone).toBe('hazard');
    expect(r.headline).toContain('No decision package has been written');
  });

  it('absent readiness is treated as no package, never as ready', () => {
    // The field is optional on the API type, and the dangerous default is the generous one.
    expect(readinessOf(undefined).percent).toBe(0);
    expect(readinessOf(undefined).tone).toBe('hazard');
  });

  it('three outstanding blocks is 70, and the tone is attention rather than alarm', () => {
    const r = readinessOf(readiness({
      ready_for_a_human: false,
      bounced_blocks: ['problem', 'key_findings', 'simulated_action'],
    }));
    expect(r.blocks_standing).toBe(7);
    expect(r.percent).toBe(70);
    expect(r.tone).toBe('attention');
  });

  it('does not count one block twice when two rules bounced it', () => {
    const r = readinessOf(readiness({
      ready_for_a_human: false,
      bounced_blocks: ['problem', 'problem', 'problem'],
    }));
    expect(r.blocks_standing).toBe(9);
    expect(r.outstanding).toEqual(['problem']);
  });

  it('names the single outstanding block in words, because that is the send-back', () => {
    const r = readinessOf(readiness({ ready_for_a_human: false, bounced_blocks: ['simulated_action'] }));
    expect(r.headline).toBe('One block is outstanding: simulated action.');
  });
});

describe('what approving it would let the agent do', () => {
  it('a read-only sandbox tool is ready, and nothing is red about it', () => {
    const risk = riskOf(detail({ writes: false, environment: 'sandbox' }));
    expect(risk.radius).toBe('read_only');
    expect(risk.tone).toBe('ready');
  });

  it('a read-only PRODUCTION tool is attention, not green', () => {
    expect(riskOf(detail({ writes: false, environment: 'production' })).tone).toBe('attention');
  });

  it('a write whose reversibility NOBODY STATED is treated as irreversible', () => {
    // The failure this guard exists for: `reversible` is `boolean | null`, and null means nobody
    // answered. Reading silence as "yes, undoable" puts a green chip above a request that
    // deletes something.
    const risk = riskOf(detail({ writes: true, reversible: null, environment: 'production' }));
    expect(risk.radius).toBe('writes_irreversible');
    expect(risk.tone).toBe('hazard');
    expect(risk.label).toBe('Writes, undo not stated');
  });

  it('says plainly when the filer DID state it cannot be undone', () => {
    const risk = riskOf(detail({ writes: true, reversible: false, environment: 'production' }));
    expect(risk.label).toBe('Writes, cannot be undone');
    expect(risk.tone).toBe('hazard');
  });

  it('the same irreversible write in SANDBOX is attention, so red stays meaningful', () => {
    expect(riskOf(detail({ writes: true, reversible: false, environment: 'sandbox' })).tone)
      .toBe('attention');
  });

  it('an undoable write is attention whichever environment it is in', () => {
    expect(riskOf(detail({ writes: true, reversible: true, environment: 'production' })).tone)
      .toBe('attention');
  });

  it('no stored details is UNKNOWN, which is its own tone and not the safe one', () => {
    const risk = riskOf(null);
    expect(risk.radius).toBe('unknown');
    expect(risk.tone).toBe('unknown');
    expect(risk.chips).toEqual([]);
  });
});

describe('age', () => {
  it('is whole days, and null when there is no date', () => {
    expect(ageDays('2026-11-15T18:00:00Z', NOW)).toBe(2);
    expect(ageDays(null, NOW)).toBeNull();
    expect(ageDays('not a date', NOW)).toBeNull();
  });

  it('never goes negative when a clock disagrees', () => {
    expect(ageDays('2026-11-20T18:00:00Z', NOW)).toBe(0);
  });

  it('turns amber at two days and red at five', () => {
    expect(ageTone(1)).toBe('ready');
    expect(ageTone(2)).toBe('attention');
    expect(ageTone(5)).toBe('hazard');
    expect(ageTone(null)).toBe('unknown');
  });
});

describe('the duplicate check', () => {
  it('an unreadable catalog yields NOTHING, never "no duplicates"', () => {
    expect(topDuplicate({
      checked_at: '2026-11-16T10:00:00Z',
      catalog_size: 0,
      catalog_absent: true,
      threshold: 0.5,
      candidates: [{ tool_name: 'send_email', score: 0.9, matched_fields: [] }],
      behaviorless_tools: [],
    })).toBeNull();
  });

  it('a check that is simply absent is null too', () => {
    expect(topDuplicate(null)).toBeNull();
  });
});

describe('what to do next', () => {
  it('a tool request with no details is sent back, before anything else is considered', () => {
    const s = suggestedStep(req({ tool_request: null }), NOW);
    expect(s.verb).toBe('send_back');
    expect(s.tone).toBe('hazard');
  });

  it('a thin package is sent back NAMING the first outstanding block', () => {
    const s = suggestedStep(req({
      readiness: readiness({ ready_for_a_human: false, bounced_blocks: ['simulated_action', 'the_answer'] }),
    }), NOW);
    expect(s.verb).toBe('send_back');
    expect(s.because).toContain('simulated action');
  });

  it('a strong duplicate is raised before anybody judges a new build', () => {
    const s = suggestedStep(req({
      duplicate_check: {
        checked_at: '2026-11-16T10:00:00Z',
        catalog_size: 57,
        catalog_absent: false,
        threshold: 0.5,
        candidates: [{ tool_name: 'read_explorer_accounts', score: 0.82, matched_fields: [] }],
        behaviorless_tools: [],
      },
    }), NOW);
    expect(s.verb).toBe('assign_existing_tool');
    expect(s.because).toContain('read_explorer_accounts');
  });

  it('a duplicate BELOW the threshold does not hijack the suggestion', () => {
    const s = suggestedStep(req({
      duplicate_check: {
        checked_at: '2026-11-16T10:00:00Z',
        catalog_size: 57,
        catalog_absent: false,
        threshold: 0.5,
        candidates: [{ tool_name: 'send_email', score: 0.2, matched_fields: [] }],
        behaviorless_tools: [],
      },
    }), NOW);
    expect(s.verb).toBe('read');
  });

  it('NEVER suggests approving anything, on any input', () => {
    // The line this module does not cross. A console that said "looks good, approve" would be
    // making the decision and calling it a hint.
    const cases: ChangeRequest[] = [
      req(),
      req({ tool_request: detail({ writes: false, environment: 'sandbox' }) }),
      req({ tool_request: detail({ writes: true, reversible: true }) }),
      req({ status: 'approved', approved_by_identity: 'ali@colaberry.com' }),
      req({ tool_request: null }),
      req({ readiness: readiness({ has_package: false, ready_for_a_human: false }) }),
    ];
    for (const c of cases) {
      const s = suggestedStep(c, NOW);
      expect(s.verb).not.toBe('approve_to_build');
      expect(s.label.toLowerCase()).not.toContain('approve');
    }
  });

  it('a production write that cannot be undone says read it closely, in red', () => {
    const s = suggestedStep(req({
      tool_request: detail({ writes: true, reversible: false, environment: 'production' }),
    }), NOW);
    expect(s.verb).toBe('read');
    expect(s.tone).toBe('hazard');
  });

  it('a settled request says so and points at the record', () => {
    const s = suggestedStep(req({ status: 'declined' }), NOW);
    expect(s.label).toBe('Already settled');
    expect(s.tone).toBe('unknown');
  });
});

describe('the overview numbers', () => {
  it('separates what can be decided from what is merely waiting', () => {
    // The pair the old screen could not show. A queue of four with one decidable is not a queue
    // of four, and a single number told Ali to sit down to four decisions he could not make.
    const s = queueSummary([
      req({ id: 'a' }),
      req({ id: 'b', readiness: readiness({ ready_for_a_human: false, bounced_blocks: ['problem'] }) }),
      req({ id: 'c', readiness: readiness({ has_package: false, ready_for_a_human: false }) }),
      req({ id: 'd', status: 'approved' }),
    ], NOW);
    expect(s.total).toBe(4);
    expect(s.waiting).toBe(3);
    expect(s.decidable).toBe(1);
    expect(s.blocked).toBe(2);
    expect(s.settled).toBe(1);
  });

  it('counts hazards only among what is still waiting', () => {
    const hazard = detail({ writes: true, reversible: false, environment: 'production' });
    const s = queueSummary([
      req({ id: 'a', tool_request: hazard }),
      req({ id: 'b', tool_request: hazard, status: 'approved' }),
    ], NOW);
    expect(s.hazardous).toBe(1);
  });

  it('reports the oldest waiting request, and null when nothing waits', () => {
    const s = queueSummary([
      req({ id: 'a', requested_at: '2026-11-16T10:00:00Z' }),
      req({ id: 'b', requested_at: '2026-11-05T10:00:00Z' }),
    ], NOW);
    expect(s.oldest_waiting_days).toBe(12);
    expect(s.stale).toBe(1);
    expect(queueSummary([req({ status: 'approved' })], NOW).oldest_waiting_days).toBeNull();
  });

  it('groups the waiting requests by next step, biggest first and stably', () => {
    const s = queueSummary([
      req({ id: 'a', tool_request: null }),
      req({ id: 'b', tool_request: null }),
      req({ id: 'c' }),
    ], NOW);
    expect(s.by_step.map((x) => [x.verb, x.count])).toEqual([['send_back', 2], ['read', 1]]);
  });

  it('an empty queue is all zeroes and no bars, not a crash', () => {
    const s = queueSummary([], NOW);
    expect(s).toMatchObject({ total: 0, waiting: 0, decidable: 0, blocked: 0, hazardous: 0 });
    expect(s.by_step).toEqual([]);
  });
});

describe('the order rows are read in', () => {
  it('oldest waiting first, settled after, because the API returns newest first', () => {
    const rows = [
      req({ id: 'new', requested_at: '2026-11-17T10:00:00Z' }),
      req({ id: 'settled', requested_at: '2026-11-01T10:00:00Z', status: 'approved' }),
      req({ id: 'old', requested_at: '2026-11-10T10:00:00Z' }),
    ];
    expect([...rows].sort(decideOrder).map((r) => r.id)).toEqual(['old', 'new', 'settled']);
  });
});
