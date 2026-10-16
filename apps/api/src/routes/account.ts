import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import mongoose from "mongoose";
import { clearViewerSessionCookie, createPasswordHash, currentViewer, isViewerSessionCurrent, setViewerSessionCookie, verifyPassword } from "../auth.js";
import { Film } from "../models/film.js";
import { WatchHistory } from "../models/watch-history.js";
import { connectDatabase } from "../db.js";
import { isSmtpConfigured, sendEmailVerificationCode, sendPasswordResetEmail } from "../mailer.js";
import { PaymentSubmission } from "../models/payment-submission.js";
import { PendingRegistration } from "../models/pending-registration.js";
import { Subscription } from "../models/subscription.js";
import { ViewerAccount } from "../models/viewer-account.js";

export const accountRouter = Router();

const validEmail = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const codeExpiry = () => new Date(Date.now() + 10 * 60 * 1000);
const resendDelay = 60 * 1000;

function hashCode(email: string, code: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}

function matchesCode(email: string, code: string, expectedHash: string) {
  const actual = Buffer.from(hashCode(email, code), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function newCode() {
  return String(randomInt(100000, 1000000));
}

const EMAIL_FAILED = "We couldn't send the email right now. Please try again in a few minutes.";

async function delivered(send: () => Promise<void>) {
  try {
    await send();
    return true;
  } catch (error) {
    console.error("Email delivery failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

accountRouter.post("/", async (request, response, next) => {
  try {
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    if (name.length < 2 || name.length > 120 || !validEmail(email) || password.length < 8 || password.length > 128) {
      response.status(400).json({ error: "Enter your name, a valid email, and a password with at least 8 characters" });
      return;
    }
    if (!isSmtpConfigured()) {
      response.status(503).json({ error: "Email verification is not configured yet" });
      return;
    }

    await connectDatabase();
    if (await ViewerAccount.exists({ email })) {
      response.status(409).json({ error: "An account with this email already exists" });
      return;
    }
    const pending = await PendingRegistration.findOne({ email });
    if (pending && Date.now() - pending.sentAt.getTime() < resendDelay) {
      response.status(429).json({ error: "A verification code was sent recently. Check your email or wait a minute before requesting another." });
      return;
    }

    const code = newCode();
    await PendingRegistration.findOneAndUpdate({ email }, {
      $set: {
        name,
        passwordHash: createPasswordHash(password),
        codeHash: hashCode(email, code),
        expiresAt: codeExpiry(),
        attempts: 0,
        sentAt: new Date(),
      },
    }, { upsert: true, new: true, setDefaultsOnInsert: true });
    if (!await delivered(() => sendEmailVerificationCode(email, code))) {
      await PendingRegistration.deleteOne({ email });
      response.status(503).json({ error: EMAIL_FAILED });
      return;
    }
    response.status(202).json({ message: "A verification code was sent to your email. It expires in 10 minutes." });
  } catch (error) { next(error); }
});

accountRouter.post("/verify-email", async (request, response, next) => {
  try {
    const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const code = typeof request.body?.code === "string" ? request.body.code.trim() : "";
    if (!validEmail(email) || !/^\d{6}$/.test(code)) {
      response.status(400).json({ error: "Enter the email address and 6-digit verification code" });
      return;
    }
    await connectDatabase();
    const pending = await PendingRegistration.findOne({ email });
    if (!pending || pending.expiresAt.getTime() <= Date.now()) {
      if (pending) await pending.deleteOne();
      response.status(400).json({ error: "That code expired or is invalid. Start account creation again to get a new code." });
      return;
    }
    if (pending.attempts >= 5) {
      await pending.deleteOne();
      response.status(429).json({ error: "Too many incorrect codes. Start account creation again to get a new code." });
      return;
    }
    if (!matchesCode(email, code, pending.codeHash)) {
      pending.attempts += 1;
      if (pending.attempts >= 5) await pending.deleteOne();
      else await pending.save();
      response.status(400).json({ error: "That verification code is incorrect" });
      return;
    }

    const account = await ViewerAccount.create({ name: pending.name, email, passwordHash: pending.passwordHash });
    await pending.deleteOne();
    setViewerSessionCookie(response, { id: String(account._id), name: account.name });
    response.status(201).json({ data: { name: account.name, email: account.email } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      response.status(409).json({ error: "An account with this email already exists" });
      return;
    }
    next(error);
  }
});

accountRouter.post("/verify-email/resend", async (request, response, next) => {
  try {
    const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
    if (!validEmail(email)) {
      response.status(400).json({ error: "Enter a valid email address" });
      return;
    }
    if (!isSmtpConfigured()) {
      response.status(503).json({ error: "Email verification is not configured yet" });
      return;
    }
    await connectDatabase();
    const pending = await PendingRegistration.findOne({ email });
    if (!pending) {
      response.status(400).json({ error: "Account details expired. Start account creation again to get a new code." });
      return;
    }
    if (pending.expiresAt.getTime() > Date.now() && Date.now() - pending.sentAt.getTime() < resendDelay) {
      response.status(429).json({ error: "A verification code was sent recently. Wait a minute before requesting another." });
      return;
    }
    const code = newCode();
    pending.codeHash = hashCode(email, code);
    pending.expiresAt = codeExpiry();
    pending.attempts = 0;
    pending.sentAt = new Date();
    await pending.save();
    if (!await delivered(() => sendEmailVerificationCode(email, code))) {
      pending.sentAt = new Date(0);
      await pending.save();
      response.status(503).json({ error: EMAIL_FAILED });
      return;
    }
    response.json({ message: "A new verification code was sent. It expires in 10 minutes." });
  } catch (error) { next(error); }
});

accountRouter.post("/session", async (request, response, next) => {
  try {
    const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    if (!validEmail(email) || !password || password.length > 128) {
      response.status(400).json({ error: "Enter a valid email and password" });
      return;
    }

    await connectDatabase();
    const account = await ViewerAccount.findOne({ email }).lean();
    if (!account || !verifyPassword(password, account.passwordHash)) {
      response.status(401).json({ error: "Email or password is incorrect" });
      return;
    }
    setViewerSessionCookie(response, { id: String(account._id), name: account.name });
    response.json({ data: { name: account.name, email: account.email } });
  } catch (error) { next(error); }
});

async function signedInAccount(request: Request, response: Response) {
  response.setHeader("Cache-Control", "private, no-store");
  const viewer = currentViewer(request);
  if (!viewer || !mongoose.isValidObjectId(viewer.sub)) {
    response.status(401).json({ error: "Not signed in" });
    return null;
  }
  await connectDatabase();
  const account = await ViewerAccount.findById(viewer.sub);
  if (!account || !isViewerSessionCurrent(viewer, account)) {
    clearViewerSessionCookie(response);
    response.status(401).json({ error: "Your session ended. Please sign in again." });
    return null;
  }
  return account;
}

accountRouter.get("/me", async (request, response, next) => {
  try {
    const account = await signedInAccount(request, response);
    if (!account) return;
    response.json({
      data: {
        name: account.name,
        email: account.email,
        subscriptionPlan: account.subscriptionPlan,
        subscriptionStatus: account.subscriptionStatus,
        memberSince: account.createdAt,
      },
    });
  } catch (error) { next(error); }
});

accountRouter.delete("/session", (_request, response) => {
  clearViewerSessionCookie(response);
  response.status(204).end();
});

accountRouter.get("/subscription", async (request, response, next) => {
  try {
    const account = await signedInAccount(request, response);
    if (!account) return;
    const now = new Date();
    const [active, payments] = await Promise.all([
      Subscription.findOne({ $or: [{ viewerId: account._id }, { viewerEmail: account.email }], status: "active", expiresAt: { $gt: now } })
        .sort({ expiresAt: -1 })
        .select("plan planName amount billingCycle durationDays startedAt expiresAt")
        .lean(),
      PaymentSubmission.find({
        subscriberEmail: account.email,
        $or: [
          { status: "verified", activatedAt: { $exists: false } },
          { status: { $in: ["pending", "flagged"] }, createdAt: { $gt: new Date(now.getTime() - 30 * 86400000) } },
        ],
      })
        .sort({ createdAt: -1 })
        .select("status planName amountExpected createdAt activationEmailSentAt activationExpiresAt")
        .lean(),
    ]);
    response.json({
      data: {
        active: active && {
          plan: active.plan,
          planName: active.planName,
          amount: active.amount,
          billingCycle: active.billingCycle,
          durationDays: active.durationDays ?? (active.billingCycle === "annual" ? 365 : 30),
          startedAt: active.startedAt,
          expiresAt: active.expiresAt,
        },
        awaitingActivation: payments.filter((payment) => payment.status === "verified").map((payment) => ({
          submissionId: payment._id,
          planName: payment.planName,
          amount: payment.amountExpected,
          paidAt: payment.createdAt,
          emailSentAt: payment.activationEmailSentAt ?? null,
          expiresAt: payment.activationExpiresAt ?? null,
        })),
        inReview: payments.filter((payment) => payment.status !== "verified").map((payment) => ({
          submissionId: payment._id,
          planName: payment.planName,
          submittedAt: payment.createdAt,
        })),
      },
    });
  } catch (error) { next(error); }
});

accountRouter.get("/history", async (request, response, next) => {
  try {
    const account = await signedInAccount(request, response);
    if (!account) return;
    const entries = await WatchHistory.find({ viewerId: account._id }).sort({ lastWatchedAt: -1 }).limit(24).lean();
    const films = await Film.find({ _id: { $in: entries.map((entry) => entry.filmId) }, status: "published" })
      .select("title slug posterUrl backdropUrl contentType runtimeMinutes")
      .lean();
    const byId = new Map(films.map((film) => [String(film._id), film]));
    response.json({
      data: entries.flatMap((entry) => {
        const film = byId.get(String(entry.filmId));
        if (!film) return [];
        return [{
          slug: film.slug,
          title: film.title,
          posterUrl: film.posterUrl,
          backdropUrl: film.backdropUrl,
          contentType: film.contentType,
          episodeLabel: entry.episodeLabel,
          progressSeconds: entry.progressSeconds,
          durationSeconds: entry.durationSeconds,
          completed: entry.completed,
          lastWatchedAt: entry.lastWatchedAt,
        }];
      }).slice(0, 12),
    });
  } catch (error) { next(error); }
});

async function issueResetLink(account: InstanceType<typeof ViewerAccount>) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  account.passwordResetTokenHash = tokenHash;
  account.passwordResetCodeHash = undefined;
  account.passwordResetAttempts = 0;
  account.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  account.passwordResetSentAt = new Date();
  await account.save();
  if (await delivered(() => sendPasswordResetEmail(account.email, token))) return true;
  await ViewerAccount.updateOne({ _id: account._id, passwordResetTokenHash: tokenHash }, {
    $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1, passwordResetSentAt: 1 },
  });
  return false;
}

accountRouter.post("/password", async (request, response, next) => {
  try {
    const account = await signedInAccount(request, response);
    if (!account) return;
    if (!isSmtpConfigured()) {
      response.status(503).json({ error: "Password recovery email is not configured yet" });
      return;
    }
    if (account.passwordResetSentAt && Date.now() - account.passwordResetSentAt.getTime() < resendDelay) {
      response.status(429).json({ error: "A link was sent recently. Please wait a minute before trying again." });
      return;
    }
    if (!await issueResetLink(account)) {
      response.status(503).json({ error: EMAIL_FAILED });
      return;
    }
    response.json({ message: "Check your email for a link to create your new password. The link expires in 30 minutes." });
  } catch (error) { next(error); }
});

accountRouter.delete("/", async (request, response, next) => {
  try {
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const account = await signedInAccount(request, response);
    if (!account) return;
    if (!verifyPassword(password, account.passwordHash)) {
      response.status(400).json({ error: "That password is incorrect" });
      return;
    }
    await WatchHistory.deleteMany({ viewerId: account._id });
    await account.deleteOne();
    clearViewerSessionCookie(response);
    response.status(204).end();
  } catch (error) { next(error); }
});

accountRouter.post("/password-reset", async (request, response, next) => {
  try {
    const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
    if (!validEmail(email)) {
      response.status(400).json({ error: "Enter a valid email address" });
      return;
    }
    if (!isSmtpConfigured()) {
      response.status(503).json({ error: "Password recovery email is not configured yet" });
      return;
    }

    await connectDatabase();
    const account = await ViewerAccount.findOne({ email });
    if (account && (!account.passwordResetSentAt || Date.now() - account.passwordResetSentAt.getTime() >= resendDelay)) {
      if (!await issueResetLink(account)) {
        response.status(503).json({ error: EMAIL_FAILED });
        return;
      }
    }
    response.json({ message: "If an account exists for that email, a password reset link is on its way." });
  } catch (error) { next(error); }
});

accountRouter.post("/password-reset/confirm", async (request, response, next) => {
  try {
    const token = typeof request.body?.token === "string" ? request.body.token : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    if (token) {
      if (!/^[a-f0-9]{64}$/.test(token) || password.length < 8 || password.length > 128) {
        response.status(400).json({ error: "Use a valid reset link and a password with at least 8 characters" });
        return;
      }
      await connectDatabase();
      const account = await ViewerAccount.findOneAndUpdate({
        passwordResetTokenHash: createHash("sha256").update(token).digest("hex"),
        passwordResetExpiresAt: { $gt: new Date() },
      }, { $set: { passwordHash: createPasswordHash(password), passwordChangedAt: new Date() }, $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1, passwordResetCodeHash: 1, passwordResetAttempts: 1 } }, { new: true });
      if (!account) {
        response.status(400).json({ error: "This reset link has expired or was already used. Request a new one." });
        return;
      }
      clearViewerSessionCookie(response);
      response.json({ message: "Your password has been reset. Sign in with your new password." });
      return;
    }

    const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const code = typeof request.body?.code === "string" ? request.body.code.trim() : "";
    if (!validEmail(email) || !/^\d{6}$/.test(code) || password.length < 8 || password.length > 128) {
      response.status(400).json({ error: "Enter the email, 6-digit code, and a password with at least 8 characters" });
      return;
    }

    await connectDatabase();
    const account = await ViewerAccount.findOne({ email });
    if (!account || !account.passwordResetCodeHash || !account.passwordResetExpiresAt || account.passwordResetExpiresAt.getTime() <= Date.now()) {
      response.status(400).json({ error: "That code expired or is invalid. Request a new password reset code." });
      return;
    }
    if ((account.passwordResetAttempts ?? 0) >= 5) {
      account.passwordResetCodeHash = undefined;
      account.passwordResetExpiresAt = undefined;
      await account.save();
      response.status(429).json({ error: "Too many incorrect codes. Request a new password reset code." });
      return;
    }
    if (!matchesCode(email, code, account.passwordResetCodeHash)) {
      account.passwordResetAttempts = (account.passwordResetAttempts ?? 0) + 1;
      if (account.passwordResetAttempts >= 5) {
        account.passwordResetCodeHash = undefined;
        account.passwordResetExpiresAt = undefined;
      }
      await account.save();
      response.status(400).json({ error: "That password reset code is incorrect" });
      return;
    }

    account.passwordHash = createPasswordHash(password);
    account.passwordChangedAt = new Date();
    account.passwordResetCodeHash = undefined;
    account.passwordResetTokenHash = undefined;
    account.passwordResetExpiresAt = undefined;
    account.passwordResetAttempts = 0;
    await account.save();
    response.json({ message: "Your password has been reset. Sign in with your new password." });
  } catch (error) { next(error); }
});
