// The Spark Hour check-in card (Ali, 2026-11-16): a QR code and button in the Family Dashboard email,
// vague on purpose, and absent unless Spark is set up on the host.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { compileSparkCard, renderSpark, readSparkUrl } = require('../familySpark');
const { leanData, sectionsText } = require('../renderFamilyDashboardSections');

const kit = { C: { ink: '#111', ink2: '#444', muted: '#999', card: '#fff' }, FONT: 'Arial', esc: (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;') };
const URL = 'https://enterprise.colaberry.ai/spark/?k=abcdefghijklmnopqrstuvwx';
const tmp = (body) => { const f = path.join(os.tmpdir(), `spark-${process.pid}-${Math.random()}.json`); fs.writeFileSync(f, body); return f; };
const PNG = Buffer.concat([Buffer.from([0x89]), Buffer.from('PNG'), Buffer.alloc(20)]);
const fakeRun = (out) => (cmd, args, opts, cb) => cb(null, out);

describe('setup file', () => {
  test('no file, no card', async () => {
    expect(await compileSparkCard({ file: '/nonexistent/spark.json', run: fakeRun('') })).toBeNull();
  });
  test('only a well-formed https link with a key is accepted', () => {
    expect(readSparkUrl(tmp(JSON.stringify({ url: URL })))).toBe(URL);
    expect(readSparkUrl(tmp(JSON.stringify({ url: 'http://x.test/spark/?k=abcdefghijklmnopqrstuvwx' })))).toBeNull();
    expect(readSparkUrl(tmp(JSON.stringify({ url: 'https://x.test/spark/' })))).toBeNull();
    expect(readSparkUrl(tmp('not json'))).toBeNull();
  });
  test('the QR comes back as a PNG for the email', async () => {
    const card = await compileSparkCard({ file: tmp(JSON.stringify({ url: URL })), run: fakeRun(PNG.toString('base64')) });
    expect(card).toMatchObject({ url: URL, cid: 'spark-qr' });
    expect(card.buf.equals(PNG)).toBe(true);
  });
  test('a bad QR render fails loudly so the email can drop the card', async () => {
    await expect(compileSparkCard({ file: tmp(JSON.stringify({ url: URL })), run: fakeRun('bm90IGEgcG5n') })).rejects.toThrow('not a PNG');
  });
});

describe('the card', () => {
  test('shows the QR and the button, and nothing about plans or answers', () => {
    const html = renderSpark({ spark: { url: URL, cid: 'spark-qr' } }, kit);
    expect(html).toContain('cid:spark-qr');
    expect(html).toContain(`href="${URL}"`);
    expect(html).toContain('Your 2-minute check-in');
    expect(html.replace(/cid:spark-qr|\/spark\//g, '')).not.toMatch(/spark/i);
  });
  test('no card without Spark', () => {
    expect(renderSpark({ spark: null }, kit)).toBe('');
  });
  test('the plain-text email has the link; the copy filed in Basecamp does not', () => {
    expect(sectionsText({ spark: { url: URL } })).toContain(URL);
    expect(JSON.stringify(leanData({ photos: [], throwbacks: [], video: null, spark: { url: URL, buf: PNG } }))).not.toContain('k=');
  });
});
