/**
 * clRebuild.js — rebuild Colaberry Live's tickets in the Commercialization ticket format.
 *
 * WHAT CHANGED FROM THE FIRST PASS, and why each matters:
 *  - DUE DATES ARE STAGGERED by dependency, not all parked on the deadline. A list where
 *    everything is due 31 Oct tells a human nothing about what is late.
 *  - EVERY TICKET CARRIES THE FULL CONTRACT: task id, priority, dependencies, blocks,
 *    objective, 15 context questions, execution prompt, acceptance criteria, named artifact,
 *    canonical folder, and a REVIEW STATE.
 *  - REVIEW STATE IS THE TRACKING MECHANISM. Claude works a ticket to one of four states and
 *    STOPS. It never auto-closes. Ali closes after validating the artifact. That is the
 *    difference between tracking the work and trusting the worker.
 *  - DOCS & FILES FOLDERS give each artifact one canonical home, so a ticket can say where
 *    its output goes and a later session can find it without asking.
 *
 * DRY=1 prints and writes nothing.
 */
const ACCOUNT = process.env.BASECAMP_ACCOUNT_ID || '3945211';
const API = `https://3.basecampapi.com/${ACCOUNT}`;
const UA = 'Colaberry Accelerator (ali@colaberry.com)';
const DRY = process.env.DRY === '1';
const PROJECT = 49210714;

const ALI = 17454835, PIYUSH = 53082893, SOHAIL = 47335940, ALEEM = 47335967;
const WHO = { [ALI]: 'Ali', [PIYUSH]: 'Piyush', [SOHAIL]: 'Sohail', [ALEEM]: 'Aleem' };

let TOKEN = null;
async function tok() {
  if (!TOKEN) TOKEN = await require('/app/dist/services/ops/basecampToken.js').refreshBcToken();
  return TOKEN;
}
async function api(method, path, body) {
  if (DRY && method !== 'GET') {
    console.log(`  [DRY] ${method} ${path} :: ${String((body && (body.name || body.title || body.content)) || '').slice(0, 64)}`);
    return { id: `DRY${Math.floor(Math.random() * 1e6)}`, app_url: '(dry)' };
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await tok()}`, 'User-Agent': UA, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${(await res.text()).slice(0, 240)}`);
  return res.status === 204 ? {} : res.json();
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The 15 questions, in the exemplar's order, adapted from commercial to delivery language. */
const Q = [
  'Why does this task exist now?',
  'What launch objective does it serve?',
  'Who is affected if it is wrong?',
  'What decision or capability should this unlock?',
  'What existing platform capability must be reused rather than rebuilt?',
  'What evidence already exists?',
  'What evidence is missing?',
  'What outside research is required?',
  'What is explicitly out of scope?',
  'What is the exact artifact that must exist when this task is done?',
  'Where will the artifact live?',
  'If the artifact is a platform surface, what route and production URL should exist?',
  'What signal tells us this task actually worked?',
  'What could make the work misleading or untrustworthy?',
  'What does Ali need to personally review or decide?',
];

function render(t) {
  const meta = [
    `Source of truth: COLABERRY LIVE MASTER INDEX — read this before working the ticket.`,
    `Canonical folder for this ticket's artifact: ${t.folder} — upload once here, then link. Never re-upload into another folder.`,
    `Initiative: Colaberry Live · Task ID: ${t.id} · Priority: ${t.pri} · Due: ${t.due} · Human approver: Ali · Execution mode: ${t.mode}`,
    `Required skill: ${t.skill}`,
    `Dependencies: ${t.deps || 'none'} · Blocks: ${t.blocks || 'none'}`,
    `Launch blocker: ${t.blocker ? 'YES — 31 Oct 2026 slips if this slips' : 'no'}`,
  ];
  const qa = t.a.map((ans, i) => `<li><strong>${esc(Q[i])}</strong><br>${esc(ans)}</li>`).join('');
  const research = (t.research || []).map((r) => `<li>${esc(r)}</li>`).join('');
  const accept = t.accept.map((a) => `<li>${esc(a)}</li>`).join('');

  return [
    meta.map((m) => `<div>${esc(m)}</div>`).join(''),
    `<div><br></div><div><strong>OBJECTIVE</strong></div><div>${esc(t.obj)}</div>`,
    `<div><br></div><div><strong>CONTEXT QUESTIONS</strong></div><ul>${qa}</ul>`,
    research
      ? `<div><strong>REQUIRED OUTSIDE RESEARCH</strong></div><ul>${research}</ul><div>Prefer primary sources. Record source URL, publication date, access date and confidence. Separate current fact from historical fact. Never state a price, spec or vendor capability from memory — check the live page on the execution date.</div>`
      : '',
    `<div><br></div><div><strong>CLAUDE CODE EXECUTION PROMPT</strong></div><div>${esc(t.prompt)}</div>`,
    `<div><br></div><div><strong>ACCEPTANCE CRITERIA</strong></div><ul>${accept}</ul>`,
    `<div><strong>ARTIFACT:</strong> ${esc(t.artifact)}</div>`,
    `<div><strong>ARTIFACT LOCATION:</strong> ${esc(t.folder)}</div>`,
    `<div><br></div><div><strong>REVIEW STATE</strong> (set exactly one at end of execution, then stop)</div>`,
    `<div>BLOCKED - ALI DECISION REQUIRED · READY FOR ALI REVIEW - DOCUMENT · READY FOR ALI REVIEW - PR OPEN · READY FOR ALI REVIEW - PROD VERIFIED · NOT STARTED</div>`,
    `<div>Never auto-close this ticket. Ali closes it after validating the artifact. If you finish early, set the review state and stop rather than starting the next ticket silently.</div>`,
  ].filter(Boolean).join('');
}

/** Standard execution prompt prefix, so no ticket has to restate the governance. */
const GOV = 'Read CLAUDE.md fully first, then the COLABERRY LIVE MASTER INDEX and the Broadcast Architecture and Security Contract in this project. Inspect the existing code before proposing changes: Phases 1 to 3 are largely built and re-implementing them is the most likely way to waste a session. Preserve the provider-agnostic playback-grant contract. ';

module.exports = { api, render, GOV, PROJECT, ALI, PIYUSH, SOHAIL, ALEEM, WHO, DRY };
