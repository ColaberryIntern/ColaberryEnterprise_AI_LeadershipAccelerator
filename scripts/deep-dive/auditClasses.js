// Audit: which CSS classes do the Week 2-12 specs use that Week 1's CSS does NOT define?
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const wk1 = fs.readFileSync(path.resolve(__dirname, '../../docs/deep-dive/wk1-business-analysis-command-center.html'), 'utf8');
const css = wk1.slice(wk1.indexOf('<style>'), wk1.indexOf('</style>'));
const defined = new Set();
for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) defined.add(m[1]);
const used = {};
for (const f of fs.readdirSync(dir).filter((f) => /^wk\d+\.js$/.test(f))) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const m of s.matchAll(/class=\\?["']([^"'\\]+)/g)) {
    for (const c of m[1].split(/\s+/)) {
      if (c && !defined.has(c)) { (used[c] = used[c] || new Set()).add(f); }
    }
  }
}
console.log('UNDEFINED classes used by specs (class -> weeks):');
Object.entries(used).sort((a, b) => b[1].size - a[1].size).forEach(([c, set]) => console.log('  .' + c + '  [' + [...set].sort().join(',') + ']'));
if (!Object.keys(used).length) console.log('  (none — all classes are defined in wk1)');
