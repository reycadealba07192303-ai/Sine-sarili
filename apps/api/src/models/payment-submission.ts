import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const paymentSubmissionSchema = new Schema(
  {
    subscriberName: { type: String, required: true, trim: true },
    subscriberEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    subscriberPhone: { type: String, default: "", trim: true },
    plan: {
      type: String,
      required: true,
      enum: ["standard_monthly", "vip_monthly", "patron_annual"],
      default: "standard_monthly",
    },
    planName: { type: String, required: true, default: "CinePass Standard" },
    durationDays: { type: Number, min: 1 },
    amountExpected: { type: Number, required: true },
    amountPaid: { type: Number, required: true },
    currency: { type: String, default: "PHP" },
    bankAccountId: { type: Schema.Types.ObjectId, ref: "BankAccount" },
    bankProvider: { type: String, default: "GCash" },
    accountNumber: { type: String, default: "" },
    referenceNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    receiptUrl: { type: String, required: true }, // Uploaded receipt image path
    receiptMetadata: {
      fileSize: { type: Number, default: 0 },
      mimeType: { type: String, default: "image/jpeg" },
      detectedAmount: { type: Number },
      detectedReference: { type: String },
      amountMatched: { type: Boolean, default: false },
      referenceValid: { type: Boolean, default: false },
      heuristicScore: { type: Number, default: 0 }, // 0 - 100
      verificationNotes: [{ type: String }],
      imageHash: { type: String, default: "", index: true },
      aiReading: { type: Schema.Types.Mixed, default: null },
    },
    activationTokenHash: { type: String, select: false, index: true },
    activationKeyHash: { type: String, select: false },
    activationExpiresAt: { type: Date },
    activationAttempts: { type: Number, default: 0 },
    activationEmailSentAt: { type: Date },
    receiptEmailSentAt: { type: Date },
    activatedAt: { type: Date },
    viewerId: { type: Schema.Types.ObjectId, ref: "ViewerAccount" },
    status: {
      type: String,
      required: true,
      enum: ["pending", "verified", "rejected", "flagged"],
      default: "pending",
      index: true,
    },
    verificationSource: {
      type: String,
      enum: ["automated_system", "admin_manual", "system_pre_validated"],
      default: "automated_system",
    },
    reviewedByAdmin: { type: String, default: "" },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

paymentSubmissionSchema.index({ createdAt: -1 });
paymentSubmissionSchema.index({ status: 1, createdAt: -1 });

type PaymentSubmissionRecord = InferSchemaType<typeof paymentSubmissionSchema>;
export const PaymentSubmission =
  (models.PaymentSubmission as Model<PaymentSubmissionRecord> | undefined) ??
  model<PaymentSubmissionRecord>("PaymentSubmission", paymentSubmissionSchema);
