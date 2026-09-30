import { cleanEventbriteValue, dedupeAttendees } from '../../utils/eventbriteSanitize';

describe('cleanEventbriteValue', () => {
  it('strips wrapping quotes and trailing commas from a name', () => {
    expect(cleanEventbriteValue("''Thierry Belinga'',")).toBe('Thierry Belinga');
  });

  it('strips wrapping quotes and trailing commas from an email', () => {
    expect(cleanEventbriteValue("'tbelinganet@yahoo.fr',")).toBe('tbelinganet@yahoo.fr');
  });

  it('handles null / undefined / empty', () => {
    expect(cleanEventbriteValue(null)).toBe('');
    expect(cleanEventbriteValue(undefined)).toBe('');
    expect(cleanEventbriteValue('')).toBe('');
  });

  it('leaves already-clean values untouched', () => {
    expect(cleanEventbriteValue('Jane Doe')).toBe('Jane Doe');
    expect(cleanEventbriteValue('jane@example.com')).toBe('jane@example.com');
  });
});

describe('dedupeAttendees', () => {
  it('collapses duplicate rows by order id + cleaned email', () => {
    const rows = [
      { AttendeeName: "''Thierry Belinga'',", Email: "'tbelinganet@yahoo.fr',", OrderId: 15230952663, PhoneNumber: null },
      { AttendeeName: "''Thierry Belinga'',", Email: "'tbelinganet@yahoo.fr',", OrderId: 15230952663, PhoneNumber: null },
      { AttendeeName: "'Winnie Nyambura',", Email: "'wngugi2@gmail.com',", OrderId: 15230456333, PhoneNumber: null },
    ];
    const out = dedupeAttendees(rows);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      name: 'Thierry Belinga',
      email: 'tbelinganet@yahoo.fr',
      phone: '',
      order_id: '15230952663',
    });
  });

  it('lowercases the email for consistent dedup + account keys', () => {
    const out = dedupeAttendees([
      { AttendeeName: 'A', Email: 'MixedCase@Example.COM', OrderId: 1 },
    ]);
    expect(out[0].email).toBe('mixedcase@example.com');
  });

  it('drops rows without a usable email', () => {
    expect(dedupeAttendees([{ AttendeeName: 'x', Email: "'',", OrderId: 1 }])).toHaveLength(0);
    expect(dedupeAttendees([{ AttendeeName: 'x', Email: null, OrderId: 2 }])).toHaveLength(0);
  });
});
