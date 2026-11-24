const assert = require('node:assert/strict');
const { formatExport, validateExport, EXPORT_SCHEMA_FIELDS } = require('../dataExportFormatters');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const sampleRows = [
  {
    subject_id: 1, name: 'Dummy Testcase', office: 'Fictional Office', jurisdiction: 'Fictional District',
    summary_text: 'A summary, with a comma and "quotes".', issues_covered: ['Housing', 'Education'],
    coverage_pct: '1.0000', published_at: '2026-08-10T00:00:00.000Z',
  },
  {
    subject_id: 2, name: 'Second Testcase', office: 'Fictional Office 2', jurisdiction: 'Fictional District 2',
    summary_text: 'A second summary.', issues_covered: ['Housing'],
    coverage_pct: '0.8000', published_at: '2026-08-10T01:00:00.000Z',
  },
];

test('formatAsJson + validateExport: round-trips cleanly and validates', () => {
  const payload = formatExport('json', sampleRows);
  const parsed = JSON.parse(payload);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'Dummy Testcase');
  assert.equal(validateExport('json', payload, 2), true);
});

test('formatAsCsv: header matches schema fields exactly', () => {
  const payload = formatExport('csv', sampleRows);
  const header = payload.split('\n')[0];
  assert.equal(header, EXPORT_SCHEMA_FIELDS.join(','));
});

test('formatAsCsv: escapes commas and quotes in field values', () => {
  const payload = formatExport('csv', sampleRows);
  assert.match(payload, /"A summary, with a comma and ""quotes""\."/);
});

test('formatAsCsv + validateExport: row count matches, validates cleanly', () => {
  const payload = formatExport('csv', sampleRows);
  assert.equal(validateExport('csv', payload, 2), true);
});

test('formatAsXml: well-formed with expected structure', () => {
  const payload = formatExport('xml', sampleRows);
  assert.match(payload, /^<\?xml/);
  assert.match(payload, /<summaries>[\s\S]*<\/summaries>/);
  assert.equal((payload.match(/<summary>/g) || []).length, 2);
});

test('formatAsXml: escapes special characters', () => {
  const payload = formatExport('xml', sampleRows);
  assert.match(payload, /&quot;quotes&quot;/);
});

test('formatAsXml + validateExport: validates cleanly', () => {
  const payload = formatExport('xml', sampleRows);
  assert.equal(validateExport('xml', payload, 2), true);
});

test('formatExport: unsupported format throws', () => {
  assert.throws(() => formatExport('yaml', sampleRows), (err) => err.code === 'UNSUPPORTED_FORMAT');
});

test('validateExport: catches a JSON row-count mismatch', () => {
  const payload = formatExport('json', sampleRows);
  assert.throws(() => validateExport('json', payload, 5), (err) => err.code === 'SCHEMA_VALIDATION_FAILED');
});

test('validateExport: catches a JSON record missing a required field', () => {
  const badPayload = JSON.stringify([{ subject_id: 1, name: 'Missing Fields' }]);
  assert.throws(() => validateExport('json', badPayload, 1), (err) => err.code === 'SCHEMA_VALIDATION_FAILED');
});

test('validateExport: catches a CSV header mismatch', () => {
  const badPayload = 'wrong,header,row\n1,2,3';
  assert.throws(() => validateExport('csv', badPayload, 1), (err) => err.code === 'SCHEMA_VALIDATION_FAILED');
});

test('validateExport: catches an XML export with mismatched open/close tags', () => {
  const badPayload = '<?xml version="1.0"?>\n<summaries>\n<summary>\n</summaries>';
  assert.throws(() => validateExport('xml', badPayload, 1), (err) => err.code === 'SCHEMA_VALIDATION_FAILED');
});

test('empty rows array still produces valid, validating output for every format', () => {
  for (const format of ['json', 'csv', 'xml']) {
    const payload = formatExport(format, []);
    assert.equal(validateExport(format, payload, 0), true);
  }
});

console.log(`\n${passed} passed`);
