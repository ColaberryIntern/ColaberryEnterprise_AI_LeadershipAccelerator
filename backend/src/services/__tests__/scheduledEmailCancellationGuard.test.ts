import * as fs from 'fs';
import * as path from 'path';

/**
 * R3 acceptance 3: "A test fails if a cancellation path forgets the reason."
 *
 * Every non-test source file that touches scheduled_emails (the ScheduledEmail model or the table name) is scanned for a
 * WRITE of status 'cancelled'. Each one must carry `cancel_reason` within the same statement (the 3 lines after it), or go
 * through services/scheduledEmailCancellation.ts, which always does. Reads (where-clauses, FILTER, Op.ne/notIn, counts) are
 * not writes and are skipped. The positive controls below prove the scan flags a bare cancel and accepts a reasoned one,
 * so this cannot pass by scanning nothing.
 */

const SRC = path.join(__dirname, '..', '..');
const HELPER = path.join(SRC, 'services', 'scheduledEmailCancellation.ts');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      sourceFiles(p, out);
    } else if (/\.ts$/.test(e.name) && !/\.test\.ts$|\.d\.ts$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const CANCEL_WRITE = /(status\s*:\s*'cancelled'|status\s*=\s*'cancelled'|\.status\s*=\s*'cancelled')/;
// Not writes: filters and reads, audit snapshots, comparisons, union types, and a RETURNED object literal (a receipt
// status such as enrollmentAdapter's `return { status: 'cancelled', receiptId, reason }`). `return x.update({...})` is still
// a write and is still caught, because it does not start `return {`.
const READ_CONTEXT = /\bwhere\b|\bWHERE\b|FILTER|Op\.(ne|notIn|in)\b|\bcount\(|findAll|findOne|after_state|before_state|===|!==|\btype\b|\||\breturn\s*\{/;

/** A line that WRITES even though it also names a where-clause: `X.update({ status: 'cancelled' }, { where })` on one line. */
const WRITE_CALL = /\.update\s*\(|\bSET\b/;

/** Lines that cancel a scheduled message without stating why. Pure over a source string. */
export function unexplainedCancellations(source: string): string[] {
  const lines = source.split(/\r?\n/);
  const bad: string[] = [];
  lines.forEach((line, i) => {
    if (!CANCEL_WRITE.test(line)) return;
    if (READ_CONTEXT.test(line) && !WRITE_CALL.test(line)) return;
    const statement = lines.slice(i, i + 4).join('\n');
    if (/cancel_reason/.test(statement)) return;
    bad.push(`${i + 1}: ${line.trim()}`);
  });
  return bad;
}

/**
 * Raw SQL that sets scheduled_emails.status from a BOUND PARAMETER (`SET status = $to` / `:x`) can cancel without the
 * literal 'cancelled' ever appearing (the 2026-11-09 verifier found exactly this in agentEmailInboxService). Each such
 * statement must carry cancel_reason, or be listed in PARAM_STATUS_ALLOWLIST with the proof that it never cancels.
 */
export function unexplainedParamStatusUpdates(source: string): string[] {
  const bad: string[] = [];
  const re = /UPDATE\s+scheduled_emails\b([\s\S]{0,900}?)(`|;)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const stmt = m[1];
    if (/SET\s+status\s*=\s*[$:][A-Za-z_]\w*/i.test(stmt) && !/cancel_reason/.test(stmt)) {
      bad.push(stmt.replace(/\s+/g, ' ').trim().slice(0, 80));
    }
  }
  return bad;
}

/** Parameter-status updates that provably never cancel, with the proof checked below. */
const PARAM_STATUS_ALLOWLIST: Record<string, { proof: RegExp; why: string }> = {
  [path.join('services', 'explorerGrowth', 'drafts', 'draftRepository.ts')]: {
    proof: /supersededStatus:\s*EXPLORER_DRAFT_SUPERSEDED_STATUS/,
    why: "binds the constant 'explorer_draft_superseded' (draftContracts.ts), never 'cancelled'",
  },
};

const touchesScheduledEmails = (src: string): boolean => /ScheduledEmail\b|scheduled_emails/.test(src);

describe('R3: every scheduled-message cancellation states its reason', () => {
  const files = sourceFiles(SRC).filter((f) => f !== HELPER && touchesScheduledEmails(fs.readFileSync(f, 'utf8')));

  it('scans the files that touch scheduled_emails (not an empty sweep)', () => {
    const names = files.map((f) => path.basename(f));
    for (const known of ['schedulerService.ts', 'campaignService.ts', 'sequenceService.ts', 'smsOptOutProcessor.ts']) {
      expect(names).toContain(known);
    }
  });

  it('no file cancels a scheduled message without a cancel_reason', () => {
    const violations = files.flatMap((f) => unexplainedCancellations(fs.readFileSync(f, 'utf8')).map((l) => `${path.relative(SRC, f)}:${l}`));
    expect(violations).toEqual([]);
  });

  it('no raw SQL sets scheduled_emails.status from a parameter without a cancel_reason (or a proven allowlist entry)', () => {
    const violations: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const rel = path.relative(SRC, f);
      const allowed = PARAM_STATUS_ALLOWLIST[rel];
      if (allowed) { expect(src).toMatch(allowed.proof); continue; }
      for (const s of unexplainedParamStatusUpdates(src)) violations.push(`${rel}: ${s}`);
    }
    expect(violations).toEqual([]);
    expect(Object.keys(PARAM_STATUS_ALLOWLIST)).toHaveLength(1); // a new exemption is a reviewed change to this file
  });

  it('POSITIVE CONTROL (raw SQL): a parameter status with no reason is flagged; with a reason it is not', () => {
    expect(unexplainedParamStatusUpdates('sql(`UPDATE scheduled_emails SET status = $to WHERE id = $id`)')).toHaveLength(1);
    expect(unexplainedParamStatusUpdates("sql(`UPDATE scheduled_emails SET status = :s, metadata = metadata || jsonb_build_object('cancel_reason', 'x') WHERE id = :id`)")).toEqual([]);
    expect(unexplainedParamStatusUpdates("sql(`UPDATE scheduled_emails SET status = 'sent' WHERE id = $id`)")).toEqual([]);
  });

  it('POSITIVE CONTROL: a one-line write that names its where-clause is still a write', () => {
    expect(unexplainedCancellations("await ScheduledEmail.update({ status: 'cancelled' }, { where: { id } });")).toHaveLength(1);
  });

  it('POSITIVE CONTROL: a bare cancel is flagged; a reasoned one and a read are not', () => {
    expect(unexplainedCancellations("await email.update({ status: 'cancelled' });")).toHaveLength(1);
    expect(unexplainedCancellations("await ScheduledEmail.update(\n  { status: 'cancelled' } as any,\n  { where: { id } });")).toHaveLength(1);
    expect(unexplainedCancellations("await x.update({ status: 'cancelled', metadata: { cancel_reason: 'sms_opt_out' } });")).toEqual([]);
    expect(unexplainedCancellations("updates.status = 'cancelled';\nupdates.metadata.cancel_reason = 'prep_window_passed';")).toEqual([]);
    expect(unexplainedCancellations("const n = await ScheduledEmail.count({ where: { status: 'cancelled' } });")).toEqual([]);
    expect(unexplainedCancellations("return { status: 'cancelled', receiptId, reason };")).toEqual([]);
    expect(unexplainedCancellations("return email.update({ status: 'cancelled' });")).toHaveLength(1);
  });
});
