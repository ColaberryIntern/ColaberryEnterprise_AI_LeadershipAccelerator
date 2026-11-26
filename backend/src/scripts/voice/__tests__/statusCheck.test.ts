import fs from 'fs';
import os from 'os';
import path from 'path';
import { checkReadiness, GATES, goNoGo, missingLinks, run, verifiedRequirements } from '../statusCheck';

const table = (p: Record<string, string> = {}) => ['| Id | Requirement | Status | Evidence |', '|---|---|---|---|', ...GATES.map((g) => `| ${g} | Something | ${p[g] ?? 'PASS | a report'} |`)].join('\n');
const req = (pass: number, total = 12) => Array.from({ length: total }, (_x, i) => `| V${String(i + 1).padStart(2, '0')} | r | VS1.1 | ${i < pass ? 'PASS' : 'not verified'} |`).join('\n');

describe('go or no-go', () => {
  it('GO only when every row is PASS', () => expect(goNoGo(table())).toEqual({ verdict: 'GO', problems: [], open: [] }));
  it('only approvals left is not GO', () => expect(goNoGo(table({ G09: 'APPROVAL_REQUIRED | M5' }))).toEqual({ verdict: 'WAITING_FOR_OWNER', problems: [], open: [{ id: 'G09', status: 'APPROVAL_REQUIRED' }] }));
  it.each(['NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED_UNVERIFIED', 'FAIL', 'BLOCKED', 'RETIRED'])('%s is NO_GO', (s) => expect(goNoGo(table({ G03: `${s} | x` })).verdict).toBe('NO_GO'));
  it.each<[string, string, string]>([
    ['PASS without evidence', table({ G02: 'PASS | ' }), 'G02: PASS without evidence'], ['an approval nobody named', table({ G02: 'APPROVAL_REQUIRED | ' }), 'G02: does not say which approval'],
    ['an invented status', table({ G02: 'MOSTLY | x' }), 'G02: unknown status'], ['a lower case status', table({ G02: 'pass | x' }), 'G02: unknown status'], ['a removed row', table().replace(/\| G07 .*\n/, ''), 'G07: missing'],
    ['a row twice', `${table()}\n| G01 | x | PASS | y |`, 'G01: listed more than once'], ['a row of its own', `${table()}\n| G99 | x | PASS | y |`, 'G99: not a checklist row'], ['nothing', '', 'G01: missing'],
  ])('%s is a problem', (_n, md, p) => { const r = goNoGo(md); expect(r.verdict).toBe('NO_GO'); expect(r.problems).toContain(p); });
});

describe('readiness', () => {
  it('counts only PASS', () => expect(verifiedRequirements(req(3))).toEqual({ verified: 3, total: 12 }));
  it('the percent is recomputed', () => {
    expect(checkReadiness('Readiness: 3 of 12 requirements verified (25%).', req(3))).toEqual([]);
    expect(checkReadiness('Readiness: 4 of 12 requirements verified (33%).', req(3))).toHaveLength(1);
    expect(checkReadiness('Readiness: 3 of 11 requirements verified.', req(3, 11))).toEqual(['REQUIREMENTS.md has 11 requirements, not 12']);
  });
  it('cannot say retired early', () => expect(checkReadiness('Readiness: 3 of 12 requirements verified (25%). SYNTHFLOW_RETIRED', req(3))).toContain('STATUS.md says retired before every requirement is verified'));
  it('a passed task needs a comment link on its own row', () => {
    const url = 'https://app.basecamp.com/1/buckets/2/todos/3#__recording_4';
    const tasks = [{ id: 'T1', ticket: 'VS1.1', status: 'passed' }, { id: 'T2', ticket: 'VS1.2', status: 'passed' }, { id: 'T3', ticket: 'VS1.3', status: 'pending' }];
    expect(missingLinks(`| VS1.1 | ${url} |\n| VS1.2 | todo |`, tasks)).toEqual(['VS1.2: passed with no comment link in STATUS.md']);
    expect(missingLinks(`| VS1.1 | ${url} |\n| VS1.2 | ${url} |`, tasks)).toEqual([]);
  });
});

describe('the command', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-'));
  const put = (f: string, s: string) => fs.writeFileSync(path.join(dir, f), s);
  beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => undefined); jest.spyOn(console, 'error').mockImplementation(() => undefined); });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  it('exits 0, 1 and 2', () => {
    expect(run(['--go-no-go'], dir)).toBe(2);
    put('GO_NO_GO.md', table({ G09: 'APPROVAL_REQUIRED | M5' }));
    expect(run(['--go-no-go'], dir)).toBe(0);
    put('GO_NO_GO.md', table({ G09: 'FAIL | x' }));
    expect(run(['--go-no-go'], dir)).toBe(1);
    put('STATUS.md', 'Readiness: 0 of 12 requirements verified (0%).');
    put('REQUIREMENTS.md', req(0));
    expect(run([], dir)).toBe(0);
    put('ledger.json', JSON.stringify({ tasks: [{ id: 'T1', ticket: 'VS1.1', status: 'passed' }] }));
    expect(run(['--ledger', path.join(dir, 'ledger.json')], dir)).toBe(1);
    expect(run(['--nope'], dir)).toBe(2);
    put('REQUIREMENTS.md', req(1));
    expect(run([], dir)).toBe(1);
  });
  it('the real documents are well formed', () => {
    const docs = path.resolve(__dirname, '../../../../../docs/voice-studio');
    expect(goNoGo(fs.readFileSync(path.join(docs, 'GO_NO_GO.md'), 'utf8')).problems).toEqual([]);
    expect(run([], docs)).toBe(0);
  });
});
