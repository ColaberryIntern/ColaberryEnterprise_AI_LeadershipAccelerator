import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ChangeSeverity = 'unknown' | 'low' | 'medium' | 'high' | 'critical';

export interface AnthropicChangeEventAttributes {
  id?: string;
  registry_id: string;
  url: string;
  content_type: string;
  detected_at: Date;
  detection_method: string;
  previous_value: string | null;
  current_value: string;
  severity?: ChangeSeverity;
  processed_at?: Date;
}

class AnthropicChangeEvent
  extends Model<AnthropicChangeEventAttributes>
  implements AnthropicChangeEventAttributes {
  declare id: string;
  declare registry_id: string;
  declare url: string;
  declare content_type: string;
  declare detected_at: Date;
  declare detection_method: string;
  declare previous_value: string | null;
  declare current_value: string;
  declare severity: ChangeSeverity;
  declare processed_at: Date;
}

AnthropicChangeEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    registry_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    content_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    detected_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    detection_method: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    previous_value: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    current_value: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    severity: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'unknown',
    },
    processed_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'anthropic_change_events',
    timestamps: false,
  },
);

export default AnthropicChangeEvent;
