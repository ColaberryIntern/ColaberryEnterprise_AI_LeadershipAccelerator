/**
 * Guards every <Dial> we emit (VS4.2). A transfer is a dial the gateway never sees, so it answers to the
 * same emergency stop, plus a rolling hourly cap and a rule that it never dials a number we hold (a loop).
 * Fail closed: anything unreadable refuses, and the caller gets the safe fallback. The target number is
 * compared in the database and never logged or stored.
 */
import { tapVoiceLog } from '../ops/opsMetrics';
import { QueryTypes } from 'sequelize';
import { isKillSwitchActiveStrict } from '../../launchSafety';
import { MAX_TRANSFERS_PER_HOUR } from './humanTransfer';

export async function emergencyStopped(read: () => Promise<boolean> = isKillSwitchActiveStrict): Promise<boolean> {
  try {
    return (await read()) !== false;
  } catch (e) {
    console.warn(JSON.stringify(tapVoiceLog({ level: 'error', service: 'voice-studio', event: 'voice_kill_switch_unreadable', outcome: 'failure', error_class: (e as Error).name || 'SettingsError' })));
    return true;
  }
}

/** Reserve one transfer for this call. null = dial. Safe to repeat: a call already counted keeps its place. */
export async function refuseTransferDial(callId: string, target: string, stopped: () => Promise<boolean> = emergencyStopped): Promise<string | null> {
  if (await stopped()) return 'emergency_stop';
  try {
    const { sequelize } = await import('../../../config/database');
    return await sequelize.transaction(async (transaction) => {
      await sequelize.query("SELECT pg_advisory_xact_lock(hashtext('voice-transfer-cap'))", { transaction });
      const [f] = await sequelize.query<{ ours: boolean; n: number; found: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM voice_numbers WHERE e164_restricted = :target) AS ours,
                EXISTS (SELECT 1 FROM voice_calls WHERE id = :callId) AS found,
                (SELECT COUNT(*)::int FROM voice_call_events WHERE source = 'studio' AND event_key = 'transfer_dialed' AND occurred_at > NOW() - INTERVAL '1 hour' AND call_id <> :callId) AS n`,
        { replacements: { target, callId }, type: QueryTypes.SELECT, transaction });
      if (!f.found) return 'unknown_call';
      if (f.ours) return 'transfer_loop';
      if (f.n >= MAX_TRANSFERS_PER_HOUR) return 'transfer_cap';
      await sequelize.query(
        `INSERT INTO voice_call_events (tenant_id, call_id, event_key, source, state, occurred_at)
         SELECT tenant_id, id, 'transfer_dialed', 'studio', 'session_active', NOW() FROM voice_calls WHERE id = :callId
         ON CONFLICT (call_id, event_key) DO NOTHING`,
        { replacements: { callId }, transaction });
      return null;
    });
  } catch (e) {
    console.warn(JSON.stringify(tapVoiceLog({ level: 'error', service: 'voice-studio', event: 'voice_transfer_guard_failed', outcome: 'failure', error_class: (e as Error).name || 'DatabaseError', call_id: callId })));
    return 'guard_unavailable';
  }
}
