import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const bankAccountSchema = new Schema(
  {
    providerName: { type: String, required: true, trim: true }, // e.g. "GCash", "Maya", "BDO Unibank", "BPI", "UnionBank"
    accountType: {
      type: String,
      required: true,
      enum: ["ewallet", "bank_transfer", "qr_ph"],
      default: "ewallet",
    },
    accountName: { type: String, required: true, trim: true }, // e.g. "SineSarili Digital Cinema Inc."
    accountNumber: { type: String, required: true, trim: true }, // e.g. "0917 123 4567" or "0012 3456 7890"
    qrCodeUrl: { type: String, default: "" }, // Uploaded QR Code image path
    instructions: {
      type: String,
      default: "Please transfer the exact amount and save a screenshot of the official payment confirmation with visible Reference Number.",
    },
    isActive: { type: Boolean, default: true, index: true },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

bankAccountSchema.index({ isActive: 1, displayOrder: 1 });

type BankAccountRecord = InferSchemaType<typeof bankAccountSchema>;
export const BankAccount =
  (models.BankAccount as Model<BankAccountRecord> | undefined) ??
  model<BankAccountRecord>("BankAccount", bankAccountSchema);

