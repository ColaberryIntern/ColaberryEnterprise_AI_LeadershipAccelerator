import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AdminUser } from '../models';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

const SALT_ROUNDS = 12;

export async function authenticateAdmin(email: string, password: string): Promise<string> {
  const admin = await AdminUser.findOne({ where: { email } });
  if (!admin) {
    throw new AppError('Invalid email or password', 401);
  }

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) {
    throw new AppError('Invalid email or password', 401);
  }

  // If this employee's email also has a connected staff/portal account, carry
  // its enrollment id so "AI Training" works on a normal direct login too —
  // not just via the portal->Management Portal bridge. Deliberately does NOT
  // set `mgmt_role` here: that claim narrows adminAllowedSections() to a
  // scoped role's sections, which would silently shrink this legacy full
  // admin login's access. See loadStaffPortalLinkByEmail's docblock.
  const { loadStaffPortalLinkByEmail } = await import('./access/mgmtBridgeService');
  const portalLink = await loadStaffPortalLinkByEmail(admin.email);

  const payload: Record<string, unknown> = { sub: admin.id, email: admin.email, role: admin.role };
  if (portalLink) payload.portal_enrollment_id = portalLink.enrollmentId;

  const expiresIn = env.jwtExpiresIn;
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: expiresIn as unknown as number });

  return token;
}

/** Shortest password we will accept on rotation. */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Rotate an admin identity's own password.
 *
 * Requires the current password even though the caller already holds a valid
 * JWT: a token lifted from a shared machine should not be enough to lock the
 * real owner out of their account.
 *
 * Throws 401 on a bad current password, with the same message login uses so
 * this endpoint cannot be used to confirm which accounts exist, and 400 on a
 * new password that is too short or unchanged.
 */
export async function changeAdminPassword(
  adminId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const admin = await AdminUser.findByPk(adminId);
  if (!admin) {
    throw new AppError('Invalid email or password', 401);
  }

  const valid = await bcrypt.compare(currentPassword, admin.password_hash);
  if (!valid) {
    throw new AppError('Invalid email or password', 401);
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
  }
  if (newPassword === currentPassword) {
    throw new AppError('New password must differ from the current password', 400);
  }

  admin.password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await admin.save();
}

export async function createAdminUser(email: string, password: string, role = 'admin'): Promise<AdminUser> {
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  return AdminUser.create({
    email,
    password_hash: hash,
    role,
  });
}
