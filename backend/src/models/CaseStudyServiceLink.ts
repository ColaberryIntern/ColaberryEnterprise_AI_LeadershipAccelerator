/**
 * CaseStudyServiceLink — which case study evidences which service offering.
 *
 * A bid asks a service "what proves this", and a case study is the answer. The link is many-to-many because both
 * directions get asked, and it carries a STATE because a proposal is not a claim: a link begins `suggested`, with
 * the overlap that produced it recorded in `rationale`, and only a person moves it to `confirmed`. These feed
 * past-performance claims in government proposals, so the difference between "a keyword matched" and "a human
 * agreed" is the whole value of the row.
 *
 * `rejected` is kept rather than deleted, so a weak match that has already been judged is not proposed again.
 *
 * Schema: db/ensureCaseStudyServiceLinkSchema.ts.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/** A proposal, a human decision, or a human refusal. Nothing else is a valid state. */
export const CASE_STUDY_SERVICE_LINK_STATES = ['suggested', 'confirmed', 'rejected'] as const;
export type CaseStudyServiceLinkState = typeof CASE_STUDY_SERVICE_LINK_STATES[number];

export interface CaseStudyServiceLinkAttributes {
  id: string;
  case_study_id: string;
  service_offering_id: string;
  state: CaseStudyServiceLinkState;
  rationale: string | null;
  match_score: number | null;
  suggested_by: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class CaseStudyServiceLink extends Model<CaseStudyServiceLinkAttributes> {
  declare id: string;
  declare case_study_id: string;
  declare service_offering_id: string;
  declare state: CaseStudyServiceLinkState;
  declare rationale: string | null;
  declare match_score: number | null;
  declare suggested_by: string | null;
  declare decided_by: string | null;
  declare decided_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CaseStudyServiceLink.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    case_study_id: { type: DataTypes.UUID, allowNull: false },
    service_offering_id: { type: DataTypes.UUID, allowNull: false },
    state: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'suggested' },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    match_score: { type: DataTypes.INTEGER, allowNull: true },
    suggested_by: { type: DataTypes.TEXT, allowNull: true },
    decided_by: { type: DataTypes.TEXT, allowNull: true },
    decided_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'CaseStudyServiceLink',
    tableName: 'case_study_service_links',
    timestamps: false,
  },
);

export default CaseStudyServiceLink;
