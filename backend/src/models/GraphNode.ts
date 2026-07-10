/** GraphNode — a node in the Enterprise Memory Graph. Every entity in the
 *  platform (student, curriculum, meeting, AI employee, artifact, decision, …)
 *  becomes a node with identity, metadata, owner, trust, lifecycle, version.
 *  Unique on (node_type, entity_id). Created by ensureIntelligenceSchema. */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class GraphNode extends Model {
  declare id: string;
  declare node_type: string;
  declare entity_id: string;
  declare label: string;
  declare metadata: any;
  declare owner: string | null;
  declare trust_score: number;
  declare status: string;
  declare version: number;
  declare created_at: Date;
  declare updated_at: Date;
}

GraphNode.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  node_type: { type: DataTypes.STRING(40), allowNull: false },
  entity_id: { type: DataTypes.STRING(120), allowNull: false },
  label: { type: DataTypes.STRING(400), allowNull: false },
  metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  owner: { type: DataTypes.STRING(120), allowNull: true },
  trust_score: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0.5 },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
  version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
}, { sequelize, modelName: 'GraphNode', tableName: 'graph_nodes', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

export default GraphNode;
