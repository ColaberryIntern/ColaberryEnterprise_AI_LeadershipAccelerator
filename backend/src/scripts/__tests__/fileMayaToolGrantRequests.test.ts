import fs from 'fs';
import path from 'path';

jest.mock('../../config/database', () => ({ sequelize: { close: jest.fn() } }));
const mockFile = jest.fn();
jest.mock('../../services/agentDomain/agentChangeRequestService', () => ({
  fileChangeRequest: (...a: unknown[]) => mockFile(...a),
}));

import { MAYA_TOOL_GOVERNANCE } from '../../services/maya/mayaToolGovernance';
import { fileMayaToolGrantRequests, skippedTools } from '../fileMayaToolGrantRequests';

/**
 * T12 - the script that puts Maya's tools in front of Ali, and the things it must be unable to do.
 *
 * Two properties matter more than the filing itself:
 *
 *   1. IT APPROVES NOTHING. A script that could grant would make the whole spine decorative.
 *      The structural assertion below reads the import graph rather than trusting the code, so a
 *      future edit that adds `decideChangeRequest` fails here.
 *   2. IT IS IDEMPOTENT. Running it twice files N rows, not 2N. "Works once, breaks on the
 *      second run" is a production defect in this repo, not a rough edge.
 */

const SRC = path.join(__dirname, '..', '..');
const SCRIPT = path.join(SRC, 'scripts', 'fileMayaToolGrantRequests.ts');

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockFile.mockResolvedValue({ id: 'cr-1' });
});
afterEach(() => jest.restoreAllMocks());

describe('T12 it files one request per ready tool', () => {
  it('files nine, one per tool, through the real spine', async () => {
    const result = await fileMayaToolGrantRequests();
    expect(result.filed).toHaveLength(9);
    expect(mockFile).toHaveBeenCalledTimes(9);
    expect(result.refused).toEqual([]);
  });

  it('files each one as kind=tool in the admissions domain, with a tool detail', async () => {
    await fileMayaToolGrantRequests();
    for (const call of mockFile.mock.calls) {
      expect(call[0]).toMatchObject({ kind: 'tool', domainKey: 'admissions' });
      expect(call[0].toolRequest).toBeDefined();
    }
  });

  it('records the proposer as claude-code, NOT Ali', async () => {
    // The grant gate refuses `approver_is_the_proposer`. Filing as Ali would make his own
    // approval impossible, so this is load-bearing rather than cosmetic.
    await fileMayaToolGrantRequests();
    for (const call of mockFile.mock.calls) {
      expect(call[0].email).toBe('claude-code');
      expect(call[0].email).not.toMatch(/ali@/);
    }
  });

  it('gives every request the full detail the gate requires, with nothing blank', async () => {
    await fileMayaToolGrantRequests();
    for (const call of mockFile.mock.calls) {
      const d = call[0].toolRequest;
      // The gate refuses each of these by name. Asserting them here means a filled-in-later
      // field cannot ship as an empty string that reads as present.
      expect(d.tool_name).toBeTruthy();
      expect(d.capability_id).toMatch(/^admissions\./);
      expect(String(d.task_unblocked).length).toBeGreaterThan(20);
      expect(String(d.manual_today).length).toBeGreaterThan(20);
      expect(d.needed_by).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['per_event', 'on_demand']).toContain(d.run_frequency);
      expect(d.touches.length).toBeGreaterThan(0);
      expect(Array.isArray(d.inputs)).toBe(true);
      expect(typeof d.writes).toBe('boolean');
      // A tool that writes must say what it changes and whether that can be undone.
      if (d.writes) {
        expect(String(d.side_effects).length).toBeGreaterThan(20);
        expect(typeof d.reversible).toBe('boolean');
      }
      // It must read something or produce something, or it does nothing.
      expect(d.reads.length + d.produces.length).toBeGreaterThan(0);
    }
  });

  it('a dry run files nothing at all', async () => {
    const result = await fileMayaToolGrantRequests(true);
    expect(result.filed).toHaveLength(9);
    expect(mockFile).not.toHaveBeenCalled();
  });
});

describe('T12 running it twice files nine rows, not eighteen', () => {
  it('treats a duplicate open request as already in front of him', async () => {
    mockFile.mockRejectedValue(new Error('ToolRequestRefused: duplicate_open_request'));
    const second = await fileMayaToolGrantRequests();
    expect(second.filed).toEqual([]);
    expect(second.alreadyOpen).toHaveLength(9);
    // And it is NOT reported as a failure, which is the difference between an idempotent script
    // and one that looks broken on every run after the first.
    expect(second.refused).toEqual([]);
  });

  it('but a real refusal is still reported as one', async () => {
    mockFile.mockRejectedValue(new Error('ToolRequestRefused: capability_unknown'));
    const result = await fileMayaToolGrantRequests();
    expect(result.alreadyOpen).toEqual([]);
    expect(result.refused).toHaveLength(9);
  });
});

describe('T12 what it skips, and why, is recorded per tool', () => {
  it('accounts for every tool on both belts: nine filed, seven skipped', () => {
    const skipped = skippedTools();
    expect(skipped).toHaveLength(7);
    expect(9 + skipped.length).toBe(Object.keys(MAYA_TOOL_GOVERNANCE).length);
  });

  it('skips the three refused-by-name tools, saying approving them would change nothing', () => {
    const byTool = new Map(skippedTools().map((s) => [s.tool, s.reason]));
    for (const tool of ['send_sms_summary', 'initiate_voice_call', 'enroll_in_campaign']) {
      expect(byTool.get(tool)).toMatch(/refused by name/i);
    }
  });

  it('skips the four with no capability record, saying there is no stated purpose', () => {
    const byTool = new Map(skippedTools().map((s) => [s.tool, s.reason]));
    for (const tool of ['send_document', 'draft_marketing_email', 'start_campus_tour',
      'create_journey_handoff']) {
      expect(byTool.get(tool)).toMatch(/no capability record/i);
    }
  });

  it('gives every skipped tool a reason, so none is skipped silently', () => {
    for (const s of skippedTools()) expect(String(s.reason).length).toBeGreaterThan(20);
  });
});

describe('T12 it cannot approve anything', () => {
  const source = fs.readFileSync(SCRIPT, 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('CONTROL - the forbidden names ARE discussed in the comments, so stripping matters', () => {
    expect(source).toMatch(/decideChangeRequest/);
    expect(code).not.toMatch(/decideChangeRequest/);
  });

  it.each([
    ['decideChangeRequest'], ['acceptToolGrant'], ['recordToolGrant'],
    ['AgentDomainToolGrant'], ['approve'],
  ])('imports nothing named %s', (symbol) => {
    const importing = new RegExp(`import[^;]*\\b${symbol}\\b[^;]*from`, 's');
    expect(importing.test(code)).toBe(false);
  });

  it('imports exactly one thing that can write: fileChangeRequest', () => {
    const imports = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)]
      .map(([, names, from]) => ({ names: names.split(',').map((n) => n.trim()), from }));
    const writers = imports.filter((i) => i.from.includes('agentDomain') || i.from.includes('models'));
    expect(writers).toHaveLength(1);
    expect(writers[0].names).toEqual(['fileChangeRequest']);
  });
});
