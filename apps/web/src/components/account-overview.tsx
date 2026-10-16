"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Clapperboard, KeyRound, LogOut, Mail, CheckCircle2, Play, ShieldAlert, Sparkles } from "lucide-react";
import { planLabel, type Viewer } from "@/components/header-account";

type HistoryItem = {
  slug: string;
  title: string;
  posterUrl?: string;
  backdropUrl?: string;
  contentType?: "film" | "series";
  episodeLabel?: string;
  progressSeconds: number;
  durationSeconds: number;
  completed: boolean;
  lastWatchedAt: string;
};

const HELP = [
  { question: "How do I watch full films and series?", answer: "Full titles and every episode unlock with an active CinePass. Without one, you can still watch official teasers." },
  { question: "How long does payment verification take?", answer: "Receipts that match your payment are approved right away. Anything unclear goes to a curator for a quick check." },
  { question: "I forgot my password.", answer: "Sign out, choose Sign in, then Forgot password. We'll email you a secure link to create a new password." },
];

async function readResult(response: Response): Promise<{ error?: string; message?: string }> {
  try { return await response.json(); } catch { return response.ok ? {} : { error: "Something went wrong. Please try again." }; }
}

type PassState = {
  active: { planName: string; amount: number; durationDays: number; startedAt: string; expiresAt: string } | null;
  awaitingActivation: { submissionId: string; planName: string; amount: number; paidAt: string; emailSentAt: string | null; expiresAt: string | null }[];
  inReview: { submissionId: string; planName: string; submittedAt: string }[];
};

const longDate = (value: string) => new Date(value).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });

function CinePassCard({ email }: { email: string }) {
  const [pass, setPass] = useState<PassState | null>(null);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/account/subscription", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error();
        setPass((await response.json() as { data: PassState }).data);
      })
      .catch(() => setFailed(true));
  }, []);

  async function resend(submissionId: string) {
    setSending(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/payments/activation/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submissionId }) });
      const result = await readResult(response);
      if (!response.ok) throw new Error(result.error ?? "Could not resend the email.");
      setNotice(result.message ?? "A new activation email was sent.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not resend the email.");
    } finally {
      setSending(false);
    }
  }

  const waiting = pass?.awaitingActivation[0];
  const reviewing = pass?.inReview[0];
  const daysLeft = pass?.active ? Math.max(0, Math.ceil((Date.parse(pass.active.expiresAt) - Date.now()) / 86400000)) : 0;

  return (
    <section className="acct-card acct-pass" aria-labelledby="pass-title">
      <div className="acct-card-head"><h2 id="pass-title"><Sparkles size={17} aria-hidden="true" />CinePass</h2></div>
      {!pass ? (
        <p className="acct-muted" role="status">{failed ? "Your CinePass details couldn't load. Refresh to try again." : "Loading your CinePass…"}</p>
      ) : (
        <>
          {pass.active ? (
            <>
              <p className="acct-strong">{pass.active.planName} <span className="acct-status is-active">Active</span></p>
              <p className="acct-muted">₱{pass.active.amount.toLocaleString("en-PH")} · {pass.active.durationDays} {pass.active.durationDays === 1 ? "day" : "days"} of access</p>
              <dl className="acct-pass-dates">
                <div><dt>Started</dt><dd>{longDate(pass.active.startedAt)}</dd></div>
                <div><dt>Active until</dt><dd>{longDate(pass.active.expiresAt)}</dd></div>
              </dl>
              <p className="acct-muted">{daysLeft} {daysLeft === 1 ? "day" : "days"} left. Full films and every episode are unlocked.</p>
            </>
          ) : waiting ? (
            <>
              <p className="acct-strong">{waiting.planName} <span className="acct-status is-waiting">Paid · Waiting for activation</span></p>
              <p className="acct-muted">Your payment of ₱{waiting.amount.toLocaleString("en-PH")} is confirmed. Open the activation link we emailed to <strong>{email}</strong> and enter your one-time key to start your pass.</p>
              {waiting.expiresAt && <p className="acct-muted">Key valid until {longDate(waiting.expiresAt)}.</p>}
            </>
          ) : reviewing ? (
            <>
              <p className="acct-strong">{reviewing.planName} <span className="acct-status is-review">Under review</span></p>
              <p className="acct-muted">We're checking your receipt from {longDate(reviewing.submittedAt)}. Once it's approved, we'll email your receipt and activation key.</p>
            </>
          ) : (
            <>
              <p className="acct-strong">No active CinePass</p>
              <p className="acct-muted">Subscribe to watch full films and every episode of our series.</p>
            </>
          )}

          {pass.active && waiting && <p className="acct-muted acct-pass-extra">Another {waiting.planName} payment is waiting for activation. It will extend your pass once activated.</p>}
          {notice && <p className="acct-notice" role="status">{notice}</p>}
          {error && <p className="acct-error" role="alert">{error}</p>}

          <div className="acct-form-actions acct-pass-actions">
            {waiting && <button type="button" className={pass.active ? "acct-secondary" : "acct-primary"} disabled={sending} onClick={() => resend(waiting.submissionId)}><Mail size={15} aria-hidden="true" />{sending ? "Sending…" : "Resend activation email"}</button>}
            {!pass.active && !waiting && !reviewing && <Link className="acct-primary" href="/subscribe">Get CinePass</Link>}
            {pass.active && <Link className="acct-secondary" href="/subscribe">View plans</Link>}
          </div>
        </>
      )}
    </section>
  );
}

function watchedAgo(value: string) {
  const minutes = Math.round((Date.now() - Date.parse(value)) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 60) return "Watched just now";
  if (minutes < 1440) return `Watched ${Math.round(minutes / 60)}h ago`;
  const days = Math.round(minutes / 1440);
  return days < 7 ? `Watched ${days}d ago` : `Watched ${new Date(value).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`;
}

export function AccountOverview() {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [state, setState] = useState<"loading" | "guest" | "ready">("loading");

  useEffect(() => {
    fetch("/api/account/me", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) { setState("guest"); return; }
        setViewer((await response.json() as { data: Viewer }).data);
        setState("ready");
        const historyResponse = await fetch("/api/account/history", { cache: "no-store" });
        setHistory(historyResponse.ok ? (await historyResponse.json() as { data: HistoryItem[] }).data : []);
      })
      .catch(() => setState("guest"));
  }, []);

  async function signOut() {
    await fetch("/api/account/session", { method: "DELETE" }).catch(() => undefined);
    window.location.assign("/");
  }

  if (state === "loading") return <section className="acct"><p className="acct-muted" role="status">Loading your account…</p></section>;
  if (state === "guest" || !viewer) return (
    <section className="acct acct-guest">
      <p className="acct-kicker">YOUR ACCOUNT</p>
      <h1>Sign in to see your account.</h1>
      <Link className="acct-primary" href="/signup?mode=signin">Sign in</Link>
    </section>
  );

  const subscribed = viewer.subscriptionStatus === "active";
  const memberSince = viewer.memberSince ? new Date(viewer.memberSince).toLocaleDateString("en-PH", { month: "long", year: "numeric" }) : "";

  return (
    <section className="acct">
      <header className="acct-hero">
        <span className="acct-avatar" aria-hidden="true">{viewer.name.trim().charAt(0).toUpperCase() || "S"}</span>
        <div className="acct-hero-copy">
          <p className="acct-kicker">YOUR ACCOUNT</p>
          <h1>{viewer.name}</h1>
          <p className="acct-muted">{viewer.email}{memberSince && <> · Member since {memberSince}</>}</p>
        </div>
        <span className={`acct-plan-pill${subscribed ? " is-active" : ""}`}>{subscribed ? <Sparkles size={14} aria-hidden="true" /> : null}{planLabel(viewer)}</span>
      </header>

      <section className="acct-card" aria-labelledby="history-title">
        <div className="acct-card-head">
          <h2 id="history-title"><Clapperboard size={17} aria-hidden="true" />Recently watched</h2>
          {history && history.length > 0 && <Link href="/films" className="acct-link">Browse films</Link>}
        </div>
        {history === null ? (
          <div className="acct-rail" aria-busy="true">{[0, 1, 2, 3].map(key => <span key={key} className="acct-watch acct-skeleton" />)}</div>
        ) : history.length === 0 ? (
          <div className="acct-empty">
            <p>Nothing here yet. Films and episodes you watch will show up here so you can jump back in.</p>
            <Link className="acct-primary" href="/films">Find something to watch</Link>
          </div>
        ) : (
          <ul className="acct-rail">
            {history.map(item => {
              const percent = item.completed ? 100 : item.durationSeconds > 0 ? Math.min(100, Math.round((item.progressSeconds / item.durationSeconds) * 100)) : 0;
              return (
                <li key={item.slug}>
                  <Link className="acct-watch" href={`/films/${item.slug}`}>
                    <span className="acct-watch-art">
                      {item.backdropUrl || item.posterUrl ? <img src={item.backdropUrl || item.posterUrl} alt="" loading="lazy" /> : null}
                      <span className="acct-watch-play" aria-hidden="true"><Play size={18} fill="currentColor" /></span>
                      {percent > 0 && <span className="acct-watch-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>}
                    </span>
                    <strong>{item.title}</strong>
                    <small>{item.episodeLabel || (item.completed ? "Finished" : percent > 0 ? `${percent}% watched` : "Started")}</small>
                    <small className="acct-watch-time">{watchedAgo(item.lastWatchedAt)}</small>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="acct-grid">
        <CinePassCard email={viewer.email} />

        <ChangePassword email={viewer.email} />
      </div>

      <section className="acct-card" id="help" aria-labelledby="help-title">
        <div className="acct-card-head"><h2 id="help-title">Help Center</h2></div>
        {HELP.map(item => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}
      </section>

      <DeleteAccount />

      <button type="button" className="acct-signout" onClick={signOut}><LogOut size={16} aria-hidden="true" />Sign out of SineSarili</button>
    </section>
  );
}

function ChangePassword({ email }: { email: string }) {
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));

  async function sendLink() {
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/account/password", { method: "POST" });
      const result = await readResult(response);
      if (!response.ok) throw new Error(result.error ?? "Could not send your reset link.");
      setSent(true);
      setNow(Date.now());
      setRetryAt(Date.now() + 60000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send your reset link.");
    } finally { setSaving(false); }
  }

  return (
    <section className="acct-card acct-security" aria-labelledby="security-title">
      <div className="acct-card-head"><h2 id="security-title"><KeyRound size={17} aria-hidden="true" />Security</h2><span className="acct-security-badge">SECURE RESET</span></div>
      <span className="acct-security-icon" aria-hidden="true">{sent ? <CheckCircle2 size={24} /> : <Mail size={24} />}</span>
      <p className="acct-strong">{sent ? "Check your inbox" : "A fresh password, one email away."}</p>
      <p className="acct-muted">{sent ? <>We sent a secure link to <strong>{email}</strong>. Open it to create your new password.</> : <>We will send a secure link to <strong>{email}</strong> so you can create a new password.</>}</p>
      {sent && <p className="acct-security-hint" role="status">Link sent - Valid for 30 minutes. Cannot find it? Check your spam folder.</p>}
      {error && <p className="acct-error" role="alert">{error}</p>}
      <button type="button" className="acct-primary" onClick={sendLink} disabled={saving || remaining > 0}><Mail size={15} aria-hidden="true" />{saving ? "Sending link..." : remaining > 0 ? `Resend in ${remaining}s` : sent ? "Send another link" : "Email password reset link"}</button>
      <p className="acct-security-footnote">After resetting, sign in again on your devices.</p>
    </section>
  );
}

function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setDeleting(true);
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: new FormData(event.currentTarget).get("password") }),
      });
      if (!response.ok) throw new Error((await readResult(response)).error ?? "Could not delete your account.");
      window.location.assign("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete your account.");
      setDeleting(false);
    }
  }

  return (
    <section className="acct-card acct-danger" aria-labelledby="danger-title">
      <div className="acct-card-head"><h2 id="danger-title"><ShieldAlert size={17} aria-hidden="true" />Delete account</h2></div>
      <p className="acct-muted">Permanently removes your profile and watch history. This can't be undone. Payment records are kept for accounting.</p>
      {open ? (
        <form className="acct-form" onSubmit={submit}>
          <label>Enter your password to confirm<input name="password" type="password" autoComplete="current-password" required maxLength={128} /></label>
          <label className="acct-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I understand my account will be permanently deleted.</label>
          {error && <p className="acct-error" role="alert">{error}</p>}
          <div className="acct-form-actions">
            <button type="submit" className="acct-danger-button" disabled={!confirmed || deleting}>{deleting ? "Deleting…" : "Delete my account"}</button>
            <button type="button" className="acct-secondary" onClick={() => { setOpen(false); setConfirmed(false); setError(""); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className="acct-danger-button acct-danger-ghost" onClick={() => setOpen(true)}>Delete account</button>
      )}
    </section>
  );
}
