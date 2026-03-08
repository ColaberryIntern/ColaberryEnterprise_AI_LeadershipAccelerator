import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface AssignmentSubmissionAttributes {
  id?: string;
  enrollment_id: string;
  session_id?: string;
  assignment_type: 'prework_intake' | 'prework_upload' | 'build_lab' | 'evidence' | 'reflection';
  title: string;
  content_json?: any;
  file_path?: string;
  file_name?: string;
  status: 'pending' | 'submitted' | 'reviewed' | 'flagged';
  score?: number;
  reviewer_notes?: string;
  submitted_at?: Date;
  reviewed_at?: Date;
  artifact_definition_id?: string;
  version_number?: number;
  created_at?: Date;
}

class AssignmentSubmission extends Model<AssignmentSubmissionAttributes> implements AssignmentSubmissionAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare session_id: string;
  declare assignment_type: 'prework_intake' | 'prework_upload' | 'build_lab' | 'evidence' | 'reflection';
  declare title: string;
  declare content_json: any;
  declare file_path: string;
  declare file_name: string;
  declare status: 'pending' | 'submitted' | 'reviewed' | 'flagged';
  declare score: number;
  declare reviewer_notes: string;
  declare submitted_at: Date;
  declare reviewed_at: Date;
  declare artifact_definition_id: string;
  declare version_number: number;
  declare created_at: Date;
}

AssignmentSubmission.init(
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
    session_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'live_sessions', key: 'id' },
    },
    assignment_type: {
      type: DataTypes.ENUM('prework_intake', 'prework_upload', 'build_lab', 'evidence', 'reflection'),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    content_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    file_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    file_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'submitted', 'reviewed', 'flagged'),
      allowNull: false,
      defaultValue: 'pending',
    },
    score: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    reviewer_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    submitted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    artifact_definition_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'artifact_definitions', key: 'id' },
    },
    version_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'assignment_submissions',
    timestamps: false,
  }
);

export default AssignmentSubmission;
