import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * The versioned operating blueprint — what was actually approved, pinned to exact revisions.
 *
 * NOT called `Blueprint`, deliberately. `BuildBlueprint` already exists in
 * services/delivery/buildBlueprint.ts with four consumers, `GeneratedBlueprint` exists in
 * structureGenerationService.ts, and there is a whole services/agentBlueprint/ tree. Reusing the
 * bare name would make every future grep ambiguous.
 *
 * A MANIFEST, NOT A SECOND DATABASE. `refs_json` holds pinned revision POINTERS into the
 * existing normalized records (requirements, processes, tasks, assignments, agent contracts,
 * workspace/action map, design decisions, control policies, downstream plan/release/story ids).
 * It deliberately does not copy that data: a second mutable truth store immediately raises the
 * question of which copy is right. The manifest answers "what exactly was approved" by pinning
 * revisions; the domain tables stay the source of their own data.
 *
 * IMMUTABLE ONCE APPROVED. An approved revision is never edited — a change forks a new revision
 * and stamps the old one `superseded`, with `prior_revision_id` / `superseded_by_id` carrying the
 * lineage. `content_sha256` binds tenant + project + revision, closing the gap that
 * factoryApproval's hash leaves open (it covers only revisionId + doc_json, so it binds neither
 * tenant nor actor, while the request requires every citation to resolve within the correct
 * project/tenant and revision).
 *
 * `proposed_by` exists so separation of duty is real. Without a proposer there is nothing to
 * compare an approver against, and the check would short-circuit on a null and pass silently.
 *
 * `measures_json` carries effort and allocation measures WITH their basis and assessed coverage.
 * A percentage without its denominator is the specific dishonesty this field exists to prevent.
 *
 * Schema: db/ensureProjectLifecycleSchema.ts. Contract: docs/project-lifecycle/blueprint-contract.md.
 */
export interface OperatingBlueprintManifestAttributes {
  id?: string;
  tenant_id: string;
  student_project_id?: string | null;
  delivery_project_id?: string | null;
  schema_version: number;
  revision: number;
  content_sha256?: string | null;
  status: string;
  refs_json: unknown;
  measures_json?: unknown | null;
  prior_revision_id?: string | null;
  superseded_by_id?: string | null;
  proposed_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class OperatingBlueprintManifest extends Model<OperatingBlueprintManifestAttributes> implements OperatingBlueprintManifestAttributes {
  declare id: string;
  declare tenant_id: string;
  declare student_project_id: string | null;
  declare delivery_project_id: string | null;
  declare schema_version: number;
  declare revision: number;
  declare content_sha256: string | null;
  declare status: string;
  declare refs_json: unknown;
  declare measures_json: unknown | null;
  declare prior_revision_id: string | null;
  declare superseded_by_id: string | null;
  declare proposed_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

OperatingBlueprintManifest.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    student_project_id: { type: DataTypes.UUID, allowNull: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: true },
    schema_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    content_sha256: { type: DataTypes.STRING(64), allowNull: true },
    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'draft' },
    refs_json: { type: DataTypes.JSONB, allowNull: false },
    measures_json: { type: DataTypes.JSONB, allowNull: true },
    prior_revision_id: { type: DataTypes.UUID, allowNull: true },
    superseded_by_id: { type: DataTypes.UUID, allowNull: true },
    proposed_by: { type: DataTypes.TEXT, allowNull: true },
  },
  { sequelize, tableName: 'operating_blueprint_manifests', timestamps: true, underscored: true },
);

export default OperatingBlueprintManifest;
