import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_MAX_ACCURACY_RADIUS_KM,
  cityFromLookup,
  isEnrichableIp,
  isPublicIp,
  isSnackbarSafeCity,
  normalizeIp,
  type GeoCityResponse,
} from '../visitorGeoEnrichment';

/**
 * The rule every case here serves: a row with NO city shows no card, and a row
 * with a WRONG city publishes a false statement about where a real person is.
 * Only the second one costs anything, so every uncertainty resolves to null.
 */

describe('normalizeIp: whatever is in the column becomes one bare address', () => {
  it.each([
    ['a plain v4', '203.0.113.5', '203.0.113.5'],
    ['surrounding whitespace', '  203.0.113.5  ', '203.0.113.5'],
    ['a forwarded chain, taking the CLIENT not the proxy', '203.0.113.5, 10.0.0.1, 172.18.0.4', '203.0.113.5'],
    ['a v4 with a port', '203.0.113.5:54321', '203.0.113.5'],
    ['an IPv4-mapped v6', '::ffff:203.0.113.5', '203.0.113.5'],
    ['an IPv4-mapped v6, upper case', '::FFFF:203.0.113.5', '203.0.113.5'],
    ['a bracketed v6 with a port', '[2001:db8::1]:443', '2001:db8::1'],
    ['a bare v6, lowercased', '2001:DB8::1', '2001:db8::1'],
  ])('%s', (_label, input, expected) => {
    expect(normalizeIp(input)).toBe(expected);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace', '   '],
    ['not an address', 'unknown'],
    ['an octet over 255', '999.1.1.1'],
    ['a truncated v4', '203.0.113'],
    ['a number', 12345 as unknown as string],
  ])('%s yields null rather than a guess', (_label, input) => {
    expect(normalizeIp(input as string)).toBeNull();
  });

  it('never truncates a v6 address at its first colon', () => {
    // The port-stripping branch is the one that could do this. It is gated on the
    // address having exactly one colon, which a v6 address never does.
    expect(normalizeIp('2001:db8:85a3::8a2e:370:7334')).toBe('2001:db8:85a3::8a2e:370:7334');
  });
});

describe('isPublicIp: the 423 private rows must be skipped, not guessed at', () => {
  it.each([
    ['RFC1918 10/8', '10.0.0.5'],
    ['RFC1918 172.16/12 low', '172.16.0.1'],
    ['RFC1918 172.16/12 high', '172.31.255.254'],
    ['RFC1918 192.168/16', '192.168.1.1'],
    ['loopback', '127.0.0.1'],
    ['unspecified', '0.0.0.0'],
    ['link-local', '169.254.1.1'],
    ['CGNAT', '100.64.0.1'],
    ['multicast', '224.0.0.1'],
    ['reserved', '255.255.255.255'],
    ['v6 loopback', '::1'],
    ['v6 unspecified', '::'],
    ['v6 unique-local', 'fd00::1'],
    ['v6 link-local', 'fe80::1'],
    ['v6 multicast', 'ff02::1'],
  ])('%s is not enrichable', (_label, ip) => {
    expect(isPublicIp(ip)).toBe(false);
    expect(isEnrichableIp(ip)).toBe(false);
  });

  it.each([
    ['a public v4', '203.0.113.5'],
    ['just outside 172.16/12 below', '172.15.0.1'],
    ['just outside 172.16/12 above', '172.32.0.1'],
    ['not 192.168 despite starting 192', '192.167.1.1'],
    ['not CGNAT despite starting 100', '100.63.255.255'],
    ['just outside CGNAT above', '100.128.0.1'],
    ['a public v6', '2001:db8::1'],
  ])('%s is enrichable', (_label, ip) => {
    expect(isPublicIp(ip)).toBe(true);
    expect(isEnrichableIp(ip)).toBe(true);
  });

  it('a forwarded chain is judged on the client, not on the proxy at the end', () => {
    // If this were judged on the last hop, every forwarded request would look
    // private and nothing would ever be enriched.
    expect(isEnrichableIp('203.0.113.5, 172.18.0.4')).toBe(true);
    expect(isEnrichableIp('10.0.0.5, 203.0.113.5')).toBe(false);
  });
});

describe('cityFromLookup: confidence gates', () => {
  const at = (radius: number | undefined, city = 'Plano'): GeoCityResponse => ({
    city: { names: { en: city } },
    country: { iso_code: 'US' },
    location: radius === undefined ? null : { accuracy_radius: radius },
  });

  it('takes a confident city with its country', () => {
    expect(cityFromLookup(at(20))).toEqual({ city: 'Plano', country: 'US' });
  });

  it('keeps the country but drops the city when the fix is too vague', () => {
    // A 1000km radius is a time zone wearing a city's name. The country is still
    // a true statement and nothing renders it publicly, so it is kept.
    expect(cityFromLookup(at(1000))).toEqual({ city: null, country: 'US' });
  });

  it('holds the boundary exactly', () => {
    expect(cityFromLookup(at(DEFAULT_MAX_ACCURACY_RADIUS_KM)).city).toBe('Plano');
    expect(cityFromLookup(at(DEFAULT_MAX_ACCURACY_RADIUS_KM + 1)).city).toBeNull();
  });

  it('accepts a lookup that reports no radius at all', () => {
    expect(cityFromLookup(at(undefined)).city).toBe('Plano');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty object', {}],
    ['a country with no city', { country: { iso_code: 'US' } }],
  ])('%s yields no city', (_label, lookup) => {
    expect(cityFromLookup(lookup as GeoCityResponse).city).toBeNull();
  });

  it('ignores a malformed country code rather than storing it', () => {
    expect(cityFromLookup({ city: { names: { en: 'Plano' } }, country: { iso_code: 'USA' } }).country).toBeNull();
    expect(cityFromLookup({ city: { names: { en: 'Plano' } }, country: { iso_code: '' } }).country).toBeNull();
  });

  it('uppercases a lowercase country code', () => {
    expect(cityFromLookup({ city: { names: { en: 'Plano' } }, country: { iso_code: 'us' } }).country).toBe('US');
  });
});

describe('cityFromLookup: only values the snack bar will actually render', () => {
  const withCity = (city: string): GeoCityResponse => ({
    city: { names: { en: city } }, country: { iso_code: 'US' }, location: { accuracy_radius: 20 },
  });

  it.each([
    'Plano', 'New York', 'St. Louis', 'Winston-Salem', "Coeur d'Alene", 'São Paulo', 'Washington D.C.',
  ])('stores %s', (city) => {
    expect(cityFromLookup(withCity(city)).city).toBe(city);
  });

  it.each([
    ['a comma, which the sanitiser has no character class for', 'Plano, TX'],
    ['a digit', '12th District'],
    ['one character', 'A'],
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['over 60 characters', 'x'.repeat(61)],
  ])('refuses %s, because the bar would silently drop it anyway', (_label, city) => {
    expect(cityFromLookup(withCity(city)).city).toBeNull();
  });

  it('a row written with an unrenderable city would be worse than an empty one', () => {
    // The point of the rule in one assertion: a stored city the bar rejects makes
    // the column stop meaning "this row is done", so the next run cannot tell
    // enriched rows from unenrichable ones.
    expect(isSnackbarSafeCity('Plano, TX')).toBe(false);
    expect(cityFromLookup(withCity('Plano, TX')).country).toBe('US'); // country still kept
  });
});

describe('the sanitiser copy is pinned to the one on the public page', () => {
  it('matches the expression snackbarFeedService actually uses', () => {
    // This module keeps its own copy of `cleanCity`'s expression on purpose - one
    // guards a public render, the other guards a write, and they are allowed to
    // diverge deliberately one day. What must not happen is diverging by accident,
    // so the two are compared here rather than shared through a constant.
    //
    // Read off disk instead of imported: importing that module pulls in sequelize
    // and a database config for a string comparison.
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'marketing', 'snackbarFeedService.ts'),
      'utf8',
    );
    const match = source.match(/\/\^\[\\p\{L\}[^/]*\/u/);
    expect(match).not.toBeNull();

    const theirs = new RegExp(match![0].slice(1, -2), 'u');
    for (const sample of ['Plano', 'Plano, TX', 'St. Louis', '12th District', 'A', 'São Paulo']) {
      expect(isSnackbarSafeCity(sample)).toBe(theirs.test(sample.trim()));
    }
  });
});
