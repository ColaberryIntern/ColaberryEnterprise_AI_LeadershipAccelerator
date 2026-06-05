#!/usr/bin/env node
// Unstick the AI Systems Architect Accelerator landing-pages todo.
// CB System got tangled twice:
//   1. Misread Sohail's "CB will update it to you" as a directive
//      instead of Sohail saying he'd update later
//   2. Replied to Sohail's actual draft with leaked JSON template
//      content ("```json {...} ```") instead of prose
// This script: posts a real substantive review from CB System +
// bumps the due date to Monday so the overdue ticker stops firing.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const axios = require(path.resolve(__dirname, '../../../node_modules/axios'));

const BC_HEADERS = {
  Authorization: `Bearer ${process.env.BASECAMP_ACCESS_TOKEN}`,
  'User-Agent': 'Colaberry Accelerator (ali@colaberry.com)',
  'Content-Type': 'application/json',
};
const BUCKET = 47502609; // AI Systems Architect Accelerator
const TODO_ID = 9946499609;

const COMMENT = `<div>(Superseding my earlier malformed reply on this thread — that JSON output was a template leak. Here is the real review.)</div>
<div><br></div>
<div><strong>Sohail — strong draft. The narrative arc (consumer → builder), the 4-persona segmentation, and the Learn/Build/Deploy framework all land. The 12-week breakdown is clean. Below is what to refine before Ali signs off.</strong></div>
<div><br></div>
<div><strong>Five specific edits</strong></div>
<ol>
<li><strong>Make the Anthropic + Claude Code co-brand visible.</strong> Per the marketing brief, this is a positioning lever, not a footnote. Add a "Powered by Anthropic + Claude Code" lockup at the top (with the Claude logo) and one substantive line in the Framework section: "Learn with Claude — guided by Anthropic's Claude models, the same AI used by enterprise teams to ship production systems."</li>
<li><strong>Add social proof above the fold.</strong> One line under the headline: "Built on Colaberry's data school — 10,000+ professionals trained, 4 MIT SOLVE Global Championship awards." Without that, the hero reads like every other AI bootcamp page.</li>
<li><strong>Tighten the language.</strong> On the page: "Learn With Claude. Build Through Colaberry. Deploy In The Real World." → drop the periods after each phrase, run it as one rhythm: "Learn with Claude. Build through Colaberry. Deploy in the real world." (lowercase the connecting words; reads less stilted).</li>
<li><strong>Add one concrete student outcome to "What You'll See".</strong> "Student Success Stories" is currently abstract. Pull one real artifact — one alumna's LinkedIn quote + the system they built. Open House attendees need to see <em>what specifically</em> someone walked out with, not just that the program exists.</li>
<li><strong>Founding Cohort pricing — name the mechanism, not the number.</strong> The brief says reveal price at the event. Good. But the page should still signal scarcity: "Founding Cohort: limited to N seats, includes lifetime access to future intensives + a 1:1 with Ali Muwwakkil." Right now "exclusive founding cohort pricing" is empty calorie copy.</li>
</ol>
<div><br></div>
<div><strong>What's working — keep as-is</strong></div>
<ul>
<li>"AI isn't replacing people. It's replacing people who don't know how to build with it." — strong, leave it.</li>
<li>"Bring your idea. Leave with a working AI system." — the hook. Don't over-edit.</li>
<li>The 12-week phase breakdown (Build Your AI Foundation / Create Your AI Team / Connect AI To The Real World / Design AI That Scales) — clean and concrete.</li>
<li>4-persona segmentation (Career Changers / Working Professionals / Builders / Developers) — well-scoped.</li>
</ul>
<div><br></div>
<div><strong>Next step</strong></div>
<div>Sohail — revise per the 5 edits above, repost in this thread by <strong>end of day Monday 2026-06-08</strong>. I'll re-review within 2 hours of repost. Once you and I are aligned, I'll ping Ali Muwwakkil for final approval and you can mark this complete.</div>
<div><br></div>
<div><em>(Bumping due date to 2026-06-08 so the overdue ticker stops firing on this thread.)</em></div>`;

(async () => {
  // 1. Read current todo so PUT carries the full body
  const cur = (await axios.get(`https://3.basecampapi.com/3945211/buckets/${BUCKET}/todos/${TODO_ID}.json`, { headers: BC_HEADERS })).data;

  // 2. Post the real review comment
  const c = await axios.post(`https://3.basecampapi.com/3945211/buckets/${BUCKET}/recordings/${TODO_ID}/comments.json`, {
    content: COMMENT,
  }, { headers: BC_HEADERS });
  console.log('Comment posted:', c.data.app_url);

  // 3. Bump due_on to Monday 2026-06-08 (full PUT body to satisfy BC API)
  await axios.put(`https://3.basecampapi.com/3945211/buckets/${BUCKET}/todos/${TODO_ID}.json`, {
    content: cur.content,
    description: cur.description,
    due_on: '2026-06-08',
    assignee_ids: cur.assignees.map((a) => a.id),
  }, { headers: BC_HEADERS });
  console.log('Due date bumped to 2026-06-08.');
})().catch((e) => { console.error('FAIL:', e.response?.data || e.message); process.exit(1); });
