/**
 * The digest's delivery path, its kill switch, and the one place a reply address is built.
 *
 * ## The plan asked for a SCHEDULE_REGISTRY entry. This repository says not to, twice.
 *
 *   `sendAgentNudges.ts:16` — *"aiOpsScheduler.ts is 797 lines, well past the 500-line ceiling in
 *   CLAUDE.md, which means the next change to it has to split it first. Splitting a live scheduler
 *   that owns dozens of jobs is a large refactor and its own decision, not something to do in
 *   passing while adding a nudge."*
 *
 *   `sendApprovalQueueDigest.ts:9` — the same conclusion, plus the second cost: a module under
 *   `services/scheduling/` *"means adding an importer to EXPECTED_CRON_IMPORT_FILES in the pinned
 *   cronRegistryBaseline fixture and seeding a registry row. That is a deliberate change to a
 *   governance fixture and belongs in its own diff."*
 *
 * `aiOpsScheduler.ts` is **863 lines** today, so the ceiling argument is stronger than when that
 * was written. These tests therefore pin the SCRIPT path — the `scripts/agentNudges.sh` precedent
 * the convention names — and assert the registry was deliberately left alone rather than
 * forgotten.
 *
 * ## And the kill switch is better this way
 *
 * The plan's switch was a `CronScheduleConfig` row written through the Governance Center route,
 * which 404s when no row exists, so the entry would have had to seed its own row just to be
 * switchable. This path needs none of that: two independent gates must both be open, and removing
 * the environment variable disables it with no deploy, no row and no route.
 */

import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { SCHEDULE_REGISTRY } from '../aiOpsScheduler';
import {
  APPROVAL_DIGEST_AGENT,
  APPROVAL_DIGEST_SCHEDULE,
  APPROVAL_DIGEST_SLOT,
} from '../briefings/approvalQueueDigestSender';
import { ticketReplyAddress, ticketReplyToHeader } from '../emailReplyAddress';

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const WRAPPER = path.join(ROOT, 'scripts', 'approvalQueueDigest.sh');
const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'sendApprovalQueueDigest.ts');
const SENDER = path.join(__dirname, '..', 'briefings', 'approvalQueueDigestSender.ts');
const SCHEDULER = path.join(__dirname, '..', 'aiOpsScheduler.ts');
const EMAIL = path.join(__dirname, '..', 'emailService.ts');

const read = (p: string) => fs.readFileSync(p, 'utf8');
/**
 * The module's BODY: comments and the import block removed.
 *
 * The import block is why the first draft of two assertions below was meaningless. Comparing
 * `indexOf('claimBriefingSlot')` against `indexOf('guardedSendMail')` found both names on
 * their IMPORT lines, four lines apart, so the test asserted import order and would have
 * passed or failed on the alphabetical accident of how the imports were written.
 */
const body = (p: string) => {
  const c = read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const lines = c.split('\n').filter((l) => !/^import\b/.test(l.trim()));
  return lines.join('\n');
};
const code = (p: string) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

describe('the delivery path is the script, and that is deliberate', () => {
  it('the wrapper exists and runs the compiled script in the backend container', () => {
    const sh = read(WRAPPER);
    expect(sh).toContain('docker exec');
    expect(sh).toContain('dist/scripts/sendApprovalQueueDigest.js');
    expect(sh).toContain('set -euo pipefail');
  });

  it('it is executable, like its precedent', () => {
    // A wrapper the crontab cannot run is a wrapper that silently never fires.
    const mode = fs.statSync(WRAPPER).mode;
    const precedent = fs.statSync(path.join(ROOT, 'scripts', 'agentNudges.sh')).mode;
    // eslint-disable-next-line no-bitwise
    expect(mode & 0o111).toBe(precedent.valueOf() & 0o111);
  });

  it('DRY RUN is the default: the crontab line is the only thing that passes --apply', () => {
    const sh = read(WRAPPER);
    expect(sh).toMatch(/DRY RUN BY DEFAULT/);
    // The script itself must not hardcode --apply anywhere outside a comment.
    expect(sh.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n'))
      .not.toContain('--apply');
  });

  it('TWO gates must both be open, which one flag would not give', () => {
    const script = code(SCRIPT);
    expect(script).toContain("process.argv.includes('--apply')");
    expect(code(SENDER)).toContain('AGENT_APPROVAL_DIGEST_SEND');
  });

  it('the crontab line in the wrapper matches APPROVAL_DIGEST_SCHEDULE, so the comment cannot drift', () => {
    expect(read(WRAPPER)).toContain(APPROVAL_DIGEST_SCHEDULE);
    expect(cron.validate(APPROVAL_DIGEST_SCHEDULE)).toBe(true);
  });

  it('the wrapper does not install the crontab line itself', () => {
    // A deploy must not make a production schedule change. The line is Ali's to install.
    const sh = read(WRAPPER);
    expect(sh).toMatch(/NOT DONE BY THIS SCRIPT/);
    expect(sh.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n'))
      .not.toMatch(/crontab/);
  });
});

describe('the registry was left alone on purpose, not forgotten', () => {
  it('SCHEDULE_REGISTRY has no entry for this agent', () => {
    expect(SCHEDULE_REGISTRY.map((e) => e.agentName)).not.toContain(APPROVAL_DIGEST_AGENT);
  });

  it('POSITIVE CONTROL: the registry is real and non-empty, so the absence means something', () => {
    expect(SCHEDULE_REGISTRY.length).toBeGreaterThan(10);
    for (const e of SCHEDULE_REGISTRY.slice(0, 5)) {
      expect(cron.validate(e.hardcodedSchedule)).toBe(true);
    }
  });

  it('the scheduler really is past the ceiling the convention cites', () => {
    // 797 when the convention was written; the argument is stronger now, not weaker. If this ever
    // drops below 500 the convention is worth revisiting, and this test is where that shows up.
    const lines = read(SCHEDULER).split('\n').length;
    expect(lines).toBeGreaterThan(500);
  });

  it('the wrapper records WHY, citing both files that set the convention', () => {
    const sh = read(WRAPPER);
    expect(sh).toContain('sendAgentNudges.ts');
    expect(sh).toContain('cronRegistryBaseline');
    expect(sh).toMatch(/500-line ceiling/);
  });
});

describe('re-running is safe, and a dry run does not swallow the real send', () => {
  it('every send claims a slot, keyed per mailbox', () => {
    expect(APPROVAL_DIGEST_SLOT).toBe('agent_domain_approval_digest');
    const sender = code(SENDER);
    expect(sender).toContain('claimBriefingSlot(APPROVAL_DIGEST_SLOT, deliveredTo)');
    // The claim is checked BEFORE the send, or a failed claim would still mail. Compared in
    // the module BODY, because both names also appear on their import lines.
    const b = body(SENDER);
    expect(b.indexOf('claimBriefingSlot(')).toBeGreaterThan(-1);
    expect(b.indexOf('claimBriefingSlot(')).toBeLessThan(b.indexOf('guardedSendMail({'));
    // And the send is guarded by the claim's result rather than merely preceded by it.
    expect(b).toContain('if (!claimed) { summary.already_sent += 1; continue; }');
  });

  it('a dry run claims nothing', () => {
    const b = body(SENDER);
    // The dry-run branch `continue`s before the claim is reached.
    const dryAt = b.indexOf('args.dryRun');
    expect(dryAt).toBeGreaterThan(-1);
    expect(dryAt).toBeLessThan(b.indexOf('claimBriefingSlot('));
  });

  it('the clock is INJECTED, so two runs with the same asOf are the same run', () => {
    const sender = code(SENDER);
    expect(sender).toContain('args.asOf ?? new Date()');
    // Every `new Date()` in the module is either the injected clock's DEFAULT or a log
    // timestamp. A log line's clock is not part of the idempotency decision -- the first
    // version of this test asserted exactly one and failed on the log timestamp, which is
    // the assertion being wrong rather than the code.
    const clocks = code(SENDER).split('\n').filter((l) => l.includes('new Date()'));
    expect(clocks).toHaveLength(2);
    expect(clocks.filter((l) => l.includes('args.asOf ??'))).toHaveLength(1);
    expect(clocks.filter((l) => l.includes('timestamp:'))).toHaveLength(1);
    // And no clock reaches the send path, which is what actually matters.
    const b = body(SENDER);
    const sendBlock = b.slice(b.indexOf('claimBriefingSlot('), b.indexOf('summary.sent += 1'));
    expect(sendBlock.length).toBeGreaterThan(50);
    expect(sendBlock).not.toContain('new Date()');
  });

  it('an empty queue sends nothing and records why', () => {
    const sender = code(SENDER);
    expect(sender).toContain('approval_digest_nothing_open');
    expect(sender).toContain('if (rows.length === 0)');
    expect(sender).toContain("status: 'skipped', reason: 'AGENT_APPROVAL_DIGEST_SEND_off'");
  });
});

describe('the reply address has ONE source', () => {
  it('emailService builds it with the shared function, not a format string', () => {
    const email = code(EMAIL);
    expect(email).toContain('ticketReplyToHeader(data)');
    // No local template for the address anywhere in the file.
    expect(email).not.toMatch(/`ticket-\$\{/);
  });

  it('the digest sender calls the SAME function', () => {
    const sender = code(SENDER);
    expect(sender).toContain('ticketReplyToHeader(');
    expect(sender).not.toMatch(/`ticket-\$\{/);
    expect(sender).not.toMatch(/mandrillInboundDomain/);
  });

  it('builds the format the inbound parser expects', () => {
    const addr = ticketReplyAddress({ ticketId: 'abc', replyToken: 'deadbeef' });
    expect(addr).toMatch(/^ticket-abc-deadbeef@/);
    expect(ticketReplyToHeader({ ticketId: 'abc', replyToken: 'deadbeef' }))
      .toBe(`"Colaberry AI Workforce" <${addr}>`);
  });

  it('returns NULL rather than an address with a blank segment', () => {
    // An address like `ticket-abc-@reply...` looks like a working reply path in a mail client,
    // accepts a reply and drops it, and the person who replied has no way to know.
    expect(ticketReplyAddress({ ticketId: 'abc', replyToken: null })).toBeNull();
    expect(ticketReplyAddress({ ticketId: null, replyToken: 'tok' })).toBeNull();
    expect(ticketReplyAddress({ ticketId: 'abc', replyToken: '   ' })).toBeNull();
    expect(ticketReplyAddress({ ticketId: '', replyToken: 'tok' })).toBeNull();
    expect(ticketReplyToHeader({ ticketId: 'abc', replyToken: null })).toBeNull();
  });

  it('the digest sets no replyTo when there is nothing to route to, which is today', () => {
    const sender = code(SENDER);
    // The spread form, so the header is ABSENT rather than present-and-empty.
    expect(sender).toContain('...(replyTo ? { replyTo } : {})');
  });

  it('emailService omits it the same way, rather than sending a dead address', () => {
    expect(code(EMAIL)).toContain('...(replyToHeader ? { replyTo: replyToHeader } : {})');
  });
});
