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
// This renderer outputs the same content as table-based, inline-styled, hex-colored,
// 600px-capped HTML that renders cleanly in Outlook desktop, Outlook web, Gmail,
// Apple Mail, and iOS Mail.
//
// V1: content is baked in (matches the static browser preview). V2 will accept a
// briefingData object pulled from Gmail + Calendar in real time.
//
// Session originator: CC-20260609-em4f

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

function chip(label, bg, fg) {
  return `<span style="display:inline-block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:2px 7px;background:${bg};color:${fg};margin-right:6px;font-family:${FONT}">${esc(label)}</span>`;
}

// ----- HERO -----
function renderHero(d) {
  const dateLine = `${d.dayName}, ${d.monthName} ${d.day}, ${d.year} . Wylie, TX`;
  return `
<tr><td style="padding:0">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.navy}" style="background:${C.navy};border-collapse:separate">
    <tr><td style="padding:28px 28px 24px 28px;font-family:${FONT};color:#ffffff">
      <div style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${C.gold};background:rgba(201,165,92,0.12);padding:5px 10px;border:1px solid ${C.gold}">Family Command Center . Morning Briefing</div>
      <div style="font-size:28px;font-weight:700;color:#ffffff;margin:14px 0 6px 0;letter-spacing:-.02em;line-height:1.2">Good morning, Ali &amp; Addie</div>
      <div style="font-size:14px;color:#cbd5e1;margin:0 0 18px 0">${esc(dateLine)}</div>
      <div style="font-size:16px;line-height:1.55;color:#e2e8f0;margin:0 0 16px 0">
        Big week. Today: <strong style="color:#ffffff">Addison's orthodontist at 3:00 PM</strong> (collides with your AegisFX call).
        <strong style="color:#ffffff">Tomorrow you leave for Nashville</strong> back Saturday so the kids' Thursday school day
        (Jersey Day for FIFA Opening + Kona Ice) will be Addie's call.
        Corpus Christi family trip is also still on the horizon for Jul 26-29.
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding-right:6px"><div style="background:rgba(220,38,38,0.25);border:1px solid #fca5a5;color:#ffffff;padding:6px 11px;font-size:12px;font-weight:600;font-family:${FONT}">! 1 conflict at 3 PM today</div></td>
          <td style="padding-right:6px"><div style="background:rgba(8,145,178,0.28);border:1px solid #67e8f9;color:#ffffff;padding:6px 11px;font-size:12px;font-weight:600;font-family:${FONT}">Leave for Nashville tomorrow</div></td>
          <td style="padding-right:6px"><div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.4);color:#ffffff;padding:6px 11px;font-size:12px;font-weight:600;font-family:${FONT}">3 new since yesterday</div></td>
          <td><div style="background:rgba(8,145,178,0.28);border:1px solid #67e8f9;color:#ffffff;padding:6px 11px;font-size:12px;font-weight:600;font-family:${FONT}">Corpus Christi in 47 days</div></td>
        </tr>
      </table>
    </td></tr>
  </table>
</td></tr>`;
}

// ----- SECTION 1: today's snapshot -----
function timelineRow({ time, ampm, chips, title, meta, href, conflict }) {
  const bgRow = conflict ? `background:${C.actionSoft}` : '';
  return `
<tr>
  <td colspan="2" style="border-top:1px solid ${C.lineSoft};${bgRow}">
    <a href="${href}" target="_blank" style="text-decoration:none;color:inherit;display:block">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td width="74" valign="top" style="padding:12px 14px 12px 0;font-size:13px;font-weight:600;color:${C.ink2};font-family:${FONT}">
            ${esc(time)}<span style="font-size:10px;color:${C.muted};font-weight:500;text-transform:uppercase;margin-left:2px">${esc(ampm)}</span>
          </td>
          <td valign="top" style="padding:12px 0">
            <div style="font-size:14.5px;font-weight:600;color:${C.ink};font-family:${FONT};line-height:1.4">${chips}${esc(title)}</div>
            <div style="font-size:12.5px;color:${C.ink2};margin-top:2px;font-family:${FONT}">${esc(meta)}</div>
          </td>
        </tr>
      </table>
    </a>
  </td>
</tr>`;
}

function renderSection1Today() {
  let out = sectionOpen("Section 1 . Today's Snapshot");
  out += hTitle('Tuesday - what affects the family', 'Work calendar is hidden unless it conflicts with a family event. Click any row to open the event.');
  out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">`;
  out += timelineRow({
    time: '6:00', ampm: 'am',
    chips: chip('Parents', C.parentsSoft, C.parents),
    title: 'Get kids to school',
    meta: 'Recurring . 30 min',
    href: 'https://www.google.com/calendar/u/0/r/day/2026/6/9',
  });
  out += timelineRow({
    time: '3:00', ampm: 'pm',
    chips: chip('Addison', C.addisonSoft, C.addison) + chip('! Conflict', C.actionSoft, C.action),
    title: 'Orthodontist - Dr. Robertson',
    meta: '3:00-4:00 PM . Family calendar . overlaps with AegisFX call below',
    href: 'https://www.google.com/calendar/u/0/r/day/2026/6/9',
    conflict: true,
  });
  out += timelineRow({
    time: '3:00', ampm: 'pm',
    chips: chip('Work (conflict only)', '#e2e8f0', C.ink2),
    title: 'AegisFX Autonomous Trading System',
    meta: '3:00-3:30 PM . same window as Addison\'s appointment',
    href: 'https://www.google.com/calendar/u/0/r/day/2026/6/9',
    conflict: true,
  });
  out += `</table>`;
  out += sectionClose();
  return out;
}

// ----- SECTION 2: upcoming week (7-column table) -----
function dayCell({ dow, dnum, events, today }) {
  const border = today ? `border:2px solid ${C.navy}` : `border:1px solid ${C.line}`;
  let evHtml = '';
  if (!events || events.length === 0) {
    evHtml = `<div style="font-size:10.5px;color:${C.muted};margin-top:6px;font-style:italic;font-family:${FONT}">No family events</div>`;
  } else {
    evHtml = events.map(e => {
      const col = {
        creed: [C.creedSoft, C.creed],
        addison: [C.addisonSoft, C.addison],
        parents: [C.parentsSoft, C.parents],
        travel: [C.travelSoft, C.travel],
        action: [C.actionSoft, C.action],
      }[e.cat] || [C.lineSoft, C.ink2];
      return `<div style="font-size:10.5px;font-weight:600;padding:4px 6px;background:${col[0]};color:${col[1]};margin-top:4px;line-height:1.25;font-family:${FONT}">${esc(e.label)}</div>`;
    }).join('');
  }
  return `<td valign="top" width="14.28%" style="${border};background:#ffffff;padding:8px;vertical-align:top">
    <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700;font-family:${FONT}">${esc(dow)}</div>
    <div style="font-size:18px;font-weight:700;color:${today ? C.navy : C.ink};line-height:1.1;margin-bottom:6px;font-family:${FONT}">${esc(String(dnum))}</div>
    ${evHtml}
  </td>`;
}

function renderSection2Week() {
  let out = sectionOpen('Section 2 . Upcoming Week');
  out += hTitle('Jun 9 - Jun 15 family calendar');
  out += `<table role="presentation" cellpadding="0" cellspacing="2" border="0" width="100%" style="border-collapse:separate">
    <tr>
      ${dayCell({ dow: 'Tue', dnum: 9, today: true, events: [
        { cat: 'addison', label: '3p Addison ortho' },
        { cat: 'action', label: '! 3p conflict' },
      ]})}
      ${dayCell({ dow: 'Wed', dnum: 10, events: [
        { cat: 'travel', label: 'Flight DFW to BNA' },
        { cat: 'travel', label: 'Nashville' },
      ]})}
      ${dayCell({ dow: 'Thu', dnum: 11, events: [
        { cat: 'travel', label: 'Nashville' },
        { cat: 'creed', label: 'Jersey Day' },
        { cat: 'creed', label: 'Kona Ice' },
      ]})}
      ${dayCell({ dow: 'Fri', dnum: 12, events: [
        { cat: 'travel', label: 'Nashville' },
      ]})}
      ${dayCell({ dow: 'Sat', dnum: 13, events: [
        { cat: 'travel', label: 'Flight BNA to DFW' },
      ]})}
      ${dayCell({ dow: 'Sun', dnum: 14, events: [] })}
      ${dayCell({ dow: 'Mon', dnum: 15, events: [
        { cat: 'creed', label: 'Ms. Brenda back' },
      ]})}
    </tr>
  </table>`;
  out += sectionClose();
  return out;
}

// ----- SECTION 3: travel -----
function travelCard({ bg, border, badgeBg, badgeChar, title, meta, whenLine, whenSub, whenColor, href }) {
  return `
<a href="${href}" target="_blank" style="text-decoration:none;color:inherit;display:block">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${bg};border:1px solid ${border};margin-bottom:10px">
    <tr>
      <td width="56" valign="top" style="padding:16px 0 16px 16px">
        <div style="width:40px;height:40px;background:${badgeBg};color:#ffffff;font-size:20px;font-family:${FONT};text-align:center;line-height:40px;font-weight:700">${badgeChar}</div>
      </td>
      <td valign="middle" style="padding:16px 12px 16px 14px;font-family:${FONT}">
        <div style="font-size:16px;font-weight:700;color:${C.ink};margin:0 0 2px 0">${esc(title)}</div>
        <div style="font-size:13px;color:${C.ink2}">${meta}</div>
      </td>
      <td width="140" valign="middle" align="right" style="padding:16px 16px 16px 12px;font-family:${FONT}">
        <div style="font-size:13px;font-weight:700;color:${whenColor};text-align:right">${esc(whenLine)}</div>
        <div style="font-size:11px;font-weight:500;color:${C.ink2};text-align:right;margin-top:2px">${esc(whenSub)}</div>
      </td>
    </tr>
  </table>
</a>`;
}

function renderSection3Travel() {
  let out = sectionOpen('Section 3 . Travel on the Horizon');
  out += hTitle('Trips ahead');
  out += travelCard({
    bg: '#fff7ed', border: '#fcd34d',
    badgeBg: '#ea580c', badgeChar: 'NSH',
    title: 'Nashville - work trip (ShipCES, likely)',
    meta: `DFW to BNA outbound . BNA to DFW return . Coach . <strong style="color:${C.ink}">just added to calendar</strong> . Addie acknowledged 1:50 AM today`,
    whenLine: 'Jun 10 -> Jun 13', whenSub: 'tomorrow . 4 days . back Sat', whenColor: '#c2410c',
    href: 'https://www.google.com/calendar/u/0/r/day/2026/6/10',
  });
  out += travelCard({
    bg: '#ecfeff', border: C.travelSoft,
    badgeBg: C.travel, badgeChar: 'CC',
    title: 'Corpus Christi - Fairfield Inn &amp; Suites Central',
    meta: `522 South Padre Island Dr . 2 rooms (joining/adjacent) . Conf <strong style="color:${C.ink}">TGKQN2NM9</strong>`,
    whenLine: 'Jul 26 -> Jul 29', whenSub: 'in 47 days . 3 nights', whenColor: C.travel,
    href: 'https://www.google.com/calendar/u/0/r/day/2026/7/26',
  });
  out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px;background:${C.warnSoft};border:1px solid #fde68a">
    <tr><td style="padding:11px 14px;font-size:13px;color:#78350f;line-height:1.55;font-family:${FONT}">
      ! <strong>Duplicate detected on your calendar:</strong> Corpus Christi is on Ali's calendar twice - once as the manual entry from Apr 30 (linked above), and again as a Gmail-auto-generated event from May 29. Recommend removing the auto-generated one to avoid noise.
    </td></tr>
  </table>`;
  out += sectionClose();
  return out;
}

// ----- SECTION 4: action items -----
function actionItem({ tone, ico, title, sub, due }) {
  const palette = {
    urgent: { bg: '#fff5f5', border: '#fecaca', icoBg: C.action },
    upcoming: { bg: '#fffbeb', border: '#fde68a', icoBg: '#f59e0b' },
    info: { bg: '#f0f9ff', border: '#bae6fd', icoBg: C.info },
  }[tone];
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${palette.bg};border:1px solid ${palette.border};margin-bottom:10px">
  <tr>
    <td width="48" valign="top" style="padding:14px 0 14px 14px">
      <div style="width:32px;height:32px;background:${palette.icoBg};color:#ffffff;font-size:14px;font-weight:700;text-align:center;line-height:32px;font-family:${FONT}">${ico}</div>
    </td>
    <td valign="top" style="padding:14px 10px 14px 12px;font-family:${FONT}">
      <div style="font-size:14.5px;font-weight:600;color:${C.ink};margin:0 0 2px 0">${esc(title)}</div>
      <div style="font-size:12.5px;color:${C.ink2};line-height:1.45">${esc(sub)}</div>
    </td>
    <td width="100" valign="top" align="right" style="padding:14px 14px 14px 6px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:${C.ink2};font-family:${FONT};white-space:nowrap">${due}</td>
  </tr>
</table>`;
}

function renderSection4Actions() {
  let out = sectionOpen('Section 4 . Family Action Items');
  out += hTitle('What needs your attention');
  out += actionItem({
    tone: 'urgent', ico: '!',
    title: 'Resolve 3:00 PM conflict - Addison ortho vs AegisFX call',
    sub: 'Either reschedule AegisFX (Sunday Dadag - likely flexible) or confirm Addie covers ortho. Decide before noon.',
    due: 'Today<br>by 12:00pm',
  });
  out += actionItem({
    tone: 'urgent', ico: 'TRIP',
    title: 'Nashville prep - leaving tomorrow (Wed Jun 10)',
    sub: 'Confirm flight times (Expedia booking was at SEATS step - verify it completed). Pack. Brief Addie on Creed\'s Thursday Jersey Day + Kona Ice so she has it covered.',
    due: 'Tonight',
  });
  out += actionItem({
    tone: 'upcoming', ico: 'CRD',
    title: 'Thursday: Creed wears a jersey for FIFA Opening Day',
    sub: 'Procare announcement from Ms. Brenda\'s class. You\'ll be in Nashville - flag this to Addie when packing tonight.',
    due: 'Thu Jun 11',
  });
  out += actionItem({
    tone: 'upcoming', ico: 'ICE',
    title: 'Heads up: Kona Ice Thursday (replaces ice cream party)',
    sub: 'Tell Creed so he isn\'t expecting the ice cream party. No money required - included.',
    due: 'Thu Jun 11',
  });
  out += actionItem({
    tone: 'info', ico: 'INFO',
    title: 'Ms. Brenda out this week - returns Monday Jun 15',
    sub: 'If you have a question/request for Creed\'s class, route to the office or wait until Monday.',
    due: 'Through Sun',
  });
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
      <div style="font-size:12px;color:${C.ink2};margin:0 0 ${quote ? '8px' : '0'} 0">${esc(src)}</div>
      ${quote ? `<div style="font-size:12.5px;color:#334155;border-left:3px solid ${C.line};padding:4px 0 4px 10px;background:#ffffff;line-height:1.5">${esc(quote)}</div>` : ''}
    </td>
  </tr>
</table>`;
}

function renderSection5New() {
  let out = sectionOpen('Section 5 . New Since Yesterday');
  out += hTitle('What changed in the last 24 hours');
  out += changeRow({
    label: 'New',
    title: 'Procare Office Chat - Ms. Brenda\'s class announcement (3 items)',
    src: 'Procare . 2:32 PM yesterday . re: Creed Muwwakkil at Liberty Private School',
    quote: '"Ms. Brenda will be on vacation and will return on Monday. There will be Kona Ice on Thursday for the schoolers instead of an Ice Cream Party. Thursday is Jersey Day in celebration of FIFA Opening Day!"',
  });
  out += changeRow({
    label: 'New',
    title: 'Addison orthodontist invite - Dr. Robertson . today 3-4 PM',
    src: 'Google Calendar invite (Family) . received yesterday 2:50 PM',
  });
  out += changeRow({
    label: 'New',
    title: 'Nashville trip Jun 10-12 - added to calendar just now',
    src: 'Source: Expedia booking link you shared . attendees: Addie + alimuwwakkil@gmail.com',
    quote: 'From Addie 1:50 AM today: "Thank you for informing me of your travel plans. For future purposes, I would like more notice for days you\'ll be out of town. It gives me the opportunity to adjust my schedule accordingly."',
  });
  out += sectionClose();
  return out;
}

// ----- SECTION 6: weekly recap -----
function renderSection6Recap() {
  let out = sectionOpen('Section 6 . Weekly Recap');
  out += hTitle('Last 7 days (Jun 2 - Jun 8)');
  out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fafbff;border:1px solid ${C.line}">
    <tr><td style="padding:14px 16px;font-size:14px;color:${C.ink2};line-height:1.6;font-family:${FONT}">
      Addison had <strong style="color:${C.ink}">Sand Volleyball at Los Rios</strong> both Sunday (Jun 7) and Monday (Jun 8) evening, 6-8 PM. Creed's classroom posted a midweek Office Chat with three announcements (teacher vacation, Kona Ice, Jersey Day). No school payments cleared this week - the last Procare charges were in mid-May. A quiet week on the family front.
    </td></tr>
  </table>`;
  out += sectionClose();
  return out;
}

// ----- SECTION 7: flashback (simplified for email: links, not embedded grid) -----
const FLASHBACK_PHOTOS = [
  ['1Om6cz3ZrjufjTWuADcqBG2HJ9CQiOiqC', '7057'],
  ['12SfzRBL2uKh8PNxQ-_DScMGezDexj7DU', '7057b'],
  ['1jaEtLAkyq-EXbiupPbm_FVAGNGCV8Cxx', '7058'],
  ['1IFyt4AerB5AKzcdI1KmX0xfItLLpauxN', '7059'],
  ['1Li9_oPKa3nqc2MBM1hZkbxVW7LeqfPZr', '7060'],
  ['1SGDxIwG0NCbUdEgOBgaQrrwok95URadw', '7061'],
  ['1nLuGCx98dXiQV3uR3P0nlge09hFbWb7B', '7062'],
  ['1jFjhZ9RanwTBorSGQcCM3mPebkkEYwnz', '7063'],
  ['15twc93BlMiW8pXHKQJfC0I-sQ_20DawG', '7064'],
  ['1kE8RIrv1X4zLuwEaplFZLnrgkVoxSeKH', '7065'],
  ['1dy4vw6Cr7feUpQigYZX9zbdW5LJD248m', '7066'],
  ['1fHA3Dn9iqsm4HSa8AaQFYr83TLrolta5', '7067'],
  ['1RHq7gEnY0TOV1C2hZuL7PG6050_eFi8E', '7068'],
  ['1f72uJlp0evPPX8e9aeD5-4uiDwG3BezA', '7204'],
  ['1Q0IFOp60YsB-35uoOYypyXiCvIAx43ar', '7205'],
];

function renderSection7Flashback() {
  let out = sectionOpen('Section 7 . Flashback');
  out += hTitle('Creed\'s Primrose Graduation Pictures', 'From Karla Estrada (Primrose Wylie asst. director) . 3 emails sent Apr 30, 2026 - 40 days ago . 15 photos total. Click any thumbnail to open it in Drive.');
  // 5-column thumbnail grid as table
  out += `<table role="presentation" cellpadding="0" cellspacing="4" border="0" width="100%" style="border-collapse:separate">`;
  for (let i = 0; i < FLASHBACK_PHOTOS.length; i += 5) {
    out += `<tr>`;
    for (let j = 0; j < 5; j++) {
      const photo = FLASHBACK_PHOTOS[i + j];
      if (!photo) { out += `<td width="20%"></td>`; continue; }
      const [id, label] = photo;
      out += `<td width="20%" valign="top" style="padding:0">
        <a href="https://drive.google.com/file/d/${id}/view" target="_blank" style="display:block">
          <img src="https://drive.google.com/thumbnail?id=${id}&sz=w400" alt="${esc(label)}" width="100%" style="display:block;width:100%;border:1px solid ${C.line}" />
          <div style="font-size:10px;color:${C.muted};text-align:center;padding:3px 0;font-family:${FONT}">${esc(label)}</div>
        </a>
      </td>`;
    }
    out += `</tr>`;
  }
  out += `</table>`;

  // Other moments
  out += `<div style="font-size:16px;font-weight:700;color:${C.ink};margin:22px 0 10px 0;font-family:${FONT}">Other moments - last 60 days</div>`;
  const moments = [
    ['Mon . Jun 8', 'Addison . Sand Volleyball at Los Rios', '2 days ago'],
    ['Sun . Jun 7', 'Addison . Sand Volleyball at Los Rios', '3 days ago'],
    ['Fri . May 22', 'Family stay . Country Inn &amp; Suites, Texarkana', '17 days ago'],
    ['Thu . Apr 30', 'Creed . last Office Chat at Primrose Wylie before switching to Liberty', '40 days ago'],
    ['Wed . Apr 29', 'Family stay . DoubleTree, San Antonio Downtown', '41 days ago'],
    ['Mon . Apr 27', 'Creed . registered for Liberty Private School Summer Camp', '43 days ago'],
  ];
  out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">`;
  for (const [date, what, ago] of moments) {
    out += `<tr><td style="padding:8px 0;border-bottom:1px solid ${C.lineSoft};font-family:${FONT}">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td valign="top">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">${date}</div>
            <div style="font-size:13.5px;font-weight:600;color:${C.ink};margin-top:2px">${what}</div>
          </td>
          <td valign="top" align="right" width="100" style="font-size:11px;color:${C.muted};font-weight:600">${esc(ago)}</td>
        </tr>
      </table>
    </td></tr>`;
  }
  out += `</table>`;

  out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:14px;background:${C.warnSoft};border:1px solid #fde68a">
    <tr><td style="padding:11px 14px;font-size:13px;color:#78350f;line-height:1.55;font-family:${FONT}">
      <strong>Why only Apr 30 photos and nothing older?</strong> The 15 photos above are real - Karla Estrada at Primrose Wylie sent them by Gmail to your ali_muwwakkil@hotmail.com on Apr 30, and you forwarded them to Addie's Gmail (which is how this report can see them). Going back further in Gmail, school photos hit a wall: your old school comms all lived in Hotmail, and the Hotmail to Gmail forward rule only started Jun 3, 2026 (5 weeks ago). Liberty (current school) and Procare (both schools) never send photos by email - those live in the Procare Parent Portal app. Once you wire in Google Photos, the rest of Creed's history will surface here automatically.
    </td></tr>
  </table>`;
  out += sectionClose();
  return out;
}

// ----- SECTION 8: upcoming costs -----
function renderSection8Costs() {
  let out = sectionOpen('Section 8 . Upcoming Costs');
  out += hTitle('Nothing due this week', 'May Procare charges totaled $660. Next charge expected mid-June based on prior pattern.');
  out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:13.5px;font-family:${FONT};border-collapse:collapse">
    <tr style="border-bottom:2px solid ${C.line}">
      <th align="left" style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">Date</th>
      <th align="left" style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">Item</th>
      <th align="left" style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">For</th>
      <th align="right" style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">Amount</th>
    </tr>
    <tr><td style="padding:10px;border-bottom:1px solid ${C.lineSoft}">~Jun 15 (proj)</td><td style="padding:10px;border-bottom:1px solid ${C.lineSoft}">Procare monthly charge</td><td style="padding:10px;border-bottom:1px solid ${C.lineSoft}">Creed (Liberty)</td><td align="right" style="padding:10px;border-bottom:1px solid ${C.lineSoft};font-weight:600">$330</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid ${C.lineSoft}">~Jun 16 (proj)</td><td style="padding:10px;border-bottom:1px solid ${C.lineSoft}">Procare secondary charge</td><td style="padding:10px;border-bottom:1px solid ${C.lineSoft}">Creed (Liberty)</td><td align="right" style="padding:10px;border-bottom:1px solid ${C.lineSoft};font-weight:600">$330</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid ${C.lineSoft};color:${C.muted}">May 16</td><td style="padding:10px;border-bottom:1px solid ${C.lineSoft};color:${C.muted}">Procare (cleared)</td><td style="padding:10px;border-bottom:1px solid ${C.lineSoft};color:${C.muted}">Creed</td><td align="right" style="padding:10px;border-bottom:1px solid ${C.lineSoft};font-weight:600;color:${C.muted}">$330</td></tr>
    <tr><td style="padding:10px;color:${C.muted}">May 15</td><td style="padding:10px;color:${C.muted}">Procare (cleared)</td><td style="padding:10px;color:${C.muted}">Creed</td><td align="right" style="padding:10px;font-weight:600;color:${C.muted}">$330</td></tr>
  </table>`;
  out += `<table role="presentation" cellpadding="0" cellspacing="6" border="0" width="100%" style="margin-top:14px;border-collapse:separate">
    <tr>
      <td width="33%" valign="top" style="background:#fafbff;border:1px solid ${C.line};padding:12px 14px;font-family:${FONT}">
        <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">Due this week</div>
        <div style="font-size:22px;font-weight:700;color:${C.ink};margin-top:4px">$0</div>
      </td>
      <td width="33%" valign="top" style="background:#fafbff;border:1px solid ${C.line};padding:12px 14px;font-family:${FONT}">
        <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">Projected this month</div>
        <div style="font-size:22px;font-weight:700;color:${C.ink};margin-top:4px">$660</div>
      </td>
      <td width="33%" valign="top" style="background:#fafbff;border:1px solid ${C.line};padding:12px 14px;font-family:${FONT}">
        <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:${C.ink2};font-weight:700">May actual</div>
        <div style="font-size:22px;font-weight:700;color:${C.ink};margin-top:4px">$660</div>
      </td>
    </tr>
  </table>`;
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
    <td width="40" valign="top" style="padding:14px 0 14px 14px;font-size:18px;text-align:center;font-weight:700;color:${C.action};font-family:${FONT}">${ico}</td>
    <td valign="top" style="padding:14px 14px 14px 8px;font-family:${FONT}">
      <div style="font-size:14.5px;font-weight:600;color:${C.ink};margin:0 0 2px 0">${esc(title)}</div>
      <div style="font-size:12.5px;color:${C.ink2};line-height:1.45">${esc(sub)}</div>
    </td>
  </tr>
</table>`;
}

function renderSection9Risks() {
  let out = sectionOpen('Section 9 . Parent Risk &amp; Blockers');
  out += hTitle('AI-flagged issues');
  out += riskItem({
    tone: 'urgent', ico: '!',
    title: 'Schedule collision - 3:00 PM',
    sub: 'Addison\'s orthodontist appointment (3:00-4:00 PM) overlaps with the AegisFX call (3:00-3:30 PM). One parent needs to cover the ortho, or AegisFX needs to move. Sunday Dadag is the only attendee - moving is likely low-friction.',
  });
  out += riskItem({
    tone: 'warn', ico: '!',
    title: 'Duplicate trip on calendar - Corpus Christi Jul 26-29',
    sub: 'Manual entry (Apr 30) and Gmail-auto-generated event (May 29) both exist. Two reminders, two listings. Delete the auto-generated one for cleanliness.',
  });
  out += riskItem({
    tone: 'warn', ico: '!',
    title: 'Hotmail PST export came up empty',
    sub: 'The file Ali_Muwwakkil@hotmail.com.pst in Downloads is only 271 KB - that\'s the size of an empty Outlook data file. The actual mail-export step (Outlook -> File -> Import/Export -> Export to .pst -> pick Inbox/folders) didn\'t run, OR the file is still locked open by Outlook. Until that\'s redone, older school history stays out of reach.',
  });
  out += riskItem({
    tone: 'warn', ico: '!',
    title: 'Addie wants more advance notice on travel',
    sub: 'Her 1:50 AM reply today made this explicit. For future trips, add to the family calendar AND give Addie a heads-up before booking - not after.',
  });
  out += sectionClose();
  return out;
}

// ----- FOOTER -----
function renderFooter(d) {
  return `
<tr><td style="padding:32px 16px 16px 16px;text-align:center;font-family:${FONT}">
  <div style="font-size:11px;color:${C.muted};line-height:1.6">
    <strong style="color:${C.ink2}">Family Command Center . Prototype Briefing v2</strong><br/>
    Generated ${esc(d.dayName)} ${esc(d.monthName)} ${esc(String(d.day))}, ${esc(String(d.year))} . Sources: Procare (via Hotmail forward), Gmail OAuth (travel + school), Google Calendar (ali@colaberry.com + Family).<br/>
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
function renderPreheader(d) {
  return `
<div style="display:none;font-size:1px;color:${C.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">
  Big week: Addison ortho 3 PM (conflict with AegisFX), Nashville trip tomorrow. ${esc(d.dayName)} ${esc(d.monthName)} ${esc(String(d.day))} briefing.
</div>`;
}

// ----- TOP-LEVEL RENDER -----
function renderFamilyBriefingEmail(opts = {}) {
  const now = opts.date || new Date();
  const d = {
    dayName: now.toLocaleDateString('en-US', { weekday: 'long' }),
    monthName: now.toLocaleDateString('en-US', { month: 'long' }),
    day: now.getDate(),
    year: now.getFullYear(),
  };

  const body = [
    renderHero(d),
    renderSection1Today(),
    renderSection2Week(),
    renderSection3Travel(),
    renderSection4Actions(),
    renderSection5New(),
    renderSection6Recap(),
    renderSection7Flashback(),
    renderSection8Costs(),
    renderSection9Risks(),
    renderFooter(d),
  ].join('\n');

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
${renderPreheader(d)}
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
