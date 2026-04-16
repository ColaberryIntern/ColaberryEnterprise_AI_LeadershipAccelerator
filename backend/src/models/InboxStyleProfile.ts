import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface InboxStyleProfileAttributes {
  id?: string;
  category: string;
  formality_level?: number;
  greeting_patterns?: any;
  signoff_patterns?: any;
  avg_sentence_length?: number;
  vocabulary_preferences?: any;
  tone_descriptors?: any;
  sample_count?: number;
  last_updated?: Date;
}

class InboxStyleProfile extends Model<InboxStyleProfileAttributes> implements InboxStyleProfileAttributes {
  declare id: string;
  declare category: string;
  declare formality_level: number;
  declare greeting_patterns: any;
  declare signoff_patterns: any;
  declare avg_sentence_length: number;
  declare vocabulary_preferences: any;
  declare tone_descriptors: any;
  declare sample_count: number;
  declare last_updated: Date;
}

InboxStyleProfile.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    formality_level: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 5.0,
    },
    greeting_patterns: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    signoff_patterns: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    avg_sentence_length: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 15.0,
    },
    vocabulary_preferences: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    tone_descriptors: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    sample_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    last_updated: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'inbox_style_profiles',
    timestamps: false,
  }
);

export default InboxStyleProfile;
