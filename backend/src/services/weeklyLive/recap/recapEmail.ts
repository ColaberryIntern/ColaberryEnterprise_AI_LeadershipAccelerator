import { RecapSummary } from './recapContent';

/**
 * The recap email (WL1.3). Pure: builds subject, HTML and plain text from the overview and the links.
 *
 * The overview is drawn with HTML and inline CSS, no remote images (assumption A5): email clients
 * block images by default, and a recap whose picture is a grey box says nothing. Colaberry Training
 * branding (navy and cherry), single column, readable on a phone.
 */
export interface RecapEmailInput {
  summary: RecapSummary;
  firstName: string;
  classTitle: string;
  classDate: string; // e.g. "Monday, November 30"
  recapUrl: string;
  nextEventUrl: string;
  unsubscribeUrl: string;
}
export interface RecapEmail { subject: string; html: string; text: string }

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function recapSubject(summary: RecapSummary): string {
  return `Your class recap: ${summary.headline}`.slice(0, 150);
}

function button(href: string, label: string, primary: boolean): string {
  const bg = primary ? '#E3202B' : '#101A2E';
  return `<a href="${esc(href)}" style="display:inline-block;background:${bg};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px;margin:4px 6px 4px 0">${esc(label)}</a>`;
}

export function buildRecapEmail(i: RecapEmailInput): RecapEmail {
  const s = i.summary;
  const name = i.firstName.trim() || 'there';
  const ideas = s.ideas.map((d) => `
    <tr><td style="padding:10px 12px;background:#F4F6FA;border-left:4px solid #E3202B;border-radius:6px">
      <div style="font-weight:700;font-size:15px;color:#101A2E">${d.icon ? esc(d.icon) + ' ' : ''}${esc(d.title)}</div>
      ${d.text ? `<div style="font-size:14px;color:#4A5468;margin-top:2px">${esc(d.text)}</div>` : ''}
    </td></tr><tr><td style="height:8px"></td></tr>`).join('');
  const steps = s.steps.length
    ? `<div style="font-weight:700;color:#101A2E;margin:18px 0 6px">What we built, step by step</div><ol style="margin:0;padding-left:20px;color:#2D3748;font-size:14px">${s.steps.map((x) => `<li style="margin:3px 0">${esc(x)}</li>`).join('')}</ol>`
    : '';
  const quote = s.quote ? `<div style="margin:18px 0;padding:12px 16px;border-radius:8px;background:#101A2E;color:#fff;font-size:16px;font-weight:700">&ldquo;${esc(s.quote)}&rdquo;</div>` : '';
  const homework = s.homework ? `<div style="margin:14px 0;font-size:14px;color:#2D3748"><b>Your one task this week:</b> ${esc(s.homework)}</div>` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#EEF1F6;font-family:Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F6"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#101A2E;padding:22px 24px;color:#ffffff">
  <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.8">Colaberry Training &middot; Class recap &middot; ${esc(i.classDate)}</div>
  <div style="font-size:24px;font-weight:800;line-height:1.2;margin-top:6px">${esc(s.headline)}</div>
</td></tr>
<tr><td style="padding:22px 24px;color:#2D3748;font-size:15px;line-height:1.5">
  <p style="margin:0 0 12px">Hi ${esc(name)},</p>
  ${s.intro ? `<p style="margin:0 0 16px">${esc(s.intro)}</p>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${ideas}</table>
  ${steps}${quote}${homework}
  <div style="margin:20px 0 6px">${button(i.recapUrl, 'Open your class page and chat', false)}${button(i.nextEventUrl, 'Save your seat for the next class', true)}</div>
  <p style="margin:16px 0 0;font-size:13px;color:#718096">You are getting this because you checked in to ${esc(i.classTitle)}. <a href="${esc(i.unsubscribeUrl)}" style="color:#718096">Stop class recap emails</a>.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [
    `Hi ${name},`, '', s.headline, s.intro, '',
    ...s.ideas.map((d) => `- ${d.title}${d.text ? ': ' + d.text : ''}`),
    ...(s.steps.length ? ['', 'What we built, step by step:', ...s.steps.map((x, n) => `${n + 1}. ${x}`)] : []),
    ...(s.quote ? ['', `"${s.quote}"`] : []),
    ...(s.homework ? ['', `Your one task this week: ${s.homework}`] : []),
    '', `Your class page and chat: ${i.recapUrl}`, `Save your seat for the next class: ${i.nextEventUrl}`,
    '', `You are getting this because you checked in to ${i.classTitle}. Stop class recap emails: ${i.unsubscribeUrl}`,
  ].filter((l, n, a) => !(l === '' && a[n - 1] === '')).join('\n');
  return { subject: recapSubject(s), html, text };
}

/** First name for the greeting: the first word of what they typed at check-in, letters only. */
export function firstNameOf(name: string): string {
  const w = String(name || '').trim().split(/\s+/)[0] || '';
  return /^[\p{L}'-]{1,40}$/u.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : '';
}
