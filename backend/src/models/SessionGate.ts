import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type GateType = 'module_completion' | 'lesson_completion' | 'readiness_score' | 'artifact_completion' | 'build_phase_unlock' | 'presentation_unlock' | 'github_validation';

export interface SessionGateAttributes {
  id?: string;
  session_id: string;
  module_id?: string;
  lesson_id?: string;
  minimum_readiness_score?: number;
  gate_type: GateType;
  artifact_definition_id?: string;
  required_artifact_ids?: any;
  created_at?: Date;
}

class SessionGate extends Model<SessionGateAttributes> implements SessionGateAttributes {
  declare id: string;
  declare session_id: string;
  declare module_id: string;
  declare lesson_id: string;
  declare minimum_readiness_score: number;
  declare gate_type: GateType;
  declare artifact_definition_id: string;
  declare required_artifact_ids: any;
  declare created_at: Date;
}

SessionGate.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'live_sessions', key: 'id' },
    },
    module_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'curriculum_modules', key: 'id' },
    },
    lesson_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'curriculum_lessons', key: 'id' },
    },
    minimum_readiness_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    gate_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    artifact_definition_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'artifact_definitions', key: 'id' },
    },
    required_artifact_ids: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'session_gates',
    timestamps: false,
  }
);

export default SessionGate;
