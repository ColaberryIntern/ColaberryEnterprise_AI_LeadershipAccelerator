const { chromium } = require(process.env.PW_PATH);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto('https://github.com/ColaberryIntern/AcceleratorTesting/tree/main/docs',
    { waitUntil: 'networkidle', timeout: 90000 });

  // The commit column is lazy-loaded AFTER the file list paints. The first
  // attempt shot grey skeleton rows because it fired on the file names alone.
  // Wait for the skeletons to actually go away rather than guessing a delay.
  await p.waitForFunction(() => {
    const sk = document.querySelectorAll('[class*="skeleton"], .Skeleton, [data-testid*="skeleton"]');
    if (sk.length) return false;
    const txt = document.body.innerText;
    return /ago|20\d\d/.test(txt);
  }, { timeout: 45000 }).catch(() => console.log('  (skeleton wait timed out — checking anyway)'));
  await p.waitForTimeout(3000);

  const stillSkeleton = await p.evaluate(() =>
    document.querySelectorAll('[class*="skeleton"], .Skeleton').length);
  console.log('  remaining skeletons:', stillSkeleton);
  if (stillSkeleton > 0) { console.log('  REFUSING to ship a half-loaded capture'); await b.close(); process.exit(2); }

  await p.evaluate(() => {
    document.querySelectorAll('header, .Header, [role=banner], .js-notification-shelf, .flash, .Header-old').forEach(e => e.remove());
  });
  await p.waitForTimeout(400);

  const el = await p.$('table, [role=grid]');
  const box = await el.boundingBox();
  await p.screenshot({ path: process.env.OUT + '/shot-repo-evidence.png',
    clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: Math.min(box.width + 16, 1264), height: Math.min(box.height + 16, 620) } });
  console.log('  repo evidence captured');
  await b.close();
})();
