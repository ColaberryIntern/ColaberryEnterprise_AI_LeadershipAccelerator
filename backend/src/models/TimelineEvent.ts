import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * TimelineEvent — a scheduler that DELIVERS cards onto the timeline.
 *
 * Events deliver curriculum; they do not award it (see ARCHITECTURE.md §5).
 * Table name `timeline_events` (not the generic `events`) to avoid collision
 * in the 200+ model graph. A recurring live event (Demo Tuesday, Kes
 * Wednesday, Marketing Friday, Architecture Day) emits a set of card
 * templates for a given week; the cards carry the XP, the event carries none.
 */

export interface TimelineEventAttributes {
  id?: string;
  cohort_id?: string | null;
  slug: string;
  title: string;
  description?: string | null;
  week?: number | null;
  event_date?: Date | null;
  session_id?: string | null;
  card_template_ids?: string[];
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

class TimelineEvent extends Model<TimelineEventAttributes> implements TimelineEventAttributes {
  declare id: string;
  declare cohort_id: string | null;
  declare slug: string;
  declare title: string;
  declare description: string | null;
  declare week: number | null;
  declare event_date: Date | null;
  declare session_id: string | null;
  declare card_template_ids: string[];
  declare metadata: any;
  declare created_at: Date;
  declare updated_at: Date;
}

TimelineEvent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    cohort_id: { type: DataTypes.UUID, allowNull: true },
    slug: { type: DataTypes.STRING(100), allowNull: false },
    title: { type: DataTypes.STRING(500), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    week: { type: DataTypes.INTEGER, allowNull: true },
    event_date: { type: DataTypes.DATEONLY, allowNull: true },
    session_id: { type: DataTypes.UUID, allowNull: true },
    card_template_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'timeline_events',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['cohort_id', 'week'] },
      { fields: ['slug'] },
    ],
  }
);

export default TimelineEvent;
