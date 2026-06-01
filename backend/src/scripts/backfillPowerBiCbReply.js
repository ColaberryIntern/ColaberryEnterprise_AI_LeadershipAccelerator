#!/usr/bin/env node
// Backfill CB's missing reply on the Power BI - Center of Excellence "Stress
// Test 2 - Retail Sales Analysis" message thread. Ali tagged @CB at 1:29pm
// today asking for suggestions to improve Lucy's report. The dispatcher
// never saw the mention because bucket 24864171 was not in the hardcoded
// WATCHED_BUCKETS list. Fix in the dispatcher is shipping in the same
// commit; this script posts the reply.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const TOKEN_FALLBACK = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry CB-Backfill', Accept: 'application/json', 'Content-Type': 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211';

const BUCKET = 24864171;
const RECORDING = 9728438673; // The message Ali tagged @CB on
const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';

(async () => {
  const html = `<div><bc-attachment sgid="${ALI_SGID}" content-type="application/vnd.basecamp.mention"></bc-attachment> late reply, sorry. The dispatcher only watched 8 hardcoded buckets and Power BI - Center of Excellence was not one of them. Fixing that now so I watch every project I have access to, not a fixed list. Going forward your @CB pings here will be answered within 3 minutes.</div>
<div><br></div>
<div>Suggestions to make Lucy's report stronger against the brief (Positive Insight + stat / Negative Insight + stat / ROI / Case 1 vs 2 chart / 50-word summary):</div>
<div><br></div>
<ol>
<li><strong>Pair every stat with a baseline.</strong> "12% conversion" is just a number. "12% conversion, up 3 points from Q3, vs the 8% industry average" tells the reader whether to be happy or worried. Same rule for the negative insight: a negative stat is only negative against something.</li>
<li><strong>Translate ROI into a decision.</strong> ROI as a percentage is fine. ROI tied to "should we put the next dollar into Case 1 or Case 2" is what gets a stakeholder to act. Phrase ROI in terms of the marginal next investment, not the lifetime aggregate.</li>
<li><strong>Same axis on the Case 1 vs Case 2 chart.</strong> Side-by-side bars on the same chart, same y-axis scale, same time window. The classic mistake at this stage is two separate charts that do not share scale and visually flatter one case over the other.</li>
<li><strong>End the 50-word summary with the recommendation.</strong> The brief says "lets the target audience choose" - that means decision support, not description. Most stress test summaries describe what is in the report. Lucy should end with "Case 2 wins if your priority is X, Case 1 wins if your priority is Y" so the choice is framed for them.</li>
<li><strong>Name the target audience by role.</strong> Different audiences need different framings. CFO wants cash returns. CMO wants brand impact. Store ops wants execution simplicity. The 50-word summary should be written for one named role, not a generic "stakeholder."</li>
<li><strong>Annotate the chart with the story.</strong> A chart with no callouts forces the reader to find the story. Add 1-2 inline annotations pointing to the inflection points that matter ("Case 2 overtakes Case 1 here in week 6 as the loyalty program kicks in"). The reader should not have to squint.</li>
<li><strong>State what is included and excluded.</strong> Customer insights are easy to cherry-pick. Add one line: "Includes: in-store + online buyers, Q1-Q3 2025. Excludes: returns, B2B accounts." This is what separates a defensible analysis from a sales pitch.</li>
<li><strong>The bias test.</strong> Switch the Case 1 and Case 2 labels mentally. If the summary still reads as fair, it is unbiased. If swapping the labels makes one case look obviously worse, the summary is loaded. Easy self-check before submitting.</li>
</ol>
<div><br></div>
<div>Of those, the highest-leverage one is #4 - ending the summary with the framed recommendation. That single move turns a description into a decision document, which is exactly what the COE brief is asking for.</div>
<div><br></div>
<div style="font-size:11px;color:#64748b">Posted by CB System (late, see top). Dispatcher fix shipping in the same session: dynamic project enumeration replacing the hardcoded WATCHED_BUCKETS list.</div>`;

  const r = await fetch(`${BASE}/buckets/${BUCKET}/recordings/${RECORDING}/comments.json`, {
    method: 'POST', headers: H, body: JSON.stringify({ content: html }),
  });
  console.log(`status: ${r.status}`);
  if (!r.ok) { console.error('POST failed:', await r.text()); process.exit(1); }
  const c = await r.json();
  console.log(`comment id: ${c.id} url: ${c.app_url}`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
