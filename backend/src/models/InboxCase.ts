import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { CASE_STATES, CaseMode, CaseState, CaseAssessment, TeachMeBrief } from '../types/inboxCase';

// A business case: the unit of resolution for the Inbox Intel — Case
// Resolution Engine. Groups InboxCaseItem evidence rows (emails, Basecamp
// records) behind one objective so Ali resolves the business problem, not
// each email individually. See docs/inbox-resolution/ARCHITECTURE.md.

interface InboxCaseAttributes {
  id?: string;
  title: string;
  mode: CaseMode;
  normalized_query: string;
  state: CaseState;
  objective: string | null;
  summary: string | null;
  teaching_brief: TeachMeBrief | null;
  assessment: CaseAssessment | null;
  recommendation: string | null;
  confidence: number | null;
  opened_by: string;
  opened_at: Date;
  closed_at: Date | null;
  last_verified_at: Date | null;
  reopen_count: number;
  source_query: Record<string, unknown>;
  correlation_id: string;
  created_at?: Date;
  updated_at?: Date;
}

class InboxCase extends Model<InboxCaseAttributes> implements InboxCaseAttributes {
  declare id: string;
  declare title: string;
  declare mode: CaseMode;
  declare normalized_query: string;
  declare state: CaseState;
  declare objective: string | null;
  declare summary: string | null;
  declare teaching_brief: TeachMeBrief | null;
  declare assessment: CaseAssessment | null;
  declare recommendation: string | null;
  declare confidence: number | null;
  declare opened_by: string;
  declare opened_at: Date;
  declare closed_at: Date | null;
  declare last_verified_at: Date | null;
  declare reopen_count: number;
  declare source_query: Record<string, unknown>;
  declare correlation_id: string;
  declare created_at: Date;
  declare updated_at: Date;
}

InboxCase.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    mode: { type: DataTypes.ENUM('PERSON', 'TOPIC'), allowNull: false },
    normalized_query: { type: DataTypes.STRING(500), allowNull: false },
    state: { type: DataTypes.ENUM(...CASE_STATES), allowNull: false, defaultValue: 'DISCOVERING' },
    objective: { type: DataTypes.TEXT, allowNull: true },
    summary: { type: DataTypes.TEXT, allowNull: true },
    teaching_brief: { type: DataTypes.JSONB, allowNull: true },
    assessment: { type: DataTypes.JSONB, allowNull: true },
    recommendation: { type: DataTypes.TEXT, allowNull: true },
    confidence: { type: DataTypes.INTEGER, allowNull: true },
    opened_by: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'admin' },
    opened_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    closed_at: { type: DataTypes.DATE, allowNull: true },
    last_verified_at: { type: DataTypes.DATE, allowNull: true },
    reopen_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    source_query: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    correlation_id: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'inbox_cases',
    timestamps: false,
    indexes: [
      { fields: ['state'], name: 'idx_inbox_cases_state' },
      { fields: ['mode'], name: 'idx_inbox_cases_mode' },
      { fields: ['normalized_query'], name: 'idx_inbox_cases_normalized_query' },
      { fields: ['correlation_id'], name: 'idx_inbox_cases_correlation_id' },
    ],
  }
);

export default InboxCase;
