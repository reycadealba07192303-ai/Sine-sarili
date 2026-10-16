import { createHash } from "node:crypto";
import { PaymentSubmission } from "../models/payment-submission.js";
import { Subscription } from "../models/subscription.js";
import { readReceipt, receiptImageFromUrl, type ReceiptReading } from "./receipt-reader.js";

export type ReceiptVerificationResult = {
  status: "verified" | "pending" | "flagged";
  reference: string;
  detectedAmount: number | null;
  amountMatched: boolean;
  referenceValid: boolean;
  confidenceScore: number;
  imageHash: string;
  reading: ReceiptReading | null;
  notes: string[];
};

const MAX_RECEIPT_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 12 * 60 * 60 * 1000;

const normalizeReference = (value: string) => value.replace(/[^a-z0-9]/gi, "").toUpperCase();
const digits = (value: string) => value.replace(/\D/g, "");
const words = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(word => word.length > 1);
const peso = (value: number) => `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function recipientMatches(reading: ReceiptReading, account: { accountName: string; accountNumber: string }) {
  const expectedDigits = digits(account.accountNumber);
  const shownDigits = digits(reading.recipient_account ?? "");
  if (expectedDigits.length >= 4 && shownDigits.length >= 4 && shownDigits.slice(-4) === expectedDigits.slice(-4)) return true;

  const expectedWords = words(account.accountName);
  const shownWords = words(reading.recipient_name ?? "");
  if (!expectedWords.length || !shownWords.length) return false;
  const shared = shownWords.filter(word => expectedWords.includes(word)).length;
  return shared >= Math.min(2, expectedWords.length);
}

export async function verifyPaymentReceipt(params: {
  amountExpected: number;
  referenceNumber: string;
  receiptUrl: string;
  account: { providerName: string; accountName: string; accountNumber: string };
}): Promise<ReceiptVerificationResult> {
  const reference = normalizeReference(params.referenceNumber);
  const notes: string[] = [];
  const problems: string[] = [];
  const blockers: string[] = [];

  const image = await receiptImageFromUrl(params.receiptUrl);
  const imageHash = image ? createHash("sha256").update(image.data).digest("hex") : "";
  const base = { reference, imageHash, detectedAmount: null, amountMatched: false, referenceValid: false, reading: null };

  if (!image) {
    return { ...base, status: "flagged", confidenceScore: 0, notes: ["❌ The uploaded receipt image could not be found."] };
  }

  const [referenceUsed, imageUsed] = await Promise.all([
    Promise.all([
      PaymentSubmission.exists({ referenceNumber: reference, status: { $in: ["verified", "pending", "flagged"] } }),
      Subscription.exists({ transactionReference: reference }),
    ]).then(([submission, subscription]) => Boolean(submission || subscription)),
    PaymentSubmission.exists({ "receiptMetadata.imageHash": imageHash }),
  ]);
  if (referenceUsed) blockers.push("❌ This reference number was already used in another payment.");
  if (imageUsed) blockers.push("❌ This exact receipt image was already submitted before.");

  const result = await readReceipt(image);
  if (!result.ok) {
    return {
      ...base,
      status: blockers.length ? "flagged" : "pending",
      confidenceScore: 0,
      notes: [...blockers, `⚠️ ${result.reason} A curator will check this receipt.`],
    };
  }

  const reading = result.reading;
  const checks = { receipt: false, amount: false, reference: false, recipient: false, date: false, untouched: false };

  if (reading.is_payment_receipt && reading.transaction_status === "successful") {
    checks.receipt = true;
    notes.push(`✓ Successful ${reading.provider ?? "payment"} receipt.`);
  } else {
    problems.push(reading.is_payment_receipt ? `❌ Receipt status is "${reading.transaction_status}", not successful.` : "❌ The image does not look like a payment receipt.");
  }

  const currencyOk = !reading.currency || reading.currency.toUpperCase() === "PHP";
  if (reading.amount !== null && currencyOk && reading.amount >= params.amountExpected) {
    checks.amount = true;
    notes.push(`✓ Amount: expected ${peso(params.amountExpected)}, receipt shows ${peso(reading.amount)}.`);
  } else {
    problems.push(reading.amount === null
      ? "❌ No amount could be read from the receipt."
      : `❌ Amount: expected ${peso(params.amountExpected)}, receipt shows ${currencyOk ? peso(reading.amount) : `${reading.amount} ${reading.currency}`}.`);
  }

  const shownReference = normalizeReference(reading.reference_number ?? "");
  if (shownReference && shownReference === reference) {
    checks.reference = true;
    notes.push(`✓ Reference number matches (${reference}).`);
  } else {
    problems.push(shownReference ? `❌ Reference: entered ${reference}, receipt shows ${shownReference}.` : "❌ No reference number could be read from the receipt.");
  }

  if (recipientMatches(reading, params.account)) {
    checks.recipient = true;
    notes.push(`✓ Paid to SineSarili's ${params.account.providerName} account.`);
  } else {
    problems.push(`❌ Recipient doesn't match the ${params.account.providerName} account (receipt shows ${[reading.recipient_name, reading.recipient_account].filter(Boolean).join(" · ") || "no recipient"}).`);
  }

  const paidAt = reading.transaction_datetime ? Date.parse(reading.transaction_datetime) : NaN;
  const now = Date.now();
  if (Number.isFinite(paidAt) && paidAt <= now + FUTURE_TOLERANCE_MS && now - paidAt <= MAX_RECEIPT_AGE_MS) {
    checks.date = true;
    notes.push(`✓ Paid on ${new Date(paidAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}.`);
  } else {
    problems.push(Number.isFinite(paidAt) ? "❌ The receipt date is older than 3 days or in the future." : "❌ No transaction date could be read from the receipt.");
  }

  if (!reading.looks_edited) {
    checks.untouched = true;
  } else {
    problems.push(`❌ The image may have been edited. ${reading.observations}`.trim());
  }

  const passed = Object.values(checks).filter(Boolean).length;
  const allPassed = passed === Object.keys(checks).length && blockers.length === 0;
  const clearMismatch = blockers.length > 0 || !checks.receipt || (reading.amount !== null && !checks.amount) || reading.looks_edited;

  return {
    status: allPassed ? "verified" : clearMismatch ? "flagged" : "pending",
    reference,
    imageHash,
    detectedAmount: reading.amount,
    amountMatched: checks.amount,
    referenceValid: checks.reference,
    confidenceScore: Math.round((passed / Object.keys(checks).length) * 100),
    reading,
    notes: [...blockers, ...problems, ...notes],
  };
}
