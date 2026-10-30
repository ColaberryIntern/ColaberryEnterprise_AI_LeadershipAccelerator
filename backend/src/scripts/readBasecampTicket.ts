/**
 * Prints ONE Basecamp todo in full: its whole description, then every comment. READ-ONLY.
 *
 * Why this exists alongside `readAgentFactoryLadder.ts`: that script lists the queue and
 * deliberately truncates each description, because 32 full ticket bodies is not a list. But the
 * Agent Factory descriptions open with ~250 characters of identical boilerplate -- "Source of
 * truth: AGENT FACTORY MASTER INDEX ... Canonical folder ... Initiative ... Priority" -- so a
 * truncated read of AF3.3 contains no requirement at all, only its own filing metadata. Working a
 * ticket from that is guessing.
 *
 * Comments are included because they are where a ticket actually changes. AF2.9's own history
 * lived in its comments, and a ticket read without them can describe work that was already
 * renegotiated.
 *
 * Run (inside the backend container):
 *   TICKET=10406234458 node dist/scripts/readBasecampTicket.js
 *
 * `BUCKET` defaults to the Agent Factory project; pass it for a todo on another board.
 */
import { bcGet, bcGetAll } from '../services/ops/basecampClient';
import { AGENT_FACTORY_BUCKET } from './readAgentFactoryLadder';

interface BcPerson { readonly name?: string }
interface BcTodoFull {
  readonly id: number;
  readonly title: string;
  readonly completed: boolean;
  readonly due_on: string | null;
  readonly app_url?: string;
  readonly assignees?: readonly BcPerson[];
  readonly description?: string;
}
interface BcComment {
  readonly id: number;
  readonly created_at: string;
  readonly creator?: BcPerson;
  readonly content?: string;
}

/**
 * Basecamp stores rich HTML. Keep the PARAGRAPH BREAKS -- unlike the list view's one-line
 * flatten, which glues sentences together and makes a structured ticket (objective, acceptance
 * criteria, inputs) read as one run-on wall. The structure is most of the information here.
 */
export function htmlToText(html: string | undefined): string {
  return String(html || '')
    .replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/li)\s*\/?>/gi, '\n')
    // Unindented on purpose: the `[ \t]+` collapse below would squash a leading "  - " to " - "
    // on every line but the first, so an indented bullet list came out raggedly aligned.
    .replace(/<\s*li[^>]*>/gi, '- ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface TicketRead {
  readonly id: number;
  readonly title: string;
  readonly completed: boolean;
  readonly due: string | null;
  readonly url: string;
  readonly assignees: readonly string[];
  readonly description: string;
  readonly comments: readonly { author: string; at: string; text: string }[];
}

export async function readTicket(ticketId: number, bucket: number = AGENT_FACTORY_BUCKET): Promise<TicketRead> {
  const t = await bcGet<BcTodoFull>(`/buckets/${bucket}/todos/${ticketId}.json`);
  // Paginated: a long-running ticket's comments run past the first page, and a ticket's LATEST
  // comment is usually the one that changes what the work is.
  const comments = await bcGetAll<BcComment>(`/buckets/${bucket}/recordings/${ticketId}/comments.json`);
  return {
    id: t.id,
    title: t.title,
    completed: t.completed,
    due: t.due_on || null,
    url: t.app_url || '',
    assignees: (t.assignees || []).map((a) => a.name || '').filter(Boolean),
    description: htmlToText(t.description),
    comments: comments.map((c) => ({
      author: c.creator?.name || 'unknown',
      at: c.created_at,
      text: htmlToText(c.content),
    })),
  };
}

export function renderTicket(t: TicketRead): string {
  const lines = [
    `#${t.id}  ${t.title}`,
    `completed=${t.completed}  due=${t.due ?? 'NONE'}  assignees=${t.assignees.join(', ') || 'UNASSIGNED'}`,
  ];
  if (t.url) lines.push(t.url);
  lines.push('', '--- description ---', t.description || '(empty)');
  lines.push('', `--- ${t.comments.length} comment(s) ---`);
  for (const c of t.comments) {
    lines.push('', `[${c.at}] ${c.author}`, c.text || '(empty)');
  }
  return lines.join('\n');
}

export async function main(): Promise<void> {
  const ticket = Number(process.env.TICKET);
  if (!Number.isFinite(ticket) || ticket <= 0) {
    throw new Error('set TICKET=<todo id>');
  }
  const bucket = Number(process.env.BUCKET || AGENT_FACTORY_BUCKET);
  console.log(renderTicket(await readTicket(ticket, bucket)));
}

/* istanbul ignore next -- entry point only; the tests drive readTicket/renderTicket. */
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error('readBasecampTicket failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
