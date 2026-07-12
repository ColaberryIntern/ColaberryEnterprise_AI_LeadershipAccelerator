#!/usr/bin/env node
/**
 * Offline test for the quality-audit classifier.
 * Run: node scripts/ops-engine/__tests__/cb-quality-audit.test.js
 */
const assert = require('assert');
const { classify, summarize } = require('../cb-quality-audit');

let pass = 0;
function t(name, fn) {
  try { fn(); pass += 1; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.message}`); process.exitCode = 1; }
}

t('clean reply is OK', () => {
  const e = { status: 'finished', tools_called: [{ name: 'basecamp_reply' }, { name: 'finish' }],
    side_effects: { repliedHtml: '<div>Ram, here is the plan.</div>' } };
  assert.strictEqual(classify(e).ok, true);
});

t('flags the screenshot-style leak (model emitted tool call as text)', () => {
  const e = { status: 'finished', forced_reply: true,
    quality_flags: ['model_emitted_tool_call_as_text', 'tool_call_leak_sanitized'],
    tools_called: [{ name: 'basecamp_reply', forced: true }],
    side_effects: { repliedHtml: '<div>Ram, the 12-week structure ...</div>' } };
  const c = classify(e);
  assert.strictEqual(c.ok, false);
  assert.ok(c.defects.some((d) => d.includes('tool-call-leak')));
  assert.ok(c.defects.some((d) => d.includes('forced-reply')));
});

t('catches scaffolding that survived INTO the posted reply', () => {
  const e = { status: 'finished', tools_called: [{ name: 'basecamp_reply' }],
    side_effects: { repliedHtml: '<div>functions.finish();</div>' } };
  const c = classify(e);
  assert.ok(c.defects.some((d) => d.includes('LEAK-IN-POSTED-REPLY')));
});

t('flags handler error and no-reply', () => {
  const e = { status: 'error', error: 'openai: timeout', tools_called: [], side_effects: {} };
  const c = classify(e);
  assert.ok(c.defects.some((d) => d.includes('handler-error')));
  assert.ok(c.defects.some((d) => d.includes('no-reply-posted')));
});

t('summarize counts defects across the window', () => {
  const entries = [
    { status: 'finished', tools_called: [{ name: 'basecamp_reply' }], side_effects: { repliedHtml: 'ok' } },
    { status: 'finished', forced_reply: true, quality_flags: ['tool_call_leak_sanitized'],
      tools_called: [{ name: 'basecamp_reply', forced: true }], side_effects: { repliedHtml: 'recovered' } },
  ];
  const s = summarize(entries);
  assert.strictEqual(s.total, 2);
  assert.strictEqual(s.defectRows.length, 1);
});

console.log(`\n${process.exitCode ? '✗ FAIL' : '✓ PASS'} - ${pass} assertions passed\n`);
