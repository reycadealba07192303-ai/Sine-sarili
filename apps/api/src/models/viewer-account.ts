import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const viewerAccountSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true },
  passwordChangedAt: { type: Date, default: undefined },
  passwordResetTokenHash: { type: String, default: undefined, index: true },
  passwordResetExpiresAt: { type: Date, default: undefined },
  passwordResetCodeHash: { type: String, default: undefined, index: true },
  passwordResetAttempts: { type: Number, default: 0 },
  passwordResetSentAt: { type: Date, default: undefined },
  subscriptionPlan: { type: String, enum: ["free", "standard_monthly", "vip_monthly", "patron_annual"], default: "free" },
  subscriptionStatus: { type: String, enum: ["inactive", "active", "cancelled", "past_due"], default: "inactive" },
  lastActiveAt: { type: Date, default: Date.now },
}, { timestamps: true });

type ViewerAccountRecord = InferSchemaType<typeof viewerAccountSchema>;
export const ViewerAccount = (models.ViewerAccount as Model<ViewerAccountRecord> | undefined) ?? model<ViewerAccountRecord>("ViewerAccount", viewerAccountSchema);
