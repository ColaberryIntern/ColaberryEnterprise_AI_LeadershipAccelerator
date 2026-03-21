import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface ArtifactRelationshipAttributes {
  id?: string;
  parent_artifact_id: string;
  child_artifact_id: string;
  relationship_type: string;
  weight?: number;
  metadata?: Record<string, any>;
  created_at?: Date;
}

class ArtifactRelationship extends Model<ArtifactRelationshipAttributes> implements ArtifactRelationshipAttributes {
  declare id: string;
  declare parent_artifact_id: string;
  declare child_artifact_id: string;
  declare relationship_type: string;
  declare weight: number;
  declare metadata: Record<string, any>;
  declare created_at: Date;
}

ArtifactRelationship.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    parent_artifact_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'artifact_definitions', key: 'id' },
    },
    child_artifact_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'artifact_definitions', key: 'id' },
    },
    relationship_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    weight: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 1.0,
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
    tableName: 'artifact_relationships',
    timestamps: false,
    indexes: [
      { fields: ['parent_artifact_id'] },
      { fields: ['child_artifact_id'] },
      { fields: ['relationship_type'] },
      {
        unique: true,
        fields: ['parent_artifact_id', 'child_artifact_id', 'relationship_type'],
        name: 'artifact_relationships_unique_edge',
      },
    ],
  }
);

export default ArtifactRelationship;
