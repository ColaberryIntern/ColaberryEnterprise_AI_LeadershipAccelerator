/** WorkforceMemory — an AI Employee's persistent memory (meeting/decision/
 *  project/relationship/learning). Searchable per employee. */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class WorkforceMemory extends Model {
  declare id: string;
  declare employee_slug: string;
  declare kind: string;      // meeting | decision | project | relationship | learning | working
  declare content: string;
  declare ref: string | null;
  declare created_at: Date;
}

WorkforceMemory.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  employee_slug: { type: DataTypes.STRING(40), allowNull: false },
  kind: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'working' },
  content: { type: DataTypes.TEXT, allowNull: false },
  ref: { type: DataTypes.STRING(120), allowNull: true },
}, { sequelize, modelName: 'WorkforceMemory', tableName: 'workforce_memory', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false });

export default WorkforceMemory;
