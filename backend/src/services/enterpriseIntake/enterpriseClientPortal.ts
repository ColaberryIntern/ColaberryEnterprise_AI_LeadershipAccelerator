/**
 * enterpriseClientPortal - the client's own view of their pilot (W32, Phase 5).
 *
 *     "Eventually client login to enterprise"  (Ali, 2026-11-20)
 *
 * A prospect or client signs in by email link, like the student portal: they type their email
 * at /my-pilot, and if we have an intake for it we email a link that is good for 7 days. The
 * link carries a signed token (audience `enterprise-client`), never the intake id, so it cannot
 * be guessed or reused after it expires.
 *
 * What they see is THEIR progress only: the steps done and when, the names of the pilot options
 * once Ali has sent them, the proposal date once sent, and whether their project is open. Never
 * the AI write-up, the research, drafts, internal notes or Basecamp links.
 *
 * The request endpoint answers the same way whether or not the email is known, so it cannot be
 * used to learn who has asked us for a pilot.
 */
import jwt from 'jsonwebtoken';
import EnterpriseIntake from '../../models/EnterpriseIntake';
import { env } from '../../config/env';
import { sendEnterpriseClientLink } from '../emailService';

export const CLIENT_AUDIENCE = 'enterprise-client';
const LINK_TTL = '7d';

export function issueClientToken(intakeId: string): string {
  return jwt.sign({ sub: intakeId }, env.jwtSecret, { audience: CLIENT_AUDIENCE, expiresIn: LINK_TTL });
}

/** The intake id a valid, unexpired client token names, else null. */
export function verifyClientToken(token: string): string | null {
  try {
    const p = jwt.verify(String(token || ''), env.jwtSecret, { audience: CLIENT_AUDIENCE }) as jwt.JwtPayload;
    return typeof p.sub === 'string' ? p.sub : null;
  } catch {
    return null;
  }
}

export function clientLink(intakeId: string): string {
  return `${env.frontendUrl.replace(/\/$/, '')}/my-pilot/status?token=${encodeURIComponent(issueClientToken(intakeId))}`;
}

/**
 * Email a sign-in link to someone who has an intake. Always resolves the same way to the caller.
 * The newest intake for that address is the one shown.
 */
export async function requestClientLink(rawEmail: string): Promise<void> {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email) return;
  const intake = await EnterpriseIntake.findOne({ where: { email }, order: [['created_at', 'DESC']] });
  if (!intake) return;
  await sendEnterpriseClientLink({ to: intake.email, fullName: intake.full_name, company: intake.company, link: clientLink(intake.id) });
}

export interface ClientStep {
  label: string;
  done: boolean;
  at: Date | null;
}

export interface ClientStatus {
  company: string;
  firstName: string;
  steps: ClientStep[];
  options: string[];
  next: string;
  closed: 'signed' | 'lost' | null;
}

/** Their progress, in their words. Built only from fields that are safe for them to see. */
export function clientStatus(i: EnterpriseIntake): ClientStatus {
  const options = i.options_email_sent_at
    ? ((i.pilot_options || []) as Array<{ title?: string }>).map((o) => String(o.title || '')).filter(Boolean)
    : [];
  const steps: ClientStep[] = [
    { label: 'You asked for a demo pilot', done: true, at: i.createdAt || null },
    { label: 'Your AI interview', done: Boolean(i.interviewed_at), at: i.interviewed_at },
    { label: 'We researched your company and drafted pilot options', done: Boolean(i.researched_at), at: i.researched_at },
    { label: 'Your pilot options were sent to you', done: Boolean(i.options_email_sent_at), at: i.options_email_sent_at },
    { label: 'Your proposal was sent to you', done: Boolean(i.proposal_sent_at), at: i.proposal_sent_at },
    { label: 'Your pilot project is open', done: Boolean(i.signed_at), at: i.signed_at },
  ];
  let next = 'Someone from Colaberry will email you to set up a first meeting.';
  if (!i.interviewed_at) next = 'Finish your 10-minute AI interview, so we can prepare your options.';
  else if (i.signed_at) next = 'Your pilot is underway. Your Colaberry team will keep you posted.';
  else if (i.proposal_sent_at) next = 'Reply to the proposal email with any questions, or to get started.';
  else if (i.options_email_sent_at) next = 'Reply to the options email to pick a time to walk through them.';
  return {
    company: i.company,
    firstName: String(i.full_name || '').split(/\s+/)[0] || '',
    steps,
    options,
    next: i.lost_at ? 'This request is closed. Email info@colaberry.com any time to pick it back up.' : next,
    closed: i.signed_at ? 'signed' : i.lost_at ? 'lost' : null,
  };
}

export async function statusForToken(token: string): Promise<ClientStatus | null> {
  const id = verifyClientToken(token);
  if (!id) return null;
  const i = await EnterpriseIntake.findByPk(id);
  return i ? clientStatus(i) : null;
}
