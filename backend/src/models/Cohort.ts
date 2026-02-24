import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CohortAttributes {
  id?: string;
  name: string;
  start_date: string;
  core_day: string;
  core_time: string;
  optional_lab_day?: string;
  max_seats: number;
  seats_taken: number;
  status: 'open' | 'closed' | 'completed';
  created_at?: Date;
}

class Cohort extends Model<CohortAttributes> implements CohortAttributes {
  declare id: string;
  declare name: string;
  declare start_date: string;
  declare core_day: string;
  declare core_time: string;
  declare optional_lab_day: string;
  declare max_seats: number;
  declare seats_taken: number;
  declare status: 'open' | 'closed' | 'completed';
  declare created_at: Date;
}

Cohort.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    core_day: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    core_time: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    optional_lab_day: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    max_seats: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 20,
    },
    seats_taken: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.ENUM('open', 'closed', 'completed'),
      allowNull: false,
      defaultValue: 'open',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'cohorts',
    timestamps: false,
  }
);

export default Cohort;
