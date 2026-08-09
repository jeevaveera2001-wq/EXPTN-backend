import mongoose from 'mongoose';

export const connectDB = async () => {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/explore_tamilnadu_db';
  try {
    const conn = await mongoose.connect(MONGODB_URI);
    console.log(`🚀 Connected to MongoDB Atlas/Local at: ${conn.connection.host}`);
  } catch (error) {
    console.warn(`⚠️ MongoDB connection warning (fallback to in-memory store): ${error.message}`);
  }
};
