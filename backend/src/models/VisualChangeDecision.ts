/**
 * VisualChangeDecision — user verdict on an AI suggestion (or a critique
 * item that bypassed AI).
 *
 * The decision feeds the prompt generator: only `accepted` items make it
 * into the generated prompt package.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type DecisionVerdict = 'accepted' | 'rejected' | 'deferred';

interface Attrs {
  id?: string;
  session_id: string;
  project_id: string;

  /** Either suggestion_id OR critique_id is set; never both. */
  suggestion_id: string | null;
  critique_id: string | null;

  verdict: DecisionVerdict;
  rationale: string | null;

  decided_by: string;
  decided_at: Date;

  /** When the related build is reviewed, the resulting manifest is back-linked here. */
  resulting_manifest_id: string | null;

  created_at?: Date;
}

class VisualChangeDecision extends Model<Attrs> implements Attrs {
  declare id: string;
  declare session_id: string;
  declare project_id: string;
  declare suggestion_id: string | null;
  declare critique_id: string | null;
  declare verdict: DecisionVerdict;
  declare rationale: string | null;
  declare decided_by: string;
  declare decided_at: Date;
  declare resulting_manifest_id: string | null;
  declare created_at: Date;
}

VisualChangeDecision.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    session_id: { type: DataTypes.UUID, allowNull: false },
    project_id: { type: DataTypes.UUID, allowNull: false },
    suggestion_id: { type: DataTypes.UUID, allowNull: true },
    critique_id: { type: DataTypes.UUID, allowNull: true },
    verdict: { type: DataTypes.STRING(16), allowNull: false },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    decided_by: { type: DataTypes.STRING(255), allowNull: false },
    decided_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    resulting_manifest_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'visual_change_decisions',
    timestamps: false,
    indexes: [
      { fields: ['session_id'] },
      { fields: ['project_id'] },
      { fields: ['verdict'] },
    ],
  }
);

export default VisualChangeDecision;
