import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type TaskListStatus = 'not_started' | 'in_progress' | 'complete';

export interface StudentTaskListAttributes {
  id?: string;
  project_id: string;
  enrollment_id: string;
  cluster: string;
  title: string;
  status?: TaskListStatus;
  position?: number;
  created_at?: Date;
  updated_at?: Date;
}

class StudentTaskList extends Model<StudentTaskListAttributes> implements StudentTaskListAttributes {
  declare id: string;
  declare project_id: string;
  declare enrollment_id: string;
  declare cluster: string;
  declare title: string;
  declare status: TaskListStatus;
  declare position: number;
  declare created_at: Date;
  declare updated_at: Date;
}

StudentTaskList.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
    enrollment_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'enrollments', key: 'id' } },
    cluster: { type: DataTypes.STRING(50), allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    status: {
      type: DataTypes.ENUM('not_started', 'in_progress', 'complete'),
      allowNull: false,
      defaultValue: 'not_started',
    },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    sequelize,
    tableName: 'student_task_lists',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['enrollment_id'] },
      { unique: true, fields: ['project_id', 'cluster'], name: 'student_task_lists_unique_cluster' },
    ],
  }
);

export default StudentTaskList;
