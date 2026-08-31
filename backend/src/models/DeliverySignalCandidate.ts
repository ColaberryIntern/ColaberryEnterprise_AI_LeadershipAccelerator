import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * DeliverySignalCandidate — a production signal's proposal, and never its action.
 *
 * `operateSignals.ts` shipped complete and pure, with a `SignalCandidate` whose `status` is
 * the literal type `'proposed'` and whose `requiresHumanReview` is the literal type `true`.
 * Those literals are the design: the module has no transition that applies a candidate,
 * because applying one means a person creating a story or a decision through the ordinary
 * gates. It had nowhere to write, so no signal had ever arrived.
 *
 * ## Nothing here can mutate production
 *
 * There is no foreign key from this table into stories, decisions or releases, and the
 * service that writes it touches nothing else. A system that changes production in
 * response to its own telemetry has nobody to ask when the telemetry is wrong.
 *
 * ## `evidence` keeps the shape of a `SignalReading`
 *
 * An observed value, or `not_observed` **with its reason**. Flattening that to a nullable
 * number would recreate the exact confusion the module was built to prevent: a zero error
 * rate meaning "no data" and a zero error rate meaning "nothing broke" are different facts
 * and must not share a representation.
 */
export interface DeliverySignalCandidateAttributes {
  id: string;
  delivery_project_id: string;
  kind: string;
  signal: string;
  summary: string;
  evidence: Record<string, unknown>;
  status: string;
  requires_human_review: boolean;
  /** True when the candidate is about missing telemetry rather than about a value. */
  about_missing_telemetry: boolean;
  created_by_identity_id: string | null;
  created_at: Date;
  updated_at: Date;
}

class DeliverySignalCandidate
  extends Model<DeliverySignalCandidateAttributes>
  implements DeliverySignalCandidateAttributes
{
  declare id: string;
  declare delivery_project_id: string;
  declare kind: string;
  declare signal: string;
  declare summary: string;
  declare evidence: Record<string, unknown>;
  declare status: string;
  declare requires_human_review: boolean;
  declare about_missing_telemetry: boolean;
  declare created_by_identity_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DeliverySignalCandidate.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    kind: { type: DataTypes.STRING(40), allowNull: false },
    signal: { type: DataTypes.STRING(40), allowNull: false },
    summary: { type: DataTypes.TEXT, allowNull: false },
    evidence: { type: DataTypes.JSONB, allowNull: false },
    // Only 'proposed' is legal today. Stored anyway: a column that can hold one value looks
    // redundant until a second state exists, when its absence becomes a migration on live
    // rows rather than a default.
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'proposed' },
    requires_human_review: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    about_missing_telemetry: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'delivery_signal_candidates',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['delivery_project_id', 'status'], name: 'idx_delivery_signal_candidates_project' },
      { fields: ['signal', 'kind'], name: 'idx_delivery_signal_candidates_signal' },
    ],
  },
);

export default DeliverySignalCandidate;
