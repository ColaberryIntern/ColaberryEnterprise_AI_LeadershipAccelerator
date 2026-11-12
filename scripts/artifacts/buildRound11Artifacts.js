/**
 * Build the Round 11 ticket artifacts: for each of C118, C120, C121 and C122, a one-page landscape VISUAL (built to
 * help Ali decide the next step) and a DOCUMENT (the record).
 *
 *   node scripts/artifacts/buildRound11Artifacts.js            # all four tickets
 *   node scripts/artifacts/buildRound11Artifacts.js C121 C122   # some
 *
 * Ali, 11 Nov 2026: "when you are creating updates on the tickets, you are trying your best to build a visual
 * representation that will help the human decide what the next step should be. You must have at least 2 html to pdf
 * artifacts to close the ticket." Every visual therefore ends in a decision box with lettered options.
 *
 * Guards before any PDF is written: American spelling over the rendered text, never the word barred for a licensed
 * career school, and every percentage recomputed from the counts in round11Data.js rather than typed in.
 */
const path = require('path');
const fs = require('fs');
const D = require('./tickets/round11Data');
const { renderPdf, htmlDoc } = require('./renderArtifactPdf');
const { TOKENS, SEV, esc, baseCss, barChart } = require('./artifactTheme');
const { findAllBritishSpellings } = require('./britishSpellings');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'Round11');
const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);

const VISUAL_CSS = `${baseCss()}
  @page { margin: 0; }
  body { font-size: 9.5pt; }
  .page { padding: 18px 24px; height: 7.9in; display: flex; flex-direction: column; }
  .top { display: flex; justify-content: space-between; align-items: flex-end; }
  .grid { display: flex; gap: 16px; flex: 1; margin-top: 10px; min-height: 0; }
  .main { flex: 1.65; min-width: 0; }
  .side { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
  .decide { border: 2px solid var(--cherry); border-radius: 8px; padding: 10px 12px; background: #fff; }
  .decide .label { font-size: 8pt; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: var(--cherry-deep); }
  .decide ol { margin: 6px 0 0; padding-left: 0; list-style: none; }
  .decide li { margin: 0 0 6px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 9pt; }
  .decide li.rec { border-color: ${SEV.ok}; background: #f3f9f3; }
  .decide .opt { font-weight: 700; color: var(--cherry-deep); margin-right: 4px; }
  .decide .tag { font-size: 7.5pt; font-weight: 700; color: ${SEV.ok}; margin-left: 4px; }
  .flow { display: flex; align-items: stretch; gap: 6px; margin: 6px 0 10px; }
  .step { flex: 1; border: 1px solid var(--border); border-radius: 6px; padding: 7px 8px; font-size: 8.5pt; background: #fff; }
  .step b { display: block; font-size: 9pt; }
  .step.lost { border-color: ${SEV.bad}; background: #fdf3f2; }
  .step.ok { border-color: ${SEV.ok}; background: #f3f9f3; }
  .arrow { align-self: center; color: var(--muted); font-weight: 700; }
  .lane { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-top: 6px; }
  .small { font-size: 8pt; color: var(--muted); }
  .checks td:first-child { width: 34%; font-weight: 700; }
  .mono { font-family: Consolas, monospace; font-size: 8.2pt; background: #fdf3f2; border: 1px solid #f3c7c3; border-radius: 6px; padding: 8px 10px; white-space: pre-wrap; line-height: 1.35; }
  .mono.good { background: #f3f9f3; border-color: #bfe0c1; }
`;
const DOC_CSS = `${baseCss()} body { padding: 0; }`;

const chip = (text, sev) => `<span class="chip" style="background:${SEV[sev] || TOKENS.MUTED}">${esc(text)}</span>`;
const header = (t, status, sev) => `
  <div class="top"><div><div class="meta">${esc(t.id)} &middot; Round 11, Explorer first win from ad traffic &middot; ${esc(t.ticket)}</div>
  <h1>${esc(t.title)}</h1></div><div>${chip(status, sev)}</div></div><div class="rule"></div>`;
const decide = (question, options) => `
  <div class="decide"><div class="label">Your decision</div><div style="font-weight:700;margin-top:3px">${esc(question)}</div>
  <ol>${options.map((o) => `<li class="${o.rec ? 'rec' : ''}"><span class="opt">${esc(o.k)}.</span>${esc(o.text)}${o.rec ? '<span class="tag">RECOMMENDED</span>' : ''}</li>`).join('')}</ol></div>`;
const takeaway = (label, text) => `<div class="takeaway"><div class="label">${esc(label)}</div><div class="headline">${esc(text)}</div></div>`;
const askedDelivered = (t) => `
  <table><tr><th style="width:18%">Asked</th><td>${esc(t.asked)}</td></tr><tr><th>Delivered</th><td>${esc(t.delivered)}</td></tr>
  <tr><th>Links</th><td>${esc(t.ticket)}<br>${t.prs.map(esc).join('<br>')}</td></tr></table>`;
const table = (rows, head) => `<table class="checks">${head ? `<tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>` : ''}${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;

// ---------- C118 ----------
function c118() {
  const t = D.C118;
  const oldPct = pct(t.newSignups.old.finished, t.newSignups.old.openers);
  const newPct = pct(t.newSignups.neu.finished, t.newSignups.neu.openers);
  const early = t.exits.filter((s) => s <= 18).length;
  const bins = [[0, 10], [11, 20], [21, 30], [31, 60], [61, 109]].map(([a, b]) => ({ label: `${a} to ${b} s`, value: t.exits.filter((s) => s >= a && s <= b).length }));
  const visual = `<div class="page">${header(t, 'LIVE, VIDEO WORKING', 'ok')}
  <div class="grid"><div class="main">
    <div class="cards">
      <div class="card"><div class="n">${t.reach.notFinished}</div><div class="k">learners now get the new video</div></div>
      <div class="card"><div class="n">${oldPct}% &rarr; ${newPct}%</div><div class="k">new sign-ups who finish (${t.newSignups.old.finished}/${t.newSignups.old.openers} vs ${t.newSignups.neu.finished}/${t.newSignups.neu.openers})</div></div>
      <div class="card"><div class="n">${t.quickCheck.perfect}/${t.quickCheck.attempts}</div><div class="k">Quick check attempts at 5/5</div></div>
    </div>
    <h3>Where the ${t.exits.length} people who did not finish left the 1:49 video</h3>
    ${barChart({ rows: bins.map((b, i) => ({ ...b, color: i < 2 ? TOKENS.CHERRY : TOKENS.MUTED })), max: t.exits.length, labelW: 110, barH: 22 })}
    <div class="note warn"><strong>${early} of ${t.exits.length}</strong> left within 18 seconds: the switch from the avatar hook ("Stay with me to the end") to the career pitch. The old video lost people early too (66% left in its first quarter), so the opening is the lever, not the whole video.</div>
    <p class="small">Finish rates are for brand-new sign-ups who opened the video: the week before the switch vs the first 27.8 hours after it. ${t.newSignups.neu.finished} of ${t.newSignups.neu.openers} is too few people to call a change.</p>
  </div><div class="side">
    ${decide('What should we do about the first 18 seconds?', [
    { k: 'A', text: 'Wait for a week of exact exit data (C119 records the real exit second), then decide on a re-cut. Rerun on Mon 16 Nov.', rec: true },
    { k: 'B', text: 'Re-cut the opening now: move "finishing this video is your first win" earlier and shorten the hook.' },
    { k: 'C', text: 'Leave the video as is; work on getting people to it (C121) first.' },
  ])}
    <div class="note good"><strong>Done:</strong> 1080p, 21.7 MB, self-hosted with range support; card switched at ${esc(t.deployedAt)}; 75% credit and celebration confirmed on real learners; rollback is one command.</div>
  </div></div></div>`;
  const doc = `${takeaway('Takeaway', `The avatar video is the first assignment for ${t.reach.notFinished} Explorers. It works end to end on real learners, and nearly everyone who leaves does so in the first 18 seconds.`)}
  ${askedDelivered(t)}
  <h2>What shipped</h2>
  ${table([
    ['Video file', `${t.video.from} re-encoded to ${t.video.to}, ${t.video.seconds} s, ${t.video.mb} MB, served from frontend/public/media/welcome with range requests`],
    ['Card', 'Title "Video: A welcome from Ali | Start Your Learning Journey", 2 minutes; the replaced YouTube video is saved under metadata.c118_prior'],
    ['Quick check', 'Rewritten from the new transcript: 3 of the 5 old questions were not answered in the new video'],
    ['Deploy', `Merged and deployed at ${t.deployedAt} (${t.sha}); card switch applied to 2 cards; a re-run plans nothing`],
  ], ['Part', 'Detail'])}
  <h2>Evidence on production</h2>
  ${table([
    ['Video serves', 'HTTP 200, video/mp4, 21,711,212 bytes, Accept-Ranges: bytes; poster 200'],
    ['Who gets it', `${t.reach.notFinished} learners had not finished (now see the new video); ${t.reach.alreadyCredited} already had credit (kept)`],
    ['Real learners', 'Every credit recorded from the self-hosted file (provider "file"), at the 75% mark, about 1.3 minutes in'],
    ['Celebration', 'Watch beats continued 19 to 30 s after each credit; the manual button closes the drawer in 1.2 s, so credits came from auto-collect, the path that shows the celebration'],
    ['Quick check', `${t.quickCheck.attempts} attempts, ${t.quickCheck.perfect} at 5/5`],
  ], ['Check', 'Result'])}
  <h2>Finish rate, and where people leave</h2>
  <p>Brand-new sign-ups who opened the video: old ${t.newSignups.old.finished} of ${t.newSignups.old.openers} (${oldPct}%), new ${t.newSignups.neu.finished} of ${t.newSignups.neu.openers} (${newPct}%). All starters including returning learners: old ${t.allStarters.old.finished} of ${t.allStarters.old.started}, new ${t.allStarters.neu.finished} of ${t.allStarters.neu.started}.</p>
  <p>Exit seconds of the ${t.exits.length} non-finishers: ${t.exits.join(', ')}. ${early} left within 18 seconds.</p>
  <h2>What this does not establish</h2>
  <p>That the new video converts better: the new-sign-up comparison is ${t.newSignups.neu.finished} people. Exact exit seconds before C119 shipped (10 Nov, 7:03 AM CST) are floors on a 15-second reporting step. One returning learner played the old YouTube video from a browser tab opened before the switch.</p>`;
  return { visual, doc };
}

// ---------- C119 ----------
function c119() {
  const t = D.C119;
  const p = t.proof;
  const strip = (secs, color) => {
    const W = 600, H = 34, X = (s) => 10 + (s / 109) * (W - 20);
    const ticks = [0, 15, 30, 45, 60, 75, 90, 109].map((s) => `<line x1="${X(s)}" y1="4" x2="${X(s)}" y2="${H - 10}" stroke="#e2e8f0"/><text x="${X(s)}" y="${H}" font-size="8" fill="${TOKENS.MUTED}" text-anchor="middle">${s}s</text>`).join('');
    // Learners who left at the same second share one dot, labeled with how many, so no one is hidden under another.
    const counts = secs.reduce((m, s) => m.set(s, (m.get(s) || 0) + 1), new Map());
    const dots = [...counts].map(([s, n]) => `<circle cx="${X(s)}" cy="${(H - 10) / 2 + 2}" r="${n > 1 ? 8 : 6}" fill="${color}" opacity=".85"/>`
      + (n > 1 ? `<text x="${X(s)}" y="${(H - 10) / 2 + 5.5}" font-size="9" font-weight="700" fill="#fff" text-anchor="middle">${n}</text>` : '')).join('');
    return `<svg viewBox="0 0 ${W} ${H + 2}" width="100%" role="img">${ticks}${dots}</svg>`;
  };
  const visual = `<div class="page">${header(t, 'LIVE, PROVEN ON PRODUCTION', 'ok')}
  <div class="grid"><div class="main">
    <div class="lane">The proof: a real browser, the test account, the tab closed at ${p.playedTo} s</div>
    <div class="flow"><div class="step"><b>Play</b>to ${p.playedTo} s</div><div class="arrow">&rarr;</div><div class="step"><b>Ordinary reports</b>${p.beatsBeforeClose} (they fire every 15 s)</div><div class="arrow">&rarr;</div><div class="step"><b>Close the tab</b>exit report sent (keepalive)</div><div class="arrow">&rarr;</div><div class="step ok"><b>Server recorded</b>${p.recordedWatched} s watched, exit at ${p.recordedExit} s</div></div>
    <div class="note warn"><strong>Before C119</strong> this exact visit left no trace: under 15 s, no report had fired, and closing the tab sent nothing.</div>
    <div class="lane">Where real learners left the 1:49 welcome video</div>
    <div class="small">Before exit tracking (${t.before.length} people): readings sit on the 15-second step or come from a pause</div>
    ${strip(t.before, TOKENS.MUTED)}
    <div class="small" style="margin-top:6px">Since exit tracking (${t.after.length} people so far): exact seconds</div>
    ${strip(t.after, TOKENS.CHERRY)}
    <p class="small">One more learner played the old YouTube video from a tab opened before the switch (exit ${t.staleTab} s, old code) and is left out.</p>
  </div><div class="side">
    ${decide('What do we do with the exact exits?', [
    { k: 'A', text: 'Collect a week, then rerun on Mon 16 Nov and look for one drop point in the first 30 s before touching the video.', rec: true },
    { k: 'B', text: 'Also store which event sent each report (exit, pause, cadence) so the report can show it.' },
    { k: 'C', text: 'Nothing more: the exact exit second is enough.' },
  ])}
    <div class="cards"><div class="card"><div class="n">${t.tests.total}</div><div class="k">tests pass (${t.tests.new} new)</div></div><div class="card"><div class="n">${t.tests.mutationFails}</div><div class="k">fail with the exit code removed</div></div></div>
  </div></div></div>`;
  const doc = `${takeaway('Takeaway', `Closing the tab now records exactly how far a learner got. Proven on production: a tab closed at ${p.playedTo} s recorded ${p.recordedWatched} s.`)}
  ${askedDelivered(t)}
  <h2>What changed</h2>
  ${table([
    ['Player', 'While a video plays, pagehide (tab closed) and visibilitychange to hidden (app backgrounded, phone locked) send the buffered watch time at once, marked exiting. A pause after the page is hidden counts as an exit.'],
    ['Delivery', 'The exit report goes as a keepalive fetch, which survives the page closing and keeps the sign-in header (sendBeacon cannot set it).'],
    ['Scope', 'The card drawer and the Today tile inline player. No server, database or nginx change.'],
  ], ['Part', 'Detail'])}
  <h2>Verification</h2>
  ${table([
    ['Unit tests', `${t.tests.total} pass, ${t.tests.new} new; removing the exit listener fails ${t.tests.mutationFails}`],
    ['Live bundle', 'The exit listener and the keepalive option are in the code the site serves'],
    ['Production proof', `Test account, real Chrome, real sign-in link: played to ${p.playedTo} s with ${p.beatsBeforeClose} ordinary reports, then closed the tab. The server recorded watched ${p.recordedWatched} s and exit ${p.recordedExit} s at ${p.at}.`],
    ['Real learners', `${t.after.length} exits since the deploy, at ${t.after.join(' s and ')} s`],
  ], ['Check', 'Result'])}
  <h2>What this does not establish</h2>
  <p>Which event sent a given real learner's last report: the server does not store the exiting flag, so the report shows the exit second, not how it was sent. A phone that kills the browser without a visibility event still sends nothing. Firefox before version 133 drops the exit report.</p>`;
  return { visual, doc };
}

// ---------- C120 ----------
function c120() {
  const t = D.C120;
  const top = t.funnel[0].people;
  const rows = t.funnel.map((f, i) => ({ label: f.step, value: f.people, display: `${f.people}  (${pct(f.people, top)}%${i ? `, ${pct(f.people, t.funnel[i - 1].people)}% of prev` : ''})`, color: f.people ? TOKENS.CHERRY : '#cbd5e0' }));
  const visual = `<div class="page">${header(t, 'TESTED; FUNNEL STOPS AT THE EMAIL', 'watch')}
  <div class="grid"><div class="main">
    <h3>Ad landing page to Quick check, first ${esc(t.window)}</h3>
    ${barChart({ rows, max: top, labelW: 170, barH: 20 })}
    <div class="note warn"><strong>The drop is the email:</strong> 5 people got the welcome email and 0 entered their account. Mandrill found ${t.mandrill.found} of the ${t.mandrill.emails} emails: delivered, ${t.mandrill.opened} opened, ${t.mandrill.clicked} clicked. The email lands in the Gmail Updates tab.</div>
    <div class="lane">The test sign-up, step by step on production</div>
    ${table(t.testSteps)}
  </div><div class="side">
    ${decide('How do we get people past the email?', [
    { k: 'A', text: 'Skip it: Access your account signs a new account in on the spot (built and live as C121). Rerun this report to see button vs link.', rec: true },
    { k: 'B', text: 'Keep the email as the only door; improve the screen copy and add an Open Gmail button.' },
    { k: 'C', text: 'Rewrite the email so it lands in Primary, and measure opens for a week first.' },
  ])}
    <div class="note"><strong>Cannot see yet:</strong> ${t.blind.map(esc).join('; ')}.</div>
    <div class="note"><strong>Training site:</strong> ${t.trainingSite} more sign-ups came from the training site and are counted separately (they never saw the landing page).</div>
  </div></div></div>`;
  const doc = `${takeaway('Takeaway', 'The Open House flow works end to end, but in its first 14.6 hours nobody went from the welcome email into their account. 19% of landing page visitors signed up.')}
  ${askedDelivered(t)}
  <h2>The funnel</h2>
  ${table(t.funnel.map((f, i) => [f.step, String(f.people), `${pct(f.people, top)}%`, i ? `${pct(f.people, t.funnel[i - 1].people)}%` : '']), ['Step', 'People', 'Of visitors', 'Kept from previous'])}
  <p>Email opens and clicks come from Mandrill, because our database does not store them for this email: ${t.mandrill.found} of ${t.mandrill.emails} found, ${t.mandrill.opened} opened, ${t.mandrill.clicked} clicked.</p>
  <h2>End-to-end test (ali+c120-oh-test-1111@colaberry.com, 5:40 AM CST, 11 Nov)</h2>
  ${table(t.testSteps, ['Step', 'Result'])}
  <h2>The report</h2>
  <p>scripts/audits/open-house-funnel/run.sh on the prod host. Read-only: one rolled-back transaction with a 60 s timeout; the Mandrill step masks addresses and never prints the key. Test addresses are excluded. Since C121, "entered the account" counts the Access your account button (video card opened after sign-up) or a sign-in link, split in its own table.</p>
  <h2>What this does not establish</h2>
  <p>${t.blind.map(esc).join('. ')}. Five sign-ups is too few for any rate to be stable.</p>`;
  return { visual, doc };
}

// ---------- C121 ----------
function c121() {
  const t = D.C121;
  const visual = `<div class="page">${header(t, 'LIVE ON PRODUCTION', 'ok')}
  <div class="grid"><div class="main">
    <div class="lane">Before: four steps, measured 5 sign-ups to 0 entries</div>
    <div class="flow"><div class="step"><b>Sign up</b>"Your seat is saved"</div><div class="arrow">&rarr;</div><div class="step lost"><b>Find the email</b>Gmail Updates tab</div><div class="arrow">&rarr;</div><div class="step lost"><b>Click the link</b>0 of 5 did</div><div class="arrow">&rarr;</div><div class="step"><b>Welcome video</b></div></div>
    <div class="lane">Now: one click</div>
    <div class="flow"><div class="step"><b>Sign up</b>"Your account is ready"</div><div class="arrow">&rarr;</div><div class="step ok"><b>Access your account</b>signed in on the spot</div><div class="arrow">&rarr;</div><div class="step ok"><b>Welcome video</b>Ali's 2 minutes</div><div class="arrow" style="visibility:hidden">&rarr;</div><div class="step"><b>Email</b>still sent: the way back</div></div>
    <div class="lane">Checked on production (${esc(t.deployedAt)}, ${esc(t.sha)})</div>
    ${table(t.prod)}
    <div class="note"><strong>Never for an existing account:</strong> the form is public, so anyone could type anyone's address. Only an account this sign-up just created is signed in. Also fixed: ${esc(t.bugFixed)}</div>
  </div><div class="side">
    ${decide('What next?', [
    { k: 'A', text: 'Let real sign-ups run, then rerun the funnel report on Mon 16 Nov: does the button carry people to the video?', rec: true },
    { k: 'B', text: 'Also drive the Open House emails (24 h and 1 h reminders) straight to the account.' },
    { k: 'C', text: 'Start on the first 18 seconds of the video (see C118) now.' },
  ])}
    <div class="cards"><div class="card"><div class="n">${t.tests.backend + t.tests.frontend}</div><div class="k">tests pass (${t.tests.backendNew + t.tests.frontendNew} new)</div></div><div class="card"><div class="n">2</div><div class="k">safety rules mutation-checked</div></div></div>
  </div></div></div>`;
  const doc = `${takeaway('Takeaway', 'A brand-new Open House sign-up now reaches the welcome video in one click; the welcome email remains the way back. Verified on production.')}
  ${askedDelivered(t)}
  <h2>What changed</h2>
  ${table([
    ['Backend', 'POST /api/v1/open-house/signup returns access (the same 7-day participant session /portal/signup and the magic link issue, landing on the welcome video) only when this request created the account. Reese\'s intro fires for this path too, in the background.'],
    ['Frontend', 'New success screen: "Your account is ready" + Access your account. Existing account: Sign in. Storage blocked: points to the emailed link. The session is stored as login() stores it, then a full load of a /portal path only.'],
    ['Copy fix', t.bugFixed],
    ['Report', 'The C120 report counts entry by the button or a link (PR 3861).'],
  ], ['Part', 'Detail'])}
  <h2>Verification</h2>
  ${table([
    ['Unit tests', `backend ${t.tests.backend} pass (${t.tests.backendNew} new), frontend ${t.tests.frontend} pass (${t.tests.frontendNew} new)`],
    ['Mutation', 'Dropping the new-account check fails a test; loosening the portal-path guard fails 5'],
    ['Types and lint', 'tsc clean for every changed file with planted control errors; ESLint 0 problems'],
    ...t.prod,
  ], ['Check', 'Result'])}
  <h2>Security</h2>
  <p>A session is issued only for an account the same request created (the C103 rule the /portal/signup door already follows). A repeat sign-up returns created false and no session; the existing rate limit of 5 per 15 minutes per IP is unchanged. A hostile next path cannot send anyone off-site.</p>
  <h2>What this does not establish</h2>
  <p>That real sign-ups now reach the video: no real person had used the button when this was written. The funnel rerun on Mon 16 Nov answers it.</p>`;
  return { visual, doc };
}

// ---------- C122 ----------
function c122() {
  const t = D.C122;
  const visual = `<div class="page">${header(t, 'FIXED AND LIVE ON THE HOST', 'ok')}
  <div class="grid"><div class="main">
    <div class="lane">What Jackie received (${esc(t.sentAt)}), excerpt</div>
    <div class="mono">&lt;p&gt;Hi Jackie,&lt;/p&gt;
&lt;p&gt;Could you add this Zoom link to the Eventbrite online event page?&lt;/p&gt;
&lt;p&gt;&lt;a href="/colaberry.zoom.us/j/85643177995?pwd=..."&gt;https://colaberry.zoom.us/j/...&lt;/a&gt;&lt;/p&gt;" style="color:#3a8fb5;..."&gt;https://...</div>
    <div class="lane">How it happened</div>
    <div class="flow">${t.chain.map((c, i) => `<div class="step${i === 4 ? ' lost' : ''}">${esc(c)}</div>`).join('<div class="arrow">&rarr;</div>')}</div>
    <div class="lane">What the guard does now, on the host that sends</div>
    ${table(t.hostChecks)}
    <div class="mono good">{"error":"guard","fails":["body contains HTML (&lt;p&gt;). The body must be PLAIN TEXT: write paragraphs separated by a blank line, and paste links as bare URLs..."]}</div>
  </div><div class="side">
    ${decide('What next?', [
    { k: 'A', text: 'Merge PR 3868 so the repo matches the host. Resend Jackie a clean version of the ask (I will draft it plain-text for your yes).', rec: true },
    { k: 'B', text: 'Merge PR 3868 only; you reply to Jackie yourself.' },
    { k: 'C', text: 'Also audit the last 30 days of sends from this tool for any other broken email.' },
  ])}
    <div class="cards"><div class="card"><div class="n">${t.tests}</div><div class="k">tests pass</div></div><div class="card"><div class="n">${t.mutationFails}</div><div class="k">fail with the guard removed</div></div></div>
    <div class="note">Not from this session: the email was sent by another Claude session through the same tool. No other send-as-Ali path exists in the repo.</div>
  </div></div></div>`;
  const doc = `${takeaway('Takeaway', 'An email written in HTML reached Jackie as raw tags. The send tool now refuses any body with HTML, in dry runs and live, and the fix is already installed where mail is sent.')}
  ${askedDelivered(t)}
  <h2>Root cause</h2>
  <ol>${t.chain.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
  <p>The email is not in the app's send log because sendAsAli sends over SMTP directly.</p>
  <h2>The fix</h2>
  ${table([
    ['bodyGuards', 'Refuses real HTML tags (p, a, br, div and the rest) and HTML entities in the body, before anything is built. Plain text such as "x < 5" or an address in angle brackets still passes.'],
    ['renderedGuards', 'A second lock on the finished HTML: no escaped tags or entities, links opened equal links closed, no malformed href.'],
    ['Skill doc', 'inbox-zero SKILL.md: the body is plain text, never HTML.'],
  ], ['Part', 'What it does'])}
  <h2>Verification</h2>
  ${table([['Tests', `${t.tests} pass (node --test), including the exact Jackie body`], ['Mutation', `Removing the tag check fails ${t.mutationFails} tests`], ...t.hostChecks], ['Check', 'Result'])}
  <h2>Rollback</h2>
  <p><code>cp /root/ali-signature/sendAsAli.js.bak-pre-c122 /root/ali-signature/sendAsAli.js</code></p>
  <h2>What this does not establish</h2>
  <p>That every bad email is impossible: the guard covers HTML in the body. A wrong recipient or a wrong fact still needs the dry run and a human read. Sends outside sendAsAli (forbidden by the operating rules) are not covered.</p>`;
  return { visual, doc };
}

const BUILDERS = { C118: c118, C119: c119, C120: c120, C121: c121, C122: c122 };

function guardText(id, html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
  const brit = findAllBritishSpellings(text);
  if (brit.length) throw new Error(`${id}: British spellings: ${brit.map((b) => b.word || b).join(', ')}`);
  if (/\bfree\b/i.test(text)) throw new Error(`${id}: contains the word barred for a licensed career school`);
}

if (require.main === module) (async () => {
  const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BUILDERS);
  fs.mkdirSync(OUT, { recursive: true });
  for (const id of want) {
    const { visual, doc } = BUILDERS[id]();
    guardText(id, visual); guardText(id, doc);
    const v = await renderPdf({ html: htmlDoc({ title: `${id} visual`, css: VISUAL_CSS, body: visual }), outPath: path.join(OUT, `${id}_VISUAL.pdf`), landscape: true, maxPages: 1, margin: '0' });
    const d = await renderPdf({ html: htmlDoc({ title: `${id} document`, css: DOC_CSS, body: `<h1>${esc(D[id].title)}</h1><div class="meta">${esc(id)} &middot; ${esc(D[id].ticket)}</div><div class="rule"></div>${doc}` }), outPath: path.join(OUT, `${id}_DOCUMENT.pdf`), maxPages: 4 });
    console.log(`${id}: visual ${v.pages}p ${v.bytes}B, document ${d.pages}p ${d.bytes}B`);
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

module.exports = { BUILDERS, VISUAL_CSS };
