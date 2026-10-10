import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.js';
import { User, IUser, UserRole } from '../models/User.js';
import { verifyFirebaseIdToken } from '../config/firebase.js';

export interface AuthRequest extends Request {
  user?: IUser;
  firebaseUser?: any;
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
      return;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      res.status(401).json({ success: false, message: 'Authentication token is empty.' });
      return;
    }

    // 1. Try Platform JWT verification
    try {
      const decoded = jwt.verify(token, ENV.JWT_SECRET) as { id: string; role: UserRole };
      const user = await User.findById(decoded.id);
      if (!user || !user.isActive) {
        res.status(401).json({ success: false, message: 'User account is invalid or deactivated.' });
        return;
      }
      req.user = user;
      return next();
    } catch {
      // If JWT verification fails, check if this is a Firebase ID Token
    }

    // 2. Try Firebase ID Token verification
    const fbDecoded = await verifyFirebaseIdToken(token);
    if (fbDecoded) {
      const cleanPhone = fbDecoded.phone_number?.replace('+91', '').trim();
      const user = await User.findOne({
        $or: [
          ...(fbDecoded.email ? [{ email: fbDecoded.email.toLowerCase() }] : []),
          ...(cleanPhone ? [{ phone: cleanPhone }] : []),
        ],
      });

      if (user && user.isActive) {
        req.user = user;
        req.firebaseUser = fbDecoded;
        return next();
      }
    }

    res.status(401).json({ success: false, message: 'Invalid or expired authentication token.' });
  } catch (error: any) {
    res.status(401).json({ success: false, message: 'Authentication verification failed.' });
  }
}

export function authorizeRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized. Please login.' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `Forbidden. Role '${req.user.role}' does not have permission for this resource.`,
      });
      return;
    }

    next();
  };
}
