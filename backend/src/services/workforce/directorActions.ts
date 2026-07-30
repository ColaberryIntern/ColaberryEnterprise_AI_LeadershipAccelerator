/**
 * directorActions — the AI Workforce directors' one tool + one action each.
 * 7 directors share one generic domain-flag (their domain already has a
 * deterministic recommendation from ops/directors.ts — this just turns
 * today's top one into a WorkforceTask). Technology and Research each read
 * one thing no existing domain covers. Marketing is the one outward-facing,
 * suggest_only, human-approval-required director; the other 9 write directly
 * to an internal queue (write_with_audit) that still requires a human to act
 * on the resulting task. See docs/trust-audit/ for the audit this responds to.
 */
import { Op } from 'sequelize';
import WorkforceTask from '../../models/WorkforceTask';
import WorkforceMessage from '../../models/WorkforceMessage';
import AiAgent from '../../models/AiAgent';
import { gatherSignals } from '../ops/schoolSignals';
import { runDirectors, rankRecommendations } from '../ops/directors';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL } from '../components/costEstimationService';
import { runDirectorWrite, runDirectorProposal, DirectorRunResult } from './workforceAgentRuntime';

const OPEN_TASK_STATUSES = ['assigned', 'planning', 'working', 'needs_approval'];

async function openTaskIdForRecKey(recKey: string): Promise<string | null> {
  const existing = await WorkforceTask.findOne({ where: { source_rec_key: recKey, status: { [Op.in]: OPEN_TASK_STATUSES } } });
  return existing ? existing.id : null;
}

/** ISO week key (UTC), e.g. "2026-W31" — used to dedupe the weekly research digest. */
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Shared by the 7 directors whose domain already has a deterministic
 *  recommendation engine (ops/directors.ts) — flags today's top one as one WorkforceTask. */
async function runDomainFlag(slug: string, agentName: string, domain: string): Promise<DirectorRunResult> {
  const signals = await gatherSignals();
  const dirs = runDirectors(signals);
  const rec = dirs.find((d) => d.domain === domain)?.recommendations[0];
  if (!rec) return { ran: false, wrote: false, reason: 'no_signal_today', costUsd: 0 };

  return runDirectorWrite({
    slug,
    agentName,
    operation: `flag_${domain}`,
    targetTable: 'workforce_tasks',
    alreadyExists: () => openTaskIdForRecKey(rec.key),
    create: async () => {
      const task = await WorkforceTask.create({
        employee_slug: slug,
        title: rec.title,
        description: `${rec.why} (${rec.evidence.join('; ')})`,
        status: 'assigned',
        priority: rec.severity,
        approver: 'chief_of_staff',
        source_rec_key: rec.key,
      });
      return { id: task.id };
    },
  });
}

export const runStudentSuccessDirector = () => runDomainFlag('student_success', 'WorkforceStudentSuccessDirector', 'student_success');
export const runCurriculumDirector = () => runDomainFlag('curriculum', 'WorkforceCurriculumDirector', 'curriculum');
export const runCareerDirector = () => runDomainFlag('career', 'WorkforceCareerDirector', 'career');
export const runCertificationDirector = () => runDomainFlag('certification', 'WorkforceCertificationDirector', 'certification');
export const runFinanceDirector = () => runDomainFlag('finance', 'WorkforceFinanceDirector', 'finance');
export const runOperationsDirector = () => runDomainFlag('operations', 'WorkforceOperationsDirector', 'operations');
export const runCommunityDirector = () => runDomainFlag('community', 'WorkforceCommunityDirector', 'community');

/** Alex Kim (Technology) — the one director who watches the other agents:
 *  flags the worst unhealthy entry in the AI agent registry as one WorkforceTask. */
export async function runTechnologyDirector(): Promise<DirectorRunResult> {
  const slug = 'technology';
  const agentName = 'WorkforceTechnologyDirector';

  const unhealthy = await AiAgent.findAll({
    where: { enabled: true, [Op.or]: [{ status: 'error' }, { error_count: { [Op.gte]: 5 } }] },
    order: [['error_count', 'DESC']],
    limit: 1,
  });
  const worst = unhealthy[0];
  if (!worst) return { ran: false, wrote: false, reason: 'no_signal_today', costUsd: 0 };

  const recKey = `agent_health.${worst.agent_name}`;
  return runDirectorWrite({
    slug,
    agentName,
    operation: 'flag_agent_health_issue',
    targetTable: 'workforce_tasks',
    alreadyExists: () => openTaskIdForRecKey(recKey),
    create: async () => {
      const task = await WorkforceTask.create({
        employee_slug: slug,
        title: `Investigate ${worst.agent_name} (${worst.error_count || 0} errors, status "${worst.status}")`,
        description: worst.last_error || 'Elevated error count with no captured error message.',
        status: 'assigned',
        priority: worst.status === 'error' ? 'high' : 'medium',
        approver: 'chief_of_staff',
        source_rec_key: recKey,
      });
      return { id: task.id };
    },
  });
}

/** Dr. Kenji Watanabe (Research) — synthesizes this week's top 3 ranked
 *  recommendations across every domain into one cross-department message. */
export async function runResearchDirector(): Promise<DirectorRunResult> {
  const slug = 'research';
  const agentName = 'WorkforceResearchDirector';

  const signals = await gatherSignals();
  const top3 = rankRecommendations(runDirectors(signals)).slice(0, 3);
  if (top3.length === 0) return { ran: false, wrote: false, reason: 'no_signal_today', costUsd: 0 };

  const subject = `Weekly signal digest — ${isoWeekKey(new Date())}`;
  return runDirectorWrite({
    slug,
    agentName,
    operation: 'surface_insight',
    targetTable: 'workforce_messages',
    alreadyExists: async () => {
      const existing = await WorkforceMessage.findOne({ where: { from_slug: slug, subject } });
      return existing ? existing.id : null;
    },
    create: async () => {
      const body = top3.map((r, i) => `${i + 1}. [${r.domain}] ${r.title} — ${r.why}`).join('\n');
      const msg = await WorkforceMessage.create({
        from_slug: slug,
        to_slug: 'curriculum',
        subject,
        body: `This week's top signals across the school:\n\n${body}`,
      });
      return { id: msg.id };
    },
  });
}

/** Sofia Lindqvist (Marketing) — manual-trigger only. Drafts ONE content idea
 *  grounded in today's #1 ranked school signal and queues it for human review;
 *  never posts or sends anything itself (audit P0-4: no unreviewed outward content). */
export async function runMarketingDirector(): Promise<DirectorRunResult> {
  const slug = 'marketing';
  const agentName = 'WorkforceMarketingDirector';

  const signals = await gatherSignals();
  const top = rankRecommendations(runDirectors(signals))[0];
  if (!top) return { ran: false, wrote: false, reason: 'no_signal_today', costUsd: 0 };

  return runDirectorProposal({
    slug,
    agentName,
    build: async (agentId) => {
      const client = getInstrumentedOpenAI({ agent_id: agentId, workflow_id: 'workforce_marketing' });
      const res = await client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0.7,
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content:
              'You are the Marketing Director for an AI Systems Architect training program. Given one internal school signal, propose ONE short content idea (a headline + 2-sentence angle) that tells the school\'s real story. Plain text, no markdown.',
          },
          { role: 'user', content: `Signal: [${top.domain}] ${top.title} — ${top.why}` },
        ],
      });
      const idea = res.choices?.[0]?.message?.content?.trim() || '';
      return {
        actionType: 'propose_content_idea',
        targetTable: 'proposed_agent_actions',
        targetId: top.key,
        proposedChanges: { content_idea: idea, source_signal: top.key },
        beforeState: {},
        reason: `Grounded in today's #1 ranked signal: ${top.title}`,
        confidence: 0.6,
      };
    },
  });
}

// A real Map, not a plain object — RUNNERS[slug] on an object literal resolves
// prototype-chain keys like "constructor"/"toString" to a truthy non-function,
// bypassing the "unknown slug" guard below. Map has no such inherited keys.
const RUNNERS: Map<string, () => Promise<DirectorRunResult>> = new Map([
  ['student_success', runStudentSuccessDirector],
  ['curriculum', runCurriculumDirector],
  ['career', runCareerDirector],
  ['certification', runCertificationDirector],
  ['finance', runFinanceDirector],
  ['operations', runOperationsDirector],
  ['community', runCommunityDirector],
  ['technology', runTechnologyDirector],
  ['research', runResearchDirector],
  ['marketing', runMarketingDirector],
]);

/** Manually invoke one director's one action (used by the admin dashboard's "run now" button
 *  and by Sofia's on_demand trigger, which has no cron entry). Unknown slug -> null, not a throw. */
export async function runDirectorBySlug(slug: string): Promise<DirectorRunResult | null> {
  const runner = RUNNERS.get(slug);
  if (!runner) return null;
  return runner();
}
