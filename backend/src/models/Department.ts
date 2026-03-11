import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface DepartmentAttributes {
  id?: string;
  name: string;
  slug: string;
  mission?: string;
  color?: string;
  bg_light?: string;
  team_size?: number;
  health_score?: number;
  innovation_score?: number;
  strategic_objectives?: Record<string, any>[];
  kpis?: Record<string, any>[];
  metadata?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

class Department extends Model<DepartmentAttributes> implements DepartmentAttributes {
  declare id: string;
  declare name: string;
  declare slug: string;
  declare mission: string;
  declare color: string;
  declare bg_light: string;
  declare team_size: number;
  declare health_score: number;
  declare innovation_score: number;
  declare strategic_objectives: Record<string, any>[];
  declare kpis: Record<string, any>[];
  declare metadata: Record<string, any>;
  declare created_at: Date;
  declare updated_at: Date;
}

Department.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    slug: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    mission: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    color: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: '#718096',
    },
    bg_light: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: '#f7fafc',
    },
    team_size: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    health_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
    },
    innovation_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
    },
    strategic_objectives: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    kpis: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  },
  {
    sequelize,
    tableName: 'departments',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['slug'] }],
  }
);

export default Department;
