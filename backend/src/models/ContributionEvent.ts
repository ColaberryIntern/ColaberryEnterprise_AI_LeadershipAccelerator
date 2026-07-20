import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// Verifiable community contribution ledger (spec §8.7 recognition). One row per
// awarded contribution, keyed by an idempotency_key so an action is never
// double-counted. Points also flow to the existing CommunityMember.points /
// leaderboard via roomRecognitionService.
export type ContributionCategory =
  | 'community_host' | 'helpful_guide' | 'demo_leader' | 'connector'
  | 'reliable_study_partner' | 'thoughtful_reviewer' | 'cohort_encourager' | 'consistent_builder';

// Single source of truth for how each contribution reads to a human (badge label
// + emoji + one-line meaning). Used by the recognition read API and any surface
// that renders a badge, so the wording stays consistent everywhere.
export const CATEGORY_META: Record<ContributionCategory, { label: string; emoji: string; blurb: string }> = {
  community_host: { label: 'Community Host', emoji: '🏆', blurb: 'Hosted a live session start to finish' },
  helpful_guide: { label: 'Helpful Guide', emoji: '🧭', blurb: 'Answered a question that got verified' },
  demo_leader: { label: 'Demo Leader', emoji: '🎤', blurb: 'Led a demo or showcase' },
  connector: { label: 'Connector', emoji: '🔗', blurb: 'Brought people together' },
  reliable_study_partner: { label: 'Reliable Study Partner', emoji: '🤝', blurb: 'Showed up for a session they RSVP’d' },
  thoughtful_reviewer: { label: 'Thoughtful Reviewer', emoji: '🔍', blurb: 'Gave feedback on someone’s work' },
  cohort_encourager: { label: 'Cohort Encourager', emoji: '📣', blurb: 'Cheered a cohortmate on' },
  consistent_builder: { label: 'Consistent Builder', emoji: '🧱', blurb: 'Kept showing up and building' },
};

export interface ContributionEventAttributes {
  id?: string;
  enrollment_id: string;
  category: ContributionCategory;
  action: string;
  points?: number;
  room_id?: string | null;
  booking_id?: string | null;
  message_id?: string | null;
  idempotency_key: string;
  created_at?: Date;
}

class ContributionEvent extends Model<ContributionEventAttributes> implements ContributionEventAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare category: ContributionCategory;
  declare action: string;
  declare points: number;
  declare room_id: string | null;
  declare booking_id: string | null;
  declare message_id: string | null;
  declare idempotency_key: string;
  declare created_at: Date;
}

ContributionEvent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    category: { type: DataTypes.STRING(30), allowNull: false },
    action: { type: DataTypes.STRING(40), allowNull: false },
    points: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    room_id: { type: DataTypes.UUID, allowNull: true },
    booking_id: { type: DataTypes.UUID, allowNull: true },
    message_id: { type: DataTypes.UUID, allowNull: true },
    idempotency_key: { type: DataTypes.STRING(180), allowNull: false },
  },
  {
    sequelize,
    tableName: 'community_contributions',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['idempotency_key'], name: 'community_contributions_idem_unique' },
      { fields: ['enrollment_id', 'category'], name: 'idx_community_contributions_enrollment_cat' },
    ],
  }
);

export default ContributionEvent;
