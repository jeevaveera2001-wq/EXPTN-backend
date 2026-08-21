import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './models/User.js';
import { Property } from './models/Property.js';
import { Booking } from './models/Booking.js';
import { Vehicle } from './models/Vehicle.js';
import { Ticket } from './models/Ticket.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://exploretamizhagam_db_user:GXvvCrIZXnXC74YM@cluster0.4yvyy1o.mongodb.net/explore_tamilnadu_db?retryWrites=true&w=majority';

async function resetDatabaseToZero() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI, { dbName: 'explore_tamilnadu_db' });
    console.log('Connected!');

    // 1. Delete all bookings, properties, vehicles, and tickets
    const delBookings = await Booking.deleteMany({});
    console.log(`Deleted ${delBookings.deletedCount} bookings.`);

    const delProperties = await Property.deleteMany({});
    console.log(`Deleted ${delProperties.deletedCount} properties.`);

    const delVehicles = await Vehicle.deleteMany({});
    console.log(`Deleted ${delVehicles.deletedCount} vehicles.`);

    const delTickets = await Ticket.deleteMany({});
    console.log(`Deleted ${delTickets.deletedCount} tickets.`);

    // 2. Delete all users except Super Admin
    const delUsers = await User.deleteMany({ email: { $ne: 'exploretamizhagam@gmail.com' } });
    console.log(`Deleted ${delUsers.deletedCount} non-admin users.`);

    // 3. Ensure Super Admin exists and is verified
    let superAdmin = await User.findOne({ email: 'exploretamizhagam@gmail.com' });
    if (!superAdmin) {
      superAdmin = await User.create({
        name: 'Jeeva Veeramani',
        email: 'exploretamizhagam@gmail.com',
        password: 'Lokiuniverse',
        role: 'super_admin',
        phone: '+91 78717 79134',
        isVerified: true
      });
      console.log('Super Admin account created.');
    } else {
      superAdmin.role = 'super_admin';
      superAdmin.isVerified = true;
      superAdmin.password = 'Lokiuniverse';
      await superAdmin.save();
      console.log('Super Admin account verified.');
    }

    console.log('✨ DATABASE SUCCESSFULLY RESET TO ZERO (ONLY SUPER ADMIN RETAINED)!');
    process.exit(0);
  } catch (err) {
    console.error('Reset error:', err);
    process.exit(1);
  }
}

resetDatabaseToZero();
