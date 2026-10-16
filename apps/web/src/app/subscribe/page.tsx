"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, CheckCircle2, Clock3, Copy, ImageUp, Landmark, QrCode, ShieldCheck, Wallet, X } from "lucide-react";
import { StreamingHeader } from "@/components/streaming-header";
import { EditorialFooter } from "@/components/editorial-footer";
import "./subscribe.css";

type BankAccount = {
  _id: string;
  providerName: string;
  accountType: "ewallet" | "bank_transfer" | "qr_ph";
  accountName: string;
  accountNumber: string;
  qrCodeUrl: string;
  instructions: string;
};

type PlanId = "standard_monthly" | "vip_monthly" | "patron_annual";

type Plan = { id: PlanId; name: string; price: number; durationDays: number; description: string; perks: string[]; badge: string };

async function readJson(response: Response, fallbackError: string) {
  try {
    return await response.json();
  } catch {
    return { error: fallbackError };
  }
}

const SUBMIT_UNCLEAR = "We couldn't confirm your submission. Your payment may still have gone through, so check your email for a receipt before trying again.";

const period = (plan: Plan) => `${plan.durationDays} ${plan.durationDays === 1 ? "day" : "days"}`;

function planNote(plan: Plan) {
  if (plan.durationDays > 30) return `${period(plan)} of access · about ${peso(Math.round((plan.price * 30) / plan.durationDays))} per 30 days`;
  return `${period(plan)} of access from activation`;
}

const accountIcons = { ewallet: Wallet, bank_transfer: Landmark, qr_ph: QrCode };
const accountTypeLabels = { ewallet: "E-wallet", bank_transfer: "Bank transfer", qr_ph: "QR Ph" };
const peso = (value: number) => `₱${value.toLocaleString("en-PH")}`;

export default function SubscribePage() {
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansState, setPlansState] = useState<"loading" | "ready" | "error">("loading");
  const [plan, setPlan] = useState<PlanId | null>(null);
  const checkoutRef = useRef<HTMLDivElement>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState("");
  const [copied, setCopied] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ status: string; message: string; submissionId: string } | null>(null);
  const selectedPlan = plans.find((item) => item.id === plan);
  const selectedAccount = accounts.find((account) => account._id === accountId);

  async function choosePlan(id: PlanId) {
    if (checkingAccount) return;
    setCheckingAccount(true);
    setError("");
    try {
      const response = await fetch("/api/account/me", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign(`/signup?mode=signin&returnTo=${encodeURIComponent(`/subscribe?plan=${id}`)}`);
        return;
      }
      if (!response.ok) throw new Error("Could not check your account. Please try again.");
      const { data } = await response.json() as { data: { name: string; email: string } };
      setName(data.name);
      setEmail(data.email);
      setPlan(id);
      setAccountId("");
      window.scrollTo({ top: 0, behavior: "instant" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Please try again.");
    } finally { setCheckingAccount(false); }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/payments/plans", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const { data } = await response.json() as { data: Plan[] };
        if (active) { setPlans(data); setPlansState("ready"); }
      })
      .catch(() => { if (active) setPlansState("error"); });

    fetch("/api/account/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok || !active) return;
        const { data } = await response.json() as { data: { name: string; email: string } };
        setName((current) => current || data.name);
        setEmail((current) => current || data.email);
        const requestedPlan = new URLSearchParams(window.location.search).get("plan");
        if (["standard_monthly", "vip_monthly", "patron_annual"].includes(requestedPlan ?? "")) setPlan(requestedPlan as PlanId);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!plan) return;
    let active = true;
    setLoadingAccounts(true);
    fetch("/api/payments/bank-accounts")
      .then(async (response) => {
        if (!response.ok) throw new Error("Payment options are unavailable right now.");
        return response.json() as Promise<{ data: BankAccount[] }>;
      })
      .then(({ data }) => {
        if (active) {
          setAccounts(data);

        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load payment options.");
      })
      .finally(() => {
        if (active) setLoadingAccounts(false);
      });

    return () => { active = false; };
  }, [plan]);

  useEffect(() => {
    if (!receipt) { setReceiptPreview(""); return; }
    const url = URL.createObjectURL(receipt);
    setReceiptPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [receipt]);

  async function copyAccountNumber() {
    if (!selectedAccount) return;
    try {
      await navigator.clipboard.writeText(selectedAccount.accountNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);

    if (!selectedPlan) {
      setError("Choose a CinePass plan first.");
      return;
    }
    if (!selectedAccount) {
      setError("Choose an available payment account before continuing.");
      return;
    }
    if (!receipt) {
      setError("Upload a screenshot of your payment receipt.");
      return;
    }

    setSubmitting(true);
    try {
      const uploadResponse = await fetch("/api/payments/upload-receipt", {
        method: "POST",
        headers: { "Content-Type": receipt.type },
        body: receipt,
      });
      const uploadData = await readJson(uploadResponse, "The receipt upload failed. Please try again.");
      if (!uploadResponse.ok) throw new Error(uploadData.error || "Could not upload the receipt.");

      const response = await fetch("/api/payments/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriberName: name,
          subscriberEmail: email,
          subscriberPhone: phone,
          plan,
          bankAccountId: selectedAccount._id,
          referenceNumber: reference,
          receiptUrl: uploadData.data.url,
        }),
      });
      const data = await readJson(response, SUBMIT_UNCLEAR);
      if (!response.ok) throw new Error(data.error || "Could not submit your payment.");
      setResult({
        status: data.data.status,
        message: data.data.message,
        submissionId: data.data.submissionId,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong while submitting your payment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={`pass-page ed-page${selectedPlan && !result ? " is-checkout" : ""}`}>
      <StreamingHeader active="subscribe" />

      <section className="pass-hero">
        <p className="pass-kicker">CINEPASS</p>
        <h1>Make room for<br /><span>Filipino cinema.</span></h1>
        <p className="pass-lead">One pass for every film and every episode. Pick a plan, send your payment, upload your receipt, then activate your pass with the key in your email.</p>
        {!result && <ol className="pass-steps" aria-label="How it works">
          <li><span>1</span>Choose a plan</li>
          <li><span>2</span>Choose a payment method</li>
          <li><span>3</span>Confirm your payment</li>
          <li><span>4</span>Activate by email</li>
        </ol>}
      </section>

      {result ? (
        <section className={`pass-success${result.status === "verified" ? "" : " is-review"}`} aria-live="polite">
          <span className="pass-success-icon" aria-hidden="true">{result.status === "verified" ? <CheckCircle2 size={34} /> : <Clock3 size={32} />}</span>
          <p className="pass-kicker">{result.status === "verified" ? "PAYMENT CONFIRMED" : "UNDER REVIEW"}</p>
          <h2>{result.status === "verified" ? "Your receipt is ready." : "Thanks — we're checking your receipt."}</h2>
          <p>{result.message}</p>
          <p className="pass-success-ref">Reference ID · <strong>{result.submissionId}</strong></p>
          <div className="pass-success-actions">
            {result.status === "verified" && <button type="button" className="pass-primary" disabled={submitting} onClick={async () => {
              setSubmitting(true); setError("");
              try {
                const response = await fetch("/api/payments/activation/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submissionId: result.submissionId }) });
                const data = await readJson(response, "Could not resend the email. Please try again.");
                if (!response.ok) throw new Error(data.error);
                setResult({ ...result, message: data.message });
              } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not resend email"); }
              finally { setSubmitting(false); }
            }}>Resend activation email</button>}
            {error && <p role="alert" className="pass-error">{error}</p>}
            <Link className="pass-primary" href="/films">{result.status === "verified" ? "Browse films" : "Browse films"}</Link>
            {result.status !== "verified" && <button type="button" className="pass-ghost" onClick={() => setResult(null)}>Submit a different receipt</button>}
          </div>
        </section>
      ) : (
        <div className="pass-body">
          {!selectedPlan && <section aria-labelledby="plans-heading">
            <h2 id="plans-heading" className="pass-section-title"><span>1</span>Choose your plan</h2>
            {plansState === "loading" ? (
              <div className="pass-plans" aria-busy="true">{[0, 1, 2].map((key) => <span key={key} className="pass-plan pass-skeleton pass-plan-skeleton" />)}</div>
            ) : plansState === "error" ? (
              <p className="pass-empty">CinePass plans couldn't load. Refresh the page to try again.</p>
            ) : (
              <div className="pass-plans" role="radiogroup" aria-labelledby="plans-heading">
                {plans.map((item) => {
                  const active = plan === item.id;
                  return (
                    <label key={item.id} className={`pass-plan${active ? " is-active" : ""}`}>
                      <input className="sr-only" type="radio" name="plan" value={item.id} checked={active} disabled={checkingAccount} onChange={() => choosePlan(item.id)} />
                      {item.badge && <span className="pass-plan-badge">{item.badge}</span>}
                      <span className="pass-plan-head">
                        <strong>{item.name}</strong>
                        <span className="pass-plan-check" aria-hidden="true">{active && <Check size={14} strokeWidth={3} />}</span>
                      </span>
                      <span className="pass-plan-price"><b>{peso(item.price)}</b>/{period(item)}</span>
                      <span className="pass-plan-note">{planNote(item)}</span>
                      {item.description && <span className="pass-plan-desc">{item.description}</span>}
                      {item.perks.length > 0 && <ul>{item.perks.map((perk) => <li key={perk}><Check size={14} aria-hidden="true" />{perk}</li>)}</ul>}
                      <span className="pass-plan-cta">{checkingAccount ? "Checking account..." : active ? "Selected" : `Choose ${item.name}`}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {plansState === "ready" && !selectedPlan && <p className="pass-hint">Choose a plan to see where to send your payment.</p>}
            {error && <p className="pass-error" role="alert">{error}</p>}
          </section>}

          {selectedPlan && <div className="pass-checkout" ref={checkoutRef}>
            <div className="pass-checkout-heading"><button type="button" className="pass-back" onClick={() => { setPlan(null); setAccountId(""); }}>Back to plans</button><p className="pass-kicker">YOUR NEXT SCREENING</p><h2>How would you like to pay?</h2><p>{selectedPlan.name} <span>/</span> {peso(selectedPlan.price)} for {period(selectedPlan)}</p></div>
            <section className="pass-panel" aria-labelledby="pay-heading">
              <h2 id="pay-heading" className="pass-section-title"><span>2</span>Choose a payment method</h2>
              <p className="pass-panel-lead">Send exactly <strong>{peso(selectedPlan.price)}</strong> after choosing a payment method below.</p>
              {loadingAccounts ? (
                <div className="pass-accounts" aria-busy="true">{[0, 1].map((key) => <span key={key} className="pass-account pass-skeleton" />)}</div>
              ) : accounts.length === 0 ? (
                <p className="pass-empty">No payment accounts are available right now. Please check back later.</p>
              ) : (
                <>
                  <div className="pass-accounts" role="radiogroup" aria-label="Payment account">
                    {accounts.map((account) => {
                      const Icon = accountIcons[account.accountType] ?? Wallet;
                      const active = account._id === accountId;
                      return (
                        <label key={account._id} className={`pass-account${active ? " is-active" : ""}`}>
                          <input className="sr-only" type="radio" name="payment-account" value={account._id} checked={active} onChange={() => setAccountId(account._id)} />
                          <span className="pass-account-icon" aria-hidden="true"><Icon size={18} /></span>
                          <span><strong>{account.providerName}</strong><small>{accountTypeLabels[account.accountType] ?? "Payment"}</small></span>
                        </label>
                      );
                    })}
                  </div>
                  {selectedAccount && (
                    <div className="pass-account-details">
                      <div className="pass-account-lines">
                        <span>Account name</span>
                        <strong>{selectedAccount.accountName}</strong>
                        <span>Account number</span>
                        <div className="pass-copy-row">
                          <code>{selectedAccount.accountNumber}</code>
                          <button type="button" onClick={copyAccountNumber} aria-label="Copy account number">{copied ? <><Check size={14} />Copied</> : <><Copy size={14} />Copy</>}</button>
                        </div>
                        {selectedAccount.instructions && <p className="pass-instructions">{selectedAccount.instructions}</p>}
                      </div>
                      {selectedAccount.qrCodeUrl && <img src={selectedAccount.qrCodeUrl} alt={`${selectedAccount.providerName} payment QR code`} className="pass-qr" />}
                    </div>
                  )}
                </>
              )}
            </section>

            {selectedAccount ? <form onSubmit={submitPayment} className="pass-panel pass-form" aria-labelledby="receipt-heading">
              <h2 id="receipt-heading" className="pass-section-title"><span>3</span>Confirm your payment</h2>
              <div className="pass-summary">
                <div><span>Plan</span><strong>{selectedPlan.name}</strong></div>
                <div><span>Total</span><strong>{peso(selectedPlan.price)}<small>/{period(selectedPlan)}</small></strong></div>
              </div>

              <div className="pass-fields">
                <label>Full name<input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>
                <label>Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                <label><span>Phone number <em>(optional)</em></span><input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
                <label>Reference number<input required minLength={5} value={reference} placeholder="From your payment receipt" onChange={(event) => setReference(event.target.value)} /></label>
              </div>

              <label className={`pass-dropzone${receipt ? " has-file" : ""}`}>
                <input key={receipt ? "selected" : "empty"} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setReceipt(event.target.files?.[0] ?? null)} />
                {receipt && receiptPreview ? (
                  <>
                    <img src={receiptPreview} alt="Receipt preview" />
                    <span className="pass-dropzone-copy"><strong>{receipt.name}</strong><small>Tap to choose a different screenshot</small></span>
                    <button type="button" className="pass-dropzone-clear" aria-label="Remove receipt" onClick={(event) => { event.preventDefault(); setReceipt(null); }}><X size={16} /></button>
                  </>
                ) : (
                  <>
                    <span className="pass-dropzone-icon" aria-hidden="true"><ImageUp size={22} /></span>
                    <span className="pass-dropzone-copy"><strong>Upload receipt screenshot</strong><small>JPG, PNG, or WebP · up to 15 MB</small></span>
                  </>
                )}
              </label>

              {error && <p role="alert" className="pass-error">{error}</p>}
              <button type="submit" className="pass-primary pass-submit" disabled={submitting || loadingAccounts || accounts.length === 0}>
                {submitting ? "Checking your receipt… this can take up to a minute" : `Submit ${peso(selectedPlan.price)} payment`}
              </button>
              <p className="pass-secure"><ShieldCheck size={14} aria-hidden="true" />We read your receipt automatically. If everything matches, we email your payment receipt, then your one-time activation key in a separate email.</p>
              <p className="pass-secure pass-disclosure">Your receipt is checked by a third-party AI service (via OpenRouter), and the AI provider may use it to improve its models.</p>
            </form> : <aside className="pass-order"><ShieldCheck size={30} /><p className="pass-kicker">YOUR CINEPASS</p><h3>{selectedPlan.name}</h3><strong>{peso(selectedPlan.price)}<small>/{period(selectedPlan)}</small></strong><ul><li>Choose your payment method</li><li>Send payment and upload your receipt</li><li>Receive your payment receipt and a separate activation email</li><li>Open the link and activate your pass</li></ul><p>Your subscription starts when you activate it.</p></aside>}
          </div>}
        </div>
      )}

      <EditorialFooter />
    </main>
  );
}
