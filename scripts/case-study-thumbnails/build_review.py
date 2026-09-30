"""build_review.py: the page Ali picks thumbnails from. Step 2 of README.md.

    python build_review.py --prompts prompts.json --out-dir out --html thumbnails-review.html

Reads out/manifest.json (generate.js) and prompts.json, writes 960 px and 336 px JPEG
previews into <out-dir>/../preview/, and one self-contained-by-path HTML page beside them:

  1. every concept at YouTube feed size, the size a thumbnail is actually judged at;
  2. each record's current cover at the same size, for the honest comparison;
  3. each record large: the concepts, their prompts, a note where a person must look
     (prompts.json "notes": {"<slug>:<concept>": "..."}), and pick controls that build
     the line to paste back ("Case 01: thumbnail A").

prompts.json "records": [{slug, label, currentHeroUrl|null}] sets the order and labels.
Idempotent: previews and the page are rewritten from the same inputs every run.
"""
import argparse
import html
import json
import os

from PIL import Image


def esc(s):
    return html.escape(str(s), quote=True)


def previews(out_dir, prev_dir, results):
    os.makedirs(prev_dir, exist_ok=True)
    for r in results:
        src = os.path.join(out_dir, r['file'])
        base = r['file'][:-4]
        im = Image.open(src).convert('RGB')
        w, h = im.size
        for width, tag in ((960, 'p'), (336, 's')):
            im.resize((width, round(h * width / w)), Image.LANCZOS).save(
                os.path.join(prev_dir, f'{base}-{tag}.jpg'), quality=86, optimize=True)


CSS = """
:root { --bg:#0f0f0f; --panel:#181818; --line:#2a2a2a; --ink:#f1f1f1; --ink-2:#aaaaaa; --accent:#ff0033; --ok:#3ea6ff; --warn:#ffb020; }
* { box-sizing:border-box; } html { color-scheme: dark; }
body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 Roboto, "Segoe UI", system-ui, sans-serif; padding:0 24px 96px; }
h1,h2 { font-family: Oswald, "Segoe UI", sans-serif; text-wrap:balance; margin:0; font-weight:600; }
h1 { font-size: clamp(28px, 4vw, 44px); } h2 { font-size: clamp(20px, 2.4vw, 28px); }
.eyebrow { color:var(--ink-2); text-transform:uppercase; letter-spacing:.08em; font-size:12px; margin:0 0 4px; }
.wrap { max-width:1400px; margin:0 auto; }
.top { padding:32px 0 12px; border-bottom:1px solid var(--line); display:flex; flex-wrap:wrap; gap:24px; justify-content:space-between; align-items:end; }
.top p { color:var(--ink-2); margin:6px 0 0; max-width:70ch; }
.facts { display:grid; grid-template-columns:auto auto; gap:2px 16px; font-size:13px; color:var(--ink-2); } .facts b { color:var(--ink); font-weight:500; }
.band { padding:28px 0 8px; } .band > p { color:var(--ink-2); max-width:80ch; margin:4px 0 16px; }
.feed { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:32px 16px; }
.yt { display:block; color:inherit; text-decoration:none; }
.yt img { width:100%; aspect-ratio:16/9; object-fit:cover; object-position:50% 18%; border-radius:12px; background:#222; display:block; }
.yt-meta { display:flex; gap:12px; margin-top:12px; }
.yt-avatar { flex:0 0 36px; height:36px; border-radius:50%; background:#c00; color:#fff; display:grid; place-items:center; font-weight:700; }
.yt-title { font-weight:500; font-size:16px; line-height:1.3; } .yt-sub { color:var(--ink-2); font-size:13px; margin-top:4px; }
.cs { border-top:1px solid var(--line); padding:32px 0 8px; }
.cs-head { display:flex; flex-wrap:wrap; gap:24px; justify-content:space-between; align-items:flex-start; margin-bottom:18px; }
.now { display:grid; gap:6px; justify-items:end; } .now img { width:220px; aspect-ratio:16/9; object-fit:cover; border-radius:8px; border:1px solid var(--line); }
.now span { font-size:12px; color:var(--ink-2); }
.concepts { display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:20px; }
.concept { margin:0; background:var(--panel); border:1px solid var(--line); border-radius:14px; overflow:hidden; }
.concept img { width:100%; aspect-ratio:3/2; object-fit:cover; display:block; }
.concept figcaption { padding:14px 16px 16px; display:grid; gap:10px; }
.concept-head { display:flex; gap:10px; align-items:center; }
.badge { width:28px; height:28px; border-radius:6px; background:var(--ink); color:#000; display:grid; place-items:center; font-weight:700; }
.note { margin:0; color:var(--warn); font-size:13px; }
details summary { cursor:pointer; color:var(--ok); font-size:13px; } details p { color:var(--ink-2); font-size:13px; margin:8px 0 0; }
.picks { display:flex; gap:18px; flex-wrap:wrap; font-size:14px; } .picks label { display:flex; gap:6px; align-items:center; cursor:pointer; }
.picks input { accent-color:var(--accent); width:16px; height:16px; }
.summary { position:sticky; bottom:0; background:rgba(15,15,15,.94); border-top:1px solid var(--line); padding:14px 0; margin-top:24px; }
.summary .wrap { display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
.summary code { flex:1 1 400px; background:#000; border:1px solid var(--line); border-radius:8px; padding:10px 12px; font-size:13px; min-height:42px; white-space:pre-wrap; }
button { background:var(--ink); color:#000; border:0; border-radius:20px; padding:10px 18px; font:500 14px Roboto, sans-serif; cursor:pointer; }
button:focus-visible, a:focus-visible, input:focus-visible { outline:2px solid var(--ok); outline-offset:2px; }
@media (max-width:640px) { body { padding:0 16px 120px; } .now img { width:160px; } }
"""

JS = """
(function () {
  var out = document.getElementById('picks');
  function render() {
    var lines = [];
    RECORDS.forEach(function (r) {
      var t = document.querySelector('input[name="thumb-' + r.slug + '"]:checked');
      if (t) lines.push(r.label + ': thumbnail ' + t.value);
    });
    out.textContent = lines.length ? lines.join('\\n') : 'Nothing picked yet.';
  }
  document.addEventListener('change', render);
  document.getElementById('copy').addEventListener('click', function () {
    if (navigator.clipboard) navigator.clipboard.writeText(out.textContent);
  });
})();
"""


def build(prompts_path, out_dir, html_path):
    spec = json.load(open(prompts_path, encoding='utf-8'))
    manifest = json.load(open(os.path.join(out_dir, 'manifest.json'), encoding='utf-8'))
    results = [r for r in manifest['results'] if r.get('ok')]
    prev_dir = os.path.join(os.path.dirname(os.path.abspath(out_dir)), 'preview')
    previews(out_dir, prev_dir, results)
    rel_out = os.path.relpath(out_dir, os.path.dirname(os.path.abspath(html_path))).replace('\\', '/')
    rel_prev = os.path.relpath(prev_dir, os.path.dirname(os.path.abspath(html_path))).replace('\\', '/')
    titles = {it['slug']: it['title'] for it in spec['items']}
    records = spec.get('records') or [{'slug': s, 'label': s, 'currentHeroUrl': None} for s in dict.fromkeys(it['slug'] for it in spec['items'])]
    notes = spec.get('notes', {})
    by_slug = {}
    for r in results:
        by_slug.setdefault(r['slug'], []).append(r)
    for v in by_slug.values():
        v.sort(key=lambda r: r['concept'])

    feed, heroes, sections = [], [], []
    for rec in records:
        slug, label = rec['slug'], rec['label']
        for r in by_slug.get(slug, []):
            base = r['file'][:-4]
            feed.append(f'<a class="yt" href="{rel_out}/{esc(r["file"])}" target="_blank"><img src="{rel_prev}/{esc(base)}-s.jpg" alt="{esc(titles[slug])}, concept {esc(r["concept"])}" loading="lazy"><div class="yt-meta"><span class="yt-avatar">C</span><div><div class="yt-title">{esc(titles[slug])}</div><div class="yt-sub">{esc(label)} &middot; concept {esc(r["concept"])}</div></div></div></a>')
        if rec.get('currentHeroUrl'):
            heroes.append(f'<div class="yt"><img src="{esc(rec["currentHeroUrl"])}" alt="Current cover" loading="lazy"><div class="yt-meta"><span class="yt-avatar">C</span><div><div class="yt-title">{esc(titles[slug])}</div><div class="yt-sub">{esc(label)} &middot; current cover</div></div></div></div>')
        cards = []
        for r in by_slug.get(slug, []):
            base = r['file'][:-4]
            note = notes.get(f'{slug}:{r["concept"]}')
            cards.append(f'''<figure class="concept"><a href="{rel_out}/{esc(r["file"])}" target="_blank"><img src="{rel_prev}/{esc(base)}-p.jpg" alt="{esc(r["name"])}" loading="lazy"></a><figcaption>
<div class="concept-head"><span class="badge">{esc(r["concept"])}</span><strong>{esc(r["name"])}</strong></div>{f'<p class="note">{esc(note)}</p>' if note else ''}
<details><summary>Prompt</summary><p>{esc(r["prompt"])}</p></details>
<div class="picks"><label><input type="radio" name="thumb-{esc(slug)}" value="{esc(r["concept"])}"> Pick this one</label></div></figcaption></figure>''')
        now = (f'<div class="now"><img src="{esc(rec["currentHeroUrl"])}" alt="Current cover" loading="lazy"><span>Current cover, live</span></div>'
               if rec.get('currentHeroUrl') else '<div class="now"><span>No cover yet</span></div>')
        sections.append(f'<section class="cs"><header class="cs-head"><div><p class="eyebrow">{esc(label)}</p><h2>{esc(titles[slug])}</h2></div>{now}</header><div class="concepts">{"".join(cards)}</div></section>')

    tokens = sum((r.get('usage') or {}).get('output_tokens', 0) for r in results)
    page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Thumbnail Concepts</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Oswald:wght@600&display=swap">
<style>{CSS}</style></head><body>
<header class="wrap top"><div><p class="eyebrow">Case study covers and video thumbnails &middot; concepts only</p><h1>Thumbnail Concepts</h1>
<p>{len(results)} concepts, three per record, in the style of the videos that get millions of views: one face or one object, colours that fight each other on purpose, four words at most. Pick one per record; the line at the bottom is what to paste back.</p></div>
<div class="facts"><span>Model</span><b>{esc(manifest["model"])}</b><span>Size</span><b>{esc(manifest["size"])}, quality {esc(manifest["quality"])}</b><span>Image tokens</span><b>{tokens:,}</b></div></header>
<main class="wrap"><section class="band"><p class="eyebrow">How they read in a feed</p><h2>At YouTube size</h2><p>The size a thumbnail is judged at. The feed crops to 16:9 like the video poster will.</p><div class="feed">{"".join(feed)}</div></section>
{f'<section class="band"><p class="eyebrow">For comparison</p><h2>Current covers, same size</h2><div class="feed">{"".join(heroes)}</div></section>' if heroes else ''}
{"".join(sections)}</main>
<div class="summary"><div class="wrap"><strong>Your picks</strong><code id="picks">Nothing picked yet.</code><button id="copy" type="button">Copy</button></div></div>
<script>var RECORDS = {json.dumps([{"slug": r["slug"], "label": r["label"]} for r in records])};{JS}</script></body></html>
'''
    with open(html_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(page)
    print(f'wrote {html_path}: {len(results)} concepts, {len(records)} records')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--prompts', required=True)
    ap.add_argument('--out-dir', required=True)
    ap.add_argument('--html', required=True)
    a = ap.parse_args()
    build(a.prompts, a.out_dir, a.html)
