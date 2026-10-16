import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: "", maxlength: 1000 },
    sectionKey: {
      type: String,
      default: "films",
      enum: ["films", "genre", "showcase", "format", "award-winning", "sb-category", "custom", "announcements", "achievements"],
      index: true,
    },
    displayOrder: { type: Number, default: 0, index: true },
    isVisible: { type: Boolean, default: true, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

categorySchema.index({ displayOrder: 1, name: 1 });

type CategoryRecord = InferSchemaType<typeof categorySchema>;
export const Category =
  (models.Category as Model<CategoryRecord> | undefined) ??
  model<CategoryRecord>("Category", categorySchema);

