/** WorkforceMessage — inter-employee communication (Career asks Curriculum for
 *  stronger portfolio evidence, etc.). All communication is visible. */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class WorkforceMessage extends Model {
  declare id: string;
  declare from_slug: string;
  declare to_slug: string;
  declare subject: string;
  declare body: string | null;
  declare created_at: Date;
}

WorkforceMessage.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  from_slug: { type: DataTypes.STRING(40), allowNull: false },
  to_slug: { type: DataTypes.STRING(40), allowNull: false },
  subject: { type: DataTypes.STRING(300), allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: true },
}, { sequelize, modelName: 'WorkforceMessage', tableName: 'workforce_messages', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false });

export default WorkforceMessage;
