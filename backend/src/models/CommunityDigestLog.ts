import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CommunityDigestLogAttributes {
  id?: string;
  member_id: string;
  digest_date: string;
  sent_at?: Date | null;
  created_at?: Date;
}

// Idempotency key for the daily digest (REQ-C6 trust control: "keyed on
// (date, member) so re-runs never double-send"). The unique constraint on
// (member_id, digest_date) is the actual enforcement — findOrCreate this row
// BEFORE composing/sending the email; `created: false` means today's digest
// already went out.
class CommunityDigestLog extends Model<CommunityDigestLogAttributes> implements CommunityDigestLogAttributes {
  declare id: string;
  declare member_id: string;
  declare digest_date: string;
  declare sent_at: Date | null;
  declare created_at: Date;
}

CommunityDigestLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    member_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'community_members', key: 'id' },
    },
    digest_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    sent_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'community_digest_logs',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [{ unique: true, fields: ['member_id', 'digest_date'], name: 'uq_community_digest_logs_member_date' }],
  }
);

export default CommunityDigestLog;
