// renderFamilyDashboardSections - the two newsletter sections of the Family Dashboard email:
// "Family Photos" (from familyPhotoFeed, embedded inline by cid) and "School" (from familySchoolNews).
// Kept out of renderFamilyDashboardEmail.js so that file stays under the size ceiling; the shared
// styling helpers are passed in as `kit` rather than imported, which avoids a require cycle.
// Each section returns '' when it has nothing to show, so a failed feed never leaves an empty box.

const CHILD_COLORS = { Addison: ['#ede9fe', '#6d28d9'], Creed: ['#dbeafe', '#1d4ed8'], Jayce: ['#dcfce7', '#15803d'], Family: ['#fef3c7', '#b45309'] };

function fmtDate(ymd) {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function fmtTaken(local) {
  const d = new Date(`${local}Z`);
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })}`;
}

function photoCell(p, k) {
  return `<td width="50%" valign="top" style="padding:6px">
    <img src="cid:${p.cid}" alt="${k.esc(p.caption || 'Family photo')}" width="268" style="display:block;width:100%;max-width:268px;height:auto;border:0" />
    <div style="font-size:12.5px;color:${k.C.ink};margin-top:6px;font-family:${k.FONT}">${k.esc(p.caption || '')}</div>
    <div style="font-size:11px;color:${k.C.muted};font-family:${k.FONT}">${k.esc(fmtTaken(p.takenAt))}</div>
  </td>`;
}

function renderPhotos(data, k) {
  const photos = (data.photos || []);
  if (!photos.length) return '';
  let out = k.sectionOpen('Family Photos');
  out += k.hTitle('New from the camera roll', 'Each picture appears in this email once, ever. Tomorrow brings new ones.');
  out += '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">';
  for (let i = 0; i < photos.length; i += 2) {
    out += `<tr>${photoCell(photos[i], k)}${photos[i + 1] ? photoCell(photos[i + 1], k) : '<td width="50%"></td>'}</tr>`;
  }
  out += '</table>';
  out += k.sectionClose();
  return out;
}

function schoolRow(it, k) {
  const [bg, fg] = CHILD_COLORS[it.child] || CHILD_COLORS.Family;
  return `<tr><td style="padding:10px 0;border-bottom:1px solid ${k.C.lineSoft};font-family:${k.FONT}">
    <div>${k.chip(it.child, bg, fg)}${it.date ? k.chip(fmtDate(it.date), k.C.lineSoft, k.C.ink2) : ''}</div>
    <div style="font-size:14px;font-weight:600;color:${k.C.ink};margin-top:5px">${k.esc(it.title)}</div>
    ${it.detail ? `<div style="font-size:12.5px;color:${k.C.ink2};margin-top:2px;line-height:1.45">${k.esc(it.detail)}</div>` : ''}
    ${it.action ? `<div style="font-size:12.5px;color:${k.C.action};margin-top:3px"><strong>To do:</strong> ${k.esc(it.action)}</div>` : ''}
    ${it.link ? `<div style="font-size:12.5px;margin-top:3px"><a href="${k.esc(it.link)}" style="color:${k.C.navy}">Open the form or sign-up</a></div>` : ''}
  </td></tr>`;
}

function renderSchool(data, k) {
  const s = data.school;
  if (!s) return '';
  let out = k.sectionOpen('School');
  out += k.hTitle('From the kids\' schools', 'Harrison (Addison), Watkins (Creed), Naaman Forest (Jayce). Upcoming dates and anything we have to do.');
  if (s.items.length) {
    out += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${s.items.map((it) => schoolRow(it, k)).join('')}</table>`;
  } else {
    out += `<div style="font-size:13px;color:${k.C.muted};font-family:${k.FONT}">Nothing coming up that needs us.</div>`;
  }
  const silent = s.coverage.filter((c) => c.child !== 'Family' && c.emails === 0);
  const notes = [];
  if (s.fallback) notes.push('The summary step failed this morning, so these are the raw subject lines.');
  for (const c of silent) notes.push(`No ${c.school} email has reached our inbox in the last week${c.child === 'Jayce' ? ', so Jayce is not covered yet' : ''}.`);
  if (notes.length) out += `<div style="font-size:11.5px;color:${k.C.muted};margin-top:10px;font-family:${k.FONT}">${k.esc(notes.join(' '))}</div>`;
  out += k.sectionClose();
  return out;
}

function sectionsText(data) {
  const lines = [];
  if (data.school && data.school.items.length) {
    lines.push('', 'SCHOOL');
    for (const it of data.school.items) lines.push(`- ${it.child}${it.date ? ` (${fmtDate(it.date)})` : ''}: ${it.title}${it.action ? `. To do: ${it.action}` : ''}`);
  }
  if (data.photos && data.photos.length) lines.push('', `FAMILY PHOTOS: ${data.photos.length} new picture(s) in the HTML version.`);
  return lines.join('\n');
}

module.exports = { renderPhotos, renderSchool, sectionsText };
