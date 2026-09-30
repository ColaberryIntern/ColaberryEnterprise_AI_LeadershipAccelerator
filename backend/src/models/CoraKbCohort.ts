import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CoraKbCohortAttributes {
  id?: string;
  course_id: string;
  name: string;
  cohort_number: number;
  open_house_date?: string | null;
  open_house_url?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  expo_date?: string | null;
  price_annual?: number | null;
  price_monthly?: number | null;
  seats_total?: number | null;
  seats_remaining?: number | null;
  enrollment_url?: string | null;
  waitlist_url?: string | null;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class CoraKbCohort extends Model<CoraKbCohortAttributes> implements CoraKbCohortAttributes {
  declare id: string;
  declare course_id: string;
  declare name: string;
  declare cohort_number: number;
  declare open_house_date: string | null;
  declare open_house_url: string | null;
  declare start_date: string | null;
  declare end_date: string | null;
  declare expo_date: string | null;
  declare price_annual: number | null;
  declare price_monthly: number | null;
  declare seats_total: number | null;
  declare seats_remaining: number | null;
  declare enrollment_url: string | null;
  declare waitlist_url: string | null;
  declare is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

CoraKbCohort.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    course_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'cora_courses', key: 'id' },
    },
    name: { type: DataTypes.STRING(100), allowNull: false },
    cohort_number: { type: DataTypes.INTEGER, allowNull: false },
    open_house_date: { type: DataTypes.STRING(100), allowNull: true },
    open_house_url: { type: DataTypes.STRING(500), allowNull: true },
    start_date: { type: DataTypes.STRING(100), allowNull: true },
    end_date: { type: DataTypes.STRING(100), allowNull: true },
    expo_date: { type: DataTypes.STRING(100), allowNull: true },
    price_annual: { type: DataTypes.INTEGER, allowNull: true },
    price_monthly: { type: DataTypes.INTEGER, allowNull: true },
    seats_total: { type: DataTypes.INTEGER, allowNull: true },
    seats_remaining: { type: DataTypes.INTEGER, allowNull: true },
    enrollment_url: { type: DataTypes.STRING(500), allowNull: true },
    waitlist_url: { type: DataTypes.STRING(500), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'cora_cohorts',
    timestamps: false,
    indexes: [
      { fields: ['course_id'], name: 'idx_cora_cohorts_course_id' },
    ],
  }
);

export default CoraKbCohort;
