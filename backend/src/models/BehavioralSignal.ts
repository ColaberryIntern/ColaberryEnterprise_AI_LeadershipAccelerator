import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface BehavioralSignalAttributes {
  id?: string;
  visitor_id: string;
  session_id?: string | null;
  lead_id?: number | null;
  signal_type: string;
  signal_strength: number;
  context?: Record<string, any> | null;
  detected_at: Date;
  created_at?: Date;
}

class BehavioralSignal extends Model<BehavioralSignalAttributes> implements BehavioralSignalAttributes {
  declare id: string;
  declare visitor_id: string;
  declare session_id: string | null;
  declare lead_id: number | null;
  declare signal_type: string;
  declare signal_strength: number;
  declare context: Record<string, any> | null;
  declare detected_at: Date;
  declare created_at: Date;
}

BehavioralSignal.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    visitor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'visitors', key: 'id' },
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'visitor_sessions', key: 'id' },
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
    },
    signal_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    signal_strength: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    context: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    detected_at: {
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
    tableName: 'behavioral_signals',
    timestamps: false,
    indexes: [
      { fields: ['visitor_id'] },
      { fields: ['lead_id'] },
      { fields: ['signal_type'] },
      { fields: ['detected_at'] },
    ],
  }
);

export default BehavioralSignal;
