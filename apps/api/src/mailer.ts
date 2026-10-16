import nodemailer from "nodemailer";

function smtpSettings() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  if (!host || !user || !password || !from) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT must be a valid port number");
  return { host, port, secure: process.env.SMTP_SECURE === "true" || port === 465, auth: { user, pass: password }, from };
}

export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM);
}

async function sendEmail(to: string, subject: string, text: string, html: string) {
  const settings = smtpSettings();
  if (!settings) throw new Error("SMTP is not configured");
  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.auth,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    await transporter.sendMail({ from: settings.from, to, subject, text, html });
  } finally {
    transporter.close();
  }
}

function codeEmailHtml(title: string, intro: string, code: string) {
  return `<div style="max-width:520px;margin:24px auto;background:#141419;color:#f3f3f5;padding:36px;border:1px solid #292930;border-radius:18px;font-family:Arial,sans-serif"><p style="color:#6366f1;letter-spacing:2px;font-size:12px">SINESARILI</p><h1 style="font-size:24px">${title}</h1><p style="color:#b9b9c2;line-height:1.6">${intro}</p><p style="display:inline-block;background:#202027;padding:16px 24px;border-radius:6px;font-size:28px;letter-spacing:8px;font-weight:bold">${code}</p><p style="color:#898994;font-size:12px">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p></div>`;
}

export function sendEmailVerificationCode(email: string, code: string) {
  return sendEmail(email, "Your SineSarili verification code", `Your SineSarili verification code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`, codeEmailHtml("Verify your email", "Enter this code on SineSarili to finish creating your account.", code));
}

export function sendPasswordResetCode(email: string, code: string) {
  return sendEmail(email, "Your SineSarili password reset code", `Your SineSarili password reset code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`, codeEmailHtml("Reset your password", "Enter this code on SineSarili to choose a new password.", code));
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const settings = smtpSettings();
  if (!settings) throw new Error("SMTP is not configured");

  const resetUrl = new URL("/signup", process.env.WEB_ORIGIN ?? "http://localhost:3000");
  resetUrl.searchParams.set("mode", "reset");
  resetUrl.searchParams.set("token", token);

  await sendEmail(email, "Reset your SineSarili password", `Use this link to choose a new password. It expires in 30 minutes.\n\n${resetUrl.toString()}\n\nIf you did not request this, you can ignore this email.`, `<div style="max-width:520px;margin:24px auto;background:#141419;color:#f3f3f5;padding:36px;border:1px solid #292930;border-radius:18px;font-family:Arial,sans-serif"><p style="color:#6366f1;letter-spacing:2px;font-size:12px">SINESARILI</p><h1 style="font-size:24px">Reset your password</h1><p style="color:#b9b9c2;line-height:1.6">Choose a new password for your SineSarili account. This link expires in 30 minutes.</p><p><a href="${resetUrl.toString()}" style="display:inline-block;background:#6366f1;color:white;padding:15px 24px;border-radius:10px;text-decoration:none">Create new password</a></p><p style="color:#898994;font-size:12px">If you did not request this, you can ignore this email.</p></div>`);
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const cardStyle = "max-width:520px;margin:24px auto;padding:36px;background:#141419;color:#f3f3f5;border:1px solid #292930;border-radius:18px;font-family:Arial,sans-serif";

export async function sendPaymentReceiptEmail(email: string, details: { receiptId: string; payerName: string; plan: string; amount: number; provider: string; reference: string; paidAt: Date; durationDays?: number }) {
  const paidOn = details.paidAt.toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long", timeStyle: "short" });
  const rows: [string, string][] = [
    ["Receipt no.", details.receiptId],
    ["Date paid", paidOn],
    ["Billed to", `${details.payerName} (${email})`],
    ["Plan", details.plan],
    ...(details.durationDays ? [["Access length", `${details.durationDays} ${details.durationDays === 1 ? "day" : "days"} from activation`] as [string, string]] : []),
    ["Payment method", details.provider],
    ["Reference no.", details.reference],
    ["Status", "Paid"],
  ];
  const text = `SineSarili payment receipt\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\nAmount paid: PHP ${details.amount.toFixed(2)}\n\nYour activation key arrives in a separate email. Keep this receipt for your records.`;
  const html = `<div style="${cardStyle}"><p style="color:#818cf8;font-size:12px;letter-spacing:3px">SINESARILI / CINEPASS</p><h1 style="font-size:24px;margin:8px 0 6px">Payment receipt</h1><p style="color:#b9b9c2;line-height:1.7;margin:0 0 22px">Thank you for supporting Filipino cinema. Your payment is confirmed.</p><table style="width:100%;border-collapse:collapse;font-size:14px">${rows.map(([label, value]) => `<tr><td style="padding:10px 0;color:#9898a4;border-bottom:1px solid #26262d">${label}</td><td style="padding:10px 0;text-align:right;border-bottom:1px solid #26262d">${escapeHtml(value)}</td></tr>`).join("")}<tr><td style="padding:16px 0 0;font-weight:bold">Amount paid</td><td style="padding:16px 0 0;text-align:right;font-size:20px;font-weight:bold;color:#818cf8">PHP ${details.amount.toFixed(2)}</td></tr></table><p style="color:#9898a4;font-size:12px;line-height:1.7;margin-top:24px">Your one-time activation key arrives in a separate email. Keep this receipt for your records.</p></div>`;
  await sendEmail(email, `Your SineSarili receipt · ${details.plan}`, text, html);
}

export async function sendActivationKeyEmail(email: string, details: { plan: string; receiptId: string; token: string; key: string; expiresAt: Date }) {
  const url = new URL("/subscribe/activate", process.env.WEB_ORIGIN ?? "http://localhost:3000");
  url.searchParams.set("token", details.token);
  url.searchParams.set("payment", details.receiptId);
  const validUntil = details.expiresAt.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long" });
  const text = `Activate your ${details.plan}\n\nOpen this link: ${url}\nOne-time key: ${details.key}\n\nSign in with this email, open the link, and enter the key. Valid until ${validUntil}. Your subscription starts when you activate it, and this key can only be used once.`;
  const html = `<div style="${cardStyle}"><p style="color:#818cf8;font-size:12px;letter-spacing:3px">SINESARILI / CINEPASS</p><h1 style="font-size:24px;margin:8px 0 6px">Your seat is ready.</h1><p style="color:#b9b9c2;line-height:1.7">Activate your <strong style="color:#f3f3f5">${escapeHtml(details.plan)}</strong> with this one-time key.</p><p style="margin:22px 0 8px;color:#9898a4;font-size:12px">YOUR ONE-TIME ACTIVATION KEY</p><p style="display:inline-block;margin:0 0 24px;padding:14px 20px;background:#0b0b10;border:1px solid #33333b;border-radius:12px;font-family:Consolas,monospace;font-size:24px;letter-spacing:4px;color:#818cf8;font-weight:bold">${details.key}</p><br><a href="${escapeHtml(url.toString())}" style="display:inline-block;padding:15px 24px;background:#6366f1;color:white;border-radius:10px;text-decoration:none;font-weight:bold">Activate my CinePass</a><p style="color:#9898a4;font-size:12px;line-height:1.7;margin-top:24px">Sign in with this email and enter the key. Valid until ${escapeHtml(validUntil)}. Your subscription begins on activation. This key can only be used once.</p></div>`;
  await sendEmail(email, `Activate your ${details.plan}`, text, html);
}

// Studio invitations use the SineSarili editorial palette (lavender, indigo, yellow).
const studioCard = "max-width:540px;margin:24px auto;padding:0;background:#ffffff;color:#1c1733;border-top:8px solid #e8bf45;font-family:Arial,sans-serif";
const roleLabel = (role: string) => (role === "super_admin" ? "Super Admin" : role === "editor" ? "Editor" : "Admin");

export async function sendAdminInviteEmail(email: string, details: { name: string; inviterName: string; role: string; url: string; expiresAt: Date }) {
  const until = details.expiresAt.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long" });
  const text = `Hi ${details.name},

${details.inviterName} invited you to SineSarili Studio as ${roleLabel(details.role)}.

Accept your invitation: ${details.url}

We will email you a 6-digit verification code, then you will create your own password. This link works until ${until} and can only be used once. If you were not expecting this, you can ignore this email.`;
  const html = `<div style="background:#e8e6ef;padding:24px 12px"><div style="${studioCard}"><div style="padding:34px 34px 30px"><p style="margin:0;color:#38634a;font-size:12px;letter-spacing:3px;font-weight:bold">SINESARILI STUDIO</p><h1 style="margin:10px 0 14px;color:#40328c;font-size:30px;line-height:1.05;text-transform:uppercase">You're invited.</h1><p style="margin:0 0 8px;line-height:1.7">Hi ${escapeHtml(details.name)},</p><p style="margin:0 0 22px;line-height:1.7"><strong>${escapeHtml(details.inviterName)}</strong> invited you to manage SineSarili as <strong style="color:#40328c">${roleLabel(details.role)}</strong>.</p><a href="${escapeHtml(details.url)}" style="display:inline-block;padding:15px 26px;background:#40328c;color:#ffffff;text-decoration:none;font-weight:bold;letter-spacing:1px;text-transform:uppercase;border-bottom:5px solid #e8bf45">Accept invitation</a><p style="margin:24px 0 0;color:#5c5870;font-size:13px;line-height:1.7">After you open the link, we'll email you a 6-digit verification code and you'll create your own password. This link works until ${escapeHtml(until)} and can only be used once.</p><p style="margin:16px 0 0;color:#8a86a0;font-size:12px">If you weren't expecting this invitation, you can ignore this email.</p></div></div></div>`;
  await sendEmail(email, `You're invited to SineSarili Studio`, text, html);
}

export async function sendAdminInviteCode(email: string, code: string) {
  const text = `Your SineSarili Studio verification code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`;
  const html = `<div style="background:#e8e6ef;padding:24px 12px"><div style="${studioCard}"><div style="padding:34px"><p style="margin:0;color:#38634a;font-size:12px;letter-spacing:3px;font-weight:bold">SINESARILI STUDIO</p><h1 style="margin:10px 0 14px;color:#40328c;font-size:28px;text-transform:uppercase">Your verification code</h1><p style="margin:0 0 18px;line-height:1.7">Enter this code to verify your email and activate your Studio account.</p><p style="display:inline-block;margin:0;padding:16px 24px;background:#e8e6ef;color:#40328c;font-family:Consolas,monospace;font-size:30px;letter-spacing:8px;font-weight:bold;border-left:6px solid #e8bf45">${code}</p><p style="margin:20px 0 0;color:#8a86a0;font-size:12px">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p></div></div></div>`;
  await sendEmail(email, "Your SineSarili Studio verification code", text, html);
}
