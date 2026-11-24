import { checkVendorTable } from '../docsCheck';

const good = `# X
## Vendor prices
| Vendor | Item | URL | Read date |
|---|---|---|---|
| Twilio | voice | https://www.twilio.com/en-us/voice/pricing/us | 2026-11-24 |
## Next
| not | checked |`;

describe('docsCheck.checkVendorTable', () => {
  it('passes a fully cited table (happy path)', () => {
    expect(checkVendorTable('f.md', good, 'Vendor prices')).toEqual([]);
  });

  it('flags a row missing its URL and a row missing its date (failure path)', () => {
    const bad = good.replace('https://www.twilio.com/en-us/voice/pricing/us', 'twilio site')
      + '\n## Vendor facts\n| a | b |\n|---|---|\n| x | https://a.b/c |';
    expect(checkVendorTable('f.md', bad, 'Vendor prices').map((p) => p.reason)).toEqual(['no https URL']);
    expect(checkVendorTable('f.md', bad, 'Vendor facts').map((p) => p.reason)).toEqual(['no YYYY-MM-DD read date']);
  });

  it('reports a missing section and an empty table (boundary)', () => {
    expect(checkVendorTable('f.md', '# nothing', 'Vendor prices')[0].reason).toMatch(/not found/);
    expect(checkVendorTable('f.md', '## Vendor prices\n| h |\n|---|', 'Vendor prices')[0].reason).toMatch(/no data rows/);
  });

  it('ignores rows after the next section and handles CRLF (idempotent on re-run)', () => {
    const crlf = good.replace(/\n/g, '\r\n');
    expect(checkVendorTable('f.md', crlf, 'Vendor prices')).toEqual([]);
    expect(checkVendorTable('f.md', crlf, 'Vendor prices')).toEqual([]);
  });
});
