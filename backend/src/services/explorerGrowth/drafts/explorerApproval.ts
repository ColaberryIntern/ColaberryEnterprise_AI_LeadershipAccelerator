/**
 * OH1o: the live implementations of the Explorer draft's new dependencies (renderDecisionDraft):
 *
 *   loadEarlierExplorerEmails  this person's earlier Explorer emails, full bodies, newest first
 *                              (shadow drafts and sent ones; never rejected or superseded versions)
 *   loadExplorerSignals        the 360 profile (openHouseProfile) and the one memory (mayaMemoryBlock),
 *                              the same signals the Open House countdown email is written from
 *   enqueueExplorerDraft       a passing draft -> the Outbound approvals queue, wrapped in the SAME
 *                              signature and legal footer campaign emails get (campaignEmailWrapper),
 *                              only while explorer_growth_send_enabled is on. Never a send.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { EXPLORER_DRAFT_STATUS } from './draftContracts';
import type { EarlierEmail, ExplorerApprovalInput, ExplorerSignals } from './renderDecisionDraft';
import { EXPLORER_COMPOSER_PREFIX, EXPLORER_SEND_SETTING } from '../send/explorerSendGuards';
import { subjectRefFrom } from '../../identity/identifierPrecedence';

/** Maya's sender identity on campaign mail (ensureOpenHouseCountdownCampaign MAYA_EMAIL / MAYA_NAME). */
export const MAYA_SENDER = { name: 'Maya at Colaberry', email: 'maya@colaberry.com' } as const;

export async function loadEarlierExplorerEmails(leadId: number, excludeDecisionId: string): Promise<EarlierEmail[]> {
  const rows = await sequelize.query<{ subject: string | null; body: string | null; d: string | null }>(
    `SELECT subject, body, metadata->>'explorer_decision_date' AS d
       FROM scheduled_emails
      WHERE lead_id = :leadId
        AND (metadata->'brain_pick') IS NOT NULL
        AND status IN (:drafted, 'sent')
        AND COALESCE(metadata->>'explorer_decision_id', '') <> :excludeDecisionId
      ORDER BY metadata->>'explorer_decision_date' DESC, created_at DESC
      LIMIT 6`,
    { type: QueryTypes.SELECT, replacements: { leadId, excludeDecisionId, drafted: EXPLORER_DRAFT_STATUS } },
  );
  return rows
    .filter((r) => r.body)
    .map((r) => ({ subject: String(r.subject || ''), body: String(r.body), date: r.d ? String(r.d) : null }));
}

export async function loadExplorerSignals(leadId: number, email: string, firstName: string | null): Promise<ExplorerSignals> {
  const [profile, memory] = await Promise.all([
    (async () => {
      try {
        const { gatherPersonProfile, renderPersonProfile } = await import('../../openHouseProfile');
        return renderPersonProfile(await gatherPersonProfile(email, leadId, firstName));
      } catch { return ''; }
    })(),
    (async () => {
      try {
        const { mayaMemoryBlock } = await import('../../maya/mayaMemory');
        return (await mayaMemoryBlock({ leadId }, { limit: 20, maxChars: 3500 })) || '';
      } catch { return ''; }
    })(),
  ]);
  return { profile, memory };
}

/**
 * OH1o (Ali, D): what the brain passed for one queued Explorer email - the snapshot stored on its
 * draft at creation (profile, content piece, memory excerpt, screen result, overlap). Null if none.
 */
export async function loadExplorerSnapshot(scheduledEmailId: string): Promise<Record<string, unknown> | null> {
  const [r] = await sequelize.query<{ snap: Record<string, unknown> | null }>(
    `SELECT metadata->'brain_snapshot' AS snap FROM scheduled_emails WHERE id::text = :id LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { id: scheduledEmailId } },
  );
  return r?.snap ?? null;
}

/** The exact bytes that would leave: the draft body inside the campaign wrapper (signature + footer + unsubscribe). */
export async function explorerEmailHtml(leadId: number, toEmail: string, body: string): Promise<string> {
  const { wrapEmailHtml } = await import('../../email/campaignEmailWrapper');
  const { buildUnsubscribeUrl } = await import('../../unsubscribeTokenService');
  return wrapEmailHtml(body, {
    campaignType: 'explorer_growth', leadId,
    senderName: MAYA_SENDER.name, senderEmail: MAYA_SENDER.email,
    unsubscribeUrl: buildUnsubscribeUrl(leadId, toEmail),
  });
}

export interface EnqueueExplorerDeps {
  sendEnabled: () => Promise<boolean>;
  wrap: (leadId: number, toEmail: string, body: string) => Promise<string>;
  enqueue: (row: {
    recipientRef: string; recipientAddress: string; recipientDisplay: string | null; channel: string;
    subject: string; body: string; composedBy: string; capability: string; correlationId: string; idempotencyKey: string;
  }) => Promise<{ id: string; deduped: boolean }>;
}

function defaultEnqueueDeps(): EnqueueExplorerDeps {
  return {
    sendEnabled: async () => {
      const v = await (await import('../../settingsService')).getSetting(EXPLORER_SEND_SETTING);
      return v === true || v === 'true';
    },
    wrap: explorerEmailHtml,
    enqueue: async (row) => {
      const { enqueueOutbound } = await import('../../maya/mayaOutboundQueue');
      const r = await enqueueOutbound(row);
      return { id: r.id, deduped: r.deduped };
    },
  };
}

/** Queue one passing Explorer draft for a person's approval. Null when Explorer sending is off. */
export async function enqueueExplorerDraft(
  input: ExplorerApprovalInput,
  deps: EnqueueExplorerDeps = defaultEnqueueDeps(),
): Promise<{ id: string; deduped: boolean } | null> {
  if (!(await deps.sendEnabled())) return null;
  const html = await deps.wrap(input.leadId, input.toEmail, input.body);
  return deps.enqueue({
    // The one sanctioned subject-key builder (T208 tripwire); a lead id always yields lead:<id>.
    recipientRef: subjectRefFrom({ leadId: input.leadId }) as string,
    recipientAddress: input.toEmail,
    recipientDisplay: null,
    channel: 'email',
    subject: input.subject,
    body: html,
    composedBy: `${EXPLORER_COMPOSER_PREFIX}${input.decisionId}`,
    capability: 'sendEmail',
    // The draft row's id: the approval screen reads the brain snapshot from it, and the send marks it sent.
    correlationId: input.scheduledEmailId,
    idempotencyKey: `explorer-draft-${input.scheduledEmailId}`,
  });
}
