import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * One PERSON who watched one recording. Never one play.
 *
 * A video player issues many requests for a single viewing — a probe, a tail read
 * for the MP4 moov atom, then one per seek — so a counter incremented per request
 * would report hundreds of views for one watch and a student would believe it. The
 * count is therefore the ROW COUNT of this table, and the unique index on
 * `(recording_id, viewer_enrollment_id)` is what makes that arithmetic true.
 *
 * `first_viewed_at` is set once and never moves; `last_viewed_at` moves on every
 * rewatch, so "watched in September" and "watched again today" stay distinguishable
 * without a second row.
 *
 * THE OWNER IS NEVER IN HERE. Watching yourself back is the point of the Practice
 * stage, and a learner rehearsing six times must not read that as an audience. The
 * exclusion happens at the call site, which is the only place that knows who owns
 * the recording.
 *
 * WHY A MODEL FOR A TABLE WRITTEN BY RAW SQL. `ensurePresentationStudioSchema`'s
 * parity suite requires every table it creates to have a Sequelize model agreeing
 * with it, because a DDL column with no model attribute is invisible to Sequelize
 * and writes to it are dropped with no error. The rule holds with no exceptions, so
 * this table gets a model like every other. The upsert in `recordingViews.ts` stays
 * raw because it needs `RETURNING (xmax = 0)` to tell an INSERT from an ON CONFLICT
 * update in one round trip, which Sequelize's `upsert` cannot express.
 */

export interface PresentationRecordingViewAttributes {
  id?: string;
  recording_id: string;
  viewer_enrollment_id: string;
  first_viewed_at?: Date;
  last_viewed_at?: Date;
}

class PresentationRecordingView
  extends Model<PresentationRecordingViewAttributes>
  implements PresentationRecordingViewAttributes {
  declare id: string;
  declare recording_id: string;
  declare viewer_enrollment_id: string;
  declare first_viewed_at: Date;
  declare last_viewed_at: Date;
}

PresentationRecordingView.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    recording_id: { type: DataTypes.UUID, allowNull: false },
    viewer_enrollment_id: { type: DataTypes.UUID, allowNull: false },
    first_viewed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    last_viewed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'presentation_recording_views',
    // No created_at/updated_at: `first_viewed_at` and `last_viewed_at` already say
    // what those columns would, in the domain's own words.
    timestamps: false,
    underscored: true,
    indexes: [
      { fields: ['recording_id'], name: 'presentation_recording_views_recording' },
    ],
  },
);

export default PresentationRecordingView;
