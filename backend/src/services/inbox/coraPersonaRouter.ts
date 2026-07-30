/**
 * Persona routing for Cora Inbox replies (BC #10109319420).
 *
 * Two named personas share the support@colaberry.com inbox:
 *   - Cora replies to general/support questions (schedule, platform, billing,
 *     certification, admin) — the catch-all "everything else" persona.
 *   - Cory replies to admissions questions (program basics, pricing &
 *     enrollment, Open House).
 *
 * Cory was deliberately assigned admissions rather than support: "Cory"
 * already means "the admissions assistant" in the existing sales-hub chat
 * tool (salesHubCoryController.ts). Splitting it the other way would make the
 * same name mean opposite things in two customer-facing surfaces.
 *
 * Routing is content-based: it matches the inbound email's text against the
 * `keywords` field of active cora_kb_entries rows and maps the winning
 * entries' main_category to a persona. No match -> Cora (support is the safe
 * default for anything not clearly admissions).
 */
import { listEntries, getActiveCohort, resolveMergeTags } from '../kbService';

export type CoraPersona = 'cora' | 'cory';

export interface PersonaProfile {
  key: CoraPersona;
  /** Used in the outgoing From header. */
  displayName: string;
  /** Name the reply body must sign off as — keeps From header and sign-off consistent (the exact mismatch that triggered BC #10109319420). */
  signOff: string;
  /** First line of the persona's system prompt. */
  voiceIntro: string;
  /** Plain-English scope description, used in the out-of-scope handoff instruction. */
  scopeDescription: string;
}

export const PERSONA_PROFILES: Record<CoraPersona, PersonaProfile> = {
  cora: {
    key: 'cora',
    displayName: 'Cora (Colaberry Enterprise AI)',
    signOff: 'Cora',
    voiceIntro:
      'You are Cora, the AI Support Assistant for Colaberry School of Data Analytics. ' +
      'You help enrolled students and program participants with scheduling, platform access, ' +
      'billing, certification, and general program logistics.',
    scopeDescription: 'support/logistics',
  },
  cory: {
    key: 'cory',
    displayName: 'Cory (Colaberry Enterprise AI)',
    signOff: 'Cory',
    voiceIntro:
      'You are Cory, the AI Admissions Assistant for Colaberry School of Data Analytics. ' +
      'You help prospective students with program overview, pricing, enrollment, and Open House questions.',
    scopeDescription: 'admissions/enrollment',
  },
};

/** KB main_category values that route to Cory (admissions). Everything else routes to Cora (support). */
const ADMISSIONS_CATEGORIES = new Set(['Program Basics', 'Pricing & Enrollment']);

export function categoryToPersona(mainCategory: string): CoraPersona {
  return ADMISSIONS_CATEGORIES.has(mainCategory) ? 'cory' : 'cora';
}

/**
 * Pick a persona from the main_category values of matched KB entries
 * (majority vote). Pure + deterministic so routing is unit-testable without
 * a DB round trip. Empty input -> Cora, the support/general-queries default.
 */
export function selectPersonaFromCategories(matchedCategories: string[]): CoraPersona {
  if (matchedCategories.length === 0) return 'cora';
  let admissionsVotes = 0;
  let supportVotes = 0;
  for (const category of matchedCategories) {
    if (categoryToPersona(category) === 'cory') admissionsVotes++;
    else supportVotes++;
  }
  return admissionsVotes > supportVotes ? 'cory' : 'cora';
}

/**
 * Determine which persona should answer an inbound email by matching its
 * text against active KB entries' keyword phrases for this course.
 */
export async function selectPersonaForEmail(courseId: string, emailText: string): Promise<CoraPersona> {
  const haystack = emailText.toLowerCase();
  const entries = await listEntries({ courseId, activeOnly: true });

  const matchedCategories = entries
    .filter((entry) => {
      const phrases = (entry.keywords ?? '')
        .split(',')
        .map((phrase) => phrase.trim().toLowerCase())
        .filter((phrase) => phrase.length > 2);
      return phrases.some((phrase) => haystack.includes(phrase));
    })
    .map((entry) => entry.main_category);

  return selectPersonaFromCategories(matchedCategories);
}

/**
 * Build a persona-scoped system prompt: only KB entries whose main_category
 * maps to this persona are included, so Cora never improvises on pricing and
 * Cory never improvises on billing/platform support — each stays in its lane
 * and hands off (needs_human) anything outside it.
 */
export async function buildPersonaSystemPromptFromDB(courseId: string, persona: CoraPersona): Promise<string> {
  const active = await getActiveCohort(courseId);
  const entries = (await listEntries({ courseId, activeOnly: true })).filter(
    (entry) => categoryToPersona(entry.main_category) === persona
  );

  const resolvedQA = entries.map((entry) => {
    const answer = active
      ? resolveMergeTags(entry.answer_template, active.cohort, active.course)
      : entry.answer_template;
    return `Q: ${entry.question_pattern}\nA: ${answer}`;
  });

  const cohortContext = active
    ? `Current cohort: ${active.cohort.name} (starts ${active.cohort.start_date ?? 'TBD'}, $${active.cohort.price_annual ?? 'TBD'}/mo annual or $${active.cohort.price_monthly ?? 'TBD'}/mo monthly).`
    : 'No active cohort — use placeholder responses.';

  const profile = PERSONA_PROFILES[persona];

  return [
    profile.voiceIntro,
    'Respond to incoming emails with the tone: friendly, empathetic, confident, and professional.',
    cohortContext,
    '',
    'Use the following Q&A knowledge base to answer questions accurately:',
    resolvedQA.join('\n\n') || '(no knowledge base entries configured for this persona yet)',
    '',
    `If a question is outside your scope (${profile.scopeDescription}) or not answered by the knowledge base, ` +
      'acknowledge receipt and set needs_human=true rather than guessing.',
    `Sign every reply as "${profile.signOff}" only — never sign as any other name.`,
  ].join('\n');
}
