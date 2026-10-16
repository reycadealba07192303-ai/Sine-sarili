import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import mongoose from "mongoose";
import { createPasswordHash, recordActivity, requireSuperAdmin, setSessionCookie } from "../auth.js";
import { connectDatabase } from "../db.js";
import { isSmtpConfigured, sendAdminInviteCode, sendAdminInviteEmail } from "../mailer.js";
import { ADMIN_PERMISSIONS, AdminUser } from "../models/admin-user.js";

const INVITE_DAYS = 7;
const CODE_MINUTES = 10;
const RESEND_DELAY_MS = 60 * 1000;
const MAX_INVITES = 20;
const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: [...ADMIN_PERMISSIONS],
  admin: ["films", "categories", "announcements", "directors", "awards"],
  editor: ["films"],
};

const validEmail = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
function hashCode(userId: string, code: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return createHmac("sha256", secret).update(`admin-invite:${userId}:${code}`).digest("hex");
}
function sameHash(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}
function inviteUrl(token: string) {
  const url = new URL("/admin/invite", process.env.WEB_ORIGIN?.split(",")[0]?.trim() || "http://localhost:3000");
  url.searchParams.set("token", token);
  return url.toString();
}

/** Issues a fresh one-time link for an invited admin and emails it. Returns false if the email failed. */
async function issueInvite(user: InstanceType<typeof AdminUser>, inviterName: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  user.set("invite", { tokenHash: hashToken(token), expiresAt, sentAt: new Date(), invitedBy: inviterName, codeHash: "", codeAttempts: 0 });
  await user.save();
  try {
    await sendAdminInviteEmail(user.email, { name: user.name, inviterName, role: user.role, url: inviteUrl(token), expiresAt });
    return true;
  } catch (error) {
    console.error("Admin invite email failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

// ---- Super Admin: invite, resend, revoke (mounted under /api/admin) ----
export const adminInvitesRouter = Router();

adminInvitesRouter.post("/users/invite", requireSuperAdmin, async (request, response, next) => {
  try {
    if (!isSmtpConfigured()) { response.status(503).json({ error: "Email is not configured, so invitations can't be sent yet." }); return; }
    const role = ["super_admin", "editor"].includes(request.body?.role) ? String(request.body.role) : "admin";
    const raw: unknown[] = Array.isArray(request.body?.invites) ? request.body.invites : [];
    const invites = raw
      .map((item) => ({ name: String((item as { name?: unknown })?.name ?? "").trim().slice(0, 120), email: String((item as { email?: unknown })?.email ?? "").trim().toLowerCase() }))
      .filter((item) => item.name || item.email);
    if (!invites.length) { response.status(400).json({ error: "Add at least one name and email to invite." }); return; }
    if (invites.length > MAX_INVITES) { response.status(400).json({ error: `You can invite up to ${MAX_INVITES} people at a time.` }); return; }

    await connectDatabase();
    const inviter = response.locals.admin as { sub: string; name: string };
    const seen = new Set<string>();
    const results: { name: string; email: string; status: "sent" | "resent" | "exists" | "invalid" | "duplicate" | "failed" }[] = [];

    for (const item of invites) {
      if (!item.name || !validEmail(item.email)) { results.push({ ...item, status: "invalid" }); continue; }
      if (seen.has(item.email)) { results.push({ ...item, status: "duplicate" }); continue; }
      seen.add(item.email);
      let user = await AdminUser.findOne({ email: item.email });
      if (user && user.status !== "invited") { results.push({ ...item, status: "exists" }); continue; }
      const isNew = !user;
      if (!user) user = new AdminUser({ name: item.name, email: item.email, role, permissions: ROLE_PERMISSIONS[role], status: "invited", passwordHash: "" });
      else user.set({ name: item.name, role, permissions: ROLE_PERMISSIONS[role] });
      const sent = await issueInvite(user, inviter.name);
      results.push({ ...item, status: sent ? (isNew ? "sent" : "resent") : "failed" });
      if (sent) await recordActivity(request, "user.invite", "user", String(user._id), { email: user.email, role: user.role });
    }
    response.status(201).json({ data: results });
  } catch (error) { next(error); }
});

adminInvitesRouter.post("/users/:id/resend-invite", requireSuperAdmin, async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) { response.status(404).json({ error: "Invitation not found" }); return; }
    await connectDatabase();
    const user = await AdminUser.findOne({ _id: request.params.id, status: "invited" });
    if (!user) { response.status(404).json({ error: "Invitation not found or already accepted" }); return; }
    if (user.invite?.sentAt && Date.now() - user.invite.sentAt.getTime() < RESEND_DELAY_MS) { response.status(429).json({ error: "An invitation was just sent. Wait a minute before resending." }); return; }
    const inviter = response.locals.admin as { name: string };
    if (!await issueInvite(user, inviter.name)) { response.status(503).json({ error: "We couldn't send the invitation email. Please try again." }); return; }
    await recordActivity(request, "user.invite_resend", "user", String(user._id), { email: user.email });
    response.json({ message: `Invitation resent to ${user.email}` });
  } catch (error) { next(error); }
});

adminInvitesRouter.delete("/users/:id/invite", requireSuperAdmin, async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.id)) { response.status(404).json({ error: "Invitation not found" }); return; }
    await connectDatabase();
    const user = await AdminUser.findOneAndDelete({ _id: request.params.id, status: "invited" });
    if (!user) { response.status(404).json({ error: "Invitation not found or already accepted" }); return; }
    await recordActivity(request, "user.invite_revoke", "user", String(user._id), { email: user.email });
    response.json({ message: `Invitation for ${user.email} was revoked` });
  } catch (error) { next(error); }
});

// ---- Public: the invited person opens the link, verifies by OTP, sets a password ----
export const adminInvitePublicRouter = Router();
adminInvitePublicRouter.use((_request, response, next) => { response.setHeader("Cache-Control", "no-store"); next(); });

async function invitedUser(token: unknown) {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return null;
  await connectDatabase();
  const user = await AdminUser.findOne({ "invite.tokenHash": hashToken(token), status: "invited" });
  if (!user || !user.invite?.expiresAt || user.invite.expiresAt.getTime() <= Date.now()) return null;
  return user;
}
const EXPIRED = "This invitation link is invalid or has expired. Ask your Super Admin to send a new one.";

adminInvitePublicRouter.get("/:token", async (request, response, next) => {
  try {
    const user = await invitedUser(request.params.token);
    if (!user) { response.status(404).json({ error: EXPIRED }); return; }
    response.json({ data: { name: user.name, email: user.email, role: user.role, invitedBy: user.invite?.invitedBy ?? "" } });
  } catch (error) { next(error); }
});

adminInvitePublicRouter.post("/:token/send-code", async (request, response, next) => {
  try {
    const user = await invitedUser(request.params.token);
    if (!user) { response.status(404).json({ error: EXPIRED }); return; }
    if (user.invite?.codeSentAt && Date.now() - user.invite.codeSentAt.getTime() < RESEND_DELAY_MS) {
      response.status(429).json({ error: "A code was sent recently. Check your email or wait a minute before requesting another." }); return;
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    user.set({ "invite.codeHash": hashCode(String(user._id), code), "invite.codeExpiresAt": new Date(Date.now() + CODE_MINUTES * 60 * 1000), "invite.codeSentAt": new Date(), "invite.codeAttempts": 0 });
    await user.save();
    try { await sendAdminInviteCode(user.email, code); }
    catch { response.status(503).json({ error: "We couldn't send the code right now. Please try again in a few minutes." }); return; }
    response.status(202).json({ message: `We sent a 6-digit code to ${user.email}. It expires in ${CODE_MINUTES} minutes.` });
  } catch (error) { next(error); }
});

adminInvitePublicRouter.post("/:token/accept", async (request, response, next) => {
  try {
    const code = typeof request.body?.code === "string" ? request.body.code.trim() : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    if (!/^\d{6}$/.test(code)) { response.status(400).json({ error: "Enter the 6-digit code from your email." }); return; }
    if (password.length < 10 || password.length > 128) { response.status(400).json({ error: "Your password must be 10 to 128 characters long." }); return; }
    const user = await invitedUser(request.params.token);
    if (!user) { response.status(404).json({ error: EXPIRED }); return; }
    const invite = user.invite;
    if (!invite?.codeHash || !invite.codeExpiresAt || invite.codeExpiresAt.getTime() <= Date.now()) {
      response.status(400).json({ error: "That code expired. Request a new code." }); return;
    }
    if ((invite.codeAttempts ?? 0) >= 5) { response.status(429).json({ error: "Too many incorrect codes. Request a new code." }); return; }
    if (!sameHash(hashCode(String(user._id), code), invite.codeHash)) {
      user.set("invite.codeAttempts", (invite.codeAttempts ?? 0) + 1);
      await user.save();
      response.status(400).json({ error: "That code is incorrect." }); return;
    }
    user.set({ passwordHash: createPasswordHash(password), status: "active", lastLoginAt: new Date() });
    user.set("invite", undefined);
    await user.save();
    const role = user.role as "super_admin" | "admin" | "editor";
    setSessionCookie(response, { id: String(user._id), name: user.name, email: user.email, role });
    await recordActivity(request, "user.invite_accept", "user", String(user._id), { email: user.email }, { sub: String(user._id), name: user.name, email: user.email, role });
    response.json({ data: { name: user.name, email: user.email, role } });
  } catch (error) { next(error); }
});

