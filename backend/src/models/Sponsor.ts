import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// Door B (employer sponsorship) — a company that purchases annual seats for its
// employees to enter the cohort. The corporate value prop is talent discovery,
// not training. contact_lead_id links back to the Lead that originated the deal.
export interface SponsorAttributes {
  id?: string;
  company_name: string;
  contact_lead_id?: number | null;
  seats_purchased: number;
  plan?: string;
  billing_status: 'pending' | 'invoiced' | 'paid' | 'cancelled';
  paysimple_invoice_id?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class Sponsor extends Model<SponsorAttributes> implements SponsorAttributes {
  declare id: string;
  declare company_name: string;
  declare contact_lead_id: number | null;
  declare seats_purchased: number;
  declare plan: string;
  declare billing_status: 'pending' | 'invoiced' | 'paid' | 'cancelled';
  declare paysimple_invoice_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

Sponsor.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    company_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    contact_lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
    },
    seats_purchased: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    plan: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    billing_status: {
      type: DataTypes.ENUM('pending', 'invoiced', 'paid', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    paysimple_invoice_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'sponsors',
    timestamps: false,
    indexes: [
      { fields: ['contact_lead_id'], name: 'idx_sponsors_contact_lead_id' },
      { fields: ['billing_status'], name: 'idx_sponsors_billing_status' },
      { fields: ['created_at'], name: 'idx_sponsors_created_at' },
    ],
  }
);

export default Sponsor;
