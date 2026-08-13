/**
 * Re-run the ORIGINAL Sponsor Dashboard brief through the FIXED pipeline and
 * compare against what the pilot actually produced.
 *
 * The pilot's committed plan (project 248d9d63, still live on Ali's account):
 *   - 8 of 12 stories crammed into r0
 *   - 3 stories that are layers, not vertical slices
 *   - requirement kinds with no CONSTRAINT concept, so "connect to Postgres"
 *     and "use Mandrill" were FUNC/must and forced layer stories into existence
 *
 * This answers one question with real input rather than a fixture: did the fix
 * work? It prints the comparison and exits non-zero only on a hard failure —
 * a gate rejection is a RESULT, not an error, and is reported as such.
 *
 * Usage (from backend/):
 *   OPENAI_API_KEY=… npx ts-node src/scripts/sbpCompareToPilot.ts <brief.txt> <document.md>
 */
import { readFileSync } from 'fs';
import { decomposeBuild } from '../services/sbp/decomposeService';
import { gatePlan } from '../services/sbp/planGate';
import { isConstraint } from '../services/sbp/planContract';

const [, , BRIEF_PATH, DOC_PATH] = process.argv;
if (!BRIEF_PATH || !DOC_PATH) {
  console.error('usage: sbpCompareToPilot.ts <brief.txt> <document.md>');
  process.exit(2);
}

/** What the pilot actually committed, for side-by-side. */
const PILOT = {
  distribution: { r0: 8, r1: 1, r2: 1, r3: 1, r4: 1 },
  layerStories: ['Connect to PaySimple, Postgres, Mandrill, and magic-link auth',
    'Ensure data privacy and security compliance',
    'Zero-manual-step process from form to provisioned employees'],
  constraintKinds: 0,
};

(async () => {
  const brief = readFileSync(BRIEF_PATH, 'utf8');
  const document = readFileSync(DOC_PATH, 'utf8');
  console.log(`\nBrief: ${brief.length} chars · Document: ${document.length} chars\n`);
  console.log('Generating with the fixed decomposer (brief outranks the document)…\n');

  const { plan, attempts, model } = await decomposeBuild({
    brief, document, correlationId: 'compare-to-pilot',
  });
  console.log(`Model ${model}, ${attempts} attempt(s): ` +
    `${plan.requirements.length} requirements, ${plan.releases.length} releases, ${plan.stories.length} stories\n`);

  // ── release balance ───────────────────────────────────────────────────────
  const dist: Record<string, number> = {};
  for (const s of plan.stories) dist[s.release] = (dist[s.release] || 0) + 1;
  const mean = plan.stories.length / plan.releases.length;
  const max = Math.max(...Object.values(dist));
  console.log('RELEASE BALANCE');
  console.log(`  pilot : ${JSON.stringify(PILOT.distribution)}  max 8 of 12`);
  console.log(`  now   : ${JSON.stringify(dist)}  max ${max} of ${plan.stories.length}`);
  console.log(`  ceiling is ${(2 * mean).toFixed(1)} (2x mean) -> ${max > 2 * mean ? 'STILL SKEWED' : 'balanced'}\n`);

  // ── constraint typing ─────────────────────────────────────────────────────
  const constraints = plan.requirements.filter(isConstraint);
  console.log('IMPLEMENTATION CONSTRAINTS (the root cause of the pilot\'s layer stories)');
  console.log(`  pilot : ${PILOT.constraintKinds} typed as CONSTRAINT — so each forced a story`);
  console.log(`  now   : ${constraints.length} typed as CONSTRAINT`);
  for (const c of constraints) console.log(`          ${c.id} ${c.statement.slice(0, 78)}`);
  console.log();

  // ── the gate ──────────────────────────────────────────────────────────────
  const gate = gatePlan(plan, `${brief}\n${document}`);
  console.log(`GATE: ${gate.ok ? 'PASS' : `${gate.violations.length} violation(s)`}`);
  for (const v of gate.violations) console.log(`  [${v.rule}] ${v.message.slice(0, 110)}`);
  console.log();

  // ── brief fidelity ────────────────────────────────────────────────────────
  const text = JSON.stringify(plan).toLowerCase();
  console.log('BRIEF FIDELITY');
  for (const term of ['paysimple', '1,788', 'magic link', 'idempot', 'exactly-once', 'roster', 'transfer', 'mandrill']) {
    console.log(`  ${text.includes(term) ? 'present' : 'MISSING'}  ${term}`);
  }
  console.log('HALLUCINATION CHECK (things the first pilot run invented)');
  for (const term of ['stripe', 'paypal', 'hipaa', 'hr system']) {
    console.log(`  ${text.includes(term) ? 'STILL PRESENT' : 'clean       '}  ${term}`);
  }
  console.log();

  console.log('STORIES');
  for (const s of plan.stories) {
    console.log(`  ${s.id} [${s.release}] ${s.title.slice(0, 74)}`);
  }
  console.log();
})().catch((err) => {
  console.error(`\nFAILED: ${err?.error_class ?? 'Error'} — ${err?.message}\n`);
  process.exit(1);
});
