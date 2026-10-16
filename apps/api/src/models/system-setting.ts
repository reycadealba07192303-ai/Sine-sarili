import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const systemSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true },
    description: { type: String, default: "" },
  },
  { timestamps: true }
);

type SystemSettingRecord = InferSchemaType<typeof systemSettingSchema>;
export const SystemSetting =
  (models.SystemSetting as Model<SystemSettingRecord> | undefined) ??
  model<SystemSettingRecord>("SystemSetting", systemSettingSchema);

