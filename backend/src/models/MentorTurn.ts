/** MentorTurn — one AI Mentor exchange, persisted so the coach remembers the
 *  student's history across a session. Created by ensureRuntimeSchema. */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class MentorTurn extends Model {
  declare id: string;
  declare enrollment_id: string;
  declare card_id: string | null;
  declare mode: string;
  declare question: string | null;
  declare reply: string | null;
  declare created_at: Date;
}

MentorTurn.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  enrollment_id: { type: DataTypes.UUID, allowNull: false },
  card_id: { type: DataTypes.UUID, allowNull: true },
  mode: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ask' },
  question: { type: DataTypes.TEXT, allowNull: true },
  reply: { type: DataTypes.TEXT, allowNull: true },
}, { sequelize, modelName: 'MentorTurn', tableName: 'runtime_mentor_turns', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false });

export default MentorTurn;
