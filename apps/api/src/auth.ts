import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { AdminUser, type AdminPermission } from "./models/admin-user.js";
import { ActivityLog } from "./models/activity-log.js";
import { connectDatabase } from "./db.js";
import { ViewerAccount } from "./models/viewer-account.js";

const COOKIE_NAME = "sinesarili_admin";
const SESSION_SECONDS = 60 * 60 * 8;

export type SessionPayload = {
  sub: string;
  name: string;
  email: string;
  role: "super_admin" | "admin" | "user" | "editor";
  exp: number;
};

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  }
  return value;
}

export function verifyPassword(password: string, encoded: string): boolean {
  try {
    const [salt, expectedHex] = encoded.split(":");
    if (!salt || !expectedHex) return false;
    const expected = Buffer.from(expectedHex, "hex");
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function createPasswordHash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function sign(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verify(token: string): SessionPayload | null {
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;
    const expected = createHmac("sha256", secret()).update(body).digest();
    const actual = Buffer.from(signature, "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | undefined {
  const cookies = request.headers.cookie?.split(";") ?? [];
  const entry = cookies.map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined;
}

export function setSessionCookie(
  response: Response,
  admin: { id: string; name: string; email: string; role: "super_admin" | "admin" | "editor" }
) {
  const token = sign({
    sub: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  });
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_SECONDS}; SameSite=Lax${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`
  );
}

export function setViewerSessionCookie(response: Response, viewer: { id: string; name: string }) {
  const token = sign({
    sub: viewer.id,
    name: viewer.name,
    email: "",
    role: "editor",
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  });
  response.setHeader(
    "Set-Cookie",
    `sinesarili_viewer=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_SECONDS}; SameSite=Lax${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`
  );
}

export function clearSessionCookie(response: Response) {
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`
  );
}

export function clearViewerSessionCookie(response: Response) {
  response.setHeader(
    "Set-Cookie",
    `sinesarili_viewer=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`
  );
}

export function currentViewer(request: Request): SessionPayload | null {
  const token = readCookie(request, "sinesarili_viewer");
  return token ? verify(token) : null;
}

export function isViewerSessionCurrent(session: SessionPayload, account: { passwordChangedAt?: Date | null }) {
  if (!account.passwordChangedAt) return true;
  const issuedAtMs = (session.exp - SESSION_SECONDS) * 1000;
  return issuedAtMs + 1000 >= account.passwordChangedAt.getTime();
}

export function currentSession(request: Request): SessionPayload | null {
  const token = readCookie(request, COOKIE_NAME);
  return token ? verify(token) : null;
}

export async function hasFilmAccess(request: Request): Promise<boolean> {
  const { isAuthenticated } = await getViewerAccessStatus(request);
  return isAuthenticated;
}

export async function getViewerAccessStatus(request: Request): Promise<{ isSignedIn: boolean; isAuthenticated: boolean }> {
  // Only a signed-in viewer with an active CinePass can watch full films. An Admin Studio session
  // in the same browser does not count, so the public site always shows what a visitor would see.
  const viewer = currentViewer(request);
  if (!viewer) return { isSignedIn: false, isAuthenticated: false };
  await connectDatabase();
  const account = await ViewerAccount.findOne({ _id: viewer.sub }).select("subscriptionStatus passwordChangedAt").lean();
  if (!account || !isViewerSessionCurrent(viewer, account)) return { isSignedIn: false, isAuthenticated: false };
  return { isSignedIn: true, isAuthenticated: account.subscriptionStatus === "active" };
}

export async function requireAdmin(request: Request, response: Response, next: NextFunction) {
  const session = currentSession(request);
  if (!session || !["super_admin", "admin", "editor"].includes(session.role)) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    await connectDatabase();
    const activeAdmin = await AdminUser.findOne({ _id: session.sub, status: "active" })
      .select("_id name email role permissions status")
      .lean();
    if (!activeAdmin) {
      response.status(401).json({ error: "Account inactive or unauthorized" });
      return;
    }
    response.locals.admin = {
      sub: String(activeAdmin._id),
      name: activeAdmin.name,
      email: activeAdmin.email,
      role: activeAdmin.role as "super_admin" | "admin" | "editor",
      permissions: activeAdmin.permissions ?? [],
    };
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireSuperAdmin(request: Request, response: Response, next: NextFunction) {
  await requireAdmin(request, response, () => {
    const admin = response.locals.admin;
    if (admin?.role !== "super_admin") {
      response.status(403).json({ error: "Super Admin privileges required" });
      return;
    }
    next();
  });
}

export function requirePermission(permission: AdminPermission) {
  return async (request: Request, response: Response, next: NextFunction) => {
    await requireAdmin(request, response, () => {
      const admin = response.locals.admin;
      if (!admin) {
        response.status(401).json({ error: "Authentication required" });
        return;
      }
      if (admin.role === "super_admin" || admin.permissions?.includes(permission)) {
        next();
      } else {
        response.status(403).json({ error: `You do not have permission to manage ${permission}` });
      }
    });
  };
}

export async function recordActivity(
  request: Request,
  action: string,
  resourceType: "film" | "announcement" | "category" | "director" | "award" | "user" | "setting" | "session" | "bank_account" | "payment_submission",
  resourceId: string = "",
  details: Record<string, unknown> = {},
  actor?: { sub: string; name: string; email: string; role: string }
) {
  try {
    const admin = (actor ?? request.res?.locals.admin ?? currentSession(request)) as {
      sub?: string;
      name?: string;
      email?: string;
      role?: string;
    } | undefined;

    if (!admin) return;

    const ipAddress =
      (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      request.socket.remoteAddress ||
      "";

    await ActivityLog.create({
      actorId: admin.sub,
      actorName: admin.name || "Administrator",
      actorEmail: admin.email || "",
      actorRole: admin.role || "admin",
      action,
      resourceType,
      resourceId,
      details,
      ipAddress,
    });
  } catch (err) {
    console.error("Failed to record activity log:", err);
  }
}
