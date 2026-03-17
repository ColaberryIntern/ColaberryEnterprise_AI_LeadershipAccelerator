import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface RequirementsGenerationJobAttributes {
  id?: string;
  project_id: string;
  enrollment_id: string;
  mode: 'professional' | 'autonomous';
  status?: JobStatus;
  prompt?: string;
  output_document?: string;
  artifact_submission_id?: string;
  error_message?: string;
  created_at?: Date;
  completed_at?: Date;
}

class RequirementsGenerationJob extends Model<RequirementsGenerationJobAttributes>
  implements RequirementsGenerationJobAttributes {
  declare id: string;
  declare project_id: string;
  declare enrollment_id: string;
  declare mode: 'professional' | 'autonomous';
  declare status: JobStatus;
  declare prompt: string;
  declare output_document: string;
  declare artifact_submission_id: string;
  declare error_message: string;
  declare created_at: Date;
  declare completed_at: Date;
}

RequirementsGenerationJob.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'projects', key: 'id' },
    },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'enrollments', key: 'id' },
    },
    mode: {
      type: DataTypes.ENUM('professional', 'autonomous'),
      allowNull: false,
      defaultValue: 'professional',
    },
    status: {
      type: DataTypes.ENUM('queued', 'running', 'completed', 'failed'),
      allowNull: false,
      defaultValue: 'queued',
    },
    prompt: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    output_document: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    artifact_submission_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'assignment_submissions', key: 'id' },
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'requirements_generation_jobs',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['enrollment_id'] },
      { fields: ['status'] },
    ],
  }
);

export default RequirementsGenerationJob;
