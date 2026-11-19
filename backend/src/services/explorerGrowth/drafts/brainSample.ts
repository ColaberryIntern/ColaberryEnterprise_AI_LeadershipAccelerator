/**
 * OH1o: "Write a sample" in the Brain tab - real Explorer drafts, through the exact production
 * render (runDraftRender.liveDeps), with NOTHING written and NOTHING sent.
 *
 * The only replaced dependencies are the writers: commitDraft / recommitDraft capture the draft in
 * memory, and enqueueForApproval is absent, so no scheduled_emails row, no decision stamp and no
 * approval row is ever created. Everything else - the brain rules, the shelves, the profile, the
 * memory, the model call, every screen - is the production path.
 *
 * Each person gets `emailsEach` consecutive emails, simulated every 3 days (today, +3, +6), each one
 * seeing the previous ones as history and as earlier emails, so the sample proves what the person
 * would actually receive over a week: different shelves, different items, different openings
 * (Ali, E4). Model calls are capped: at most 5 people x 3 emails.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import type { DraftRenderDeps, EarlierEmail } from './renderDecisionDraft';
import type { BrainPickRecord } from '../explorerBrainPick';
import type { PersistDraftInput } from './draftContracts';

export interface BrainSampleEmail {
  date: string;
  status: string;
  reason: string | null;
  issues: string[];
  subject: string | null;
  /** The exact bytes that would leave: wrapped in Maya's campaign signature and footer. */
  html: string | null;
  snapshot: Record<string, unknown> | null;
}

export interface BrainSamplePerson {
  recipient_masked: string;
  action: string | null;
  emails: BrainSampleEmail[];
}

export interface BrainSampleResult {
  generated_at: string;
  people: BrainSamplePerson[];
  note: string;
}

export const SAMPLE_MAX_PEOPLE = 5;
export const SAMPLE_MAX_EMAILS_EACH = 3;
const DAYS_BETWEEN = 3;

export function maskEmail(email: string | null | undefined): string {
  const e = String(email || '');
  const at = e.indexOf('@');
  return at > 0 ? `${e[0]}***${e.slice(at)}` : '***';
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export interface BrainSampleDeps {
  /** Candidate decisions (newest decision date first), one per lead. */
  candidates: (limit: number) => Promise<Array<{ id: string }>>;
  loadDecision: (id: string) => Promise<any | null>;
  baseDeps: () => DraftRenderDeps;
  wrap: (leadId: number, toEmail: string, body: string) => Promise<string>;
  today: () => string;
}

async function defaultDeps(): Promise<BrainSampleDeps> {
  const { loadDecisionById } = await import('./draftRepository');
  const { liveDeps } = await import('./runDraftRender');
  const { explorerEmailHtml } = await import('./explorerApproval');
  return {
    candidates: async (limit) => sequelize.query<{ id: string }>(
      `SELECT id FROM (
         SELECT DISTINCT ON (lead_id) id::text AS id, decision_date, created_at
           FROM explorer_journey_decisions
          WHERE selected_action IN ('SEND_EMAIL', 'RECOMMEND_LESSON') AND lead_id IS NOT NULL
          ORDER BY lead_id, decision_date DESC, created_at DESC
       ) d ORDER BY decision_date DESC, created_at DESC LIMIT :limit`,
      { type: QueryTypes.SELECT, replacements: { limit } },
    ),
    loadDecision: loadDecisionById,
    baseDeps: liveDeps,
    wrap: explorerEmailHtml,
    today: () => new Date().toISOString().slice(0, 10),
  };
}

export async function renderBrainSample(
  opts: { people?: number; emailsEach?: number } = {},
  depsIn?: BrainSampleDeps,
): Promise<BrainSampleResult> {
  const deps = depsIn ?? await defaultDeps();
  const people = Math.min(SAMPLE_MAX_PEOPLE, Math.max(1, Math.floor(opts.people ?? 3)));
  const each = Math.min(SAMPLE_MAX_EMAILS_EACH, Math.max(1, Math.floor(opts.emailsEach ?? 3)));
  const today = deps.today();
  const out: BrainSamplePerson[] = [];
  // More candidates than people: a person held by the Open House or the cadence is reported, then
  // passed over for the next, so the sample fills with people who would actually get an email.
  const candidates = await deps.candidates(people * 4);
  for (const c of candidates) {
    if (out.filter((p) => p.emails.some((e) => e.status === 'drafted' || e.status === 'rejected')).length >= people) break;
    const decision = await deps.loadDecision(c.id);
    if (!decision || !decision.lead_id) continue;

    // Per person, in memory: the picks and emails of the simulated earlier sends.
    const simulatedPicks: BrainPickRecord[] = [];
    const simulatedEmails: EarlierEmail[] = [];
    const base = deps.baseDeps();
    const emails: BrainSampleEmail[] = [];
    let toEmail: string | null = null;
    for (let i = 0; i < each; i++) {
      const date = addDays(today, i * DAYS_BETWEEN);
      let captured: PersistDraftInput | null = null;
      const capture = async (input: PersistDraftInput) => { captured = input; return `sample-${i}`; };
      const sampleDeps: DraftRenderDeps = {
        ...base,
        commitDraft: capture,
        recommitDraft: async (input) => ({ id: await capture(input), supersededId: null }),
        enqueueForApproval: undefined,
        countPriorDrafted: async (...a) => (await base.countPriorDrafted(...a)) + i,
        loadBrainHistory: async (leadId, exclude) => [...simulatedPicks, ...(await base.loadBrainHistory(leadId, exclude))],
        loadEarlierEmails: async (leadId, exclude) => [
          ...simulatedEmails,
          ...(base.loadEarlierEmails ? await base.loadEarlierEmails(leadId, exclude) : []),
        ],
      };
      const { renderDecisionDraft } = await import('./renderDecisionDraft');
      let outcome: any;
      try {
        outcome = await renderDecisionDraft({ ...decision, decision_date: date, scheduled_email_id: null }, sampleDeps);
      } catch (err: any) {
        outcome = { status: 'failed', reason: null, issues: [err?.name || 'Error'] };
      }
      const draft = captured as PersistDraftInput | null;
      if (draft) {
        toEmail = draft.to_email;
        const pick = draft.metadata?.brain_pick;
        if (pick?.piece) simulatedPicks.unshift({ piece: pick.piece, item_id: pick.item_id ?? null, decision_date: date });
        simulatedEmails.unshift({ subject: draft.subject, body: draft.body, date });
      }
      emails.push({
        date,
        status: String(outcome.status),
        reason: outcome.reason ?? null,
        issues: Array.isArray(outcome.issues) ? outcome.issues : [],
        subject: draft?.subject ?? null,
        html: draft ? await deps.wrap(Number(decision.lead_id), draft.to_email, draft.body).catch(() => draft.body) : null,
        snapshot: (draft?.metadata?.brain_snapshot as Record<string, unknown>) ?? null,
      });
      // A person the Open House or the cadence holds today is held for the whole simulation.
      if (!draft && outcome.status === 'skipped') break;
    }
    out.push({ recipient_masked: maskEmail(toEmail), action: decision.selected_action ?? null, emails });
  }
  return {
    generated_at: new Date().toISOString(),
    people: out,
    note: 'Rendered through the production path with every write switched off. Nothing was saved and nothing was sent.',
  };
}
