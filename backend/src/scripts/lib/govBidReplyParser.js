// Gov bid reply parser.
//
// Input:  the HTML/text body of Ali's @CB reply on the MB instructions post
// Output: { bids: [{title, deadline, agency, uuid, bonfireUrl, fitThesis}], warnings: [...] }
//
// Format Ali was given in the MB template (postGovBidDownloadInstructions):
//   @CB ready - here are the N bids:
//   1. <Title>, deadline <YYYY-MM-DD>, agency <Agency>, uuid <uuid>, bonfire <url>
//   2. ...
//
// We parse leniently. Each line that starts with a digit + dot + space is a bid
// row. Within the row, we look for canonical key markers:
//   - "deadline <date>"
//   - "agency <name>"  (until next comma or end)
//   - "uuid <uuid>"
//   - "bonfire <url>"
//   - "fit <text>"     (optional fit thesis)
// Title is whatever comes before the first key marker.
//
// Why a deterministic parser instead of the LLM:
//   - Reliability: same input -> same parsed list, no hallucination of bids
//     Ali didn't list, no fabricated deadlines.
//   - Testability: we can unit-test edge cases (missing fields, weird casing,
//     trailing whitespace, HTML wrapping) without an OpenAI call.
//   - Cost + speed: parser is microsecond-fast and free.

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const DATE_RE = /\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/;
const URL_RE = /https?:\/\/[^\s<>"]+/i;
const NBSP = String.fromCharCode(160);

function stripHtml(s) {
  let raw = s || '';
  // Auto-number ordered lists: replace each <li> inside an <ol> with "N. ".
  // We handle <ol> blocks one at a time so per-list counters reset.
  raw = raw.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner) => {
    let n = 0;
    return inner.replace(/<li[^>]*>/gi, () => `\n${++n}. `);
  });
  // Plain <ul><li> -> bullets (no numbering)
  raw = raw.replace(/<li[^>]*>/gi, '\n- ');
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|ol|ul)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#64;/g, '@')
    .replace(new RegExp(NBSP, 'g'), ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .trim();
}

function parseRow(rowText) {
  const warnings = [];
  // Normalize spaces, drop leading "1. " / "1) "
  const clean = rowText.replace(/^\d+\s*[.)]\s*/, '').trim();

  // Pick out structured fields first (so we can subtract them from the title)
  const fields = {};
  const dateMatch = clean.match(/\bdeadline[:\s]+(\d{4}-\d{2}-\d{2})/i)
    || clean.match(/\b(?:due|submission\s*deadline)[:\s]+(\d{4}-\d{2}-\d{2})/i)
    || (clean.match(DATE_RE) ? [null, clean.match(DATE_RE)[0]] : null);
  if (dateMatch) fields.deadline = dateMatch[1];

  const uuidMatch = clean.match(/\buuid[:\s]+([0-9a-f-]+)/i)
    || (clean.match(UUID_RE) ? [null, clean.match(UUID_RE)[0]] : null);
  if (uuidMatch) fields.uuid = uuidMatch[1];

  const urlMatch = clean.match(/\bbonfire[:\s]+(\S+)/i) || clean.match(URL_RE);
  if (urlMatch) fields.bonfireUrl = (urlMatch[1] || urlMatch[0]).replace(/[,;.]+$/, '');

  const agencyMatch = clean.match(/\bagency[:\s]+([^,;]+?)(?:[,;]|\s+uuid|\s+bonfire|\s+fit|\s+deadline|$)/i);
  if (agencyMatch) fields.agency = agencyMatch[1].trim();

  const fitMatch = clean.match(/\bfit[:\s]+(.+?)$/i);
  if (fitMatch) fields.fitThesis = fitMatch[1].trim();

  // Title = everything before the FIRST structured marker.
  const markerIndices = ['deadline', 'agency', 'uuid', 'bonfire', 'fit', 'due']
    .map((kw) => {
      const m = clean.match(new RegExp(`\\b${kw}\\b`, 'i'));
      return m ? clean.toLowerCase().indexOf(m[0].toLowerCase()) : -1;
    })
    .filter((i) => i >= 0);
  const firstMarker = markerIndices.length ? Math.min(...markerIndices) : clean.length;
  let title = clean.slice(0, firstMarker).replace(/[,;-]\s*$/, '').trim();
  fields.title = title;

  if (!fields.title) warnings.push('row missing title');
  if (!fields.deadline) warnings.push(`"${title || 'row'}" missing deadline`);
  return { fields, warnings };
}

function parseReply(rawBody) {
  const warnings = [];
  const text = stripHtml(rawBody);

  // Strategy: find all numbered items anywhere in the text via regex.
  // A row starts with "<n>." or "<n>)" preceded by start-of-string or whitespace.
  // We split on those markers to extract one row each.
  const rows = [];
  const splitRe = /(?:^|\n|\s)(\d+\s*[.)]\s+)/g;
  const matches = [];
  let m;
  while ((m = splitRe.exec(text)) !== null) {
    matches.push({ index: m.index + (m[0].length - m[1].length), marker: m[1] });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    rows.push(text.slice(start, end).trim());
  }

  if (rows.length === 0) {
    warnings.push('no numbered rows found - reply did not match expected format');
    return { bids: [], warnings };
  }

  const bids = [];
  for (const row of rows) {
    // For multi-line rows, join continuation lines that look like key:val
    const collapsed = row
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .reduce((acc, line, idx) => {
        if (idx === 0) return line;
        if (/^(deadline|agency|uuid|bonfire|fit|due)[:\s]/i.test(line)) return acc + ', ' + line;
        return acc + ' ' + line;
      }, '');
    const { fields, warnings: rowWarnings } = parseRow(collapsed);
    if (fields.title) bids.push(fields);
    warnings.push(...rowWarnings);
  }
  return { bids, warnings };
}

module.exports = { parseReply, parseRow, stripHtml };
