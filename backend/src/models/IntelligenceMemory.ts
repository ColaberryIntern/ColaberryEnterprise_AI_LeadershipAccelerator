import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type MemoryCategory =
  | 'conversation'
  | 'investigation'
  | 'decision'
  | 'experiment'
  | 'insight';

interface IntelligenceMemoryAttributes {
  id?: string;
  category: MemoryCategory;
  content: string;
  embedding?: number[];
  metadata?: Record<string, any>;
  created_at?: Date;
}

class IntelligenceMemory extends Model<IntelligenceMemoryAttributes> implements IntelligenceMemoryAttributes {
  declare id: string;
  declare category: MemoryCategory;
  declare content: string;
  declare embedding: number[];
  declare metadata: Record<string, any>;
  declare created_at: Date;
}

IntelligenceMemory.init(
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
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    embedding: {
      // pgvector column — nullable when Python embedding service unavailable
      type: 'vector(1536)' as any,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'intelligence_memory',
    timestamps: false,
    indexes: [
      { fields: ['category'] },
      { fields: ['created_at'] },
    ],
  }
);

export default IntelligenceMemory;
