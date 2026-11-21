import type { Transaction } from 'sequelize';
import { sequelize } from '../../../config/database';
import Cohort from '../../../models/Cohort';
import CommsHubSettings, { type CommsHubQuietHours } from '../../../models/CommsHubSettings';
import { logActivity, type Actor } from '../activityLog';

/**
 * The hub's safety controls (CH7.4): pause, quiet hours, who is emailed when something fails, and
 * the test cohort a first send lands in. One row (id = 1). Every change is written with its activity
 * row in one transaction, and setting a value it already has writes nothing (re-running is a no-op).
 *
 * Failure modes handled: a missing row (created on first write), an unknown test cohort (refused with
 * a sentence, nothing written), two people saving at once (the row is locked, the later save wins
 * whole). Not handled here: the worker reads the row on every tick, so a pause takes effect on its
 * next check (within a minute, and before any post that has not started).
 */
export class SettingsInputError extends Error {
  constructor(message: string) { super(message); this.name = 'SettingsInputError'; }
}

export interface HubSettingsView {
  sending_paused: boolean;
  quiet_hours: CommsHubQuietHours | null;
  alert_recipients: string[];
  test_cohort: { id: string; name: string } | null;
  updated_at: string | null;
}

export interface SettingsPatch {
  quiet_hours?: CommsHubQuietHours | null;
  alert_recipients?: string[];
  test_cohort_id?: string | null;
}

async function cohortRef(id: string | null, t?: Transaction): Promise<{ id: string; name: string } | null> {
  if (!id) return null;
  const c = await Cohort.findByPk(id, { attributes: ['id', 'name'], transaction: t });
  return c ? { id: String(c.get('id')), name: String(c.get('name')) } : null;
}

async function toView(s: CommsHubSettings | null, t?: Transaction): Promise<HubSettingsView> {
  return {
    sending_paused: !!s?.sending_paused,
    quiet_hours: s?.quiet_hours ?? null,
    alert_recipients: [...(s?.alert_recipients ?? [])],
    test_cohort: await cohortRef(s?.test_cohort_id ?? null, t),
    updated_at: s?.updated_at ? s.updated_at.toISOString() : null,
  };
}

export async function readHubSettings(): Promise<HubSettingsView> {
  return toView(await CommsHubSettings.findByPk(1));
}

async function lockedRow(t: Transaction): Promise<CommsHubSettings> {
  const found = await CommsHubSettings.findByPk(1, { transaction: t, lock: t.LOCK.UPDATE });
  if (found) return found;
  await CommsHubSettings.create({ id: 1 }, { transaction: t });
  return (await CommsHubSettings.findByPk(1, { transaction: t, lock: t.LOCK.UPDATE }))!;
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Pause or resume every channel. Returns the settings as they now are. */
export async function setSendingPaused(paused: boolean, actor: Actor): Promise<HubSettingsView> {
  return sequelize.transaction(async (t) => {
    const row = await lockedRow(t);
    if (row.sending_paused !== paused) {
      await row.update({ sending_paused: paused, updated_by: actor.id }, { transaction: t });
      await logActivity(actor, paused ? 'sending.paused' : 'sending.resumed', 'settings', null, {}, t);
    }
    return toView(row, t);
  });
}

/** Quiet hours, alert recipients and the test cohort. Only the fields given change. */
export async function updateHubSettings(patch: SettingsPatch, actor: Actor): Promise<HubSettingsView> {
  return sequelize.transaction(async (t) => {
    const row = await lockedRow(t);
    const changes: Partial<Pick<CommsHubSettings, 'quiet_hours' | 'alert_recipients' | 'test_cohort_id'>> = {};
    if (patch.quiet_hours !== undefined && !sameJson(patch.quiet_hours, row.quiet_hours)) changes.quiet_hours = patch.quiet_hours;
    if (patch.alert_recipients !== undefined) {
      const list = Array.from(new Set(patch.alert_recipients.map((e) => e.trim().toLowerCase()).filter(Boolean)));
      if (!sameJson(list, row.alert_recipients)) changes.alert_recipients = list;
    }
    if (patch.test_cohort_id !== undefined && patch.test_cohort_id !== row.test_cohort_id) {
      if (patch.test_cohort_id && !(await cohortRef(patch.test_cohort_id, t))) throw new SettingsInputError('That test cohort was not found.');
      changes.test_cohort_id = patch.test_cohort_id;
    }
    const fields = Object.keys(changes);
    if (fields.length) {
      await row.update({ ...changes, updated_by: actor.id }, { transaction: t });
      await logActivity(actor, 'settings.changed', 'settings', null, { fields }, t);
    }
    return toView(row, t);
  });
}
