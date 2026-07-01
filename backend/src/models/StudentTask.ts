import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type StudentTaskStatus = 'not_started' | 'in_progress' | 'complete' | 'blocked';

export interface StudentTaskAttributes {
  id?: string;
  task_list_id: string;
  project_id: string;
  requirement_map_id?: string | null;
  requirement_key: string;
  title: string;
  description?: string | null;
  status?: StudentTaskStatus;
  position?: number;
  created_at?: Date;
  updated_at?: Date;
}

class StudentTask extends Model<StudentTaskAttributes> implements StudentTaskAttributes {
  declare id: string;
  declare task_list_id: string;
  declare project_id: string;
  declare requirement_map_id: string | null;
  declare requirement_key: string;
  declare title: string;
  declare description: string | null;
  declare status: StudentTaskStatus;
  declare position: number;
  declare created_at: Date;
  declare updated_at: Date;
}

StudentTask.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    task_list_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'student_task_lists', key: 'id' } },
    project_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
    requirement_map_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'requirements_maps', key: 'id' } },
    requirement_key: { type: DataTypes.STRING(255), allowNull: false },
    title: { type: DataTypes.STRING(500), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM('not_started', 'in_progress', 'complete', 'blocked'),
      allowNull: false,
      defaultValue: 'not_started',
    },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    sequelize,
    tableName: 'student_tasks',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['task_list_id'] },
      { fields: ['project_id'] },
      { fields: ['requirement_map_id'] },
      { unique: true, fields: ['project_id', 'requirement_key'], name: 'student_tasks_unique_req_key' },
    ],
  }
);

export default StudentTask;
