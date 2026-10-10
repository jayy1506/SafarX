import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'ADMIN' | 'DRIVER' | 'CUSTOMER';

export interface IUser extends Document {
  fullName: string;
  phone: string;
  email: string;
  password?: string;
  role: UserRole;
  profilePhoto?: string;
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  savedPickups?: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ['ADMIN', 'DRIVER', 'CUSTOMER'],
      default: 'CUSTOMER',
      required: true,
    },
    profilePhoto: { type: String, default: '' },
    emergencyContact: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      relationship: { type: String, default: '' },
    },
    savedPickups: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret) => {
        delete (ret as any).password;
        delete (ret as any).__v;
        return ret;
      },
    },
    toObject: {
      transform: (_, ret) => {
        delete (ret as any).password;
        delete (ret as any).__v;
        return ret;
      },
    },
  }
);

UserSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model<IUser>('User', UserSchema);
