import { z } from 'zod';

export const adminLoginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

// Length is re-checked in changeAdminPassword (MIN_PASSWORD_LENGTH) so the rule
// holds for any caller, not just ones arriving through this route.
export const adminChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(12, 'New password must be at least 12 characters'),
});

export type AdminChangePasswordInput = z.infer<typeof adminChangePasswordSchema>;
