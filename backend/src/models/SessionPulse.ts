import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// SessionPulse — one row per (enrollment, session): a student's current live
// status during class (here / building / stuck / finished). Upserted on the
// (enrollment_id, session_id) unique index so rapid taps just update the row.
// The instructor's Class Kit deck reads aggregate counts to drive the pulse rail.
export type PulseState = 'here' | 'building' | 'stuck' | 'finished';

interface SessionPulseAttributes {
  id?: string;
  session_id: string;
  enrollment_id: string;
  state: PulseState;
  updated_at?: Date;
}

class SessionPulse extends Model<SessionPulseAttributes> implements SessionPulseAttributes {
  declare id: string;
  declare session_id: string;
  declare enrollment_id: string;
  declare state: PulseState;
  declare updated_at: Date;
}

SessionPulse.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'live_sessions', key: 'id' },
    },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'enrollments', key: 'id' },
    },
    state: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'here',
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'session_pulse',
    timestamps: false,
    indexes: [{ unique: true, fields: ['enrollment_id', 'session_id'] }],
  }
);

export default SessionPulse;
