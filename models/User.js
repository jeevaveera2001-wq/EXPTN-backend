import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String },
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
  isVerified: { type: Boolean, default: false },
  verificationCode: { type: String, default: '123456' },
  avatar: { type: String, default: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb' },
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Property' }],
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
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export const User = mongoose.model('User', userSchema);
