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
  public id!: string;
  public name!: string;
  public start_date!: string;
  public core_day!: string;
  public core_time!: string;
  public optional_lab_day!: string;
  public max_seats!: number;
  public seats_taken!: number;
  public status!: 'open' | 'closed' | 'completed';
  public created_at!: Date;
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
