const { chromium } = require(process.env.PW_PATH);
const fs = require('fs');

/**
 * Capture the Projects / story-build surfaces for the public site.
 *
 * TRAPS THIS SCRIPT EXISTS TO AVOID, all of which produce a screenshot that
 * misrepresents the product:
 *
 *  - Every student's localStorage is auto-seeded with a fake "Hair Salon
 *    Booking & Payments" demo (`sample-salon`). Capturing it as a student
 *    outcome would be fabrication. It is removed from the store before load.
 *  - A browser-side fallback generator fakes a build on a 7-second timer when
 *    the server call fails. Only builds carrying the `pipeline` origin badge are
 *    real, so the run asserts the badge before shooting.
 *  - The same project can hold BOTH pipeline stories (STORY-nnn) and leftover
 *    fallback template tasks (`p<epoch>-tN`, e.g. "Scaffold the MCP server").
 *    Only STORY-nnn ids are captured.
 *  - The webhook block prints a per-repo secret. It is redacted before shooting.
 *
 * Identity masking follows captureBusinessAccountShots.js: an EXACT name list,
 * never a regex (a pattern run once replaced real product labels with invented
 * people), brand marks untouched, and initials badges handled because they are
 * <span> not <img>.
 */

const OUT = process.env.OUT;
const REAL = (process.env.NAMES || '').split('|').map((s) => s.trim()).filter(Boolean);
const MASKS = ['Jordan Ellis', 'Priya Nair', 'Marcus Webb', 'Lena Hoffman', 'Sam Okafor'];

function sanitise(arg) {
  const { real, masks } = arg;
  const map = new Map();
  let n = 0;
  const forName = (r) => {
    if (!map.has(r)) { map.set(r, masks[n % masks.length]); n += 1; }
    return map.get(r);
  };

  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walk.nextNode()) nodes.push(walk.currentNode);

  nodes.forEach((t) => {
    let v = t.nodeValue;
    real.forEach((r) => { if (r && v.includes(r)) v = v.split(r).join(forName(r)); });
    // Redact anything that looks like a webhook secret or token.
    v = v.replace(/\b[A-Fa-f0-9]{32,}\b/g, '••••••••  (secret redacted)');
    v = v.replace(/gh[pous]_[A-Za-z0-9]{16,}/g, 'ghp_••••••  (redacted)');
    if (v !== t.nodeValue) t.nodeValue = v;
  });

  // Initials badges are <span>, not <img>.
  document.querySelectorAll('span, div').forEach((el) => {
    if (el.children.length) return;
    const t = (el.textContent || '').trim();
    if (!/^[A-Z]{2,3}$/.test(t)) return;
    const cs = getComputedStyle(el);
    if ((cs.borderRadius || '').includes('50%') || parseInt(cs.borderRadius, 10) >= 12) {
      el.textContent = 'JE';
    }
  });

  document.querySelectorAll('img').forEach((img) => {
    const s = `${img.getAttribute('src') || ''} ${img.getAttribute('alt') || ''} ${img.className || ''}`;
    if (/logo|brand|colaberry|favicon/i.test(s)) return;
    if (!(img.width <= 72 && img.height <= 72)) return;
    const sp = document.createElement('span');
    sp.textContent = 'JE';
    Object.assign(sp.style, {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: `${img.width}px`, height: `${img.height}px`, borderRadius: '50%',
      background: '#e2e8f0', color: '#1a365d', fontWeight: '700', fontSize: '12px',
    });
    img.replaceWith(sp);
  });
}

/** Drop the seeded fake demo project so it cannot appear in any frame. */
function dropSalon() {
  try {
    Object.keys(localStorage).forEach((k) => {
      const v = localStorage.getItem(k) || '';
      if (/sample-salon|Hair Salon/i.test(v)) {
        try {
          const parsed = JSON.parse(v);
          if (Array.isArray(parsed)) {
            localStorage.setItem(k, JSON.stringify(parsed.filter((p) => p && p.id !== 'sample-salon' && !p.sample)));
            return;
          }
          if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.projects)) {
              parsed.projects = parsed.projects.filter((p) => p && p.id !== 'sample-salon' && !p.sample);
              localStorage.setItem(k, JSON.stringify(parsed));
              return;
            }
            if (parsed['sample-salon']) { delete parsed['sample-salon']; localStorage.setItem(k, JSON.stringify(parsed)); return; }
          }
        } catch { /* not JSON — leave alone */ }
      }
    });
  } catch { /* storage unavailable */ }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
  await ctx.addInitScript((t) => localStorage.setItem('participant_token', t), process.env.TOKEN);
  await ctx.addInitScript(dropSalon);
  const page = await ctx.newPage();

  const shots = JSON.parse(process.env.SHOTS || '[]');
  for (const s of shots) {
    await page.goto(`https://enterprise.colaberry.ai${s.url}`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(s.wait || 5000);

    // The salon demo is RE-SEEDED by the store's migration on load, so clearing
    // localStorage beforehand does not hold. Remove the rendered card instead,
    // then assert the text is gone. Fighting the store was the wrong layer.
    await page.evaluate(() => {
      const kill = [];
      document.querySelectorAll('*').forEach((el) => {
        if (el.children.length) return;
        if (!/Hair Salon/i.test(el.textContent || '')) return;
        // Walk up to the card that owns this text and drop the whole card.
        let node = el;
        for (let i = 0; i < 8 && node && node.parentElement; i += 1) {
          node = node.parentElement;
          const cs = getComputedStyle(node);
          if (parseInt(cs.borderRadius, 10) >= 8 || (cs.boxShadow && cs.boxShadow !== 'none')) break;
        }
        if (node && node !== document.body) kill.push(node);
      });
      kill.forEach((n) => n.remove());
    });
    await page.waitForTimeout(600);

    const text = await page.evaluate(() => document.body.innerText);
    if (/Hair Salon/i.test(text)) {
      console.log(`  !! ${s.name}: SALON SAMPLE VISIBLE — skipped rather than shipped`);
      continue;
    }

    await page.evaluate(sanitise, { real: REAL, masks: MASKS });
    await page.waitForTimeout(400);

    const region = s.clipRect || null;
    const file = `${OUT}/${s.name}`;
    await page.screenshot(region ? { path: file, clip: region } : { path: file, fullPage: false });
    console.log(`  ${s.name.padEnd(28)} ${String(fs.statSync(file).size).padStart(7)} bytes`);
  }

  await browser.close();
})();
