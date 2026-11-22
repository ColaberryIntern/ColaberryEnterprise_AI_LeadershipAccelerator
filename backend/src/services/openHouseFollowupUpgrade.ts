/**
 * OH1w: make Ali's rebuilt "Open House Follow-up (Maya)" safe to run, keeping his words.
 *
 * His rebuild (2026-11-21, Admin > Campaigns) has two AI steps: a thank-you for attendees and a
 * catch-up for people who missed it. As written, the sequence engine would send BOTH to
 * everyone, the instructions carry "[insert link]" placeholders the AI has nothing to fill
 * with, and the missed email promises a recording that does not exist yet and says "we missed
 * you" to people who may have joined on Zoom directly. This function, deterministically:
 *   - tags each step with its audience (a step about missing it -> 'missed', else 'attended')
 *   - rewrites only the phrases that cannot be true, and every placeholder, to "the exact link
 *     in the notes" (openHouseFollowup.followupAiNotes gives each person their real links)
 *   - sets Maya's persona (Director of Admissions, as in the countdown) and appends the hard rules
 * Idempotent: running it on its own output changes nothing.
 */
import type { SequenceStep } from '../models/FollowUpSequence';

const PHRASES: Array<[RegExp, string]> = [
  [/expressing that we missed them at the Open House/gi, 'saying we did not see them check in at the Open House, and thanking them if they joined on Zoom'],
  [/Include a brief overview of what was covered during the Open House to spark their interest\.?/gi,
    'Briefly say the Open House walked through the Forward Deployed AI Engineer Accelerator: how it works, what people build in it, and live questions and answers.'],
  [/Mention that a recording of the event is available for them to catch up on what they missed, and provide a direct link to the recording\.?/gi,
    'If the notes include a recording link, mention it and give that exact link; if they do not, do not mention a recording.'],
  [/Conclude with a friendly call-to-action: 'You can watch the recording here: \[insert link\] and we hope to see you at our next event!'/gi,
    'Conclude with a friendly invitation to the next Open House, using the exact link in the notes.'],
  [/Include a clear call-to-action by saying, 'Please visit your Today page here: \[insert link\] to see what.s next for you!'/gi,
    'Include a clear invitation to visit their Today page, using the exact link in the notes.'],
  [/, which signifies their interest in our offerings/gi, ''],
  [/\[insert link\]/gi, 'the exact link in the notes'],
];

export const PERSONA_FROM = /You are Maya, an AI assistant working on behalf of the Open House Follow-up team at our company\./;
export const PERSONA_TO = 'You are Maya, Director of Admissions at Colaberry.';
export const HARD_RULES_MARK = 'HARD RULES (these never bend)';
export const HARD_RULES = `${HARD_RULES_MARK}
- Links: use ONLY the links listed for this person in the message notes, exactly as written. No other links of any kind. Never write a placeholder such as [insert link].
- Never mention price, cost, tuition, payment, a discount, an offer, a deal, an early bird, a scholarship, seats, deadlines to buy, or anything being at no charge. Never use the word spelled f-r-e-e in any form, not even "feel f-r-e-e to" (say "you're welcome to" or "just reply").
- Attendance comes from platform check-ins. Never tell someone they were absent or that we missed them; someone who did not check in may have joined on Zoom.
- Never mention a recording unless the notes give its link.
- Never ask them to book a call and never mention a cohort start date. Never invent facts about the program, jobs or salaries.
- Plain American English, no emojis, no exclamation-mark pile-ups. Do not add a sign-off; Maya's signature is added automatically.`;

/** The audience a step is for: about missing the event -> 'missed', otherwise 'attended'. */
export function audienceOf(step: Pick<SequenceStep, 'subject' | 'step_goal' | 'audience'>): 'attended' | 'missed' {
  if (step.audience === 'attended' || step.audience === 'missed') return step.audience;
  return /missed|did not check in|catch up/i.test(`${step.subject || ''} ${step.step_goal || ''}`) ? 'missed' : 'attended';
}

export function upgradeInstructions(text: string): string {
  let out = text || '';
  for (const [re, to] of PHRASES) out = out.replace(re, to);
  return out;
}

export interface UpgradeResult { steps: SequenceStep[]; prompt: string; changes: string[] }

export function upgradeFollowupRebuild(steps: SequenceStep[], prompt: string | null | undefined): UpgradeResult {
  const changes: string[] = [];
  const next = (steps || []).map((s, i) => {
    const audience = audienceOf(s);
    const ai = upgradeInstructions(s.ai_instructions || '');
    if (s.audience !== audience) changes.push(`step ${i + 1} ("${s.subject}") tagged ${audience}`);
    if (ai !== (s.ai_instructions || '')) changes.push(`step ${i + 1}: placeholders and untrue phrases rewritten`);
    return { ...s, audience, ai_instructions: ai };
  });
  let p = prompt || '';
  if (PERSONA_FROM.test(p)) { p = p.replace(PERSONA_FROM, PERSONA_TO); changes.push('persona: Director of Admissions at Colaberry'); }
  if (!p.includes(HARD_RULES_MARK)) { p = `${p.trimEnd()}\n\n${HARD_RULES}`; changes.push('hard rules appended'); }
  return { steps: next, prompt: p, changes };
}
