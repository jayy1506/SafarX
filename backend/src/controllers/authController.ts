import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User, IUser, UserRole } from '../models/User.js';
import { Driver } from '../models/Driver.js';
import { Vehicle } from '../models/Vehicle.js';
import { ENV } from '../config/env.js';
import { AuthRequest } from '../middlewares/auth.js';
import { verifyFirebaseIdToken } from '../config/firebase.js';

function generateToken(user: IUser): string {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    ENV.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function getPhoneVariants(input: string): string[] {
  if (!input) return [];
  const clean = input.replace(/\s+|-/g, '').trim();
  const digitsOnly = clean.replace(/^\+91/, '').replace(/^0+/, '');
  const withPrefix = `+91${digitsOnly}`;
  return Array.from(new Set([clean, digitsOnly, withPrefix])).filter(Boolean);
}

export class AuthController {
  /**
   * Firebase Authentication (Phone OTP / Google / Email)
   */
  static async firebaseLogin(req: Request, res: Response): Promise<void> {
    try {
      const { idToken, role = 'CUSTOMER', fullName, vehicleNumber, vehicleBrand, vehicleModel, vehicleSeats } = req.body;

      if (!idToken) {
        res.status(400).json({ success: false, message: 'Firebase idToken is required' });
        return;
      }

      const fbUser = await verifyFirebaseIdToken(idToken);
      if (!fbUser) {
        res.status(401).json({ success: false, message: 'Invalid or expired Firebase authentication token' });
        return;
      }

      const rawPhone = fbUser.phone_number || req.body.phone;
      const phone = rawPhone ? rawPhone.trim() : `+9198${Math.floor(10000000 + Math.random() * 90000000)}`;
      const email = (fbUser.email || req.body.email || `${fbUser.uid}@safarx.app`).toLowerCase().trim();
      const name = fullName || fbUser.name || 'SafarX Traveler';

      const phoneVariants = getPhoneVariants(phone);

      // Find user by phone variants or email
      let user = await User.findOne({
        $or: [
          { email },
          { phone: { $in: phoneVariants } },
        ],
      });

      if (!user) {
        // Enforce role security: public login CANNOT create an ADMIN
        const userRole: UserRole = role === 'DRIVER' ? 'DRIVER' : 'CUSTOMER';

        user = await User.create({
          fullName: name,
          phone,
          email,
          password: `fb_auth_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          role: userRole,
        });

        if (userRole === 'DRIVER') {
          const driverProfile = await Driver.create({
            user: user._id,
            drivingLicenseNumber: `DL-MH31-${Math.floor(100000 + Math.random() * 900000)}`,
            licenseExpiry: new Date('2032-12-31'),
            governmentIdNumber: `UID-${Math.floor(100000000000 + Math.random() * 900000000000)}`,
            verificationStatus: 'PENDING',
          });

          if (vehicleNumber) {
            await Vehicle.create({
              driver: driverProfile._id,
              vehicleNumber: vehicleNumber.toUpperCase().trim(),
              brand: vehicleBrand || 'Maruti Suzuki',
              model: vehicleModel || 'Dzire',
              color: 'White',
              totalSeats: vehicleSeats || 4,
              rcNumber: `RC-${vehicleNumber.toUpperCase().trim()}`,
              status: 'PENDING',
            });
          }
        }
      }

      if (!user.isActive) {
        res.status(401).json({ success: false, message: 'This account has been deactivated.' });
        return;
      }

      const token = generateToken(user);

      res.json({
        success: true,
        message: 'Firebase authentication successful',
        token,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Direct Email/Phone & Password Registration
   */
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const {
        fullName,
        phone,
        email,
        password,
        role,
        drivingLicenseNumber,
        licenseExpiry,
        governmentIdNumber,
        vehicleNumber,
        brand,
        model,
        vehicleSeats,
      } = req.body;

      if (!fullName || !phone || !email || !password) {
        res.status(400).json({ success: false, message: 'Full name, phone, email, and password are required' });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
        return;
      }

      const cleanEmail = email.toLowerCase().trim();
      const phoneVariants = getPhoneVariants(phone);

      const existingUser = await User.findOne({
        $or: [
          { email: cleanEmail },
          { phone: { $in: phoneVariants } },
        ],
      });

      if (existingUser) {
        res.status(400).json({ success: false, message: 'User with this email or phone number already exists' });
        return;
      }

      // Public registration CANNOT self-assign ADMIN
      const userRole: UserRole = role === 'DRIVER' ? 'DRIVER' : 'CUSTOMER';

      const user = await User.create({
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: cleanEmail,
        password,
        role: userRole,
      });

      if (userRole === 'DRIVER') {
        const driverProfile = await Driver.create({
          user: user._id,
          drivingLicenseNumber: drivingLicenseNumber || `DL-MH31-${Math.floor(100000 + Math.random() * 900000)}`,
          licenseExpiry: licenseExpiry ? new Date(licenseExpiry) : new Date('2032-12-31'),
          governmentIdNumber: governmentIdNumber || `UID-${Math.floor(100000000000 + Math.random() * 900000000000)}`,
          verificationStatus: 'PENDING',
        });

        if (vehicleNumber) {
          await Vehicle.create({
            driver: driverProfile._id,
            vehicleNumber: vehicleNumber.toUpperCase().trim(),
            brand: brand || 'Maruti Suzuki',
            model: model || 'Swift Dzire',
            color: 'White',
            totalSeats: vehicleSeats ? Number(vehicleSeats) : 4,
            rcNumber: `RC-${vehicleNumber.toUpperCase().trim()}`,
            status: 'PENDING',
          });
        }
      }

      const token = generateToken(user);

      res.status(201).json({
        success: true,
        message: 'Account registered successfully',
        token,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Login with email or phone + password
   */
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { emailOrPhone, password } = req.body;

      if (!emailOrPhone || !password) {
        res.status(400).json({ success: false, message: 'Please provide email/phone and password' });
        return;
      }

      const cleanInput = String(emailOrPhone).trim();
      const phoneVariants = getPhoneVariants(cleanInput);

      const user = await User.findOne({
        $or: [
          { email: cleanInput.toLowerCase() },
          { phone: { $in: phoneVariants } },
        ],
      });

      if (!user) {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
        return;
      }

      if (!user.isActive) {
        res.status(401).json({ success: false, message: 'Account is deactivated' });
        return;
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
        return;
      }

      const token = generateToken(user);

      let driverStatus = undefined;
      if (user.role === 'DRIVER') {
        const driverProfile = await Driver.findOne({ user: user._id });
        driverStatus = driverProfile?.verificationStatus;
      }

      res.json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          driverStatus,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get authenticated user profile
   */
  static async getMe(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: 'Not authenticated' });
        return;
      }

      let extraData: any = {};
      if (req.user.role === 'DRIVER') {
        const driver = await Driver.findOne({ user: req.user._id });
        const vehicle = driver ? await Vehicle.findOne({ driver: driver._id }) : null;
        extraData = { driver, vehicle };
      }

      res.json({
        success: true,
        user: {
          id: req.user._id,
          fullName: req.user.fullName,
          email: req.user.email,
          phone: req.user.phone,
          role: req.user.role,
          emergencyContact: req.user.emergencyContact,
          savedPickups: req.user.savedPickups,
          ...extraData,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
