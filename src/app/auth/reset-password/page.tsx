"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usePersistedTheme } from "@/lib/use-persisted-theme";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { dark } = usePersistedTheme();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    createClient().auth.getSession();
  }, []);

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError("This reset link is invalid or has expired.");
      return;
    }
    setSuccess(true);
  }

  if (success) {
    return (
      <main className="reset-shell" data-theme={dark ? "dark" : "light"}>
        <section><ShieldCheck size={38} /><h1>Password updated</h1><p>You can now sign in with your new password.</p><button className="sign-in" onClick={() => router.push("/")}>Return to sign in</button></section>
      </main>
    );
  }

  return (
    <main className="reset-shell" data-theme={dark ? "dark" : "light"}>
      <form onSubmit={updatePassword}>
        <ShieldCheck size={38} />
        <h1>Set a new password</h1>
        <p>Create a strong password for your NLS Attendance account.</p>
        {error && <div className="form-error">{error}</div>}
        <label><span>New password</span><div className="password-field"><input type={show ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={() => setShow((value) => !value)}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
        <label><span>Confirm password</span><div className="password-field"><input type={show ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /><button type="button" onClick={() => setShow((value) => !value)}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
        <button className="sign-in" type="submit">Update password</button>
      </form>
    </main>
  );
}
