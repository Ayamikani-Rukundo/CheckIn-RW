"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Moon, Sun, ArrowRight, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usePersistedTheme } from "@/lib/use-persisted-theme";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const { dark, toggleTheme } = usePersistedTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [message, setMessage] = useState("");
  const [savedSession, setSavedSession] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const savedEmail = localStorage.getItem("nls-saved-email");
    if (savedEmail) setEmail(savedEmail);

    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        window.location.assign("/auth/reset-password");
      }
    });

    if (localStorage.getItem("nls-remember-session") === "true") {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setSavedSession(data.session.user.email || savedEmail || "");
        }
        setCheckingSession(false);
      }).catch(() => setCheckingSession(false));
    } else {
      setCheckingSession(false);
    }

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    localStorage.setItem("nls-remember-session", String(remember));
    try {
      const supabase = createClient();
      if (remember) {
        localStorage.setItem("nls-saved-email", email.trim());
      } else {
        localStorage.removeItem("nls-saved-email");
        await supabase.auth.signOut();
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("Email or password is incorrect. Please try again.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Sign-in is unavailable. Check the application configuration.");
    } finally {
      setLoading(false);
    }
  }

  async function sendResetLink() {
    setError("");
    setMessage("");
    if (!email.includes("@")) {
      setError("Enter your email address above before requesting a reset.");
      return;
    }
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (resetError) throw resetError;
      setMessage("If an account exists for this email, a password-reset link has been sent.");
    } catch {
      setError("Password reset could not be requested. Please try again.");
    }
  }

  async function useDifferentAccount() {
    await createClient().auth.signOut();
    localStorage.removeItem("nls-remember-session");
    localStorage.removeItem("nls-saved-email");
    setSavedSession("");
    setEmail("");
    setPassword("");
    setRemember(false);
  }

  return (
    <main className="login-shell" data-theme={dark ? "dark" : "light"}>
      <section className="login-brand">
        <div className="brand-mark">
          <span className="brand-bars"><i /><i /><i /></span>
          <div>
            <strong>NLS</strong>
            <span>CHRISTIAN FELLOWSHIP</span>
          </div>
        </div>
        <div className="brand-copy">
          <span className="eyebrow"><b /> ATTENDANCE PLATFORM</span>
          <h1>Every person.<br />Every gathering.<br /><em>Every record.</em></h1>
          <p>A secure, organized way to track attendance and keep your church community connected.</p>
        </div>
        <footer>
          <ShieldCheck size={15} />
          <span>NLS CHRISTIAN FELLOWSHIP</span>
          <b>EST. 2024</b>
        </footer>
      </section>

      <section className="login-panel">
        <button className="theme-button" type="button" onClick={toggleTheme} aria-label="Toggle theme">
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        {savedSession && !checkingSession ? (
          <div className="login-form saved-account">
            <div className="form-heading">
              <span>ACCOUNT SAVED</span>
              <h2>Welcome back</h2>
              <p>Your sign-in is saved on this device.</p>
            </div>
            <div className="saved-account-email"><ShieldCheck size={18} /><span>{savedSession}</span></div>
            <button className="sign-in" type="button" onClick={() => router.push("/dashboard")}>
              Continue to NLS Attendance <ArrowRight size={18} />
            </button>
            <button className="switch-account" type="button" onClick={useDifferentAccount}>
              Sign in with a different account
            </button>
          </div>
        ) : (
        <form className="login-form" onSubmit={signIn}>
          <div className="form-heading">
            <span>WELCOME BACK</span>
            <h2>Sign in to NLS Attendance</h2>
            <p>Enter your account details to continue.</p>
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}
          {message && <div className="form-success" role="status">{message}</div>}

          <label>
            <span>Email address</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@nlscf.org" autoComplete="email" />
          </label>

          <label>
            <div className="label-row">
              <span>Password</span>
              <button type="button" className="forgot" onClick={sendResetLink}>Forgot password?</button>
            </div>
            <div className="password-field">
              <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <label className="checkbox-row">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            <span>Keep me signed in</span>
          </label>

          <button className="sign-in" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
            {!loading && <ArrowRight size={18} />}
          </button>

          <div className="register-line">
            <span>Have an invitation?</span>
            <button type="button" onClick={() => router.push("/register")}>Create an account</button>
          </div>
        </form>
        )}
      </section>
    </main>
  );
}
