/**
 * Sends 4 install emails (one per external Colaberry site) instructing the
 * site owner to drop the portable visitor tracker snippet into their site.
 *
 * Recipients (per Ali on 2026-05-18):
 *   - advisor.colaberry.ai           → ali@colaberry.com
 *   - colaberry.ai                   → saitejesh@colaberry.com
 *   - trustbeforeintelligence.ai     → ram@colaberry.com, cc saitejesh@colaberry.com
 *   - worldoftaxonomy.com            → ram@colaberry.com, cc saitejesh@colaberry.com
 *
 * Every email BCCs ali@colaberry.com for the file.
 * No em-dashes anywhere (outside-communication style rule).
 *
 * Per Ali: "if there is something off or not matching, [their Claude Code]
 * should reply to you exactly what the problem is so they can reply with the
 * message for you to fix." Emails make this instruction explicit and tell
 * the recipient to paste verbatim console / terminal output.
 *
 * Run: `node backend/src/scripts/sendVisitorTrackerInstallEmails.js`
 */
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.MANDRILL_API_KEY) {
  console.error('FATAL: MANDRILL_API_KEY not set.');
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host: 'smtp.mandrillapp.com',
  port: 587,
  auth: {
    user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com',
    pass: process.env.MANDRILL_API_KEY,
  },
});

const SITES = [
  {
    slug: 'advisor',
    domain: 'advisor.colaberry.ai',
    label: 'AI Workforce Designer',
    to: ['ali@colaberry.com'],
    cc: [],
    greeting: 'Hey,',
    ownerNote: 'You own this one, so this is a note to yourself to install it.',
  },
  {
    slug: 'colaberry',
    domain: 'colaberry.ai',
    label: 'Colaberry main site',
    to: ['saitejesh@colaberry.com'],
    cc: [],
    greeting: 'Hi Tejesh,',
    ownerNote: 'Quick install on the colaberry.ai main site so we can see traffic in our central portal.',
  },
  {
    slug: 'trustbeforeintelligence',
    domain: 'trustbeforeintelligence.ai',
    label: 'Trust Before Intelligence',
    to: ['ram@colaberry.com'],
    cc: ['saitejesh@colaberry.com'],
    greeting: 'Hi Ram,',
    ownerNote: 'Per your question about whether anyone is visiting trustbeforeintelligence.ai, here is the install that turns the lights on. Tejesh CC\'d to help with the actual placement.',
  },
  {
    slug: 'worldoftaxonomy',
    domain: 'worldoftaxonomy.com',
    label: 'World of Taxonomy',
    to: ['ram@colaberry.com'],
    cc: ['saitejesh@colaberry.com'],
    greeting: 'Hi Ram,',
    ownerNote: 'Same install as the Trust Before Intelligence note, just for worldoftaxonomy.com. Tejesh CC\'d to help with placement.',
  },
];

function buildText(site) {
  const snippet = `<script src="https://enterprise.colaberry.ai/v1/track.js" data-site="${site.slug}" defer></script>`;
  return `${site.greeting}

${site.ownerNote}

We now have a portable visitor tracker that drops into any of our external sites with one line. Once installed, every visit shows up in our central portal at enterprise.colaberry.ai under Admin > Visitors > Analytics > "By Site". Today the only site reporting in is enterprise.colaberry.ai itself, which is why Ram cannot see traffic to the other sites.

EXACT SNIPPET FOR ${site.domain.toUpperCase()}:

${snippet}

WHERE TO PASTE IT:
Drop this anywhere in the global layout / footer template, ideally right before the closing </body> tag so it loads after the page content. It works in any HTML page. Frameworks: WordPress (theme footer.php), Webflow (Site Settings > Custom Code > Footer Code), Squarespace (Settings > Advanced > Code Injection > Footer), Next or React or Strapi (in the root layout file's footer block), plain HTML (just before </body>). One paste and done.

WHAT IT CAPTURES:
Pageviews, scroll depth, CTA and link clicks, time on page, device and browser, UTM tags, referrer. No PII unless a visitor's email appears in the URL as ?email=. Honors Do Not Track. Skips any /admin path.

HOW TO VERIFY IT WORKS (90 seconds):
1. Install the snippet and deploy or publish the site.
2. Open the site in a normal browser tab.
3. Open DevTools (F12) > Network tab > filter "track" or "/api/t".
4. Refresh the page. You should see POST requests to https://enterprise.colaberry.ai/api/t/event or /api/t/batch returning 200 or 204.
5. Within a minute, the site will appear as a new row in enterprise.colaberry.ai > Admin > Visitors > Analytics > "By Site (last 30d)" with the slug "${site.slug}".

IF SOMETHING DOES NOT WORK, REPLY WITH THE EXACT ERROR:
Most of you are using Claude Code to do the install. If Claude Code hits any error, or the verification step above fails, please reply to this email and paste the EXACT error message verbatim. Specifically:

- Anything in the browser DevTools Console that starts with [colaberry-track]. The script is designed to print clear diagnostic errors there.
- Any HTTP status other than 200 or 204 on the /api/t/event or /api/t/batch requests, with the response body if present.
- Any error Claude Code prints in the terminal during the install.

Do not paraphrase. Copy and paste the literal text. That lets me fix it from this side without a back and forth.

Thanks,
Ali
`;
}

function buildHtml(site) {
  const snippet = `&lt;script src="https://enterprise.colaberry.ai/v1/track.js" data-site="${site.slug}" defer&gt;&lt;/script&gt;`;
  return `<div style="font-family: Aptos, Arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6; max-width: 680px;">

<p>${site.greeting}</p>

<p>${site.ownerNote}</p>

<p>We now have a portable visitor tracker that drops into any of our external sites with one line. Once installed, every visit shows up in our central portal at <a href="https://enterprise.colaberry.ai">enterprise.colaberry.ai</a> under <strong>Admin &gt; Visitors &gt; Analytics &gt; "By Site"</strong>. Today the only site reporting in is enterprise.colaberry.ai itself, which is why Ram cannot see traffic to the other sites.</p>

<h3 style="color:#1a365d; margin-top: 28px; margin-bottom: 8px;">Exact snippet for ${site.domain}:</h3>

<pre style="background:#f7fafc; border:1px solid #e2e8f0; border-radius:4px; padding:12px; font-size:12px; overflow-x:auto;">${snippet}</pre>

<h3 style="color:#1a365d; margin-top: 28px; margin-bottom: 8px;">Where to paste it:</h3>
<p>Drop this anywhere in the global layout / footer template, ideally right before the closing <code>&lt;/body&gt;</code> tag so it loads after the page content. It works in any HTML page.</p>
<ul>
  <li><strong>WordPress:</strong> theme <code>footer.php</code></li>
  <li><strong>Webflow:</strong> Site Settings &gt; Custom Code &gt; Footer Code</li>
  <li><strong>Squarespace:</strong> Settings &gt; Advanced &gt; Code Injection &gt; Footer</li>
  <li><strong>Next, React, or Strapi:</strong> in the root layout file's footer block</li>
  <li><strong>Plain HTML:</strong> just before <code>&lt;/body&gt;</code></li>
</ul>
<p>One paste and done.</p>

<h3 style="color:#1a365d; margin-top: 28px; margin-bottom: 8px;">What it captures:</h3>
<p>Pageviews, scroll depth, CTA and link clicks, time on page, device and browser, UTM tags, referrer. No PII unless a visitor's email appears in the URL as <code>?email=</code>. Honors Do Not Track. Skips any <code>/admin</code> path.</p>

<h3 style="color:#1a365d; margin-top: 28px; margin-bottom: 8px;">How to verify it works (90 seconds):</h3>
<ol>
  <li>Install the snippet and deploy or publish the site.</li>
  <li>Open the site in a normal browser tab.</li>
  <li>Open DevTools (F12) &gt; Network tab &gt; filter "track" or "/api/t".</li>
  <li>Refresh the page. You should see POST requests to <code>https://enterprise.colaberry.ai/api/t/event</code> or <code>/api/t/batch</code> returning 200 or 204.</li>
  <li>Within a minute, the site will appear as a new row in enterprise.colaberry.ai &gt; Admin &gt; Visitors &gt; Analytics &gt; "By Site (last 30d)" with the slug <code>${site.slug}</code>.</li>
</ol>

<div style="background:#fffbeb; border-left:3px solid #d69e2e; padding:12px 16px; margin: 20px 0;">
<h3 style="color:#92400e; margin: 0 0 8px 0;">If something does not work, reply with the EXACT error:</h3>
<p style="margin-top:0;">Most of you are using Claude Code to do the install. If Claude Code hits any error, or the verification step above fails, please reply to this email and paste the EXACT error message verbatim. Specifically:</p>
<ul>
  <li>Anything in the browser DevTools Console that starts with <code>[colaberry-track]</code>. The script is designed to print clear diagnostic errors there.</li>
  <li>Any HTTP status other than 200 or 204 on the <code>/api/t/event</code> or <code>/api/t/batch</code> requests, with the response body if present.</li>
  <li>Any error Claude Code prints in the terminal during the install.</li>
</ul>
<p style="margin-bottom:0;"><strong>Do not paraphrase.</strong> Copy and paste the literal text. That lets me fix it from this side without a back and forth.</p>
</div>

<p>Thanks,<br/>Ali</p>

</div>`;
}

(async () => {
  const results = [];
  for (const site of SITES) {
    try {
      const r = await transport.sendMail({
        from: '"Ali Muwwakkil" <ali@colaberry.com>',
        to: site.to,
        cc: site.cc.length ? site.cc : undefined,
        bcc: 'ali@colaberry.com',
        subject: `Install one-line visitor tracker on ${site.domain}`,
        text: buildText(site),
        html: buildHtml(site),
        headers: {
          'X-MC-Track': 'none',
          'X-MC-AutoText': 'false',
        },
      });
      results.push({ site: site.domain, ok: true, messageId: r.messageId, accepted: r.accepted, rejected: r.rejected });
      console.log(`Sent: ${site.domain} -> ${r.messageId}`);
    } catch (e) {
      results.push({ site: site.domain, ok: false, error: e.message });
      console.error(`Failed: ${site.domain} -> ${e.message}`);
    }
  }
  console.log('\nSummary:');
  console.table(results.map((r) => ({
    site: r.site,
    ok: r.ok,
    accepted: r.accepted ? r.accepted.length : 0,
    rejected: r.rejected ? r.rejected.length : 0,
    messageId: r.messageId || r.error,
  })));
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})();
