#!/usr/bin/env node
/**
 * Offline unit tests for cb-reply-sanitizer.
 * One-command run (no jest, no network):  node scripts/ops-engine/__tests__/cb-reply-sanitizer.test.js
 */
const assert = require('assert');
const {
  looksLikeToolCallLeak,
  extractLeakedReply,
  sanitizeReplyHtml,
  buildMention,
  stripEmDashes,
} = require('../cb-reply-sanitizer');

let pass = 0;
function t(name, fn) {
  try { fn(); pass += 1; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// ---------------------------------------------------------------------------
// The EXACT leak from Ali's screenshot (todo 9946499609).
// ---------------------------------------------------------------------------
const SCREENSHOT_LEAK = `functions.basecamp_reply({
content_html: "
Ram, the 12-week structure is designed to provide a comprehensive learning experience, but your point about leading with the 3-week milestone is valid. Highlighting the initial 3-week goal of building the first AI system could attract those looking for a shorter commitment. This can be positioned as a quick win within the broader 12-week program. I recommend discussing this adjustment with the marketing team to see how it can be incorporated into the landing page strategy.
"
});
functions.finish();`;

t('detects the screenshot leak', () => {
  assert.strictEqual(looksLikeToolCallLeak(SCREENSHOT_LEAK), true);
});

t('extracts the real reply text from the screenshot leak', () => {
  const inner = extractLeakedReply(SCREENSHOT_LEAK);
  assert.ok(inner.startsWith('Ram, the 12-week structure'), `got: ${inner.slice(0, 40)}`);
  assert.ok(inner.endsWith('landing page strategy.'), `got tail: ${inner.slice(-40)}`);
  assert.ok(!/functions\.|basecamp_reply|content_html|finish\(/.test(inner), 'scaffolding leaked through');
});

t('sanitizeReplyHtml flags the leak and returns clean prose', () => {
  const { html, wasLeak } = sanitizeReplyHtml(SCREENSHOT_LEAK);
  assert.strictEqual(wasLeak, true);
  assert.ok(html.startsWith('Ram, the 12-week structure'));
  assert.ok(!/functions\.|\}\);|content_html/.test(html), `scaffolding survived: ${html}`);
});

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------
t('single-quoted content_html', () => {
  const leak = `functions.basecamp_reply({ content_html: 'Done. Closed the ticket.' }); functions.finish();`;
  assert.strictEqual(extractLeakedReply(leak), 'Done. Closed the ticket.');
});

t('content_html carrying internal HTML double-quotes', () => {
  const leak = `basecamp_reply({content_html: "<div style=\\"color:red\\">Heads up Sohail</div>"});`;
  const inner = extractLeakedReply(leak);
  assert.ok(inner.includes('Heads up Sohail'), `got: ${inner}`);
  assert.ok(inner.includes('color:red'));
});

t('email_ali body_html leak is recovered', () => {
  const leak = `functions.email_ali({subject:"x", body_html:"Summary attached.", body_text:"Summary attached."});`;
  assert.strictEqual(extractLeakedReply(leak), 'Summary attached.');
});

t('scaffolding-only leak (no content key) is stripped, not posted raw', () => {
  const leak = `Closing this out now.\nfunctions.finish();`;
  const { html, wasLeak } = sanitizeReplyHtml(leak);
  assert.strictEqual(wasLeak, true);
  assert.ok(html.includes('Closing this out now.'));
  assert.ok(!/functions\.finish/.test(html), `finish survived: ${html}`);
});

// ---------------------------------------------------------------------------
// Clean replies must pass through UNTOUCHED (non-destructive).
// ---------------------------------------------------------------------------
t('legit HTML reply is not mangled', () => {
  const good = `<div>Got it. I queued the follow-up for next session.</div>`;
  const { html, wasLeak } = sanitizeReplyHtml(good);
  assert.strictEqual(wasLeak, false);
  assert.strictEqual(html, good);
});

t('legit reply mentioning the word "finish" (not a call) is untouched', () => {
  const good = `<div>I will finish the deck and send it over.</div>`;
  const { html, wasLeak } = sanitizeReplyHtml(good);
  assert.strictEqual(wasLeak, false, 'false positive on the word finish');
  assert.strictEqual(html, good);
});

t('em-dashes normalized to hyphens', () => {
  assert.strictEqual(stripEmDashes('a — b – c'), 'a - b - c');
});

// ---------------------------------------------------------------------------
// buildMention - the right person gets tagged.
// ---------------------------------------------------------------------------
const RAM = { id: 17346350, name: 'Ram Katamaraja', attachable_sgid: 'SGID_RAM_123' };
const ALI_SGID = 'SGID_ALI_FALLBACK';

t('buildMention tags the asker (Ram), not Ali', () => {
  const m = buildMention(RAM, { fallbackSgid: ALI_SGID });
  assert.ok(m.includes('SGID_RAM_123'), `got: ${m}`);
  assert.ok(!m.includes(ALI_SGID), 'fell back to Ali when Ram sgid was available');
  assert.ok(m.includes('vnd.basecamp.mention'));
});

t('buildMention falls back to provided sgid when person has none', () => {
  const m = buildMention({ id: 1, name: 'No Sgid' }, { fallbackSgid: ALI_SGID });
  assert.ok(m.includes(ALI_SGID));
});

t('buildMention falls back to plain name when no sgid at all', () => {
  const m = buildMention({ id: 1, name: 'Jane Doe' });
  assert.strictEqual(m, 'Jane Doe');
});

console.log(`\n${process.exitCode ? '✗ FAIL' : '✓ PASS'} - ${pass} assertions passed\n`);
