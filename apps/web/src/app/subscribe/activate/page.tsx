"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { KeyRound, CheckCircle2 } from "lucide-react";
import { StreamingHeader } from "@/components/streaming-header";
import "../subscribe.css";

export default function ActivatePage() {
  const [token, setToken] = useState("");
  const [payment, setPayment] = useState("");
  const [notice, setNotice] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [checked, setChecked] = useState(false);
  const [email, setEmail] = useState("");
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
    setPayment(new URLSearchParams(window.location.search).get("payment") ?? "");
    fetch("/api/account/me", { cache: "no-store" }).then(async response => {
      if (response.ok) { const result = await response.json(); setEmail(result.data.email); setSignedIn(true); }
    }).catch(() => undefined).finally(() => setChecked(true));
  }, []);
  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/payments/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, key }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not activate your pass");
      setComplete(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Please try again"); }
    finally { setSaving(false); }
  }
  return <main className="pass-page ed-page"><StreamingHeader active="subscribe" /><section className="activation-panel">
    {complete ? <CheckCircle2 size={36} /> : <KeyRound size={36} />}
    <p className="pass-kicker">CINEPASS / ACTIVATION</p>
    <h1>{complete ? "Let the stories begin." : "Your seat is waiting."}</h1>
    <p>{complete ? "Your CinePass is active. Your subscription begins today." : "Enter the one-time key from your activation email to unlock your CinePass."}</p>
    {complete ? <Link href="/films" className="pass-primary">Start watching</Link> : !checked ? <p role="status">Checking your account...</p> : !token ? <p role="alert">Open the activation link in your receipt email to continue.</p> : !signedIn ? <><p>Sign in with the email that received the receipt, then return to this link.</p><Link href={`/signup?mode=signin&returnTo=${encodeURIComponent(`/subscribe/activate?token=${token}&payment=${payment}`)}`} className="pass-primary">Sign in to activate</Link></> : <form onSubmit={activate}>
      <p>Activating for <strong>{email}</strong></p>
      <label>One-time activation key<input required autoComplete="off" spellCheck={false} maxLength={24} placeholder="Enter your 16-character key" value={key} onChange={event => setKey(event.target.value.toUpperCase())} /></label>
      {error && <p className="pass-error" role="alert">{error}</p>}
      <button className="pass-primary" disabled={saving}>{saving ? "Activating..." : "Activate my CinePass"}</button>
      {notice && <p role="status">{notice}</p>}
      {payment && <button type="button" className="pass-ghost" disabled={saving} onClick={async () => {
        setSaving(true); setError(""); setNotice("");
        try {
          const response = await fetch("/api/payments/activation/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submissionId: payment }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          setNotice(result.message);
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not resend email"); }
        finally { setSaving(false); }
      }}>Send a new activation email</button>}
      <p>Valid for 7 days. Each key can be used once. Use the latest email if you requested a new key.</p>
    </form>}
  </section></main>;
}
