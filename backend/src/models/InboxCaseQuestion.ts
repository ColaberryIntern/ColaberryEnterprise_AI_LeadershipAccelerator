import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { QUESTION_STATUSES, QuestionStatus, QuestionChoice } from '../types/inboxCase';

// A single consolidated, case-level blocking question (never one question per
// email — see root directive section 6 "Ask"). `blocks_action_ids` is a
// denormalized JSONB list of InboxCaseAction ids so the closure guard can
// check "every blocking question answered" without a join table; actions are
// re-derived at plan time, so this list is authoritative only after a plan
// has been generated.

interface InboxCaseQuestionAttributes {
  id?: string;
  case_id: string;
  question: string;
  why_required: string;
  choices: QuestionChoice[];
  recommended_answer: string | null;
  blocks_action_ids: string[];
  status: QuestionStatus;
  answer: string | null;
  answered_by: string | null;
  answered_at: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class InboxCaseQuestion extends Model<InboxCaseQuestionAttributes> implements InboxCaseQuestionAttributes {
  declare id: string;
  declare case_id: string;
  declare question: string;
  declare why_required: string;
  declare choices: QuestionChoice[];
  declare recommended_answer: string | null;
  declare blocks_action_ids: string[];
  declare status: QuestionStatus;
  declare answer: string | null;
  declare answered_by: string | null;
  declare answered_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

InboxCaseQuestion.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    case_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'inbox_cases', key: 'id' } },
    question: { type: DataTypes.TEXT, allowNull: false },
    why_required: { type: DataTypes.TEXT, allowNull: false },
    choices: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    recommended_answer: { type: DataTypes.TEXT, allowNull: true },
    blocks_action_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    status: { type: DataTypes.ENUM(...QUESTION_STATUSES), allowNull: false, defaultValue: 'OPEN' },
    answer: { type: DataTypes.TEXT, allowNull: true },
    answered_by: { type: DataTypes.STRING(100), allowNull: true },
    answered_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'inbox_case_questions',
    timestamps: false,
    indexes: [
      { fields: ['case_id'], name: 'idx_inbox_case_questions_case_id' },
      { fields: ['status'], name: 'idx_inbox_case_questions_status' },
    ],
  }
);

export default InboxCaseQuestion;
