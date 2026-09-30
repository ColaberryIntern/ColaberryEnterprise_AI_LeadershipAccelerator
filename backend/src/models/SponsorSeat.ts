import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// One redeemable seat owned by a Sponsor. Employees redeem a code to claim a
// seat, which links it to their Enrollment. Reassignable seats kill the
// "what if they quit" objection: a seat can be released and reassigned, so its
// status moves available -> redeemed -> (reassigned | expired).
export interface SponsorSeatAttributes {
  id?: string;
  sponsor_id: string;
  redemption_code: string;
  status: 'available' | 'redeemed' | 'reassigned' | 'expired';
  assigned_enrollment_id?: string | null;
  redeemed_at?: Date | null;
  expires_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class SponsorSeat extends Model<SponsorSeatAttributes> implements SponsorSeatAttributes {
  declare id: string;
  declare sponsor_id: string;
  declare redemption_code: string;
  declare status: 'available' | 'redeemed' | 'reassigned' | 'expired';
  declare assigned_enrollment_id: string | null;
  declare redeemed_at: Date | null;
  declare expires_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

SponsorSeat.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    sponsor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'sponsors', key: 'id' },
    },
    redemption_code: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    status: {
      type: DataTypes.ENUM('available', 'redeemed', 'reassigned', 'expired'),
      allowNull: false,
      defaultValue: 'available',
    },
    assigned_enrollment_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'enrollments', key: 'id' },
    },
    redeemed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    expires_at: {
      type: DataTypes.DATE,
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
    tableName: 'sponsor_seats',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['redemption_code'], name: 'sponsor_seats_redemption_code_unique' },
      { fields: ['sponsor_id'], name: 'idx_sponsor_seats_sponsor_id' },
      { fields: ['assigned_enrollment_id'], name: 'idx_sponsor_seats_enrollment_id' },
      { fields: ['status'], name: 'idx_sponsor_seats_status' },
    ],
  }
);

export default SponsorSeat;
