import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class BlueprintSnapshot extends Model {
  declare id: string;
  declare blueprint_id: string;
  declare snapshot_data: any;
  declare description: string | null;
  declare created_by: string | null;
  declare created_at: Date;
}

BlueprintSnapshot.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    blueprint_id: { type: DataTypes.UUID, allowNull: false },
    snapshot_data: { type: DataTypes.JSONB, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'blueprint_snapshots',
    timestamps: false,
  }
);

export default BlueprintSnapshot;
