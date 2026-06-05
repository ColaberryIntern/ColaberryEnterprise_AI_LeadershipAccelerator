#!/usr/bin/env node
// Re-post my CB System review on the landing-pages todo using proper
// BC <bc-attachment> mention HTML so Sohail and Ali get actual email
// notifications. The prior plain-text "@Sohail" / "Ali Muwwakkil"
// didn't trigger BC's notification path.

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
const BUCKET = 47502609;
const TODO_ID = 9946499609;

async function bcGet(url) { return (await axios.get(url, { headers: BC_HEADERS })).data; }
async function bcPost(url, body) { return (await axios.post(url, body, { headers: BC_HEADERS })).data; }

function mention(sgid) {
  return `<bc-attachment sgid="${sgid}" content-type="application/vnd.basecamp.mention"></bc-attachment>`;
}

(async () => {
  // 1. Pull project people, get sgids for Sohail + Ali
  const people = await bcGet(`https://3.basecampapi.com/3945211/projects/${BUCKET}/people.json`);
  const sohail = people.find((p) => p.name === 'Sohail Syed');
  const ali = people.find((p) => p.name === 'Ali Muwwakkil');
  if (!sohail || !ali) throw new Error('missing person');
  const SOHAIL = mention(sohail.attachable_sgid);
  const ALI = mention(ali.attachable_sgid);

  const COMMENT = `<div>${SOHAIL} ${ALI} (my prior review on this thread didn't tag you with the mention HTML so neither of you got an email - reposting with proper mentions so this lands in your inbox).</div>
<div><br></div>
<div><strong>${SOHAIL} - strong draft. The narrative arc (consumer → builder), the 4-persona segmentation, and the Learn/Build/Deploy framework all land. The 12-week breakdown is clean. Below is what to refine before ${ALI} signs off.</strong></div>
<div><br></div>
<div><strong>Five specific edits</strong></div>
<ol>
<li><strong>Make the Anthropic + Claude Code co-brand visible.</strong> Per the marketing brief, this is a positioning lever, not a footnote. Add a "Powered by Anthropic + Claude Code" lockup at the top (with the Claude logo) and one substantive line in the Framework section: "Learn with Claude - guided by Anthropic's Claude models, the same AI used by enterprise teams to ship production systems."</li>
<li><strong>Add social proof above the fold.</strong> One line under the headline: "Built on Colaberry's data school - 10,000+ professionals trained, 4 MIT SOLVE Global Championship awards." Without that, the hero reads like every other AI bootcamp page.</li>
<li><strong>Tighten the headline rhythm.</strong> "Learn With Claude. Build Through Colaberry. Deploy In The Real World." → lowercase the connecting words: "Learn with Claude. Build through Colaberry. Deploy in the real world." Reads less stilted.</li>
<li><strong>Add one concrete student outcome to "What You'll See".</strong> "Student Success Stories" is currently abstract. Pull one real artifact - one alum's LinkedIn quote + the system they built. Open House attendees need to see <em>what specifically</em> someone walked out with, not just that the program exists.</li>
<li><strong>Founding Cohort pricing - name the mechanism, not the number.</strong> The brief says reveal price at the event. Good. But the page should still signal scarcity: "Founding Cohort: limited to N seats, includes lifetime access to future intensives + a 1:1 with ${ALI}." Right now "exclusive founding cohort pricing" is empty calorie copy.</li>
</ol>
<div><br></div>
<div><strong>What's working - keep as-is</strong></div>
<ul>
<li>"AI isn't replacing people. It's replacing people who don't know how to build with it." - strong, leave it.</li>
<li>"Bring your idea. Leave with a working AI system." - the hook. Don't over-edit.</li>
<li>The 12-week phase breakdown (Build Your AI Foundation / Create Your AI Team / Connect AI To The Real World / Design AI That Scales) - clean and concrete.</li>
<li>4-persona segmentation (Career Changers / Working Professionals / Builders / Developers) - well-scoped.</li>
</ul>
<div><br></div>
<div><strong>Next step</strong></div>
<div>${SOHAIL} - revise per the 5 edits above, repost in this thread by <strong>end of day Monday 2026-06-08</strong>. I'll re-review within 2 hours of repost. Once you and I are aligned, I'll ping ${ALI} for final approval and you can mark this complete.</div>`;

  const c = await bcPost(`https://3.basecampapi.com/3945211/buckets/${BUCKET}/recordings/${TODO_ID}/comments.json`, {
    content: COMMENT,
  });
  console.log('Mention-tagged comment posted:', c.app_url);
  console.log(`  Sohail sgid: ${sohail.attachable_sgid.substring(0, 40)}...`);
  console.log(`  Ali sgid:    ${ali.attachable_sgid.substring(0, 40)}...`);
})().catch((e) => { console.error('FAIL:', e.response?.data || e.message); process.exit(1); });
