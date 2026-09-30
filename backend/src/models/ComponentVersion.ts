import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * ComponentVersion — an immutable snapshot of an AI Component (curriculum type)
 * every time its prompts/metadata are saved in the Experience Builder. Enables
 * version history, diffing, and one-click restore. Append-only.
 */
export interface ComponentVersionAttributes {
  id?: string;
  component_slug: string;      // FK-by-convention -> curriculum_type_definitions.slug
  version: number;             // monotonic per component
  snapshot: any;               // full editable payload at save time
  label?: string | null;       // optional human note
  author?: string | null;      // admin email/id
  created_at?: Date;
}

class ComponentVersion extends Model<ComponentVersionAttributes> implements ComponentVersionAttributes {
  declare id: string;
  declare component_slug: string;
  declare version: number;
  declare snapshot: any;
  declare label: string | null;
  declare author: string | null;
  declare created_at: Date;
}

ComponentVersion.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    component_slug: { type: DataTypes.STRING(100), allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false },
    snapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    label: { type: DataTypes.STRING(255), allowNull: true },
    author: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'component_versions',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['component_slug', 'version'] },
      { fields: ['component_slug'] },
    ],
  }
);

export default ComponentVersion;
