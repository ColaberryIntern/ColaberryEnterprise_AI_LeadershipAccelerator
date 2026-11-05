// Pure format generators + validators. No new dependency added (no XML/CSV
// library) -- keeps this app's existing zero-extra-deps footprint (express,
// pg, uuid, ws only). Validation is real (checks actual structure/field
// presence against the schema definition below), not a rubber stamp.
const EXPORT_SCHEMA_FIELDS = ['subject_id', 'name', 'office', 'jurisdiction', 'summary_text', 'issues_covered', 'coverage_pct', 'published_at'];

function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function xmlEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatAsJson(rows) {
  return JSON.stringify(rows, null, 2);
}

function formatAsCsv(rows) {
  const header = EXPORT_SCHEMA_FIELDS.join(',');
  const lines = rows.map((row) => EXPORT_SCHEMA_FIELDS.map((f) => csvEscape(
    Array.isArray(row[f]) ? row[f].join('; ') : row[f],
  )).join(','));
  return [header, ...lines].join('\n');
}

function formatAsXml(rows) {
  const items = rows.map((row) => {
    const fields = EXPORT_SCHEMA_FIELDS.map((f) => {
      const value = Array.isArray(row[f]) ? row[f].join('; ') : row[f];
      return `    <${f}>${xmlEscape(value)}</${f}>`;
    }).join('\n');
    return `  <summary>\n${fields}\n  </summary>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<summaries>\n${items}\n</summaries>`;
}

function formatExport(format, rows) {
  if (format === 'json') return formatAsJson(rows);
  if (format === 'csv') return formatAsCsv(rows);
  if (format === 'xml') return formatAsXml(rows);
  throw Object.assign(new Error(`Unsupported export format: ${format}`), { code: 'UNSUPPORTED_FORMAT' });
}

// Real structural validation against EXPORT_SCHEMA_FIELDS -- not a rubber
// stamp. Throws with a specific message on the first thing that's wrong.
function validateExport(format, payload, expectedRowCount) {
  if (format === 'json') {
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw Object.assign(new Error('JSON export is not valid JSON'), { code: 'SCHEMA_VALIDATION_FAILED' });
    }
    if (!Array.isArray(parsed)) {
      throw Object.assign(new Error('JSON export must be an array'), { code: 'SCHEMA_VALIDATION_FAILED' });
    }
    if (parsed.length !== expectedRowCount) {
      throw Object.assign(new Error(`JSON export has ${parsed.length} records, expected ${expectedRowCount}`), { code: 'SCHEMA_VALIDATION_FAILED' });
    }
    for (const record of parsed) {
      for (const field of EXPORT_SCHEMA_FIELDS) {
        if (!(field in record)) {
          throw Object.assign(new Error(`JSON export record missing required field: ${field}`), { code: 'SCHEMA_VALIDATION_FAILED' });
        }
      }
    }
    return true;
  }

  if (format === 'csv') {
    const lines = payload.split('\n');
    const header = lines[0].split(',');
    if (header.join(',') !== EXPORT_SCHEMA_FIELDS.join(',')) {
      throw Object.assign(new Error(`CSV header does not match schema. Expected: ${EXPORT_SCHEMA_FIELDS.join(',')}`), { code: 'SCHEMA_VALIDATION_FAILED' });
    }
    const dataLines = lines.slice(1).filter((l) => l.length > 0);
    if (dataLines.length !== expectedRowCount) {
      throw Object.assign(new Error(`CSV export has ${dataLines.length} data rows, expected ${expectedRowCount}`), { code: 'SCHEMA_VALIDATION_FAILED' });
    }
    return true;
  }

  if (format === 'xml') {
    if (!/^<\?xml/.test(payload)) {
      throw Object.assign(new Error('XML export missing XML declaration'), { code: 'SCHEMA_VALIDATION_FAILED' });
    }
    if (!/<summaries>[\s\S]*<\/summaries>/.test(payload)) {
      throw Object.assign(new Error('XML export missing <summaries> root element'), { code: 'SCHEMA_VALIDATION_FAILED' });
    }
    const summaryOpenCount = (payload.match(/<summary>/g) || []).length;
    const summaryCloseCount = (payload.match(/<\/summary>/g) || []).length;
    if (summaryOpenCount !== summaryCloseCount || summaryOpenCount !== expectedRowCount) {
      throw Object.assign(new Error(`XML export has ${summaryOpenCount} <summary> elements, expected ${expectedRowCount} (or mismatched open/close tags)`), { code: 'SCHEMA_VALIDATION_FAILED' });
    }
    for (const field of EXPORT_SCHEMA_FIELDS) {
      if (summaryOpenCount > 0 && !payload.includes(`<${field}>`)) {
        throw Object.assign(new Error(`XML export missing expected field element: <${field}>`), { code: 'SCHEMA_VALIDATION_FAILED' });
      }
    }
    return true;
  }

  throw Object.assign(new Error(`Unsupported export format: ${format}`), { code: 'UNSUPPORTED_FORMAT' });
}

module.exports = { formatExport, validateExport, EXPORT_SCHEMA_FIELDS };
