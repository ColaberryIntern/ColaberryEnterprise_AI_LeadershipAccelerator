/**
 * renderArtifacts - PURE. The Command Center button, the artifacts block (only what the intern
 * themselves made, each one opening in a new tab and naming where it came from) and the
 * "Ask them for" cards (why, the Claude Code prompt to paste, and the matching nudge).
 * Email-safe: tables, inline styles, every value escaped.
 */
import { WRONG_FORMAT, kindLabel } from './artifacts';
import type { ArtifactFileType, InternCard } from './types';

const NAVY = '#1a365d';
const MUTED = '#64748b';

const esc = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeHref = (u: string): string | null => (/^https:\/\//.test(u) ? esc(u) : null);
const label = (t: string, color = MUTED): string => `<div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${color};font-weight:700;margin:12px 0 4px">${esc(t)}</div>`;

/** How each file type looks: a solid badge color, a light chip tint, an email-safe icon (HTML entity). */
const FILE_TYPE: Record<ArtifactFileType, { label: string; color: string; tint: string; icon: string }> = {
  pdf: { label: 'PDF', color: '#b91c1c', tint: '#fef2f2', icon: '&#128196;' },
  spreadsheet: { label: 'Spreadsheet', color: '#15803d', tint: '#f0fdf4', icon: '&#128202;' },
  word: { label: 'Word', color: '#1d4ed8', tint: '#eff6ff', icon: '&#128221;' },
  slides: { label: 'Slides', color: '#c2410c', tint: '#fff7ed', icon: '&#128253;' },
  html: { label: 'Web page', color: '#0f766e', tint: '#f0fdfa', icon: '&#127760;' },
  image: { label: 'Image', color: '#a21caf', tint: '#fdf4ff', icon: '&#128247;' },
  claude: { label: 'claude.ai', color: '#6d28d9', tint: '#f5f3ff', icon: '&#10024;' },
  link: { label: 'Link', color: '#475569', tint: '#f8fafc', icon: '&#128279;' },
  file: { label: 'File', color: '#475569', tint: '#f8fafc', icon: '&#128206;' },
  // Wrong format: shown (it is real work) but amber, so it reads as "needs converting to a PDF".
  markdown: { label: 'Markdown: convert to PDF', color: '#b45309', tint: '#fffbeb', icon: '&#9888;' },
  text: { label: 'Text: convert to PDF', color: '#b45309', tint: '#fffbeb', icon: '&#9888;' },
};
/** PDFs first: they are the artifacts Ali asked for. */
const TYPE_ORDER: ArtifactFileType[] = ['pdf', 'spreadsheet', 'word', 'slides', 'html', 'image', 'claude', 'link', 'file', 'markdown', 'text'];

/** Keep the tail: the filename at the end of a repo path is the part worth reading. */
const shorten = (s: string, max = 44): string => (s.length <= max ? s : `...${s.slice(-(max - 3))}`);

/** The button in the card header: their published Command Center, or a clear "not published". */
export function commandCenterHtml(c: InternCard): string {
  const url = c.project?.commandCenterUrl ? safeHref(c.project.commandCenterUrl) : null;
  if (url) {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:6px;padding:5px 12px;border-radius:6px;background:${NAVY};color:#ffffff;font-size:12px;font-weight:700;text-decoration:none">Open Command Center &#8599;</a>`;
  }
  return c.project ? `<div style="margin-top:6px;font-size:11px;color:#9a3412;font-weight:700">No Command Center published</div>` : '';
}

/**
 * Every artifact the intern actually made, each a link that opens it and each carrying the file,
 * commit or site it came from. No placeholders, no "+N more", and nothing the platform wrote about
 * them (Ali, 9 Nov: "The data should come from the user ONLY").
 */
export function artifactsHtml(c: InternCard): string {
  const a = c.artifacts;
  const chip = (p: InternCard['artifacts']['published'][number]): string => {
    const t = FILE_TYPE[p.fileType];
    const href = safeHref(p.url);
    const name = esc(p.title.length > 60 ? `${p.title.slice(0, 59)}...` : p.title);
    const from = p.provenance ? ` <span style="color:${MUTED}">${esc(shorten(p.provenance))}</span>` : '';
    const text = `<strong>${esc(kindLabel(p.kind))}</strong>: ${name}${from}`;
    const border = WRONG_FORMAT.has(p.fileType) ? 'dashed' : 'solid';
    const style = `display:inline-block;margin:2px 4px 2px 0;padding:3px 8px;border-radius:12px;font-size:12px;background:${t.tint};color:#0f172a;border:1px ${border} ${t.color};text-decoration:none`;
    return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer" style="${style}">${text} <span style="color:${t.color}">&#8599;</span></a>` : `<span style="${style}">${text}</span>`;
  };
  // One row per file type, so a PDF, a spreadsheet and a claude.ai page never look alike
  // (Ali, 10 Nov 2026: "we should have some type of distinction on what the artifact type is").
  const rows = TYPE_ORDER.map((type) => {
    const items = a.published.filter((p) => p.fileType === type);
    if (!items.length) return '';
    const t = FILE_TYPE[type];
    const badge = `<span style="display:inline-block;min-width:92px;margin:2px 6px 2px 0;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;background:${t.color};color:#ffffff;text-align:center">${t.icon} ${esc(t.label)} ${items.length}</span>`;
    return `<div style="margin:3px 0">${badge}${items.map(chip).join('')}</div>`;
  }).join('');
  const wrong = a.published.filter((p) => WRONG_FORMAT.has(p.fileType)).length;
  const caption = `<div style="font-size:11px;color:${MUTED};margin:0 0 4px">Their own work only: files in their repo, files they uploaded, artifacts they built elsewhere. Amber = wrong format (Markdown or text); artifacts should be visual PDFs.</div>`;
  return `${label(`Artifacts they made (${a.published.length}${wrong ? `, ${wrong} in the wrong format` : ''})`)}${caption}
<div>${rows || `<span style="font-size:12px;color:${MUTED}">Nothing published yet.</span>`}</div>`;
}

/** One card per ask: what it is and why, the prompt to paste, and the nudge that asks for it. */
export function asksHtml(c: InternCard): string {
  const asks = c.artifacts.asks;
  if (!asks.length) return '';
  const cards = asks.map((k, i) => `
<div style="border:1px solid #c7d2fe;border-left:4px solid #4338ca;border-radius:6px;padding:10px 12px;margin:8px 0;background:#fafaff">
  <div style="font-size:13px;font-weight:700;color:#312e81">${i + 1}. ${esc(k.name)}</div>
  <div style="font-size:12px;color:#334155;margin-top:2px">${esc(k.why)}</div>
  <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};font-weight:700;margin:8px 0 2px">Prompt to give them</div>
  <pre style="margin:0;white-space:pre-wrap;font-family:Consolas,Menlo,monospace;font-size:12px;line-height:1.45;background:#0f172a;color:#e2e8f0;padding:10px 12px;border-radius:6px">${esc(k.prompt)}</pre>
  <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};font-weight:700;margin:8px 0 2px">Matching nudge</div>
  <div style="font-size:13px;line-height:1.5;background:#ffffff;border-left:3px solid #4338ca;padding:6px 10px">${esc(k.nudge)}</div>
</div>`).join('');
  return `${label('Ask them for', '#4338ca')}${cards}`;
}

/** Plain-text version, for the text part of the email. */
export function artifactsText(c: InternCard): string[] {
  const a = c.artifacts;
  const out = [`  Artifacts they made: ${a.published.length}${c.project?.commandCenterUrl ? `. Command Center: ${c.project.commandCenterUrl}` : ''}`];
  for (const p of a.published) out.push(`    [${FILE_TYPE[p.fileType].label}] ${kindLabel(p.kind)}: ${p.title}${p.provenance ? ` [${p.provenance}]` : ''} ${p.url}`);
  for (const k of a.asks) out.push(`  ASK: ${k.name}. ${k.why}`, `    Nudge: ${k.nudge}`, ...k.prompt.split('\n').map((l) => `    > ${l}`));
  return out;
}
