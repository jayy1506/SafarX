import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.js';
import { User, IUser, UserRole } from '../models/User.js';
import { verifyFirebaseIdToken } from '../config/firebase.js';

export interface AuthenticatedRequest extends Request {
  user?: IUser;
  firebaseUser?: any;
}

/**
 * Authentication Middleware:
 * Supports Firebase ID Token (Primary) with JWT Fallback
 */
export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
      return;
    }

    const token = authHeader.split(' ')[1];

    // 1. Attempt Firebase ID Token Verification
    if (token.startsWith('ey') && token.length > 300) {
      const fbDecoded = await verifyFirebaseIdToken(token);
      if (fbDecoded) {
        let user = await User.findOne({
          $or: [
            { email: fbDecoded.email },
            { phone: fbDecoded.phone_number?.replace('+91', '') },
          ],
        });

        if (!user && fbDecoded.email) {
          // Auto-provision user on verified Firebase login
          user = await User.create({
            fullName: fbDecoded.name || 'SafarX Traveler',
            email: fbDecoded.email,
            phone: fbDecoded.phone_number?.replace('+91', '') || `9890${Date.now().toString().slice(-6)}`,
            password: `fb_auth_${Date.now()}`,
            role: 'CUSTOMER',
          });
        }

        if (user && user.isActive) {
          req.user = user;
          req.firebaseUser = fbDecoded;
          return next();
        }
      }
    }

    // 2. JWT Verification (Platform Issued Token)
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
      res.status(401).json({ success: false, message: 'Invalid or expired authentication session.' });
      return;
    }
  } catch (error) {
    res.status(401).json({ success: false, message: 'Authentication verification failed.' });
  }
}
