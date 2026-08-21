import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, default: 'GoogleAuthVerifiedUser2026' },
  phone: { type: String, default: '+91 78717 79134' },
  googleId: { type: String },
  authProvider: { type: String, enum: ['local', 'google'], default: 'google' },
  role: { 
    type: String, 
    enum: [
      'guest', 
      'user', 
      'owner', 
      'guide', 
      'vendor', 
      'owner_and_vendor',
      'admin', 
      'super_admin',
      'operations_manager',
      'booking_executive',
      'customer_support_executive',
      'destination_content_manager',
      'property_verification_manager',
      'transport_manager',
      'finance_accounts_manager',
      'marketing_manager',
      'media_gallery_manager',
      'hr_staff_manager'
    ],
    default: 'user'
  },
  isVerified: { type: Boolean, default: true },
  verificationCode: { type: String, default: '' },
  avatar: { type: String, default: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb' },
  wishlist: [{ type: String }],
  notifications: [
    {
      id: { type: String },
      title: { type: String },
      message: { type: String },
      date: { type: String },
      read: { type: Boolean, default: false }
    }
  ],
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

userSchema.methods.matchPassword = async function(enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

export const User = mongoose.models.User || mongoose.model('User', userSchema);
