import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { PersonProfile } from './personProfileService';
import { CcppHistory } from './panels/historyPanels';

/**
 * A brief written from everything the 360 knows about one person.
 *
 * Ali, 2026-09-10: "Strategy prep should have a button we can press if we want
 * to strategize based on all the information we have on them. Be clear about
 * what you would sell them, how would approach them, what proof do you have...
 * If they are in a class, then we aren't trying to sell them something, so
 * maybe the message would be more about how they are doing and what their next
 * steps should be."
 *
 * ── THE MODE IS CHOSEN BY THE STAGE, NOT BY THE READER ──────────────────────
 *
 * A rep opening an enrolled student should not be handed a pitch, and a coach
 * opening a cold lead should not be handed a study plan. The page already knows
 * the lifecycle stage, so the brief cannot be pointed at the wrong one:
 *
 *   lead / applicant        SALES     what to sell, the opening, the objections
 *   enrolled / active       COACHING  how they are doing, where they are stuck
 *   lapsed                  WIN-BACK  why they stopped, what would bring them back
 *
 * ── GAPS ARE STATED INLINE ──────────────────────────────────────────────────
 *
 * Ali chose this over a footnote or a confidence score, and it is the right
 * call for the same reason the rest of the 360 works this way: a rep reading
 * "open the call on their DISC profile" needs to know in that sentence that no
 * DISC exists, not three paragraphs later. The prompt forbids inventing a fact
 * and requires naming the absence where it bites.
 */

export type BriefMode = 'sales' | 'coaching' | 'winback';

export interface StrategyBrief {
  mode: BriefMode;
  /** Why this mode, so a reader can disagree with the framing. */
  modeReason: string;
  markdown: string;
  /** What the brief was built from, named so its basis can be checked. */
  basis: string[];
  /** What could not be established. Also stated inline in the markdown. */
  gaps: string[];
  generatedAt: string;
}

const MODEL = 'gpt-4o';
const TIMEOUT_MS = 45000;

export function modeForStage(stage: string): { mode: BriefMode; reason: string } {
  if (stage === 'lapsed') {
    return { mode: 'winback', reason: 'They were a customer and are not now, so the question is what would bring them back.' };
  }
  if (stage === 'enrolled_student' || stage === 'active_learner' || stage === 'graduate' || stage === 'returning_customer') {
    return { mode: 'coaching', reason: 'They are already enrolled, so there is nothing to sell — the question is how they are doing and what comes next.' };
  }
  return { mode: 'sales', reason: 'They have not enrolled, so the question is what to offer and how to open the conversation.' };
}

const INSTRUCTION: Record<BriefMode, string> = {
  sales: `Write a SALES brief for a rep about to contact this person. Cover, with headings:
- **What to sell them** — the specific offer, and why it fits THIS person's situation
- **How to open** — the first line, grounded in something real they did
- **Proof to use** — evidence from their own history or comparable outcomes
- **Objections to expect** — what their behaviour suggests they will push back on
- **What NOT to do** — any approach their record argues against`,
  coaching: `Write a COACHING brief for whoever is supporting this learner. There is nothing to sell. Cover, with headings:
- **How they are actually doing** — read the evidence, not the enrolment
- **Where they appear stuck** — the specific gap, if any
- **Next steps for them** — concrete, in their context
- **What to say in the next conversation** — the opening, grounded in their work
- **Risk of losing them** — what the record suggests about whether they are drifting`,
  winback: `Write a WIN-BACK brief. This person was a customer and is not now. Cover, with headings:
- **Why they most likely stopped** — from the evidence, not speculation
- **What would bring them back** — the specific offer or change
- **How to reopen** — the first line, acknowledging the history honestly
- **What to avoid** — anything that would read as ignoring what happened
- **Whether to approach at all** — say so plainly if the record argues against it`,
};

/** Everything the model is allowed to reason from, and nothing else. */
function buildEvidence(profile: PersonProfile, history: CcppHistory | null): { text: string; basis: string[]; gaps: string[] } {
  const basis: string[] = [];
  const gaps: string[] = [];
  const lines: string[] = [];

  lines.push(`PERSON: ${profile.name ?? '(no name recorded)'} <${profile.email}>`);
  lines.push(`LIFECYCLE STAGE: ${profile.stage}`);
  if (profile.company) lines.push(`COMPANY: ${profile.company}`);
  if (profile.title) lines.push(`TITLE: ${profile.title}`);

  const a = profile.acquisition;
  if (a) {
    basis.push('Acquisition record');
    lines.push(`\nACQUISITION: source=${a.source ?? '?'} form=${a.formType ?? '?'} stage=${a.pipelineStage ?? '?'}`);
    if (a.interestArea) lines.push(`INTEREST: ${a.interestArea}`);
    if (a.message) lines.push(`THEIR OWN WORDS: ${a.message}`);
    if (a.notes) lines.push(`REP NOTES: ${a.notes}`);
    if (a.leadScore === null) gaps.push('Intent score is suppressed after conversion, so do not infer buying temperature.');
  } else {
    gaps.push('No lead record — nothing is known about how they found us.');
  }

  const j = profile.journey;
  if (j) {
    basis.push('Journey counts');
    lines.push(`\nENGAGEMENT: ${j.sessions} sessions, ${j.pageEvents} page events, ${j.emailsSent} emails sent, ${j.campaigns} campaigns, known ${j.daysKnown ?? '?'} days`);
  }

  if (profile.curriculum) {
    basis.push('Curriculum progress');
    const c = profile.curriculum;
    lines.push(`\nCURRICULUM: ${c.completed} of ${c.total} cards completed (${c.completionRate ?? '?'}%), ${c.weeksTouched} weeks touched, ${c.reflections} reflections`);
    if (c.lastCompleted) lines.push(`LAST COMPLETED: ${c.lastCompleted.title} (${c.lastCompleted.at})`);
    if (c.averageQuizScore === null) gaps.push('No quiz scores recorded, so competence cannot be judged from assessment.');
  }

  const cls = profile.classActivity;
  if (cls) {
    if (cls.attendanceRate === null) {
      gaps.push('No attendance register was taken — absence of attendance is NOT evidence they did not attend.');
    } else {
      basis.push('Class attendance');
      lines.push(`ATTENDANCE: ${cls.attendanceRate}% over ${cls.attendanceTotal} sessions`);
    }
  }

  if (profile.work && profile.work.projects.length) {
    basis.push('Project work');
    lines.push(`\nPROJECTS: ${profile.work.projects.map((p) => `${p.name}${p.organizationName ? ` for ${p.organizationName}` : ''}`).join('; ')}`);
    if (profile.work.clientOrganisations.length) lines.push(`BUILDING FOR: ${profile.work.clientOrganisations.join(', ')}`);
  }

  const b = profile.billingDetail;
  if (b) {
    basis.push('Subscription state');
    lines.push(`\nBILLING: ${b.activeCount} active, ${b.failedCount} failed, ${b.canceledCount} cancelled subscriptions`);
    if (b.failuresSinceLastSuccess >= 2) lines.push(`AT RISK: ${b.failuresSinceLastSuccess} consecutive failed payments since the last success`);
    gaps.push('Individual charges live in PaySimple and are not joined, so amounts collected are unknown.');
  }

  if (profile.communications) {
    basis.push('Communication history');
    const c = profile.communications;
    lines.push(`\nCOMMUNICATIONS: ${c.totalMessages} messages across ${c.totalCampaigns} campaigns, ${c.inboundCount} replies from them, ${c.totalOutcomes} opens/clicks`);
    if (c.inboundCount === 0 && c.totalMessages > 0) {
      lines.push('NOTE: they have never replied to anything we sent.');
    }
  }

  if (history?.available && history.enrolments.length) {
    basis.push('CCPP history (pre-platform)');
    lines.push(`\nPRIOR CUSTOMER HISTORY (CCPP):`);
    history.enrolments.forEach((e) => {
      lines.push(`  - ${e.className ?? e.courseName} (${e.classStartDate?.slice(0, 10) ?? '?'}) fee=${e.fee ?? '?'}`
        + `${e.hired ? ' HIRED' : ''}${e.certified ? ' CERTIFIED' : ''}${e.cancelled ? ' CANCELLED' : ''}`);
    });
    if (history.payments) {
      lines.push(`  PAID: PaySimple ${history.payments.paysimpleAmount ?? '?'} over ${history.payments.paysimpleCount ?? '?'} payments; PayPal ${history.payments.paypalAmount ?? '?'}`);
    } else {
      gaps.push('No payment summary in CCPP for them, so what they actually paid historically is unknown.');
    }
    if (history.disc) {
      basis.push('DISC profile');
      const d = history.disc;
      lines.push(`  DISC: dominant=${d.dominantTrait ?? '?'} D=${d.dominance ?? '?'} I=${d.influencer ?? '?'} S=${d.steadiness ?? '?'} C=${d.compliance ?? '?'}`);
      lines.push(`  STYLE: leadership=${d.leadership ?? '?'} negotiation=${d.negotiation ?? '?'} flexibility=${d.flexibility ?? '?'} goal-orientation=${d.goalOrientation ?? '?'}`);
    } else {
      gaps.push('No DISC profile on file, so do not characterise their personality or working style.');
    }
  } else if (history && !history.available) {
    gaps.push(history.unavailableReason ?? 'Historical CCPP data could not be read.');
  } else {
    gaps.push('No pre-platform history in CCPP — they are not a returning customer, or were never in the old system.');
  }

  for (const g of profile.trust?.gaps ?? []) gaps.push(`${g.field}: ${g.reason}`);

  return { text: lines.join('\n'), basis, gaps };
}

export async function generateStrategyBrief(
  profile: PersonProfile,
  history: CcppHistory | null,
): Promise<StrategyBrief> {
  const { mode, reason } = modeForStage(profile.stage);
  const { text, basis, gaps } = buildEvidence(profile, history);

  const system = `You brief Colaberry staff before they contact someone. You are given ONLY verified
records from their 360 profile.

RULES:
- Never invent a fact. If the evidence does not support a claim, do not make it.
- Where a gap bites, say so IN THE SENTENCE where it matters — e.g. "open on their
  goal (no DISC on file, so do not assume a style)". Do not append a disclaimer block.
- Be specific to THIS person. A brief that would read the same for anyone is useless.
- Be concise. Short paragraphs and bullets. No preamble, no restating the data back.
- British English. No em-dashes.`;

  const user = `${INSTRUCTION[mode]}

KNOWN GAPS you must respect and name where relevant:
${gaps.length ? gaps.map((g) => `- ${g}`).join('\n') : '- None recorded.'}

EVIDENCE:
${text}`;

  const client = getInstrumentedOpenAI(
    { workflow_id: 'person_360_strategy_brief', prompt_version: 'strategy-brief-v1' },
    { timeout: TIMEOUT_MS, maxRetries: 1 },
  );

  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.4,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });

  return {
    mode,
    modeReason: reason,
    markdown: res.choices[0]?.message?.content?.trim() || 'The model returned nothing.',
    basis,
    gaps,
    generatedAt: new Date().toISOString(),
  };
}
