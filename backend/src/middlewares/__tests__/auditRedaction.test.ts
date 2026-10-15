/**
 * auditRedaction + the middleware wiring that uses it.
 *
 * The defect being fixed was not a missing redactor — it was a redactor that
 * did not exist at all on a path that persisted `req.body` verbatim, which put
 * 639 plaintext staff passwords into `audit_logs`. So this suite pins BOTH
 * halves, and the second half matters more: a pure-function test alone would
 * stay green if someone removed the `redactSecrets` call from the middleware,
 * which is exactly the failure that happened.
 *
 * Both lists below are real field names read out of the production table, not
 * invented examples, so the precision boundary is pinned against the data it
 * has to survive.
 */
import { EventEmitter } from 'events';
import { redactSecrets, isSecretKey, REDACTED } from '../auditRedaction';

const mockCreate = jest.fn().mockResolvedValue({});
jest.mock('../../models/AuditLog', () => ({
  __esModule: true,
  default: { create: (...a: unknown[]) => mockCreate(...a) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { auditMiddleware } from '../auditMiddleware';

/** Secret-shaped names observed in production audit rows. */
const MUST_REDACT = [
  'password', 'currentPassword', 'newPassword', 'confirmPassword',
  'smtp_pass', 'ghl_api_key', 'sms_api_key', 'synthflow_api_key',
  'apiKey', 'client_secret', 'access_token', 'refresh_token',
  'authorization', 'key', 'token', 'private_key',
];

/**
 * Innocent names observed in the SAME table. Each one would be destroyed by a
 * blunt /key|token|pass/ match, and several carry real audit meaning.
 */
const MUST_SURVIVE = [
  'keywords', 'content_key', 'step_key', 'stepKey', 'surfaceKey',
  'metricKeys', 'idempotency_key', 'section_variable_keys',
  'associated_variable_keys', 'creates_variable_keys',
  'ai_max_tokens', 'apis_added', 'apis_modified', 'strapi_lead_id',
  'email', 'name', 'status',
];

describe('isSecretKey — the precision boundary', () => {
  it.each(MUST_REDACT)('treats %s as a secret', (key) => {
    expect(isSecretKey(key)).toBe(true);
  });

  it.each(MUST_SURVIVE)('leaves %s alone', (key) => {
    expect(isSecretKey(key)).toBe(false);
  });

  it('ignores case and separators, so smtp_pass and SMTP-PASS are one rule', () => {
    for (const k of ['smtp_pass', 'smtpPass', 'SMTP-PASS', 'Smtp Pass']) {
      expect(isSecretKey(k)).toBe(true);
    }
  });

  it('does not treat an empty or symbol-only name as a secret', () => {
    expect(isSecretKey('')).toBe(false);
    expect(isSecretKey('---')).toBe(false);
  });
});

describe('redactSecrets', () => {
  it('removes the password from the real admin login body', () => {
    const body = { email: 'someone@colaberry.com', password: 'a real one' };
    const out = redactSecrets(body) as Record<string, unknown>;
    expect(out.email).toBe('someone@colaberry.com');
    expect(out.password).toBe(REDACTED);
    expect(JSON.stringify(out)).not.toContain('a real one');
  });

  it('removes BOTH sides of a password change', () => {
    const out = redactSecrets({
      currentPassword: 'old one', newPassword: 'new one',
    }) as Record<string, unknown>;
    expect(out.currentPassword).toBe(REDACTED);
    expect(out.newPassword).toBe(REDACTED);
  });

  it('reaches secrets nested inside objects and arrays', () => {
    const out = redactSecrets({
      integrations: [{ name: 'ghl', ghl_api_key: 'secret-a' }],
      mail: { host: 'smtp.example.com', smtp_pass: 'secret-b' },
    });
    const text = JSON.stringify(out);
    expect(text).not.toContain('secret-a');
    expect(text).not.toContain('secret-b');
    expect(text).toContain('smtp.example.com');
    expect(text).toContain('ghl');
  });

  it('redacts by KEY, whatever the value type is', () => {
    const out = redactSecrets({
      password: 12345, token: null, key: ['a', 'b'], secret: { nested: 'x' },
    }) as Record<string, unknown>;
    expect(out.password).toBe(REDACTED);
    expect(out.token).toBe(REDACTED);
    expect(out.key).toBe(REDACTED);
    expect(out.secret).toBe(REDACTED);
  });

  it('does not mutate the caller\'s object', () => {
    const body = { password: 'untouched' };
    redactSecrets(body);
    expect(body.password).toBe('untouched');
  });

  it('stops at a depth cap rather than recursing forever', () => {
    let deep: Record<string, unknown> = { password: 'bottom' };
    for (let i = 0; i < 12; i += 1) deep = { nest: deep };
    expect(JSON.stringify(redactSecrets(deep))).not.toContain('bottom');
  });

  it('passes primitives through untouched', () => {
    expect(redactSecrets('plain')).toBe('plain');
    expect(redactSecrets(7)).toBe(7);
    expect(redactSecrets(null)).toBeNull();
  });
});

describe('auditMiddleware — the wiring, which is what actually failed', () => {
  const run = (body: Record<string, unknown>, statusCode = 200) => {
    const req = {
      method: 'POST', path: '/api/admin/login', body,
      ip: '10.0.0.1', socket: {}, admin: { sub: 'admin-1' },
    } as never;
    const res = Object.assign(new EventEmitter(), { statusCode }) as never;
    const next = jest.fn();
    auditMiddleware(req, res, next);
    (res as unknown as EventEmitter).emit('finish');
    return { next };
  };

  beforeEach(() => mockCreate.mockClear());

  it('persists the login WITHOUT the password', () => {
    run({ email: 'someone@colaberry.com', password: 'a real one' });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const row = mockCreate.mock.calls[0][0];
    expect(row.new_values.email).toBe('someone@colaberry.com');
    expect(row.new_values.password).toBe(REDACTED);
    // The whole row, not just the field: a secret must not survive anywhere in it.
    expect(JSON.stringify(row)).not.toContain('a real one');
  });

  it('still records the audit row — redaction must not cost the trail', () => {
    run({ email: 'someone@colaberry.com', password: 'x'.repeat(12), role: 'admin' });
    const row = mockCreate.mock.calls[0][0];
    expect(row.action).toBe('create');
    expect(row.admin_user_id).toBe('admin-1');
    expect(row.new_values.role).toBe('admin');
  });

  it('calls next() exactly once', () => {
    const { next } = run({ password: 'x' });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
