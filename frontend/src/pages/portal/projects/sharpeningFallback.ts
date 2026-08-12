/**
 * The ten sharpening questions, in their generic form.
 *
 * A deliberate duplicate of the backend spine in
 * `backend/src/services/sbp/sharpeningQuestions.ts`. The wizard normally renders
 * whatever `/api/portal/sbp/questions` returns — tailored to the student's idea
 * — but that call can fail, be flag-gated off, or be slow, and a student must
 * never see an empty form. Ids match the backend exactly; they are the keys the
 * answers are submitted under.
 *
 * Kept as data, not fetched at build time, precisely so the fallback has no
 * dependency that can also fail. If a slot is added or renamed on the backend,
 * add it here too — the backend is the source of truth for MEANING, this is only
 * the offline copy of the wording.
 */
import type { SharpeningQuestion } from '../../../services/sbpApi';

export const FALLBACK_QUESTIONS: SharpeningQuestion[] = [
  {
    id: 'q1_job', index: 0, label: 'The job', required: true,
    text: 'In one sentence, what does this system do, and for whom?',
    help: 'The single job it exists to do. Not the features — the outcome.',
    examples: ['It tells a dental front desk which patients will miss tomorrow, in time to refill the slot.'],
  },
  {
    id: 'q2_operator', index: 1, label: 'Who operates it', required: true,
    text: 'Who sits in front of this, and what should they NOT need to know?',
    help: 'Their role, how technical they are, and what device they are on.',
    examples: ['Front desk staff at a 4-chair clinic. They should never see a model score, just a name and a reason.'],
  },
  {
    id: 'q3_trigger', index: 2, label: 'What starts it', required: true,
    text: 'What kicks this off — a person, an event, or a clock? How often?',
    help: 'A schedule, an inbound webhook, a button someone presses, or a file landing.',
    examples: ['A nightly 6pm job over tomorrow\'s schedule, plus an 8am cutoff check.'],
  },
  {
    id: 'q4_systems', index: 3, label: 'Systems it touches', required: false,
    text: 'What must it read from or write to that already exists?',
    help: 'Name the real systems. If you do not know the integration method, say so.',
    examples: ['Reads the Dentrix appointment export. Sends SMS through Twilio.'],
  },
  {
    id: 'q5_decision', index: 4, label: 'The judgement call', required: true,
    text: 'What decision are you handing to the machine, and what does it decide from?',
    help: 'The one judgement that used to need a person. Name the inputs it gets to see.',
    examples: ['Which patients are likely to no-show, from their history, lead time, and weather.'],
  },
  {
    id: 'q6_never', index: 5, label: 'The guardrail', required: true,
    text: 'What must NEVER happen without a human saying yes first?',
    help: 'The thing that would be genuinely bad. This becomes a hard constraint, not a preference.',
    examples: ['No appointment is ever cancelled automatically.'],
  },
  {
    id: 'q7_measure', index: 6, label: 'How you will know', required: true,
    text: 'What number tells you this worked? What is it today?',
    help: 'Something you could actually measure in a month. A count, a rate, or minutes saved.',
    examples: ['No-show rate drops from 18% to under 12%.'],
  },
  {
    id: 'q8_volume', index: 7, label: 'How much', required: false,
    text: 'How many of these per day now, and at your worst week?',
    help: 'Rough is fine. Ten a day and ten thousand a day are different systems.',
    examples: ['About 40 appointments a day, 60 in January.'],
  },
  {
    id: 'q9_not_building', index: 8, label: 'Not in v1', required: false,
    text: 'What are you deliberately NOT building this time?',
    help: 'The tempting thing you are cutting. Naming it keeps it out of your releases.',
    examples: ['Not touching billing. Not building a patient-facing app.'],
  },
  {
    id: 'q10_evidence', index: 9, label: 'What must be provable', required: false,
    text: 'After the fact, what must you be able to show, and to whom?',
    help: 'An audit trail, a reason for a decision, or a record someone will ask you for.',
    examples: ['Every released slot, who approved it, and when.'],
  },
];
