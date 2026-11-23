/**
 * save.js — attach the built follow-along deck + teaching guide to Nov 2026
 * Session 3 as KitConfig.customDeck, so ▶ Present opens it. Run inside the
 * backend container:
 *
 *   node /app/zz_s3fa_save.js /tmp/s3fa-deck.html /tmp/s3fa-guide.html [--dry]
 *
 * Same approach as openhouse-nov2026-deck/save.js: a JSONB merge over the
 * existing kit config, touching only `customDeck`. Idempotent: the same files
 * produce the same row. Rollback (back to the generated Class Kit):
 *   UPDATE live_sessions SET kit_config_json = jsonb_set(kit_config_json, '{customDeck}', 'null') WHERE id = SID;
 */
const fs = require('fs');

const SID = '5b8a95b7-1a88-42d5-b257-fd786d071f6e';
const [deckPath, guidePath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dry = process.argv.includes('--dry');

const LiveSession = require('/app/dist/models/LiveSession').default;

(async () => {
  const html = fs.readFileSync(deckPath, 'utf8');
  const guideHtml = fs.readFileSync(guidePath, 'utf8');
  if (!/id="deckdata"/.test(html) || !/Teaching Guide/.test(guideHtml)) throw new Error('input files do not look like the built follow-along deck + guide');
  const s = await LiveSession.findByPk(SID);
  if (!s) throw new Error('session not found ' + SID);
  const cfg = s.get('kit_config_json') || {};
  console.error(`BEFORE title="${s.get('title')}" date=${s.get('session_date')} ${s.get('start_time')}-${s.get('end_time')} customDeck=${cfg.customDeck ? cfg.customDeck.html.length + 'B' : 'none'}`);
  if (dry) { console.error(`DRY: would save deck ${html.length}B guide ${guideHtml.length}B`); process.exit(0); }
  await s.update({ kit_config_json: { ...cfg, customDeck: { html, guideHtml } } });
  const after = await LiveSession.findByPk(SID);
  const c2 = after.get('kit_config_json') || {};
  const ok = c2.customDeck && c2.customDeck.html === html && c2.customDeck.guideHtml === guideHtml;
  console.error(`SAVED deck=${c2.customDeck ? c2.customDeck.html.length : 0}B guide=${c2.customDeck && c2.customDeck.guideHtml ? c2.customDeck.guideHtml.length : 0}B verify=${ok ? 'OK' : 'FAIL'}`);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
