import { createHash, randomBytes } from "node:crypto";
import { PaymentSubmission } from "../models/payment-submission.js";
import { sendActivationKeyEmail, sendPaymentReceiptEmail } from "../mailer.js";

export const activationHash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function emailSubscriptionActivation(id: string, resend = false) {
  const token = randomBytes(32).toString("hex");
  const key = randomBytes(8).toString("hex").toUpperCase();
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  const submission = await PaymentSubmission.findOneAndUpdate({ _id: id, status: "verified", activatedAt: { $exists: false }, $or: [{ activationEmailSentAt: { $exists: false } }, ...(resend ? [{ activationEmailSentAt: { $lt: new Date(Date.now() - 60000) } }] : [])] }, { $set: {
    activationTokenHash: activationHash(token), activationKeyHash: activationHash(key),
    activationExpiresAt: expiresAt, activationAttempts: 0,
    activationEmailSentAt: new Date(),
  } }, { new: true });
  if (!submission) return false;
  try {
    if (!submission.receiptEmailSentAt) {
      await sendPaymentReceiptEmail(submission.subscriberEmail, {
        receiptId: String(submission._id),
        payerName: submission.subscriberName,
        plan: submission.planName,
        amount: submission.amountPaid || submission.amountExpected,
        provider: submission.bankProvider,
        reference: submission.referenceNumber,
        paidAt: submission.createdAt,
        durationDays: submission.durationDays ?? undefined,
      });
      await PaymentSubmission.updateOne({ _id: id }, { $set: { receiptEmailSentAt: new Date() } });
    }
    await sendActivationKeyEmail(submission.subscriberEmail, {
      plan: submission.planName, receiptId: String(submission._id), token, key, expiresAt,
    });
    return true;
  } catch (error) {
    await PaymentSubmission.updateOne({ _id: id, activationTokenHash: activationHash(token) }, { $unset: { activationEmailSentAt: 1, activationTokenHash: 1, activationKeyHash: 1 } });
    throw error;
  }
}
