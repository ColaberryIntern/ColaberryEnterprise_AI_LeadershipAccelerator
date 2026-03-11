import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class BlueprintSnapshot extends Model {
  declare id: string;
  declare blueprint_id: string;
  declare snapshot_data: any;
  declare description: string | null;
  declare created_by: string | null;
  declare created_at: Date;
  declare version_number: number | null;
  declare snapshot_level: string | null;
  declare entity_id: string | null;
  declare change_summary: string | null;
}

BlueprintSnapshot.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    blueprint_id: { type: DataTypes.UUID, allowNull: false },
    snapshot_data: { type: DataTypes.JSONB, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    version_number: { type: DataTypes.INTEGER, allowNull: true },
    snapshot_level: { type: DataTypes.STRING(20), allowNull: true },
    entity_id: { type: DataTypes.UUID, allowNull: true },
    change_summary: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'blueprint_snapshots',
    timestamps: false,
  }
);

export default BlueprintSnapshot;
