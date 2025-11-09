import mongoose from "mongoose";
import app from "../server.js";

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export default async function handler(req, res) {
  try {
    if (!cached.conn) {
      if (!cached.promise) {
        cached.promise = mongoose.connect(process.env.MONGO_URI, {
          bufferCommands: false,
          maxPoolSize: 10,
          serverSelectionTimeoutMS: 10000,
        }).then((m) => m);
      }
      cached.conn = await cached.promise;
    }
    return app(req, res);
  } catch (err) {
    console.error("Mongo connection error:", err);
    res.status(500).json({ error: "Database connection failed", details: err.message });
  }
}
