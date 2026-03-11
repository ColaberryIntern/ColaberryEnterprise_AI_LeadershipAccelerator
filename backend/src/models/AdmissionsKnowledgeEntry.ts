import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type AdmissionsKnowledgeCategory =
  | 'program'
  | 'curriculum'
  | 'pricing'
  | 'faq'
  | 'enterprise'
  | 'sponsorship'
  | 'outcomes'
  | 'logistics';

interface AdmissionsKnowledgeEntryAttributes {
  id?: string;
  category: AdmissionsKnowledgeCategory;
  title: string;
  content: string;
  keywords?: string[];
  priority?: number;
  active?: boolean;
  metadata?: Record<string, any> | null;
  created_at?: Date;
  updated_at?: Date;
}

class AdmissionsKnowledgeEntry extends Model<AdmissionsKnowledgeEntryAttributes> implements AdmissionsKnowledgeEntryAttributes {
  declare id: string;
  declare category: AdmissionsKnowledgeCategory;
  declare title: string;
  declare content: string;
  declare keywords: string[];
  declare priority: number;
  declare active: boolean;
  declare metadata: Record<string, any> | null;
  declare created_at: Date;
  declare updated_at: Date;
}

AdmissionsKnowledgeEntry.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    keywords: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'admissions_knowledge_entries',
    timestamps: false,
    indexes: [
      { fields: ['category'] },
      { fields: ['active'] },
    ],
  }
);

export default AdmissionsKnowledgeEntry;
