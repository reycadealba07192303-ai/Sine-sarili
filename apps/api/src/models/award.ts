import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const awardSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    organization: { type: String, required: true, trim: true, maxlength: 200 },
    year: { type: Number, required: true, min: 1900, max: 2200, index: true },
    category: { type: String, default: "", trim: true, maxlength: 200 },
    awardType: {
      type: String,
      enum: ["win", "nomination", "official_selection", "honorary"],
      default: "win",
      index: true,
    },
    filmId: { type: Schema.Types.ObjectId, ref: "Film", index: true },
    filmTitle: { type: String, default: "", trim: true, maxlength: 200 },
    recipientName: { type: String, default: "", trim: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 2000 },
  },
  { timestamps: true }
);

awardSchema.index({ organization: 1, year: -1 });

type AwardRecord = InferSchemaType<typeof awardSchema>;
export const Award =
  (models.Award as Model<AwardRecord> | undefined) ??
  model<AwardRecord>("Award", awardSchema);

