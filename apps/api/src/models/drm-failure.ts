import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

// Videos the encryption worker could not package, so the queue stops retrying them forever.
const drmFailureSchema = new Schema(
  {
    sourceUrl: { type: String, required: true, unique: true },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: "" },
  },
  { timestamps: true }
);

type DrmFailureRecord = InferSchemaType<typeof drmFailureSchema>;
export const DrmFailure = (models.DrmFailure as Model<DrmFailureRecord> | undefined) ?? model<DrmFailureRecord>("DrmFailure", drmFailureSchema);
