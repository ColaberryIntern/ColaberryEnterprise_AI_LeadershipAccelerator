// anthropicFollowUpRender.js
//
// Turns one entry from anthropicFollowUpMessages.js into the { subject, text,
// html } triple that Mandrill needs.
//
// Deliberately plain HTML. This goes to a partner support queue that a human
// reads, very possibly inside a ticketing system that strips styling. A branded
// gradient header would read as marketing and could route us to a bulk folder;
// a letter reads as a letter. The only styling here is a readable body font and
// a muted signature block.
//
// Contracts this file guarantees, so the callers do not each re-derive them:
//   - No em-dashes in the output (mandrillPreflight hard-fails on them).
//   - The branded signature appears exactly once, satisfying the preflight's
//     "branded signature present, informal signoff absent" rule.
//   - text and html carry the same words, so a plain text client loses nothing.

const SIGNATURE_LINES = [
  'Ali Muwwakkil',
  'Managing Director / AI Systems Architect',
  'Colaberry Inc.',
  '200 Chisholm Place, Suite 200, Plano, TX 75075',
  'ali@colaberry.com | enterprise.colaberry.ai',
];

const GREETING = 'Hello,';

function stripEmDashes(s) {
  return String(s || '').replace(/—/g, ', ').replace(/–/g, '-');
}

function htmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// The full ordered body of a message: greeting, paragraphs, then the ask.
// Kept as one function so text and html can never drift apart.
function bodyParagraphs(message) {
  return [GREETING, ...message.paragraphs, message.ask].map(stripEmDashes);
}

function renderText(message) {
  const body = bodyParagraphs(message).join('\n\n');
  return `${body}\n\n${SIGNATURE_LINES.join('\n')}\n`;
}

function renderHtml(message) {
  const paras = bodyParagraphs(message)
    .map((p) => `  <p style="margin:0 0 14px 0">${htmlEscape(p)}</p>`)
    .join('\n');

  const signature = SIGNATURE_LINES
    .map((line, i) => (i === 0
      ? `    <strong>${htmlEscape(line)}</strong><br>`
      : `    ${htmlEscape(line)}<br>`))
    .join('\n');

  return `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff">
<div style="max-width:600px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.6;color:#1a202c">
${paras}
  <div style="margin-top:22px;padding-top:14px;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#64748b">
${signature}
  </div>
</div>
</body>
</html>`;
}

// dayNumber is 1-based and is NOT put in the subject or body. The recipient does
// not need to be told this is note 7 of 15; that framing turns a warm sequence
// into a countdown. It exists only for our own logs and ledger.
function renderMessage(message, dayNumber) {
  const subject = stripEmDashes(message.subject);
  const text = renderText(message);
  const html = renderHtml(message);
  if (/—/.test(subject) || /—/.test(text) || /—/.test(html)) {
    throw new Error(`anthropicFollowUpRender: em-dash survived rendering of note ${dayNumber}`);
  }
  return { subject, text, html, angle: message.angle, dayNumber };
}

module.exports = { renderMessage, renderText, renderHtml, SIGNATURE_LINES, GREETING };
