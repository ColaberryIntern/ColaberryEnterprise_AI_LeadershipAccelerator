/**
 * One real Architect run, through the real client, against advisor.colaberry.ai.
 *
 * Not a unit test — a live integration check to run by hand. The unit suite
 * stubs `fetch`, which proves the retry/stall/deadline logic but cannot prove
 * the contract. This proves the contract: that a brief assembled from the ten
 * sharpening answers produces a chapter-scaffolded document meeting FR-003's
 * word floor, and roughly how long that takes.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' \
 *     src/services/sbp/__tests__/architectLive.manual.ts
 *
 * Costs ~15 minutes of someone else's compute. Do not put it in CI.
 */
import { startJob, awaitDocument, jobNameFor, depthForSize, blueprintForSize } from '../architectClient';
import { buildBriefFromAnswers } from '../sharpeningQuestions';

const PROJECT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0001';
const SIZE = 'project';   // → professional depth, 6,000-word floor per FR-003

const IDEA =
  'A tool for a dental clinic that predicts which patients are likely to miss their appointment and '
  + 'automatically offers the slot to someone on the waitlist. Front desk staff see a daily risk list '
  + 'each morning.';

const ANSWERS: Record<string, string> = {
  q1_job: 'Tells the front desk which patients will miss tomorrow, in time to refill the slot.',
  q2_operator: 'Front desk staff at a 4-chair clinic. Not technical. They should never see a model score, just a name and a reason.',
  q3_trigger: 'A nightly job at 6pm over tomorrow\'s schedule, plus an 8am cutoff check for unconfirmed patients.',
  q4_systems: 'Reads the Dentrix appointment export. Sends SMS through Twilio. Writes nothing back into Dentrix.',
  q5_decision: 'Which patients are likely to no-show, from their visit history, how far out the booking was made, and whether they confirmed.',
  q6_never: 'No appointment is ever cancelled or released without a human at the front desk approving it.',
  q7_measure: 'No-show rate drops from 18% to under 12% within one quarter, and filled-from-waitlist goes above 50% of released slots.',
  q8_volume: 'About 40 appointments a day, 60 in January.',
  q9_not_building: 'Not touching billing or insurance. No patient-facing app. No multi-location support.',
  q10_evidence: 'For every released slot: who approved it, when, and which waitlist patients were offered it in what order.',
};

async function main() {
  const brief = buildBriefFromAnswers(IDEA, ANSWERS, 6);
  const jobName = jobNameFor('Clinic No-Show Predictor', PROJECT_ID);

  console.log(`brief assembled: ${brief.length} chars, ${brief.trim().split(/\s+/).length} words`);
  console.log(`job name: ${jobName}`);
  console.log(`depth: ${depthForSize(SIZE)} / blueprint: ${blueprintForSize(SIZE)}\n`);

  const t0 = Date.now();
  const { jobId } = await startJob({
    projectName: jobName,
    requirements: brief,
    depthMode: depthForSize(SIZE),
    blueprint: blueprintForSize(SIZE),
    correlationId: 'live-check',
  });
  console.log(`started: ${jobId}\n`);

  let lastPercent = -1;
  const doc = await awaitDocument(jobId, {
    correlationId: 'live-check',
    intervalMs: 20_000,
    onProgress: (s) => {
      const p = s.percent ?? -1;
      if (p !== lastPercent) {
        lastPercent = p;
        console.log(`  ${Math.round((Date.now() - t0) / 1000)}s  ${s.status}  ${p >= 0 ? p + '%' : ''} ${s.phase ?? ''}`);
      }
    },
  });

  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  const FLOOR = 6000;   // FR-003, `project` tier

  console.log(`\n=== RESULT (${mins} min) ===`);
  console.log(`  words         : ${doc.words}  (FR-003 floor for '${SIZE}' is ${FLOOR})`);
  console.log(`  chars         : ${doc.markdown.length}`);
  console.log(`  meets floor   : ${doc.words >= FLOOR ? 'YES' : 'NO'}`);
  console.log(`  quality warn  : ${doc.qualityWarning ? JSON.stringify(doc.qualityWarning) : 'none'}`);

  // FR-003 acceptance: the document must reference what the student actually said.
  const headings = (doc.markdown.match(/^#{1,3} .+$/gm) || []).length;
  console.log(`  headings      : ${headings} (evidence of chapter assembly)`);
  const mentions = (needle: string) => doc.markdown.toLowerCase().includes(needle.toLowerCase());
  for (const [label, needle] of [
    ['operator (front desk)', 'front desk'],
    ['data source (Dentrix)', 'dentrix'],
    ['data source (Twilio)', 'twilio'],
    ['guardrail (approval)', 'approv'],
    ['waitlist', 'waitlist'],
  ] as Array<[string, string]>) {
    console.log(`  cites ${label.padEnd(22)}: ${mentions(needle) ? 'yes' : 'NO'}`);
  }

  console.log(`\n--- first 600 chars ---\n${doc.markdown.slice(0, 600)}`);
}

main().catch((e) => { console.error(`FAILED [${e?.error_class ?? 'Error'}] ${e?.message}`); process.exit(1); });
