/**
 * secretRedaction — the helper T003 requires ("a unit test asserts the redaction helper strips
 * token values from any logged object").
 *
 * The cases that matter are the ones where the secret arrives somewhere nobody planned for:
 * inside a provider's error body, nested under an innocent key, on a Sequelize instance whose
 * columns hide on dataValues, or in a cyclic object that would otherwise hang the log call.
 */

import { redactSecrets, redactedJson } from '../secretRedaction';

/**
 * Every fixture below is assembled at runtime rather than written as a literal. They have to
 * LOOK like real provider tokens for the redactor's value patterns to fire, which is precisely
 * what makes a literal indistinguishable from a leak to the secret scanner.
 */
const META_TOKEN = ['EAA', 'G7ZC8ZBxyz0123456789', 'abcdefghijklmnopqrstuvwxyz'].join('');
const GOOGLE_TOKEN = ['ya29', '.', 'a0AfB_byC1234567890abcdefghijklmnopqrstuvwxyz'].join('');
const LINKEDIN_TOKEN = ['AQV', 'x1y2z3A4B5C6D7E8F9G0', 'hIjKlMnOpQrStUvWxYz'].join('');
const GITHUB_TOKEN = ['ghp', '_', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'].join('');
const JWT = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJzdWIiOiIxMjM0NTY3ODkwIn0',
  'abcdefghijklmnop',
].join('.');

describe('by key', () => {
  it('masks credential-shaped keys whatever the value looks like', () => {
    const out = redactSecrets({
      access_token: 'plain-looking-value',
      refresh_token: 'another',
      client_secret: 'shh',
      password: 'hunter2',
      api_key: 'k',
      authorization: 'Basic abc',
      wrapped_data_key: 'base64stuff',
      ciphertext: 'base64stuff',
      auth_tag: 'base64stuff',
    });
    for (const v of Object.values(out)) expect(v).toBe('<redacted>');
  });

  it('keeps the non-secret fields an operator actually needs', () => {
    // A redactor that masks the expiry leaves nobody able to debug an expiry problem.
    const out = redactSecrets({
      token_expires_at: '2026-10-01T00:00:00.000Z',
      key_id: 'deadbeefdeadbeef',
      encrypted_at: '2026-09-12T00:00:00.000Z',
      scopes: ['pages_manage_posts'],
      needs_reconnect: false,
      provider: 'meta_facebook_page',
    });
    expect(out.token_expires_at).toBe('2026-10-01T00:00:00.000Z');
    expect(out.key_id).toBe('deadbeefdeadbeef');
    expect(out.scopes).toEqual(['pages_manage_posts']);
    expect(out.needs_reconnect).toBe(false);
    expect(out.provider).toBe('meta_facebook_page');
  });
});

describe('by value', () => {
  it('masks a provider token hiding under an innocent key', () => {
    // This is how tokens actually leak: a provider echoes the request back in an error body.
    const out = redactSecrets({ detail: `Invalid OAuth access token: ${META_TOKEN}` });
    expect(out.detail).not.toContain(META_TOKEN);
    expect(out.detail).toContain('<redacted>');
    expect(out.detail).toContain('Invalid OAuth access token:');
  });

  it('masks every provider shape the module claims to cover, anywhere in a string', () => {
    // One case per entry in SECRET_VALUE_PATTERNS. The T003 verification found the comment
    // claiming LinkedIn coverage that the pattern list did not have, so the rule now is that
    // a provider named in that comment has both a pattern and a line here.
    const out = redactSecrets({
      a: `Authorization: Bearer ${META_TOKEN}`,
      b: `refreshed to ${GOOGLE_TOKEN} ok`,
      c: `id_token=${JWT}`,
      d: `linkedin said ${LINKEDIN_TOKEN}`,
      e: `github said ${GITHUB_TOKEN}`,
    });
    const text = JSON.stringify(out);
    for (const secret of [META_TOKEN, GOOGLE_TOKEN, JWT, LINKEDIN_TOKEN, GITHUB_TOKEN]) {
      expect(text).not.toContain(secret);
    }
  });

  it('masks a token sitting in a URL query string, which is how they reach access logs', () => {
    const out: any = redactSecrets({ url: `https://graph.facebook.com/me?access_token=${META_TOKEN}` });
    expect(out.url).not.toContain(META_TOKEN);
    expect(out.url).toContain('graph.facebook.com');
  });

  it('masks a token nested deep inside arrays and objects', () => {
    const out: any = redactSecrets({
      events: [{ request: { headers: [{ value: `Bearer ${META_TOKEN}` }] } }],
    });
    expect(JSON.stringify(out)).not.toContain(META_TOKEN);
  });

  it('leaves ordinary prose untouched', () => {
    const msg = 'Publishing failed: the page is not authorized for this action.';
    expect(redactSecrets({ message: msg }).message).toBe(msg);
  });
});

describe('shapes that break naive redactors', () => {
  it('reads a Sequelize-style instance through dataValues', () => {
    // Spreading a Sequelize instance loses every column, so a redactor that walked the
    // instance directly would report an empty object and hide nothing.
    const row = { dataValues: { id: 'acc-1', access_token: META_TOKEN, provider: 'meta_facebook_page' } };
    const out: any = redactSecrets(row);
    expect(out.access_token).toBe('<redacted>');
    expect(out.provider).toBe('meta_facebook_page');
  });

  it('survives a cycle instead of hanging', () => {
    const a: any = { name: 'account', secret: META_TOKEN };
    a.self = a;
    const out: any = redactSecrets(a);
    expect(out.secret).toBe('<redacted>');
    expect(out.self).toBe('<circular>');
  });

  it('caps depth rather than recursing forever', () => {
    let deep: any = { token: META_TOKEN };
    for (let i = 0; i < 30; i += 1) deep = { nested: deep };
    expect(JSON.stringify(redactSecrets(deep))).not.toContain(META_TOKEN);
  });

  it('masks a Buffer outright, since key material often arrives as bytes', () => {
    expect((redactSecrets({ key: Buffer.from(META_TOKEN) }) as any).key).toBe('<redacted>');
  });

  it('does not mutate the caller object', () => {
    const original = { access_token: META_TOKEN };
    redactSecrets(original);
    expect(original.access_token).toBe(META_TOKEN);
  });

  it('passes null, undefined and dates through unharmed', () => {
    const when = new Date('2026-09-12T00:00:00.000Z');
    const out: any = redactSecrets({ a: null, b: undefined, c: when, d: 3 });
    expect(out.a).toBeNull();
    expect(out.c).toBe(when);
    expect(out.d).toBe(3);
  });
});

describe('redactedJson', () => {
  it('is the log-line form and never contains the secret', () => {
    const line = redactedJson({ event: 'publish_error', context: { access_token: META_TOKEN } });
    expect(line).not.toContain(META_TOKEN);
    expect(JSON.parse(line).event).toBe('publish_error');
  });
});
