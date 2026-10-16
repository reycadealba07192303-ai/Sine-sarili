import { test } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { PaymentSubmission } from "../src/models/payment-submission.js";
import { activationHash, emailSubscriptionActivation } from "../src/services/subscription-activation.js";

test("sends a receipt email and a separate activation email; stores hashes and resets failed deliveries", async t => {
  process.env.SMTP_HOST = "test.invalid";
  process.env.SMTP_USER = "test";
  process.env.SMTP_PASSWORD = "test";
  process.env.SMTP_FROM = "test@example.com";
  process.env.WEB_ORIGIN = "https://cinema.example.com";
  const mails: any[] = [];
  const updates: any[] = [];
  let claimed: any;
  let fail = false;
  let absent = false;
  let receiptAlreadySent = false;
  t.mock.method(PaymentSubmission, "findOneAndUpdate", async (filter: any, change: any) => {
    assert.equal(filter.status, "verified");
    assert.deepEqual(filter.activatedAt, { $exists: false });
    claimed = change.$set;
    if (absent) return null;
    return {
      _id: "receipt-1",
      subscriberEmail: "viewer@example.com",
      subscriberName: "Viewer",
      planName: "CinePass Standard",
      durationDays: 30,
      amountPaid: 199,
      referenceNumber: "REF12345",
      bankProvider: "GCash",
      createdAt: new Date(),
      receiptEmailSentAt: receiptAlreadySent ? new Date() : undefined,
    };
  });
  t.mock.method(PaymentSubmission, "updateOne", async (filter: any, change: any) => { updates.push({ filter, change }); });
  t.mock.method(nodemailer, "createTransport", () => ({ sendMail: async (mail: any) => { if (fail) throw new Error("SMTP unavailable"); mails.push(mail); }, close() {} }));

  await emailSubscriptionActivation("receipt-1");
  assert.equal(mails.length, 2);
  const [receipt, activation] = mails;
  assert.equal(receipt.to, "viewer@example.com");
  assert.match(receipt.text, /Amount paid: PHP 199.00/);
  assert.match(receipt.text, /Reference no\.: REF12345/);
  assert.match(receipt.text, /Access length: 30 days/);
  assert.doesNotMatch(receipt.text, /One-time key/);
  assert.ok(updates.some(update => update.change.$set?.receiptEmailSentAt instanceof Date));

  const token = activation.text.match(/token=([a-f0-9]{64})/)[1];
  const key = activation.text.match(/One-time key: ([A-F0-9]{16})/)[1];
  assert.equal(claimed.activationTokenHash, activationHash(token));
  assert.equal(claimed.activationKeyHash, activationHash(key));
  assert.ok(claimed.activationExpiresAt.getTime() > Date.now() + 6 * 86400000);

  mails.length = 0;
  receiptAlreadySent = true;
  await emailSubscriptionActivation("receipt-1", true);
  assert.equal(mails.length, 1, "a resend only sends the activation email");
  assert.match(mails[0].text, /One-time key/);

  fail = true;
  updates.length = 0;
  await assert.rejects(emailSubscriptionActivation("receipt-1"), /SMTP unavailable/);
  const cleanup = updates.find(update => update.change.$unset);
  assert.equal(cleanup.filter.activationTokenHash, claimed.activationTokenHash);
  assert.equal(cleanup.change.$unset.activationEmailSentAt, 1);

  fail = false;
  absent = true;
  mails.length = 0;
  await emailSubscriptionActivation("receipt-1");
  assert.equal(mails.length, 0, "already activated or recently sent records must not send again");
});

test("activation rejects wrong or expired credentials, consumes once, and extends by the days that were paid for", async t => {
  const mongoose = (await import("mongoose")).default;
  const { paymentsRouter } = await import("../src/routes/payments.js");
  const { ViewerAccount } = await import("../src/models/viewer-account.js");
  const { Subscription } = await import("../src/models/subscription.js");
  const { setViewerSessionCookie } = await import("../src/auth.js");
  process.env.MONGODB_URI = "mongodb://test.invalid/test";
  process.env.SESSION_SECRET = "test-secret-longer-than-thirty-two-characters";
  t.mock.method(mongoose, "connect", async () => mongoose);
  const viewer = { _id: "507f1f77bcf86cd799439011", name: "Viewer", email: "viewer@example.com" };
  t.mock.method(ViewerAccount, "findById", async () => viewer);
  const token = "a".repeat(64), key = "ABCDEF0123456789";
  const payment = { _id: "507f1f77bcf86cd799439012", activationKeyHash: activationHash(key), plan: "standard_monthly", planName: "Standard", durationDays: 45, amountPaid: 199, bankProvider: "GCash", referenceNumber: "REF12345" };
  let activated = false, expired = false, subscriptions = 0, viewerUpdates = 0, hashesCleared = 0;
  const existingEnd = new Date(Date.now() + 10 * 86400000);
  t.mock.method(PaymentSubmission, "findOneAndUpdate", (filter: any, update: any) => {
    if (update.$inc) {
      assert.equal(filter.subscriberEmail, viewer.email);
      assert.equal(filter.status, "verified");
      assert.ok(filter.activationExpiresAt.$gt instanceof Date);
      assert.equal(filter.activationAttempts.$lt, 5);
      return { select: async () => activated || expired ? null : payment };
    }
    assert.equal(filter.activationTokenHash, activationHash(token));
    assert.deepEqual(filter.activatedAt, { $exists: false });
    assert.ok(update.$set.activatedAt instanceof Date);
    if (activated) return Promise.resolve(null);
    activated = true;
    return Promise.resolve(payment);
  });
  t.mock.method(PaymentSubmission, "updateOne", async (_filter: any, change: any) => { if (change.$unset?.activationKeyHash) hashesCleared++; });
  t.mock.method(Subscription, "findOne", () => ({ sort: async () => ({ expiresAt: existingEnd }) }));
  t.mock.method(Subscription, "updateOne", async (filter: any, change: any, options: any) => {
    subscriptions++;
    assert.equal(filter.transactionReference, "REF12345");
    assert.equal(options.upsert, true);
    assert.equal(change.$setOnInsert.durationDays, 45);
    assert.equal(change.$setOnInsert.expiresAt.getTime(), existingEnd.getTime() + 45 * 86400000);
    assert.equal(change.$setOnInsert.viewerId, viewer._id);
  });
  t.mock.method(ViewerAccount, "updateOne", async () => { viewerUpdates++; });
  let cookie = "";
  setViewerSessionCookie({ setHeader: (_: string, value: string) => { cookie = value.split(";")[0]; } } as any, { id: viewer._id, name: viewer.name });
  const handler = (paymentsRouter as any).stack.find((layer: any) => layer.route?.path === "/activate").route.stack[0].handle;
  async function call(inputKey: string, authenticated = true) {
    let status = 200;
    const response = { status(value: number) { status = value; return this; }, json() {} };
    await handler({ headers: { cookie: authenticated ? cookie : "" }, body: { token, key: inputKey } }, response, (error: any) => { throw error; });
    return status;
  }
  assert.equal(await call(key, false), 401);
  assert.equal(await call("0".repeat(16)), 400);
  assert.equal(subscriptions, 0);
  expired = true;
  assert.equal(await call(key), 400);
  expired = false;
  assert.equal(await call(key), 200);
  assert.equal(subscriptions, 1);
  assert.equal(viewerUpdates, 1);
  assert.equal(hashesCleared, 1);
  assert.equal(await call(key), 400);
  assert.equal(subscriptions, 1);
});
