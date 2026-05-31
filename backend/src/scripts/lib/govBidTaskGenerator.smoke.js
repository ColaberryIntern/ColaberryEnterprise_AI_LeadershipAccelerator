#!/usr/bin/env node
// End-to-end smoke for the task generator.
// Hits real gpt-4o with real RFP extracted text. No Basecamp writes.
//
// Prereq: tmp/extract-smoke/ contains the extracted Harris County RFP files
// (run the extractor smoke first), and OPENAI_API_KEY is set in .env.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

(async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set; cannot run task generator smoke.');
    process.exit(2);
  }
  const { extractTextFromFiles } = require('./govBidContentExtractor');
  const { generateTasksFromContent } = require('./govBidTaskGenerator');

  const filesDir = path.resolve(__dirname, '../../../../tmp/extract-smoke');
  const fileTexts = await extractTextFromFiles(filesDir);
  console.log(`Extracted ${fileTexts.length} files (${fileTexts.reduce((s, f) => s + f.text.length, 0)} chars total)`);

  const bidConfig = {
    display_title: 'Harris County - Agenda & Meeting Management System (RFP 26_0075)',
    agency_name: 'Harris County, Texas',
    deadline: '2026-06-22',
    opportunity_uuid: '2e287828-9040-4948-98fe-a0250a5d66a5',
    fit_thesis: 'RAG over meeting/agenda content + public-access portal',
  };

  console.log('Calling gpt-4o...');
  const t0 = Date.now();
  const result = await generateTasksFromContent({ bidConfig, fileTexts });
  console.log(`Got ${result.tasks.length} tasks in ${Date.now() - t0}ms. Tokens:`, result.tokens);
  console.log();
  for (const [i, t] of result.tasks.entries()) {
    console.log(`${i + 1}. ${t.content}`);
    console.log(`   ${t.note}`);
    console.log();
  }

  // Validation
  const fail = [];
  if (result.tasks.length < 8) fail.push(`expected >=8 tasks, got ${result.tasks.length}`);
  if (result.tasks.length > 18) fail.push(`expected <=18 tasks, got ${result.tasks.length}`);
  for (const t of result.tasks) {
    if (/—|–/.test(t.content + t.note)) fail.push(`em-dash leaked into "${t.content}"`);
    if (t.content.length > 250) fail.push(`content too long: "${t.content.slice(0, 30)}..."`);
  }
  const hasSubmit = result.tasks.some((t) => /submit.*bonfire|bonfire.*submission/i.test(t.content));
  if (!hasSubmit) fail.push('no Bonfire submission task in the list');
  const hasReview = result.tasks.some((t) => /sign.?off|internal review|final review/i.test(t.content));
  if (!hasReview) fail.push('no internal review/sign-off task');

  if (fail.length) {
    console.log('\nFailures:'); fail.forEach((f) => console.log('  -', f));
    process.exit(1);
  }
  console.log('\nAll task-generator checks passed.');
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
