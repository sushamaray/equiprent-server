
import { MongoClient } from "mongodb";

let client;
let database;

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME;

  if (!uri || !dbName) {
    throw new Error("Missing MongoDB environment variables");
  }

  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  try {
    await client.connect();

    database = client.db(dbName);

    await database.command({ ping: 1 });

    console.log(`MongoDB connected: ${dbName}`);

    return database;
  } catch (error) {
    await client.close();
    client = undefined;
    database = undefined;
    throw error;
  }
};

export const getDB = () => {
  if (!database) {
    throw new Error("Database connection is not initialized");
  }

  return database;
};

export const closeDB = async () => {
  if (client) {
    await client.close();
    client = undefined;
    database = undefined;
  }
};


export const getMongoClient = () => {
  if (!client) {
    throw new Error("MongoDB client is not initialized");
  }

  return client;
};
