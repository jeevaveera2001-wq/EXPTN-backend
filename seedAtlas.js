import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI;

const connectLiveDatabase = async () => {
  try {
    if (!MONGODB_URI) {
      throw new Error(
        "MONGODB_URI or MONGO_URI is missing in the .env file."
      );
    }

    console.log(
      "Connecting to the live MongoDB Atlas database..."
    );

    await mongoose.connect(MONGODB_URI, {
      dbName: "explore_tamilnadu_db",
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 20,
      minPoolSize: 1,
    });

    console.log(
      "✅ Connected to the live MongoDB Atlas database."
    );

    const database = mongoose.connection.db;

    const collections = await database
      .listCollections()
      .toArray();

    console.log(
      `✅ Live database verified. ${collections.length} collections found.`
    );

    console.log(
      "✅ No default users, properties, vehicles, or tickets were created."
    );

    console.log(
      "✅ The application will use only records created by real users, property owners, vehicle providers, and administrators."
    );
  } catch (error) {
    console.error(
      "❌ MongoDB Atlas connection error:",
      error.message
    );

    process.exitCode = 1;
  } finally {
    try {
      await mongoose.disconnect();

      console.log(
        "MongoDB verification connection closed."
      );
    } catch (disconnectError) {
      console.error(
        "MongoDB disconnect error:",
        disconnectError.message
      );
    }
  }
};

connectLiveDatabase();