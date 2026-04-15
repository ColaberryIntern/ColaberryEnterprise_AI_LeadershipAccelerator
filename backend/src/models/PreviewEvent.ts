import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type PreviewEventType =
  | 'provision'
  | 'boot'
  | 'stop'
  | 'teardown'
  | 'rebuild'
  | 'access'
  | 'archive'
  | 'restore'
  | 'error';

class PreviewEvent extends Model {
  declare id: string;
  declare preview_stack_id: string;
  declare event_type: PreviewEventType;
  declare detail: any;
  declare created_at: Date;
}

PreviewEvent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    preview_stack_id: { type: DataTypes.UUID, allowNull: false },
    event_type: {
      type: DataTypes.ENUM('provision', 'boot', 'stop', 'teardown', 'rebuild', 'access', 'archive', 'restore', 'error'),
      allowNull: false,
    },
    detail: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'preview_events',
    timestamps: false,
    indexes: [
      { fields: ['preview_stack_id'] },
      { fields: ['event_type'] },
      { fields: ['created_at'] },
    ],
  }
);

export default PreviewEvent;
