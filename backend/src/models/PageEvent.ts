import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface PageEventAttributes {
  id?: string;
  session_id: string;
  visitor_id: string;
  event_type: string;
  page_url: string;
  page_path: string;
  page_title?: string | null;
  page_category?: string | null;
  event_data?: Record<string, any> | null;
  timestamp: Date;
  created_at?: Date;
}

class PageEvent extends Model<PageEventAttributes> implements PageEventAttributes {
  declare id: string;
  declare session_id: string;
  declare visitor_id: string;
  declare event_type: string;
  declare page_url: string;
  declare page_path: string;
  declare page_title: string | null;
  declare page_category: string | null;
  declare event_data: Record<string, any> | null;
  declare timestamp: Date;
  declare created_at: Date;
}

PageEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'visitor_sessions', key: 'id' },
    },
    visitor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'visitors', key: 'id' },
    },
    event_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    page_url: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    page_path: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    page_title: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    page_category: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    event_data: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'page_events',
    timestamps: false,
  }
);

export default PageEvent;
