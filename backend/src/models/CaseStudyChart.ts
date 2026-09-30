import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CaseStudyChart — a chart that references numbers and never carries them.
 *
 * THERE IS NO `values` ATTRIBUTE AND THERE IS NO `values` COLUMN. That absence
 * is the entire asset, not an omission.
 *
 * `metric_keys` holds `case_study_metrics.metric_key` values in render order.
 * The projection resolves each through `projectMetric`, which already returns
 * null for anything not `publishable` and verified. A chart therefore cannot
 * display a number the measurement section would refuse to display, because it
 * is literally the same number resolved by the same function.
 *
 * WHY THE GUARANTEE LIVES IN THE COLUMN LIST AND NOT ONLY IN A TYPE.
 * `verifiedFigures()` is the only thing standing between a number on a page and
 * a number nobody checked, and it draws exclusively from metrics. A chart
 * holding its own values would sit entirely outside it — nothing would compare
 * it to anything. A TypeScript interface and a JSONB blob both accept whatever
 * a runtime hands them; a column that does not exist throws. So the invariant
 * is enforced at four layers that fail independently: this model, the DDL, the
 * `.strict()` Zod schema, and `caseStudyChartContract.test.ts`.
 *
 * `approved` defaults FALSE, matching every other publishable asset here.
 */
export interface CaseStudyChartAttributes {
  id?: string;
  case_study_id: string;
  /** bar | ranking. Constrained by CHECK in the DDL, not only here. */
  chart_type: string;
  title: string;
  caption?: string | null;
  /** metric_key values, in render order. The ONLY route to a number. */
  metric_keys?: string[];
  approved?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class CaseStudyChart
  extends Model<CaseStudyChartAttributes>
  implements CaseStudyChartAttributes
{
  declare id: string;
  declare case_study_id: string;
  declare chart_type: string;
  declare title: string;
  declare caption: string | null;
  declare metric_keys: string[];
  declare approved: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

CaseStudyChart.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    case_study_id: { type: DataTypes.UUID, allowNull: false },
    chart_type: { type: DataTypes.STRING(20), allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    caption: { type: DataTypes.TEXT, allowNull: true },
    metric_keys: {
      type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [],
    },
    approved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    tableName: 'case_study_charts',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [{ fields: ['case_study_id', 'approved'], name: 'cs_charts_by_case_study' }],
  }
);

export default CaseStudyChart;
