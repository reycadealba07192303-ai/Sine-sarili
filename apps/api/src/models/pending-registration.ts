import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const pendingRegistrationSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  attempts: { type: Number, default: 0 },
  sentAt: { type: Date, required: true },
}, { timestamps: true });

type PendingRegistrationRecord = InferSchemaType<typeof pendingRegistrationSchema>;
export const PendingRegistration = (models.PendingRegistration as Model<PendingRegistrationRecord> | undefined)
  ?? model<PendingRegistrationRecord>("PendingRegistration", pendingRegistrationSchema);
