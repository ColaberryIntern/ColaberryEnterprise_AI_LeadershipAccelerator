import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface MentorConversationAttributes {
  id?: string;
  enrollment_id: string;
  lesson_id?: string;
  messages_json?: any;
  created_at?: Date;
  updated_at?: Date;
}

class MentorConversation extends Model<MentorConversationAttributes> implements MentorConversationAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare lesson_id: string;
  declare messages_json: any;
  declare created_at: Date;
  declare updated_at: Date;
}

MentorConversation.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'enrollments', key: 'id' },
    },
    lesson_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'curriculum_lessons', key: 'id' },
    },
    messages_json: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'mentor_conversations',
    timestamps: false,
  }
);

export default MentorConversation;
