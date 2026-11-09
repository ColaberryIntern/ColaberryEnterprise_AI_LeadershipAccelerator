/**
 * M31 - the questions Maya must NOT answer from the model.
 *
 * The ticket: "Generating a cohort date, price, deadline or seat count. Those come from authoritative state or she hands
 * off. AI is never authoritative for any of them." mayaReadContract.NEVER_AUTHORITATIVE_FOR lists the same five.
 *
 *   price        authoritative already: the pricing rule of record (admissionsPricing.ts -> membershipPrice.ts, kept in
 *                agreement by scripts/checkPriceAgreement.js). Answered by the normal reply; NOT classified here.
 *   cohort_date  answered from the batch of record (cohorts.start_date of this month's batch) or handed off.
 *   seat_count   no authoritative source: Explorer and self-paced batches have no seat cap a learner can be told
 *                (batchPlacementService "SEATS"), so always a handoff.
 *   deadline     no authoritative source for an enrollment deadline under monthly batches: always a handoff.
 *   consent      data, privacy, opt-out and deletion are a person's decision to record: always a handoff.
 *
 * Pure and deterministic. When a message matches, the reply is built WITHOUT calling the model, so no wording of the
 * question can talk the model into a number. Order matters: a message that asks two things is routed to the most
 * sensitive one (consent, then deadline, then seats, then dates).
 */

export type NonAuthoritativeTopic = 'consent' | 'deadline' | 'seat_count' | 'cohort_date';

const PATTERNS: ReadonlyArray<[NonAuthoritativeTopic, RegExp[]]> = [
  ['consent', [
    /\bconsent\b/i,
    /\bprivacy\b/i,
    /\bopt[\s-]?out\b/i,
    /\bunsubscribe\b/i,
    /\bstop (contacting|messaging|emailing|texting|calling)\b/i,
    /\b(delete|remove|erase)\b[^.?!]{0,40}\b(my|the)\b[^.?!]{0,20}\b(data|account|information|info|details)\b/i,
    /\bwhat (data|information) do you (have|hold|keep|store)\b/i,
  ]],
  ['deadline', [
    /\bdeadlines?\b/i,
    /\blast (day|date|chance) to\b/i,
    /\bdue date\b/i,
    /\b(registration|enrollment|enrolment|application|sign[\s-]?up)s? (close|closes|closing|end|ends|cutoff|cut[\s-]off)\b/i,
    /\bby when (do|must|should|can) i\b/i,
    /\bhow long do i have to (enroll|enrol|sign up|register|apply|pay|join)\b/i,
  ]],
  ['seat_count', [
    /\b(how many|any|are there)\b[^.?!]{0,20}\b(seats?|spots?|places?|openings?|slots?)\b/i,
    /\b(seats?|spots?|places?|openings?|slots?)\b[^.?!]{0,15}\b(left|available|remaining|open)\b/i,
    /\b(class|cohort|batch) (size|is full|full)\b/i,
    /\bsold out\b/i,
  ]],
  ['cohort_date', [
    /\bstart date\b/i,
    /\bnext (cohort|batch|class|intake|session)\b/i,
    /\b(when|what date|what day)\b[^.?!]{0,40}\b(start|starts|starting|begin|begins|beginning|kick[\s-]?off|orientation)\b/i,
    /\borientation\b[^.?!]{0,20}\b(when|date|day)\b/i,
  ]],
];

export function classifyNonAuthoritativeTopic(text: string | null | undefined): NonAuthoritativeTopic | null {
  const t = String(text ?? '').slice(0, 2000);
  if (!t.trim()) return null;
  for (const [topic, res] of PATTERNS) {
    if (res.some((re) => re.test(t))) return topic;
  }
  return null;
}
