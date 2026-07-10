/** GraphEdge — a first-class relationship in the Memory Graph. Relationships
 *  carry a type, strength, confidence, and evidence. Unique on (from_id, to_id,
 *  edge_type). */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class GraphEdge extends Model {
  declare id: string;
  declare from_id: string;
  declare to_id: string;
  declare edge_type: string;
  declare strength: number;
  declare confidence: number;
  declare evidence: any;
  declare created_at: Date;
}

GraphEdge.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  from_id: { type: DataTypes.UUID, allowNull: false },
  to_id: { type: DataTypes.UUID, allowNull: false },
  edge_type: { type: DataTypes.STRING(40), allowNull: false },
  strength: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
  confidence: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0.8 },
  evidence: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
}, { sequelize, modelName: 'GraphEdge', tableName: 'graph_edges', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false });

export default GraphEdge;
