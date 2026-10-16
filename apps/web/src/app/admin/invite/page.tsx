"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { BrandMarks } from "@/components/brand-marks";

type Invite = { name: string; email: string; role: string; invitedBy: string };
const roleLabel = (role: string) => (role === "super_admin" ? "Super Admin" : role === "editor" ? "Editor" : "Admin");

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as { data?: Invite; error?: string; message?: string };
}

export default function AdminInvitePage() {
  const [token, setToken] = useState("");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [state, setState] = useState<"loading" | "invalid" | "start" | "code" | "done">("loading");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(value);
    if (!value) { setState("invalid"); return; }
    fetch(`/api/admin-invite/${encodeURIComponent(value)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await readJson(response);
        if (!response.ok || !result.data) { setError(result.error ?? ""); setState("invalid"); return; }
        setInvite(result.data);
        setState("start");
      })
      .catch(() => setState("invalid"));
  }, []);

  async function sendCode() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin-invite/${encodeURIComponent(token)}/send-code`, { method: "POST" });
      const result = await readJson(response);
      if (!response.ok) { setError(result.error ?? "We couldn't send the code. Please try again."); if (response.status !== 429) return; }
      else setNotice(result.message ?? "Code sent.");
      setState("code");
    } catch { setError("We couldn't send the code. Please try again."); }
    finally { setBusy(false); }
  }

  async function accept(event: FormEvent) {
    event.preventDefault();
    setError(""); setNotice("");
    if (password !== confirm) { setError("The passwords don't match."); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/admin-invite/${encodeURIComponent(token)}/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, password }) });
      const result = await readJson(response);
      if (!response.ok) { setError(result.error ?? "Your account couldn't be activated. Please try again."); return; }
      setState("done");
      window.setTimeout(() => window.location.assign("/admin"), 1200);
    } catch { setError("Your account couldn't be activated. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <main className="admin-login-screen">
      <Link className="admin-home-link" href="/">Back to website</Link>
      <section className="admin-login-card invite-card">
        <Link className="admin-brand" href="/"><BrandMarks /><span className="brand-name">SineSarili</span></Link>
        <p className="admin-kicker">Studio invitation</p>

        {state === "loading" && <h1>Checking<br /><span>your link…</span></h1>}

        {state === "invalid" && (
          <>
            <h1>Link <span>expired.</span></h1>
            <p className="admin-lead">{error || "This invitation link is invalid or has expired. Ask your Super Admin to send a new one."}</p>
            <Link className="studio-primary invite-full" href="/admin">Go to Studio sign in</Link>
          </>
        )}

        {state === "start" && invite && (
          <>
            <h1>Welcome,<br /><span>{invite.name.split(" ")[0]}.</span></h1>
            <p className="admin-lead">{invite.invitedBy ? `${invite.invitedBy} invited you` : "You're invited"} to SineSarili Studio as <strong>{roleLabel(invite.role)}</strong>.</p>
            <dl className="invite-facts"><div><dt>Email</dt><dd>{invite.email}</dd></div><div><dt>Role</dt><dd>{roleLabel(invite.role)}</dd></div></dl>
            <p className="admin-lead">First, we'll email a 6-digit code to verify it's you. Then you'll create your password.</p>
            {error && <p className="studio-message invite-error" role="alert">{error}</p>}
            <button type="button" className="studio-primary invite-full" disabled={busy} onClick={sendCode}>{busy ? "Sending code…" : "Send verification code"}</button>
          </>
        )}

        {state === "code" && invite && (
          <>
            <h1>Verify &amp;<br /><span>set password.</span></h1>
            <p className="admin-lead">Enter the code we sent to <strong>{invite.email}</strong>, then choose your password.</p>
            {notice && <p className="invite-notice" role="status">{notice}</p>}
            <form className="studio-form invite-form" onSubmit={accept}>
              <label>6-digit code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
              <label>New password <small>At least 10 characters</small><input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
              <label>Confirm password<input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
              {error && <p className="studio-message invite-error" role="alert">{error}</p>}
              <button type="submit" className="studio-primary invite-full" disabled={busy}>{busy ? "Activating…" : "Activate my account"}</button>
              <button type="button" className="invite-resend" disabled={busy} onClick={sendCode}>Send a new code</button>
            </form>
          </>
        )}

        {state === "done" && (
          <>
            <h1>You&apos;re<br /><span>all set.</span></h1>
            <p className="admin-lead">Your Studio account is active. Taking you to the dashboard…</p>
          </>
        )}
      </section>
    </main>
  );
}
