import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const genreSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, default: "", maxlength: 500 },
}, { timestamps: true });

type GenreRecord = InferSchemaType<typeof genreSchema>;
export const Genre = (models.Genre as Model<GenreRecord> | undefined)
  ?? model<GenreRecord>("Genre", genreSchema);
