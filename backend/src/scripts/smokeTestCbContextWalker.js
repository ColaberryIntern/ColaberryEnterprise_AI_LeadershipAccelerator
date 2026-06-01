#!/usr/bin/env node
// Smoke test the new cb-context-walker against the ShipCES todo 9946715864.
// Prints the formatted LLM context so we can eyeball that:
//   - LIST layer pulls Service Type / Client Asks etc with sibling tasks
//   - TASK layer has full description
//   - COMMENTS layer is paginated + untruncated (caps at 4000 chars/comment)
//   - DOCUMENTS layer picks up any BC links in description/comments
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { walkContext, formatContextForLlm } = require(path.resolve(__dirname, '../../../scripts/ops-engine/cb-context-walker'));

const TOKEN_FALLBACK = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
process.env.BASECAMP_ACCESS_TOKEN = process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK;
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '').trim();
const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry Smoke', Accept: 'application/json' };

async function bcGet(p) {
  const r = await fetch(`https://3.basecampapi.com/3945211${p}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`);
  return r.json();
}

(async () => {
  const BUCKET = 47126345;
  const TODO = 9946715864;
  console.log(`[smoke] walking context for bucket ${BUCKET}, recording ${TODO} ...`);
  const ctx = await walkContext({ bcGet, bucketId: BUCKET, recId: TODO, debug: true });
  console.log(`[smoke] stats:`, ctx.stats);
  console.log(`[smoke] list?`, !!ctx.list, ctx.list ? `name="${ctx.list.name}"` : '');
  console.log(`[smoke] task?`, !!ctx.task, ctx.task ? `title="${ctx.task.title?.slice(0, 60)}", description ${ctx.task.description.length} chars` : '');
  console.log(`[smoke] comments:`, ctx.comments.length);
  console.log(`[smoke] documents:`, ctx.documents.length, ctx.documents.map(d => `${d.kind}:${(d.url || '').slice(-40)}`).join(' | '));
  console.log('---FORMATTED CONTEXT START---');
  const fmt = formatContextForLlm(ctx, 17454835);
  console.log(`(total ${fmt.length} chars)`);
  console.log(fmt.slice(0, 8000));
  if (fmt.length > 8000) console.log(`\n[...truncated ${fmt.length - 8000} more chars in output...]`);
  console.log('---FORMATTED CONTEXT END---');
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
