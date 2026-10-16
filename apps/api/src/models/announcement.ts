import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const announcementSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  status: { type: String, enum: ["draft", "published", "archived"], default: "draft", index: true },
  publishedAt: { type: Date, default: undefined },
}, { timestamps: true });

type AnnouncementRecord = InferSchemaType<typeof announcementSchema>;
export const Announcement = (models.Announcement as Model<AnnouncementRecord> | undefined)
  ?? model<AnnouncementRecord>("Announcement", announcementSchema);
