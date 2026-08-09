import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { User } from './models/User.js';

dotenv.config();

const createSuperAdminAccount = async () => {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/explore_tamilnadu_db';
  try {
    console.log(`Connecting to MongoDB...`);
    await mongoose.connect(MONGODB_URI);

    const email = 'exploretamizhagam@gmail.com';
    const name = 'Jeeva Veeramani';
    const rawPassword = 'Lokiuniverse';
    const phone = '7871779134';
    const role = 'super_admin';

    let user = await User.findOne({ email });

    if (user) {
      console.log(`Existing account found for ${email}. Updating credentials...`);
      user.name = name;
      user.password = rawPassword; // pre('save') hook will hash this
      user.role = role;
      user.phone = phone;
      user.isVerified = true;
      await user.save();
      console.log(`✅ Super Admin Account Updated Successfully!`);
    } else {
      user = new User({
        name,
        email,
        password: rawPassword,
        phone,
        role,
        isVerified: true
      });
      await user.save();
      console.log(`✅ Super Admin Account Created Successfully!`);
    }

    console.log(`----------------------------------------`);
    console.log(`Username     : ${user.name}`);
    console.log(`Email        : ${user.email}`);
    console.log(`Phone        : ${user.phone}`);
    console.log(`Role         : ${user.role}`);
    console.log(`----------------------------------------`);

  } catch (error) {
    console.error(`❌ Super Admin creation failed: ${error.message}`);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

createSuperAdminAccount();
