/**
 * T214 — the sales owner is CONFIGURATION, and GHL routing is fail-closed.
 *
 * Rose is the first intended owner as a VALUE, never a name in code. These tests
 * assert that structurally (with a positive control proving the scan can fail)
 * and behaviourally (an unconfigured owner leaves the journey unactivated rather
 * than throwing).
 *
 * NO GHL CODE IS ADDED BY T214. The one GHL change in this task is a fail-OPEN
 * fix in existing routing, covered in `__tests__/services/ghlAccountRouting.test.ts`.
 */
import * as fs from 'fs';
import * as path from 'path';

const policyFindOne = jest.fn();
const killSwitch = jest.fn();
const flagEnabled = jest.fn();

jest.mock('../../../../models', () => ({
  GrowthJourneyPolicy: { findOne: (...a: unknown[]) => policyFindOne(...a) },
}));
jest.mock('../../../launchSafety', () => ({ isKillSwitchActive: () => killSwitch() }));
// The real capability helper rejects a bare flags object, so without this the
// suite returned 'flag_off' and was exercising the FLAG gate rather than the
// owner gate. A test below still proves the flag gate blocks, so this hides
// nothing — it just stops one gate from masking the one under test.
// requireActual, overriding ONE function. Replacing the whole module removed
// `resolveGrowthJourneyFlags`, which `config/env.ts` calls at import time via
// models -> database -> env, and the suite failed to load at all.
jest.mock('../../../../config/growthJourneyFlags', () => ({
  ...jest.requireActual('../../../../config/growthJourneyFlags'),
  isGrowthJourneyCapabilityEnabled: (...a: unknown[]) => flagEnabled(...a),
}));
jest.mock('../../../ticketService', () => ({ createTicket: jest.fn() }));
jest.mock('../../ledger', () => ({ recordJourneyEvent: jest.fn() }));
jest.mock('../../capacityService', () => ({ resolveQueueCapacity: jest.fn() }));
jest.mock('../../../agentBlueprint/ticketCreatorIdentitySeed', () => ({
  getTicketCreatorAdminUserId: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires -- after jest.mock
const { assignHandoff } = require('../assignment');
// eslint-disable-next-line @typescript-eslint/no-var-requires -- after jest.mock
const { OWNER_QUEUES } = require('../../../../models/GrowthJourneyHandoff');

const SRC = path.join(__dirname, '..', 'assignment.ts');
const source = (): string => fs.readFileSync(SRC, 'utf8');

/** Comments stripped: a docblock naming a person is prose, not a branch. */
const stripComments = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/**
 * The patch is applied through a CLOSURE over the row, not through `this`.
 *
 * The first version used `jest.fn(async function (this, p) { Object.assign(this, p) })`,
 * which passed when the suite ran alone and failed in a batch run: the row's
 * `assignment_blocked_reason` came back null because the `this` binding inside a
 * mocked method is not something to rely on. A closure is deterministic.
 */
const row = (over: Record<string, unknown> = {}) => {
  const r: Record<string, unknown> = {
    id: 'h-1',
    status: 'queued',
    brand_id: 'brand-1',
    owner_queue: 'sales',
    assignment_blocked_reason: null,
    evidence: {},
    ...over,
  };
  r.update = jest.fn(async (p: Record<string, unknown>) => {
    Object.assign(r, p);
    return r;
  });
  return r as typeof r & { update: jest.Mock; assignment_blocked_reason: string | null };
};

beforeEach(() => {
  policyFindOne.mockReset();
  killSwitch.mockReset();
  killSwitch.mockResolvedValue(false);
  flagEnabled.mockReset();
  flagEnabled.mockReturnValue(true);
});

const FLAGS = { journeyHandoffs: true } as never;

describe('T214 — an unconfigured owner leaves the journey unactivated, never failing', () => {
  it('returns queued with a reason when no queue_assignee policy exists', async () => {
    policyFindOne.mockResolvedValue(null);
    const r = row();
    const out = await assignHandoff(r, FLAGS);
    expect(out).toEqual({ status: 'queued', reason: 'no_assignee_policy' });
    expect(r.assignment_blocked_reason).toBe('no_assignee_policy');
  });

  it('does not throw, and records the reason ON THE ROW so an operator can see it', async () => {
    policyFindOne.mockResolvedValue(null);
    const r = row();
    await expect(assignHandoff(r, FLAGS)).resolves.toMatchObject({ status: 'queued' });
    expect(r.update).toHaveBeenCalledWith({ assignment_blocked_reason: 'no_assignee_policy' });
  });

  it('is equally unactivated when the policy exists but names no assignee', async () => {
    // A half-filled policy row is not a mapping. Both halves are required.
    policyFindOne.mockResolvedValue({ assigned_to_type: 'admin_user', assigned_to_id: null });
    expect(await assignHandoff(row(), FLAGS)).toEqual({
      status: 'queued', reason: 'no_assignee_policy',
    });
  });

  it('still blocks on the capability flag, so mocking it above hides nothing', async () => {
    flagEnabled.mockReturnValue(false);
    policyFindOne.mockResolvedValue(null);
    expect(await assignHandoff(row(), FLAGS)).toEqual({ status: 'queued', reason: 'flag_off' });
    // and the owner lookup is never even reached
    expect(policyFindOne).not.toHaveBeenCalled();
  });

  it('looks the owner up by BRAND and QUEUE, which is what makes it configuration', async () => {
    policyFindOne.mockResolvedValue(null);
    await assignHandoff(row({ brand_id: 'brand-9', owner_queue: 'solution_architect' }), FLAGS);
    expect(policyFindOne).toHaveBeenCalledWith({
      where: {
        brand_id: 'brand-9',
        policy_type: 'queue_assignee',
        owner_queue: 'solution_architect',
        status: 'active',
      },
    });
  });
});

describe('T214 — no name-based branch in the owner path', () => {
  /**
   * Asserted on the code with comments stripped, because a docblock that
   * mentions a person is documentation, not routing. The scan looks for a
   * BRANCH on a name, not for the characters of a name: `OWNER_QUEUES` contains
   * `'ali'`, which is a QUEUE, and a naive substring scan would flag it and then
   * be loosened until it protected nothing.
   */
  const NAMES = ['rose', 'reese', 'dara', 'kes', 'ram', 'swati', 'farhat'];

  it('branches on owner_queue and policy rows only', () => {
    const code = stripComments(source());
    expect(code).toContain('policy_type: \'queue_assignee\'');
    expect(code).toContain('owner_queue: row.owner_queue');
    for (const name of NAMES) {
      expect(code.toLowerCase()).not.toContain(`'${name}'`);
      expect(code.toLowerCase()).not.toContain(`"${name}"`);
    }
  });

  it('the positive control: the scan DOES catch a planted name literal', () => {
    // Without this the test above passes for a file that contains no strings at
    // all, or if `stripComments` ate the whole file.
    const planted = stripComments(source()).replace(
      "policy_type: 'queue_assignee'",
      "policy_type: 'queue_assignee', assignee: 'rose'",
    );
    expect(planted.toLowerCase()).toContain("'rose'");
    // and the real file does not
    expect(stripComments(source()).toLowerCase()).not.toContain("'rose'");
  });

  it('the two-way control: stripComments removes comments and KEEPS code', () => {
    const code = stripComments(source());
    expect(code).not.toContain('Rose');           // nothing in prose survives either
    expect(code).toContain('export async function assignHandoff');
    expect(code.length).toBeGreaterThan(400);     // it did not eat the file
  });

  it('every owner queue is a ROLE, so the mapping has somewhere to point', () => {
    // 'ali' is a queue in this list, not a person-branch: the code never reads it
    // as a name, and `human_review` is the catch-all. Recorded so the next reader
    // does not mistake the string for name-based routing.
    expect(OWNER_QUEUES).toEqual([
      'admissions', 'sales', 'solution_architect', 'support', 'ali', 'human_review',
    ]);
    expect(stripComments(source())).not.toContain('OWNER_QUEUES');
  });
});

describe('T214 — zero new GHL code paths', () => {
  it('adds no GHL call site to the owner path', () => {
    const code = stripComments(source());
    for (const token of ['ghl', 'gohighlevel', 'calendar', 'appointment', 'free-slots']) {
      expect(code.toLowerCase()).not.toContain(token);
    }
  });

  it('adds no GHL calendar or appointment endpoint anywhere in the repo', () => {
    // The standing constraint for this phase: discovery only, no scheduling.
    //
    // SCOPED TO GHL. A first draft matched `/appointments/` and flagged
    // `routes/admin/leadRoutes.ts` — the INTERNAL admin appointment routes over a
    // local `appointments` table, nothing to do with GHL. Widening an allowlist to
    // make that pass is how a tripwire comes to protect nothing, so the pattern
    // was narrowed to GHL's own calendar surfaces: the modern host (required for
    // any calendar call — the existing client only knows the v1 contact host) and
    // the free-slots endpoint.
    const { execFileSync } = require('child_process');
    const repo = path.join(__dirname, '..', '..', '..', '..', '..', '..');
    let out = '';
    try {
      // EXCLUDES ITS OWN SOURCE, by pathspec. This scan matched the pattern
      // literal in this very file — three times — the moment the file became
      // tracked, so the suite was green while untracked and red once committed.
      // `git grep` only searches TRACKED files, which is why the false green.
      // The fix is a pathspec exclusion, NOT a narrower pattern: weakening the
      // pattern to dodge a self-match is how a tripwire stops protecting
      // anything. The line-206 positive control proves the scan still works.
      out = execFileSync('git', [
        'grep', '-n', '-i', '-E', 'services[.]leadconnectorhq|free-slots',
        '--', 'backend/src',
        ':!backend/src/services/growthJourney/handoffs/__tests__/ownerIsConfiguration.test.ts',
      ], { cwd: repo, encoding: 'utf8' }) as string;
    } catch {
      out = '';   // git grep exits 1 on no matches, which is the pass
    }
    expect(out.trim()).toBe('');
  });

  it('the positive control: that scan DOES see the GHL host the client already uses', () => {
    // Without this, the assertion above would also pass if the grep were simply
    // broken. The v1 contact host is present and legitimate; the MODERN host is
    // the one that would signal calendar work beginning.
    const { execFileSync } = require('child_process');
    const repo = path.join(__dirname, '..', '..', '..', '..', '..', '..');
    const out = execFileSync('git', [
      'grep', '-n', '-i', 'rest[.]gohighlevel', '--', 'backend/src',
    ], { cwd: repo, encoding: 'utf8' }) as string;
    expect(out).toContain('ghlService.ts');
  });
});
