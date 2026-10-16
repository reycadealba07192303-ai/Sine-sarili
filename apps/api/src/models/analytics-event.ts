import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const analyticsEventSchema = new Schema(
  {
    eventType: {
      type: String,
      required: true,
      enum: ["page_view", "video_start", "video_progress", "video_complete", "playback_error"],
      index: true,
    },
    filmId: { type: Schema.Types.ObjectId, ref: "Film", index: true },
    filmSlug: { type: String, required: true, index: true },
    filmTitle: { type: String, default: "" },
    durationSeconds: { type: Number, default: 0 },
    progressSeconds: { type: Number, default: 0 },
    errorMessage: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    ipHash: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

analyticsEventSchema.index({ eventType: 1, createdAt: -1 });
analyticsEventSchema.index({ filmSlug: 1, eventType: 1 });

type AnalyticsEventRecord = InferSchemaType<typeof analyticsEventSchema>;
export const AnalyticsEvent =
  (models.AnalyticsEvent as Model<AnalyticsEventRecord> | undefined) ??
  model<AnalyticsEventRecord>("AnalyticsEvent", analyticsEventSchema);

