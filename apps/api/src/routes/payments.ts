import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Router } from "express";
import mongoose from "mongoose";
import { currentViewer, isViewerSessionCurrent } from "../auth.js";
import { connectDatabase } from "../db.js";
import { BankAccount } from "../models/bank-account.js";
import { PaymentSubmission } from "../models/payment-submission.js";
import { Subscription } from "../models/subscription.js";
import { ViewerAccount } from "../models/viewer-account.js";
import { verifyPaymentReceipt } from "../services/receipt-verifier.js";
import { durationFor, getPlans } from "../services/plans.js";
import { ensureUploadsDirectory, uploadsDirectory } from "../uploads.js";

import { activationHash, emailSubscriptionActivation } from "../services/subscription-activation.js";

export const paymentsRouter = Router();

// Payment details and receipt submission require a current viewer account.
paymentsRouter.use(["/bank-accounts", "/upload-receipt", "/submit"], async (request, response, next) => {
  try {
    response.setHeader("Cache-Control", "private, no-store");
    const session = currentViewer(request);
    if (!session || !mongoose.isValidObjectId(session.sub)) {
      response.status(401).json({ error: "Sign in or create an account to continue with payment" });
      return;
    }
    await connectDatabase();
    const viewer = await ViewerAccount.findById(session.sub).select("passwordChangedAt");
    if (!viewer || !isViewerSessionCurrent(session, viewer)) {
      response.status(401).json({ error: "Your session ended. Please sign in again." });
      return;
    }
    next();
  } catch (error) { next(error); }
});

// ==========================================
// 1. Public Bank & E-Wallet Accounts
// ==========================================
paymentsRouter.get("/bank-accounts", async (_request, response, next) => {
  try {
    await connectDatabase();
    const accounts = await BankAccount.find({ isActive: true }).sort({ displayOrder: 1, providerName: 1 }).lean();
    response.json({ data: accounts });
  } catch (error) {
    next(error);
  }
});

paymentsRouter.get("/plans", async (_request, response, next) => {
  try {
    await connectDatabase();
    response.setHeader("Cache-Control", "no-store");
    response.json({ data: await getPlans() });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 2. Receipt Upload (Public Viewer)
// ==========================================
paymentsRouter.post("/upload-receipt", async (request, response, next) => {
  const imageTypes: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  const contentType = request.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const extension = imageTypes[contentType];
  const maxBytes = 15 * 1024 * 1024; // 15 MB
  const declaredBytes = Number(request.get("content-length") ?? 0);

  if (!extension) {
    response.status(415).json({ error: "Please upload a valid receipt screenshot (JPG, PNG, or WebP)" });
    return;
  }
  if (declaredBytes > maxBytes) {
    response.status(413).json({ error: "Receipt image must be 15 MB or smaller" });
    return;
  }

  const filename = `receipt-${randomUUID()}.${extension}`;
  const destination = `${uploadsDirectory}/${filename}`;
  let receivedBytes = 0;
  const sizeGuard = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.length;
      callback(receivedBytes > maxBytes ? Object.assign(new Error("Upload is too large"), { status: 413 }) : null, chunk);
    },
  });

  try {
    await ensureUploadsDirectory();
    await pipeline(request, sizeGuard, createWriteStream(destination, { flags: "wx" }));
    response.status(201).json({
      data: {
        url: `/uploads/${filename}`,
        size: receivedBytes,
        mimeType: contentType,
      },
    });
  } catch (error) {
    await unlink(destination).catch(() => undefined);
    next(error);
  }
});

// ==========================================
// 3. Submit Payment with Automated Verification
// ==========================================
paymentsRouter.post("/submit", async (request, response, next) => {
  try {
    await connectDatabase();
    const {
      subscriberName,
      subscriberEmail,
      subscriberPhone = "",
      plan = "standard_monthly",
      bankAccountId,
      referenceNumber,
      receiptUrl,
    } = request.body ?? {};

    if (!subscriberName || typeof subscriberName !== "string" || !subscriberName.trim()) {
      response.status(400).json({ error: "Your full name is required" });
      return;
    }
    if (!subscriberEmail || typeof subscriberEmail !== "string" || !subscriberEmail.includes("@")) {
      response.status(400).json({ error: "A valid email address is required" });
      return;
    }
    if (!referenceNumber || typeof referenceNumber !== "string" || referenceNumber.trim().length < 5) {
      response.status(400).json({ error: "Please enter the official transaction reference number from your receipt" });
      return;
    }
    if (!receiptUrl || typeof receiptUrl !== "string") {
      response.status(400).json({ error: "Proof of payment receipt screenshot is required" });
      return;
    }

    const plans = await getPlans();
    const selectedPlanMeta = plans.find((item) => item.id === plan);
    if (!selectedPlanMeta) {
      response.status(400).json({ error: "Choose a valid CinePass plan" });
      return;
    }
    const expectedAmount = selectedPlanMeta.price;

    const account = typeof bankAccountId === "string" && mongoose.isValidObjectId(bankAccountId)
      ? await BankAccount.findOne({ _id: bankAccountId, isActive: true }).lean()
      : null;
    if (!account) {
      response.status(400).json({ error: "Choose one of the listed payment accounts" });
      return;
    }

    const session = currentViewer(request);
    const viewer = session && mongoose.isValidObjectId(session.sub)
      ? await ViewerAccount.findById(session.sub).select("_id email passwordChangedAt").lean()
      : null;
    const signedInViewer = viewer && session && isViewerSessionCurrent(session, viewer) ? viewer : null;
    const email = signedInViewer?.email ?? subscriberEmail.trim().toLowerCase();

    const verification = await verifyPaymentReceipt({
      amountExpected: expectedAmount,
      referenceNumber,
      receiptUrl,
      account: { providerName: account.providerName, accountName: account.accountName, accountNumber: account.accountNumber },
    });

    const submission = await PaymentSubmission.create({
      subscriberName: subscriberName.trim(),
      subscriberEmail: email,
      subscriberPhone: String(subscriberPhone).trim(),
      viewerId: signedInViewer?._id,
      plan: selectedPlanMeta.id,
      planName: selectedPlanMeta.name,
      durationDays: selectedPlanMeta.durationDays,
      amountExpected: expectedAmount,
      amountPaid: verification.detectedAmount ?? 0,
      bankAccountId: account._id,
      bankProvider: account.providerName,
      accountNumber: account.accountNumber,
      referenceNumber: verification.reference,
      receiptUrl,
      receiptMetadata: {
        detectedAmount: verification.detectedAmount ?? undefined,
        detectedReference: verification.reading?.reference_number ?? "",
        amountMatched: verification.amountMatched,
        referenceValid: verification.referenceValid,
        heuristicScore: verification.confidenceScore,
        verificationNotes: verification.notes,
        imageHash: verification.imageHash,
        aiReading: verification.reading,
      },
      status: verification.status,
      verificationSource: "automated_system",
    });

    let activationEmailSent = false;
    if (verification.status === "verified") {
      try { await emailSubscriptionActivation(String(submission._id)); activationEmailSent = true; }
      catch { console.error("Subscription activation email delivery failed"); }
    }

    const messages = {
      verified: "Payment confirmed! We emailed your payment receipt, and your activation link and one-time key in a separate email.",
      pending: "We received your receipt. A curator will confirm it shortly, then we'll email your payment receipt and your activation key.",
      flagged: "We couldn't confirm this receipt automatically. A curator will review it — please double-check that the amount, reference number, and account match your payment.",
    };

    response.status(201).json({
      data: {
        submissionId: submission._id,
        status: submission.status,
        planName: selectedPlanMeta.name,
        activationEmailSent,
        message: verification.status === "verified" && !activationEmailSent ? "Payment verified, but email delivery failed. Use Resend activation email to try again." : messages[verification.status],
      },
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      response.status(409).json({ error: "This reference number was already submitted for verification." });
      return;
    }
    next(error);
  }
});

// ==========================================
// 4. Check Submission Status
// ==========================================
paymentsRouter.get("/status/:id", async (request, response, next) => {
  try {
    await connectDatabase();
    const session = currentViewer(request);
    const viewer = session ? await ViewerAccount.findById(session.sub) : null;
    if (!viewer || !session || !isViewerSessionCurrent(session, viewer)) { response.status(401).json({ error: "Sign in to view your payment" }); return; }
    if (!mongoose.isValidObjectId(request.params.id)) { response.status(404).json({ error: "Payment not found" }); return; }
    const submission = await PaymentSubmission.findOne({ _id: request.params.id, subscriberEmail: viewer.email }).select("status planName activationEmailSentAt activatedAt").lean();
    if (!submission) {
      response.status(404).json({ error: "Payment submission not found" });
      return;
    }
    response.json({ data: submission });
  } catch (error) {
    next(error);
  }
});


// Only the account receiving the receipt can redeem or resend an activation.
paymentsRouter.post("/activation/resend", async (request, response, next) => {
  try {
    await connectDatabase();
    const session = currentViewer(request);
    const viewer = session ? await ViewerAccount.findById(session.sub) : null;
    if (!viewer || !session || !isViewerSessionCurrent(session, viewer)) { response.status(401).json({ error: "Sign in with your payment email first" }); return; }
    const id = request.body?.submissionId;
    if (!mongoose.isValidObjectId(id)) { response.status(400).json({ error: "Enter a valid payment ID" }); return; }
    const payment = await PaymentSubmission.findOne({ _id: id, subscriberEmail: viewer.email, status: "verified", activatedAt: { $exists: false } });
    if (!payment) { response.status(404).json({ error: "No verified payment awaiting activation was found for this account." }); return; }
    if (!await emailSubscriptionActivation(String(payment._id), true)) {
      response.status(429).json({ error: "An activation email was sent recently. Please wait a minute and try again." });
      return;
    }
    response.json({ message: "A new activation email was sent. Use the latest link and key." });
  } catch (error) { next(error); }
});

paymentsRouter.post("/activate", async (request, response, next) => {
  try {
    await connectDatabase();
    const session = currentViewer(request);
    const viewer = session ? await ViewerAccount.findById(session.sub) : null;
    if (!viewer || !session || !isViewerSessionCurrent(session, viewer)) { response.status(401).json({ error: "Sign in with the email that received your receipt first" }); return; }
    const token = typeof request.body?.token === "string" ? request.body.token : "";
    const key = typeof request.body?.key === "string" ? request.body.key.replace(/[ -]/g, "").toUpperCase() : "";
    if (!/^[a-f0-9]{64}$/.test(token) || !/^[A-F0-9]{16}$/.test(key)) { response.status(400).json({ error: "Enter the 16-character key from your email and use its activation link" }); return; }
    const payment = await PaymentSubmission.findOneAndUpdate({ activationTokenHash: activationHash(token), subscriberEmail: viewer.email, status: "verified", activatedAt: { $exists: false }, activationExpiresAt: { $gt: new Date() }, activationAttempts: { $lt: 5 } }, { $inc: { activationAttempts: 1 } }, { new: true }).select("+activationKeyHash");
    if (!payment || !payment.activationKeyHash || !timingSafeEqual(Buffer.from(payment.activationKeyHash, "hex"), Buffer.from(activationHash(key), "hex"))) { response.status(400).json({ error: "Invalid, expired, or used link/key. Check your email or request a new activation email." }); return; }
    // Claiming is atomic, so a key can only be redeemed once even without a replica-set transaction.
    const claimedAt = new Date();
    const claimed = await PaymentSubmission.findOneAndUpdate(
      { _id: payment._id, activatedAt: { $exists: false }, activationTokenHash: activationHash(token) },
      { $set: { activatedAt: claimedAt } }
    );
    if (!claimed) { response.status(400).json({ error: "This activation key was already used." }); return; }
    try {
      const existing = await Subscription.findOne({ viewerEmail: viewer.email, status: "active", expiresAt: { $gt: claimedAt }, transactionReference: { $ne: payment.referenceNumber } }).sort({ expiresAt: -1 });
      const durationDays = payment.durationDays || durationFor(payment.plan);
      const cycle = durationDays >= 365 ? "annual" : "monthly";
      const expiresAt = new Date(Math.max(claimedAt.getTime(), existing?.expiresAt.getTime() ?? 0) + durationDays * 86400000);
      await Subscription.updateOne(
        { transactionReference: payment.referenceNumber },
        { $setOnInsert: { viewerId: viewer._id, viewerName: viewer.name, viewerEmail: viewer.email, plan: payment.plan, planName: payment.planName, amount: payment.amountPaid || payment.amountExpected, status: "active", billingCycle: cycle, durationDays, paymentMethod: payment.bankProvider.toLowerCase().includes("maya") ? "maya" : "gcash", transactionReference: payment.referenceNumber, startedAt: claimedAt, expiresAt } },
        { upsert: true }
      );
      await ViewerAccount.updateOne({ _id: viewer._id }, { $set: { subscriptionPlan: payment.plan, subscriptionStatus: "active", lastActiveAt: claimedAt } });
    } catch (error) {
      await PaymentSubmission.updateOne({ _id: payment._id, activatedAt: claimedAt }, { $unset: { activatedAt: 1 } });
      throw error;
    }
    await PaymentSubmission.updateOne({ _id: payment._id }, { $unset: { activationKeyHash: 1, activationTokenHash: 1 } });
    response.json({ message: "Your CinePass is active. Enjoy your next screening!" });
  } catch (error) { next(error); }
});
