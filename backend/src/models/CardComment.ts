/** CardComment — the class comments under a Timeline card (FB-style). Every
 *  enrolled student sees the same thread per card; author_name is denormalized
 *  at write time so reads never join enrollments. */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class CardComment extends Model {
  declare id: string;
  declare card_id: string;
  declare enrollment_id: string;
  declare author_name: string;
  declare body: string;
  declare created_at: Date;
}

CardComment.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  card_id: { type: DataTypes.UUID, allowNull: false },
  enrollment_id: { type: DataTypes.UUID, allowNull: false },
  author_name: { type: DataTypes.STRING(200), allowNull: false, defaultValue: 'Student' },
  body: { type: DataTypes.TEXT, allowNull: false },
}, { sequelize, modelName: 'CardComment', tableName: 'timeline_card_comments', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false });

export default CardComment;
