import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * DeliveryClientSigninToken — one emailed sign-in link for a client reviewer.
 *
 * Ali chose magic link over Google SSO once the audience was clear: the executives this
 * surface serves are overwhelmingly Microsoft 365 shops, and many cannot create a Google
 * account even if asked. A magic link works for **any** email address.
 *
 * ## What this row is NOT
 *
 * It is not a session and it is not authorization. Redeeming a live link proves only that
 * the holder controls that mailbox; `decideClientSignIn` then decides whether a session
 * may exist at all, and it still requires a delivery membership that already exists. A
 * valid link for an address with no membership yields nothing.
 *
 * ## Why the token itself is absent
 *
 * `token_hash` holds SHA-256 of the token; the token is never stored. Sponsors store the
 * raw UUID, which means the column *is* the credential — anyone able to read it, or a
 * logged query, or a support screenshot, can sign in as that sponsor. Hashing costs
 * nothing here because redemption looks the row up **by hash** rather than scanning.
 *
 * Unsalted SHA-256 is right for this input and would be wrong for a password: the token
 * is 128 bits of `crypto.randomUUID()`, so there is no dictionary to attack.
 *
 * ## Why `email` is stored
 *
 * So a request can be rate-limited before any identity is resolved. The limit has to
 * apply equally to addresses that match nobody — a limit that engaged only for real
 * accounts would make response timing an enumeration oracle, reintroducing by the side
 * door the very thing the uniform response closes.
 *
 * Rows are kept after use rather than deleted: `consumed_at` is what makes a link
 * single-use, and it is also the audit trail for when access was actually exercised.
 */
export interface DeliveryClientSigninTokenAttributes {
  id: string;
  email: string;
  token_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
  requested_ip: string | null;
  created_at: Date;
  updated_at: Date;
}

class DeliveryClientSigninToken
  extends Model<DeliveryClientSigninTokenAttributes>
  implements DeliveryClientSigninTokenAttributes
{
  declare id: string;
  declare email: string;
  declare token_hash: string;
  declare expires_at: Date;
  declare consumed_at: Date | null;
  declare requested_ip: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DeliveryClientSigninToken.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING(255), allowNull: false },
    // 64 hex characters of SHA-256. Never the token.
    token_hash: { type: DataTypes.STRING(64), allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    // Null until redeemed. Non-null is what makes the link single-use.
    consumed_at: { type: DataTypes.DATE, allowNull: true },
    requested_ip: { type: DataTypes.STRING(64), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'delivery_client_signin_tokens',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      // Redemption looks up by hash. Unique so a duplicated insert cannot produce two
      // rows with different consumed_at states — which would make "already used"
      // depend on which row was read.
      { unique: true, fields: ['token_hash'], name: 'delivery_client_signin_tokens_hash_unique' },
      { fields: ['email', 'created_at'], name: 'idx_delivery_client_signin_email_created' },
    ],
  },
);

export default DeliveryClientSigninToken;
