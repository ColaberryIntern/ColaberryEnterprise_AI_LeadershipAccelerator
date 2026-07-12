import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// "Restore Preference" / "Always show emails like this." When Ali clicks it
// on a missed email, we persist a durable rule keyed on sender, domain, or
// topic. The scoring engine applies a large positive boost to future emails
// matching an active preference so they are far more likely to be surfaced.

export type SurfacePatternType = 'sender' | 'domain' | 'topic';

interface InboxSurfacePreferenceAttributes {
  id?: string;
  pattern_type: SurfacePatternType;
  pattern_value: string;          // lowercase: email, domain, or topic token
  source_email_id?: string | null; // the email that triggered this preference
  enabled?: boolean;
  created_by?: string | null;
  created_at: Date;
}

class InboxSurfacePreference
  extends Model<InboxSurfacePreferenceAttributes>
  implements InboxSurfacePreferenceAttributes
{
  declare id: string;
  declare pattern_type: SurfacePatternType;
  declare pattern_value: string;
  declare source_email_id: string | null;
  declare enabled: boolean;
  declare created_by: string | null;
  declare created_at: Date;
}

InboxSurfacePreference.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    pattern_type: {
      type: DataTypes.ENUM('sender', 'domain', 'topic'),
      allowNull: false,
    },
    pattern_value: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    source_email_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_by: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'inbox_surface_preferences',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['pattern_type', 'pattern_value'],
        name: 'idx_inbox_surface_pref_pattern',
      },
      {
        fields: ['enabled'],
        name: 'idx_inbox_surface_pref_enabled',
      },
    ],
  }
);

export default InboxSurfacePreference;
