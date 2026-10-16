import fs from 'fs';
import path from 'path';

/**
 * Guard on the committed design prototype (docs/design/campus/colaberry-campus.html).
 *
 * 1. No embedded photos. The original prototype carried internal test photos as base64 JPEGs;
 *    real people's photos must never live in this public repo. The campus shows a learner's
 *    uploaded photo (avatar_data_url) or initials, nothing else.
 * 2. No visible "free" copy (TWC 807.172(d); say "Explorer" or "$0 to start").
 *    "Visible" means what a person can read: HTML text outside <script>/<style>, plus the
 *    contents of JS string literals inside <script> (the prototype builds most copy in JS),
 *    with ${...} interpolations, class attributes and bare class-token literals removed.
 *    "free" counts as a word only when it is not part of an identifier (gate-free, .free,
 *    G.free, const free). JS code outside string literals is never copy.
 * 3. The file is the real prototype, not an accidental stub.
 */
const FILE = path.join(__dirname, '..', '..', '..', '..', '..', 'docs', 'design', 'campus', 'colaberry-campus.html');

function visibleChunks(html: string): string[] {
  const noStyle = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  const chunks: string[] = [];
  for (const s of noStyle.match(/<script[\s\S]*?<\/script>/gi) ?? []) {
    for (const lit of s.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? []) chunks.push(lit.slice(1, -1));
  }
  chunks.push(noStyle.replace(/<script[\s\S]*?<\/script>/gi, ''));
  return chunks
    .map((c) => c.replace(/\$\{[^}]*\}/g, ' ').replace(/class="[^"]*"/g, '').replace(/<[^>]+>/g, ' '))
    .filter((c) => !/^\s*free\s*$/i.test(c));
}

function freeHits(html: string): string[] {
  const out: string[] = [];
  for (const c of visibleChunks(html)) {
    for (const m of Array.from(c.matchAll(/.{0,30}(?<![-.\w$])free(?![-\w$]).{0,30}/gi))) out.push(m[0]);
  }
  return out;
}

describe('committed campus prototype', () => {
  const html = fs.readFileSync(FILE, 'utf8');

  it('is the real prototype (over 100 KB)', () => {
    expect(html.length).toBeGreaterThan(100 * 1024);
    expect(html).toContain('Colaberry');
  });

  it('embeds no JPEG photos', () => {
    expect(html.match(/data:image\/jpeg;base64,/g) ?? []).toEqual([]);
  });

  it('has no visible "free" copy', () => {
    expect(freeHits(html)).toEqual([]);
  });

  it('the matcher catches visible copy wherever the prototype puts it (mutation control)', () => {
    expect(freeHits(html.replace('</body>', '<div>Free Explorer</div></body>'))).toHaveLength(1);
    expect(freeHits(html.replace('</body>', "<script>const x={t:'Join free: no card'}</script></body>"))).toHaveLength(1);
    expect(freeHits(html.replace('</body>', '<script>const t=`Start for free today`</script></body>'))).toHaveLength(1);
  });

  it('the matcher ignores code that merely contains the word (identifiers, class tokens)', () => {
    const code = "<script>const free=1; if(G.free){} x.className='gate-free'; tag='free';</script>";
    expect(freeHits(html.replace('</body>', code + '</body>'))).toEqual([]);
  });
});
