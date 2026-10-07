"use client";

import { Languages, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const { t, toggleLanguage } = useLanguage();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user && profile?.active) router.replace("/dashboard");
  }, [loading, user, profile, router]);

  function readableAuthError(code?: string) {
    if (code === "auth/invalid-credential") return t("incorrectCredentials");
    if (code === "auth/too-many-requests") return t("tooManyAttempts");
    if (code === "auth/user-disabled") return t("accountDisabled");
    return t("genericLoginError");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      const nextProfile = await refreshProfile();

      if (!nextProfile?.active) {
        await signOut(auth);
        setError(t("accountExistsNoAccess"));
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
      <button type="button" className="language-switch login-language" onClick={toggleLanguage}>
        <Languages size={17} />
        <span>{t("languageLabel")}</span>
      </button>

      <section className="login-brand-panel">
        <div className="login-brand-content">
          <div className="brand-lockup login-brand-lockup">
            <div className="brand-logo-image light" aria-hidden="true">
              <img src="/stc-logo.png" alt="" />
            </div>
            <div>
              <strong>Contract Flow</strong>
              <span>{t("companyNameFull")}</span>
            </div>
          </div>

          <div className="login-message">
            <p className="eyebrow light-text">{t("internalWorkflow")}</p>
            <h1>{t("loginHeadline")}</h1>
            <p>{t("loginDescription")}</p>
          </div>

          <div className="login-security-note">
            <ShieldCheck size={20} />
            <span>{t("privateAccess")}</span>
          </div>
        </div>
      </section>

      <section className="login-form-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="login-mobile-brand">
            <div className="brand-logo-image">
              <img src="/stc-logo.png" alt="" />
            </div>
            <strong>Contract Flow</strong>
          </div>

          <p className="eyebrow">{t("welcomeBack")}</p>
          <h2>{t("signInContinue")}</h2>
          <p className="muted">{t("loginHelp")}</p>

          <label className="field">
            <span>{t("email")}</span>
            <div className="input-with-icon">
              <Mail size={17} />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
                required
                dir="ltr"
              />
            </div>
          </label>

          <label className="field">
            <span>{t("password")}</span>
            <div className="input-with-icon">
              <LockKeyhole size={17} />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
                dir="ltr"
              />
            </div>
          </label>

          {error && <div className="form-error" role="alert">{error}</div>}

          <button className="button button-primary button-large" type="submit" disabled={submitting}>
            {submitting ? t("signingIn") : t("signIn")}
          </button>

          <p className="login-help">{t("noSignup")}</p>
        </form>
      </section>
    </main>
  );
}
