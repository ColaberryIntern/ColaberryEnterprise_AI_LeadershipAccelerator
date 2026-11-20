/**
 * W30: the prospect's website comes from a public form, so the fetcher must refuse anything that
 * is not the public internet (SSRF), including via redirects and DNS.
 */
import dns from 'dns';
import http from 'http';
import type { AddressInfo } from 'net';
import { fetchCompanyPage, isPrivateAddress, normalizeSiteUrl, pageText, publicLookup } from '../companySiteFetch';

describe('isPrivateAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1'])(
    'refuses %s',
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(['8.8.8.8', '172.32.0.1', '151.101.1.1', '2606:4700::1111'])('allows %s', (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe('normalizeSiteUrl', () => {
  it('accepts what people type', () => {
    expect(normalizeSiteUrl('acme.com')?.toString()).toBe('https://acme.com/');
    expect(normalizeSiteUrl('http://www.acme.com/about')?.toString()).toBe('http://www.acme.com/about');
  });
  it.each(['', 'not a url', 'ftp://acme.com', 'file:///etc/passwd', 'http://user:pw@acme.com', 'http://acme.com:8080', 'http://127.0.0.1', 'http://localhost', 'http://intranet', 'http://printer.local', 'http://[::1]/'])(
    'refuses %p',
    (raw) => expect(normalizeSiteUrl(raw)).toBeNull(),
  );
});

describe('pageText', () => {
  it('keeps the visible words, title and description, and drops scripts and chrome', () => {
    const r = pageText(
      '<html><head><title>Acme Logistics</title><meta name="description" content="Freight for the Midwest"></head>' +
        '<body><nav>Menu</nav><script>evil()</script><h1>We move freight</h1><p>300 trucks.</p><footer>c</footer></body></html>',
    );
    expect(r).toEqual({ title: 'Acme Logistics', description: 'Freight for the Midwest', text: 'We move freight300 trucks.' });
  });
});

describe('fetchCompanyPage', () => {
  let server: http.Server;
  let port: number;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<title>internal</title>');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('never reaches a local server, whatever the form says', async () => {
    expect(await fetchCompanyPage(`http://127.0.0.1:${port}/`)).toBeNull();
    // A name that resolves to loopback is refused at connect time, not just by its spelling.
    expect(await fetchCompanyPage('http://localtest.me/')).toBeNull();
  });

  it('checks the address the socket will use: one private answer refuses the whole name', async () => {
    const spy = jest.spyOn(dns, 'lookup').mockImplementation(((_h: string, _o: unknown, cb: any) =>
      cb(null, [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }])) as any);
    const err = await new Promise<any>((r) => publicLookup('rebind.example', {}, (e) => r(e)));
    expect(err?.code).toBe('EPRIVATEADDR');
    spy.mockImplementation(((_h: string, _o: unknown, cb: any) => cb(null, [{ address: '93.184.216.34', family: 4 }])) as any);
    const ok = await new Promise<any[]>((r) => publicLookup('acme.example', {}, (e, a, f) => r([e, a, f])));
    expect(ok).toEqual([null, '93.184.216.34', 4]);
    spy.mockRestore();
  });

  it('returns null, never throws, for junk', async () => {
    await expect(fetchCompanyPage('::::')).resolves.toBeNull();
  });
});
