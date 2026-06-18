#!/usr/bin/env node
/**
 * Publishes the "Basecamp access kit" as a Reference Kit. Creates a ticket
 * directly in the Reference Kits list (per the documented add-a-kit recipe in
 * addReferenceKitsReadme.js), attaches all kit files to an email to Ali, uploads
 * them to the bucket vault under "CB Context Dossiers", posts the auto-attach
 * comment, then marks the ticket complete (kits are documentation, not actions).
 *
 * The kit lets any Claude Code project see what CB System sees in Basecamp:
 * same token, same account (3945211), same scope.
 *
 * Run (needs both keys; resolve a live BC token from CCPP on prod):
 *   MANDRILL_API_KEY=... BASECAMP_ACCESS_TOKEN=... \
 *     node backend/src/scripts/sendBasecampKitToAli.js
 *
 * Reuse an existing ticket instead of creating one: REUSE_TODO_ID=... node ...
 */
const path = require('path');
const fs = require('fs');
const axios = require(path.resolve(__dirname, '../../../node_modules/axios'));
const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const ACCOUNT_ID = '3945211';
const API = `https://3.basecampapi.com/${ACCOUNT_ID}`;
const ALI_PERSONAL_BUCKET = 7463955;
const REFERENCE_KITS_LIST_ID = 9982030818;
const DUE_ON = '2026-07-31'; // far-future; documentation, not actionable

const KIT_DIR = path.resolve(__dirname, './reference-kits/basecamp');

const KIT_FILES = [
  { name: 'bootstrap.sh',            contentType: 'application/x-sh',       desc: 'Out-of-band entry point for a project that cannot yet read Basecamp. Given only a token, it reads THIS ticket and downloads the rest, then runs setup.sh. Deliver this one file via paste or git.' },
  { name: 'basecampClient.js',       contentType: 'application/javascript', desc: 'Node helper. Token resolve (env or CCPP) + bc/bcGet/bcPost/bcPut/bcGetAll + whoAmI/listProjects/listTodolists/listTodos/listPeople/grantProjectAccess. Drop at backend/src/scripts/lib/basecampClient.js' },
  { name: 'bc-exec.sh',              contentType: 'application/x-sh',       desc: 'Bash wrapper for one-off BC API calls. Drop at scripts/bc-exec.sh and chmod +x' },
  { name: 'sample-basecamp.js',      contentType: 'application/javascript', desc: 'Read-only smoke test: whoAmI + list every visible project + drill one. Drop at backend/src/scripts/sampleBasecamp.js' },
  { name: 'setup.sh',               contentType: 'application/x-sh',       desc: 'One-shot installer. Place all files in a dir then: bash setup.sh /path/to/your/project' },
  { name: 'basecamp-access.md',     contentType: 'text/markdown',          desc: 'Full self-contained setup guide. The two-question model, token rotation, install, usage, governance.' },
  { name: 'cb-system-visibility.md', contentType: 'text/markdown',          desc: 'Cookbook: the visibility model + recipes to expose a project to CB System or give another project/person the same scope.' },
];

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

function htmlBody(ticketUrl) {
  return `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6; max-width: 760px; background: #fafafa; padding: 24px;">

<div style="background: #0f1729; color: white; padding: 22px 26px; border-radius: 8px 8px 0 0;">
  <div style="font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #d4a017; font-weight: 700;">Self-Contained Reference Kit</div>
  <div style="font-size: 22px; font-weight: 800; margin-top: 6px; letter-spacing: -0.01em;">Basecamp Access for Any Claude Code Project</div>
  <div style="font-size: 13px; color: #cbd5e1; margin-top: 8px;">Drop it in, and that project sees exactly what CB System sees: same token, same account, same scope.</div>
</div>

<div style="background: white; padding: 22px 26px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">

  <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 14px 18px; border-radius: 0 4px 4px 0; margin-bottom: 22px; font-size: 14px;">
    <strong>One link, everything you need:</strong><br/>
    <a href="${ticketUrl}" style="color: #1e40af; font-weight: 600;">${ticketUrl}</a><br/>
    <span style="font-size: 12px; color: #78350f;">Bookmark this. Share with any project. When the kit updates, the new versions land here.</span>
  </div>

  <div style="margin-bottom: 22px;">
    <span style="background: #eef2ff; color: #4338ca; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 600;">${KIT_FILES.length} files attached</span>
    <span style="background: #ecfdf5; color: #047857; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 600;">Reads free, writes deliberate</span>
    <span style="background: #fef3c7; color: #78350f; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 600;">Token auto-resolves (CCPP/env)</span>
  </div>

  <h2 style="color: #0f1729; font-size: 17px; margin: 0 0 10px; border-bottom: 2px solid #0f1729; padding-bottom: 6px;">The model in one paragraph</h2>
  <p style="font-size: 13px; color: #475569; margin: 0 0 16px;">CB System is not a Basecamp admin. It is an OAuth integration that calls account <strong>3945211</strong> with an access token, and in Basecamp 3 a token sees exactly the projects its <strong>authorizing person</strong> is a member of. So "see what CB System sees" means: use the <strong>same token</strong>, against the <strong>same account</strong>. That token rotates every ~2 weeks (source of truth: CCPP <code>Basecamp_AuthInfo</code>), so the kit resolves it the way CB System does, never on a stale value.</p>

  <h2 style="color: #0f1729; font-size: 17px; margin: 0 0 10px; border-bottom: 2px solid #0f1729; padding-bottom: 6px;">Two questions, two answers</h2>
  <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 22px;">
    <tr><td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; color:#1e293b;">Let a <strong>code project</strong> see what CB System sees</td><td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; color: #475569;">Use the same token + account. That is this kit.</td></tr>
    <tr><td style="padding: 8px 12px; color:#1e293b;">Make a <strong>Basecamp project</strong> visible to CB System</td><td style="padding: 8px 12px; color: #475569;"><code>grantProjectAccess(projectId, tokenOwnerId)</code>. It appears on the next 2-min sync.</td></tr>
  </table>

  <h2 style="color: #0f1729; font-size: 17px; margin: 0 0 10px; border-bottom: 2px solid #0f1729; padding-bottom: 6px;">What's attached (${KIT_FILES.length} files)</h2>
  <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 22px;">
    <tbody>
${KIT_FILES.map((f) => `      <tr><td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-family: monospace; font-size: 12px; color: #047857; font-weight: 600;">${f.name}</td><td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 11px; color: #475569;">${f.desc}</td></tr>`).join('\n')}
    </tbody>
  </table>

  <h2 style="color: #0f1729; font-size: 17px; margin: 0 0 10px; border-bottom: 2px solid #0f1729; padding-bottom: 6px;">Three-step install</h2>
  <ol style="font-size: 13px; color: #1e293b; padding-left: 22px; line-height: 1.8;">
    <li><strong>Download all 6 attachments</strong> into one directory.</li>
    <li><strong>Get a live token</strong> (skip if running on prod, where CCPP env is present):
      <pre style="background: #0f1729; color: #e2e8f0; padding: 12px 14px; border-radius: 5px; font-size: 12px; font-family: monospace; overflow-x: auto; margin: 8px 0;">export BASECAMP_ACCESS_TOKEN=$(ssh root@95.216.199.47 \\
  "docker exec colaberry-accelerator-backend-1 node backend/src/scripts/lib/printBasecampToken.js")</pre></li>
    <li><strong>Run the installer, then the smoke test:</strong>
      <pre style="background: #0f1729; color: #e2e8f0; padding: 12px 14px; border-radius: 5px; font-size: 12px; font-family: monospace; overflow-x: auto; margin: 8px 0;">bash setup.sh /path/to/your/project
node backend/src/scripts/sampleBasecamp.js</pre>
      If it lists projects, you now see what CB System sees.</li>
  </ol>

  <h2 style="color: #0f1729; font-size: 17px; margin: 18px 0 10px; border-bottom: 2px solid #0f1729; padding-bottom: 6px;">Use in code</h2>
  <pre style="background: #f9fafb; border: 1px solid #e5e7eb; color: #1e293b; padding: 14px 16px; border-radius: 6px; font-size: 12px; font-family: monospace; overflow-x: auto; line-height: 1.5; margin: 0 0 14px;">const { whoAmI, listProjects, grantProjectAccess } = require('./lib/basecampClient');

const me = await whoAmI();              // CB System's identity
const projects = await listProjects();  // everything CB System can see

// expose a project to CB System (idempotent if already a member):
await grantProjectAccess(projectId, me.id);</pre>

  <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 14px 18px; border-radius: 0 6px 6px 0; margin-top: 22px; font-size: 13px;">
    <strong>Same scope as CB System, no more.</strong> The kit grants no extra power. If the token owner cannot see a project, neither can you. To widen scope, add the token owner to the project, do not look for a back door. Writes (<code>grant</code>, <code>comment</code>, <code>todo create</code>) hit the real Colaberry account: treat them as production writes.
  </div>

  <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 14px 18px; border-radius: 0 6px 6px 0; margin-top: 14px; font-size: 13px;">
    <strong>Sharing with another project:</strong> send them this ticket URL. No shared file access, no path coordination.<br/><br/>
    <a href="${ticketUrl}" style="color: #047857; font-weight: 600;">${ticketUrl}</a>
  </div>

</div>

<p style="font-size: 11px; color: #888; margin-top: 18px; text-align: center;">
  Basecamp access kit v1 &middot; Session CC-20260617-b3k8
</p>

</div>`;
}

const TEXT_FN = (ticketUrl) => `Basecamp Access for Any Claude Code Project
Self-Contained Reference Kit

ONE LINK, EVERYTHING YOU NEED:
${ticketUrl}

THE MODEL:
CB System is not a Basecamp admin. It is an OAuth integration that calls account
3945211 with an access token. In Basecamp 3, a token sees exactly the projects
its authorizing person is a member of. So "see what CB System sees" == use the
same token, against the same account. The token rotates ~every 2 weeks (source
of truth: CCPP Basecamp_AuthInfo); this kit resolves it the way CB System does.

TWO QUESTIONS:
- Let a CODE project see what CB System sees -> use the same token + account (this kit).
- Make a BASECAMP project visible to CB System -> grantProjectAccess(projectId, tokenOwnerId).

WHAT'S ATTACHED (${KIT_FILES.length} files):
${KIT_FILES.map((f) => `- ${f.name}  -> ${f.desc}`).join('\n')}

THREE-STEP INSTALL:
1. Download all 6 attachments into a single dir.
2. Get a live token (skip on prod):
     export BASECAMP_ACCESS_TOKEN=$(ssh root@95.216.199.47 "docker exec colaberry-accelerator-backend-1 node backend/src/scripts/lib/printBasecampToken.js")
3. Install + smoke test:
     bash setup.sh /path/to/your/project
     node backend/src/scripts/sampleBasecamp.js

USE IN CODE:
     const { whoAmI, listProjects, grantProjectAccess } = require('./lib/basecampClient');
     const me = await whoAmI();
     const projects = await listProjects();
     await grantProjectAccess(projectId, me.id);

GOVERNANCE:
- Reads free, writes deliberate (writes hit the real Colaberry account).
- Never log the token; do not cache or commit it (it rotates).
- Same scope as CB System, no more. Widen scope by adding the token owner.

SHARING WITH ANOTHER PROJECT: just send them this ticket URL.
${ticketUrl}
`;

const H = () => ({
  Authorization: 'Bearer ' + (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '').trim(),
  'User-Agent': 'Colaberry Accelerator (ali@colaberry.com)',
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

async function createTodo() {
  const r = await axios.post(
    `${API}/buckets/${ALI_PERSONAL_BUCKET}/todolists/${REFERENCE_KITS_LIST_ID}/todos.json`,
    {
      content: `Basecamp access kit (${KIT_FILES.length} files)`,
      description: `<div>Drop-in kit so any Claude Code project sees what CB System sees in Basecamp: same token, same account (3945211), same scope. Token auto-resolves from CCPP/env (rotates ~2 weeks). ${KIT_FILES.length} attached files + full guide. Share this ticket URL with any project that needs Basecamp visibility.</div>`,
      due_on: DUE_ON,
    },
    { headers: H() },
  );
  return r.data;
}

(async () => {
  if (!process.env.MANDRILL_API_KEY) throw new Error('MANDRILL_API_KEY required');
  if (!process.env.BASECAMP_ACCESS_TOKEN) throw new Error('BASECAMP_ACCESS_TOKEN required');

  let todo;
  if (process.env.REUSE_TODO_ID) {
    todo = { id: parseInt(process.env.REUSE_TODO_ID, 10), app_url: `https://app.basecamp.com/3945211/buckets/${ALI_PERSONAL_BUCKET}/todos/${process.env.REUSE_TODO_ID}` };
    console.log(`Reusing todo ${todo.id}`);
  } else {
    console.log('Creating Reference Kits todo...');
    todo = await createTodo();
    console.log(`+ Todo ${todo.id}: ${todo.app_url}`);
  }

  console.log(`\nLoading ${KIT_FILES.length} kit files from ${KIT_DIR}...`);
  const files = KIT_FILES.map((meta) => {
    const fullPath = path.join(KIT_DIR, meta.name);
    if (!fs.existsSync(fullPath)) throw new Error(`Missing kit file: ${fullPath}`);
    return { ...meta, content: fs.readFileSync(fullPath) };
  });
  console.log(`+ Loaded ${files.length} files (${files.reduce((s, f) => s + f.content.length, 0)} bytes)`);

  console.log('\nSending email + uploading all files to BC vault...');
  const result = await sendWithBcAttach({
    ticketId: todo.id,
    to: 'ali@colaberry.com',
    bcc: 'ali_muwwakkil@hotmail.com',
    subject: `Basecamp access kit - self-contained, ${KIT_FILES.length} files, see what CB System sees`,
    html: htmlBody(todo.app_url) + SIG_HTML,
    text: TEXT_FN(todo.app_url) + '\n\n' + SIG_TEXT,
    attachments: files.map((f) => ({ filename: f.name, content: f.content, contentType: f.contentType })),
    vaultAttachments: files.map((f) => ({ filename: f.name, content: f.content, contentType: f.contentType, vaultDescription: f.desc })),
    bcSummary: `<p><strong>Basecamp access kit.</strong> ${files.length} files attached to this email AND uploaded to the ticket vault. Share this ticket URL with any project to give it the exact Basecamp visibility CB System has (same token, same account 3945211).</p>
<p style="margin-top:10px"><strong>Files in this drop:</strong></p>
<ul style="font-size:13px;color:#475569">
${files.map((f) => `<li><code>${f.name}</code> - ${f.desc}</li>`).join('\n')}
</ul>`,
  });

  // Reference Kits are documentation, not actions: mark complete.
  try {
    await axios.post(`${API}/buckets/${ALI_PERSONAL_BUCKET}/todos/${todo.id}/completion.json`, {}, { headers: H() });
    console.log('+ Marked complete');
  } catch (e) {
    console.log(`! completion failed: ${e.response?.status}`);
  }

  console.log('\n=== Done ===');
  console.log(`Mandrill ID: ${result.mandrillId}`);
  console.log(`BC comment:  ${result.commentUrl}`);
  console.log(`Todo URL:    ${todo.app_url}`);
  console.log(`Vault uploads (${result.vaultUploads.length}):`);
  result.vaultUploads.forEach((u) => console.log(`  - ${u.filename}: ${u.vaultUrl}`));
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
