import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const watchHistorySchema = new Schema(
  {
    viewerId: { type: Schema.Types.ObjectId, ref: "ViewerAccount", required: true },
    filmId: { type: Schema.Types.ObjectId, ref: "Film", required: true },
    episodeId: { type: String, default: "", maxlength: 64 },
    episodeLabel: { type: String, default: "", maxlength: 200 },
    progressSeconds: { type: Number, default: 0, min: 0 },
    durationSeconds: { type: Number, default: 0, min: 0 },
    completed: { type: Boolean, default: false },
    lastWatchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

watchHistorySchema.index({ viewerId: 1, filmId: 1 }, { unique: true });
watchHistorySchema.index({ viewerId: 1, lastWatchedAt: -1 });

type WatchHistoryRecord = InferSchemaType<typeof watchHistorySchema>;
export const WatchHistory =
  (models.WatchHistory as Model<WatchHistoryRecord> | undefined) ??
  model<WatchHistoryRecord>("WatchHistory", watchHistorySchema);
