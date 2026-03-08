import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface TestSimulationResultAttributes {
  id: string;
  lesson_id: string;
  admin_user_id: string | null;
  test_profile_json: Record<string, any>;
  test_variables_json: Record<string, string>;
  generated_content_json: Record<string, any> | null;
  composite_prompt_text: string | null;
  model_used: string | null;
  token_count: number | null;
  duration_ms: number | null;
  status: 'pending' | 'completed' | 'failed';
  error_message: string | null;
  created_at?: Date;
}

export class TestSimulationResult extends Model<TestSimulationResultAttributes> implements TestSimulationResultAttributes {
  declare id: string;
  declare lesson_id: string;
  declare admin_user_id: string | null;
  declare test_profile_json: Record<string, any>;
  declare test_variables_json: Record<string, string>;
  declare generated_content_json: Record<string, any> | null;
  declare composite_prompt_text: string | null;
  declare model_used: string | null;
  declare token_count: number | null;
  declare duration_ms: number | null;
  declare status: 'pending' | 'completed' | 'failed';
  declare error_message: string | null;
  declare created_at: Date;
}

TestSimulationResult.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    lesson_id: { type: DataTypes.UUID, allowNull: false },
    admin_user_id: { type: DataTypes.UUID, allowNull: true },
    test_profile_json: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    test_variables_json: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    generated_content_json: { type: DataTypes.JSONB, allowNull: true },
    composite_prompt_text: { type: DataTypes.TEXT, allowNull: true },
    model_used: { type: DataTypes.STRING(100), allowNull: true },
    token_count: { type: DataTypes.INTEGER, allowNull: true },
    duration_ms: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.ENUM('pending', 'completed', 'failed'), defaultValue: 'pending' },
    error_message: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'test_simulation_results',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default TestSimulationResult;
