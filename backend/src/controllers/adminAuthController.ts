import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { adminLoginSchema } from '../schemas/adminSchema';
import { authenticateAdmin } from '../services/adminService';

export async function handleAdminLogin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = adminLoginSchema.parse(req.body);
    const token = await authenticateAdmin(data.email, data.password);
    res.json({ token });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    next(error);
  }
}

export async function handleAdminLogout(
  _req: Request,
  res: Response
): Promise<void> {
  // JWT is stateless — logout is client-side (discard token).
  // Endpoint exists for API completeness and future token blacklisting.
  res.json({ message: 'Logged out' });
}
