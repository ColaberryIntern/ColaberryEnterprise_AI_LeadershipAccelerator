// Preflight checks for outbound Mandrill emails sent on Ali's behalf.
// Hard-fails on documented style violations so they never ship.
//
// Use:
//   const { validateBeforeSend } = require('./lib/mandrillPreflight');
//   validateBeforeSend(htmlBody, textBody);  // throws on violation
//
// Documented in memory/feedback_email_style.md.

const INFORMAL_SIGNOFFS = [
  /\bbest,\s*\n+\s*ali\b/i,
  /\bthanks,?\s*\n+\s*ali\b/i,
  /\bcheers,?\s*\n+\s*ali\b/i,
  /\bregards,?\s*\n+\s*ali\b/i,
  /\bsincerely,?\s*\n+\s*ali\b/i,
  /<p[^>]*>\s*best,?\s*<br\s*\/?>\s*ali\s*<\/p>/i,
  /<p[^>]*>\s*thanks,?\s*<br\s*\/?>\s*ali\s*<\/p>/i,
  /<p[^>]*>\s*cheers,?\s*<br\s*\/?>\s*ali\s*<\/p>/i,
  /<p[^>]*>\s*regards,?\s*<br\s*\/?>\s*ali\s*<\/p>/i,
  /<p[^>]*>\s*sincerely,?\s*<br\s*\/?>\s*ali\s*<\/p>/i,
];

const SIGNATURE_BLOCK_MARKERS = [
  /Managing Director.{0,80}AI Systems Architect/i,
  /Colaberry Inc\.?\s*<\/?br/i,
  /200 Chisholm Place/i,
  /enterprise\.colaberry\.ai/i,
];

function hasBrandedSignature(body) {
  return SIGNATURE_BLOCK_MARKERS.some(rx => rx.test(body));
}

function findInformalSignoff(body) {
  for (const rx of INFORMAL_SIGNOFFS) {
    if (rx.test(body)) return rx.toString();
  }
  return null;
}

function validateBeforeSend(html, text) {
  const violations = [];

  // 1. Em-dashes anywhere
  if (/—/.test(html) || /—/.test(text || '')) {
    violations.push('Em-dash (—) found. Use a slash, comma, hyphen with spaces, or "and"/"but" instead.');
  }

  // 2. Double signature - informal signoff WHILE branded signature is present
  const htmlHasBrand = hasBrandedSignature(html);
  const textHasBrand = hasBrandedSignature(text || '');
  const htmlInformal = findInformalSignoff(html);
  const textInformal = findInformalSignoff(text || '');

  if (htmlHasBrand && htmlInformal) {
    violations.push(`HTML body has both branded signature AND informal signoff (${htmlInformal}). Pick ONE: branded signature OR "Ali" closer, never both.`);
  }
  if (textHasBrand && textInformal) {
    violations.push(`TEXT body has both branded signature AND informal signoff (${textInformal}). Pick ONE.`);
  }

  // 3. Multiple "Ali Muwwakkil" occurrences in body (usually a duplicate)
  const htmlAliCount = (html.match(/Ali Muwwakkil/g) || []).length;
  const textAliCount = (text || '').match(/Ali Muwwakkil/g)?.length || 0;
  if (htmlAliCount > 1) {
    violations.push(`HTML has "Ali Muwwakkil" ${htmlAliCount} times - likely a duplicate signature.`);
  }
  if (textAliCount > 1) {
    violations.push(`TEXT has "Ali Muwwakkil" ${textAliCount} times - likely a duplicate signature.`);
  }

  if (violations.length > 0) {
    const message = 'Mandrill preflight failed:\n  - ' + violations.join('\n  - ');
    throw new Error(message);
  }
}

module.exports = { validateBeforeSend, hasBrandedSignature, findInformalSignoff };
