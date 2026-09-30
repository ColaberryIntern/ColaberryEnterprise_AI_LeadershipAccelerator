import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * ConnectorCredential — one sealed secret for one channel account.
 *
 * Columns must match backend/src/db/ensureChannelAccountSchema.ts EXACTLY; the parity test
 * enforces it.
 *
 * EVERY ROW HERE IS SEALED. `ciphertext`, `iv`, `auth_tag` and `wrapped_data_key` are the
 * output of `credentialVault.seal()` and are inert without the master key, which lives in the
 * process environment and never in this database.
 *
 * `toJSON` IS OVERRIDDEN TO DROP THE SEALED COLUMNS. Not because they are readable (they are
 * not), but because the easiest way to leak a credential is for a future route to return a row
 * it did not think about, and because `JSON.stringify(row)` is how objects reach log lines.
 * What survives is the lifecycle metadata an operator actually needs: which type, when it
 * expires, when it was last rotated, and which master key sealed it. Anything needing the
 * secret itself calls `credentialVault.open()` explicitly, which is greppable.
 */

export type CredentialType = 'access_token' | 'refresh_token';

export const CREDENTIAL_TYPES: readonly CredentialType[] = ['access_token', 'refresh_token'];

export interface ConnectorCredentialAttributes {
  id?: string;
  tenant_id: string;
  channel_account_id: string;
  credential_type: CredentialType;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  wrapped_data_key: string;
  key_id: string;
  encrypted_at: Date;
  token_expires_at?: Date | null;
  rotated_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class ConnectorCredential extends Model<ConnectorCredentialAttributes> implements ConnectorCredentialAttributes {
  declare id: string;
  declare tenant_id: string;
  declare channel_account_id: string;
  declare credential_type: CredentialType;
  declare ciphertext: string;
  declare iv: string;
  declare auth_tag: string;
  declare wrapped_data_key: string;
  declare key_id: string;
  declare encrypted_at: Date;
  declare token_expires_at: Date | null;
  declare rotated_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;

  /** Lifecycle metadata only. The sealed columns never leave this object. */
  toJSON(): Record<string, unknown> {
    const { ciphertext, iv, auth_tag, wrapped_data_key, ...safe } = super.toJSON() as unknown as Record<string, unknown>;
    return { ...safe, has_secret: true };
  }
}

ConnectorCredential.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    channel_account_id: { type: DataTypes.UUID, allowNull: false },
    credential_type: { type: DataTypes.STRING(32), allowNull: false },
    ciphertext: { type: DataTypes.TEXT, allowNull: false },
    iv: { type: DataTypes.STRING(64), allowNull: false },
    auth_tag: { type: DataTypes.STRING(64), allowNull: false },
    wrapped_data_key: { type: DataTypes.TEXT, allowNull: false },
    key_id: { type: DataTypes.STRING(64), allowNull: false },
    encrypted_at: { type: DataTypes.DATE, allowNull: false },
    token_expires_at: { type: DataTypes.DATE, allowNull: true },
    rotated_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'marketing_connector_credentials',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default ConnectorCredential;
