import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// Per-student, per-course progress row fetched from the Anthropic Skilljar API.
// One row per (email, course_url). Upserted on each sync run.
// Migration: backend/src/seeds/migrations/add_student_skilljar_progress.sql

class StudentSkilljarProgress extends Model {
  declare id: string;
  declare email: string;
  declare skilljar_user_id: string | null;
  declare course_url: string;
  declare course_title: string | null;
  declare percent_complete: number;
  declare completed: boolean;
  declare completed_at: Date | null;
  declare last_synced_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

StudentSkilljarProgress.init(
  {
    id:               { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email:            { type: DataTypes.STRING(255), allowNull: false },
    skilljar_user_id: { type: DataTypes.STRING(100), allowNull: true },
    course_url:       { type: DataTypes.TEXT, allowNull: false },
    course_title:     { type: DataTypes.TEXT, allowNull: true },
    percent_complete: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    completed:        { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    completed_at:     { type: DataTypes.DATE, allowNull: true },
    last_synced_at:   { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at:       { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at:       { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'student_skilljar_progress',
    timestamps: false,
  }
);

export default StudentSkilljarProgress;
