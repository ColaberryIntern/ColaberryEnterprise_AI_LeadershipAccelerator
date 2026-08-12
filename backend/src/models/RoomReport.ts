import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// Moderation report targeting a room, message, member, or booking. The existing
// communityModerationService/CommunityPostReport is post-specific, so rooms get
// their own generic report record. idempotency_key (reporter+target) dedups
// repeat reports.
export type RoomReportTargetType = 'room' | 'message' | 'member' | 'booking';
export type RoomReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

export interface RoomReportAttributes {
  id?: string;
  reporter_enrollment_id: string;
  target_type: RoomReportTargetType;
  target_id: string;
  reason: string;
  detail?: string | null;
  status?: RoomReportStatus;
  resolution?: string | null;
  resolved_by?: string | null;
  resolved_at?: Date | null;
  idempotency_key?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class RoomReport extends Model<RoomReportAttributes> implements RoomReportAttributes {
  declare id: string;
  declare reporter_enrollment_id: string;
  declare target_type: RoomReportTargetType;
  declare target_id: string;
  declare reason: string;
  declare detail: string | null;
  declare status: RoomReportStatus;
  declare resolution: string | null;
  declare resolved_by: string | null;
  declare resolved_at: Date | null;
  declare idempotency_key: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

RoomReport.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    reporter_enrollment_id: { type: DataTypes.UUID, allowNull: false },
    target_type: { type: DataTypes.STRING(20), allowNull: false },
    target_id: { type: DataTypes.UUID, allowNull: false },
    reason: { type: DataTypes.STRING(60), allowNull: false },
    detail: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'open' },
    resolution: { type: DataTypes.TEXT, allowNull: true },
    resolved_by: { type: DataTypes.STRING(60), allowNull: true },
    resolved_at: { type: DataTypes.DATE, allowNull: true },
    idempotency_key: { type: DataTypes.STRING(180), allowNull: true },
  },
  {
    sequelize,
    tableName: 'room_reports',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['status'], name: 'idx_room_reports_status' },
    ],
  }
);

export default RoomReport;
