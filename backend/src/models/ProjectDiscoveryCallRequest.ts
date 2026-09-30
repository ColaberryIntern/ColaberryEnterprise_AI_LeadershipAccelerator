import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * ProjectDiscoveryCallRequest - a student asked to be called about their
 * project. What they agreed to, the number they gave, what was decided, and
 * whether a call was actually placed.
 *
 * Storage only. The decision lives in `services/sbp/projectDiscoveryCall.ts`
 * (pure) and the orchestration in `projectDiscoveryCallRequest.ts` (I/O). This
 * file is the shape of the row and nothing else.
 *
 * Columns must match backend/src/db/ensureProjectDiscoveryCallSchema.ts EXACTLY.
 */

export interface ProjectDiscoveryCallRequestAttributes {
  id?: string;
  project_id: string;
  enrollment_id: string | null;
  /** Normalised E.164. Never logged. */
  phone_e164: string;
  consent_version: string;
  /** The exact wording the student agreed to, at the time they agreed to it. */
  consent_text: string;
  consented_at: Date;
  ip: string | null;
  user_agent: string | null;
  /** 'place', or the refusal reason, or 'dial_skipped:<why>' / 'dial_failed'. */
  decision: string;
  angles: string[];
  prompt_sha256: string | null;
  call_id: string | null;
  placed_at: Date | null;
  created_at?: Date;
}

class ProjectDiscoveryCallRequest
  extends Model<ProjectDiscoveryCallRequestAttributes>
  implements ProjectDiscoveryCallRequestAttributes {
  declare id: string;
  declare project_id: string;
  declare enrollment_id: string | null;
  declare phone_e164: string;
  declare consent_version: string;
  declare consent_text: string;
  declare consented_at: Date;
  declare ip: string | null;
  declare user_agent: string | null;
  declare decision: string;
  declare angles: string[];
  declare prompt_sha256: string | null;
  declare call_id: string | null;
  declare placed_at: Date | null;
  declare created_at: Date;
}

ProjectDiscoveryCallRequest.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    enrollment_id: { type: DataTypes.UUID, allowNull: true },
    phone_e164: { type: DataTypes.STRING(32), allowNull: false },
    consent_version: { type: DataTypes.STRING(20), allowNull: false },
    consent_text: { type: DataTypes.TEXT, allowNull: false },
    consented_at: { type: DataTypes.DATE, allowNull: false },
    ip: { type: DataTypes.STRING(64), allowNull: true },
    user_agent: { type: DataTypes.STRING(512), allowNull: true },
    decision: { type: DataTypes.STRING(40), allowNull: false },
    angles: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    prompt_sha256: { type: DataTypes.STRING(64), allowNull: true },
    call_id: { type: DataTypes.STRING(128), allowNull: true },
    placed_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'project_discovery_call_requests',
    timestamps: false,
  },
);

export default ProjectDiscoveryCallRequest;
