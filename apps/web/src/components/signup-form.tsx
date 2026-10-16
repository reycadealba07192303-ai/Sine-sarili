"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { BrandMarks } from "@/components/brand-marks";
import { FilmPoster } from "@/components/film-poster";
import type { Film } from "@/lib/film-types";
import "@/app/auth-editorial.css";

type AuthMode = "create" | "verifyEmail" | "signin" | "forgot" | "linkSent" | "reset";

const SERVICE_DOWN = "The account service is unavailable. Please try again in a moment.";

async function readResult(response: Response): Promise<{ error?: string; message?: string }> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return response.ok ? {} : { error: SERVICE_DOWN };
  }
}
type ShowcaseKey = "create" | "signin" | "recover";

const showcases: Record<ShowcaseKey, { badge: string; heading: [string, string]; lead: string; footer: string; note: string; offset: number }> = {
  create: {
    badge: "YOUR SEAT IS SAVED",
    heading: ["Every story", "starts with you."],
    lead: "Create your account and step into a growing collection of Filipino films made with heart.",
    footer: "Start your first screening",
    note: "ONE ACCOUNT · EVERY STORY · ANY SCREEN",
    offset: 0,
  },
  signin: {
    badge: "SINESARILI ORIGINALS",
    heading: ["Find your next", "favorite story."],
    lead: "Filipino films, fresh voices, and stories that feel a little closer to home.",
    footer: "Explore stories from here",
    note: "A LITTLE CLOSER TO HOME · ALWAYS A NEW STORY",
    offset: 1,
  },
  recover: {
    badge: "WE'VE GOT YOU",
    heading: ["Lost your way?", "We'll lead you back."],
    lead: "Reset your password in a few steps and get back to the stories waiting for you.",
    footer: "Your stories are right where you left them",
    note: "SAFE · SECURE · BACK IN A MOMENT",
    offset: 2,
  },
};

function shortSynopsis(film: Film) {
  const text = (film.tagline || film.synopsis || "").split("\n")[0].trim();
  return text.length > 140 ? `${text.slice(0, 137).trimEnd()}…` : text;
}

export function SignupForm({ initialMode = "create", resetToken = "", returnTo = "/" }: { initialMode?: AuthMode; resetToken?: string; returnTo?: string }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [token] = useState(resetToken);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);
  const [completedMode, setCompletedMode] = useState<"create" | "signin">("create");
  const [saving, setSaving] = useState(false);
  const [films, setFilms] = useState<Film[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/films?limit=9", { signal: controller.signal })
      .then(response => (response.ok ? response.json() as Promise<{ data: Film[] }> : { data: [] }))
      .then(({ data }) => setFilms(data))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  function selectMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
    setCode("");
    setComplete(false);
  }

  async function resendVerification() {
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const response = await fetch("/api/account/verify-email/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const result = await readResult(response);
      if (!response.ok) throw new Error(result.error ?? "Could not send a new code.");
      setMessage(result.message ?? "A new verification code was sent.");
    } catch (reason) {
      setError(reason instanceof Error && reason.message !== "Failed to fetch" ? reason.message : SERVICE_DOWN);
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    const formData = new FormData(event.currentTarget);
    const address = String(formData.get("email") ?? email).trim();
    if (address) setEmail(address);

    try {
      let endpoint = "/api/account";
      let body: Record<string, string> = { email: address, password: String(formData.get("password") ?? "") };
      if (mode === "create") {
        body.name = String(formData.get("name") ?? "").trim();
      } else if (mode === "verifyEmail") {
        endpoint = "/api/account/verify-email";
        body = { email: address, code: String(formData.get("code") ?? "").trim() };
      } else if (mode === "signin") {
        endpoint = "/api/account/session";
      } else if (mode === "forgot") {
        endpoint = "/api/account/password-reset";
        body = { email: address };
      } else {
        endpoint = "/api/account/password-reset/confirm";
        body = { token, password: String(formData.get("password") ?? "") };
      }

      if ((mode === "create" || mode === "reset") && formData.get("password") !== formData.get("confirmPassword")) {
        throw new Error("Those passwords do not match.");
      }

      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await readResult(response);
      if (!response.ok) throw new Error(result.error ?? "Something went wrong. Please try again.");

      if (mode === "create") {
        setMode("verifyEmail");
        setMessage(result.message ?? "Check your email for a verification code.");
        setCode("");
      } else if (mode === "forgot") {
        setMode("linkSent");
        setMessage(result.message ?? "If an account exists for that email, a reset link is on its way.");
        setCode("");
      } else if (mode === "reset") {
        setMode("signin");
        setMessage("Your password has been reset. Sign in with your new password.");
      } else {
        setCompletedMode(mode === "verifyEmail" ? "create" : "signin");
        setComplete(true);
        window.location.replace(returnTo);
      }
    } catch (reason) {
      setError(reason instanceof Error && reason.message !== "Failed to fetch" ? reason.message : SERVICE_DOWN);
    } finally {
      setSaving(false);
    }
  }

  const showcaseKey: ShowcaseKey = complete ? completedMode : mode === "create" || mode === "verifyEmail" ? "create" : mode === "signin" ? "signin" : "recover";
  const showcase = showcases[showcaseKey];
  const posterFilms = films.length ? Array.from({ length: Math.min(3, films.length) }, (_, i) => films[(showcase.offset + i) % films.length]) : [];
  const frontPoster = posterFilms.at(-1);
  const title = mode === "create" ? "Get started." : mode === "verifyEmail" ? "Check your email." : mode === "signin" ? "Welcome back." : mode === "forgot" ? "Forgot password?" : mode === "linkSent" ? "Check your inbox." : "Choose a new password.";
  const lead = mode === "create" ? "One account opens the door to stories worth staying in for." : mode === "verifyEmail" ? `We sent a 6-digit verification code to ${email}.` : mode === "signin" ? "Pick up where your next favorite story begins." : mode === "forgot" ? "We’ll send a secure reset link to your email." : mode === "linkSent" ? `If an account exists for ${email}, a secure link is on its way. Open it to create your new password.` : "Make a new password for your SineSarili account.";

  return (
    <main className="signup-screen ed-auth">
      <section className="signup-panel" aria-labelledby="signup-title">
        <div className="signup-card">
          <Link className="wordmark signup-wordmark" href="/"><BrandMarks /><span className="brand-name">SineSarili</span></Link>
          <p className="auth-kicker">A HOME FOR FILIPINO CINEMA</p>
          <h1 id="signup-title">{complete ? completedMode === "create" ? <>You’re in<span>.</span></> : <>Welcome back<span>.</span></> : title}</h1>
          <p className="signup-lead">{complete ? completedMode === "create" ? "Your email is verified and your SineSarili account is ready." : "You’re signed in. Your next favorite story is waiting." : lead}</p>

          {complete ? <div className="signup-success"><span aria-hidden="true">✓</span><p>Signed in as <strong>{email}</strong></p><Link className="studio-primary signup-submit" href={returnTo}>{returnTo.startsWith("/subscribe/activate?") ? "Continue to activation" : returnTo.startsWith("/subscribe?plan=") ? "Continue to checkout" : "Taking you home…"}</Link></div> : mode === "linkSent" ? <div className="signup-link-sent" role="status"><Mail size={30} aria-hidden="true" /><strong>Your next step is in your email.</strong><p>The link is valid for 30 minutes and can be used once. Check your spam folder if you do not see it.</p><button className="signup-text-link" type="button" onClick={() => selectMode("forgot")}>Request another link</button></div> : <form className="studio-form signup-form" onSubmit={submit} key={mode}>
            {mode === "create" && <label htmlFor="signup-name">Your name<span className="signup-input"><UserRound size={17} aria-hidden="true" /><input id="signup-name" name="name" autoComplete="name" minLength={2} maxLength={120} required /></span></label>}
            {(mode === "create" || mode === "signin" || mode === "forgot") && <label htmlFor="signup-email">Email address<span className="signup-input"><Mail size={17} aria-hidden="true" /><input id="signup-email" name="email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} /></span></label>}
            {(mode === "verifyEmail") && <label htmlFor="signup-code">6-digit code<span className="signup-input"><KeyRound size={17} aria-hidden="true" /><input id="signup-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></span></label>}
            {(mode === "create" || mode === "signin" || mode === "reset") && <label htmlFor="signup-password">{mode === "reset" ? "New password" : "Password"}<span className="signup-input"><LockKeyhole size={17} aria-hidden="true" /><input id="signup-password" name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} maxLength={128} required /></span></label>}
            {(mode === "create" || mode === "reset") && <label htmlFor="signup-confirm-password">{mode === "create" ? "Confirm password" : "Confirm new password"}<span className="signup-input"><ShieldCheck size={17} aria-hidden="true" /><input id="signup-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></span></label>}
            {mode === "reset" && <p className="signup-password-hint">Use at least 8 characters. Choose a password you have not used elsewhere.</p>}
            {mode === "signin" && <button className="signup-text-link signup-forgot" type="button" onClick={() => selectMode("forgot")}>Forgot password?</button>}
            {error && <p className="studio-message" role="alert">{error}</p>}
            {message && <p className="signup-notice" role="status">{message}</p>}
            <button className="studio-primary signup-submit" type="submit" disabled={saving}>{saving ? "Please wait…" : mode === "create" ? "Continue" : mode === "verifyEmail" ? "Verify email" : mode === "signin" ? "Sign in" : mode === "forgot" ? "Send reset link" : "Reset password"}</button>
            {mode === "verifyEmail" && <button className="signup-text-link" type="button" onClick={resendVerification} disabled={saving}>Resend verification code</button>}
          </form>}

          {!complete && <div className="signup-footer-link">{mode === "create" ? <>Already have an account? <button className="signup-text-link" type="button" onClick={() => selectMode("signin")}>Sign in</button></> : mode === "signin" ? <>New to SineSarili? <button className="signup-text-link" type="button" onClick={() => selectMode("create")}>Create an account</button></> : mode === "verifyEmail" ? <button className="signup-text-link" type="button" onClick={() => selectMode("create")}>Back to account details</button> : mode === "linkSent" ? <button className="signup-text-link" type="button" onClick={() => selectMode("forgot")}>Request another link</button> : <button className="signup-text-link" type="button" onClick={() => selectMode("signin")}>Back to sign in</button>}</div>}
        </div>
      </section>
      <aside className="signup-showcase" aria-label="Discover SineSarili">
        <div className="signup-showcase-content" key={showcaseKey}>
          <p className="showcase-badge"><span /> {showcase.badge}</p>
          <h2>{showcase.heading[0]}<br /><span>{showcase.heading[1]}</span></h2>
          <p className="showcase-lead">{showcase.lead}</p>
          {!frontPoster && <figure className="showcase-art"><img src="/about/sibul.jpg" alt="" /><figcaption><span>Presented by</span> BulSU Cinephilia&rsquo;s SiBul</figcaption></figure>}
          {frontPoster && <div className="showcase-story">
            <div className="showcase-story-copy">
              <p className="admin-kicker">FEATURED FILM{frontPoster.releaseYear ? ` · ${frontPoster.releaseYear}` : ""}</p>
              <h3>{frontPoster.title}</h3>
              <p className="showcase-story-meta">{[...(frontPoster.genres ?? []), ...(frontPoster.runtimeMinutes ? [`${frontPoster.runtimeMinutes} MIN`] : [])].join(" · ").toUpperCase()}</p>
              <p className="showcase-story-synopsis">{shortSynopsis(frontPoster)}</p>
              <div className="showcase-feature-footer"><span>{showcase.footer}</span></div>
            </div>
            <div className="showcase-posters" aria-hidden="true">
              {posterFilms.map((film, index) => (
                <FilmPoster
                  key={`${film._id}-${index}`}
                  film={film}
                  index={index}
                  className={`showcase-poster ${["showcase-poster-back", "showcase-poster-side", "showcase-poster-front"][index + 3 - posterFilms.length]}`}
                />
              ))}
            </div>
          </div>}
          <p className="showcase-note">{showcase.note}</p>
        </div>
      </aside>
    </main>
  );
}
