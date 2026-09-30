import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CaseStudyStoryline — the human's answer to "what is the story?".
 *
 * EDITORIAL DIRECTION, NEVER A FACT. It aims the draft generator and tells the
 * next reviewer what this record was for. It is a prompt, not a source.
 *
 * The table is separate from `case_studies` and separate from
 * `case_study_snapshots.content` on purpose — see the header of
 * `db/ensureCaseStudyStoryAssets.ts`. The public projection reads snapshot
 * content plus a typed allowlist and the publish gate's claim scan walks
 * snapshot content; a storyline is in neither, so no expression in either module
 * can reach this row.
 *
 * `case_study_id` is the PRIMARY KEY rather than a plain column: one storyline
 * per record, enforced by the database rather than by whoever writes next.
 */
export interface CaseStudyStorylineAttributes {
  case_study_id: string;
  storyline_text: string;
  authored_by: string;
  created_at?: Date;
  updated_at?: Date;
}

class CaseStudyStoryline
  extends Model<CaseStudyStorylineAttributes>
  implements CaseStudyStorylineAttributes
{
  declare case_study_id: string;
  declare storyline_text: string;
  declare authored_by: string;
  declare created_at: Date;
  declare updated_at: Date;
}

CaseStudyStoryline.init(
  {
    case_study_id: { type: DataTypes.UUID, primaryKey: true },
    storyline_text: { type: DataTypes.TEXT, allowNull: false },
    authored_by: { type: DataTypes.STRING(255), allowNull: false },
  },
  {
    sequelize,
    tableName: 'case_study_storylines',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default CaseStudyStoryline;
