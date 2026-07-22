/**
 * outlineHtml.ts — renders a KitSpec as a clean, plain-language CLASS OUTLINE:
 * a one-page teaching plan the instructor can read top to bottom to review the
 * class, understand the flow, and prepare. Same content as the deck, but as a
 * scannable lesson plan instead of slides — grouped by run-of-show segment with
 * time windows and the key teaching points under each.
 */
import { KitSpec, KitSlide } from './kitSpec';

function esc(s: unknown): string {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
}

/** First sentence of the body, or the interaction question, as a one-liner. */
function oneLiner(slide: KitSlide): string {
  if (slide.interaction) return slide.interaction.q;
  if (slide.body) {
    const m = slide.body.match(/^.*?[.!?](\s|$)/);
    return (m ? m[0] : slide.body).trim();
  }
  if (slide.bullets && slide.bullets.length) return slide.bullets[0];
  if (slide.brief) return slide.brief.headline;
  return '';
}

function slideRow(slide: KitSlide): string {
  const label = slide.eyebrow ? `<span class="olabel">${esc(slide.eyebrow)}</span> ` : '';
  const line = oneLiner(slide);
  const bits: string[] = [];
  if (line && line !== slide.title) bits.push(`<span class="oline">${esc(line)}</span>`);
  if (slide.prompt) bits.push(`<span class="ocode">⌨️ ${esc(slide.prompt.label)}</span>`);
  if (slide.diagram) bits.push('<span class="odiagram">📊 diagram</span>');
  const sub =
    slide.bullets && slide.bullets.length > 1
      ? '<ul class="obul">' + slide.bullets.map((b) => `<li>${esc(b)}</li>`).join('') + '</ul>'
      : '';
  return (
    `<div class="oslide"><div class="otitle">${label}${esc(slide.title)}</div>` +
    (bits.length ? `<div class="ometa">${bits.join(' · ')}</div>` : '') +
    sub +
    '</div>'
  );
}

export function renderClassOutline(spec: KitSpec): string {
  const m = spec.meta;
  // Group slides by segment, in order.
  const bySeg = new Map<string, KitSlide[]>();
  for (const s of spec.slides) {
    if (s.kind === 'cover' || s.kind === 'rules') continue; // chrome, not teaching
    const arr = bySeg.get(s.segmentId) || [];
    arr.push(s);
    bySeg.set(s.segmentId, arr);
  }

  const blocks = spec.segments
    .map((seg) => {
      const slides = bySeg.get(seg.id) || [];
      if (!slides.length) return '';
      const mins = seg.endMin - seg.startMin;
      return (
        '<section class="oseg">' +
        `<div class="oseg-head"><span class="otime">${Math.round(seg.startMin)}–${Math.round(seg.endMin)} min</span>` +
        `<span class="oseg-name">${esc(seg.label)}</span>` +
        `<span class="omins">${mins} min</span></div>` +
        `<div class="oseg-purpose">${esc(seg.purpose)}</div>` +
        slides.map(slideRow).join('') +
        '</section>'
      );
    })
    .join('');

  const flow = spec.segments.map((s) => esc(s.label)).join(' → ');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Outline · ${esc(m.dayLabel)} · ${esc(m.title)}</title>
<style>
  :root{--cherry:#E5121D;--ink:#1a202c;--muted:#64748b;--line:#e8e2de;--bg:#faf7f5;--berry:#367895}
  *{box-sizing:border-box}
  body{margin:0;font-family:"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);background:#fff;line-height:1.5}
  .wrap{max-width:820px;margin:0 auto;padding:32px 22px 80px}
  .kick{color:var(--cherry);font-weight:800;letter-spacing:2px;text-transform:uppercase;font-size:12px}
  h1{font-size:30px;margin:6px 0 4px;line-height:1.15}
  .meta{color:var(--muted);font-size:15px;margin-bottom:10px}
  .formula{display:inline-block;background:var(--bg);border-left:4px solid var(--cherry);padding:8px 14px;border-radius:6px;font-weight:700;font-size:14px;margin:6px 0 4px}
  .flow{font-size:12.5px;color:var(--muted);margin:14px 0 8px;padding:10px 12px;background:var(--bg);border-radius:8px}
  .oseg{border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:14px 0;break-inside:avoid}
  .oseg-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
  .otime{font-family:"Cascadia Mono",Consolas,monospace;font-weight:700;color:var(--berry);font-size:14px}
  .oseg-name{font-weight:800;font-size:18px}
  .omins{margin-left:auto;font-size:12px;color:var(--muted);background:var(--bg);border-radius:999px;padding:2px 10px}
  .oseg-purpose{color:var(--muted);font-size:13.5px;margin:4px 0 10px;font-style:italic}
  .oslide{padding:8px 0;border-top:1px dashed var(--line)}
  .oslide:first-of-type{border-top:0}
  .otitle{font-weight:700;font-size:15.5px}
  .olabel{color:var(--cherry)}
  .ometa{font-size:13px;color:var(--ink);margin-top:2px}
  .oline{color:#2d3748}
  .ocode{color:var(--berry);font-weight:600}
  .odiagram{color:#a26208;font-weight:600}
  .obul{margin:6px 0 2px;padding-left:20px}
  .obul li{font-size:13px;color:var(--muted);margin:2px 0}
  .foot{margin-top:24px;color:var(--muted);font-size:12px;text-align:center;border-top:1px solid var(--line);padding-top:14px}
  @media print{.wrap{max-width:100%}@page{margin:14mm}}
</style></head>
<body><div class="wrap">
  <div class="kick">${esc(m.cohortName)} · ${esc(m.dayLabel)}${m.week != null ? ' · Week ' + m.week : ''}</div>
  <h1>${esc(m.title)}</h1>
  <div class="meta">${esc(m.dateLabel)} · ${esc(m.timeRange)} · ${m.durationMin} min${m.intensive ? ' · ' + esc(m.intensive) : ''}</div>
  <div class="formula">Learn it Monday. Build it Thursday. Prove it by Friday.</div>
  <div class="flow"><b>Class flow:</b> ${flow}</div>
  ${blocks}
  <div class="foot">Class outline · generated from the Class Kit · AI Systems Architect Accelerator</div>
</div></body></html>`;
}
