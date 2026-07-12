/** PortfolioArtifact — an employable artifact auto-generated when a student
 *  completes an evidence activity (architecture doc, prompt library, case study,
 *  reflection, implementation notes). Builds the portfolio with no manual work. */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class PortfolioArtifact extends Model {
  declare id: string;
  declare enrollment_id: string;
  declare card_id: string | null;
  declare kind: string;         // architecture_doc | prompt_library | case_study | reflection | implementation_notes | presentation
  declare title: string;
  declare summary: string | null;
  declare content: any;         // JSONB — structured artifact body
  declare competencies: any;    // string[]
  declare created_at: Date;
}

PortfolioArtifact.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  enrollment_id: { type: DataTypes.UUID, allowNull: false },
  card_id: { type: DataTypes.UUID, allowNull: true },
  kind: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'case_study' },
  title: { type: DataTypes.STRING(400), allowNull: false },
  summary: { type: DataTypes.TEXT, allowNull: true },
  content: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  competencies: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
}, { sequelize, modelName: 'PortfolioArtifact', tableName: 'runtime_portfolio_artifacts', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false });

export default PortfolioArtifact;
