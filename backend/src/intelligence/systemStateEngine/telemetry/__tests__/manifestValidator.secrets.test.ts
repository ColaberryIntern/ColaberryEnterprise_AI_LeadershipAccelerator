/**
 * Secret-scan tests for validateManifestShape.
 *
 * Audit finding (2026-05-17): the live POST /api/portal/project/telemetry
 * endpoint's Zod UUID validation fires before the secret scanner can see
 * the payload, so the systemHealthCheck.js secret probe was inconclusive
 * over the network. These unit tests pin the scanner's behavior directly
 * by calling validateManifestShape with payloads that pass shape
 * validation but contain known secret-pattern strings.
 *
 * SECRET_PATTERNS lives in buildManifestSchema.ts; the detector walks
 * every string field of the validated manifest. These tests prove each
 * pattern is wired and that clean payloads pass.
 */
import { validateManifestShape } from '../manifestValidator';

function baseValid(extra: Partial<Record<string, any>> = {}): any {
  return {
    manifest_version: '1.0',
    telemetry_version: '1.0',
    task_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    bp_id: null,
    project_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    execution_timestamp: '2026-05-17T00:00:00.000Z',
    files_created: [],
    files_modified: [],
    files_deleted: [],
    database_changes: [],
    apis_added: [],
    apis_modified: [],
    frontend_routes_added: [],
    ui_components_added: [],
    ui_components_modified: [],
    tests_added: [],
    tests_modified: [],
    validation_results: [],
    dependencies_added: [],
    packages_added: [],
    system_impacts: [],
    decision_trace: { summary: 'safe summary, nothing secret here' },
    ...extra,
  };
}

describe('validateManifestShape — secret detection', () => {
  test('clean payload passes', () => {
    const out = validateManifestShape(baseValid());
    expect(out.ok).toBe(true);
  });

  test('detects fake AWS access key (AKIA…) anywhere in payload', () => {
    const out = validateManifestShape(baseValid({
      decision_trace: { summary: 'leaked AKIAIOSFODNN7EXAMPLE', other: 'x' },
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return; // type narrow
    expect(out.errors.length).toBeGreaterThan(0);
    expect(out.errors[0].code).toBe('secret_in_manifest');
    expect(out.errors[0].message).toMatch(/aws_access_key/i);
  });

  test('detects GitHub PAT (ghp_…)', () => {
    const out = validateManifestShape(baseValid({
      decision_trace: { summary: 'ghp_abcdef1234567890abcdef1234567890abcdef' },
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors.some(e => /github_pat/i.test(e.message))).toBe(true);
  });

  test('detects GitHub OAuth token (gho_…)', () => {
    const out = validateManifestShape(baseValid({
      decision_trace: { summary: 'gho_abcdef1234567890abcdef1234567890abcdef' },
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors.some(e => /github_oauth/i.test(e.message))).toBe(true);
  });

  test('detects OpenAI key (sk-…)', () => {
    const out = validateManifestShape(baseValid({
      decision_trace: { summary: 'sk-abcdefghijklmnopqrstuvwxyz1234' },
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors.some(e => /openai_key/i.test(e.message))).toBe(true);
  });

  test('detects JWT (eyJ…eyJ….…)', () => {
    const out = validateManifestShape(baseValid({
      decision_trace: { summary: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123def456' },
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors.some(e => /jwt/i.test(e.message))).toBe(true);
  });

  test('detects private key block (-----BEGIN…PRIVATE KEY-----)', () => {
    const out = validateManifestShape(baseValid({
      decision_trace: { summary: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...' },
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors.some(e => /private_key_block/i.test(e.message))).toBe(true);
  });

  test('reports the path of the offending field', () => {
    const out = validateManifestShape(baseValid({
      decision_trace: { nested: { deep: { thing: 'AKIAIOSFODNN7EXAMPLE' } } },
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors[0].path).toContain('decision_trace');
    expect(out.errors[0].path).toContain('nested');
    expect(out.errors[0].path).toContain('thing');
  });

  test('walks arrays too — secrets in apis_added handler_file string', () => {
    const out = validateManifestShape(baseValid({
      apis_added: [
        { method: 'GET', path: '/api/secret-test', handler_file: 'src/AKIAIOSFODNN7EXAMPLE/file.ts' },
      ],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors[0].code).toBe('secret_in_manifest');
  });

  test('does NOT false-positive on benign strings that share prefix', () => {
    // "AKIA" alone (without the 16-char suffix) should not trigger
    const out = validateManifestShape(baseValid({
      decision_trace: { summary: 'mentions AKIA but no full key' },
    }));
    expect(out.ok).toBe(true);
  });

  test('does NOT false-positive on short "sk-" prefixes (e.g. project slugs)', () => {
    const out = validateManifestShape(baseValid({
      decision_trace: { summary: 'project sk-short' },
    }));
    expect(out.ok).toBe(true);
  });
});
