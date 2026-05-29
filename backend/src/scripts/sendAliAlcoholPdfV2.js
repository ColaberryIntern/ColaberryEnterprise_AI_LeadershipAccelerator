#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const pdfPath = path.resolve(__dirname, '../../../docs/alcohol-brain-visual-summary.pdf');
const htmlPath = path.resolve(__dirname, '../../../docs/alcohol-brain-visual-summary-v2.html');

const TEXT_BODY = `Visual writeup v2 attached as PDF.

Same 8 sections as v1, now with icons, emojis, themed banner images (bar / brain / stress / recovery / medical), and richer SVG diagrams. Reads cleanly on paper or screen.

Sections:
1. TL;DR - 5 things to focus on
2. The simplest mental model - brake + accelerator
3. The 3 stages - first drink, brain adapts, physical dependence
4. Wanting vs liking - the central insight
5. Why stopping is hard - the 4-part trap
6. How to explain it in 60 seconds - 4 analogies
7. The best way to stop - 8-step evidence-based pathway
8. Recovery timeline - what heals when

Source: tmp/therapy-research/alcohol-brain-research.md
For therapeutic discussion only, not medical advice.

Ali`;

const HTML_BODY = `<div style="font-family:arial,sans-serif;font-size:14px;color:#2d3748;line-height:1.65">
<p>Visual writeup v2 attached as PDF.</p>
<p>Same 8 sections as v1, now with icons, emojis, themed banner images (bar / brain / stress / recovery / medical), and richer SVG diagrams. Reads cleanly on paper or screen.</p>
<ol>
<li>🎯 TL;DR - 5 things to focus on</li>
<li>⚖️ The simplest mental model - brake + accelerator</li>
<li>📈 The 3 stages - first drink, brain adapts, physical dependence</li>
<li>💔 Wanting vs liking - the central insight</li>
<li>🪤 Why stopping is hard - the 4-part trap</li>
<li>💬 How to explain it in 60 seconds - 4 analogies</li>
<li>🛑 The best way to stop - 8-step evidence-based pathway</li>
<li>🕒 Recovery timeline - what heals when</li>
</ol>
<p><strong>PDF + HTML both attached.</strong> PDF is the primary deliverable. HTML opens in any browser if you want the interactive version.</p>
<p><em>Source: tmp/therapy-research/alcohol-brain-research.md. For therapeutic discussion only, not medical advice.</em></p>
<p>Ali</p>
</div>`;

if (!process.env.MANDRILL_API_KEY) { console.error('MANDRILL_API_KEY required'); process.exit(1); }

nodemailer.createTransport({
  host: 'smtp.mandrillapp.com', port: 587,
  auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
}).sendMail({
  from: '"Ali Muwwakkil" <ali@colaberry.com>',
  to: 'ali@colaberry.com',
  subject: 'Visual writeup v2 (PDF): Alcohol and the brain - icons + imagery + diagrams',
  text: TEXT_BODY,
  html: HTML_BODY,
  attachments: [
    { filename: 'alcohol-brain-visual-summary.pdf', path: pdfPath, contentType: 'application/pdf' },
    { filename: 'alcohol-brain-visual-summary.html', path: htmlPath, contentType: 'text/html' },
  ],
  headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
}).then(r => {
  console.log('Sent:', r.messageId);
}).catch(e => { console.error('Failed:', e.message); process.exit(1); });
