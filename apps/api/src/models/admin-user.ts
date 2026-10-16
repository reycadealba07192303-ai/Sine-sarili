import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

export const ADMIN_PERMISSIONS = [
  "films",
  "announcements",
  "categories",
  "directors",
  "awards",
  "analytics",
  "users",
  "settings",
  "activity_logs",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const adminUserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Empty until an invited admin accepts and sets their own password.
    passwordHash: { type: String, default: "" },
    role: { type: String, enum: ["super_admin", "admin", "user", "editor"], default: "admin", index: true },
    permissions: {
      type: [String],
      default: ["films", "announcements", "categories", "directors", "awards"],
    },
    status: { type: String, enum: ["invited", "active", "suspended", "deactivated"], default: "active", index: true },
    invite: {
      tokenHash: { type: String, index: true, sparse: true },
      expiresAt: { type: Date },
      sentAt: { type: Date },
      invitedBy: { type: String, default: "" },
      codeHash: { type: String, default: "" },
      codeExpiresAt: { type: Date },
      codeSentAt: { type: Date },
      codeAttempts: { type: Number, default: 0 },
    },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

type AdminUserRecord = InferSchemaType<typeof adminUserSchema>;
export const AdminUser =
  (models.AdminUser as Model<AdminUserRecord> | undefined) ??
  model<AdminUserRecord>("AdminUser", adminUserSchema);
