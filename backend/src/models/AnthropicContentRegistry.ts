import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type AnthropicContentType = 'course' | 'document' | 'news' | 'partner-portal';

export interface ChangeSummary {
  detected_at: string;
  detection_method: 'last_modified_header' | 'etag' | 'content_hash';
  previous_value: string | null;
  current_value: string;
}

export interface AnthropicContentRegistryAttributes {
  id?: string;
  content_type: AnthropicContentType;
  title: string;
  url: string;
  outline?: string | null;
  last_checked?: Date | null;
  last_modified?: Date | null;
  change_detected?: boolean;
  change_summary?: ChangeSummary | null;
  etag?: string | null;
  content_hash?: string | null;
  created_at?: Date;
}

class AnthropicContentRegistry
  extends Model<AnthropicContentRegistryAttributes>
  implements AnthropicContentRegistryAttributes {
  declare id: string;
  declare content_type: AnthropicContentType;
  declare title: string;
  declare url: string;
  declare outline: string | null;
  declare last_checked: Date | null;
  declare last_modified: Date | null;
  declare change_detected: boolean;
  declare change_summary: ChangeSummary | null;
  declare etag: string | null;
  declare content_hash: string | null;
  declare created_at: Date;
}

AnthropicContentRegistry.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    content_type: {
      type: DataTypes.ENUM('course', 'document', 'news', 'partner-portal'),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING(1000),
      allowNull: false,
      unique: true,
    },
    outline: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    last_checked: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    last_modified: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    change_detected: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    change_summary: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
    // Stored ETag for header-based change detection
    etag: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    // SHA-256 of response body; fallback when Last-Modified + ETag are unreliable (CDN-served pages)
    content_hash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'anthropic_content_registry',
    timestamps: false,
  },
);

export default AnthropicContentRegistry;
