import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface DocumentDeliveryLogAttributes {
  id?: string;
  visitor_id: string;
  lead_id?: number | null;
  document_type: string;
  delivery_method: string;
  recipient_email?: string | null;
  status?: string;
  created_at?: Date;
}

class DocumentDeliveryLog extends Model<DocumentDeliveryLogAttributes> implements DocumentDeliveryLogAttributes {
  declare id: string;
  declare visitor_id: string;
  declare lead_id: number | null;
  declare document_type: string;
  declare delivery_method: string;
  declare recipient_email: string | null;
  declare status: string;
  declare created_at: Date;
}

DocumentDeliveryLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    visitor_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    document_type: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    delivery_method: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    recipient_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'sent',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'document_delivery_logs',
    timestamps: false,
    indexes: [
      { fields: ['visitor_id', 'document_type'] },
      { fields: ['created_at'] },
    ],
  }
);

export default DocumentDeliveryLog;
