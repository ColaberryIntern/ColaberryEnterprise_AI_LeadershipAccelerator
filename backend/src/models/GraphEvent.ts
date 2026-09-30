/** GraphEvent — the one organizational timeline. Every meaningful platform event
 *  (student enrolled, curriculum published, meeting held, decision made, …)
 *  becomes a chronological, node-linked event. */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class GraphEvent extends Model {
  declare id: string;
  declare node_id: string | null;
  declare event_type: string;
  declare summary: string;
  declare actor: string | null;
  declare ref: string | null;
  declare tenant_id: string | null;
  declare created_at: Date;
}

GraphEvent.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  // Tenant scoping for the timeline. Declared here as well as in the DDL because
  // Sequelize only touches attributes the model knows about. Nullable: node_id is too,
  // so an event can exist without a node and still needs its own tenant.
  tenant_id: { type: DataTypes.UUID, allowNull: true },
  node_id: { type: DataTypes.UUID, allowNull: true },
  event_type: { type: DataTypes.STRING(40), allowNull: false },
  summary: { type: DataTypes.STRING(500), allowNull: false },
  actor: { type: DataTypes.STRING(120), allowNull: true },
  ref: { type: DataTypes.STRING(120), allowNull: true },
}, { sequelize, modelName: 'GraphEvent', tableName: 'graph_events', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false });

export default GraphEvent;
