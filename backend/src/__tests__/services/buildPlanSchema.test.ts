import crypto from 'crypto';
import { BuildPlanSchema, traceGateFailed } from '../../services/buildPlanSchema';
import { verifyHmacSignature } from '../../utils/hmac';

/** A minimal but valid deep_plan.json shape. */
const validPlan = {
  reqs: [{ id: 'REQ-1', statement: 'Voters can look up their ballot', cluster: 'Ballot Lookup' }],
  stories: [{ id: 'S1', title: 'Build ballot lookup', fulfills: ['REQ-1'], release: 'R1' }],
  releases: [{ key: 'R1', name: 'MVP', weeks: [1, 2] }],
  trace: { ok: true },
};

describe('buildPlanSchema (shared ingest contract)', () => {
  describe('BuildPlanSchema', () => {
    test('accepts a well-formed plan', () => {
      const parsed = BuildPlanSchema.safeParse(validPlan);
      expect(parsed.success).toBe(true);
    });

    test('rejects a story missing its required title', () => {
      const bad = { stories: [{ id: 'S1' }] };
      const parsed = BuildPlanSchema.safeParse(bad);
      expect(parsed.success).toBe(false);
    });

    test('rejects a requirement missing its statement', () => {
      const bad = { reqs: [{ id: 'REQ-1', cluster: 'X' }] };
      const parsed = BuildPlanSchema.safeParse(bad);
      expect(parsed.success).toBe(false);
    });

    test('accepts an empty plan (all sections optional)', () => {
      expect(BuildPlanSchema.safeParse({}).success).toBe(true);
    });

    test('rejects an oversize story id (storage is VARCHAR(60))', () => {
      const bad = { stories: [{ id: 'S'.repeat(61), title: 'x' }] };
      expect(BuildPlanSchema.safeParse(bad).success).toBe(false);
    });

    test('rejects an oversize sprint key (storage is VARCHAR(20))', () => {
      const bad = { releases: [{ key: 'R'.repeat(21) }] };
      expect(BuildPlanSchema.safeParse(bad).success).toBe(false);
    });
  });

  describe('traceGateFailed', () => {
    test('true only when trace.ok is explicitly false', () => {
      expect(traceGateFailed({ trace: { ok: false } })).toBe(true);
    });

    test('false when trace.ok is true, omitted, or trace absent', () => {
      expect(traceGateFailed({ trace: { ok: true } })).toBe(false);
      expect(traceGateFailed({ trace: {} })).toBe(false);
      expect(traceGateFailed({})).toBe(false);
    });
  });

  describe('HMAC service-auth contract (matches the engine signer)', () => {
    const secret = 'shared-webhook-secret';

    // Reproduce exactly what deep_plan_targets.publish_to_accelerator sends:
    // signature = "sha256=" + hmac_sha256_hex(rawBody, secret) over the exact
    // JSON string bytes, verified on the receiver over those same bytes.
    function signLikeEngine(rawBody: string): string {
      return 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    }

    test('a body signed the way the engine signs it verifies', () => {
      const rawBody = JSON.stringify({
        event: 'build_plan.published',
        data: { operator_email: 'student@example.com', project_ref: null, plan: validPlan },
        timestamp: '2026-07-01T00:00:00+00:00',
      });
      const sig = signLikeEngine(rawBody);
      expect(verifyHmacSignature(rawBody, sig, secret)).toBe(true);
    });

    test('a tampered body fails verification', () => {
      const rawBody = JSON.stringify({ event: 'build_plan.published', data: { operator_email: 'a@b.com' } });
      const sig = signLikeEngine(rawBody);
      const tampered = rawBody.replace('a@b.com', 'attacker@evil.com');
      expect(verifyHmacSignature(tampered, sig, secret)).toBe(false);
    });

    test('a wrong secret fails verification', () => {
      const rawBody = JSON.stringify({ event: 'build_plan.published' });
      const sig = signLikeEngine(rawBody);
      expect(verifyHmacSignature(rawBody, sig, 'wrong-secret')).toBe(false);
    });
  });
});
