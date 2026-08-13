// emailLayoutKit.js
//
// Shared primitives for table-based, inline-styled transactional email HTML.
// Extracted from the construction pattern proven in renderFamilyDashboardEmail.js
// so a second (and third) dashboard email does not re-derive the palette, the
// escaping, the 600px shell, or the Outlook conditional block.
//
// Design constraints this file encodes, all of them email-client facts rather
// than preferences:
//   - Tables, not flex/grid. Outlook desktop uses the Word rendering engine.
//   - Inline hex styles, not CSS variables or classes. Gmail strips <style>.
//   - No JavaScript, no external assets, no web fonts.
//   - 600px content cap, the widest reliably safe column across clients.
//   - Gmail clips a message body over ~102KB. Callers should measure.
//
// On font-family: it is declared on the shell wrappers and on each section cell
// ONLY, and inherited everywhere below. Repeating the stack per element is the
// usual defensive habit, but it cost 15KB of a 112KB body here, which is real
// budget against the Gmail clip. Outlook is the one engine that drops
// inheritance into nested tables, and the mso block in shell() already forces
// Arial there with !important. Please do not "fix" this by re-adding it to every
// div and span; measure first.
//
// renderFamilyDashboardEmail.js still carries its own copies of esc/chip/
// sectionOpen; it is working and shipping daily, so it is left alone. Migrate it
// here the next time it is touched.

const C = {
  navy: '#1a365d',
  navyDeep: '#0f2540',
  gold: '#c9a55c',
  bg: '#f6f7fb',
  card: '#ffffff',
  line: '#e2e8f0',
  lineSoft: '#eef2f7',
  ink: '#0f172a',
  ink2: '#475569',
  muted: '#94a3b8',
  action: '#dc2626', actionSoft: '#fee2e2',
  ok: '#15803d', okSoft: '#dcfce7',
  info: '#0e7490', infoSoft: '#cffafe',
  warn: '#b45309', warnSoft: '#fef3c7',
  accent: '#2b6cb0', accentSoft: '#e0ecf9',
};

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const MONO = `'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace`;

// Em-dashes are barred from every outbound send (operating doctrine). The
// snapshot carries hundreds of them in raw Basecamp comment text, so stripping
// has to happen at render time, not at authoring time.
function stripEmDash(s) {
  return String(s == null ? '' : s).replace(/—/g, '-').replace(/–/g, '-');
}

function esc(s) {
  return stripEmDash(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Basecamp comment bodies arrive as HTML. Email wants a short plain excerpt, so
// tags are dropped rather than sanitized: no tag survives to be exploited.
function excerpt(html, max = 220) {
  const text = stripEmDash(html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return esc(text);
  return esc(text.slice(0, max).replace(/\s+\S*$/, '')) + '&hellip;';
}

// tone -> [background, foreground]. The vocabulary matches the tones the
// snapshot already emits (risk / warning / good / info / neutral / accent).
function toneColors(tone) {
  switch (tone) {
    case 'risk': return [C.actionSoft, C.action];
    case 'warning': case 'warn': return [C.warnSoft, C.warn];
    case 'good': return [C.okSoft, C.ok];
    case 'info': return [C.infoSoft, C.info];
    case 'accent': return [C.accentSoft, C.accent];
    default: return [C.lineSoft, C.ink2];
  }
}

function chip(label, tone) {
  const [bg, fg] = toneColors(tone);
  return `<span style="display:inline-block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:2px 7px;background:${bg};color:${fg};white-space:nowrap">${esc(label)}</span>`;
}

function sectionOpen(tag) {
  return `
<tr><td style="padding:9px 0 0 0">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.card};border:1px solid ${C.line};border-collapse:separate">
    <tr><td style="padding:22px 22px 20px 22px;font-family:${FONT};color:${C.ink}">
      <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${C.ink2};font-weight:700;margin:0 0 4px 0">${esc(tag)}</div>`;
}

function sectionClose() {
  return `</td></tr></table>
</td></tr>`;
}

function hTitle(t, sub) {
  let out = `<div style="font-size:20px;font-weight:700;color:${C.ink};margin:0 0 ${sub ? '6px' : '14px'} 0;letter-spacing:-.01em">${esc(t)}</div>`;
  if (sub) out += `<div style="font-size:13px;color:${C.ink2};margin:0 0 16px 0;line-height:1.5">${esc(sub)}</div>`;
  return out;
}

function statCard(label, value, sub, tone) {
  const [, fg] = toneColors(tone);
  return `<td width="33%" valign="top" style="background:#fafbff;border:1px solid ${C.line};padding:12px 14px">
    <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">${esc(label)}</div>
    <div style="font-size:22px;font-weight:700;color:${tone ? fg : C.ink};margin-top:4px">${esc(value)}</div>
    ${sub ? `<div style="font-size:11px;color:${C.muted};margin-top:3px;line-height:1.4">${esc(sub)}</div>` : ''}
  </td>`;
}

// Progress bar as a two-cell table. A div with a percentage width is unreliable
// in Outlook; a table with width attributes is not.
function bar(pct, reason, width = 120) {
  if (pct == null) {
    return `<span style="font-size:11.5px;color:${C.muted};font-style:italic">${esc(reason || 'not calculable')}</span>`;
  }
  const fill = Math.max(2, Math.min(100, Math.round(pct)));
  const color = pct >= 80 ? C.ok : pct >= 50 ? C.accent : pct >= 25 ? C.warn : C.action;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr>
    <td width="${width}" style="width:${width}px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.lineSoft}" style="background:${C.lineSoft};border-collapse:collapse"><tr>
      <td width="${fill}%" bgcolor="${color}" style="background:${color};height:8px;line-height:8px;font-size:0">&nbsp;</td>
      <td style="height:8px;line-height:8px;font-size:0">&nbsp;</td>
    </tr></table></td>
    <td style="padding-left:8px;font-size:12px;font-weight:700;color:${C.ink};white-space:nowrap">${Math.round(pct)}%</td>
  </tr></table>`;
}

// Block-character sparkline. An image would need hosting and a real chart needs
// JavaScript; eight Unicode block glyphs need neither and survive every client.
const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
function sparkline(series, color) {
  if (!series || !series.length) return '';
  const counts = series.map((d) => d.count);
  const max = Math.max(...counts, 1);
  const glyphs = counts.map((n) => (n === 0 ? '·' : BLOCKS[Math.min(BLOCKS.length - 1, Math.round((n / max) * (BLOCKS.length - 1)))])).join('');
  return `<span style="font-family:${MONO};font-size:15px;line-height:1;letter-spacing:1px;color:${color || C.accent}">${glyphs}</span>`;
}

function link(url, label, color) {
  return `<a href="${esc(url)}" style="color:${color || C.accent};text-decoration:none;font-weight:600">${esc(label)}</a>`;
}

function button(url, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td bgcolor="${C.accent}" style="background:${C.accent};padding:10px 18px"><a href="${esc(url)}" style="color:#ffffff;text-decoration:none;font-weight:700;font-size:13.5px">${esc(label)}</a></td>
  </tr></table>`;
}

function preheader(text) {
  return `
<div style="display:none;font-size:1px;color:${C.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${esc(text)}</div>`;
}

function topBanner(text) {
  return `
<tr><td bgcolor="${C.navy}" style="background:${C.navy};color:#ffffff;text-align:center;font-size:11px;padding:8px 12px;letter-spacing:.06em">${esc(text)}</td></tr>`;
}

// The outer shell. `body` is a string of <tr> rows for the 600px column.
function shell({ title, preheaderText, banner, body }) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${esc(title)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, p, a, h1, h2, h3, h4, h5, h6, div, span { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT};color:${C.ink};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
${preheaderText ? preheader(preheaderText) : ''}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.bg}" style="background:${C.bg};font-family:${FONT}">
  ${banner ? topBanner(banner) : ''}
  <tr><td align="center" style="padding:18px 8px 60px 8px;font-family:${FONT}">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;font-family:${FONT}">
      ${body}
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

module.exports = {
  C, FONT, MONO, esc, stripEmDash, excerpt, toneColors, chip,
  sectionOpen, sectionClose, hTitle, statCard, bar, sparkline, link, button,
  preheader, topBanner, shell,
};
