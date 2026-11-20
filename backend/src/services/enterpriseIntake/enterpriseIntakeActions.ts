/**
 * enterpriseIntakeActions - the steps a person takes on a client (W31-W32, Phases 4-5).
 *
 * Everything that reaches the client, or changes what they are to us, is a deliberate action
 * from the admin Enterprise clients page, never automatic:
 *   - send the options email (the AI's draft, as edited by Ali);
 *   - draft the proposal (AI, from everything on the list), then send it (Ali's edit);
 *   - mark signed (opens the client's own Basecamp project) or lost.
 * Each one records itself on the client's Basecamp list and ticks its checklist step.
 *
 * Sends go through sendFirstContactAsAli: from Ali, plain text, signed, BCC Ali, kill switch,
 * exactly once per (recipient, subject, event).
 */
import { z } from 'zod';
import EnterpriseIntake from '../../models/EnterpriseIntake';
import ProjectUnderstandingRecord from '../../models/ProjectUnderstandingRecord';
import { chatJson } from '../runtime/runtimeAi';
import { bcGetAll, bcPost } from '../ops/basecampClient';
import { sendFirstContactAsAli, StyleViolationError } from '../email/sendReplyAsAli';
import { env } from '../../config/env';
import { ascii, esc, intakeBasecampEnabled, tickStep } from './enterpriseIntakeBasecamp';
import { writtenBrief } from './enterpriseIntakeService';
import { syncListStage } from './enterpriseIntakeSync';
import { FREE_WORD_RULE } from '../content/bannedCopyRule';

/** The word 40 TAC 807.172(d) bans in anything advertising training, from the one canonical rule. */
const BANNED_WORD = new RegExp(`\\b${FREE_WORD_RULE.word}\\b`, 'i');

/** The proposal leaves this placeholder for Ali's price. A proposal still carrying it never sends. */
export const PRICE_PLACEHOLDER = '[Ali to add the investment]';

export class ActionRefused extends Error {
  readonly name = 'ActionRefused';
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

/**
 * A price the AI wrote: currency symbols or codes before a number, or a number followed by a
 * currency word or a thousands suffix ("$18,000", "USD 18000", "18,000 dollars", "18k").
 */
export function statesAPrice(text: string): boolean {
  return (
    /(?:[$€£]|\b(?:usd|eur|gbp|us\$)\b)\s?\d/i.test(text) ||
    /\b\d[\d,.]*\s?(?:k\b|thousand\b|million\b|dollars?\b|usd\b|euros?\b|pounds?\b)/i.test(text)
  );
}

/** What may never go to a client in a message Ali sends from this page. Prices he adds are fine. */
export function sendBlockers(subject: string, body: string): string[] {
  const all = `${subject}\n${body}`;
  const out: string[] = [];
  if (!subject.trim() || !body.trim()) out.push('the subject and the message are both needed');
  if (BANNED_WORD.test(all)) out.push(`it uses the word "${FREE_WORD_RULE.word}" (${FREE_WORD_RULE.approvedAlternatives[0]} is the approved phrasing)`);
  if (all.includes(PRICE_PLACEHOLDER)) out.push('the investment has not been added yet');
  return out;
}

async function note(i: EnterpriseIntake, html: string): Promise<void> {
  if (!intakeBasecampEnabled() || !i.bc_todolist_id) return;
  await bcPost(`/buckets/${env.enterpriseIntakeBcProjectId}/recordings/${i.bc_todolist_id}/comments.json`, { content: html });
}

async function tick(i: EnterpriseIntake, key: string): Promise<void> {
  if (!intakeBasecampEnabled() || !i.bc_todolist_id) return;
  await tickStep(env.enterpriseIntakeBcProjectId, i.bc_todolist_id, key).catch(() => false);
}

/** Basecamp side effects after the fact: logged, never undo the action itself. */
async function record(i: EnterpriseIntake, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    await syncListStage(i);
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', service: 'enterprise-intake-actions', event: 'enterprise_intake_bc_note_failed', outcome: 'failure', context: { intake_id: i.id, message: String((err as Error)?.message || err).slice(0, 200) } }));
  }
}

async function load(id: string): Promise<EnterpriseIntake> {
  const i = await EnterpriseIntake.findByPk(id);
  if (!i) throw new ActionRefused('No such client', 404);
  if (i.lost_at) throw new ActionRefused('This client is marked lost');
  return i;
}

async function send(i: EnterpriseIntake, kind: 'options' | 'proposal', subject: string, body: string) {
  const blockers = sendBlockers(subject, body);
  if (blockers.length) throw new ActionRefused(`Not sent: ${blockers.join('; ')}.`, 422);
  try {
    const out = await sendFirstContactAsAli({
      recipient: i.email,
      subject,
      body,
      businessEventId: `enterprise-intake-${kind}-${i.id}`,
      tag: `enterprise-intake-${kind}`,
    });
    if (out.outcome === 'failed') throw new ActionRefused(`The email failed: ${out.error}`, 502);
    if (out.outcome === 'skipped' && out.reason !== 'already_sent') throw new ActionRefused(`Not sent: ${out.reason}.`, 409);
    return out;
  } catch (err) {
    if (err instanceof StyleViolationError) throw new ActionRefused(err.message, 422);
    throw err;
  }
}

type SentColumn = 'options_email_sent_at' | 'proposal_sent_at';

/**
 * Once, across clicks, tabs and processes: claim the "sent" column (set it only where it is
 * still null) BEFORE sending, so two clicks with different subjects cannot both go out. If the
 * send then does not happen, the claim is released so it can be tried again.
 */
async function claimSend(i: EnterpriseIntake, column: SentColumn): Promise<void> {
  const [n] = await EnterpriseIntake.update({ [column]: new Date() } as Partial<EnterpriseIntake>, {
    where: { id: i.id, [column]: null, lost_at: null } as Record<string, unknown>,
  });
  if (n !== 1) throw new ActionRefused(column === 'proposal_sent_at' ? 'The proposal was already sent' : 'The options email was already sent');
}

async function releaseSend(i: EnterpriseIntake, column: SentColumn): Promise<void> {
  await EnterpriseIntake.update({ [column]: null } as Partial<EnterpriseIntake>, { where: { id: i.id } });
}

async function sendClaimed(i: EnterpriseIntake, column: SentColumn, kind: 'options' | 'proposal', subject: string, body: string) {
  const blockers = sendBlockers(subject, body);
  if (blockers.length) throw new ActionRefused(`Not sent: ${blockers.join('; ')}.`, 422);
  await claimSend(i, column);
  try {
    return await send(i, kind, subject, body);
  } catch (err) {
    await releaseSend(i, column);
    throw err;
  }
}

export async function sendOptionsEmail(id: string, subject: string, body: string): Promise<{ sent: boolean; already: boolean }> {
  const i = await load(id);
  if (!i.researched_at) throw new ActionRefused('There are no pilot options yet');
  const out = await sendClaimed(i, 'options_email_sent_at', 'options', subject, body);
  await i.update({ options_email_subject: subject, options_email_body: body, options_email_sent_at: i.options_email_sent_at || new Date() });
  await record(i, async () => {
    await note(i, `<div><strong>Options email sent by Ali</strong> to ${esc(i.email)}.</div><div><em>Subject:</em> ${esc(subject)}</div><div>${esc(body).replace(/\n/g, '<br>')}</div>`);
    await tick(i, 'options');
  });
  return { sent: true, already: out.outcome === 'skipped' };
}

const proposalSchema = z.object({ subject: z.string().trim().min(1).max(150), body: z.string().trim().min(200).max(8000) });

const PROPOSAL_SYSTEM = [
  'You write pilot proposals for Colaberry (builds AI systems, guides teams building them, trains staff).',
  'Write a plain-text proposal email from Ali Muwwakkil to the prospect, from ONLY the facts given.',
  'Sections, each with a short heading line: Where you are today; What the pilot does; How we will',
  'measure it; Timeline (in weeks); What we need from you; Investment; Next step.',
  `Under Investment write exactly: ${PRICE_PLACEHOLDER}`,
  `Never state a price yourself, never use the word "${FREE_WORD_RULE.word}", never promise a saving or an outcome,`,
  'no em or en dashes, American spelling, no signature. Return JSON {"subject","body"}.',
].join(' ');

export async function draftProposal(id: string): Promise<{ subject: string; body: string }> {
  const i = await load(id);
  if (!i.understanding_id) throw new ActionRefused('Draft the proposal after the interview');
  const understanding = await ProjectUnderstandingRecord.findByPk(i.understanding_id);
  const facts = ((understanding?.items as Array<{ dimension: string; value: string }>) || []).map((x) => `- [${x.dimension}] ${x.value}`);
  const options = ((i.pilot_options || []) as Array<Record<string, string>>).map((o, n) => `${n + 1}. ${o.title} (${o.service}): ${o.what_it_does}. Success: ${o.success_measure}`);
  const user = [
    `Prospect: ${i.full_name} (${i.role || 'role not stated'}) at ${i.company}.`,
    '', 'FORM:', writtenBrief(i),
    '', 'INTERVIEW WRITE-UP:', facts.join('\n') || 'none',
    '', 'RESEARCH:', JSON.stringify(i.research || {}),
    '', 'PILOT OPTIONS WE PROPOSED:', options.join('\n') || 'none',
  ].join('\n');
  const { parsed } = await chatJson('enterprise-intake-proposal', PROPOSAL_SYSTEM, user, undefined, 2200);
  const r = proposalSchema.safeParse(parsed);
  if (!r.success) throw new ActionRefused('The AI draft did not come back complete. Try again.', 502);
  const body = r.data.body.replace(/[–—]/g, '-');
  if (BANNED_WORD.test(body) || !body.includes(PRICE_PLACEHOLDER) || statesAPrice(body.replace(PRICE_PLACEHOLDER, ''))) {
    throw new ActionRefused('The AI draft broke a proposal rule (price or wording). Try again.', 502);
  }
  await i.update({ proposal_subject: r.data.subject, proposal_body: body, proposal_drafted_at: new Date() });
  await record(i, async () => {
    await note(i, `<div><strong>Proposal drafted (AI, not sent).</strong> Edit and send it from Admin, Enterprise clients.</div><div><em>Subject:</em> ${esc(r.data.subject)}</div><div>${esc(body).replace(/\n/g, '<br>')}</div>`);
    await tick(i, 'proposal');
  });
  return { subject: r.data.subject, body };
}

export async function sendProposal(id: string, subject: string, body: string): Promise<{ sent: boolean; already: boolean }> {
  const i = await load(id);
  if (!i.proposal_drafted_at) throw new ActionRefused('Draft the proposal first');
  const out = await sendClaimed(i, 'proposal_sent_at', 'proposal', subject, body);
  await i.update({ proposal_subject: subject, proposal_body: body, proposal_sent_at: i.proposal_sent_at || new Date() });
  await record(i, async () => {
    await note(i, `<div><strong>Proposal approved and sent by Ali</strong> to ${esc(i.email)}.</div><div><em>Subject:</em> ${esc(subject)}</div>`);
    await tick(i, 'approve');
  });
  return { sent: true, already: out.outcome === 'skipped' };
}

const signing = new Set<string>();

/** Signed: the client's own Basecamp project, once (a double click cannot open two). */
export async function markSigned(id: string): Promise<{ projectId: string | null; projectUrl: string | null }> {
  if (signing.has(id)) throw new ActionRefused('Already being marked signed');
  signing.add(id);
  try {
    return await signOnce(id);
  } finally {
    signing.delete(id);
  }
}

export const projectName = (company: string) => ascii(`${company} - Colaberry Enterprise`).slice(0, 200);

async function signOnce(id: string): Promise<{ projectId: string | null; projectUrl: string | null }> {
  const i = await load(id);
  // Signed and lost are exclusive: this claim only lands on a row that is not lost.
  if (!i.signed_at) {
    const [n] = await EnterpriseIntake.update({ signed_at: new Date(), status: 'signed' } as Partial<EnterpriseIntake>, {
      where: { id: i.id, signed_at: null, lost_at: null } as Record<string, unknown>,
    });
    if (n !== 1) throw new ActionRefused('This client was just marked lost or signed elsewhere. Reload.');
    await i.reload();
  }
  let projectId = i.bc_project_id;
  let projectUrl: string | null = projectId ? `https://3.basecamp.com/3945211/projects/${projectId}` : null;
  if (!projectId && intakeBasecampEnabled()) {
    const name = projectName(i.company);
    // A project from an earlier attempt whose id never got saved is found by name, not duplicated.
    const existing = (await bcGetAll<{ id: number; name: string; app_url: string }>('/projects.json')).find((p) => p.name === name);
    const p = existing || (await bcPost<{ id: number; app_url: string }>('/projects.json', {
      name,
      description: ascii(`Client project for ${i.company} (${i.full_name}). Opened from the Colaberry Enterprise Intake when they signed.`),
    }));
    projectId = String(p.id);
    projectUrl = p.app_url;
    await i.update({ bc_project_id: projectId });
  }
  await record(i, async () => {
    await note(i, `<div><strong>Signed.</strong> ${projectUrl ? `Their own project: <a href="${esc(projectUrl)}">${esc(i.company)} - Colaberry Enterprise</a>.` : ''}</div>`);
    await tick(i, 'signed');
  });
  return { projectId: projectId || null, projectUrl };
}

export async function markLost(id: string, reason: string): Promise<void> {
  const i = await EnterpriseIntake.findByPk(id);
  if (!i) throw new ActionRefused('No such client', 404);
  if (i.signed_at) throw new ActionRefused('This client has signed');
  // Exclusive with signed, atomically: a concurrent "signed" cannot leave the row both.
  const [n] = await EnterpriseIntake.update(
    { lost_at: i.lost_at || new Date(), lost_reason: reason.slice(0, 500), status: 'lost' } as Partial<EnterpriseIntake>,
    { where: { id: i.id, signed_at: null } as Record<string, unknown> },
  );
  if (n !== 1) throw new ActionRefused('This client has signed');
  await i.reload();
  await record(i, () => note(i, `<div><strong>Marked lost.</strong> ${esc(reason || 'No reason given.')}</div>`));
}
