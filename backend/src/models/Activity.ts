import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface ActivityAttributes {
  id?: string;
  lead_id: number;
  admin_user_id?: string;
  type: string;
  subject?: string;
  body?: string;
  metadata?: Record<string, any>;
  created_at?: Date;
}

class Activity extends Model<ActivityAttributes> implements ActivityAttributes {
  declare id: string;
  declare lead_id: number;
  declare admin_user_id: string;
  declare type: string;
  declare subject: string;
  declare body: string;
  declare metadata: Record<string, any>;
  declare created_at: Date;
}

Activity.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'leads', key: 'id' },
    },
    admin_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'admin_users', key: 'id' },
    },
    type: {
      type: DataTypes.ENUM(
        'note',
        'email_sent',
        'email_opened',
        'call',
        'meeting',
        'status_change',
        'score_change',
        'sms',
        'system'
      ),
      allowNull: false,
    },
    subject: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'activities',
    timestamps: false,
  }
);

export default Activity;
