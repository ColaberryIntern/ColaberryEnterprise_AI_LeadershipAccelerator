import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';

export interface MentorInterventionAttributes {
  id: string;
  project_id: string;
  artifact_submission_id: string | null;
  type: string;
  severity: string;
  message: string;
  recommended_action: string;
  status: string;
  created_at: Date;
  resolved_at: Date | null;
}

class MentorIntervention extends Model<MentorInterventionAttributes> implements MentorInterventionAttributes {
  public id!: string;
  public project_id!: string;
  public artifact_submission_id!: string | null;
  public type!: string;
  public severity!: string;
  public message!: string;
  public recommended_action!: string;
  public status!: string;
  public created_at!: Date;
  public resolved_at!: Date | null;
}

MentorIntervention.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    artifact_submission_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    severity: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'medium',
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    recommended_action: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'mentor_interventions',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'type', 'status'] },
      { fields: ['status'] },
    ],
  }
);

export default MentorIntervention;
