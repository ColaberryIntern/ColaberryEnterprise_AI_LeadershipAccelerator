import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// Join row: one Enrollment participating in one Challenge. tier captures the
// participant's bracket/segment within the challenge (e.g. for grouping a
// company leaderboard or seeding). The (challenge_id, enrollment_id) pair is
// unique so an enrollment cannot join the same challenge twice.
export interface ChallengeParticipantAttributes {
  id?: string;
  challenge_id: string;
  enrollment_id: string;
  joined_at?: Date;
  tier?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class ChallengeParticipant
  extends Model<ChallengeParticipantAttributes>
  implements ChallengeParticipantAttributes
{
  declare id: string;
  declare challenge_id: string;
  declare enrollment_id: string;
  declare joined_at: Date;
  declare tier: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

ChallengeParticipant.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    challenge_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'challenges', key: 'id' },
    },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'enrollments', key: 'id' },
    },
    joined_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    tier: {
      type: DataTypes.STRING(50),
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
    tableName: 'challenge_participants',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['challenge_id', 'enrollment_id'],
        name: 'challenge_participants_challenge_enrollment_unique',
      },
      { fields: ['challenge_id'], name: 'idx_challenge_participants_challenge_id' },
      { fields: ['enrollment_id'], name: 'idx_challenge_participants_enrollment_id' },
    ],
  }
);

export default ChallengeParticipant;
