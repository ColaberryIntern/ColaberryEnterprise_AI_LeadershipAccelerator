/** CardSurveyResponse — a student's captured answers to a weekly feedback Survey
 *  card. One row per (card, enrollment); re-submitting UPDATES in place (upsert),
 *  so the table is idempotent. program_id + week are denormalized for later
 *  cohort/week analytics without a join. `answers` holds the full Q&A snapshot:
 *  { items: [{ question, rating, comment }], open }. */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface SurveyAnswerItem {
  question: string;
  rating: number | null;   // 1..5 Likert (null = skipped)
  comment: string | null;  // optional per-question note
}
export interface SurveyAnswers {
  items: SurveyAnswerItem[];
  open: string | null;     // the open-ended catch-all response
}

class CardSurveyResponse extends Model {
  declare id: string;
  declare card_id: string;
  declare enrollment_id: string;
  declare program_id: string | null;
  declare week: number | null;
  declare answers: SurveyAnswers;
  declare created_at: Date;
  declare updated_at: Date;
}

CardSurveyResponse.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  card_id: { type: DataTypes.UUID, allowNull: false },
  enrollment_id: { type: DataTypes.UUID, allowNull: false },
  program_id: { type: DataTypes.UUID, allowNull: true },
  week: { type: DataTypes.INTEGER, allowNull: true },
  answers: { type: DataTypes.JSONB, allowNull: false, defaultValue: { items: [], open: null } },
}, { sequelize, modelName: 'CardSurveyResponse', tableName: 'timeline_survey_responses', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

export default CardSurveyResponse;
