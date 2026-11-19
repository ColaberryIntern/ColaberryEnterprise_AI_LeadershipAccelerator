/**
 * screencast.js - record a real page being used, for a walkthrough video's `clip` slide.
 *
 * Ali, 18 Nov 2026, on the Open House video: "show the person going through the tour", and
 * "the part where you show claude is boring". A clip is the product IN USE: a browser
 * screencast of the real page with a visible cursor, never generated or staged.
 *
 * WHY CDP AND NOT PLAYWRIGHT'S recordVideo. recordVideo needs Playwright's own ffmpeg build,
 * which this machine does not have (and App Control blocks Playwright's bundled browsers,
 * which is why every capture here uses `channel: 'msedge'`). The DevTools screencast streams
 * JPEG frames with real timestamps; this module writes them and an ffconcat list that holds
 * each frame for its real duration, so the assembled clip plays at the speed it was performed.
 *
 *   const { addCursor, startScreencast } = require('.../scripts/walkthrough-video/screencast');
 *   await page.goto(url); await addCursor(page);
 *   const rec = await startScreencast(context, page, outDir);
 *   ... drive the page with page.mouse.move(x, y, { steps }) and mouse.down()/up() ...
 *   const { concat, seconds } = await rec.stop();
 *   // ffmpeg -f concat -safe 0 -i <concat> -vf fps=30,format=yuv420p -c:v libx264 -crf 20 clip.mp4
 *
 * Then a deck slide `{ "kind": "clip", "path": "clip.mp4", "start": <s>, "caption": "..." }`.
 * Record only a public or redacted page: every frame ships (SKILL.md §8c, check every frame).
 */
const fs = require('fs');
const path = require('path');

/** A visible arrow cursor and a ring on each click, so a viewer can follow the hand. */
async function addCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById('__cursor')) return;
    const c = document.createElement('div');
    c.id = '__cursor';
    c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2l14 9-6.5 1.4L15 20l-3 1.4-3.4-7.6L4 18z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none', transform: 'translate(-4px,-2px)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))' });
    document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'fixed', left: (e.clientX - 22) + 'px', top: (e.clientY - 22) + 'px', width: '44px', height: '44px', borderRadius: '50%', border: '3px solid #e0a020', zIndex: '2147483646', pointerEvents: 'none', transition: 'transform .5s ease-out, opacity .5s ease-out' });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 600);
    }, true);
  });
}

/** Start streaming frames into `outDir/frames`. `stop()` writes `outDir/frames.ffconcat`. */
async function startScreencast(context, page, outDir, { quality = 88 } = {}) {
  const dir = path.join(outDir, 'frames');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const vp = page.viewportSize() || { width: 1440, height: 900 };
  const frames = [];
  const cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', (f) => {
    const name = `f${String(frames.length).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(dir, name), Buffer.from(f.data, 'base64'));
    frames.push({ name, ts: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality, maxWidth: vp.width, maxHeight: vp.height, everyNthFrame: 1 });
  const startedAt = Date.now() / 1000;
  return {
    /** Seconds since recording began (within a frame of the clip's own clock): log it at each
        step of the walk to choose a slide's `start`. */
    now: () => Date.now() / 1000 - startedAt,
    async stop() {
      await cdp.send('Page.stopScreencast');
      if (!frames.length) throw new Error('the screencast produced no frames');
      const lines = ['ffconcat version 1.0'];
      frames.forEach((f, i) => {
        const next = frames[i + 1] ? frames[i + 1].ts : f.ts + 0.5;
        lines.push(`file 'frames/${f.name}'`, `duration ${Math.max(0.01, next - f.ts).toFixed(4)}`);
      });
      lines.push(`file 'frames/${frames[frames.length - 1].name}'`);
      const concat = path.join(outDir, 'frames.ffconcat');
      fs.writeFileSync(concat, lines.join('\n'));
      return { concat, frames: frames.length, seconds: frames[frames.length - 1].ts - frames[0].ts };
    },
  };
}

module.exports = { addCursor, startScreencast };
