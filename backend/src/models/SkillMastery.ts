import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface SkillMasteryAttributes {
  id?: string;
  enrollment_id: string;
  skill_id: string;
  proficiency_level: number;
  evidence_json?: any;
  last_demonstrated?: Date;
  artifact_weight?: number;
  prompt_weight?: number;
  github_progress_weight?: number;
  mastery_threshold?: number;
  admin_override_flag?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class SkillMastery extends Model<SkillMasteryAttributes> implements SkillMasteryAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare skill_id: string;
  declare proficiency_level: number;
  declare evidence_json: any;
  declare last_demonstrated: Date;
  declare artifact_weight: number;
  declare prompt_weight: number;
  declare github_progress_weight: number;
  declare mastery_threshold: number;
  declare admin_override_flag: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

SkillMastery.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'enrollments', key: 'id' },
    },
    skill_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    proficiency_level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    evidence_json: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    last_demonstrated: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    artifact_weight: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.3,
    },
    prompt_weight: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.2,
    },
    github_progress_weight: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.2,
    },
    mastery_threshold: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.7,
    },
    admin_override_flag: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'skill_mastery',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['enrollment_id', 'skill_id'],
      },
    ],
  }
);

export default SkillMastery;
