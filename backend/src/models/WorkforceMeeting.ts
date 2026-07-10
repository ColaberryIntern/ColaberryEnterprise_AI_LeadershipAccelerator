/** WorkforceMeeting — the daily AI leadership meeting. Agenda + participants +
 *  action items are stored permanently (one per day, keyed on meeting_date). */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class WorkforceMeeting extends Model {
  declare id: string;
  declare meeting_date: string;   // YYYY-MM-DD
  declare title: string;
  declare agenda: any;            // { yesterday, priorities[], risks[], opportunities[], cross_department[] }
  declare participants: any;      // string[] of slugs
  declare contributions: any;     // [{ slug, name, role, line }]
  declare action_items: any;      // [{ owner, title, rec_key }]
  declare notes: string | null;
  declare created_at: Date;
}

WorkforceMeeting.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  meeting_date: { type: DataTypes.STRING(10), allowNull: false, unique: true },
  title: { type: DataTypes.STRING(200), allowNull: false, defaultValue: 'Daily Leadership Meeting' },
  agenda: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  participants: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  contributions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  action_items: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  notes: { type: DataTypes.TEXT, allowNull: true },
}, { sequelize, modelName: 'WorkforceMeeting', tableName: 'workforce_meetings', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false });

export default WorkforceMeeting;
