import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface KnowledgeEdgeAttributes {
  id?: string;
  source_node_id: string;
  target_node_id: string;
  relationship_type: string;
  weight?: number;
  confidence?: number;
  metadata?: Record<string, any>;
  created_at?: Date;
}

class KnowledgeEdge extends Model<KnowledgeEdgeAttributes> implements KnowledgeEdgeAttributes {
  declare id: string;
  declare source_node_id: string;
  declare target_node_id: string;
  declare relationship_type: string;
  declare weight: number;
  declare confidence: number;
  declare metadata: Record<string, any>;
  declare created_at: Date;
}

KnowledgeEdge.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    source_node_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'knowledge_nodes', key: 'id' },
    },
    target_node_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'knowledge_nodes', key: 'id' },
    },
    relationship_type: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    weight: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 1.0,
    },
    confidence: {
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
    tableName: 'knowledge_edges',
    timestamps: false,
    indexes: [
      { fields: ['source_node_id'] },
      { fields: ['target_node_id'] },
      { fields: ['relationship_type'] },
      {
        unique: true,
        fields: ['source_node_id', 'target_node_id', 'relationship_type'],
        name: 'knowledge_edges_unique_relationship',
      },
    ],
  }
);

export default KnowledgeEdge;
