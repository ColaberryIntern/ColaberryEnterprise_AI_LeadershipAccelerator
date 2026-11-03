import fs from 'fs';
import path from 'path';
import {
  BLUEPRINT_APPROVER_ROLES,
  ApproverRoleError,
  evaluateApproverRole,
  assertApproverRole,
} from '../approverRolePolicy';

describe('the permitted role set is a recorded decision', () => {
  it('is super_admin only — Ali, 2026-11-03', () => {
    // Pinned on purpose. Widening approval rights should fail a test and require a decision,
    // not slide in as a convenience while someone is debugging an approval that will not go
    // through. Production counts at the time: ai_staff 35, admin 7, sales 6, super_admin 2.
    expect([...BLUEPRINT_APPROVER_ROLES]).toEqual(['super_admin']);
  });
});

describe('evaluateApproverRole', () => {
  it('permits super_admin', () => {
    expect(evaluateApproverRole('super_admin')).toBeNull();
  });

  it('refuses the three other real production roles', () => {
    // These are not hypotheticals: all three exist in admin_users today, 48 users between them.
    expect(evaluateApproverRole('admin')).toBe('approver_role_not_permitted');
    expect(evaluateApproverRole('ai_staff')).toBe('approver_role_not_permitted');
    expect(evaluateApproverRole('sales')).toBe('approver_role_not_permitted');
  });

  it('refuses an absent role as MISSING, not as not-permitted', () => {
    // The two refusals mean different things to whoever reads the log: one is a broken session,
    // the other is a person without the right. Collapsing them loses the distinction.
    expect(evaluateApproverRole(null)).toBe('approver_role_missing');
    expect(evaluateApproverRole(undefined)).toBe('approver_role_missing');
    expect(evaluateApproverRole('')).toBe('approver_role_missing');
    expect(evaluateApproverRole('   ')).toBe('approver_role_missing');
  });

  it('trims surrounding whitespace rather than refusing a padded role', () => {
    expect(evaluateApproverRole('  super_admin  ')).toBeNull();
  });

  it('does NOT normalise case — an unexpected shape fails closed', () => {
    // Lowercasing would loosen an allowlist. Our roles are lowercase snake_case, so refusing
    // SUPER_ADMIN costs nothing real and keeps the comparison strict.
    expect(evaluateApproverRole('SUPER_ADMIN')).toBe('approver_role_not_permitted');
    expect(evaluateApproverRole('Super_Admin')).toBe('approver_role_not_permitted');
  });

  it('is not fooled by a role that merely contains the permitted one', () => {
    expect(evaluateApproverRole('not_super_admin')).toBe('approver_role_not_permitted');
    expect(evaluateApproverRole('super_admin_readonly')).toBe('approver_role_not_permitted');
  });

  it('refuses a zero-width-padded role instead of coercing it to a match', () => {
    expect(evaluateApproverRole('super​admin')).toBe('approver_role_not_permitted');
  });
});

describe('assertApproverRole', () => {
  it('returns quietly for a permitted role', () => {
    expect(() => assertApproverRole('super_admin')).not.toThrow();
  });

  it('throws ApproverRoleError with a stable refusal, not a bare Error', () => {
    // Observability rules require a stable error_class; matching on message text is forbidden.
    expect.assertions(4);
    try {
      assertApproverRole('ai_staff');
    } catch (err) {
      expect(err).toBeInstanceOf(ApproverRoleError);
      expect((err as ApproverRoleError).name).toBe('ApproverRoleError');
      expect((err as ApproverRoleError).refusal).toBe('approver_role_not_permitted');
      expect((err as ApproverRoleError).offeredRole).toBe('ai_staff');
    }
  });

  it('records a null offered role rather than the string "null"', () => {
    try {
      assertApproverRole(null);
    } catch (err) {
      expect((err as ApproverRoleError).offeredRole).toBeNull();
      expect((err as ApproverRoleError).refusal).toBe('approver_role_missing');
    }
  });

  it('does not leak the permitted role set into the error message', () => {
    // A refusal that names the role you need is a hint for probing. The audit trail carries it;
    // the message handed back does not.
    try {
      assertApproverRole('sales');
    } catch (err) {
      expect((err as Error).message).not.toContain('super_admin');
    }
  });
});

/**
 * The gate lives at the authenticated boundary (`approveLifecycleBlueprint`), not inside
 * `approveBlueprint`, which receives the role as data and cannot know whether it came from a
 * session. That is a sound split ONLY while the authenticated path stays the single non-test
 * caller — so this guard fails if another one appears, rather than letting a job quietly approve
 * a blueprint with no role at all.
 */
describe('SOURCE GUARD: approveBlueprint keeps exactly one non-test caller', () => {
  const svcDir = path.join(__dirname, '..');

  it('is called only by lifecycleStatus, and that caller asserts the role first', () => {
    const files = fs.readdirSync(svcDir).filter((f) => f.endsWith('.ts'));
    const callers = files.filter((f) => {
      if (f === 'blueprintApproval.ts' || f === 'approverRolePolicy.ts') return false;
      const src = fs.readFileSync(path.join(svcDir, f), 'utf8');
      // A real call, not a mention in a comment.
      return /approveBlueprint\s*\(/.test(src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''));
    });
    expect(callers).toEqual(['lifecycleStatus.ts']);

    const status = fs.readFileSync(path.join(svcDir, 'lifecycleStatus.ts'), 'utf8');
    expect(status).toContain('assertApproverRole');
    // The assert must precede the call, or it guards nothing.
    expect(status.indexOf('assertApproverRole(')).toBeLessThan(status.indexOf('approveBlueprint({'));
  });

  it('and the scan can see this directory at all', () => {
    // The control: a readdir that silently returned nothing would make the test above vacuous.
    const files = fs.readdirSync(svcDir).filter((f) => f.endsWith('.ts'));
    expect(files).toContain('lifecycleStatus.ts');
    expect(files.length).toBeGreaterThan(3);
  });
});
