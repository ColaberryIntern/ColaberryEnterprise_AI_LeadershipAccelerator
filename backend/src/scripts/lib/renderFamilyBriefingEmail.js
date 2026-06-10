// renderFamilyBriefingEmail
//
// Email-safe HTML renderer for the Family Command Center daily briefing.
//
// Why this exists: the rich browser preview at docs/FAMILY_COMMAND_CENTER_PREVIEW.html
// uses CSS Grid, Flexbox, CSS variables, gradients, box-shadow, ::before / ::after,
// aspect-ratio, and a <style> block inside <body>. Outlook desktop strips or ignores
// most of those, which collapsed the prior briefing email into invisible text and a
// broken layout.
//
// This renderer outputs table-based, inline-styled, hex-colored, 600px-capped HTML
// that renders cleanly in Outlook desktop, Outlook web, Gmail, Apple Mail, iOS Mail.
//
// V2 (CC-20260610-k7m2): the renderer is now 100% DATA-DRIVEN. It accepts a
// `briefingData` object (see CONTRACT below) and renders live content. There is NO
// baked-in content. Every section degrades gracefully to an honest empty state when
// its data source is unavailable, so a stale day's data can never masquerade as fresh.
//
// CONTRACT — briefingData shape (all sections optional; missing => empty state/omit):
//   {
//     date: Date,                         // send date; drives all date chrome
//     hero?: {
//       narrative?: string,               // 1-2 sentence summary; omitted if absent
//       stats?: [{ label: string, tone?: 'alert'|'info'|'neutral' }],
//     },
//     today?: {                           // Section 1
//       events: [{ time, ampm, category?, categoryColorKey?, title, meta?, href?, conflict? }],
//     },
//     week?: {                            // Section 2
//       rangeLabel: string,
//       days: [{ dow, dnum, today?, events?: [{ colorKey?, label }] }],
//     },
//     travel?: {                          // Section 3
//       cards: [{ badgeChar, badgeColorKey?, title, meta?, whenLine?, whenSub?, href? }],
//       notes?: [string],
//     },
//     actions?: [{ tone:'urgent'|'upcoming'|'info', ico, title, sub?, due? }],   // Section 4
//     newSince?: [{ label, title, src?, quote? }],                               // Section 5
//     recap?: { rangeLabel: string, text: string },                             // Section 6
//     flashback?: { intro?, photos?: [[driveId,label]], moments?: [[date,what,ago]], note? }, // 7
//     costs?: { intro?, rows: [{ date, item, for, amount, muted? }], summary?: [{ label, value }] }, // 8
//     risks?: [{ tone:'urgent'|'warn', ico, title, sub? }],                      // Section 9
//     meta?: { sources?: [string], degraded?: [string] },
//   }
//
// Backward compatibility: renderFamilyBriefingEmail({ date }) with no section data
// renders a valid, mostly-empty briefing (used by the mock/preview path and as the
// safe fallback). It never throws on missing fields.

// ----- color palette (hex, no CSS vars) -----
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
  creed: '#2563eb', creedSoft: '#dbeafe',
  addison: '#9333ea', addisonSoft: '#f3e8ff',
  parents: '#ea580c', parentsSoft: '#ffedd5',
  travel: '#0891b2', travelSoft: '#cffafe',
  action: '#dc2626', actionSoft: '#fee2e2',
  ok: '#15803d', okSoft: '#dcfce7',
  info: '#0e7490', infoSoft: '#cffafe',
  warn: '#b45309', warnSoft: '#fef3c7',
};

// Named category color pairs [bg, fg] so the compiler can pass a stable key
// instead of hex, keeping data and presentation decoupled.
const CAT_COLORS = {
  creed: [C.creedSoft, C.creed],
  addison: [C.addisonSoft, C.addison],
  parents: [C.parentsSoft, C.parents],
  travel: [C.travelSoft, C.travel],
  action: [C.actionSoft, C.action],
  work: ['#e2e8f0', C.ink2],
  neutral: [C.lineSoft, C.ink2],
};
function catColor(key) { return CAT_COLORS[key] || CAT_COLORS.neutral; }

const BADGE_COLORS = {
  travel: C.travel,
  orange: '#ea580c',
  navy: C.navy,
};
function badgeColor(key) { return BADGE_COLORS[key] || C.travel; }

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ----- shared partials -----

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
  let out = `<div style="font-size:20px;font-weight:700;color:${C.ink};margin:0 0 ${sub ? '6px' : '14px'} 0;letter-spacing:-.01em;font-family:${FONT}">${esc(t)}</div>`;
  if (sub) out += `<div style="font-size:13px;color:${C.ink2};margin:0 0 16px 0;font-family:${FONT}">${esc(sub)}</div>`;
  return out;
}

function emptyState(msg) {
  return `<div style="font-size:13.5px;color:${C.muted};font-style:italic;font-family:${FONT};padding:6px 0">${esc(msg)}</div>`;
}

function chip(label, bg, fg) {
  return `<span style="display:inline-block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:2px 7px;background:${bg};color:${fg};margin-right:6px;font-family:${FONT}">${esc(label)}</span>`;
}

// ----- date helpers -----
function deriveDate(now) {
  return {
    dayName: now.toLocaleDateString('en-US', { weekday: 'long' }),
    dayShort: now.toLocaleDateString('en-US', { weekday: 'short' }),
    monthName: now.toLocaleDateString('en-US', { month: 'long' }),
    day: now.getDate(),
    year: now.getFullYear(),
  };
}

// ----- HERO -----
function renderHero(d, data) {
  const dateLine = `${d.dayName}, ${d.monthName} ${d.day}, ${d.year} . Wylie, TX`;
  const hero = data.hero || {};
  const narrative = hero.narrative
    ? `<div style="font-size:16px;line-height:1.55;color:#e2e8f0;margin:0 0 16px 0">${esc(hero.narrative)}</div>`
    : '';
  let stats = '';
  if (Array.isArray(hero.stats) && hero.stats.length) {
    const cell = (s) => {
      const tone = s.tone === 'alert'
        ? 'background:rgba(220,38,38,0.25);border:1px solid #fca5a5'
        : s.tone === 'info'
          ? 'background:rgba(8,145,178,0.28);border:1px solid #67e8f9'
          : 'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.4)';
      return `<td style="padding-right:6px"><div style="${tone};color:#ffffff;padding:6px 11px;font-size:12px;font-weight:600;font-family:${FONT}">${esc(s.label)}</div></td>`;
    };
    stats = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${hero.stats.map(cell).join('')}</tr></table>`;
  }
  return `
<tr><td style="padding:0">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.navy}" style="background:${C.navy};border-collapse:separate">
    <tr><td style="padding:28px 28px 24px 28px;font-family:${FONT};color:#ffffff">
      <div style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${C.gold};background:rgba(201,165,92,0.12);padding:5px 10px;border:1px solid ${C.gold}">Family Command Center . Morning Briefing</div>
      <div style="font-size:28px;font-weight:700;color:#ffffff;margin:14px 0 6px 0;letter-spacing:-.02em;line-height:1.2">Good morning, Ali &amp; Addie</div>
      <div style="font-size:14px;color:#cbd5e1;margin:0 0 18px 0">${esc(dateLine)}</div>
      ${narrative}
      ${stats}
    </td></tr>
  </table>
</td></tr>`;
}

// ----- SECTION 1: today's snapshot -----
function timelineRow({ time, ampm, chips, title, meta, href, conflict }) {
  const bgRow = conflict ? `background:${C.actionSoft}` : '';
  const inner = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td width="74" valign="top" style="padding:12px 14px 12px 0;font-size:13px;font-weight:600;color:${C.ink2};font-family:${FONT}">
            ${esc(time)}<span style="font-size:10px;color:${C.muted};font-weight:500;text-transform:uppercase;margin-left:2px">${esc(ampm)}</span>
          </td>
          <td valign="top" style="padding:12px 0">
            <div style="font-size:14.5px;font-weight:600;color:${C.ink};font-family:${FONT};line-height:1.4">${chips}${esc(title)}</div>
            ${meta ? `<div style="font-size:12.5px;color:${C.ink2};margin-top:2px;font-family:${FONT}">${esc(meta)}</div>` : ''}
          </td>
        </tr>
      </table>`;
  const body = href
    ? `<a href="${esc(href)}" target="_blank" style="text-decoration:none;color:inherit;display:block">${inner}</a>`
    : inner;
  return `
<tr>
  <td colspan="2" style="border-top:1px solid ${C.lineSoft};${bgRow}">${body}</td>
</tr>`;
}

function renderSection1Today(d, data) {
  let out = sectionOpen("Section 1 . Today's Snapshot");
  out += hTitle(`${d.dayName} - what affects the family`, 'Work calendar is hidden unless it conflicts with a family event. Click any row to open the event.');
  const events = (data.today && Array.isArray(data.today.events)) ? data.today.events : [];
  if (!events.length) {
    out += emptyState('No family events on the calendar for today.');
  } else {
    out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">`;
    for (const ev of events) {
      let chips = '';
      if (ev.category) chips += chip(ev.category, ...catColor(ev.categoryColorKey || 'neutral'));
      if (ev.conflict) chips += chip('! Conflict', C.actionSoft, C.action);
      out += timelineRow({
        time: ev.time, ampm: ev.ampm, chips,
        title: ev.title, meta: ev.meta, href: ev.href, conflict: ev.conflict,
      });
    }
    out += `</table>`;
  }
  out += sectionClose();
  return out;
}

// ----- SECTION 2: upcoming week (7-column table) -----
function dayCell({ dow, dnum, events, today }) {
  const border = today ? `border:2px solid ${C.navy}` : `border:1px solid ${C.line}`;
  let evHtml = '';
  if (!events || events.length === 0) {
    evHtml = `<div style="font-size:10.5px;color:${C.muted};margin-top:6px;font-style:italic;font-family:${FONT}">No events</div>`;
  } else {
    evHtml = events.map(e => {
      const col = catColor(e.colorKey || 'neutral');
      return `<div style="font-size:10.5px;font-weight:600;padding:4px 6px;background:${col[0]};color:${col[1]};margin-top:4px;line-height:1.25;font-family:${FONT}">${esc(e.label)}</div>`;
    }).join('');
  }
  return `<td valign="top" width="14.28%" style="${border};background:#ffffff;padding:8px;vertical-align:top">
    <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700;font-family:${FONT}">${esc(dow)}</div>
    <div style="font-size:18px;font-weight:700;color:${today ? C.navy : C.ink};line-height:1.1;margin-bottom:6px;font-family:${FONT}">${esc(String(dnum))}</div>
    ${evHtml}
  </td>`;
}

function renderSection2Week(d, data) {
  const week = data.week;
  if (!week || !Array.isArray(week.days) || !week.days.length) return '';
  let out = sectionOpen('Section 2 . Upcoming Week');
  out += hTitle(week.rangeLabel || 'Upcoming week');
  out += `<table role="presentation" cellpadding="0" cellspacing="2" border="0" width="100%" style="border-collapse:separate"><tr>`;
  for (const day of week.days) {
    out += dayCell({ dow: day.dow, dnum: day.dnum, today: day.today, events: day.events });
  }
  out += `</tr></table>`;
  out += sectionClose();
  return out;
}

// ----- SECTION 3: travel -----
function travelCard({ bg, border, badgeBg, badgeChar, title, meta, whenLine, whenSub, whenColor, href }) {
  const inner = `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${bg};border:1px solid ${border};margin-bottom:10px">
    <tr>
      <td width="56" valign="top" style="padding:16px 0 16px 16px">
        <div style="width:40px;height:40px;background:${badgeBg};color:#ffffff;font-size:16px;font-family:${FONT};text-align:center;line-height:40px;font-weight:700">${esc(badgeChar)}</div>
      </td>
      <td valign="middle" style="padding:16px 12px 16px 14px;font-family:${FONT}">
        <div style="font-size:16px;font-weight:700;color:${C.ink};margin:0 0 2px 0">${esc(title)}</div>
        ${meta ? `<div style="font-size:13px;color:${C.ink2}">${esc(meta)}</div>` : ''}
      </td>
      <td width="140" valign="middle" align="right" style="padding:16px 16px 16px 12px;font-family:${FONT}">
        ${whenLine ? `<div style="font-size:13px;font-weight:700;color:${whenColor};text-align:right">${esc(whenLine)}</div>` : ''}
        ${whenSub ? `<div style="font-size:11px;font-weight:500;color:${C.ink2};text-align:right;margin-top:2px">${esc(whenSub)}</div>` : ''}
      </td>
    </tr>
  </table>`;
  return href
    ? `<a href="${esc(href)}" target="_blank" style="text-decoration:none;color:inherit;display:block">${inner}</a>`
    : inner;
}

function renderSection3Travel(d, data) {
  const travel = data.travel;
  const cards = (travel && Array.isArray(travel.cards)) ? travel.cards : [];
  const notes = (travel && Array.isArray(travel.notes)) ? travel.notes : [];
  if (!cards.length && !notes.length) return '';
  let out = sectionOpen('Section 3 . Travel on the Horizon');
  out += hTitle('Trips ahead');
  for (const c of cards) {
    out += travelCard({
      bg: '#fff7ed', border: '#fcd34d',
      badgeBg: badgeColor(c.badgeColorKey || 'orange'), badgeChar: c.badgeChar || 'TRIP',
      title: c.title, meta: c.meta,
      whenLine: c.whenLine, whenSub: c.whenSub, whenColor: '#c2410c',
      href: c.href,
    });
  }
  for (const n of notes) {
    out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px;background:${C.warnSoft};border:1px solid #fde68a">
      <tr><td style="padding:11px 14px;font-size:13px;color:#78350f;line-height:1.55;font-family:${FONT}">${esc(n)}</td></tr>
    </table>`;
  }
  out += sectionClose();
  return out;
}

// ----- SECTION 4: action items -----
function actionItem({ tone, ico, title, sub, due }) {
  const palette = {
    urgent: { bg: '#fff5f5', border: '#fecaca', icoBg: C.action },
    upcoming: { bg: '#fffbeb', border: '#fde68a', icoBg: '#f59e0b' },
    info: { bg: '#f0f9ff', border: '#bae6fd', icoBg: C.info },
  }[tone] || { bg: '#f0f9ff', border: '#bae6fd', icoBg: C.info };
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${palette.bg};border:1px solid ${palette.border};margin-bottom:10px">
  <tr>
    <td width="48" valign="top" style="padding:14px 0 14px 14px">
      <div style="width:32px;height:32px;background:${palette.icoBg};color:#ffffff;font-size:14px;font-weight:700;text-align:center;line-height:32px;font-family:${FONT}">${esc(ico)}</div>
    </td>
    <td valign="top" style="padding:14px 10px 14px 12px;font-family:${FONT}">
      <div style="font-size:14.5px;font-weight:600;color:${C.ink};margin:0 0 2px 0">${esc(title)}</div>
      ${sub ? `<div style="font-size:12.5px;color:${C.ink2};line-height:1.45">${esc(sub)}</div>` : ''}
    </td>
    ${due ? `<td width="100" valign="top" align="right" style="padding:14px 14px 14px 6px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:${C.ink2};font-family:${FONT};white-space:nowrap">${esc(due)}</td>` : ''}
  </tr>
</table>`;
}

function renderSection4Actions(d, data) {
  const actions = Array.isArray(data.actions) ? data.actions : [];
  let out = sectionOpen('Section 4 . Family Action Items');
  out += hTitle('What needs your attention');
  if (!actions.length) {
    out += emptyState('Nothing flagged for action right now.');
  } else {
    for (const a of actions) {
      out += actionItem({ tone: a.tone, ico: a.ico, title: a.title, sub: a.sub, due: a.due });
    }
  }
  out += sectionClose();
  return out;
}

// ----- SECTION 5: new since yesterday -----
function changeRow({ label, title, src, quote }) {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fafbff;border:1px solid ${C.line};margin-bottom:10px">
  <tr>
    <td width="88" valign="top" style="padding:14px 0 14px 14px">
      <div style="display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;padding:4px 8px;background:${C.okSoft};color:${C.ok};font-family:${FONT}">${esc(label)}</div>
    </td>
    <td valign="top" style="padding:14px 14px 14px 12px;font-family:${FONT}">
      <div style="font-size:14px;font-weight:600;color:${C.ink};margin:0 0 2px 0">${esc(title)}</div>
      ${src ? `<div style="font-size:12px;color:${C.ink2};margin:0 0 ${quote ? '8px' : '0'} 0">${esc(src)}</div>` : ''}
      ${quote ? `<div style="font-size:12.5px;color:#334155;border-left:3px solid ${C.line};padding:4px 0 4px 10px;background:#ffffff;line-height:1.5">${esc(quote)}</div>` : ''}
    </td>
  </tr>
</table>`;
}

function renderSection5New(d, data) {
  const items = Array.isArray(data.newSince) ? data.newSince : [];
  let out = sectionOpen('Section 5 . New Since Yesterday');
  out += hTitle('What changed in the last 24 hours');
  if (!items.length) {
    out += emptyState('No new family-relevant email since yesterday.');
  } else {
    for (const it of items) {
      out += changeRow({ label: it.label || 'New', title: it.title, src: it.src, quote: it.quote });
    }
  }
  out += sectionClose();
  return out;
}

// ----- SECTION 6: weekly recap -----
function renderSection6Recap(d, data) {
  const recap = data.recap;
  if (!recap || !recap.text) return '';
  let out = sectionOpen('Section 6 . Weekly Recap');
  out += hTitle(recap.rangeLabel || 'Last 7 days');
  out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fafbff;border:1px solid ${C.line}">
    <tr><td style="padding:14px 16px;font-size:14px;color:${C.ink2};line-height:1.6;font-family:${FONT}">${esc(recap.text)}</td></tr>
  </table>`;
  out += sectionClose();
  return out;
}

// ----- SECTION 7: flashback -----
function renderSection7Flashback(d, data) {
  const fb = data.flashback;
  if (!fb || (!Array.isArray(fb.photos) && !Array.isArray(fb.moments))) return '';
  const photos = Array.isArray(fb.photos) ? fb.photos : [];
  const moments = Array.isArray(fb.moments) ? fb.moments : [];
  let out = sectionOpen('Section 7 . Flashback');
  out += hTitle(fb.heading || 'Recent family moments', fb.intro);

  if (photos.length) {
    out += `<table role="presentation" cellpadding="0" cellspacing="4" border="0" width="100%" style="border-collapse:separate">`;
    for (let i = 0; i < photos.length; i += 5) {
      out += `<tr>`;
      for (let j = 0; j < 5; j++) {
        const photo = photos[i + j];
        if (!photo) { out += `<td width="20%"></td>`; continue; }
        const [id, label] = photo;
        out += `<td width="20%" valign="top" style="padding:0">
          <a href="https://drive.google.com/file/d/${esc(id)}/view" target="_blank" style="display:block">
            <img src="https://drive.google.com/thumbnail?id=${esc(id)}&sz=w400" alt="${esc(label)}" width="100%" style="display:block;width:100%;border:1px solid ${C.line}" />
            <div style="font-size:10px;color:${C.muted};text-align:center;padding:3px 0;font-family:${FONT}">${esc(label)}</div>
          </a>
        </td>`;
      }
      out += `</tr>`;
    }
    out += `</table>`;
  }

  if (moments.length) {
    out += `<div style="font-size:16px;font-weight:700;color:${C.ink};margin:22px 0 10px 0;font-family:${FONT}">Other moments</div>`;
    out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">`;
    for (const [date, what, ago] of moments) {
      out += `<tr><td style="padding:8px 0;border-bottom:1px solid ${C.lineSoft};font-family:${FONT}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td valign="top">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">${esc(date)}</div>
              <div style="font-size:13.5px;font-weight:600;color:${C.ink};margin-top:2px">${esc(what)}</div>
            </td>
            <td valign="top" align="right" width="100" style="font-size:11px;color:${C.muted};font-weight:600">${esc(ago)}</td>
          </tr>
        </table>
      </td></tr>`;
    }
    out += `</table>`;
  }

  if (fb.note) {
    out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:14px;background:${C.warnSoft};border:1px solid #fde68a">
      <tr><td style="padding:11px 14px;font-size:13px;color:#78350f;line-height:1.55;font-family:${FONT}">${esc(fb.note)}</td></tr>
    </table>`;
  }
  out += sectionClose();
  return out;
}

// ----- SECTION 8: upcoming costs -----
function renderSection8Costs(d, data) {
  const costs = data.costs;
  const rows = (costs && Array.isArray(costs.rows)) ? costs.rows : [];
  const summary = (costs && Array.isArray(costs.summary)) ? costs.summary : [];
  if (!rows.length && !summary.length) return '';
  let out = sectionOpen('Section 8 . Upcoming Costs');
  out += hTitle('Costs on the horizon', costs.intro);
  if (rows.length) {
    out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:13.5px;font-family:${FONT};border-collapse:collapse">
      <tr style="border-bottom:2px solid ${C.line}">
        <th align="left" style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">Date</th>
        <th align="left" style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">Item</th>
        <th align="left" style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">For</th>
        <th align="right" style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">Amount</th>
      </tr>`;
    for (const r of rows) {
      const mc = r.muted ? `color:${C.muted}` : '';
      out += `<tr>
        <td style="padding:10px;border-bottom:1px solid ${C.lineSoft};${mc}">${esc(r.date)}</td>
        <td style="padding:10px;border-bottom:1px solid ${C.lineSoft};${mc}">${esc(r.item)}</td>
        <td style="padding:10px;border-bottom:1px solid ${C.lineSoft};${mc}">${esc(r.for)}</td>
        <td align="right" style="padding:10px;border-bottom:1px solid ${C.lineSoft};font-weight:600;${mc}">${esc(r.amount)}</td>
      </tr>`;
    }
    out += `</table>`;
  }
  if (summary.length) {
    out += `<table role="presentation" cellpadding="0" cellspacing="6" border="0" width="100%" style="margin-top:14px;border-collapse:separate"><tr>`;
    const w = Math.floor(100 / summary.length);
    for (const s of summary) {
      out += `<td width="${w}%" valign="top" style="background:#fafbff;border:1px solid ${C.line};padding:12px 14px;font-family:${FONT}">
        <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">${esc(s.label)}</div>
        <div style="font-size:22px;font-weight:700;color:${C.ink};margin-top:4px">${esc(s.value)}</div>
      </td>`;
    }
    out += `</tr></table>`;
  }
  out += sectionClose();
  return out;
}

// ----- SECTION 9: risks -----
function riskItem({ tone, ico, title, sub }) {
  const palette = tone === 'warn'
    ? { bg: '#fffbeb', border: '#fde68a' }
    : { bg: '#fff5f5', border: '#fecaca' };
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${palette.bg};border:1px solid ${palette.border};margin-bottom:10px">
  <tr>
    <td width="40" valign="top" style="padding:14px 0 14px 14px;font-size:18px;text-align:center;font-weight:700;color:${C.action};font-family:${FONT}">${esc(ico)}</td>
    <td valign="top" style="padding:14px 14px 14px 8px;font-family:${FONT}">
      <div style="font-size:14.5px;font-weight:600;color:${C.ink};margin:0 0 2px 0">${esc(title)}</div>
      ${sub ? `<div style="font-size:12.5px;color:${C.ink2};line-height:1.45">${esc(sub)}</div>` : ''}
    </td>
  </tr>
</table>`;
}

function renderSection9Risks(d, data) {
  const risks = Array.isArray(data.risks) ? data.risks : [];
  if (!risks.length) return '';
  let out = sectionOpen('Section 9 . Parent Risk &amp; Blockers');
  out += hTitle('AI-flagged issues');
  for (const r of risks) {
    out += riskItem({ tone: r.tone, ico: r.ico || '!', title: r.title, sub: r.sub });
  }
  out += sectionClose();
  return out;
}

// ----- FOOTER -----
function renderFooter(d, data) {
  const sources = (data.meta && Array.isArray(data.meta.sources) && data.meta.sources.length)
    ? data.meta.sources.join(', ')
    : 'live Google Calendar + Gmail';
  const degraded = (data.meta && Array.isArray(data.meta.degraded) && data.meta.degraded.length)
    ? `<br/><span style="color:${C.warn}">Limited data this run: ${esc(data.meta.degraded.join(', '))}.</span>`
    : '';
  return `
<tr><td style="padding:32px 16px 16px 16px;text-align:center;font-family:${FONT}">
  <div style="font-size:11px;color:${C.muted};line-height:1.6">
    <strong style="color:${C.ink2}">Family Command Center . Briefing v2</strong><br/>
    Generated ${esc(d.dayName)} ${esc(d.monthName)} ${esc(String(d.day))}, ${esc(String(d.year))} . Sources: ${esc(sources)}.${degraded}<br/>
    Reply to ali@colaberry.com or comment on the Basecamp Message Board to adjust.
  </div>
</td></tr>`;
}

// ----- TOP BANNER -----
function renderTopBanner(d) {
  const today = `${d.dayName} ${d.monthName} ${d.day}, ${d.year}`;
  return `
<tr><td bgcolor="${C.navy}" style="background:${C.navy};color:#ffffff;text-align:center;font-size:11px;padding:8px 12px;letter-spacing:.06em;font-family:${FONT}">
  Family Command Center . daily briefing . ${esc(today)} . sent to Ali &amp; Addie
</td></tr>`;
}

// ----- PREHEADER (hidden inbox snippet) -----
function renderPreheader(d, data) {
  const snippet = (data.hero && data.hero.narrative)
    ? data.hero.narrative.slice(0, 120)
    : `${d.dayName} ${d.monthName} ${d.day} family briefing.`;
  return `
<div style="display:none;font-size:1px;color:${C.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">
  ${esc(snippet)}
</div>`;
}

// ----- TOP-LEVEL RENDER -----
function renderFamilyBriefingEmail(briefingData = {}) {
  const now = briefingData.date || new Date();
  const d = deriveDate(now);
  const data = briefingData || {};

  const body = [
    renderHero(d, data),
    renderSection1Today(d, data),
    renderSection2Week(d, data),
    renderSection3Travel(d, data),
    renderSection4Actions(d, data),
    renderSection5New(d, data),
    renderSection6Recap(d, data),
    renderSection7Flashback(d, data),
    renderSection8Costs(d, data),
    renderSection9Risks(d, data),
    renderFooter(d, data),
  ].filter(Boolean).join('\n');

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Family Command Center - ${esc(d.dayName)} ${esc(d.monthName)} ${esc(String(d.day))} briefing</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, p, a, h1, h2, h3, h4, h5, h6, div, span { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT};color:${C.ink};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
${renderPreheader(d, data)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.bg}" style="background:${C.bg}">
  ${renderTopBanner(d)}
  <tr><td align="center" style="padding:18px 8px 60px 8px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px">
      ${body}
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

module.exports = { renderFamilyBriefingEmail };
