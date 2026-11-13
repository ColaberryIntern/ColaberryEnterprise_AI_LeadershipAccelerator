/**
 * make-small.js: the small rendition of every case-study cover, for the Hire profile's
 * thumbnail strip. Step 5b of README.md, run after finalize.py writes a new cover.
 *
 *   node scripts/case-study-thumbnails/make-small.js          write any missing or changed one
 *   node scripts/case-study-thumbnails/make-small.js --check  exit 1 if any is missing (CI-style)
 *
 * WHY. The strip shows each cover at 76-110 CSS px, but loaded the full 1536x864 file
 * (170-340 KB each, nine on Kes's page). The small file is 320x180, which stays sharp on a 2x
 * screen at that size, and is a few KB.
 *
 * WHERE. `frontend/public/site-v2/sm/<same name>`, beside the original, so the hire site can
 * derive one URL from the other (and keep the original's `?v=<md5>` cache key, see
 * apply-cover.js). A subfolder, not a suffix, so `thumb-*.jpg` still lists only originals.
 *
 * IDEMPOTENT. A small file newer than its original is left alone; re-running writes nothing.
 * Never touches the originals.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../frontend/public/site-v2');
const OUT = path.join(SRC, 'sm');
const WIDTH = 320;
const HEIGHT = 180;

function originals() {
  return fs.readdirSync(SRC).filter((f) => /^thumb-.+\.jpg$/.test(f)).sort();
}

function stale(name) {
  const out = path.join(OUT, name);
  if (!fs.existsSync(out)) return true;
  return fs.statSync(out).mtimeMs < fs.statSync(path.join(SRC, name)).mtimeMs;
}

async function main() {
  const check = process.argv.includes('--check');
  const todo = originals().filter(stale);
  if (check) {
    const missing = originals().filter((n) => !fs.existsSync(path.join(OUT, n)));
    if (missing.length) {
      console.error(`Missing small covers (run make-small.js): ${missing.join(', ')}`);
      process.exit(1);
    }
    console.log(`All ${originals().length} covers have a small rendition.`);
    return;
  }
  // Loaded only when there is work: --check must run where sharp is not installed.
  // eslint-disable-next-line global-require
  const sharp = require('sharp');
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of todo) {
    // eslint-disable-next-line no-await-in-loop -- a handful of files, one at a time keeps memory flat
    const info = await sharp(path.join(SRC, name))
      .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(path.join(OUT, name));
    console.log(`${name}: ${info.width}x${info.height}, ${info.size} bytes`);
  }
  console.log(`${todo.length} written, ${originals().length - todo.length} already current.`);
}

main().catch((e) => {
  console.error(`make-small failed: ${e && e.message}`);
  process.exit(1);
});
