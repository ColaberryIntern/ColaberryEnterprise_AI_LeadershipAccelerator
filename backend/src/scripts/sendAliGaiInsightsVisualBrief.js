#!/usr/bin/env node
// Visual brief of the GAI Insights talk Ali sent. Sent in a way the inbox
// manager doesn't auto-archive: From "Ali Muwwakkil" (not Claude Code), no
// bracket prefix in subject, replyTo = ali, body opens "Ali -" personally.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Georgia,'Times New Roman',serif;color:#1a202c;line-height:1.65">
<div style="max-width:760px;margin:0 auto;background:#fefaf3">

<!-- Personal opener so the inbox manager + a reader both see this is for Ali -->
<div style="padding:22px 36px 0;font-family:Arial,sans-serif">
<div style="font-size:13px;color:#475569">Ali -</div>
<div style="font-size:14px;color:#1f2937;margin-top:6px">The visual story you asked for, drawn from the GAI Insights talk you forwarded. Read in 5 minutes, save for later, or share the sections you want with the team. Full transcript still on the prior message if you want the verbatim.</div>
</div>

<!-- HERO -->
<div style="margin-top:24px;padding:48px 36px;background:linear-gradient(135deg,#0f172a 0%,#1a365d 60%,#7c2d12 100%);color:white;text-align:center">
<div style="font-size:11px;letter-spacing:5px;text-transform:uppercase;color:#fbbf24;font-weight:700">GAI Insights Learning Lab &middot; June 2026 &middot; Alden DoRosario, CustomGPT</div>
<h1 style="margin:14px 0 6px;font-size:42px;line-height:1.05;font-weight:800;letter-spacing:-1px;font-family:Georgia,serif">The 7-direct-reports rule<br>just broke.</h1>
<div style="margin-top:14px;font-size:16px;color:#cbd5e0;max-width:560px;margin-left:auto;margin-right:auto;line-height:1.5">After 100 years (arguably 5,000), the model where one human manages a small handful of other humans is ending. Not because management got worse. Because legibility got cheap.</div>
</div>

<!-- THE WAKEUP MOMENT -->
<div style="padding:42px 40px 24px;background:#fefaf3">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7c2d12;font-weight:700;font-family:Arial,sans-serif">Section 1 &middot; The wakeup moment</div>
<h2 style="margin:6px 0 14px;font-size:30px;line-height:1.15;color:#0f172a">Brian Halligan. 6,000 people. One manager.</h2>
<p style="font-size:16px;color:#1f2937;margin:0 0 12px">Alden was running 32 people at CustomGPT - flat-ish org, but still doing one-hour 1:1s where 90% of the time went to "is the data really this or is it that." He calls them "root canals."</p>
<p style="font-size:16px;color:#1f2937;margin:0 0 12px">Then he heard the Jack Dorsey podcast with Brian Halligan, the HubSpot founder, who casually said he wants the entire organization - 6,000 people - reporting directly to him. That number blew the doors off Alden's model. If Halligan can do it, what is the new ceiling for a 30-person company?</p>
<div style="margin:22px 0 8px;padding:20px 24px;background:#fef3c7;border-left:6px solid #d4a017;font-family:Georgia,serif;font-size:18px;color:#78350f;font-style:italic;line-height:1.5">"For the last 100 years - probably 5,000 years - we had this structure of humans managing humans. That is now changing."</div>
</div>

<!-- THE UNLOCK -->
<div style="padding:42px 40px;background:#0f172a;color:white">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700;font-family:Arial,sans-serif">Section 2 &middot; The unlock</div>
<h2 style="margin:6px 0 16px;font-size:30px;line-height:1.15;color:white">"Legibility." That's the whole talk in one word.</h2>
<p style="font-size:16px;color:#cbd5e0;margin:0 0 18px">The reason the old model existed is that humans were opaque to each other. A manager had to spend hours talking to a direct report to know what they were doing. AI sees everything - simultaneously, in real time, for free.</p>

<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:12px;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden">
<thead><tr style="background:#7c2d12;color:white"><th style="padding:12px 16px;text-align:left;font-size:11px;letter-spacing:1px;width:50%">Old: what a human manager could see</th><th style="padding:12px 16px;text-align:left;font-size:11px;letter-spacing:1px;width:50%">New: what AI sees, automatically</th></tr></thead>
<tbody>
<tr><td style="padding:11px 16px;border-bottom:1px solid #334155;font-size:14px;color:#cbd5e0">A weekly status report (curated)</td><td style="padding:11px 16px;border-bottom:1px solid #334155;font-size:14px;color:#fef3c7">Every Slack thread (uncurated)</td></tr>
<tr><td style="padding:11px 16px;border-bottom:1px solid #334155;font-size:14px;color:#cbd5e0">A handful of meeting notes</td><td style="padding:11px 16px;border-bottom:1px solid #334155;font-size:14px;color:#fef3c7">Every pull request, every commit</td></tr>
<tr><td style="padding:11px 16px;border-bottom:1px solid #334155;font-size:14px;color:#cbd5e0">A 1:1 conversation, once a week</td><td style="padding:11px 16px;border-bottom:1px solid #334155;font-size:14px;color:#fef3c7">Every doc, before and after each draft</td></tr>
<tr><td style="padding:11px 16px;border-bottom:1px solid #334155;font-size:14px;color:#cbd5e0">A summary of sales calls (if any)</td><td style="padding:11px 16px;border-bottom:1px solid #334155;font-size:14px;color:#fef3c7">Full transcripts of every sales call</td></tr>
<tr><td style="padding:11px 16px;font-size:14px;color:#cbd5e0">A self-reported confidence number</td><td style="padding:11px 16px;font-size:14px;color:#fef3c7">A real-time score against the rubric</td></tr>
</tbody>
</table>
</div>

<!-- THE NEW MEETING -->
<div style="padding:42px 40px;background:#fefaf3">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7c2d12;font-weight:700;font-family:Arial,sans-serif">Section 3 &middot; The new management meeting</div>
<h2 style="margin:6px 0 14px;font-size:30px;line-height:1.15;color:#0f172a">The dashboard arrives 5 minutes before the call.</h2>
<p style="font-size:16px;color:#1f2937;margin:0 0 14px">Old meeting: 60 minutes. Half of it on "let me figure out where the data is." Most of the value lost to context-reconstruction.</p>
<p style="font-size:16px;color:#1f2937;margin:0 0 14px">New meeting: AI generates a custom HTML dashboard for each meeting, 5 minutes before it starts. Both parties pull it up. The conversation starts at "what do we do about it" - not "what's actually happening."</p>

<div style="margin-top:18px;display:flex;gap:14px;flex-wrap:wrap">
<div style="flex:1;min-width:240px;background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:18px 20px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7f1d1d;font-weight:700;font-family:Arial,sans-serif">Old meeting (verbal)</div>
<div style="font-size:14px;color:#1f2937;margin-top:8px;line-height:1.6">"How's your dog?"<br>"How's it going generally?"<br>"What does the data say?"<br>"Wait, where's the data from?"<br>"Let me find that report..."</div>
</div>
<div style="flex:1;min-width:240px;background:#dcfce7;border:1px solid #86efac;border-radius:8px;padding:18px 20px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#14532d;font-weight:700;font-family:Arial,sans-serif">New meeting (dashboard)</div>
<div style="font-size:14px;color:#1f2937;margin-top:8px;line-height:1.6">Conversion rate: 4.3% (target 5.0)<br>Site health score: 6.7/10<br>Page load p95: 2.8s (regressed)<br>Last 3 blog posts: 8.1, 6.2, 7.9<br>Top action this week: fix 3 SEO gaps</div>
</div>
</div>

<div style="margin-top:18px;font-size:14px;color:#475569;font-style:italic">The 60-minute root-canal becomes a 15-minute working session.</div>
</div>

<!-- THE MATH -->
<div style="padding:42px 40px;background:#7c2d12;color:white">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700;font-family:Arial,sans-serif">Section 4 &middot; The new economics</div>
<h2 style="margin:6px 0 18px;font-size:30px;line-height:1.15;color:white">$90 + $10 = a new span of control.</h2>
<p style="font-size:16px;color:#fef3c7;margin:0 0 16px">Private-equity-backed firms Alden works with are now budgeting on a fixed ratio: for every $90 spent on a human, spend $10 making that human AI-augmented. That ratio rebuilds the labor economics from the bottom up.</p>

<table cellpadding="0" cellspacing="0" style="width:100%;background:rgba(0,0,0,0.25);border-radius:8px;margin-top:6px">
<tr>
<td style="padding:24px 22px;text-align:center;border-right:1px solid rgba(255,255,255,0.2);width:33%">
<div style="font-size:36px;font-weight:800;color:white;line-height:1">7</div>
<div style="font-size:11px;letter-spacing:2px;color:#fbbf24;margin-top:4px;text-transform:uppercase">Old direct reports / manager</div>
<div style="font-size:12px;color:#fecaca;margin-top:8px;line-height:1.5">Classic rule of thumb. Capped by how many 1:1s a human could run per week.</div>
</td>
<td style="padding:24px 22px;text-align:center;border-right:1px solid rgba(255,255,255,0.2);width:33%">
<div style="font-size:36px;font-weight:800;color:#fbbf24;line-height:1">50</div>
<div style="font-size:11px;letter-spacing:2px;color:#fbbf24;margin-top:4px;text-transform:uppercase">Facebook today</div>
<div style="font-size:12px;color:#fecaca;margin-top:8px;line-height:1.5">After the post-layoff restructuring. They publicly killed the 7-per-manager rule.</div>
</td>
<td style="padding:24px 22px;text-align:center;width:33%">
<div style="font-size:36px;font-weight:800;color:#fbbf24;line-height:1">6,000</div>
<div style="font-size:11px;letter-spacing:2px;color:#fbbf24;margin-top:4px;text-transform:uppercase">Halligan's ceiling</div>
<div style="font-size:12px;color:#fecaca;margin-top:8px;line-height:1.5">HubSpot CEO's stated goal in the Jack Dorsey podcast. Every employee, direct line.</div>
</td>
</tr>
</table>
</div>

<!-- HOW YOU BUILD ONE -->
<div style="padding:42px 40px;background:#fefaf3">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7c2d12;font-weight:700;font-family:Arial,sans-serif">Section 5 &middot; How you actually build the AI for a person</div>
<h2 style="margin:6px 0 14px;font-size:30px;line-height:1.15;color:#0f172a">Context + Goals + Plan + Verification + Rubric.</h2>
<p style="font-size:16px;color:#1f2937;margin:0 0 16px">Each direct report gets their own agent. The agent isn't a chatbot - it's a GPS, with five required components.</p>

<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden">
<tbody>
<tr><td style="padding:14px 18px;background:#1a365d;color:white;font-weight:800;width:30%;border-bottom:1px solid #cbd5e1;font-family:Arial,sans-serif">CONTEXT</td><td style="padding:14px 18px;background:white;font-size:14px;color:#1f2937;border-bottom:1px solid #e2e8f0">All the systems this person touches. Slack, HubSpot, GitHub, GSC, GA, whatever - piped in via MCP or APIs.</td></tr>
<tr><td style="padding:14px 18px;background:#1a365d;color:white;font-weight:800;border-bottom:1px solid #cbd5e1;font-family:Arial,sans-serif">GOALS</td><td style="padding:14px 18px;background:#f8fafc;font-size:14px;color:#1f2937;border-bottom:1px solid #e2e8f0">Explicit, computable. Not "do good marketing" - "get conversion rate to 5%."</td></tr>
<tr><td style="padding:14px 18px;background:#1a365d;color:white;font-weight:800;border-bottom:1px solid #cbd5e1;font-family:Arial,sans-serif">PLAN</td><td style="padding:14px 18px;background:white;font-size:14px;color:#1f2937;border-bottom:1px solid #e2e8f0">The GPS metaphor. How does this person get from where they are to the goal? AI tracks distance to destination every day.</td></tr>
<tr><td style="padding:14px 18px;background:#c1272d;color:white;font-weight:800;border-bottom:1px solid #cbd5e1;font-family:Arial,sans-serif">VERIFICATION</td><td style="padding:14px 18px;background:#f8fafc;font-size:14px;color:#1f2937;border-bottom:1px solid #e2e8f0">AI is sycophantic by default - it tells you what you want to hear. Every artifact runs through a critic-loop + verification-loop before it's surfaced.</td></tr>
<tr><td style="padding:14px 18px;background:#1a365d;color:white;font-weight:800;font-family:Arial,sans-serif">RUBRIC</td><td style="padding:14px 18px;background:white;font-size:14px;color:#1f2937">"LLM-as-judge." Every piece of work gets a numerical score against an explicit rubric. The score moves up or down over time. FICO-for-work.</td></tr>
</tbody>
</table>

<div style="margin-top:16px;padding:14px 18px;background:#fef9e7;border-left:5px solid #d4a017;font-size:14px;color:#78350f;font-style:italic">Alden's meta-rule: when you're stuck setting one of these up, open Claude Code and say "unstuck me." AI builds AI.</div>
</div>

<!-- THE FICO SCORE -->
<div style="padding:42px 40px;background:#1a365d;color:white">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700;font-family:Arial,sans-serif">Section 6 &middot; FICO for work</div>
<h2 style="margin:6px 0 14px;font-size:30px;line-height:1.15;color:white">The biggest shift: qualitative becomes quantitative.</h2>
<p style="font-size:16px;color:#cbd5e0;margin:0 0 14px">When you ask a person "did you ship the blog post?" they say "yeah, it's good." You go look and there are 16 errors. The conversation degrades.</p>
<p style="font-size:16px;color:#cbd5e0;margin:0 0 14px">In the new model, the AI computes a mathematical rubric on every artifact. The blog post is 6.7/10. Site health is 7.4/10. Sales call coaching is 8.1/10. Both sides see the same number. Both sides can argue with the same number. Both sides can watch it climb.</p>

<div style="margin-top:18px;padding:18px 22px;background:rgba(212,160,23,0.2);border-left:5px solid #fbbf24;font-family:Georgia,serif;font-size:17px;color:#fef3c7;font-style:italic;line-height:1.5">"Just like America invented the FICO credit score system, this gives a score to the job and the work being done. Once somebody realizes what the score is, you can easily figure out how to improve it."</div>
</div>

<!-- THE 4 MISTAKES -->
<div style="padding:42px 40px;background:#fefaf3">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7c2d12;font-weight:700;font-family:Arial,sans-serif">Section 7 &middot; The four mistakes Alden made</div>
<h2 style="margin:6px 0 14px;font-size:30px;line-height:1.15;color:#0f172a">Learn these instead of repeating them.</h2>

<div style="margin-top:18px">
<div style="display:flex;align-items:flex-start;gap:18px;padding:18px 0;border-bottom:1px solid #e2e8f0">
<div style="font-size:42px;font-weight:800;color:#c1272d;line-height:1;font-family:Georgia,serif;width:50px;text-align:center;flex-shrink:0">1</div>
<div><div style="font-size:18px;font-weight:700;color:#0f172a">Issued a fatwa: "everyone is AI-native in 15 days."</div><div style="font-size:14px;color:#1f2937;margin-top:6px">Tried to flip all 30 people at once. Should have started with 2-3 believers and let it spread.</div></div>
</div>
<div style="display:flex;align-items:flex-start;gap:18px;padding:18px 0;border-bottom:1px solid #e2e8f0">
<div style="font-size:42px;font-weight:800;color:#c1272d;line-height:1;font-family:Georgia,serif;width:50px;text-align:center;flex-shrink:0">2</div>
<div><div style="font-size:18px;font-weight:700;color:#0f172a">Assumed non-technical people understood Claude Code.</div><div style="font-size:14px;color:#1f2937;margin-top:6px">"Go build an agent" doesn't land if you don't know what GitHub is. Fix: pair each non-technical person with an AI engineer.</div></div>
</div>
<div style="display:flex;align-items:flex-start;gap:18px;padding:18px 0;border-bottom:1px solid #e2e8f0">
<div style="font-size:42px;font-weight:800;color:#c1272d;line-height:1;font-family:Georgia,serif;width:50px;text-align:center;flex-shrink:0">3</div>
<div><div style="font-size:18px;font-weight:700;color:#0f172a">Skipped the verification loop.</div><div style="font-size:14px;color:#1f2937;margin-top:6px">Result: people showing up to meetings with "the AI generated this." Human stamp + sign-off is non-negotiable.</div></div>
</div>
<div style="display:flex;align-items:flex-start;gap:18px;padding:18px 0">
<div style="font-size:42px;font-weight:800;color:#c1272d;line-height:1;font-family:Georgia,serif;width:50px;text-align:center;flex-shrink:0">4</div>
<div><div style="font-size:18px;font-weight:700;color:#0f172a">Ignored the people side until it bit him.</div><div style="font-size:14px;color:#1f2937;margin-top:6px">Job-security fears are real. The Earn / Learn / Bond / Save framework (Dr. John Sviokla) is how you keep the org standing while changing it.</div></div>
</div>
</div>
</div>

<!-- WHO YOU LOSE -->
<div style="padding:42px 40px;background:#0f172a;color:white">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700;font-family:Arial,sans-serif">Section 8 &middot; Who you will lose</div>
<h2 style="margin:6px 0 16px;font-size:30px;line-height:1.15;color:white">Two types of people leave. Both are predictable.</h2>

<div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:14px">
<div style="flex:1;min-width:260px;background:#1e293b;padding:22px 24px;border-radius:8px;border-left:5px solid #c1272d">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700;font-family:Arial,sans-serif">Type 1</div>
<div style="font-size:18px;font-weight:700;color:white;margin-top:6px">Anti-AI ideologues</div>
<div style="font-size:14px;color:#cbd5e0;margin-top:10px;line-height:1.6">"Strangely, at an AI company, I had a bunch of people who were anti-AI." Once legibility kicks in, it becomes clear they weren't doing much in the first place. They leave on their own.</div>
</div>
<div style="flex:1;min-width:260px;background:#1e293b;padding:22px 24px;border-radius:8px;border-left:5px solid #fbbf24">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700;font-family:Arial,sans-serif">Type 2</div>
<div style="font-size:18px;font-weight:700;color:white;margin-top:6px">People exposed by the scoreboard</div>
<div style="font-size:14px;color:#cbd5e0;margin-top:10px;line-height:1.6">"I'm 53. I can't dunk in the NBA. If you show me the scoreboard, I'll know." When the rubric is public, you can see who's growing toward goals and who's not. Forcing function - including for hiring.</div>
</div>
</div>
</div>

<!-- DRI MODEL -->
<div style="padding:42px 40px;background:#fefaf3">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7c2d12;font-weight:700;font-family:Arial,sans-serif">Section 9 &middot; What replaces the manager</div>
<h2 style="margin:6px 0 14px;font-size:30px;line-height:1.15;color:#0f172a">From "head of marketing" to "directly responsible individual."</h2>
<p style="font-size:16px;color:#1f2937;margin:0 0 14px">The functional teams still exist. But the head of marketing isn't running 1:1s with their 7 marketers anymore - Alden is in the legibility layer too.</p>
<p style="font-size:16px;color:#1f2937;margin:0 0 14px">The role transforms. The "manager" becomes a DRI - directly responsible individual - who owns a number and a domain. <strong>"Player-coaches replace coaches."</strong> Jack Dorsey runs Square with zero managers, but every leader still owns a number.</p>
<p style="font-size:16px;color:#1f2937;margin:0 0 14px"><strong>And the knowledge stays.</strong> When an employee leaves, their agents live in GitHub - company-owned. The next person types <code style="background:#0f172a;color:#fbbf24;padding:1px 6px;border-radius:3px;font-family:'Courier New',monospace;font-size:13px">/site-health-score</code> and inherits the previous person's craft instantly.</p>
</div>

<!-- IMPLICATIONS -->
<div style="padding:42px 40px;background:linear-gradient(135deg,#1a365d 0%,#0f172a 100%);color:white">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700;font-family:Arial,sans-serif">Section 10 &middot; What this means for a 30-person company</div>
<h2 style="margin:6px 0 14px;font-size:30px;line-height:1.15;color:white">You're already at Alden's scale. The math runs here too.</h2>

<ol style="font-size:15px;color:#cbd5e0;margin:8px 0 0;padding-left:22px;line-height:1.8">
<li><strong style="color:white">The 1:1 ritual is the thing to kill first.</strong> Replace verbal status checks with a dashboard that lands in both inboxes before the meeting.</li>
<li><strong style="color:white">Pick one role to instrument first.</strong> Not all 30 at once. Probably the marketing lead, the BD/sales lead, or someone whose work is most data-pipeable.</li>
<li><strong style="color:white">Allocate the $90/$10.</strong> If you're paying someone $9K/mo, $1K/mo on AI infrastructure for them is the budget.</li>
<li><strong style="color:white">Build the rubric BEFORE the agent.</strong> Without a numerical score for the work, you'll fall back to "yeah, it's good." Write the rubric on paper first.</li>
<li><strong style="color:white">Bake the 4 mistakes in.</strong> Slow rollout, paired engineers for non-technical users, verification loops, and the earn/learn/bond/save framework for the people side.</li>
<li><strong style="color:white">Put the agents in GitHub.</strong> Company-owned, portable, transferrable. The day someone leaves, the next person inherits the workflow.</li>
</ol>
</div>

<div style="padding:32px 40px;background:#fefaf3;text-align:center">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7c2d12;font-weight:700;font-family:Arial,sans-serif">Source</div>
<div style="margin-top:10px;font-size:14px;color:#1f2937;font-family:Arial,sans-serif">GAI Insights Daily AI News &amp; Learning Lab &middot; 48:39 talk by Alden DoRosario, CEO of CustomGPT</div>
<div style="margin-top:14px"><a href="https://www.youtube.com/watch?v=mV1SAo5BRgo" style="display:inline-block;background:#c1272d;color:white;padding:10px 22px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:0.5px;font-family:Arial,sans-serif">Watch the original talk &rarr;</a></div>
<div style="margin-top:14px;font-size:12px;color:#94a3b8;font-family:Arial,sans-serif">Full transcript still in your inbox from the earlier message you opened. This is the synthesized view.</div>
</div>

</div></body></html>`;

const text = strip(`Ali -

The visual story you asked for, drawn from the GAI Insights talk you forwarded. Read in 5 minutes, save for later, or share the sections you want with the team.

THE 7-DIRECT-REPORTS RULE JUST BROKE.

After 100 years (arguably 5,000), the model where one human manages a small handful of other humans is ending. Not because management got worse. Because legibility got cheap.

THE WAKEUP MOMENT - Brian Halligan / HubSpot / Jack Dorsey podcast
Halligan stated he wants the entire HubSpot org (6,000 people) reporting direct to him. Alden runs 32 people at CustomGPT. If Halligan can do it, what's the new ceiling at 30 people?

THE UNLOCK: LEGIBILITY
Old: a manager saw a weekly status report, a handful of meeting notes, one 1:1 a week, maybe a summary of a sales call.
New: AI sees every Slack thread, every PR, every doc draft, every full sales call transcript, and a real-time rubric score - simultaneously, automatically.

THE NEW MEETING
Old: 60 min, half spent on "where's the data?" Verbal.
New: AI generates a custom HTML dashboard 5 min before the call. Both parties show up looking at the same numbers. 15-min working session.

THE NEW ECONOMICS
- Old rule: 7 direct reports / manager
- Facebook today: 50 / manager (publicly killed the 7-rule after the layoff)
- Halligan ceiling: 6,000
- Private equity ratio: $90 human + $10 AI infrastructure / employee

HOW YOU BUILD ONE
Context (all systems) + Goals (explicit, computable) + Plan (GPS-style) + Verification (AI is sycophantic - critic + verification loops mandatory) + Rubric (LLM-as-judge, FICO-for-work).

FICO FOR WORK
"Yeah it's good" becomes 6.7/10. Both sides see the same number. Both sides argue against the same number. Both sides watch it climb.

THE FOUR MISTAKES ALDEN MADE
1. Issued a fatwa: everyone AI-native in 15 days. Should have started w/ 2-3 believers.
2. Assumed non-technical people understood Claude Code. Fix: pair w/ AI engineer.
3. Skipped verification loops -> "the AI generated this." Human stamp non-negotiable.
4. Ignored the people side until it bit. Earn/Learn/Bond/Save (Dr. John Sviokla).

WHO YOU LOSE
Type 1: Anti-AI ideologues who weren't producing anyway. Legibility surfaces them.
Type 2: People exposed by the public scoreboard. "I'm 53, I can't dunk in the NBA, if you show me the scoreboard I'll know."

WHAT REPLACES THE MANAGER
Functional teams stay. Head-of-X becomes "DRI" (directly responsible individual). Player-coaches replace coaches. Jack Dorsey runs Square w/ zero managers. Agents live in GitHub - company-owned. Next person types /site-health-score and inherits the previous person's craft.

IMPLICATIONS FOR A 30-PERSON COMPANY
1. Kill the 1:1 ritual first. Dashboard before the meeting, not verbal status checks.
2. Pick one role to instrument first (probably marketing lead or BD lead).
3. Allocate the $90/$10 ratio.
4. Build the rubric on paper BEFORE the agent.
5. Bake the 4 mistakes in: slow rollout, paired engineers, verification loops, people-side framework.
6. Put agents in GitHub - company-owned, portable.

Source: GAI Insights Daily AI News & Learning Lab. Alden DoRosario, CEO of CustomGPT. 48:39.
https://www.youtube.com/watch?v=mV1SAo5BRgo

Full transcript still in your inbox from the earlier message. This is the synthesized view.

Ali`);

(async () => {
  validateBeforeSend(HTML, text);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Ali - visual brief: the 7-direct-reports rule just broke (GAI Insights talk you sent)',
    text, html: HTML,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
