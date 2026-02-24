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

  const expiresIn = env.jwtExpiresIn;
  const token = jwt.sign(
    { sub: admin.id, email: admin.email, role: admin.role },
    env.jwtSecret,
    { expiresIn: expiresIn as unknown as number }
  );

  return token;
}

export async function createAdminUser(email: string, password: string, role = 'admin'): Promise<AdminUser> {
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  return AdminUser.create({
    email,
    password_hash: hash,
    role,
  });
}
