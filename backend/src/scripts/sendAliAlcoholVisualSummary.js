#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const htmlPath = path.resolve(__dirname, '../../../docs/alcohol-brain-visual-summary.html');
const HTML_BODY = fs.readFileSync(htmlPath, 'utf8');

const TEXT_BODY = `Visual synthesis: Alcohol and the brain.

If you only remember 5 things from the 30-page research:
1. Alcohol hits every brain system at once (no single antidote).
2. Tolerance is the brain fighting back (GABA receptors decrease, NMDA receptors increase).
3. Wanting and liking are different systems. Addiction sensitizes wanting and blunts liking. You crave what you no longer enjoy.
4. Severe withdrawal can kill. Do not quit cold turkey from heavy daily use. Get medical supervision.
5. Recovery takes months to years. The brain heals on its own schedule. Time + abstinence + therapy + environment + medication (when appropriate).

Full visual writeup in the HTML body of this email. Sections:
1. TL;DR - 5 things to focus on
2. The simplest mental model - brake + accelerator
3. The 3 stages - first drink, brain adapts, physical dependence
4. Wanting vs liking
5. Why stopping is hard - the 4-part trap
6. How to explain it in 60 seconds - 4 analogies + one-sentence framing
7. The best way to stop - 8-step evidence-based pathway
8. Recovery timeline - what heals when

Source: tmp/therapy-research/alcohol-brain-research.md
For therapeutic discussion only, not medical advice.

Ali`;

if (!process.env.MANDRILL_API_KEY) { console.error('MANDRILL_API_KEY required'); process.exit(1); }

nodemailer.createTransport({
  host: 'smtp.mandrillapp.com', port: 587,
  auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
}).sendMail({
  from: '"Ali Muwwakkil" <ali@colaberry.com>',
  to: 'ali@colaberry.com',
  subject: 'Visual synthesis: Alcohol and the brain - 5 things, 4 traps, 3 stages, 1 path back',
  text: TEXT_BODY,
  html: HTML_BODY,
  attachments: [
    { filename: 'alcohol-brain-visual-summary.html', path: htmlPath, contentType: 'text/html' },
  ],
  headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
}).then(r => {
  console.log('Sent:', r.messageId);
}).catch(e => { console.error('Failed:', e.message); process.exit(1); });
