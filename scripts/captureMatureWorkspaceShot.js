const { chromium } = require(process.env.PW_PATH);

/**
 * Capture the company workspace as a MATURE organization.
 *
 * WHY THIS IS LEGITIMATE, and where the line is.
 *
 * The real Colaberry org sits at 0% average readiness with 0 level-ups, because
 * the cohort is four weeks in. That is an honest number and a useless picture:
 * it shows the product's empty state, not the product.
 *
 * The Platform showroom already declares in body copy that "Every figure below
 * is sample data, shaped to the metrics the product actually captures", renders
 * a visible <SampleBadge/>, and the governing claim carries
 * `requiresSampleLabel: true`. Illustrative product imagery under an explicit
 * sample label is exactly what that mechanism exists for.
 *
 * So the figures below are set to the SAME sample values the surface already
 * publishes in its `stats` array (63% readiness, 1,640 builder XP, 12 evidence,
 * 9 evaluations). Image and tiles now agree instead of contradicting each other,
 * which they did before: the tiles said 63% while the screenshot said 0%.
 *
 * WHAT THIS IS NOT: it is not a customer, not a case study, not a result
 * attributed to anyone. No claim anywhere says a named organization achieved
 * these numbers. Strip the sample label and this becomes dishonest, which is
 * why the label is asserted in v2Shots.test.ts rather than left to memory.
 */
const MATURE = {
  avgReadiness: '63%',
  builderXp: '1,640',
  evidence: '12',
  attendance: '86%',
  evaluations: '9',
  levelUps: '7',
  members: '19 members · sample data',
  // Nine ladder ranks, Builder → Architect. A mature org has people spread up
  // the ladder rather than all sitting at rank 0.
  ladder: ['2', '3', '4', '3', '3', '2', '1', '1', '0'],
};

function applyMature(m) {
  const setStatByLabel = (labelText, value) => {
    const nodes = [...document.querySelectorAll('div, span, p')];
    const label = nodes.find(
      (n) => !n.children.length && (n.textContent || '').trim().toLowerCase() === labelText.toLowerCase(),
    );
    if (!label) return false;
    // The value is the sibling above the label inside the same tile.
    const tile = label.parentElement;
    if (!tile) return false;
    const valueEl = [...tile.children].find((c) => c !== label && /[\d,]+%?/.test(c.textContent || ''));
    if (!valueEl) return false;
    valueEl.textContent = value;
    return true;
  };

  const applied = [];
  if (setStatByLabel('Avg Architect Readiness', m.avgReadiness)) applied.push('readiness');
  if (setStatByLabel('Builder XP / week (velocity)', m.builderXp)) applied.push('xp');
  if (setStatByLabel('Evidence shipped this week', m.evidence)) applied.push('evidence');
  if (setStatByLabel('Live-session attendance', m.attendance)) applied.push('attendance');
  if (setStatByLabel('Evaluations passed this month', m.evaluations)) applied.push('evals');
  if (setStatByLabel('Level-ups in last 30 days', m.levelUps)) applied.push('levelups');

  // The headline percentage above the trajectory chart.
  const big = [...document.querySelectorAll('div, span')].find(
    (n) => !n.children.length && (n.textContent || '').trim() === '0%',
  );
  if (big) { big.textContent = m.avgReadiness; applied.push('headline'); }

  // "Average across 19 members" stays truthful about the count.
  const badge = [...document.querySelectorAll('span, div')].find(
    (n) => !n.children.length && /\d+ members · live data/i.test(n.textContent || ''),
  );
  if (badge) { badge.textContent = m.members; applied.push('badge'); }

  // Ladder: replace the all-at-rank-0 distribution with a spread.
  //
  // This is an SVG (CompanyMomentumDashboard renders <circle> + <text>), NOT
  // divs -- a querySelectorAll over span/div found exactly one element and left
  // the ladder reading 18/0/0/0..., which contradicted "7 level-ups" sitting
  // directly above it.
  const svg = [...document.querySelectorAll('svg')].find((el) =>
    /nine-level ladder/i.test(el.getAttribute('aria-label') || ''),
  );
  let ladderCount = 0;
  if (svg) {
    const texts = [...svg.querySelectorAll('text')].filter((t) => /^\d{1,2}$/.test((t.textContent || '').trim()));
    const circles = [...svg.querySelectorAll('circle')].filter((c) => Number(c.getAttribute('r')) === 16);
    texts.slice(0, 9).forEach((t, i) => {
      t.textContent = m.ladder[i];
      // The count text is white on a filled circle and grey on an empty one, so
      // a rank that now has people must also change colour or it reads as empty.
      const filled = m.ladder[i] !== '0';
      t.style.fill = filled ? '#fff' : 'var(--text-subtle)';
      const c = circles[i];
      if (c && filled && c.getAttribute('fill') === 'var(--surface-sunken)') {
        c.setAttribute('fill', ['#367895', '#3E8A85', '#478C6B', '#54A050', '#5BA63C', '#7FA82B', '#A8A61C', '#C99A12', '#E8920C'][i]);
      }
    });
    ladderCount = texts.length;
    if (ladderCount >= 9) applied.push('ladder');
  }

  return { applied, ladderCount };
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
  await ctx.addInitScript((t) => localStorage.setItem('participant_token', t), process.env.TOKEN);
  const p = await ctx.newPage();
  await p.goto('https://enterprise.colaberry.ai/portal/company', { waitUntil: 'networkidle', timeout: 90000 });
  await p.waitForTimeout(5500);

  // Mask real identities first (same rule as every other capture).
  const real = (process.env.NAMES || '').split('|').filter(Boolean);
  await p.evaluate((arg) => {
    const { real: names } = arg;
    const masks = ['Jordan Ellis', 'Priya Nair', 'Marcus Webb', 'Lena Hoffman', 'Sam Okafor', 'Ana Duarte'];
    const map = new Map(); let n = 0;
    const f = (r) => { if (!map.has(r)) { map.set(r, masks[n % masks.length]); n += 1; } return map.get(r); };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const ns = [];
    while (w.nextNode()) ns.push(w.currentNode);
    ns.forEach((t) => { let v = t.nodeValue; names.forEach((r) => { if (r && v.includes(r)) v = v.split(r).join(f(r)); }); if (v !== t.nodeValue) t.nodeValue = v; });
  }, { real });

  const result = await p.evaluate(applyMature, MATURE);
  console.log('applied:', JSON.stringify(result));
  await p.waitForTimeout(400);

  await p.screenshot({ path: process.env.OUT + '/shot-workspace.png', clip: { x: 258, y: 112, width: 880, height: 900 } });
  console.log('mature workspace captured');
  await b.close();
})();
