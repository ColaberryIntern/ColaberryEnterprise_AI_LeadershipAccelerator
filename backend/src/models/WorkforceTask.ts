/** WorkforceTask — a unit of work owned by an AI Employee. Lifecycle: assigned →
 *  planning → working → needs_approval → completed (or deferred/cancelled/escalated). */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class WorkforceTask extends Model {
  declare id: string;
  declare employee_slug: string;
  declare title: string;
  declare description: string | null;
  declare status: string;
  declare priority: string;
  declare deadline: Date | null;
  declare approver: string | null;
  declare evidence: any;
  declare source_rec_key: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

WorkforceTask.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  employee_slug: { type: DataTypes.STRING(40), allowNull: false },
  title: { type: DataTypes.STRING(400), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'assigned' },
  priority: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'medium' },
  deadline: { type: DataTypes.DATE, allowNull: true },
  approver: { type: DataTypes.STRING(40), allowNull: true },
  evidence: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  source_rec_key: { type: DataTypes.STRING(120), allowNull: true },
}, { sequelize, modelName: 'WorkforceTask', tableName: 'workforce_tasks', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

export default WorkforceTask;
