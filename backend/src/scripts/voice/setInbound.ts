/**
 * voice:numbers:inbound (VS3.6): set how ONE number we hold, named by its reference, answers inbound
 * calls. Writes only routing_policy.inbound on that voice_numbers row. It does NOT change the number's
 * webhook at Twilio: pointing a real line at us is a separate step the owner approves.
 *
 *   node dist/scripts/voice/setInbound.js --ref test-line --on|--off [--hours always|business] [--fallback message|human_line] [--dry]
 *
 * Only the Test Lab tenant's numbers are accepted, so this cannot touch an existing Cora or Cory line.
 * Idempotent. Exit: 0 ok, 2 refused/invalid, 1 error.
 */
import { InboundPolicySchema } from '../../services/voice/inbound/inboundPlan';

const arg = (argv: string[], name: string): string | undefined => { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : undefined; };

export type SetInboundDeps = { update: (ref: string, policy: unknown) => Promise<number> };

export async function runSetInbound(argv: string[], deps: () => Promise<SetInboundDeps>): Promise<{ code: number; out: Record<string, unknown> }> {
  const ref = arg(argv, '--ref');
  const on = argv.includes('--on');
  if (!ref || !/^[a-z0-9-]{2,100}$/.test(ref) || on === argv.includes('--off')) return { code: 2, out: { refused: 'usage: --ref <reference> --on|--off [--hours always|business] [--fallback message|human_line] [--dry]' } };
  const p = InboundPolicySchema.safeParse({ enabled: on, engine: 'conversation_relay', hours: arg(argv, '--hours') ?? 'always', fallback: arg(argv, '--fallback') ?? 'message' });
  if (!p.success) return { code: 2, out: { refused: 'invalid policy', issues: p.error.issues.map((i) => i.path.join('.')) } };
  if (argv.includes('--dry')) return { code: 0, out: { dry: true, ref, policy: p.data } };
  const n = await (await deps()).update(ref, p.data);
  return n === 1 ? { code: 0, out: { updated: true, ref, policy: p.data } } : { code: 2, out: { refused: 'no active test number has that reference', ref } };
}

if (require.main === module) {
  runSetInbound(process.argv, async () => {
    const { sequelize } = await import('../../config/database');
    const { QueryTypes } = await import('sequelize');
    const { TEST_TENANT_ID } = await import('../../services/voice/testlab/testLabService');
    return {
      update: async (ref, policy) => (await sequelize.query<{ id: string }>(
        `UPDATE voice_numbers SET routing_policy = COALESCE(routing_policy, '{}'::jsonb) || jsonb_build_object('inbound', CAST(:policy AS jsonb)), updated_at = NOW()
          WHERE tenant_id = :t AND number_ref = :ref AND provider = 'twilio' AND status = 'active' RETURNING id`,
        { replacements: { t: TEST_TENANT_ID, ref, policy: JSON.stringify(policy) }, type: QueryTypes.SELECT })).length,
    };
  }).then(({ code, out }) => { console.log(JSON.stringify(out)); process.exit(code); }, (e: Error) => {
    console.error(JSON.stringify({ level: 'error', event: 'voice_set_inbound_failed', error_class: e.name || 'Error' }));
    process.exit(1);
  });
}
