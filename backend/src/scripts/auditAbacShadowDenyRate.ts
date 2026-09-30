/**
 * Reports the ABAC shadow would-deny rate — what `agent.authorization` events say WOULD have
 * been blocked if abac_enforcement were 'enforce', while the system is still running in
 * 'shadow' mode (agentAuthorizationService.ts). Read-only; makes no state changes.
 *
 * This is the pre-flip review for Trust Command Center P2-1: before flipping abac_enforcement
 * to 'enforce' on high-risk actions, we need to know what that flip would actually have
 * blocked over a real recent window, broken down by agent/action, so a flip doesn't silently
 * stop legitimate work.
 *
 * Run: `npx ts-node src/scripts/auditAbacShadowDenyRate.ts [days]` (default 30)
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

interface ShadowDenyRow {
  agent_name: string | null;
  action: string | null;
  category: string | null;
  reason: string | null;
  would_deny: boolean;
}

async function main(): Promise<void> {
  const days = Number(process.argv[2]) || 30;

  const totalRows = (await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM ai_events
     WHERE event_type = 'agent.authorization' AND created_at >= NOW() - (:days || ' days')::interval`,
    { type: QueryTypes.SELECT, replacements: { days } }
  )) as Array<{ n: number }>;
  const total = totalRows[0]?.n ?? 0;

  if (total === 0) {
    console.log(`No agent.authorization events in the last ${days} days — nothing to report.`);
    process.exit(0);
  }

  const rows = (await sequelize.query(
    `SELECT
       metadata->>'agent_name' AS agent_name,
       metadata->>'action' AS action,
       metadata->>'category' AS category,
       metadata->>'reason' AS reason,
       (metadata->>'would_deny')::boolean AS would_deny
     FROM ai_events
     WHERE event_type = 'agent.authorization' AND created_at >= NOW() - (:days || ' days')::interval`,
    { type: QueryTypes.SELECT, replacements: { days } }
  )) as ShadowDenyRow[];

  const denies = rows.filter((r) => r.would_deny);
  const denyRate = (denies.length / total) * 100;

  const byAgent = new Map<string, { total: number; denies: number }>();
  const byReason = new Map<string, number>();
  for (const r of rows) {
    const agent = r.agent_name ?? 'unknown';
    const bucket = byAgent.get(agent) ?? { total: 0, denies: 0 };
    bucket.total += 1;
    if (r.would_deny) bucket.denies += 1;
    byAgent.set(agent, bucket);
  }
  for (const r of denies) {
    const reason = r.reason ?? 'unknown';
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }

  console.log('=== ABAC SHADOW WOULD-DENY REPORT ===');
  console.log(`window       : last ${days} days`);
  console.log(`total checks : ${total}`);
  console.log(`would deny   : ${denies.length} (${denyRate.toFixed(1)}%)`);
  console.log('');
  console.log('by agent (would-deny / total):');
  for (const [agent, b] of [...byAgent.entries()].sort((a, b) => b[1].denies - a[1].denies)) {
    console.log(`  ${agent.padEnd(30)} ${String(b.denies).padStart(4)} / ${b.total}`);
  }
  console.log('');
  console.log('would-deny reasons:');
  for (const [reason, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason.padEnd(30)} ${n}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error('audit failed:', e); process.exit(1); });
