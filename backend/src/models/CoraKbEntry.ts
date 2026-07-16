import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type KbPriority = 'High' | 'Medium' | 'Low';
export type KbAutomation = 'High' | 'Medium' | 'Low';

export interface CoraKbEntryAttributes {
  id?: string;
  course_id?: string | null;
  main_category: string;
  sub_category?: string | null;
  question_pattern: string;
  answer_template: string;
  primary_person_id?: string | null;
  team_person_ids?: string[];
  escalation_logic?: string | null;
  priority?: KbPriority;
  response_time?: string | null;
  automation_potential?: KbAutomation;
  emotional_tone?: string | null;
  calendar_link?: string | null;
  email_examples?: string | null;
  keywords?: string | null;
  notes?: string | null;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class CoraKbEntry extends Model<CoraKbEntryAttributes> implements CoraKbEntryAttributes {
  declare id: string;
  declare course_id: string | null;
  declare main_category: string;
  declare sub_category: string | null;
  declare question_pattern: string;
  declare answer_template: string;
  declare primary_person_id: string | null;
  declare team_person_ids: string[];
  declare escalation_logic: string | null;
  declare priority: KbPriority;
  declare response_time: string | null;
  declare automation_potential: KbAutomation;
  declare emotional_tone: string | null;
  declare calendar_link: string | null;
  declare email_examples: string | null;
  declare keywords: string | null;
  declare notes: string | null;
  declare is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

CoraKbEntry.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    course_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'cora_courses', key: 'id' },
    },
    main_category: { type: DataTypes.STRING(100), allowNull: false },
    sub_category: { type: DataTypes.STRING(100), allowNull: true },
    question_pattern: { type: DataTypes.TEXT, allowNull: false },
    answer_template: { type: DataTypes.TEXT, allowNull: false },
    primary_person_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'responsible_persons', key: 'id' },
    },
    team_person_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    escalation_logic: { type: DataTypes.TEXT, allowNull: true },
    priority: {
      type: DataTypes.ENUM('High', 'Medium', 'Low'),
      allowNull: false,
      defaultValue: 'Medium',
    },
    response_time: { type: DataTypes.STRING(50), allowNull: true },
    automation_potential: {
      type: DataTypes.ENUM('High', 'Medium', 'Low'),
      allowNull: false,
      defaultValue: 'Medium',
    },
    emotional_tone: { type: DataTypes.STRING(100), allowNull: true },
    calendar_link: { type: DataTypes.STRING(500), allowNull: true },
    email_examples: { type: DataTypes.TEXT, allowNull: true },
    keywords: { type: DataTypes.TEXT, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'cora_kb_entries',
    timestamps: false,
    indexes: [
      { fields: ['course_id'], name: 'idx_cora_kb_entries_course_id' },
      { fields: ['main_category'], name: 'idx_cora_kb_entries_main_category' },
      { fields: ['is_active'], name: 'idx_cora_kb_entries_is_active' },
      { fields: ['primary_person_id'], name: 'idx_cora_kb_entries_primary_person' },
    ],
  }
);

export default CoraKbEntry;
