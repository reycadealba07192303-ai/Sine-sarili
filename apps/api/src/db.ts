import mongoose from "mongoose";

let connection: Promise<typeof mongoose> | undefined;

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");

  if (mongoose.connection.readyState === 1) return mongoose;
  connection ??= mongoose.connect(uri, { bufferCommands: false });
  try {
    return await connection;
  } catch (error) {
    connection = undefined;
    throw error;
  }
}
