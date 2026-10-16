import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const directorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    title: { type: String, default: "", trim: true, maxlength: 120 },
    displayOrder: { type: Number, default: 0 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    bio: { type: String, default: "", maxlength: 5000 },
    photoUrl: { type: String, default: "", maxlength: 2048 },
    nationality: { type: String, default: "Filipino", maxlength: 80 },
    birthYear: { type: Number, min: 1850, max: 2100 },
    featured: { type: Boolean, default: false, index: true },
    awardsSummary: { type: [String], default: [] },
  },
  { timestamps: true }
);

directorSchema.index({ name: "text", bio: "text" });

type DirectorRecord = InferSchemaType<typeof directorSchema>;
export const Director =
  (models.Director as Model<DirectorRecord> | undefined) ??
  model<DirectorRecord>("Director", directorSchema);

