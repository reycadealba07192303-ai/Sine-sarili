import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const subscriptionSchema = new Schema(
  {
    viewerId: { type: Schema.Types.ObjectId, ref: "ViewerAccount", index: true },
    viewerName: { type: String, required: true, trim: true },
    viewerEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    plan: {
      type: String,
      required: true,
      enum: ["standard_monthly", "vip_monthly", "patron_annual"],
      default: "standard_monthly",
    },
    planName: { type: String, required: true, default: "CinePass Standard" },
    amount: { type: Number, required: true }, // in PHP
    currency: { type: String, default: "PHP" },
    status: {
      type: String,
      required: true,
      enum: ["active", "cancelled", "past_due", "expired"],
      default: "active",
      index: true,
    },
    billingCycle: {
      type: String,
      enum: ["monthly", "annual"],
      default: "monthly",
    },
    durationDays: { type: Number, min: 1 },
    paymentMethod: {
      type: String,
      enum: ["gcash", "maya", "card", "grabpay"],
      default: "gcash",
    },
    transactionReference: { type: String, required: true, unique: true },
    startedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

subscriptionSchema.index({ createdAt: -1 });
subscriptionSchema.index({ status: 1, createdAt: -1 });
subscriptionSchema.index({ plan: 1 });

type SubscriptionRecord = InferSchemaType<typeof subscriptionSchema>;
export const Subscription =
  (models.Subscription as Model<SubscriptionRecord> | undefined) ??
  model<SubscriptionRecord>("Subscription", subscriptionSchema);

