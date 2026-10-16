/**
 * C4.4's storyboard and script, and C4.5's runbook. Both from c45Data, because the runbook
 * quotes the script and a drift between them would be invisible until someone ran the demo.
 */
const D = require('./c45Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:12px 16px;
           margin:0 0 15px; border-radius:0 5px 5px 0; }
  .fr { border:1px solid var(--border); border-radius:7px; padding:10px 14px; margin:0 0 9px; }
  .fr .hd { display:flex; justify-content:space-between; align-items:baseline; }
  .fr .t { font-family:Consolas,monospace; font-weight:700; color:var(--cherry); }
  .fr .scr { font-weight:700; }
  .say { background:var(--bg-alt); border-left:3px solid var(--cherry); padding:8px 12px;
         margin:6px 0 0; border-radius:0 5px 5px 0; }
  .tag { display:inline-block; padding:0 7px; border-radius:9px; font-size:7pt;
         font-weight:700; color:#fff; }
  .real { background:#2f7d32; } .sample { background:#b26a00; }
  .warn { background:#fdf3f2; border:1px solid #f3c9c6; border-radius:6px; padding:9px 13px;
          margin:8px 0; }
  .warn b { color:#b3261e; }
  .sec { border-left:4px solid var(--muted); padding:8px 13px; margin:0 0 9px;
         background:#fff; border-top:1px solid var(--border);
         border-right:1px solid var(--border); border-bottom:1px solid var(--border);
         border-radius:0 6px 6px 0; }
  .sec h3 { margin:0 0 4px; font-size:11pt; }
`;

const tag = (d) => `<span class="tag ${d === 'REAL' ? 'real' : 'sample'}">${esc(d)}</span>`;

/* ------------------------- C4.4, script + storyboard ------------------------- */

function buildScript() {
  const timing = D.assertThreeMinutes();
  const labels = D.assertEveryFrameLabeled();
  const css = `${baseCss()}
    .wrap { max-width:900px; margin:0 auto; padding:30px 24px 60px; }
    ${SHARED}`;

  const body = `<div class="wrap">
  <h1>Three-minute demo: script and storyboard</h1>
  <div class="meta">C4.4 &middot; one journey, ${D.FRAMES.length} frames &middot; measured at
    ${timing.words} spoken words, ${Math.floor(timing.seconds / 60)}:${
      String(timing.seconds % 60).padStart(2, '0')} at ${D.WPM} words per minute
    &middot; <strong>READY FOR ALI REVIEW</strong></div>
  <div class="rule"></div>

  <div class="asked"><strong>Asked and delivered.</strong> The ticket asked for a storyboard and
  a word-for-word script, one journey rather than a tour, every screen marked real or sample, and
  a running time of three minutes. <strong>Delivered: ${D.FRAMES.length} frames of one journey,
  every frame labeled, and the running time MEASURED rather than estimated at
  ${Math.floor(timing.seconds / 60)}:${String(timing.seconds % 60).padStart(2, '0')}.</strong>
  A build assertion fails outside a 2:30 to 3:15 band, and it caught the first draft running
  2:06.</div>

  <div class="takeaway">
    <div class="label">The journey</div>
    <div class="headline">${esc(D.JOURNEY)}</div>
  </div>

  <p><strong>Why this one.</strong> ${esc(D.WHY_THIS_JOURNEY)}</p>

  <div class="warn"><b>${labels.sample} of the ${D.FRAMES.length} frames is sample data and says
  so out loud.</b> Showing sample data as though it were a customer outcome is the named failure
  mode for this ticket, so the sample frame is watermarked on screen AND called out in the
  narration. We do not have a customer cohort to show, and saying that is stronger than
  dressing our own data up as somebody else\'s.</div>

  <h2>The storyboard, with the words</h2>
  ${D.FRAMES.map((f) => `<div class="fr">
    <div class="hd"><span class="scr">${f.n}. ${esc(f.screen)}</span>
      <span class="t">${esc(f.t)}</span></div>
    <div style="margin-top:3px">${tag(f.data)}</div>
    <div class="say">${esc(f.say)}</div>
  </div>`).join('')}

  <h2>What Ali decides</h2>
  <ul>
  <li><strong>The journey.</strong> It is the verification path and nothing else. If you want a
  different one, that changes every frame.</li>
  <li><strong>Approval to record.</strong> Nothing has been recorded. The sample frame needs its
  watermark applied before anything is captured.</li>
  </ul>

  <h2>Method</h2>
  <ul>
  <li>The running time is measured, not estimated: ${timing.words} spoken words at ${D.WPM}
  words per minute. The first draft measured 2:06 and the assertion refused it.</li>
  <li>Every frame declares REAL or SAMPLE and the build fails if any does not.</li>
  <li>Figures in the narration are the ones re-read from production on ${esc(D.AS_OF)}, and the
  script tells the audience to push back if a figure is ever quoted without a date.</li>
  </ul>
  </div>`;
  return htmlDoc({ title: 'C4.4 Three-minute demo script', css, body });
}

/* ----------------------------- C4.5, the runbook ----------------------------- */

function buildRunbook() {
  D.assertFailurePathScripted();
  D.assertPilotNotCommitted();
  const timing = D.assertThreeMinutes();
  const css = `${baseCss()}
    .wrap { max-width:900px; margin:0 auto; padding:30px 24px 60px; }
    ${SHARED}`;

  const body = `<div class="wrap">
  <h1>Thirty-minute executive demo runbook</h1>
  <div class="meta">C4.5 &middot; written to be run by someone who did not build the platform
    &middot; ${esc(D.AS_OF)} &middot; <strong>READY FOR ALI REVIEW</strong></div>
  <div class="rule"></div>

  <div class="asked"><strong>Asked and delivered.</strong> The ticket asked for a runbook covering
  opening, discovery question, story path, failure path, questions, pilot transition and
  follow-up, usable by someone who did not build the platform, with a real failure path and the
  pilot transition scripted word for word. <strong>Delivered: all seven sections with actual
  words to say, including what to say when the demo breaks and what never to say.</strong></div>

  <div class="takeaway">
    <div class="label">The thing most runbooks get wrong</div>
    <div class="headline">The pilot transition does not propose a pilot, and that is deliberate:
    three questions reserved to Ali gate any pilot proposal, so committing to one in the room
    would create an obligation the company has not decided it can meet.</div>
  </div>

  <h2>1. Opening</h2>
  <div class="sec"><div class="say">${esc(D.OPENING)}</div></div>

  <h2>2. The discovery question, asked before anything is shown</h2>
  <div class="sec">
    <div class="say">${esc(D.DISCOVERY.q)}</div>
    <div class="meta" style="margin-top:6px"><strong>Why this question:</strong>
      ${esc(D.DISCOVERY.why)}</div>
  </div>

  <h2>3. The story path</h2>
  <p>Run C4.4 exactly as written. ${D.FRAMES.length} frames, measured at
  ${Math.floor(timing.seconds / 60)}:${String(timing.seconds % 60).padStart(2, '0')}. Frame
  ${D.FRAMES.find((f) => f.data === 'SAMPLE').n} is sample data and must be called out aloud as
  the script does.</p>

  <h2>4. The failure path, which is the section that matters</h2>
  <div class="warn"><b>When it happens:</b> ${esc(D.FAILURE_PATH.when)}</div>
  <div class="sec">
    <div class="say">${esc(D.FAILURE_PATH.say)}</div>
    <div style="margin-top:6px"><strong>Then:</strong> ${esc(D.FAILURE_PATH.then)}</div>
    <div class="warn" style="margin-top:7px"><b>Never:</b> ${esc(D.FAILURE_PATH.never)}</div>
  </div>

  <h2>5. The questions that get asked, with the answers</h2>
  ${D.QUESTIONS.map((q) => `<div class="sec">
    <h3>${esc(q.q)}</h3><div>${esc(q.a)}</div></div>`).join('')}

  <h2>6. The pilot transition, word for word</h2>
  <div class="sec">
    <div class="say">${esc(D.PILOT_TRANSITION.say)}</div>
    <div class="meta" style="margin-top:6px"><strong>Why it is phrased that way:</strong>
      ${esc(D.PILOT_TRANSITION.why)}</div>
  </div>
  <div class="warn"><b>A build assertion fails if this text ever commits to a pilot.</b> The
  three reserved questions are intellectual property ownership, deployment liability and model
  neutrality. Until they are answered in writing, the most this transition may offer is a scoped
  next conversation.</div>

  <h2>7. Follow-up</h2>
  <div class="sec">
    <div><strong>Within ${esc(D.FOLLOW_UP.within)}:</strong> ${esc(D.FOLLOW_UP.send)}</div>
    <div class="warn" style="margin-top:7px"><b>Not this:</b> ${esc(D.FOLLOW_UP.never)}</div>
  </div>

  <h2>What Ali decides</h2>
  <p>The pilot transition language. It is written above as the most it can say while three
  answers are outstanding. If you answer those three, this section can be rewritten to propose
  something concrete, and it should be.</p>
  </div>`;
  return htmlDoc({ title: 'C4.5 Executive demo runbook', css, body });
}

module.exports = { buildScript, buildRunbook };
