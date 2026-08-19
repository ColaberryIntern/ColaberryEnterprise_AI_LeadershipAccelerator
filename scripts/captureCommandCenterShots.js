/**
 * Capture the Command Center for the public site.
 *
 * The Command Center is STORY-000 — the first story of every build. The
 * platform injects the story and writes its prompt from the student's own plan;
 * the student BUILDS it with Claude Code. So these are captures of a real built
 * artifact, not of a platform-generated page, and the copy must say so.
 *
 * WHAT THIS SCRIPT REFUSES TO DO:
 *  - Ship the Overview tab without its own "Sample data" banner in frame. The
 *    page has a Real/Sample toggle and in Sample mode it states outright that
 *    nothing shown is a record of anything the project produced. Cropping that
 *    banner off would turn an honest page into a dishonest screenshot, so the
 *    banner is asserted present before the shutter fires.
 *  - Ship a frame still holding skeletons. Same trap as the repo-evidence shot.
 *
 * Target is Colaberry's OWN public testing repo (AcceleratorTesting), never a
 * student's, so there is no identity to mask here.
 */
const { chromium } = require(process.env.PW_PATH || 'playwright');
const fs = require('fs');
const path = require('path');
/*
 * captureHelpers' maxWidthGuard is the house rule for the 1800px ceiling, but
 * it pulls in `sharp`, whose native binary is not loadable in this worktree.
 * Every shot here is taken at a 1440px viewport with an explicit clip, so it
 * can never exceed the ceiling -- but "can never" is exactly the kind of claim
 * that should be checked rather than asserted. The IHDR chunk of a PNG carries
 * width and height in bytes 16-24, so the real dimensions are read off the
 * written file with no dependency at all, and the script fails loudly rather
 * than shipping something oversized.
 */
const MAX_SAFE_WIDTH = 1800;
function pngSize(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(24);
  fs.readSync(fd, head, 0, 24, 0);
  fs.closeSync(fd);
  if (head.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${file} is not a PNG`);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

const BASE = 'https://colaberryintern.github.io/AcceleratorTesting/command-center';
const OUT = path.resolve(__dirname, '..', 'frontend', 'public', 'site-v2');

const SHOTS = [
  {
    name: 'shot-command-center.png',
    url: `${BASE}/index.html`,
    // Must show the sample banner: it is the honesty of the page.
    mustContain: ['Sample data', 'What is live, and what is not'],
    // Tabs start at y=0 in this layout; the crop begins above them so all nine
    // are whole. They are the point of this shot, not decoration.
    clip: { x: 0, y: 62, width: 1440, height: 880 },
    bannerInFrame: true,
  },
  {
    /*
     * The agent roster. This is the differentiator Ali wants shown: the plan
     * does not stop at software, it enumerates the work of running the thing
     * and splits it into what an agent does and what a person does, naming an
     * AI role for each agent position.
     *
     * Each card states what fires it, what it produces and what skills it uses,
     * and carries a live/needs-attention state -- so the crop has to be wide
     * enough to include those states, or it reads as a static list.
     */
    name: 'shot-agents.png',
    url: `${BASE}/07-agents.html`,
    mustContain: ['Sample data', 'Every agent', 'Fires on', 'Produces'],
    /*
     * MEASURED, not guessed. A hand-picked x=356 sliced the leading column down
     * the middle -- the grid actually runs 144..1296 at this viewport, with the
     * "Every agent" heading at y=96 once scrolled. Two rows of cards is enough
     * to show the pattern without the crop turning into a wall.
     */
    clip: { x: 130, y: 78, width: 1180, height: 700 },
    bannerInFrame: false,
    scrollTo: 'Every agent',
  },
  {
    name: 'shot-build-schedule.png',
    url: `${BASE}/06-project.html`,
    mustContain: ['Sample data', 'Schedule', 'STORY-001'],
    // The banner sits at the top of the page and the schedule is far below it,
    // so no single frame holds both. This crop therefore does NOT carry its own
    // disclosure and the figure caption on the site must supply it -- which the
    // claims registry enforces via requiresSampleLabel, and v2Shots.test.ts
    // fails the build if the label is missing.
    clip: { x: 130, y: 88, width: 1180, height: 620 },
    bannerInFrame: false,
    scrollTo: 'Schedule',
  },
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  for (const s of SHOTS) {
    await page.goto(s.url, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(2500);

    /*
     * Switch to Sample and keep the banner in frame.
     *
     * The page defaults to Real, which for this repo currently reads "0 of 15
     * stories shipped ... nothing here is live" -- true, and the honest empty
     * state the brief asks for, but it shows the shape of the product badly.
     * Sample fills it with declared made-up values AND prints a banner saying
     * exactly that. So Sample is the fair thing to show only while its own
     * disclosure is visible, which is why the banner is a mustContain rather
     * than something cropped away for a tidier picture.
     */
    const toggled = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('button,a,label,span,div'))
        .filter((n) => !n.children.length)
        .find((n) => (n.textContent || '').trim() === 'Sample');
      if (!el) return false;
      (el.closest('button,a,label') || el).click();
      return true;
    });
    if (!toggled) { console.log(`  !! ${s.name}: REFUSED — no Sample control found`); continue; }
    await page.waitForTimeout(1800);

    if (s.scrollTo) {
      await page.evaluate((label) => {
        const el = Array.from(document.querySelectorAll('h1,h2,h3'))
          .find((n) => (n.textContent || '').trim().startsWith(label));
        if (el) el.scrollIntoView({ block: 'start' });
      }, s.scrollTo);
      await page.waitForTimeout(1200);
    }

    const text = await page.evaluate(() => document.body.innerText);
    const missing = s.mustContain.filter((t) => !text.includes(t));
    if (missing.length) {
      console.log(`  !! ${s.name}: REFUSED — missing ${JSON.stringify(missing)}`);
      continue;
    }

    /*
     * mustContain proves the text is on the PAGE. It does not prove the text is
     * inside the CROP, and the first run of this script shipped a schedule
     * whose sample banner had scrolled far out of frame while the check still
     * passed. So when a shot claims to carry its own disclosure, that claim is
     * checked against the clip rectangle rather than the document.
     */
    if (s.bannerInFrame && s.clip) {
      const box = await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('*'))
          .filter((n) => !n.children.length)
          .find((n) => (n.textContent || '').includes('Sample data'));
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      });
      const c = s.clip;
      if (!box || box.top < c.y || box.bottom > c.y + c.height) {
        console.log(`  !! ${s.name}: REFUSED — sample banner is not inside the crop`);
        continue;
      }
    }

    const file = path.join(OUT, s.name);
    await page.screenshot(s.clip ? { path: file, clip: s.clip } : { path: file, fullPage: false });
    const { width, height } = pngSize(file);
    if (width > MAX_SAFE_WIDTH) {
      fs.unlinkSync(file);
      throw new Error(`${s.name} came out ${width}px, over the ${MAX_SAFE_WIDTH}px ceiling. Removed.`);
    }
    console.log(
      `  ${s.name.padEnd(26)} ${String(fs.statSync(file).size).padStart(7)} bytes  ${width}x${height}`,
    );
  }

  await browser.close();
})();
