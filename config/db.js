import mongoose from 'mongoose';

// Enable buffer commands so Mongoose queues operations while connecting
mongoose.set('bufferCommands', true);

let cachedConnectionPromise = null;

export const connectDB = async () => {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://exploretamizhagam_db_user:GXvvCrIZXnXC74YM@cluster0.4yvyy1o.mongodb.net/explore_tamilnadu_db?retryWrites=true&w=majority';

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (mongoose.connection.readyState === 2 && cachedConnectionPromise) {
    try {
      await cachedConnectionPromise;
      return mongoose.connection;
    } catch (e) {}
  }

  try {
    cachedConnectionPromise = mongoose.connect(MONGODB_URI, {
      dbName: 'explore_tamilnadu_db',
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      maxPoolSize: 10
    });

    const conn = await cachedConnectionPromise;
    console.log(`🚀 [MONGODB ATLAS CONNECTED] Cluster: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    cachedConnectionPromise = null;
    console.error(`⚠️ [MONGODB CONNECTION ERROR]: ${error.message}`);
    return null;
  }
};
