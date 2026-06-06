#!/usr/bin/env node
// Reply to Milad's 6/5 4:42 PM email where he sent back his own prep file
// (InnoActive_HM_Interview_Prep.md) built on top of Ali's framework.
// Genuine feedback: 4 wins, 1 hard fix (salary), 2 sharpens, 2 small.
// Attached to the existing Milad prep BC todo on Ali Personal > AI Products.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const BC_BUCKET = 7463955;        // Ali Personal
const AI_PRODUCTS_LIST = 9939449052; // AI Products list
const BC_BASE = 'https://3.basecampapi.com/3945211';

async function bcGet(p) {
  const r = await fetch(`${BC_BASE}${p}`, {
    headers: {
      Authorization: `Bearer ${process.env.BASECAMP_ACCESS_TOKEN}`,
      'User-Agent': 'Colaberry sendMiladInterviewPrepFeedback',
      Accept: 'application/json',
    },
  });
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function findMiladPrepTodo() {
  // List can paginate; walk pages until we find it.
  let url = `/buckets/${BC_BUCKET}/todolists/${AI_PRODUCTS_LIST}/todos.json`;
  for (let page = 1; page <= 10; page++) {
    const todos = await bcGet(`${url}?page=${page}`);
    if (!Array.isArray(todos) || todos.length === 0) break;
    const hit = todos.find((t) => /Milad Gerami.*interview prep/i.test(t.content || t.title || ''));
    if (hit) return hit;
  }
  throw new Error('Could not find Milad prep todo in AI Products list. Manual lookup needed.');
}

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 24px;">
<tr><td>
<div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
<div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
<div style="color: #718096;">Colaberry Inc.</div>
<div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
<div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0; text-decoration: none;">enterprise.colaberry.ai</a></div>
<div style="margin-top: 14px;">
<a href="https://advisor.colaberry.ai/advisory" style="display: inline-block; background: #2b6cb0; color: #ffffff; padding: 9px 18px; border-radius: 20px; text-decoration: none; font-weight: 600;">Design Your AI Organization</a>
</div>
</td></tr>
</table>`;

const SIG_TEXT = `Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.

200 Chisholm Place, Suite 200, Plano, TX 75075
ali@colaberry.com  |  enterprise.colaberry.ai
Design Your AI Organization: https://advisor.colaberry.ai/advisory`;

const HTML = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6; max-width: 760px;">

<p>Milad,</p>

<p>Read your prep file. Better than what most senior candidates put together. Real signs you internalized the framework instead of just printing my email. A few things to sharpen and one to fix.</p>

<h2 style="color: #1a365d; font-size: 16px; margin-top: 22px;">What is working</h2>

<p><strong>The Key Design Decisions table is the strongest part of the file.</strong> Nine one-liners ready for every "why did you do X" question is exactly what a senior HM is checking for. That table was not in my email; you pulled it from your case-study experience. That is a senior move.</p>

<p><strong>The numbers-memorized section.</strong> Having $73.95M, CPI 0.50, 141-day, August 0.36, and the 42 percent counterintuitive figure on tap means you will move faster than candidates who hunt for figures mid-call. Read those out loud Sunday until they are muscle memory.</p>

<p><strong>The 8-minute walkthrough is tighter than mine.</strong> Six timed steps with specific transitions. Run it Sunday with a timer. If it overruns 8 minutes, cut from step 3 or 4 first; do not cut the opening punchline or the v2 close.</p>

<p><strong>The two behavioral stories are real and specific.</strong> Auto Market Dashboard (EPA + IEA different grain, filtered independently in DAX, ended with the 22 percent EV share insight) and Finance revenue (date field + cancelled orders, brought both teams together to sign off the definition). Both will land.</p>

<h2 style="color: #1a365d; font-size: 16px; margin-top: 22px;">One thing to fix - salary</h2>

<p>You wrote you would confirm $115-125K with the HM if asked. That is the only real problem in the file. For Bay Area senior BI, $115-125K reads as either junior or as a $60K discount the company would happily take. I told you to floor at $160K.</p>

<p>You already anchored low with Mert in screening, which is harder to walk back, but you can still reset with the HM. Do not re-confirm the screener number. Try this:</p>

<blockquote style="background: #f7fafc; border-left: 4px solid #1a365d; padding: 12px 16px; margin: 8px 0; font-style: italic; color: #2d3748;">
"Mert and I had an early conversation around $115-125K. Since then I have seen more of the scope and the consulting model, so I would want to revisit total comp - base plus bonus or equity. What is the band you are working with for this role?"
</blockquote>

<p>Get them to share their number first. Bay Area senior data and BI consultant roles are $150-220K base, $180-280K total. If they push and ask for a number, hold a floor of $160K and add "depending on total comp structure." Do not undershoot.</p>

<h2 style="color: #1a365d; font-size: 16px; margin-top: 22px;">Two things to sharpen</h2>

<p><strong>1. Add a third behavioral story - mentoring or unblocking someone.</strong> You loaded messy-data and pushback. Senior interviews almost always include "tell me about a time you helped someone grow, unblocked a peer, or owned a process beyond your own deliverable." You have mentored interns at Colaberry. Use that. 90 seconds, STAR format. Pick one real intern you helped through a stuck moment.</p>

<p><strong>2. Your risk-classification observation is sharp but loaded.</strong> Saying "the risk classification may need recalibration" is exactly the kind of strategic observation a senior makes. But if the HM asks "why do you think that is" and you have no answer, it reads as repeating words instead of analysis. Pick one of these and own it:</p>

<ul>
<li>High-risk projects get more PM attention, so they stay contained. Medium-risk is the larger bucket so absolute dollars are bigger.</li>
<li>Initial risk scoring may be conservative on high, lenient on medium.</li>
<li>Risk is scored at kickoff but never updated. Reality drifts.</li>
</ul>

<p>Pick one. Defend it. Do not get caught reading your own observation back to him.</p>

<h2 style="color: #1a365d; font-size: 16px; margin-top: 22px;">Two small ones</h2>

<p><strong>Pick PRJ019 or PRJ020 now</strong> for the Page 2 walkthrough. Drill that one. Switching mid-thought reads as unprepared.</p>

<p><strong>Print TMAY V7.</strong> Read it out loud Sunday. Do not trust cold recall on the most important 90 seconds of the call.</p>

<h2 style="color: #1a365d; font-size: 16px; margin-top: 22px;">Bottom line</h2>

<p>You did the work. The case study landed clean. Monday is about presence and salary discipline. The rest is rehearsal.</p>

<p>Cheering for you,</p>
<p>Ali</p>

${SIG_HTML}

</div>`;

const TEXT = `Milad,

Read your prep file. Better than what most senior candidates put together. Real signs you internalized the framework instead of just printing my email. A few things to sharpen and one to fix.

WHAT IS WORKING

The Key Design Decisions table is the strongest part of the file. Nine one-liners ready for every "why did you do X" question is exactly what a senior HM is checking for. That was not in my email; you pulled it from your case-study experience. Senior move.

The numbers-memorized section. Having $73.95M, CPI 0.50, 141-day, August 0.36, 42 percent counterintuitive on tap means you will move faster than candidates who hunt for figures mid-call. Read those out loud Sunday until they are muscle memory.

The 8-minute walkthrough is tighter than mine. Six timed steps with specific transitions. Run it Sunday with a timer. If it overruns, cut from step 3 or 4 first; not the opening punchline or the v2 close.

The two behavioral stories are real and specific. Auto Market Dashboard and Finance revenue both land.

ONE THING TO FIX - SALARY

You wrote you would confirm $115-125K with the HM if asked. That is the only real problem in the file. For Bay Area senior BI, $115-125K reads as either junior or as a $60K discount the company would happily take. I told you to floor at $160K.

You already anchored low with Mert in screening, harder to walk back, but you can still reset with the HM. Do not re-confirm the screener number. Try this:

"Mert and I had an early conversation around $115-125K. Since then I have seen more of the scope and the consulting model, so I would want to revisit total comp - base plus bonus or equity. What is the band you are working with for this role?"

Get them to share their number first. Bay Area senior data and BI consultant roles are $150-220K base, $180-280K total. If they push for a number, hold a floor of $160K and add "depending on total comp structure." Do not undershoot.

TWO TO SHARPEN

1. Add a third behavioral story - mentoring or unblocking someone. You loaded messy-data and pushback. Senior interviews almost always include "tell me about a time you helped someone grow or unblocked a peer." You have mentored interns at Colaberry. Use that. 90 sec STAR format.

2. Your risk-classification observation is sharp but loaded. "The classification may need recalibration" is a strategic observation. But if the HM asks "why do you think that is" you need an answer. Pick one and own it:
- High-risk gets more PM attention so it stays contained. Medium-risk is the larger bucket so absolute dollars are bigger.
- Initial scoring may be conservative on high, lenient on medium.
- Risk is scored at kickoff but never updated; reality drifts.

Pick one. Defend it. Do not get caught reading your own observation back to him.

TWO SMALL ONES

Pick PRJ019 or PRJ020 now for the Page 2 walkthrough. Drill that one. Switching mid-thought reads as unprepared.

Print TMAY V7. Read it out loud Sunday. Do not trust cold recall on the most important 90 seconds.

BOTTOM LINE

You did the work. The case study landed clean. Monday is about presence and salary discipline. The rest is rehearsal.

Cheering for you,
Ali

${SIG_TEXT}`;

(async () => {
  const todo = await findMiladPrepTodo();
  console.log('Found Milad prep todo:', todo.id, '-', todo.app_url);

  const r = await sendWithBcAttach({
    ticketId: todo.id,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'eng.miladgerami@gmail.com',
    bcc: ['alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Re: Monday interview prep - read Sun + Mon AM',
    html: HTML,
    text: TEXT,
    bcSummary: '<p>Reviewed Milad\'s InnoActive_HM_Interview_Prep.md (his own prep file built on top of Ali\'s framework). Genuine feedback: (1) Wins - Key Design Decisions table, numbers memorized, 6-step walkthrough timing, behavioral stories specific. (2) Hard fix - salary. He had written $115-125K for the HM; Ali had said floor at $160K. Provided reframe script to walk back the screener anchor with the HM without re-confirming the low number. (3) Sharpens - missing third behavioral story (mentoring), risk-classification observation needs a defended hypothesis. (4) Small - pick PRJ019 or PRJ020 now, print TMAY V7.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC attach:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.response?.data || e.stack || e.message); process.exit(1); });
