/**
 * The security scanners must never report a result they did not compute.
 *
 * Quincy reported three faults on 2026-10-26, all of the same shape: a scanner that read nothing
 * and said "clean".
 *
 *   1. the secret and dependency scanners used the old hardcoded project path, which resolves to
 *      `/` inside the production container, so both examined nothing and recorded
 *      "Clean scan, no secrets detected in 0 files" and "0 vulnerabilities across 0 project(s)"
 *   2. a failed `npm audit` returned the same null as "no project here", so the directory fell out
 *      of the count and a run where every audit failed also read as zero
 *   3. the secret scanner kept 80 characters of the matching line and put up to five of them in
 *      the ticket's metadata, so the ticket reporting a leaked key could carry the key
 *
 * Mutations that kill a NAMED test, recorded so the proof can be re-run:
 *
 *   - restore `process.env.PROJECT_ROOT || path.resolve(__dirname, '../../../../..')` in either
 *     scanner and "records a skip, and makes no claim about secrets" / "...about dependencies"
 *     fail
 *   - make runNpmAudit return `{ kind: 'absent' }` on a throw and "an estate nobody could read is
 *     UNKNOWN, not zero" fails
 *   - put `snippet` back on SecretFinding and pass the raw finding to the ticket, and "no part of
 *     the matched line reaches the ticket" fails
 */
jest.mock('../../../../models', () => ({
  Department: { findOne: jest.fn() },
  DepartmentEvent: { create: jest.fn() },
}));
jest.mock('../../../ticketService', () => ({ createTicket: jest.fn() }));
jest.mock('../sourceTreeRoot', () => ({ resolveProjectRoot: jest.fn() }));
jest.mock('child_process', () => ({ execSync: jest.fn() }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { Department, DepartmentEvent } from '../../../../models';
import { createTicket } from '../../../ticketService';
import { resolveProjectRoot } from '../sourceTreeRoot';
import { runSecretDetectionAgent } from '../secretDetectionAgent';
import { runDependencySecurityAgent } from '../dependencySecurityAgent';

const mockRoot = resolveProjectRoot as unknown as jest.Mock;
const mockExec = execSync as unknown as jest.Mock;
const mockDept = Department.findOne as unknown as jest.Mock;
const mockEvent = DepartmentEvent.create as unknown as jest.Mock;
const mockTicket = createTicket as unknown as jest.Mock;

const AGENT_ID = 'agent-row-uuid';

/**
 * A fake AWS key, assembled from pieces so this file does not itself contain something that reads
 * like a credential. `.test.ts` is on the scanner's own exclude list, so it would not be scanned
 * either way; this is belt and braces.
 */
const FAKE_AWS_KEY = `AKIA${'TESTKEY'}${'000000000'}`;

let warnSpy: jest.SpyInstance;
let tmpDirs: string[] = [];

/** A throwaway project tree with one planted secret, so the file walk is exercised for real. */
function plantSourceTree(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'));
  tmpDirs.push(root);
  const backendSrc = path.join(root, 'backend', 'src', 'routes');
  fs.mkdirSync(backendSrc, { recursive: true });
  fs.writeFileSync(
    path.join(backendSrc, 'leaky.ts'),
    `const client = { accessKeyId: '${FAKE_AWS_KEY}' };\n`,
    'utf-8',
  );
  return root;
}

beforeEach(() => {
  jest.clearAllMocks();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockDept.mockResolvedValue({ id: 'security-dept-uuid' });
  mockEvent.mockResolvedValue({});
  mockTicket.mockResolvedValue({ id: 'ticket-uuid' });
});

afterEach(() => {
  warnSpy.mockRestore();
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  tmpDirs = [];
});

describe('no source tree is a skip, not a clean bill of health', () => {
  it('records a skip, and makes no claim about secrets', async () => {
    mockRoot.mockReturnValue(null);

    const result = await runSecretDetectionAgent(AGENT_ID, {});

    expect(result.actions_taken).toHaveLength(1);
    expect(result.actions_taken[0].action).toBe('scan_skipped_no_source');
    expect(result.actions_taken[0].result).toBe('skipped');
    // The load-bearing assertion: nothing was written that a reader could mistake for a verdict.
    expect(mockEvent).not.toHaveBeenCalled();
    expect(mockTicket).not.toHaveBeenCalled();
    expect(result.entities_processed).toBe(0);
  });

  it('records a skip, and makes no claim about dependencies', async () => {
    mockRoot.mockReturnValue(null);

    const result = await runDependencySecurityAgent(AGENT_ID, {});

    expect(result.actions_taken[0].action).toBe('scan_skipped_no_source');
    expect(result.actions_taken[0].result).toBe('skipped');
    expect(mockEvent).not.toHaveBeenCalled();
    // `npm audit` must not even be attempted when there is no tree to audit.
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('says so in the log, with an event name that can be searched for', async () => {
    mockRoot.mockReturnValue(null);
    await runSecretDetectionAgent(AGENT_ID, {});
    const logged = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(logged.event).toBe('source_scan_skipped_no_source_tree');
    expect(logged.outcome).toBe('partial');
  });
});

describe('the secret never travels with the report', () => {
  it('finds the planted key at all, so the next assertion means something', async () => {
    mockRoot.mockReturnValue(plantSourceTree());

    const result = await runSecretDetectionAgent(AGENT_ID, {});

    expect(result.entities_processed).toBe(1);
    expect(mockTicket).toHaveBeenCalledTimes(1);
  });

  it('no part of the matched line reaches the ticket', async () => {
    mockRoot.mockReturnValue(plantSourceTree());

    await runSecretDetectionAgent(AGENT_ID, {});

    const serialized = JSON.stringify(mockTicket.mock.calls[0][0]);
    expect(serialized).not.toContain(FAKE_AWS_KEY);
    // Not even a prefix of it. An 80-character window over `accessKeyId: 'AKIA...'` would have
    // carried the whole thing, so a partial match is the same failure.
    expect(serialized).not.toContain(FAKE_AWS_KEY.slice(0, 12));
    // What it SHOULD carry: where to look.
    expect(serialized).toContain('leaky.ts');
  });

  it('no part of the matched line reaches the department event either', async () => {
    mockRoot.mockReturnValue(plantSourceTree());

    await runSecretDetectionAgent(AGENT_ID, {});

    expect(JSON.stringify(mockEvent.mock.calls[0][0])).not.toContain(FAKE_AWS_KEY.slice(0, 12));
  });
});

describe('a dependency audit that failed is not a dependency audit that passed', () => {
  const auditJson = (vulns: Record<string, any>) => JSON.stringify({ vulnerabilities: vulns });

  /** Make `backend` and `frontend` both look like real projects under a planted root. */
  function plantTwoProjects(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
    tmpDirs.push(root);
    for (const name of ['backend', 'frontend']) {
      fs.mkdirSync(path.join(root, name), { recursive: true });
      fs.writeFileSync(path.join(root, name, 'package.json'), '{"name":"x"}', 'utf-8');
    }
    return root;
  }

  it('an estate nobody could read is UNKNOWN, not zero', async () => {
    mockRoot.mockReturnValue(plantTwoProjects());
    mockExec.mockImplementation(() => { throw new Error('ENOENT: npm not found'); });

    const result = await runDependencySecurityAgent(AGENT_ID, {});

    const action = result.actions_taken[0];
    expect(action.action).toBe('dependency_audit_unknown');
    expect(action.result).toBe('flagged');
    expect((action.after_state as any).coverage).toBe('none');
    // Null, not 0. A zero here is the whole bug.
    expect((action.after_state as any).total_vulns).toBeNull();
    expect(action.confidence).toBe(0);
    // And the failure is surfaced, so runAgent logs the run as failed rather than successful.
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatch(/npm audit failed/i);
  });

  it('says UNKNOWN on the department event, at a severity someone will look at', async () => {
    mockRoot.mockReturnValue(plantTwoProjects());
    mockExec.mockImplementation(() => { throw new Error('boom'); });

    await runDependencySecurityAgent(AGENT_ID, {});

    const event = mockEvent.mock.calls[0][0];
    expect(event.title).toMatch(/UNKNOWN/);
    expect(event.description).toMatch(/never read/i);
    expect(event.severity).toBe('high');
    expect(event.metadata.coverage).toBe('none');
  });

  it('a partial audit is reported as partial, not as the total', async () => {
    mockRoot.mockReturnValue(plantTwoProjects());
    let call = 0;
    mockExec.mockImplementation(() => {
      call += 1;
      if (call === 1) return auditJson({ lodash: { severity: 'moderate', via: [{}] } });
      throw new Error('audit exploded');
    });

    const result = await runDependencySecurityAgent(AGENT_ID, {});

    const action = result.actions_taken[0];
    expect(action.action).toBe('dependency_audit');
    expect((action.after_state as any).coverage).toBe('partial');
    expect((action.after_state as any).projects_audited).toBe(1);
    expect((action.after_state as any).audit_failures).toBe(1);
    // Flagged even though the one project that WAS audited looked fine, because the number is
    // not the whole answer.
    expect(action.result).toBe('flagged');
    expect(action.reason).toMatch(/partial/i);
    expect(result.errors).toHaveLength(1);
  });

  it('a genuinely clean estate still reads as clean', async () => {
    // The fix has to leave the true-negative alone, or it just trades one wrong answer for
    // another.
    mockRoot.mockReturnValue(plantTwoProjects());
    mockExec.mockReturnValue(auditJson({}));

    const result = await runDependencySecurityAgent(AGENT_ID, {});

    const action = result.actions_taken[0];
    expect(action.action).toBe('dependency_audit');
    expect(action.result).toBe('success');
    expect((action.after_state as any).coverage).toBe('complete');
    expect((action.after_state as any).total_vulns).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('still flags a real critical finding', async () => {
    mockRoot.mockReturnValue(plantTwoProjects());
    mockExec.mockReturnValue(auditJson({
      'bad-pkg': { severity: 'critical', via: [{ source: 1, title: 'RCE', url: 'u' }] },
    }));

    const result = await runDependencySecurityAgent(AGENT_ID, {});

    expect(result.actions_taken[0].result).toBe('flagged');
    expect((result.actions_taken[0].after_state as any).critical).toBe(2);
    expect(mockTicket).toHaveBeenCalledTimes(1);
  });
});
