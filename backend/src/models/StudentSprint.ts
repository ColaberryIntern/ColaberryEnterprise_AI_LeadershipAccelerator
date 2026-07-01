import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// A student build "sprint" — maps an engine release (r0, r1, ...) to a
// schedulable grouping of tasks. See docs/student-platform-sync/02-*.md.
export interface StudentSprintAttributes {
  id?: string;
  project_id: string;
  key: string;
  name: string;
  goal?: string | null;
  demo?: string | null;
  week_start?: number | null;
  week_end?: number | null;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class StudentSprint extends Model<StudentSprintAttributes> implements StudentSprintAttributes {
  declare id: string;
  declare project_id: string;
  declare key: string;
  declare name: string;
  declare goal: string | null;
  declare demo: string | null;
  declare week_start: number | null;
  declare week_end: number | null;
  declare is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

StudentSprint.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
    key: { type: DataTypes.STRING(20), allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    goal: { type: DataTypes.TEXT, allowNull: true },
    demo: { type: DataTypes.TEXT, allowNull: true },
    week_start: { type: DataTypes.INTEGER, allowNull: true },
    week_end: { type: DataTypes.INTEGER, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    sequelize,
    tableName: 'student_sprints',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['project_id'] },
      { unique: true, fields: ['project_id', 'key'], name: 'student_sprints_unique_project_key' },
    ],
  }
);

export default StudentSprint;
