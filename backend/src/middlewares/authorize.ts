import { Response, NextFunction } from 'express';
import { UserRole } from '../models/User.js';
import { AuthenticatedRequest } from './authenticate.js';

/**
 * Role-Based Access Control (RBAC) Middleware
 * Usage: authorize('ADMIN'), authorize('DRIVER'), authorize('CUSTOMER')
 */
export function authorize(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `Forbidden. Role '${req.user.role}' is not authorized to access this resource.`,
      });
      return;
    }

    next();
  };
}
