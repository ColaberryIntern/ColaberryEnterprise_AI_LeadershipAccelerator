#!/usr/bin/env node
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const HTML_BODY = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tonight's training - tap once, watch</title></head>
<body style="margin:0;padding:0;background:#f7fafc;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7fafc"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;background:#fff;margin:16px 0">

<tr><td style="background:#1a365d;color:#fff;padding:24px 22px;text-align:center">
  <div style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#90cdf4;font-weight:700">🏟️ baseball + training</div>
  <h1 style="margin:8px 0 4px;font-size:24px;font-weight:800">Tap once. Watch on your phone.</h1>
  <div style="font-size:13px;color:#cbd5e0">Anthropic Academy + Claude Code track. Sign in once at top, then every link below opens straight into a course.</div>
</td></tr>

<tr><td style="padding:20px 22px">

<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 14px;border-radius:4px;font-size:13px;margin-bottom:18px">
<strong>📱 Sign in first (one time):</strong><br>
1. Open <a href="https://anthropic.skilljar.com/" style="color:#1a365d;font-weight:700">anthropic.skilljar.com</a><br>
2. Sign in with <strong>ali@colaberry.com</strong> (Google sign-in)<br>
3. Stay signed in. Every link below jumps right into the course.
</div>

<!-- TONIGHT -->
<div style="margin-top:6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a0aec0;font-weight:700">Tonight (due today 5/29)</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;background:#fff;border:2px solid #1a365d;border-radius:10px;margin-bottom:16px"><tr><td style="padding:16px">
<div style="font-size:18px;font-weight:800;color:#1a365d">Claude 101</div>
<div style="font-size:13px;color:#718096;margin:4px 0 14px">~30 min &middot; intro to Claude for everyday work</div>
<a href="https://anthropic.skilljar.com/claude-101" style="display:block;background:#1a365d;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:8px;font-size:16px;font-weight:700">▶️ Watch Claude 101 now</a>
</td></tr></table>

<!-- CLAUDE CODE SPECIFICALLY -->
<div style="margin-top:24px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a0aec0;font-weight:700">🎯 The Claude Code track (you can skip ahead)</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:10px"><tr><td style="padding:14px">
<div style="font-size:16px;font-weight:700;color:#1a365d">Claude Code 101</div>
<div style="font-size:12px;color:#718096;margin:4px 0 12px">~45 min &middot; due Sun 6/1 &middot; intro to Claude Code in dev workflows</div>
<a href="https://anthropic.skilljar.com/claude-code-101" style="display:block;background:#2b6cb0;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:6px;font-size:15px;font-weight:700">▶️ Watch Claude Code 101</a>
</td></tr></table>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:10px"><tr><td style="padding:14px">
<div style="font-size:16px;font-weight:700;color:#1a365d">★ Introduction to agent skills <span style="background:#1a365d;color:#fff;padding:2px 6px;border-radius:3px;font-size:10px;letter-spacing:1px">PARTNER-REQUIRED</span></div>
<div style="font-size:12px;color:#718096;margin:4px 0 12px">~30 min &middot; due Mon 6/2 &middot; building reusable Skills in Claude Code</div>
<a href="https://anthropic.skilljar.com/introduction-to-agent-skills" style="display:block;background:#2b6cb0;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:6px;font-size:15px;font-weight:700">▶️ Watch agent skills</a>
</td></tr></table>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:10px"><tr><td style="padding:14px">
<div style="font-size:16px;font-weight:700;color:#1a365d">Introduction to subagents</div>
<div style="font-size:12px;color:#718096;margin:4px 0 12px">~30 min &middot; due Wed 6/4 &middot; managing sub-agents for specialized workflows</div>
<a href="https://anthropic.skilljar.com/introduction-to-subagents" style="display:block;background:#2b6cb0;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:6px;font-size:15px;font-weight:700">▶️ Watch subagents</a>
</td></tr></table>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:10px"><tr><td style="padding:14px">
<div style="font-size:16px;font-weight:700;color:#1a365d">★ Claude Code in Action <span style="background:#1a365d;color:#fff;padding:2px 6px;border-radius:3px;font-size:10px;letter-spacing:1px">PARTNER-REQUIRED &middot; CAPSTONE</span></div>
<div style="font-size:12px;color:#718096;margin:4px 0 12px">~60 min &middot; due Thu 6/12 &middot; integrating Claude Code into dev processes</div>
<a href="https://anthropic.skilljar.com/claude-code-in-action" style="display:block;background:#1a365d;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:6px;font-size:15px;font-weight:700">▶️ Watch Claude Code in Action</a>
</td></tr></table>

<!-- SECONDARY -->
<div style="margin-top:24px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a0aec0;font-weight:700">Also in the foundational queue</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px"><tr><td style="padding:12px">
<div style="font-size:14px;font-weight:600;color:#1a365d">AI Capabilities and Limitations</div>
<div style="font-size:12px;color:#718096;margin:2px 0 10px">due Sat 5/30</div>
<a href="https://anthropic.skilljar.com/ai-capabilities-and-limitations" style="display:block;background:#4a5568;color:#fff;text-decoration:none;text-align:center;padding:12px;border-radius:6px;font-size:14px;font-weight:600">Watch</a>
</td></tr></table>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px"><tr><td style="padding:12px">
<div style="font-size:14px;font-weight:600;color:#1a365d">AI Fluency: Framework & Foundations</div>
<div style="font-size:12px;color:#718096;margin:2px 0 10px">due Sun 5/31</div>
<a href="https://anthropic.skilljar.com/ai-fluency-framework-foundations" style="display:block;background:#4a5568;color:#fff;text-decoration:none;text-align:center;padding:12px;border-radius:6px;font-size:14px;font-weight:600">Watch</a>
</td></tr></table>

<!-- TIPS -->
<div style="background:#ebf4ff;border-left:4px solid #2b6cb0;padding:14px 16px;border-radius:6px;margin-top:24px;font-size:13px">
<strong>🎬 Phone-friendly tips:</strong>
<ul style="margin:6px 0;padding-left:18px">
<li><strong>Speed up:</strong> tap the gear icon in the Skilljar player → playback speed 1.25x or 1.5x. Same retention, less time.</li>
<li><strong>Data warning:</strong> Skilljar streams HD by default. Tap gear → quality 720p to save data at the park.</li>
<li><strong>Mark complete from your phone:</strong> when done, open <a href="https://3.basecamp.com/3945211/buckets/47477101/todolists/9940690865">your Anthropic onboarding list on Basecamp</a> and check the box.</li>
<li><strong>Lost wifi?</strong> Skilljar buffers ahead - if you start a course on good signal it usually plays through even if you lose data.</li>
</ul>
</div>

<!-- ALL 18 -->
<div style="margin-top:24px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a0aec0;font-weight:700">If you finish those, all 18 in order</div>
<div style="background:#f7fafc;padding:14px;border-radius:8px;font-size:13px;margin-top:6px;line-height:1.7">
1. <a href="https://anthropic.skilljar.com/claude-101">Claude 101</a> (today)<br>
2. <a href="https://anthropic.skilljar.com/ai-capabilities-and-limitations">AI Capabilities + Limitations</a> (5/30)<br>
3. <a href="https://anthropic.skilljar.com/ai-fluency-framework-foundations">AI Fluency: Framework</a> (5/31)<br>
4. <a href="https://anthropic.skilljar.com/claude-code-101">Claude Code 101</a> (6/1)<br>
5. <a href="https://anthropic.skilljar.com/introduction-to-agent-skills">★ Agent skills</a> (6/2)<br>
6. <a href="https://anthropic.skilljar.com/introduction-to-claude-cowork">Claude Cowork</a> (6/3)<br>
7. <a href="https://anthropic.skilljar.com/introduction-to-subagents">Subagents</a> (6/4)<br>
8. <a href="https://anthropic.skilljar.com/claude-with-the-anthropic-api">★ Claude API</a> (6/5)<br>
9. <a href="https://anthropic.skilljar.com/ai-fluency-for-educators">AI Fluency: educators</a> (6/6)<br>
10. <a href="https://anthropic.skilljar.com/ai-fluency-for-students">AI Fluency: students</a> (6/7)<br>
11. <a href="https://anthropic.skilljar.com/teaching-ai-fluency">Teaching AI Fluency</a> (6/8)<br>
12. <a href="https://anthropic.skilljar.com/ai-fluency-for-nonprofits">AI Fluency: nonprofits</a> (6/8)<br>
13. <a href="https://anthropic.skilljar.com/introduction-to-model-context-protocol">★ MCP intro</a> (6/9)<br>
14. <a href="https://anthropic.skilljar.com/model-context-protocol-advanced-topics">MCP Advanced</a> (6/10)<br>
15. <a href="https://anthropic.skilljar.com/ai-fluency-for-small-businesses">AI Fluency: SMB</a> (6/10)<br>
16. <a href="https://anthropic.skilljar.com/claude-in-amazon-bedrock">Bedrock</a> (6/11)<br>
17. <a href="https://anthropic.skilljar.com/claude-with-google-vertex">Vertex</a> (6/11)<br>
18. <a href="https://anthropic.skilljar.com/claude-code-in-action">★ Claude Code in Action (capstone)</a> (6/12)
</div>

<div style="margin-top:24px;text-align:center">
<a href="https://3.basecamp.com/3945211/buckets/47477101/todolists/9940690865" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:14px;font-weight:700">📋 Open my course list on Basecamp</a>
</div>

</td></tr>

<tr><td style="background:#f7fafc;padding:16px 22px;text-align:center;font-size:11px;color:#718096;border-top:1px solid #e2e8f0">
Go get 'em. Watch Creed too. 🏏
</td></tr>

</table>
</td></tr></table>
</body></html>`;

const TEXT_BODY = `Tonight's Claude Code training - phone-ready

Sign in once: https://anthropic.skilljar.com/ with ali@colaberry.com

TONIGHT (5/29):
- Claude 101: https://anthropic.skilljar.com/claude-101 (30 min)

CLAUDE CODE TRACK:
- Claude Code 101 (6/1): https://anthropic.skilljar.com/claude-code-101
- Agent skills (★ 6/2): https://anthropic.skilljar.com/introduction-to-agent-skills
- Subagents (6/4): https://anthropic.skilljar.com/introduction-to-subagents
- Claude Code in Action (★ 6/12): https://anthropic.skilljar.com/claude-code-in-action

ALSO QUEUED:
- AI Capabilities + Limitations (5/30): https://anthropic.skilljar.com/ai-capabilities-and-limitations
- AI Fluency: Framework (5/31): https://anthropic.skilljar.com/ai-fluency-framework-foundations

PHONE TIPS:
- Speed up: gear icon -> 1.25x or 1.5x
- Save data: gear -> 720p
- Mark complete on Basecamp: https://3.basecamp.com/3945211/buckets/47477101/todolists/9940690865

Go get 'em.`;

if (!process.env.MANDRILL_API_KEY) { console.error('MANDRILL_API_KEY required'); process.exit(1); }

nodemailer.createTransport({
  host: 'smtp.mandrillapp.com', port: 587,
  auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
}).sendMail({
  from: '"Ali Muwwakkil" <ali@colaberry.com>',
  to: 'ali_muwwakkil@hotmail.com',
  bcc: 'ali@colaberry.com',
  subject: "🏟️ Tonight's training - tap once, watch on your phone (Claude Code track)",
  text: TEXT_BODY,
  html: HTML_BODY,
  headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
}).then(r => {
  console.log('Sent Claude Code training (hotmail):', r.messageId);
}).catch(e => { console.error('Failed:', e.message); process.exit(1); });
