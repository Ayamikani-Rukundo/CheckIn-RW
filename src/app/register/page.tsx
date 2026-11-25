"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usePersistedTheme } from "@/lib/use-persisted-theme";

export default function RegisterPage() {
  const router = useRouter();
  const { dark } = usePersistedTheme();
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [step, setStep] = useState(1);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedRole, setSelectedRole] = useState("Viewer");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (code.trim().length < 6) {
      setError("Enter a valid invitation code.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/invitations/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The invitation code is invalid.");
      setSelectedRole(result.role);
      setError("");
      setStep(2);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "The invitation code is invalid.");
    } finally {
      setLoading(false);
    }
  }

  async function createAccount() {
    setError("");
    if (!fullName.trim() || !email.includes("@")) {
      setError("Enter your full name and a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), fullName: fullName.trim(), email: email.trim(), password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Account creation failed.");
      localStorage.setItem("nls-remember-session", "false");
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw new Error("Account created, but automatic sign-in failed. Please sign in.");
      router.push("/dashboard");
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Account creation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="register-shell" data-theme={dark ? "dark" : "light"}>
      <section className="register-aside">
        <button className="register-brand" onClick={() => router.push("/")}>
          <span>N</span><div><strong>NLS</strong><small>CHRISTIAN FELLOWSHIP</small></div>
        </button>
        <div><ShieldCheck size={38} /><h1>Secure account<br />registration</h1><p>Every account is verified through an invitation issued by the church administration.</p></div>
      </section>
      <section className="register-main">
        <button className="back-button" onClick={() => router.push("/")}><ArrowLeft size={16} /> Back to sign in</button>
        <form className="register-form" onSubmit={verifyCode}>
          <span className="step-label">STEP {step} OF 2</span>
          <h2>{step === 1 ? "Enter invitation code" : "Create your account"}</h2>
          <p>{step === 1 ? "Your invitation code was provided by a church administrator." : "Complete your profile to join NLS Attendance."}</p>
          {error && <div className="form-error">{error}</div>}
          {step === 1 ? (
            <>
              <label><span>Invitation code</span><div className="code-field"><KeyRound size={17} /><input type={showCode ? "text" : "password"} value={code} onChange={(event) => setCode(event.target.value)} placeholder="NLS-XXXX-XXXX" /><button type="button" onClick={() => setShowCode((value) => !value)} aria-label={showCode ? "Hide invitation code" : "Show invitation code"}>{showCode ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
              <button className="sign-in" type="submit" disabled={loading}>{loading ? "Verifying..." : "Verify invitation"}</button>
            </>
          ) : (
            <>
              <div className="form-grid">
                <label><span>Full name</span><input required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" /></label>
                <label><span>Email address</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@nlscf.org" /></label>
                <label><span>Assigned role</span><input value={selectedRole} readOnly /></label>
                <label><span>Password</span><div className="password-field"><input required type={show ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Create a password" /><button type="button" onClick={() => setShow((value) => !value)}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
                <label><span>Confirm password</span><div className="password-field"><input required type={showConfirm ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat password" /><button type="button" onClick={() => setShowConfirm((value) => !value)}>{showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
              </div>
              <button className="sign-in" type="button" onClick={createAccount} disabled={loading}>{loading ? "Creating account..." : "Create account"}</button>
            </>
          )}
        </form>
      </section>
    </main>
  );
}
