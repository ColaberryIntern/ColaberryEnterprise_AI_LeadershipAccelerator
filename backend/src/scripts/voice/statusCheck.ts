/**
 * voice:status-check (VS0.3, VS5.5). Reads documents only.
 *
 *   npm run voice:status-check                              STATUS.md percent equals verified requirements / 12
 *   npm run voice:status-check -- --ledger <state-ledger>   also: every passed task has a Basecamp comment link in STATUS.md
 *   npm run voice:status-check -- --go-no-go                the retirement checklist (GO_NO_GO.md)
 *
 * Exit: 0 clean, 1 a problem (listed), 2 refused. For --go-no-go, 0 means only owner decisions remain; the
 * printed verdict says GO only when every row is PASS.
 */
import fs from 'fs';
import path from 'path';

export const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED_UNVERIFIED', 'PASS', 'FAIL', 'BLOCKED', 'APPROVAL_REQUIRED', 'RETIRED'];
export const GATES = Array.from({ length: 12 }, (_x, i) => `G${String(i + 1).padStart(2, '0')}`);
const DOCS = path.resolve(__dirname, '../../../../docs/voice-studio');

const cells = (l: string): string[] => l.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
const tableRows = (md: string, id: RegExp): string[][] => md.split(/\r?\n/).filter((l) => l.trim().startsWith('|')).map(cells).filter((c) => id.test(c[0]));

export interface GoNoGo { verdict: 'GO' | 'WAITING_FOR_OWNER' | 'NO_GO'; problems: string[]; open: Array<{ id: string; status: string }> }

export function goNoGo(md: string): GoNoGo {
  const rows = tableRows(md, /^G\d+$/);
  const problems: string[] = [];
  for (const g of GATES) {
    const n = rows.filter((r) => r[0] === g).length;
    if (n !== 1) problems.push(`${g}: ${n ? 'listed more than once' : 'missing'}`);
  }
  for (const r of rows) {
    const [id, requirement, status, evidence] = r;
    if (!GATES.includes(id)) problems.push(`${id}: not a checklist row`);
    if (r.length !== 4 || !requirement) problems.push(`${id}: malformed row`);
    else if (!STATUSES.includes(status)) problems.push(`${id}: unknown status`);
    else if (status === 'PASS' && !evidence) problems.push(`${id}: PASS without evidence`);
    else if (status === 'APPROVAL_REQUIRED' && !evidence) problems.push(`${id}: does not say which approval`);
  }
  const open = rows.filter((r) => r[2] !== 'PASS').map((r) => ({ id: r[0], status: r[2] ?? '' }));
  const verdict = problems.length || open.some((o) => o.status !== 'APPROVAL_REQUIRED') ? 'NO_GO' : open.length ? 'WAITING_FOR_OWNER' : 'GO';
  return { verdict, problems, open };
}

/** The status column of REQUIREMENTS.md is the last one. */
export const verifiedRequirements = (md: string): { verified: number; total: number } => {
  const rows = tableRows(md, /^V\d\d$/);
  return { verified: rows.filter((r) => r[r.length - 1] === 'PASS').length, total: rows.length };
};

export function checkReadiness(statusMd: string, requirementsMd: string): string[] {
  const { verified, total } = verifiedRequirements(requirementsMd);
  if (total !== 12) return [`REQUIREMENTS.md has ${total} requirements, not 12`];
  const want = `Readiness: ${verified} of 12 requirements verified (${Math.round((verified / 12) * 100)}%).`;
  const problems = statusMd.includes(want) ? [] : [`STATUS.md must say "${want}"`];
  if (/SYNTHFLOW_RETIRED/.test(statusMd) && verified < 12) problems.push('STATUS.md says retired before every requirement is verified');
  return problems;
}

export interface LedgerTask { id: string; ticket: string; status: string }
const COMMENT_URL = /https:\/\/app\.basecamp\.com\/\d+\/buckets\/\d+\/todos\/\d+#__recording_\d+/;
export function missingLinks(statusMd: string, tasks: readonly LedgerTask[]): string[] {
  const linked = new Set(tableRows(statusMd, /^VS\d+\.\d+$/).filter((r) => r.some((c) => COMMENT_URL.test(c))).map((r) => r[0]));
  return tasks.filter((t) => t.status === 'passed' && !linked.has(t.ticket)).map((t) => `${t.ticket}: passed with no comment link in STATUS.md`);
}

export function run(argv: string[], dir: string = DOCS): number {
  const read = (f: string): string => fs.readFileSync(f, 'utf8');
  try {
    if (argv.length === 1 && argv[0] === '--go-no-go') {
      const r = goNoGo(read(path.join(dir, 'GO_NO_GO.md')));
      for (const p of r.problems) console.log(`PROBLEM ${p}`);
      for (const o of r.open) console.log(`OPEN ${o.id}: ${o.status}`);
      console.log(`SYNTHFLOW RETIREMENT: ${r.verdict}`);
      return r.verdict === 'NO_GO' ? 1 : 0;
    }
    if (argv.length !== 0 && !(argv.length === 2 && argv[0] === '--ledger')) { console.error('usage: voice:status-check [-- --go-no-go | --ledger <file>]'); return 2; }
    const status = read(path.join(dir, 'STATUS.md'));
    const problems = checkReadiness(status, read(path.join(dir, 'REQUIREMENTS.md')));
    if (argv.length) problems.push(...missingLinks(status, (JSON.parse(read(argv[1])) as { tasks: LedgerTask[] }).tasks));
    for (const p of problems) console.log(`PROBLEM ${p}`);
    console.log(problems.length ? 'VOICE STATUS: PROBLEMS' : 'VOICE STATUS: OK');
    return problems.length ? 1 : 0;
  } catch (e) {
    console.error(`cannot read a document: ${(e as Error).name}`);
    return 2;
  }
}

if (require.main === module) process.exit(run(process.argv.slice(2)));
