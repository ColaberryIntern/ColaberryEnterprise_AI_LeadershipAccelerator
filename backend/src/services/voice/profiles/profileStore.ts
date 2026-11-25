/**
 * Voice profile store (VS3.1): the only module that writes voice_agent_profiles and
 * voice_agent_versions. Lifecycle rules live in versionContent.ts (pure); this module applies them
 * inside transactions.
 *
 * Guarantees:
 *   - Idempotent: ensureProfile is keyed on (tenant, agent_key, direction); createDraftVersion is keyed
 *     on (profile, content_hash), so re-running a seed or re-saving the same content returns the
 *     existing version instead of creating a duplicate (unique indexes back both).
 *   - Immutable content: there is no function that updates a version's content. Status changes write
 *     only status / approved_by / approved_at, and only along transition()'s allowed edges.
 *   - Serialized per profile: version numbering and publishing take pg_advisory_xact_lock on the
 *     profile, so two concurrent saves cannot both claim version N and two publishes cannot leave two
 *     published versions.
 *   - Publish retires the previously published version and points the profile at the new one, in the
 *     same transaction; a failure rolls back all three writes.
 *
 * Failure modes handled: invalid content (ValidationError, nothing written), unknown profile/version
 * (NotFound), illegal transition or same-person approval (LifecycleError). Not handled here: retries
 * (callers are admin actions and a seed script; a failed call is safe to repeat because every write
 * is idempotent or transition-guarded).
 */
import { QueryTypes, type Transaction } from 'sequelize';
import { sequelize } from '../../../config/database';
import { VoiceAgentProfile, VoiceAgentVersion } from '../../../models/voiceStudioModels';
import type { ProfileDirection, VoiceAgentProfileAttrs, VoiceAgentVersionAttrs } from './profileTypes';
import { VersionContentSchema, contentHash, normalizeContent, transition, type LifecycleAction, type VersionContent } from './versionContent';

export class ProfileStoreError extends Error {
  constructor(public readonly errorClass: 'ValidationError' | 'NotFound' | 'LifecycleError', message: string) {
    super(message);
    this.name = errorClass;
  }
}

const plain = <T>(row: unknown): T => (row as { get: (o: { plain: true }) => T }).get({ plain: true });

async function lockProfile(profileId: string, t: Transaction): Promise<void> {
  await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:k))', { replacements: { k: `voice_profile:${profileId}` }, transaction: t, type: QueryTypes.SELECT });
}

export interface EnsureProfileInput { tenantId: string; brandSlug: string; agentKey: string; name: string; direction: ProfileDirection }

export async function ensureProfile(p: EnsureProfileInput): Promise<{ profile: VoiceAgentProfileAttrs; created: boolean }> {
  const [row, created] = await VoiceAgentProfile.findOrCreate({
    where: { tenant_id: p.tenantId, agent_key: p.agentKey, direction: p.direction },
    defaults: { tenant_id: p.tenantId, brand_slug: p.brandSlug, agent_key: p.agentKey, name: p.name, direction: p.direction, status: 'draft' },
  });
  return { profile: plain<VoiceAgentProfileAttrs>(row), created };
}

export async function createDraftVersion(profileId: string, raw: unknown, author: string): Promise<{ version: VoiceAgentVersionAttrs; created: boolean }> {
  const parsed = VersionContentSchema.safeParse(raw);
  if (!parsed.success) throw new ProfileStoreError('ValidationError', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  if (!author.trim()) throw new ProfileStoreError('ValidationError', 'author is required');
  const content: VersionContent = normalizeContent(parsed.data);
  const hash = contentHash(content);
  return sequelize.transaction(async (t) => {
    const profile = await VoiceAgentProfile.findByPk(profileId, { transaction: t });
    if (!profile) throw new ProfileStoreError('NotFound', 'profile not found');
    await lockProfile(profileId, t);
    const existing = await VoiceAgentVersion.findOne({ where: { profile_id: profileId, content_hash: hash }, transaction: t });
    if (existing) return { version: plain<VoiceAgentVersionAttrs>(existing), created: false };
    const max = (await VoiceAgentVersion.max('version', { where: { profile_id: profileId }, transaction: t })) as number | null;
    const row = await VoiceAgentVersion.create({
      tenant_id: plain<VoiceAgentProfileAttrs>(profile).tenant_id, profile_id: profileId, version: (max ?? 0) + 1,
      content_hash: hash, ...content, author: author.trim(), status: 'draft',
    }, { transaction: t });
    return { version: plain<VoiceAgentVersionAttrs>(row), created: true };
  });
}

/** approve | publish | retire one version. Returns the version after the change. */
export async function changeVersionStatus(versionId: string, action: LifecycleAction, actor: string): Promise<VoiceAgentVersionAttrs> {
  return sequelize.transaction(async (t) => {
    const first = await VoiceAgentVersion.findByPk(versionId, { transaction: t });
    if (!first) throw new ProfileStoreError('NotFound', 'version not found');
    const profileId = plain<VoiceAgentVersionAttrs>(first).profile_id;
    await lockProfile(profileId, t);
    const row = await VoiceAgentVersion.findByPk(versionId, { transaction: t }); // re-read under the lock
    const v = plain<VoiceAgentVersionAttrs>(row);
    const verdict = transition(v.status, action, actor, v.author);
    if (!verdict.ok) throw new ProfileStoreError('LifecycleError', `${action} refused: ${verdict.reason} (status ${v.status})`);
    const patch: Partial<VoiceAgentVersionAttrs> = { status: verdict.next };
    if (action === 'approve') Object.assign(patch, { approved_by: actor.trim(), approved_at: new Date() });
    if (action === 'publish') {
      await VoiceAgentVersion.update({ status: 'retired' }, { where: { profile_id: profileId, status: 'published' }, transaction: t });
      await VoiceAgentProfile.update({ active_version_id: versionId, status: 'active', updated_at: new Date() }, { where: { id: profileId }, transaction: t });
    }
    if (action === 'retire' && v.status === 'published') {
      await VoiceAgentProfile.update({ active_version_id: null, updated_at: new Date() }, { where: { id: profileId, active_version_id: versionId }, transaction: t });
    }
    await VoiceAgentVersion.update(patch, { where: { id: versionId }, transaction: t });
    return { ...v, ...patch } as VoiceAgentVersionAttrs;
  });
}

/** The version a new call must pin: the profile's active published version, or null. */
export async function activeVersion(profileId: string): Promise<VoiceAgentVersionAttrs | null> {
  const profile = await VoiceAgentProfile.findByPk(profileId);
  const id = profile ? plain<VoiceAgentProfileAttrs>(profile).active_version_id : null;
  if (!id) return null;
  const row = await VoiceAgentVersion.findOne({ where: { id, status: 'published' } });
  return row ? plain<VoiceAgentVersionAttrs>(row) : null;
}
