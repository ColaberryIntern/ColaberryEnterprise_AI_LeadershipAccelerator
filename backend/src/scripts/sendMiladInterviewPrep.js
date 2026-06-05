#!/usr/bin/env node
// Send Milad Gerami the Bay Area senior BI interview prep email for
// his Monday 2026-06-08 hiring-manager interview. Creates a fresh
// Ali Personal BC todo for the coaching and attaches the email to it.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const axios = require(path.resolve(__dirname, '../../../node_modules/axios'));
const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const BC_HEADERS = {
  Authorization: `Bearer ${process.env.BASECAMP_ACCESS_TOKEN}`,
  'User-Agent': 'Colaberry Accelerator (ali@colaberry.com)',
  'Content-Type': 'application/json',
};
const ALI_PERSONAL_BUCKET = 7463955;
const AI_PRODUCTS_LIST_ID = 9939449052;
const ALI_USER_ID = 17454835;

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

<p>Congrats on clearing the screen. This Monday is a hiring manager interview, not a technical one, so the prep is different. Read this once tonight and again Monday morning. You will walk in sharp.</p>

<h2 style="color: #1a365d; font-size: 16px; margin-top: 22px;">The frame</h2>
<p>30 minutes, Teams, senior role, Bay Area. The hiring manager is not testing whether you can build a dashboard. You already passed that screen. He is testing three things: can you think strategically, can you communicate at his level, and do you fit the team. The case study is the starting point, not the whole show. Plan on 8 to 10 minutes of dashboard walkthrough and 20 minutes of conversation.</p>

<h2 style="color: #1a365d; font-size: 16px; margin-top: 22px;">Your 8-minute dashboard script</h2>
<p>Practice this out loud Sunday until it flows. Tight, business first, no tool jargon.</p>

<p><strong>1. Open with the punchline before the dashboard is on screen (90 seconds).</strong></p>
<p style="background: #f7fafc; border-left: 4px solid #1a365d; padding: 12px 16px; margin: 8px 0; font-style: italic; color: #2d3748;">
Before I open the report, let me tell you what I found. The portfolio is in serious cost trouble. About $37M overrun on $74M actual. But schedule is on track. The whole story is in one number: 141-day average site delay between kick-off and construction start. The cost bleed is in mobilization, not execution. That is where I would put intervention dollars.
</p>

<p><strong>2. Open Page 1.</strong> Walk through the 4 KPIs in 90 seconds. Do not read them. Interpret them.</p>

<p><strong>3. Click into Page 2.</strong> Pick one project, walk through it in 90 seconds. Use the project as evidence for the mobilization-delay thesis.</p>

<p><strong>4. Close (60 seconds).</strong></p>
<p style="background: #f7fafc; border-left: 4px solid #1a365d; padding: 12px 16px; margin: 8px 0; font-style: italic; color: #2d3748;">
In v2 I would add an exception alerts panel for any project with CPI below 0.7. Auto-email the project manager weekly until it is resolved. That is where this dashboard becomes operational, not just informational.
</p>

<p>Total: 6 to 7 minutes. Leaves 20 plus for actual conversation. That is what they want.</p>

<h2 style="color: #1a365d; font-size: 16px; margin-top: 22px;">Three stories to have loaded</h2>
<p>Senior interviews always include behavioral questions. Have one ready for each, 90 seconds each, STAR format (Situation, Task, Action, Result).</p>

<ol>
<li><strong>"Tell me about a time you found insight in messy data."</strong> Pick a real one where you connected two metrics nobody else had connected. End with the business outcome ($X saved, decision changed, headcount reallocated).</li>
<li><strong>"Tell me about a time you pushed back on a stakeholder."</strong> This is the senior versus mid-level question. Junior analysts build what they are asked. Senior analysts say "the question you are asking is the wrong question, here is the right one." Have a story where you reframed the ask and the stakeholder thanked you for it.</li>
<li><strong>"Tell me about a time you mentored or unblocked someone."</strong> Senior roles include scope beyond your own deliverable. Even a story about a junior teammate or a peer counts.</li>
</ol>

<h2 style="color: #1a365d; font-size: 16px; margin-top: 22px;">"Tell me about yourself" answer</h2>
<p>60 seconds, no longer. Structure:</p>
<ul>
<li>10 sec: where you are now</li>
<li>20 sec: the journey that got you here (skip childhood, school, anything pre-data)</li>
<li>20 sec: what you have built, shipped, or changed in the last 2 to 3 years</li>
<li>10 sec: why this role specifically (tie to their company or mission, not generic)</li>
</ul>
<p>Practice it out loud three times Sunday. Most candidates lose 5 minutes wandering through their resume. You will lose the room.</p>

<h2 style="color: #1a365d; font-size: 16px; margin-top: 22px;">Senior-fit questions they will ask</h2>
<ul>
<li><strong>"What would you do in your first 90 days?"</strong> Listen and learn weeks 1 to 4. Audit existing reports and data quality weeks 4 to 8. Ship the first high-impact dashboard week 8 to 12. Do not try to change anything in week 1.</li>
<li><strong>"What is your weakness?"</strong> Pick a real one with a real fix in progress. Never the fake "I am a perfectionist."</li>
<li><strong>"Why are you leaving / why looking?"</strong> Forward facing, never bad-mouth current employer.</li>
<li><strong>"What is your salary expectation?"</strong> Bay Area senior data analyst or BI is $150K to $220K base, total comp often $180K to $280K with equity or bonus. Do not undershoot. If you say $120K they will either think you are junior or they will save $80K. Give a range with the bottom at $160K and say "depending on total comp structure."</li>
</ul>

<h2 style="color: #1a365d; font-size: 16px; margin-top: 22px;">Questions YOU ask back</h2>
<p>Senior candidates ask better questions than mid-level ones. Pick 3:</p>
<ul>
<li>What does success look like 6 months in this role?</li>
<li>What is the most painful reporting gap on the team right now?</li>
<li>How does this team interact with engineering, data engineering, and finance? Where are the seams?</li>
<li>If you could change one thing about how analytics gets done here, what would it be?</li>
<li>What does the career path look like? Is this an IC track or eventually a lead or manager track?</li>
</ul>
<p>The "where are the seams" question is gold. It signals you understand cross-functional friction, which is half of being senior.</p>

<h2 style="color: #1a365d; font-size: 16px; margin-top: 22px;">Camera and delivery</h2>
<ul>
<li>Light from the front (window or lamp), not from behind</li>
<li>Camera at eye level. Stack books under the laptop if needed</li>
<li>Earbuds or headset, not speakers, for audio quality</li>
<li>Plain or clean background. No roommates, dishes, or unmade bed visible</li>
<li>Test Teams on the laptop you will use. Sunday night, not Monday morning</li>
<li>Have the .pbix already open behind Teams. One Alt-Tab to share screen</li>
<li>Glass of water within reach. You will need it around minute 15</li>
</ul>

<h2 style="color: #1a365d; font-size: 16px; margin-top: 22px;">The 30 minutes after the call</h2>
<p>Send a thank-you email within 2 hours. Three sentences:</p>
<ul>
<li>Thanks for the time</li>
<li>One specific thing you took away from the conversation (proves you listened)</li>
<li>One concrete reason you are excited about the role</li>
</ul>
<p>No restating your qualifications. Short and specific wins.</p>

<h2 style="color: #1a365d; font-size: 16px; margin-top: 22px;">Bay Area senior tier reality check</h2>
<p>They are investing $200K plus in this hire. They are not testing whether you can use Power BI. They assume you can. They are testing whether you can talk to executives, partner with engineering, mentor juniors, and own a function. Show up as the person they would want in the room with the CFO. That is the bar.</p>

<p>You have the technical chops. The case study landed clean. The interview is now about presence. Sleep well Sunday. Eat before the call. You have got this.</p>

<p>Cheering for you,</p>
<p>Ali</p>

${SIG_HTML}

</div>`;

const TEXT = `Milad,

Congrats on clearing the screen. This Monday is a hiring manager interview, not a technical one, so the prep is different. Read this once tonight and again Monday morning.

THE FRAME
30 minutes, Teams, senior role, Bay Area. The hiring manager is not testing whether you can build a dashboard. He is testing three things: can you think strategically, can you communicate at his level, and do you fit the team. Plan on 8-10 min of dashboard, 20 min of conversation.

YOUR 8-MINUTE DASHBOARD SCRIPT

1. Open with the punchline (90 sec, before dashboard is on screen):
"Before I open the report, let me tell you what I found. The portfolio is in serious cost trouble. About $37M overrun on $74M actual. But schedule is on track. The whole story is in one number: 141-day average site delay between kick-off and construction start. The cost bleed is in mobilization, not execution. That is where I would put intervention dollars."

2. Open Page 1. Walk through 4 KPIs in 90 sec. Interpret, do not read.
3. Click Page 2. Pick one project, 90 sec. Use it as evidence for the mobilization thesis.
4. Close (60 sec):
"In v2 I would add an exception alerts panel for any project with CPI below 0.7. Auto-email the PM weekly until resolved. That is where this becomes operational, not informational."

Total 6-7 min. Leaves 20+ for conversation. That is what they want.

THREE STORIES TO HAVE LOADED (STAR format, 90 sec each)
1. "Tell me about a time you found insight in messy data." End with business outcome.
2. "Tell me about a time you pushed back on a stakeholder." Reframing the ask. Senior vs mid signal.
3. "Tell me about a time you mentored or unblocked someone." Scope beyond your own deliverable.

"TELL ME ABOUT YOURSELF" (60 sec)
- 10s where you are now
- 20s journey that got you here (skip pre-data)
- 20s what you shipped in last 2-3 years
- 10s why this role specifically

Practice 3 times Sunday.

SENIOR-FIT QUESTIONS
- First 90 days: listen weeks 1-4, audit 4-8, ship 8-12. Do not try to change anything in week 1.
- Weakness: real one with real fix in progress. Never the fake "I am a perfectionist."
- Why looking: forward facing, never bad-mouth current employer.
- Salary: Bay Area senior BI is $150K-$220K base, $180K-$280K total. Do not undershoot. Floor your range at $160K, say "depending on total comp structure."

YOUR QUESTIONS BACK (pick 3)
- What does success look like 6 months in this role?
- What is the most painful reporting gap on the team right now?
- How does this team interact with engineering and finance? Where are the seams?
- If you could change one thing about how analytics gets done here, what would it be?
- IC track or eventually lead/manager?

"Where are the seams" is gold. Signals you understand cross-functional friction.

CAMERA AND DELIVERY
- Light from front, not behind
- Camera at eye level
- Earbuds or headset, not speakers
- Plain clean background
- Test Teams Sunday night, not Monday morning
- .pbix open behind Teams, one Alt-Tab to share
- Water within reach

30 MIN AFTER THE CALL
Send thank-you within 2 hours. Three sentences:
- Thanks for the time
- One specific takeaway (proves you listened)
- One concrete reason you are excited about the role

BAY AREA SENIOR REALITY CHECK
They are investing $200K plus. They are not testing whether you can use Power BI. They are testing whether you can talk to execs, partner with engineering, mentor juniors, own a function. Show up as the person they would want in the room with the CFO.

You have the technical chops. The case study landed clean. The interview is about presence now. Sleep well Sunday. Eat before the call. You have got this.

Cheering for you,
Ali

${SIG_TEXT}`;

(async () => {
  // 1. Create the BC todo to track the coaching
  const todo = (await axios.post(
    `https://3.basecampapi.com/3945211/buckets/${ALI_PERSONAL_BUCKET}/todolists/${AI_PRODUCTS_LIST_ID}/todos.json`,
    {
      content: 'Milad Gerami - Bay Area senior BI interview prep (Mon 6/8)',
      description: '<div>Milad has a 30-min hiring manager interview Monday 6/8 (between 7am-12pm or 1-3pm PST) for a senior BI role in the Bay Area. Already passed the case study screen. Sent prep email covering dashboard script, behavioral stories, salary range ($160K floor), questions to ask, camera setup, thank-you template.</div>',
      due_on: '2026-06-08',
      assignee_ids: [ALI_USER_ID],
    },
    { headers: BC_HEADERS }
  )).data;
  console.log('BC todo created:', todo.app_url);

  // 2. Send email attached to that todo
  const r = await sendWithBcAttach({
    ticketId: todo.id,
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'eng.miladgerami@gmail.com',
    bcc: ['alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Monday interview prep - read Sun + Mon AM',
    html: HTML,
    text: TEXT,
    bcSummary: '<p>Sent Milad the prep email for his Monday 6/8 hiring manager interview (Bay Area senior BI). Covers: 8-minute dashboard script with the mobilization-delay thesis as the opening punchline, three STAR-format behavioral stories to load, "tell me about yourself" structure, first 90 days answer, salary expectation framing ($160K floor for Bay Area senior), 5 questions to ask back (the "where are the seams" question highlighted), camera/Teams setup, thank-you email template. Emphasized this is a hiring manager interview not a technical one, so 20 of the 30 minutes should be conversation, not dashboard tour.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC attach:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.response?.data || e.stack || e.message); process.exit(1); });
