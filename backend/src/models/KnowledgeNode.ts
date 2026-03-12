import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type KnowledgeNodeType =
  | 'entity'
  | 'table'
  | 'metric'
  | 'department'
  | 'agent'
  | 'campaign'
  | 'student'
  | 'cohort'
  | 'lead'
  | 'curriculum'
  | 'lesson'
  | 'partnership'
  | 'alumni';

interface KnowledgeNodeAttributes {
  id?: string;
  node_type: KnowledgeNodeType;
  entity_id: string;
  entity_name: string;
  department?: string;
  metadata?: Record<string, any>;
  created_at?: Date;
}

class KnowledgeNode extends Model<KnowledgeNodeAttributes> implements KnowledgeNodeAttributes {
  declare id: string;
  declare node_type: KnowledgeNodeType;
  declare entity_id: string;
  declare entity_name: string;
  declare department: string;
  declare metadata: Record<string, any>;
  declare created_at: Date;
}

KnowledgeNode.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    node_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    entity_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    entity_name: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    department: {
      type: DataTypes.STRING(50),
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
    tableName: 'knowledge_nodes',
    timestamps: false,
    indexes: [
      { fields: ['node_type'] },
      { fields: ['entity_id'] },
      { fields: ['department'] },
      {
        unique: true,
        fields: ['node_type', 'entity_id'],
        name: 'knowledge_nodes_type_entity_unique',
      },
    ],
  }
);

export default KnowledgeNode;
