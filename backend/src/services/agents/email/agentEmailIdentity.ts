/**
 * agentEmailIdentity - an agent's email addresses (agent comms tool, Ali 2026-11-22).
 *
 * Ali: "Using the tool should allow you to have a fake email that can be responded to by the
 * agent. Maya would be maya@colaberry.com." colaberry.com mail lives in Google Workspace, which
 * Mandrill cannot receive, so (Ali's choice) each agent SHOWS <slug>@colaberry.com and its replies
 * go to <slug>@reply.colaberry.ai, a domain Mandrill receives. A Google routing rule (runbook)
 * forwards mail typed fresh to maya@colaberry.com to the same place.
 *
 * The slug is ai_agents.email_slug (ensureAgentCommsSchema), read here with raw SQL because the
 * AiAgent model file is over the 500-line ceiling. NULL slug = the agent has no email identity.
 *
 * Safety: a slug must look like a mailbox name, and slugs that collide with addresses people or
 * other systems use (ticket replies, enrollment, Ali, info, ...) are refused, so an agent can never
 * claim mail meant for someone else. A recipient only resolves to an agent on the reply domain.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { env } from '../../../config/env';

export const SLUG_RE = /^[a-z][a-z0-9-]{1,30}$/;
// Mailbox names people and systems already use on the reply domain (campaign senders reply as
// <sender>@reply.colaberry.ai), so an agent can never take over their replies.
export const RESERVED_SLUGS = new Set(['ticket', 'enrollment', 'ali', 'info', 'noreply', 'no-reply', 'support', 'admin', 'accounting', 'postmaster', 'abuse',
  'ram', 'jackie', 'kes', 'dhee', 'ops', 'staff', 'hello', 'sales', 'team', 'careers', 'billing', 'hr']);

export interface AgentEmailIdentity {
  agentName: string;
  slug: string;
  displayName: string;
  fromAddress: string;
  fromHeader: string;
  replyTo: string;
}

export function validSlug(slug: unknown): slug is string {
  const s = String(slug || '').toLowerCase();
  return SLUG_RE.test(s) && !RESERVED_SLUGS.has(s) && !s.startsWith('ticket-');
}

const fromDomain = (): string => (env.agentEmailFromDomain || 'colaberry.com').trim().toLowerCase();
const replyDomain = (): string => (env.mandrillInboundDomain || 'reply.colaberry.ai').trim().toLowerCase();

/** Build the identity from a row. Pure. Null when the slug is missing or not allowed. */
export function identityOf(row: { agent_name: string; email_slug: string | null; email_display_name: string | null }): AgentEmailIdentity | null {
  if (!validSlug(row.email_slug)) return null;
  const slug = String(row.email_slug).toLowerCase();
  const displayName = String(row.email_display_name || row.agent_name).replace(/["<>\\\r\n]/g, '').trim().slice(0, 80) || row.agent_name;
  const fromAddress = `${slug}@${fromDomain()}`;
  return { agentName: row.agent_name, slug, displayName, fromAddress, fromHeader: `"${displayName}" <${fromAddress}>`, replyTo: `${slug}@${replyDomain()}` };
}

interface Row { agent_name: string; email_slug: string | null; email_display_name: string | null }

export async function resolveAgentEmailIdentity(agentName: string): Promise<AgentEmailIdentity | null> {
  const rows = await sequelize.query<Row>(
    'SELECT agent_name, email_slug, email_display_name FROM ai_agents WHERE agent_name = :agentName LIMIT 1',
    { replacements: { agentName }, type: QueryTypes.SELECT },
  );
  return rows[0] ? identityOf(rows[0]) : null;
}

/** The identity for a slug (as stored on an approval row), or null. */
export async function identityForSlug(slug: string): Promise<AgentEmailIdentity | null> {
  const s = String(slug || '').toLowerCase();
  if (!validSlug(s)) return null;
  const rows = await sequelize.query<Row>(
    'SELECT agent_name, email_slug, email_display_name FROM ai_agents WHERE lower(email_slug) = :slug LIMIT 1',
    { replacements: { slug: s }, type: QueryTypes.SELECT },
  );
  return rows[0] ? identityOf(rows[0]) : null;
}

/** "Maya <maya@reply.colaberry.ai>" or a bare address -> the lowercased address, or null. */
export function bareAddress(raw: unknown): string | null {
  const s = String(raw || '').trim();
  const m = /<([^>]+)>/.exec(s);
  const addr = (m ? m[1] : s).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(addr) ? addr : null;
}

/** The agent a message was sent to, or null. Only the reply domain counts. */
export async function agentForRecipient(address: unknown): Promise<AgentEmailIdentity | null> {
  const addr = bareAddress(address);
  if (!addr) return null;
  const [local, domain] = addr.split('@');
  if (domain !== replyDomain() || !validSlug(local)) return null;
  const rows = await sequelize.query<Row>(
    'SELECT agent_name, email_slug, email_display_name FROM ai_agents WHERE lower(email_slug) = :slug LIMIT 1',
    { replacements: { slug: local }, type: QueryTypes.SELECT },
  );
  return rows[0] ? identityOf(rows[0]) : null;
}

/** True when an address is one of an agent's own (From or reply), used to stop mail loops. */
export function isAgentOwnAddress(address: unknown, identity: Pick<AgentEmailIdentity, 'fromAddress' | 'replyTo'>): boolean {
  const addr = bareAddress(address);
  return Boolean(addr) && (addr === identity.fromAddress || addr === identity.replyTo || addr!.endsWith(`@${replyDomain()}`));
}
