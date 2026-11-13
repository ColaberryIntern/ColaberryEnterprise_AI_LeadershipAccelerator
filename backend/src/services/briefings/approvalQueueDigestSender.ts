import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import { guardedSendMail, resolveDeliveryAddress } from '../emailService';
import { claimBriefingSlot } from '../executiveBriefingService';
import { resolveManagerReach, reachFor } from '../agentDomain/managerReachResolver';
import {
  composeApprovalDigests,
  type DomainDecider,
  type OpenRequest,
} from '../agentDomain/approvalQueueDigest';

/**
 * The daily "approvals you owe" digest: the reads and the send.
 *
 * The decision lives in `agentDomain/approvalQueueDigest.ts`, which is pure. This module is the
 * I/O, and it is modelled line for line on `handoffDigestSender.ts` because that is the one
 * digest in this repo that already does the hard parts right: one mail per human who owes
 * something, once per mailbox per Central date, through the guarded mailer.
 *
 * ─── GATES, IN ORDER ───────────────────────────────────────────────────────────────────────
 *
 *   1  `AGENT_APPROVAL_DIGEST_SEND` must be exactly 'on'. Ships dark. **This estate runs three
 *      scheduler instances** (aiOpsScheduler.ts:454 records it), so a job without a flag mails
 *      three times.
 *   2  nothing open -> no mail, and one info log saying so.
 *   3  a decider with nothing waiting is never written to.
 *   4  the slot: already claimed today for that delivered mailbox -> no mail.
 *   5  `guardedSendMail`: the global kill switch, then the dev-email guard.
 *
 * A failure for one mailbox is one error line and the next mailbox still gets theirs. A claim
 * that cannot be read fails CLOSED, like the briefing: no mail rather than a possible duplicate.
 */

export const APPROVAL_DIGEST_AGENT = 'AgentDomainApprovalDigest';
/** 13:30 UTC on weekdays: 7:30 AM Central in summer, 8:30 in winter. Before the desk day. */
export const APPROVAL_DIGEST_SCHEDULE = '30 13 * * 1-5';
export const APPROVAL_DIGEST_SLOT = 'agent_domain_approval_digest';
export const APPROVAL_DIGEST_READ_LIMIT = 500;
const FROM = () => `"Colaberry Agent Governance" <${env.emailFrom}>`;

/**
 * Open requests, with the domain's manager address joined on.
 *
 * `resolveManagerReach` deliberately does NOT carry the address -- its verdict answers "can this
 * manager reach the admin UI", not "what is their mailbox" -- so the address is read here from
 * the same join that resolver documents as authoritative: `agent_domain_projects.manager_identity_id`
 * against `org_members.email`. Bending the resolver to also return an address would have made a
 * reachability cache into a contact directory.
 */
const OPEN_WITH_DECIDER_SQL = `
  SELECT cr.id,
         cr.domain_key,
         cr.title,
         cr.requested_by_identity,
         cr.requested_at,
         cr.kind,
         om.email AS manager_email,
         au.role  AS manager_admin_role
    FROM agent_domain_change_requests cr
    LEFT JOIN agent_domain_projects p ON p.domain_key = cr.domain_key
    LEFT JOIN org_members om ON om.id::text = p.manager_identity_id::text
    LEFT JOIN admin_users au ON LOWER(au.email) = LOWER(om.email)
   WHERE cr.status = 'submitted'
   ORDER BY cr.requested_at ASC
   LIMIT ${APPROVAL_DIGEST_READ_LIMIT}`;

/**
 * The roles `requireAdmin` admits. Named here rather than inlined so the digest's notion of
 * "can decide" cannot quietly drift from the middleware's.
 */
export const DECIDING_ROLES: readonly string[] = ['admin', 'super_admin'];

interface OpenRow extends OpenRequest {
  readonly manager_email: string | null;
  readonly manager_admin_role: string | null;
}

export interface ApprovalDigestSummary {
  status: 'ran' | 'skipped';
  reason?: string;
  open: number;
  mailboxes: number;
  sent: number;
  already_sent: number;
  failed: number;
  orphaned: number;
  /** Domains whose named owner holds no admin role, so their requests went to the fallback. */
  owner_cannot_decide: number;
}

/**
 * The admin fallback list.
 *
 * `emailService.getAdminRecipients()` does exactly this but is not exported, and
 * `executiveBriefingService` parses the same setting inline in three separate places. Rather
 * than add a fourth copy silently, this one is named and says why it exists: the setting is a
 * comma-separated string and in production it holds Ali and Ram, not the domain managers.
 */
async function adminFallbackRecipients(): Promise<string[]> {
  const { SystemSetting } = await import('../../models');
  const setting = await SystemSetting.findOne({ where: { key: 'admin_notification_emails' } });
  const raw = setting?.getDataValue('value');
  if (!raw) return [];
  return String(raw).split(',').map((e) => e.trim()).filter(Boolean);
}

function log(level: 'info' | 'warn' | 'error', event: string, context: unknown): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: 'agent-domain-approval-digest',
    event,
    outcome: level === 'error' ? 'failure' : 'success',
    context,
  }));
}

export interface SendApprovalDigestsArgs {
  readonly asOf?: Date;
  /** Test seam only. Production reads the env var. */
  readonly enabled?: boolean;
  /**
   * Compose and report, send nothing, claim no slot.
   *
   * Not the same thing as the env flag being off: `skipped` tells you nothing about what the
   * queue holds, and this exists so the first run on production can be read before anybody's
   * mailbox is involved. A dry run deliberately does NOT claim a slot, so the real send later
   * the same day is not swallowed by it.
   */
  readonly dryRun?: boolean;
}

export async function sendApprovalQueueDigests(
  args: SendApprovalDigestsArgs = {},
): Promise<ApprovalDigestSummary> {
  const asOf = args.asOf ?? new Date();
  const summary: ApprovalDigestSummary = {
    status: 'ran', open: 0, mailboxes: 0, sent: 0, already_sent: 0,
    failed: 0, orphaned: 0, owner_cannot_decide: 0,
  };

  const enabled = args.enabled ?? (process.env.AGENT_APPROVAL_DIGEST_SEND === 'on');
  if (!enabled) return { ...summary, status: 'skipped', reason: 'AGENT_APPROVAL_DIGEST_SEND_off' };

  const rows = await sequelize.query<OpenRow>(OPEN_WITH_DECIDER_SQL, { type: QueryTypes.SELECT });
  summary.open = rows.length;
  if (rows.length === 0) {
    log('info', 'approval_digest_nothing_open', { ...summary });
    return summary;
  }

  // Reachability is read for its BLOCKER only, never for the verdict. `manager_can_reach` is
  // true on all ten domains while three of those managers hold no admin role, so reach answers a
  // different question than "can decide" -- but when somebody cannot decide, the resolver's
  // blocker is the most useful sentence available about why.
  const reach = await resolveManagerReach(sequelize).catch(() => new Map());

  const deciders: DomainDecider[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.domain_key)) continue;
    seen.add(r.domain_key);

    const role = (r.manager_admin_role ?? '').trim().toLowerCase();
    const canDecide = DECIDING_ROLES.includes(role);
    if (!canDecide) summary.owner_cannot_decide += 1;

    deciders.push({
      domainKey: r.domain_key,
      email: r.manager_email,
      canDecide,
      blocker: canDecide
        ? null
        : (role
          ? `holds role '${role}', which requireAdmin does not admit`
          : reachFor(reach, r.domain_key).blocker ?? 'no admin_users row for this address'),
    });
  }

  const { digests, orphaned } = composeApprovalDigests({
    open: rows,
    deciders,
    asOf,
    baseUrl: env.frontendUrl,
    fallbackRecipients: await adminFallbackRecipients().catch(() => []),
  });
  summary.mailboxes = digests.length;
  summary.orphaned = orphaned.length;
  if (orphaned.length > 0) {
    // Loud: these are requests nobody will be told about. Silence here would read as "covered".
    log('warn', 'approval_digest_orphaned_requests', {
      count: orphaned.length,
      domains: [...new Set(orphaned.map((o) => o.domainKey))],
      consequence: 'no decider resolved and no admin fallback configured; nobody was notified',
    });
  }

  for (const digest of digests) {
    try {
      if (args.dryRun) {
        log('info', 'approval_digest_dry_run', {
          to: digest.to,
          subject: digest.subject,
          requests: digest.lines.length,
          oldest_days: digest.lines.reduce((m, l) => Math.max(m, l.ageDays), 0),
          is_fallback: digest.isFallback,
          owner_cannot_decide: digest.ownerCannotDecide,
        });
        continue;
      }
      const deliveredTo = await resolveDeliveryAddress(digest.to).catch(() => digest.to);
      const claimed = await claimBriefingSlot(APPROVAL_DIGEST_SLOT, deliveredTo);
      if (!claimed) { summary.already_sent += 1; continue; }
      await guardedSendMail({
        from: FROM(),
        to: digest.to,
        subject: digest.subject,
        text: digest.text,
      });
      summary.sent += 1;
    } catch (err: unknown) {
      summary.failed += 1;
      log('error', 'approval_digest_send_failed', {
        error_class: err instanceof Error ? err.name : 'UnknownError',
        requests: digest.lines.length,
        is_fallback: digest.isFallback,
      });
    }
  }

  log('info', 'approval_digest', { ...summary });
  return summary;
}
