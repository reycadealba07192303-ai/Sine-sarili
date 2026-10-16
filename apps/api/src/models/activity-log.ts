import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const activityLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "AdminUser", index: true },
    actorName: { type: String, required: true, trim: true },
    actorEmail: { type: String, required: true, trim: true },
    actorRole: { type: String, required: true, trim: true },
    action: { type: String, required: true, trim: true, index: true },
    resourceType: {
      type: String,
      required: true,
      enum: ["film", "announcement", "category", "director", "award", "user", "setting", "session", "bank_account", "payment_submission"],
      index: true,
    },
    resourceId: { type: String, default: "" },
    details: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activityLogSchema.index({ createdAt: -1 });

type ActivityLogRecord = InferSchemaType<typeof activityLogSchema>;
export const ActivityLog =
  (models.ActivityLog as Model<ActivityLogRecord> | undefined) ??
  model<ActivityLogRecord>("ActivityLog", activityLogSchema);

