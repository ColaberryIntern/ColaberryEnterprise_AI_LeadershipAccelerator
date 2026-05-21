/**
 * compareDocGenerators — 2026-05-21.
 *
 * Controlled head-to-head on the SAME idea (ShelfSense Inventory, run2):
 *   A) AI Project Architect (advisor.colaberry.ai) — multi-phase, multi-chapter
 *   B) Regular LLM (POST /requirements/generate, gpt-4o-mini, single call)
 *
 * Fetches the already-built Architect doc and generates a fresh regular-LLM
 * doc for the same idea WITHOUT saving it (job output only), so run2's saved
 * Architect doc is untouched. Measures size + structure of each.
 *
 * Output: docs/doc-comparison/{architect,regular}.md + metrics.json
 *
 * Run: node scripts/compareDocGenerators.js
 */
const fs = require('fs');
const path = require('path');

const BASE = 'https://enterprise.colaberry.ai';
const ARCHITECT_BASE = 'https://advisor.colaberry.ai';
const SLUG = 'shelfsense-inventory';
const OUT = path.resolve(__dirname, '..', 'docs', 'doc-comparison');

const IDEA = 'A multi-location retail inventory platform that forecasts restock needs from historical sales velocity, flags likely shrinkage and theft from count discrepancies, and auto-generates purchase orders to the right supplier when stock dips below par levels.';
// Mimic a "yes" questionnaire — the capabilities the regular path folds into its prompt.
const CAPS = [
  '[Forecasting] Predict restock needs per location from historical sales velocity',
  '[Loss Prevention] Detect likely shrinkage/theft from physical-count vs system discrepancies',
  '[Procurement] Auto-generate and route purchase orders to the right supplier at par thresholds',
  '[Multi-location] Per-store and roll-up inventory visibility',
  '[Alerting] Low-stock and anomaly alerts to store managers',
  '[Analytics] Inventory turnover, dead-stock, and supplier performance reporting',
];
const USER_PROMPT = `ORIGINAL IDEA:\n${IDEA}\n\nDESIRED CAPABILITIES:\n${CAPS.map(c => '- ' + c).join('\n')}\n\nGenerate comprehensive requirements covering the original idea and all selected capabilities. The requirements document should be at least 6000 words and cover functional requirements, non-functional requirements, system architecture, data models, API specifications, and user interface requirements.`;

function metrics(label, text) {
  const chars = text.length;
  const words = (text.trim().match(/\S+/g) || []).length;
  const lines = text.split('\n').length;
  const h1 = (text.match(/^#\s+/gm) || []).length;
  const h2 = (text.match(/^##\s+/gm) || []).length;
  const h3 = (text.match(/^###\s+/gm) || []).length;
  // Top-level section titles (## ...)
  const sections = (text.match(/^##\s+(.+)$/gm) || []).map(s => s.replace(/^##\s+/, '').trim()).slice(0, 40);
  return { label, chars, words, lines, headings: { h1, h2, h3 }, est_pages: Math.round(words / 600), sections };
}

async function jwtFor(runIdx) {
  const meta = require('./.demo_onboarding_runs.json')[runIdx];
  const r = await fetch(`${BASE}/api/portal/verify?token=${meta.portal_token}`);
  return (await r.json()).jwt;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const jwt = await jwtFor(1); // run2

  // A) Architect doc (already built)
  console.log('[compare] fetching Architect doc...');
  const archRes = await fetch(`${ARCHITECT_BASE}/projects/${SLUG}/final-assembly/download`);
  const architectDoc = await archRes.text();
  fs.writeFileSync(path.join(OUT, 'architect.md'), architectDoc);

  // B) Regular LLM doc (generate, poll, DO NOT save)
  console.log('[compare] starting regular LLM generation...');
  const gen = await fetch(`${BASE}/api/portal/project/requirements/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'professional', user_prompt: USER_PROMPT }),
  });
  const { job_id } = await gen.json();
  if (!job_id) throw new Error('no job_id from generate');
  let regularDoc = '';
  const start = Date.now();
  while (Date.now() - start < 8 * 60 * 1000) {
    await new Promise(r => setTimeout(r, 4000));
    const s = await (await fetch(`${BASE}/api/portal/project/requirements/job/${job_id}`, { headers: { Authorization: `Bearer ${jwt}` } })).json();
    if (s.status === 'completed') { regularDoc = s.result?.content || s.output_document || ''; break; }
    if (s.status === 'failed') throw new Error('regular generation failed: ' + s.error_message);
  }
  if (!regularDoc) throw new Error('regular generation timed out');
  fs.writeFileSync(path.join(OUT, 'regular.md'), regularDoc);

  const result = {
    generated_at: new Date().toISOString(),
    idea_chars: IDEA.length,
    regular_prompt_chars: USER_PROMPT.length,
    regular_config: { model: 'gpt-4o-mini', max_tokens: 16000, temperature: 0.3, calls: 1 },
    architect_config: { service: ARCHITECT_BASE, phases: 8, chapter_min_words: 1750, blueprint: 'standard', calls: 'many (per-phase + per-chapter + retries)' },
    architect: metrics('AI Project Architect', architectDoc),
    regular: metrics('Regular LLM (gpt-4o-mini)', regularDoc),
  };
  result.explosion = {
    architect_x: +(result.architect.chars / result.idea_chars).toFixed(0),
    regular_x: +(result.regular.chars / result.regular_prompt_chars).toFixed(1),
    architect_vs_regular_size: +(result.architect.chars / Math.max(1, result.regular.chars)).toFixed(1),
  };
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
