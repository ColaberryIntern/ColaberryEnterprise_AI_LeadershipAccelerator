/**
 * The watch gate to-do's one-page visual and its status document.
 *
 * The visual leads with the DECISION rather than with what shipped, because the ticket is not
 * waiting on engineering - four of its five items are built, in review, or deliberately queued.
 * It is waiting on one answer from Ali, and a reader who has to find that on the second screen
 * has been given a status report instead of a decision aid.
 *
 * The error-direction chart is the one piece of evidence that earns its space on page one: the
 * same gate has been wrong in BOTH directions inside four days, which is the argument for not
 * settling item 5 by intuition.
 */
const D = require('./watchGateData');
const { TOKENS, SEV, esc, baseCss, barChart } = require('../artifactTheme');

const FOOT = `To-do ${D.TICKET} &middot; ${D.PROJECT} &middot; state as of ${D.AS_OF} `
  + `&middot; every status here read from the running build, not inferred from a merge`;

/** Ladder states carry a color because the reader scans this column before reading any row. */
const STATE_COLOR = {
  LIVE: SEV.ok,
  'IN REVIEW': SEV.watch,
  'NOT STARTED': TOKENS.MUTED,
  'NEEDS ALI': TOKENS.CHERRY,
};

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

/**
 * Bars are deliberately NOT all one color here, unlike most charts in this folder. The value being
 * drawn is "how far from honest", and 1.0 is the only good value - so distance from 1.0 IS the
 * severity rather than a category that red would misrepresent.
 */
const errorChart = (width, labelW, barH, gap) => barChart({
  rows: D.ERROR_DIRECTION.map((r) => ({
    label: r.label,
    value: r.value,
    display: r.display,
    color: r.bad ? TOKENS.CHERRY : SEV.ok,
  })),
  width,
  labelW,
  barH,
  gap,
  max: 3.5,
});

const ladderRows = () => D.LADDER.map((r) => `<tr>
  <td class="n">${r.n}</td>
  <td><strong>${esc(r.title)}</strong><div class="sub">${esc(r.note)}</div></td>
  <td class="st"><span class="chip" style="background:${STATE_COLOR[r.state]}">${esc(r.state)}</span></td>
</tr>`).join('');

const optionCards = () => D.OPTIONS.map((o) => {
  const picked = o.key === D.RECOMMENDATION;
  return `<div class="opt${picked ? ' picked' : ''}">
    <div class="ok">${esc(o.key)}${picked ? ' &middot; recommended' : ''}</div>
    <div class="ot">${esc(o.title)}</div>
    <div class="ob">${esc(o.body)}</div>
    <div class="oc"><strong>Cost:</strong> ${esc(o.cost)}</div>
  </div>`;
}).join('');

/* ------------------------------------------------------------------ visual */

function buildVisual() {
  const css = `
  body { font-size: 9pt; }
  h1 { font-size: 16pt; margin-bottom: 2px; }
  .lede { font-size: 10pt; color: var(--ink); margin: 0 0 9px; }
  .lede strong { color: var(--cherry-deep); }
  .cols { display: flex; gap: 13px; align-items: flex-start; }
  .col { flex: 1; }
  .col.wide { flex: 1.15; }
  h2 { font-size: 9.5pt; margin: 0 0 5px; border-bottom: 1.5px solid var(--cherry-bg);
       padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3.5px 4px; border-bottom: 1px solid var(--border); vertical-align: top;
       font-size: 8.6pt; }
  td.n { width: 14px; color: var(--muted); font-weight: 700; }
  td.st { width: 78px; text-align: right; }
  .sub { color: var(--muted); font-size: 7.6pt; line-height: 1.3; }
  .chip { color: #fff; border-radius: 9px; padding: 1.5px 7px; font-size: 7.2pt;
          font-weight: 700; white-space: nowrap; display: inline-block; }
  .opt { border: 1px solid var(--border); border-left: 3px solid var(--muted);
         border-radius: 4px; padding: 5px 7px; margin-bottom: 5px; background: #fff; }
  .opt.picked { border-left-color: var(--cherry); background: var(--cherry-bg); }
  .ok { font-size: 7.4pt; font-weight: 700; color: var(--muted); letter-spacing: .4px;
        text-transform: uppercase; }
  .opt.picked .ok { color: var(--cherry-deep); }
  .ot { font-weight: 700; font-size: 9pt; margin: 1px 0 2px; }
  .ob { font-size: 8.2pt; line-height: 1.35; }
  .oc { font-size: 7.8pt; color: var(--muted); margin-top: 3px; line-height: 1.3; }
  .why { background: var(--bg-alt); border-radius: 4px; padding: 6px 8px; font-size: 8.2pt;
         line-height: 1.4; margin-top: 2px; }
  .facts { display: flex; gap: 6px; margin-top: 7px; }
  .fact { flex: 1; border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px;
          text-align: center; }
  .fv { font-weight: 700; font-size: 8.6pt; color: var(--cherry-deep); }
  .fl { font-size: 7pt; color: var(--muted); line-height: 1.25; }
  .prec { font-size: 7.8pt; color: var(--muted); margin-top: 5px; }
  .foot { margin-top: 9px; padding-top: 5px; border-top: 1px solid var(--border);
          font-size: 7.2pt; color: var(--muted); }
  `;

  const facts = [
    [D.FACTS.swatiOver, 'measured over-count, 20 Nov'],
    [D.FACTS.swatiOld, 'saved vs played, pre-fix build'],
    [D.FACTS.storm, 'retry rate after one failure'],
    [D.FACTS.callers, 'the 19 Nov fix\'s real reach'],
  ].map(([v, l]) => `<div class="fact"><div class="fv">${esc(v)}</div><div class="fl">${esc(l)}</div></div>`).join('');

  const body = `
  <h1>Watch gate: one decision is holding the rest</h1>
  <p class="lede">Four of the five items on this to-do are live, in review, or deliberately
    queued behind one another. The fifth is not an engineering question.
    <strong>It needs an answer from Ali, and the other work is shaped by it.</strong></p>

  <div class="cols">
    <div class="col wide">
      <h2>Where each item actually is</h2>
      <table>${ladderRows()}</table>

      <h2 style="margin-top:9px">The same gate has been wrong in both directions this week</h2>
      ${errorChart(372, 128, 13, 5)}
      <div class="prec">Credited time against ground actually covered. 1.00 is honest; the
        bottom bar is an assumption, not a measurement - the re-test has not been posted.</div>
    </div>

    <div class="col">
      <h2>The decision: when two players exist for one card, whose seconds count?</h2>
      ${optionCards()}
      <div class="why"><strong>Why ${esc(D.RECOMMENDATION)}:</strong> ${esc(D.RECOMMENDATION_WHY)}</div>
      <div class="prec"><strong>Precedent:</strong>
        ${D.PRECEDENT.map(([n, v]) => `${esc(n)} ${esc(v)}`).join(' &middot; ')}.
        The platform disagrees with itself either way, so this is a choice rather than a standard.</div>
    </div>
  </div>

  <div class="facts">${facts}</div>
  <div class="foot">${FOOT}</div>`;

  return shell({ title: 'Watch gate - decision', body, extraCss: css });
}

/* ---------------------------------------------------------------- document */

function buildDocument() {
  const css = `
  .ad { border-left: 3px solid var(--cherry); background: var(--cherry-bg); padding: 9px 12px;
        border-radius: 4px; margin-bottom: 14px; }
  .ad div { margin: 2px 0; }
  .take { background: var(--bg-alt); border-radius: 4px; padding: 10px 13px; margin: 10px 0 16px;
          font-size: 11pt; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; }
  th { text-align: left; background: var(--bg-alt); font-size: 9pt; padding: 5px 7px;
       border-bottom: 2px solid var(--border); }
  td { padding: 5px 7px; border-bottom: 1px solid var(--border); font-size: 9.5pt;
       vertical-align: top; }
  .chip { color: #fff; border-radius: 9px; padding: 1px 7px; font-size: 7.8pt; font-weight: 700;
          white-space: nowrap; }
  li { margin-bottom: 5px; }
  .neg { border-left: 3px solid var(--muted); background: var(--bg-alt); padding: 9px 12px;
         border-radius: 4px; }
  .foot { margin-top: 20px; padding-top: 7px; border-top: 1px solid var(--border);
          font-size: 8pt; color: var(--muted); }
  `;

  const body = `
  <h1>Watch gate: status, and the decision that unblocks the rest</h1>
  <div class="ad">
    <div><strong>ASKED:</strong> fix the video watch gate, which Swati Raman reported was
      over-counting progress so a learner could pass 75% without watching 75%.</div>
    <div><strong>DELIVERED:</strong> one of the two causes is fixed and live, a third defect found
      during the work is in review, a fourth was found and deliberately queued behind it, and the
      fifth is a product decision that is now the only thing blocking the rest.</div>
  </div>

  <div class="take"><strong>TAKEAWAY.</strong> This gate has been wrong in both directions inside
    four days. Before 19 November it destroyed watch time and 75% was unreachable on a long video.
    After the loop fix it inflated watch time, crediting ${esc(D.FACTS.swatiOver)}. Each fix was
    correct and each one exposed the next fault. The remaining question is not which bug to fix -
    it is what the platform should mean by "watched", and that is the one thing engineering
    should not decide on its own.</div>

  <h2>Where each item stands</h2>
  <table>
    <tr><th>#</th><th>Item</th><th>State</th><th>Evidence</th></tr>
    ${D.LADDER.map((r) => `<tr>
      <td>${r.n}</td>
      <td><strong>${esc(r.title)}</strong><br>${esc(r.detail)}</td>
      <td><span class="chip" style="background:${STATE_COLOR[r.state]}">${esc(r.state)}</span></td>
      <td>${esc(r.note)}</td>
    </tr>`).join('')}
  </table>

  <h2>The decision</h2>
  <p>Three mounts can each report watch progress for the same card:
    ${D.MOUNTS.map(([f, w]) => `<code>${esc(f)}</code> (${esc(w)})`).join(', ')}. When a drawer
    opens over a playing tile, two of them exist at once. Choosing which may save is also choosing
    whether time from a player the learner cannot see counts toward completion, which is why this
    is not a defect with a correct answer.</p>
  <table>
    <tr><th>Option</th><th>What it means</th><th>What it costs</th></tr>
    ${D.OPTIONS.map((o) => `<tr>
      <td><strong>${esc(o.key)}</strong><br>${esc(o.title)}</td>
      <td>${esc(o.body)}</td><td>${esc(o.cost)}</td>
    </tr>`).join('')}
  </table>
  <p><strong>Recommendation: ${esc(D.RECOMMENDATION)}.</strong> ${esc(D.RECOMMENDATION_WHY)}</p>
  <p><strong>Precedent, for calibration.</strong>
    ${D.PRECEDENT.map(([n, v]) => `${esc(n)} ${esc(v)}`).join('; ')}. There is no industry standard
    to defer to here.</p>

  <h2>Evidence</h2>
  <ul>
    <li><strong>Over-counting, measured in production</strong> by Swati Raman on 20 November:
      ${esc(D.FACTS.swatiOver)}, rising toward 3.5x once two players drifted apart.</li>
    <li><strong>Under-counting, measured before the loop fix:</strong> credited time against ground
      covered was ${D.CREDIT_BY_LENGTH.map(([k, v]) => `${v.toFixed(2)} ${esc(k)}`).join(', ')} -
      the loss scaled with video length, which is exactly backwards.</li>
    <li><strong>#4260 proved live rather than assumed.</strong> Minification renames the variable,
      so a marker grep would prove nothing. The check was counted in the pre-fix image still on the
      box (once) against the running image (three times), with both chunks carrying the YouTube
      handler also carrying the check.</li>
    <li><strong>#4276 is mutation-checked, not merely green.</strong> Deleting the back-off guard
      fails exactly three tests and no others; separately removing only the exit-beat bypass fails
      exactly one. Both halves are pinned independently.</li>
    <li><strong>Baselines measured, not asserted.</strong> The full frontend suite fails 8 suites
      on this branch and the same 8 on <code>origin/main</code>; the typecheck reports 10 errors
      and <code>origin/main</code> reports the same 10.</li>
  </ul>

  <h2>What this does not establish</h2>
  <div class="neg"><ul>
    ${D.NOT_ESTABLISHED.map((t) => `<li>${esc(t)}</li>`).join('')}
  </ul></div>

  <h2>One trap worth keeping</h2>
  <p>A Basecamp notification email can contradict the comment it announces. Swati's emailed re-test
    said double-counting did not appear in production; the live comment says it is confirmed. She
    edited it 446 seconds after posting, and the email carries the original wording permanently.
    <code>updated_at != created_at</code> is the tell. Anyone acting on the mail would have stood a
    live P0 down.</p>

  <div class="foot">${FOOT}<br>${esc(D.TICKET_URL)}</div>`;

  return shell({ title: 'Watch gate - status and decision', body, extraCss: css });
}

module.exports = { buildVisual, buildDocument };
