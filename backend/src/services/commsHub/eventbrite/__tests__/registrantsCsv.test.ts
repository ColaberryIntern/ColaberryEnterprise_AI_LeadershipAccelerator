import { registrantsCsv, registrantsFilename, safeCell, centralStamp, CSV_COLUMNS } from '../registrantsCsv';
import type { Registrant } from '../registrants';

/** CH9.3 the registrants download: RFC 4180, no formula injection, stable bytes, a stable name. */
const r = (o: Partial<Registrant> = {}): Registrant => ({ name: 'Ada Lovelace', email: 'ada@x.test', phone: '', registered_at: '2026-11-09T18:00:00.000Z', sources: ['eventbrite'], has_account: false, ...o });

describe('formula injection', () => {
  it.each([['=SUM(A1:A9)', "'=SUM(A1:A9)"], ['+1 214 555 0100', "'+1 214 555 0100"], ['-2+3', "'-2+3"], ['@cmd', "'@cmd"], ['\tTab', "'\tTab"]])(
    '%j is made text', (input, out) => expect(safeCell(input)).toBe(out));
  it('a formula that also needs quoting is both guarded and quoted', () => {
    expect(safeCell('=HYPERLINK("http://evil.test","click")')).toBe('"\'=HYPERLINK(""http://evil.test"",""click"")"');
  });
  it('ordinary values are untouched', () => expect(safeCell('Ada Lovelace')).toBe('Ada Lovelace'));
});

describe('registrantsCsv', () => {
  it('has a BOM, the header row, CRLF endings and one row per person', () => {
    const csv = registrantsCsv([r({ phone: '555 0100', has_account: true, sources: ['eventbrite', 'site'] })]);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(lines[0]).toBe('Name,Email,Phone,Registered (Central),Source,Has platform account');
    expect(lines[1]).toBe('Ada Lovelace,ada@x.test,555 0100,"Nov 9, 2026, 12:00 PM CST",Eventbrite + Our site,Yes');
    expect(lines[2]).toBe('');
    expect(lines).toHaveLength(3);
  });
  it('quotes commas, quotes and line breaks inside a name', () => {
    const line = registrantsCsv([r({ name: 'Lovelace, Ada "Countess"\nof Lovelace' })]).slice(1).split('\r\n').slice(1).join('\r\n');
    expect(line.startsWith('"Lovelace, Ada ""Countess""\nof Lovelace",')).toBe(true);
  });
  it('the same data gives the same bytes (idempotent export); none gives just the header', () => {
    const rows = [r(), r({ email: 'b@x.test' })];
    expect(registrantsCsv(rows)).toBe(registrantsCsv(rows));
    expect(registrantsCsv([])).toBe(`﻿${CSV_COLUMNS.join(',')}\r\n`);
  });
  it('an unknown registration time is an empty cell, never a made-up date', () => {
    expect(registrantsCsv([r({ registered_at: null })]).split('\r\n')[1]).toBe('Ada Lovelace,ada@x.test,,,Eventbrite,No');
    expect(centralStamp(null)).toBe('');
  });
});

describe('registrantsFilename', () => {
  it('slugs the title and uses the event date in Central, so the name does not change day to day', () => {
    expect(registrantsFilename({ ccpp_event_id: '777', title: 'AI Open House: December!', starts_at: '2026-12-04T00:30:00.000Z' })).toBe('registrants-ai-open-house-december-2026-12-03.csv');
  });
  it('falls back safely with no usable title or date', () => {
    expect(registrantsFilename({ ccpp_event_id: '777', title: '!!!', starts_at: '' })).toBe('registrants-event-777.csv');
  });
});
