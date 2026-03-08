import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface LiveSessionAttributes {
  id?: string;
  cohort_id: string;
  session_number: number;
  title: string;
  description?: string;
  session_date: string;
  start_time: string;
  end_time: string;
  session_type: 'core' | 'lab';
  meeting_link?: string;
  meeting_provider?: string;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  recording_url?: string;
  materials_json?: any;
  curriculum_json?: any;
  build_phase_unlock?: boolean;
  required_prior_sessions?: any;
  presentation_phase_flag?: boolean;
  module_id?: string;
  skill_area?: string;
  minimum_section_completion_pct?: number;
  required_variable_keys?: string[];
  email_trigger_config?: any;
  reminder_trigger_config?: any;
  created_at?: Date;
}

class LiveSession extends Model<LiveSessionAttributes> implements LiveSessionAttributes {
  declare id: string;
  declare cohort_id: string;
  declare session_number: number;
  declare title: string;
  declare description: string;
  declare session_date: string;
  declare start_time: string;
  declare end_time: string;
  declare session_type: 'core' | 'lab';
  declare meeting_link: string;
  declare meeting_provider: string;
  declare status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  declare recording_url: string;
  declare materials_json: any;
  declare curriculum_json: any;
  declare build_phase_unlock: boolean;
  declare required_prior_sessions: any;
  declare presentation_phase_flag: boolean;
  declare module_id: string;
  declare skill_area: string;
  declare minimum_section_completion_pct: number;
  declare required_variable_keys: string[];
  declare email_trigger_config: any;
  declare reminder_trigger_config: any;
  declare created_at: Date;
}

LiveSession.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    cohort_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'cohorts', key: 'id' },
    },
    session_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    session_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    start_time: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    end_time: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    session_type: {
      type: DataTypes.ENUM('core', 'lab'),
      allowNull: false,
      defaultValue: 'core',
    },
    meeting_link: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    meeting_provider: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'google_meet',
    },
    status: {
      type: DataTypes.ENUM('scheduled', 'live', 'completed', 'cancelled'),
      allowNull: false,
      defaultValue: 'scheduled',
    },
    recording_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    materials_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    curriculum_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    build_phase_unlock: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    required_prior_sessions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    presentation_phase_flag: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    module_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'curriculum_modules', key: 'id' },
    },
    skill_area: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    minimum_section_completion_pct: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    required_variable_keys: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    email_trigger_config: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    reminder_trigger_config: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'live_sessions',
    timestamps: false,
  }
);

export default LiveSession;
