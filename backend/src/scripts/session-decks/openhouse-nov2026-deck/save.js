/**
 * save.js — attach the built Open House deck + teaching guide to the November
 * 2026 Open House session as KitConfig.customDeck, and set the session to 60
 * minutes. Run inside the backend container:
 *
 *   node /app/oh-save.js /tmp/oh-deck.html /tmp/oh-guide.html [--dry]
 *
 * Writes the column directly (a JSONB merge over the existing config) rather
 * than through saveKitConfig, so it also works on a build whose mergeKitConfig
 * predates `customDeck` — that build simply ignores the field until deployed.
 * Idempotent: the same files produce the same row. Prints the previous
 * customDeck size and end_time for rollback; full rollback is
 *   UPDATE live_sessions SET kit_config_json = kit_config_json - 'customDeck' WHERE id = SID.
 */
const fs = require('fs');

const SID = 'bc01abe2-d05c-4b63-89b8-09393f22c006';
const END_TIME = '19:30';
const [deckPath, guidePath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dry = process.argv.includes('--dry');

const LiveSession = require('/app/dist/models/LiveSession').default;

(async () => {
  const html = fs.readFileSync(deckPath, 'utf8');
  const guideHtml = fs.readFileSync(guidePath, 'utf8');
  if (!/<section class="slide/.test(html) || !/Teaching Guide/.test(guideHtml)) throw new Error('input files do not look like the built deck + guide');
  const s = await LiveSession.findByPk(SID);
  if (!s) throw new Error('session not found ' + SID);
  const cfg = s.get('kit_config_json') || {};
  console.error(`BEFORE title="${s.get('title')}" end_time=${s.get('end_time')} customDeck=${cfg.customDeck ? cfg.customDeck.html.length + 'B' : 'none'}`);
  if (dry) { console.error(`DRY: would save deck ${html.length}B guide ${guideHtml.length}B, end_time ${END_TIME}`); process.exit(0); }
  await s.update({ kit_config_json: { ...cfg, customDeck: { html, guideHtml } }, end_time: END_TIME });
  const after = await LiveSession.findByPk(SID);
  const c2 = after.get('kit_config_json') || {};
  const ok = c2.customDeck && c2.customDeck.html === html && c2.customDeck.guideHtml === guideHtml && after.get('end_time') === END_TIME;
  console.error(`SAVED deck=${c2.customDeck ? c2.customDeck.html.length : 0}B guide=${c2.customDeck && c2.customDeck.guideHtml ? c2.customDeck.guideHtml.length : 0}B end_time=${after.get('end_time')} verify=${ok ? 'OK' : 'FAIL'}`);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
