"use client";

import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { auth } from "@/lib/firebase";

function readableAuthError(code?: string) {
  if (code === "auth/invalid-credential") return "Incorrect email or password.";
  if (code === "auth/too-many-requests") return "Too many attempts. Try again later.";
  if (code === "auth/user-disabled") return "This account has been disabled.";
  return "Could not sign in. Check your details and try again.";
}

export default function LoginPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user && profile?.active) router.replace("/dashboard");
  }, [loading, user, profile, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      const nextProfile = await refreshProfile();

      if (!nextProfile?.active) {
        await signOut(auth);
        setError("Your account exists, but access to STC Contract Flow is not enabled.");
        return;
      }

      router.replace("/dashboard");
    } catch (authError) {
      const code =
        typeof authError === "object" && authError && "code" in authError
          ? String((authError as { code?: string }).code)
          : undefined;
      setError(readableAuthError(code));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="login-brand-content">
          <div className="brand-lockup login-brand-lockup">
            <div className="brand-monogram light" aria-hidden="true">STC</div>
            <div>
              <strong>Contract Flow</strong>
              <span>Specialized Trading & Construction</span>
            </div>
          </div>

          <div className="login-message">
            <p className="eyebrow light-text">Internal workflow</p>
            <h1>Every contract.<br />One clear flow.</h1>
            <p>
              Track signatures, down payments, supply and settlement without
              spreadsheets or scattered follow-ups.
            </p>
          </div>

          <div className="login-security-note">
            <ShieldCheck size={20} />
            <span>Private access · Firebase Authentication · Firestore Security Rules</span>
          </div>
        </div>
      </section>

      <section className="login-form-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="login-mobile-brand">
            <div className="brand-monogram">STC</div>
            <strong>Contract Flow</strong>
          </div>

          <p className="eyebrow">Welcome back</p>
          <h2>Sign in to continue</h2>
          <p className="muted">Use the company account enabled by your administrator.</p>

          <label className="field">
            <span>Email address</span>
            <div className="input-with-icon">
              <Mail size={17} />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
                required
              />
            </div>
          </label>

          <label className="field">
            <span>Password</span>
            <div className="input-with-icon">
              <LockKeyhole size={17} />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          </label>

          {error && <div className="form-error" role="alert">{error}</div>}

          <button className="button button-primary button-large" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>

          <p className="login-help">No public sign-up is available for this system.</p>
        </form>
      </section>
    </main>
  );
}
