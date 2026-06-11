import { MongoClient, Db } from 'mongodb';
import { logger } from './logger.js';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDB(): Promise<Db> {
  if (db && client) return db;

  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB || 'ecare360';

  if (!uri) {
    logger.error('MONGO_URI is not defined in the environment variables');
    throw new Error('Database URI missing');
  }

  try {
    logger.info('Connecting to MongoDB...');
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 15000,
    });
    
    await client.connect();
    db = client.db(dbName);
    
    logger.info(`Successfully connected to database: ${dbName}`);
    return db;
  } catch (err) {
    logger.error('Failed to connect to MongoDB database:', err);
    throw err;
  }
}

export async function connectPatientPortalDB(): Promise<Db> {
  await connectDB();
  if (!client) throw new Error('MongoClient is not initialized');
  return client.db('PatientPortal');
}

export async function connectAppointmentDB(): Promise<Db> {
  await connectDB();
  if (!client) throw new Error('MongoClient is not initialized');
  return client.db('appointment');
}

export async function closeDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info('MongoDB connection closed.');
  }
}
