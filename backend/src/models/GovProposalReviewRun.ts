import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * A single review-cycle run on a proposal document (Proposal Studio B.5). `runReviewCycle` creates one row at the
 * start (status `running`), bumps `iterations` + `last_message` each pass, and finishes `passed | blocked | failed |
 * done`. The UI starts a run (POST), gets the `runId`, and polls GET every 2s to show progress in the agent panel.
 * Only ONE active (`running`) run is allowed per document — the store checks before starting another. Schema:
 * db/ensureGovProposalReviewRunsSchema.ts.
 */
export type GovProposalReviewRunStatus = 'running' | 'passed' | 'blocked' | 'failed' | 'done';

export interface GovProposalReviewRunAttributes {
  id?: string;
  document_id: string;
  status: GovProposalReviewRunStatus;
  iterations: number;
  last_message: string | null;
  result_json: unknown | null;
  started_at?: Date;
  finished_at?: Date | null;
}

class GovProposalReviewRun extends Model<GovProposalReviewRunAttributes> implements GovProposalReviewRunAttributes {
  declare id: string;
  declare document_id: string;
  declare status: GovProposalReviewRunStatus;
  declare iterations: number;
  declare last_message: string | null;
  declare result_json: unknown | null;
  declare started_at: Date;
  declare finished_at: Date | null;
}

GovProposalReviewRun.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    document_id: { type: DataTypes.UUID, allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'running' },
    iterations: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    last_message: { type: DataTypes.TEXT, allowNull: true },
    result_json: { type: DataTypes.JSONB, allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    finished_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'GovProposalReviewRun',
    tableName: 'gov_proposal_review_runs',
    timestamps: false,
    indexes: [{ fields: ['document_id', 'status'] }],
  },
);

export default GovProposalReviewRun;
