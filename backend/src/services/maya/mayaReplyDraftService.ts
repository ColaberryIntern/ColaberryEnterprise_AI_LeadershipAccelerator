import crypto from 'crypto';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { BANNED, PORTAL_TODAY_URL, softenIdioms } from '../openHouseCountdown';
import { mayaMemoryBlock } from './mayaMemory';

/**
 * OH1h (T2) - MAYA ANSWERS EMAIL REPLIES. Ali, 2026-11-18: a reply to one of Maya's emails must get an answer from
 * Maya, written from the one memory, and the answer must be recorded on the lead.
 *
 * Before this, a reply to a Maya campaign fell through to the generic inbound auto-reply (inbound/inboundAutoReply.ts),
 * which signs as "Dhee", reads no memory, and sends without review. Now the inbound webhook asks this module first:
 *
 *   1. Is it a Maya campaign? (sender profile / sender_name "Maya...", or a system prompt starting "You are Maya".)
 *      If not, nothing here runs and the old path is untouched.
 *   2. The Maya kill switch (resolveMayaMode('sendEmail') = off) -> no draft.
 *   3. evaluateSend (consent, suppression, kill switch, pause) blocks -> no draft, so no reviewer can override an
 *      unsubscribe by approving one.
 *   4. Compose with Maya's persona + the one memory + the reply text; screen it (no price, offer, discount, the
 *      banned word, placeholders; no link but the Join link, the Today page or the main site). A draft that fails
 *      the screen is not queued; the lead gets an activity row saying a person needs to answer.
 *   5. QUEUE it in maya_outbound_approvals, idempotent on the inbound Message-Id. It leaves only when a person
 *      approves that exact message (approveOutbound, the admin review route).
 *   6. Only when the setting `maya_email_autoreply_enabled` is true (DEFAULT false, settingsService DEFAULTS), and
 *      never for an Explorer, the queued row is delivered at once through the same delivery function
 *      (mayaOutboundDelivery.deliverOutboundRow), which adds the Maya reply-to address and records the answer
 *      on the lead (communication_logs + activity).
 *
 * With the setting at its default NOTHING IS SENT by this module. A dry run (`dryRun: true`, or the CLI
 * `--no-enqueue`) composes and screens but writes nothing: no queue row, no activity, no consent verdict.
 *
 * Dependencies are injectable (the humanOwnership.ts pattern). Never throws to the webhook.
 */

export const MAYA_REPLY_COMPOSER_PREFIX = 'maya_reply:';
/** The decider recorded on a row the setting delivered. Not a person and deliberately not `system:` (the timer shape). */
export const AUTO_REPLY_DECIDER = 'setting:maya_email_autoreply_enabled';
export const AUTO_REPLY_SETTING = 'maya_email_autoreply_enabled';
const MAIN_SITE = 'https://enterprise.colaberry.ai';

export interface InboundReplyInput {
  leadId: number;
  fromEmail: string;
  leadName?: string | null;
  subject: string;
  /** Raw inbound text (or html). Quoted history is stripped here. */
  body: string;
  /** The inbound Message-Id header: the idempotency anchor. */
  messageId?: string | null;
  inReplyTo?: string | null;
  campaignId: string | null;
  /** The Explorer router claimed this reply. Explorers get a DRAFT only, whatever the setting says. */
  explorer?: boolean;
}

export interface CampaignIdentity {
  id: string;
  settings?: Record<string, any> | null;
  ai_system_prompt?: string | null;
  /** The approved sender profile's from_name, when the campaign has one. */
  sender_profile_from_name?: string | null;
}

export type ReplyDraftOutcome =
  | 'not_maya' | 'kill_switch' | 'blocked' | 'empty_reply' | 'compose_failed' | 'screen_rejected'
  | 'dry_run' | 'queued' | 'deduped' | 'sent' | 'send_failed' | 'error';

export interface ReplyDraftResult {
  outcome: ReplyDraftOutcome;
  /** True whenever the reply belonged to a Maya campaign: the caller must NOT run the generic auto-reply. */
  handled: boolean;
  reason?: string;
  problems?: string[];
  draft?: { subject: string; body: string; text: string };
  queueId?: string;
  idempotencyKey?: string;
  wouldEnqueue?: boolean;
  wouldSend?: boolean;
}

export interface MayaReplyDraftDeps {
  loadCampaign: (campaignId: string) => Promise<CampaignIdentity | null>;
  killSwitchOff: () => Promise<boolean>;
  evaluate: (leadId: number, toEmail: string) => Promise<{ allowed: boolean; blockedReason?: string }>;
  memory: (leadId: number) => Promise<string>;
  joinUrl: (leadId: number) => Promise<string | null>;
  compose: (system: string, user: string) => Promise<string | null>;
  enqueue: (row: {
    idempotencyKey: string; leadId: number; recipientAddress: string; recipientDisplay: string | null;
    subject: string; body: string;
  }) => Promise<{ id: string; deduped: boolean }>;
  autoReplyEnabled: () => Promise<boolean>;
  autoDeliver: (queueId: string) => Promise<{ ok: boolean; status: string }>;
  recordActivity: (leadId: number, subject: string, body: string, metadata: Record<string, unknown>) => Promise<void>;
  log: (event: string, outcome: 'success' | 'failure' | 'partial', context: Record<string, unknown>) => void;
}

/* ── pure helpers ────────────────────────────────────────────────────────── */

/** A Maya campaign: its sender is Maya, or its AI prompt is Maya's. */
export function isMayaCampaign(c: CampaignIdentity | null | undefined): boolean {
  if (!c) return false;
  const names = [c.sender_profile_from_name, c.settings?.sender_name].filter((n): n is string => typeof n === 'string');
  if (names.some((n) => /^\s*maya\b/i.test(n))) return true;
  return /^\s*you are maya\b/i.test(String(c.ai_system_prompt || ''));
}

/** The NEW words of a reply: markup and the quoted thread below "On ... wrote:" / "> " lines removed. */
export function extractNewReplyText(raw: string): string {
  const text = String(raw || '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")
    .replace(/\r\n/g, '\n');
  const kept: string[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (/^On .{3,200}wrote:$/i.test(t) || /^-{2,}\s*Original Message/i.test(t) || /^From:\s/i.test(t) || /^Sent from my /i.test(t)) break;
    if (t.startsWith('>')) continue;
    kept.push(line);
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 2000);
}

/** Every problem with a drafted reply; empty when it may be queued. */
export function screenReplyCopy(subject: string, text: string, allowedLinks: string[]): string[] {
  const problems: string[] = [];
  const all = `${subject || ''}\n${text || ''}`;
  for (const [re, label] of BANNED) if (re.test(all)) problems.push(`mentions ${label}`);
  const urls = (text || '').match(/https?:\/\/[^\s"'<>)]+/g) || [];
  for (const u of urls) {
    const clean = u.replace(/[.,;:!?]+$/, '');
    if (clean === MAIN_SITE || clean === `${MAIN_SITE}/` || clean === PORTAL_TODAY_URL || allowedLinks.includes(clean)) continue;
    problems.push(`links somewhere else (${clean.slice(0, 60)})`);
  }
  if (!text || text.trim().length < 20) problems.push('too short to be an answer');
  return problems;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Plain paragraphs -> the exact HTML the reviewer sees and the provider receives. Links stay clickable. */
export function toReplyHtml(text: string): string {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/(https?:\/\/[^\s"'<>)]+)/g, (u) => {
      const clean = u.replace(/[.,;:!?]+$/, '');
      return `<a href="${clean}">${clean}</a>${u.slice(clean.length)}`;
    }).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

export function replySubject(subject: string): string {
  const s = (subject || '').trim() || 'Your note';
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

/** The inbound Message-Id is the key; without one, the lead and the reply text are. */
export function replyIdempotencyKey(leadId: number, messageId: string | null | undefined, text: string): string {
  const basis = messageId && messageId.trim() ? `mid:${messageId.trim().replace(/[<>]/g, '')}` : `lead:${leadId}:${text}`;
  return `maya-reply-${crypto.createHash('sha256').update(basis, 'utf8').digest('hex').slice(0, 32)}`;
}

const DEFAULT_PERSONA = 'You are Maya, Director of Admissions at Colaberry. You are warm, helpful and plain-spoken. You are an AI assistant on the admissions team, and you say so if asked.';

export function buildReplyPrompts(input: {
  persona: string | null | undefined; firstName: string | null; theirWords: string; memory: string; joinUrl: string | null;
}): { system: string; user: string } {
  const persona = input.persona && /^\s*you are maya\b/i.test(input.persona) ? input.persona.trim() : DEFAULT_PERSONA;
  const links = [input.joinUrl ? `their Open House Join link ${input.joinUrl}` : null, `the platform Today page ${PORTAL_TODAY_URL}`]
    .filter(Boolean).join(' or ');
  const system = [
    persona,
    '',
    'YOU ARE ANSWERING AN EMAIL THEY SENT YOU. Rules that always hold:',
    '- Answer what they actually said or asked, directly and warmly, in 2 to 5 short sentences. Plain text, no subject line, no markdown.',
    '- Use the conversation history to stay consistent and to avoid repeating yourself. Never invent a fact about the program, a date, a person or them.',
    '- Never state or hint at a price, payment, tuition, discount, special deal, scholarship, percentage, seat count or deadline, and never describe anything as costing nothing. If they ask about any of these, say an admissions advisor will follow up with them personally.',
    `- No links except ${links}, and only when it helps them.`,
    '- If they ask to stop hearing from us, apologize and confirm it. If you do not know something, say someone from the team will follow up.',
    '- Sign off on its own line as: Maya',
  ].join('\n');
  const user = [
    input.memory ? input.memory : 'There is no earlier conversation on record.',
    '',
    `THEIR EMAIL${input.firstName ? ` (from ${input.firstName})` : ''}:`,
    input.theirWords,
    '',
    'Write Maya\'s reply.',
  ].join('\n');
  return { system, user };
}

function firstNameOf(name: string | null | undefined): string | null {
  const f = (name || '').trim().split(/\s+/)[0] || '';
  return f && !f.includes('@') ? f : null;
}

/* ── the flow ────────────────────────────────────────────────────────────── */

export async function maybeDraftMayaReply(
  input: InboundReplyInput,
  opts: { dryRun?: boolean } = {},
  deps: MayaReplyDraftDeps = defaultDeps(),
): Promise<ReplyDraftResult> {
  const ctx = { lead_id: input.leadId, campaign_id: input.campaignId, dry_run: !!opts.dryRun };
  let isMaya = false;
  try {
    if (!input.campaignId) return { outcome: 'not_maya', handled: false };
    const campaign = await deps.loadCampaign(input.campaignId);
    if (!isMayaCampaign(campaign)) return { outcome: 'not_maya', handled: false };
    isMaya = true;

    // From here on the reply is Maya's: whatever happens, the generic "Dhee" auto-reply must not run.
    const theirWords = extractNewReplyText(input.body);
    if (!theirWords) {
      deps.log('maya_reply_draft_skipped', 'partial', { ...ctx, reason: 'empty_reply' });
      return { outcome: 'empty_reply', handled: true };
    }

    if (await deps.killSwitchOff()) {
      deps.log('maya_reply_draft_skipped', 'partial', { ...ctx, reason: 'kill_switch' });
      return { outcome: 'kill_switch', handled: true };
    }

    // evaluateSend RECORDS a consent verdict, so a dry run (which writes nothing) does not call it.
    if (!opts.dryRun) {
      const decision = await deps.evaluate(input.leadId, input.fromEmail);
      if (!decision.allowed) {
        deps.log('maya_reply_draft_skipped', 'partial', { ...ctx, reason: 'blocked', blocked_reason: decision.blockedReason });
        return { outcome: 'blocked', handled: true, reason: decision.blockedReason };
      }
    }

    const [memory, joinUrl] = await Promise.all([
      deps.memory(input.leadId).catch(() => ''),
      deps.joinUrl(input.leadId).catch(() => null),
    ]);
    const prompts = buildReplyPrompts({
      persona: campaign?.ai_system_prompt, firstName: firstNameOf(input.leadName), theirWords, memory, joinUrl,
    });
    const raw = await deps.compose(prompts.system, prompts.user);
    if (!raw || !raw.trim()) {
      deps.log('maya_reply_draft_failed', 'failure', { ...ctx, reason: 'compose_failed' });
      if (!opts.dryRun) {
        await deps.recordActivity(input.leadId, 'Maya could not draft a reply - a person should answer',
          theirWords.slice(0, 500), { maya_reply: true, reason: 'compose_failed' }).catch(() => undefined);
      }
      return { outcome: 'compose_failed', handled: true };
    }

    const text = softenIdioms(raw.trim());
    const subject = replySubject(input.subject);
    const problems = screenReplyCopy(subject, text, joinUrl ? [joinUrl] : []);
    const idempotencyKey = replyIdempotencyKey(input.leadId, input.messageId, theirWords);
    const draft = { subject, body: toReplyHtml(text), text };
    if (problems.length > 0) {
      deps.log('maya_reply_draft_rejected', 'partial', { ...ctx, problems });
      if (!opts.dryRun) {
        await deps.recordActivity(input.leadId, 'Maya\'s draft reply failed the copy screen - a person should answer',
          theirWords.slice(0, 500), { maya_reply: true, reason: 'screen_rejected', problems }).catch(() => undefined);
      }
      return { outcome: 'screen_rejected', handled: true, problems, draft, idempotencyKey };
    }

    const autoOn = await deps.autoReplyEnabled().catch(() => false);
    const wouldSend = autoOn && !input.explorer;
    if (opts.dryRun) {
      deps.log('maya_reply_draft_dry_run', 'success', { ...ctx, would_send: wouldSend });
      return { outcome: 'dry_run', handled: true, draft, idempotencyKey, wouldEnqueue: true, wouldSend };
    }

    const queued = await deps.enqueue({
      idempotencyKey, leadId: input.leadId, recipientAddress: input.fromEmail,
      recipientDisplay: input.leadName ?? null, subject, body: draft.body,
    });
    if (queued.deduped) {
      // The same inbound message again (a webhook retry). One row, and never a second send.
      deps.log('maya_reply_draft_deduped', 'success', { ...ctx, queue_id: queued.id });
      return { outcome: 'deduped', handled: true, queueId: queued.id, idempotencyKey, draft };
    }
    await deps.recordActivity(input.leadId, `Maya drafted a reply: ${subject}`, text.slice(0, 2000), {
      maya_reply: true, outbound_approval_id: queued.id, status: wouldSend ? 'auto_send' : 'awaiting_review',
      explorer: !!input.explorer, in_reply_to: input.inReplyTo ?? null,
    }).catch(() => undefined);

    if (!wouldSend) {
      deps.log('maya_reply_draft_queued', 'success', { ...ctx, queue_id: queued.id, explorer: !!input.explorer });
      return { outcome: 'queued', handled: true, queueId: queued.id, idempotencyKey, draft, wouldSend: false };
    }

    const delivered = await deps.autoDeliver(queued.id);
    deps.log(delivered.ok ? 'maya_reply_auto_sent' : 'maya_reply_auto_send_failed', delivered.ok ? 'success' : 'failure',
      { ...ctx, queue_id: queued.id, status: delivered.status });
    return { outcome: delivered.ok ? 'sent' : 'send_failed', handled: true, queueId: queued.id, idempotencyKey, draft, wouldSend: true };
  } catch (err: unknown) {
    deps.log('maya_reply_draft_error', 'failure', {
      ...ctx, error_class: err instanceof Error ? err.name : 'UnknownError', message: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
    // A reply we could not classify as Maya's is left to the old path; one we could is still Maya's.
    return { outcome: 'error', handled: isMaya };
  }
}

/** The runbook's check (plan T10 4e): compose and screen, write nothing. */
export function draftMayaReplyDryRun(input: InboundReplyInput, deps?: MayaReplyDraftDeps): Promise<ReplyDraftResult> {
  return maybeDraftMayaReply(input, { dryRun: true }, deps);
}

/* ── default (production) dependencies, all lazily imported ──────────────── */

function settingIsOn(v: unknown): boolean {
  return v === true || v === 'true';
}

function defaultDeps(): MayaReplyDraftDeps {
  return {
    loadCampaign: async (campaignId) => {
      const rows = await sequelize.query<{ id: string; settings: Record<string, any> | null; ai_system_prompt: string | null; from_name: string | null }>(
        `SELECT c.id, c.settings, c.ai_system_prompt, sp.from_name
           FROM campaigns c LEFT JOIN sender_profiles sp ON sp.id = c.sender_profile_id
          WHERE c.id = :campaignId LIMIT 1`,
        { type: QueryTypes.SELECT, replacements: { campaignId } },
      );
      const r = rows[0];
      return r ? { id: r.id, settings: r.settings, ai_system_prompt: r.ai_system_prompt, sender_profile_from_name: r.from_name } : null;
    },
    killSwitchOff: async () => {
      const { resolveMayaMode } = await import('./mayaPromotion');
      return (await resolveMayaMode('sendEmail')).mode === 'off';
    },
    evaluate: async (leadId, toEmail) => {
      const { evaluateSend } = await import('../communicationSafetyService');
      const d = await evaluateSend({ leadId, channel: 'email', toEmail, source: 'agent' });
      return { allowed: d.allowed, blockedReason: d.blockedReason };
    },
    memory: (leadId) => mayaMemoryBlock({ leadId }, { limit: 20, maxChars: 3500 }),
    joinUrl: async (leadId) => {
      const rows = await sequelize.query<{ url: string | null }>(
        `SELECT metadata->>'event_join_url' AS url FROM scheduled_emails
          WHERE lead_id = :leadId AND metadata->>'event_join_url' IS NOT NULL
          ORDER BY created_at DESC LIMIT 1`,
        { type: QueryTypes.SELECT, replacements: { leadId } },
      );
      return rows[0]?.url || null;
    },
    compose: async (system, user) => {
      const { getInstrumentedOpenAI } = await import('../openaiInstrumented');
      const openai = getInstrumentedOpenAI({ workflow_id: 'maya_email_reply' }, { timeout: 30_000, maxRetries: 1 });
      const completion = await openai.chat.completions.create({
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.5, max_tokens: 400,
      });
      return completion.choices[0]?.message?.content ?? null;
    },
    enqueue: async ({ idempotencyKey, leadId, recipientAddress, recipientDisplay, subject, body }) => {
      const { enqueueOutbound } = await import('./mayaOutboundQueue');
      const r = await enqueueOutbound({
        recipientRef: `lead:${leadId}`, recipientAddress, recipientDisplay, channel: 'email', subject, body,
        composedBy: `${MAYA_REPLY_COMPOSER_PREFIX}${leadId}`, capability: 'sendEmail',
        correlationId: idempotencyKey, idempotencyKey,
      });
      return { id: r.id, deduped: r.deduped };
    },
    autoReplyEnabled: async () => {
      const { getSetting } = await import('../settingsService');
      return settingIsOn(await getSetting(AUTO_REPLY_SETTING));
    },
    autoDeliver: async (queueId) => {
      // The setting is Ali's standing decision for this one kind of message. The row is claimed exactly like
      // approveOutbound claims it (conditional UPDATE, so a retry cannot deliver twice) and delivered by the same
      // function; a failure is recorded on the row and never retried.
      const { default: MayaOutboundApproval } = await import('../../models/MayaOutboundApproval');
      const { deliverOutboundRow } = await import('./mayaOutboundDelivery');
      const at = new Date();
      const [claimed] = await MayaOutboundApproval.update(
        { status: 'sending', decided_by: AUTO_REPLY_DECIDER, decided_at: at, decision_note: `${AUTO_REPLY_SETTING} was on`, updated_at: at },
        { where: { id: queueId, status: 'pending_approval' } },
      );
      if (claimed === 0) return { ok: false, status: 'not_pending' };
      const row = await MayaOutboundApproval.findByPk(queueId);
      if (!row) return { ok: false, status: 'gone' };
      try {
        await deliverOutboundRow(row);
        await MayaOutboundApproval.update({ status: 'sent', delivered_at: new Date(), updated_at: new Date() }, { where: { id: queueId, status: 'sending' } });
        return { ok: true, status: 'sent' };
      } catch (err: unknown) {
        const { classifyError } = await import('../../utils/errorClassifier');
        await MayaOutboundApproval.update({ status: 'failed', failure_reason: classifyError(err), updated_at: new Date() }, { where: { id: queueId, status: 'sending' } });
        return { ok: false, status: 'failed' };
      }
    },
    recordActivity: async (leadId, subject, body, metadata) => {
      const { logActivity } = await import('../activityService');
      await logActivity({ lead_id: leadId, type: 'system', subject, body, metadata: { channel: 'email', ...metadata } });
    },
    log: (event, outcome, context) => console.log(JSON.stringify({
      timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'warn' : 'info', service: 'maya', event, outcome, context,
    })),
  };
}

/* ── CLI: the runbook's dry run. `--no-enqueue` is REQUIRED; without it the command refuses. ─────────────── */

async function cli(argv: string[]): Promise<number> {
  const arg = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  if (!argv.includes('--no-enqueue')) {
    console.error('Refusing: this command only runs with --no-enqueue (compose and screen, write nothing).');
    return 2;
  }
  const email = (arg('--email') || '').trim().toLowerCase();
  const text = arg('--text') || 'Thanks Maya - will the Open House be recorded? I might be a few minutes late.';
  if (!email) { console.error('Usage: --no-enqueue --email <lead email> [--text "..."] [--campaign <id>]'); return 2; }
  const leads = await sequelize.query<{ id: number; name: string | null }>(
    'SELECT id, name FROM leads WHERE lower(email) = :email LIMIT 1', { type: QueryTypes.SELECT, replacements: { email } },
  );
  if (!leads[0]) { console.error('No lead for that email.'); return 1; }
  let campaignId = arg('--campaign') || null;
  if (!campaignId) {
    const cl = await sequelize.query<{ campaign_id: string }>(
      `SELECT campaign_id FROM campaign_leads WHERE lead_id = :id ORDER BY enrolled_at DESC NULLS LAST LIMIT 1`,
      { type: QueryTypes.SELECT, replacements: { id: leads[0].id } },
    );
    campaignId = cl[0]?.campaign_id || null;
  }
  const result = await draftMayaReplyDryRun({
    leadId: leads[0].id, fromEmail: email, leadName: leads[0].name, subject: 'Re: See you at the Open House',
    body: text, messageId: `dry-run-${Date.now()}@local`, campaignId,
  });
  const decision = result.outcome === 'dry_run'
    ? `would enqueue, would ${result.wouldSend ? '' : 'NOT '}send`
    : `would not enqueue (${result.outcome}${result.problems ? `: ${result.problems.join('; ')}` : ''})`;
  console.log(JSON.stringify({ outcome: result.outcome, decision, subject: result.draft?.subject, text: result.draft?.text }, null, 2));
  return 0;
}

if (require.main === module) {
  cli(process.argv.slice(2))
    .then((code) => sequelize.close().finally(() => process.exit(code)))
    .catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); });
}
