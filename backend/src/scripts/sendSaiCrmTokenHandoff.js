/**
 * sendSaiCrmTokenHandoff — hands the ENTERPRISE_CRM_TOKEN value off to Sai
 * Tejesh so he can wire training.colaberry.com → enterprise.colaberry.ai per
 * docs/enterprise-crm-lead-contract.md.
 *
 * Sent after PR #4 (POST /api/v1/leads) deployed to prod 2026-06-10.
 * Endpoint smoke-tested live: 201 on first POST + idempotent 200 on retry.
 *
 * Cutover deadline 2026-06-23 (BC #9946500182). Once Sai sets the env vars in
 * Cloud Run and redeploys, his Strapi writer will start posting leads here
 * and stop hitting `enterprise_sync_status: "skipped"`.
 *
 * Attached to BC todo 9979265183 (PR #4 review follow-up) in bucket 47502609
 * (AI Systems list 9946469022) per the Ali Personal attach-to-ticket doctrine.
 *
 * Run on VPS host (not container — node helpers like sendWithBcAttach are not
 * shipped in dist/): `node backend/src/scripts/sendSaiCrmTokenHandoff.js`
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { sendWithBcAttach } = require('./lib/sendWithBcAttach');

const TICKET_ID = 9979265183;
const BUCKET_ID = 47502609;
const TOKEN = process.env.ENTERPRISE_CRM_TOKEN;
const PROD_URL = 'https://enterprise.colaberry.ai';

if (!TOKEN || TOKEN.length < 32) {
  console.error('FATAL: ENTERPRISE_CRM_TOKEN not set in /opt/colaberry-accelerator/.env or too short.');
  process.exit(1);
}

const PLAIN_SIGNATURE = `
Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.

200 Chisholm Place, Suite 200, Plano, TX 75075
ali@colaberry.com  |  enterprise.colaberry.ai
Design Your AI Organization: https://advisor.colaberry.ai/advisory
`;

const HTML_SIGNATURE = `
<table cellpadding="0" cellspacing="0" border="0" style="font-family: Aptos, Arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 20px;">
  <tr><td>
    <div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
    <div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
    <div style="color: #718096;">Colaberry Inc.</div>
    <div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
    <div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a> &nbsp;|&nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0; text-decoration: none;">enterprise.colaberry.ai</a></div>
    <div style="margin-top: 14px;">
      <a href="https://advisor.colaberry.ai/advisory" style="display: inline-block; background: #2b6cb0; color: #ffffff; padding: 9px 18px; border-radius: 20px; text-decoration: none; font-weight: 600;">Design Your AI Organization</a>
    </div>
  </td></tr>
</table>`;

const SUBJECT = 'ENTERPRISE_CRM_TOKEN provisioned - Cloud Run env values for training.colaberry.com cutover';

const TEXT_BODY = `Hi Sai,

Quick handoff. The accelerator-side ingest endpoint is live in prod and the service token has been provisioned. Wiring Cloud Run is the last step on your side before the cutover deadline (2026-06-23).

Set these two values in your Cloud Run env and redeploy. No code change.

  ENTERPRISE_CRM_URL=${PROD_URL}
  ENTERPRISE_CRM_TOKEN=${TOKEN}

That is the same token I set inside our backend container. Match it exactly. The middleware does a constant-time SHA-256 compare, so any drift gets you a 401.

To verify the endpoint is reachable from your environment before redeploying, run:

  curl -X POST ${PROD_URL}/api/v1/leads \\
    -H "Authorization: Bearer ${TOKEN}" \\
    -H "Content-Type: application/json" \\
    -d '{"name":"Sai Tejesh","email":"saitejesh+test@colaberry.com","source":"training.colaberry.com-smoke"}'

You should get back a 201 with {"id":"<int>","created_at":"<iso>"}. If you hit the same endpoint a second time with the same email, you will get a 200 with the same id (the idempotency tier-2 by-email path). Either response means the wiring is good. A 401 means the token is wrong.

Once you redeploy, the Strapi writer should start posting and you can confirm by watching for enterprise_sync_status going from "skipped" to "success" on new form rows. Let me know when it is in and I will spot-check on our side.

For your reference the contract spec lives at docs/enterprise-crm-lead-contract.md in the accelerator repo, and the implementation is in:

  POST /api/v1/leads -> backend/src/routes/v1Routes.ts
  Service           -> backend/src/services/externalLeadIngestService.ts
  Schema (Zod)      -> backend/src/schemas/v1LeadSchema.ts
  Auth middleware   -> backend/src/middlewares/serviceAuthMiddleware.ts

Three-tier idempotency: (1) strapi_lead_id + source match, (2) email match across any source (first-touch wins), (3) create. So your Strapi retries are safe to fire as often as you need.

Rate limit is 300/min. Bursty form traffic absorbs without throttling.

Ping me on Basecamp if anything blocks.${PLAIN_SIGNATURE}`;

const HTML_BODY = `<div style="font-family: Aptos, Arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.55; max-width: 760px;">

<p style="font-family: Aptos, Arial, sans-serif; font-size: 14px; color: #2d3748;">Hi Sai,</p>

<p style="font-family: Aptos, Arial, sans-serif; font-size: 14px; color: #2d3748;">Quick handoff. The accelerator-side ingest endpoint is live in prod and the service token has been provisioned. Wiring Cloud Run is the last step on your side before the cutover deadline (<strong>2026-06-23</strong>).</p>

<p style="font-family: Aptos, Arial, sans-serif; font-size: 14px; color: #2d3748;">Set these two values in your Cloud Run env and redeploy. No code change.</p>

<pre style="background:#f7fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px 14px; font-family: Menlo, Consolas, monospace; font-size: 13px; color: #1a202c; overflow-x:auto;">ENTERPRISE_CRM_URL=${PROD_URL}
ENTERPRISE_CRM_TOKEN=${TOKEN}</pre>

<p style="font-family: Aptos, Arial, sans-serif; font-size: 14px; color: #2d3748;">That is the same token I set inside our backend container. Match it exactly. The middleware does a constant-time SHA-256 compare, so any drift gets you a 401.</p>

<p style="font-family: Aptos, Arial, sans-serif; font-size: 14px; color: #2d3748;"><strong>Quick smoke test</strong> before you redeploy:</p>

<pre style="background:#f7fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px 14px; font-family: Menlo, Consolas, monospace; font-size: 13px; color: #1a202c; overflow-x:auto;">curl -X POST ${PROD_URL}/api/v1/leads \\
  -H "Authorization: Bearer ${TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Sai Tejesh","email":"saitejesh+test@colaberry.com","source":"training.colaberry.com-smoke"}'</pre>

<p style="font-family: Aptos, Arial, sans-serif; font-size: 14px; color: #2d3748;">First call gets you a <code>201</code> with <code>{"id":"&lt;int&gt;","created_at":"&lt;iso&gt;"}</code>. A second call with the same email returns <code>200</code> with the same id (idempotency tier-2 by-email path). Either response means the wiring is good. A <code>401</code> means the token is wrong.</p>

<p style="font-family: Aptos, Arial, sans-serif; font-size: 14px; color: #2d3748;">Once you redeploy, the Strapi writer should start posting and you can confirm by watching <code>enterprise_sync_status</code> go from <code>"skipped"</code> to <code>"success"</code> on new form rows. Let me know when it is in and I will spot-check on our side.</p>

<p style="font-family: Aptos, Arial, sans-serif; font-size: 14px; color: #2d3748;"><strong>Reference</strong> &mdash; contract spec is <code>docs/enterprise-crm-lead-contract.md</code> in the accelerator repo, implementation lives at:</p>

<table style="border-collapse: collapse; font-family: Menlo, Consolas, monospace; font-size: 13px; color: #2d3748; margin: 6px 0;">
  <tr><td style="padding:3px 16px 3px 0;">Route</td><td style="padding:3px 0;"><code>backend/src/routes/v1Routes.ts</code></td></tr>
  <tr><td style="padding:3px 16px 3px 0;">Service</td><td style="padding:3px 0;"><code>backend/src/services/externalLeadIngestService.ts</code></td></tr>
  <tr><td style="padding:3px 16px 3px 0;">Schema</td><td style="padding:3px 0;"><code>backend/src/schemas/v1LeadSchema.ts</code></td></tr>
  <tr><td style="padding:3px 16px 3px 0;">Auth</td><td style="padding:3px 0;"><code>backend/src/middlewares/serviceAuthMiddleware.ts</code></td></tr>
</table>

<p style="font-family: Aptos, Arial, sans-serif; font-size: 14px; color: #2d3748;">Three-tier idempotency: (1) <code>strapi_lead_id + source</code> match, (2) email match across any source (first-touch wins), (3) create. So your Strapi retries are safe to fire as often as you need. Rate limit is 300/min, which absorbs bursty form traffic without throttling.</p>

<p style="font-family: Aptos, Arial, sans-serif; font-size: 14px; color: #2d3748;">Ping me on Basecamp if anything blocks.</p>

${HTML_SIGNATURE}
</div>`;

// Replace em-dash in HTML body (kept &mdash; HTML entity is OK; raw em-dash is not).
const RAW_EMDASH_HTML = HTML_BODY.replace(/&mdash;/g, '').includes('—');
const RAW_ENDASH_HTML = HTML_BODY.replace(/&ndash;/g, '').includes('–');

const CHECKS = [
  ['No raw em-dash in text body', !TEXT_BODY.includes('—')],
  ['No raw en-dash in text body', !TEXT_BODY.includes('–')],
  ['No raw em-dash in HTML body (entities OK)', !RAW_EMDASH_HTML],
  ['No raw en-dash in HTML body (entities OK)', !RAW_ENDASH_HTML],
  ['HTML body contains signature', HTML_BODY.includes('Ali Muwwakkil') && HTML_BODY.includes('Design Your AI Organization')],
  ['Text body ends with plain-text signature', TEXT_BODY.trim().endsWith('https://advisor.colaberry.ai/advisory')],
  ['Token present in HTML body', HTML_BODY.includes(TOKEN)],
  ['Token present in text body', TEXT_BODY.includes(TOKEN)],
];
for (const [label, ok] of CHECKS) {
  if (!ok) { console.error(`FAIL pre-send check: ${label}`); process.exit(1); }
}
console.log(`[checks] all ${CHECKS.length} pre-send checks passed`);

(async () => {
  try {
    const result = await sendWithBcAttach({
      ticketId: TICKET_ID,
      bucketId: BUCKET_ID,
      from: '"Ali Muwwakkil" <ali@colaberry.com>',
      to: 'saitejesh@colaberry.com',
      cc: 'ali@colaberry.com',
      replyTo: 'ali@colaberry.com',
      subject: SUBJECT,
      text: TEXT_BODY,
      html: HTML_BODY,
      bcSummary: `<p>Handed off <code>ENTERPRISE_CRM_TOKEN</code> + <code>ENTERPRISE_CRM_URL=${PROD_URL}</code> to Sai for Cloud Run env. Prod endpoint already smoke-tested green (201 + idempotent 200). Cutover deadline 2026-06-23.</p>`,
    });
    console.log('Sent Mandrill ID:', result.mandrillId);
    console.log('BC comment URL:', result.commentUrl);
    process.exit(0);
  } catch (e) {
    console.error('Failed:', e.message);
    if (e.stack) console.error(e.stack);
    process.exit(1);
  }
})();
