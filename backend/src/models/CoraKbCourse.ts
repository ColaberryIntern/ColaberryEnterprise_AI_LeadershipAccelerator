import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CoraKbCourseAttributes {
  id?: string;
  name: string;
  slug: string;
  description?: string | null;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class CoraKbCourse extends Model<CoraKbCourseAttributes> implements CoraKbCourseAttributes {
  declare id: string;
  declare name: string;
  declare slug: string;
  declare description: string | null;
  declare is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

CoraKbCourse.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'cora_courses',
    timestamps: false,
  }
);

export default CoraKbCourse;
