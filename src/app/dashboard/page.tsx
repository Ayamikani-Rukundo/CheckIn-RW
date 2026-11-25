"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, subMonths } from "date-fns";
import {
  BarChart3, ClipboardCheck, Eye, EyeOff, KeyRound, LayoutDashboard, LogOut, Menu, Moon, Sun, Users, UserRoundCog, X,
} from "lucide-react";
import { AttendancePanel } from "@/components/dashboard/attendance-panel";
import { Dialog } from "@/components/dashboard/dialog";
import { InvitationsPanel } from "@/components/dashboard/invitations-panel";
import { Overview } from "@/components/dashboard/overview";
import { ReportsPanel } from "@/components/dashboard/reports-panel";
import { StudentsPanel } from "@/components/dashboard/students-panel";
import { UsersPanel } from "@/components/dashboard/users-panel";
import { createClient } from "@/lib/supabase/client";
import { usePersistedTheme } from "@/lib/use-persisted-theme";
import type { AttendanceRecord, AttendanceSession, Student, UserProfile } from "@/lib/dashboard-types";

type DashboardSection = "Overview" | "Students" | "Attendance" | "Reports" | "Invitations" | "Users";

async function fetchAllPages<T>(
  fetchPage: (start: number, end: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await fetchPage(start, start + 999);
    if (error) throw new Error(error.message);
    const page = data || [];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const { dark, toggleTheme } = usePersistedTheme();
  const [active, setActive] = useState<DashboardSection>("Overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const loadData = useCallback(async () => {
    setError("");
    const supabase = createClient();
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError || !authData.session) {
      router.replace("/");
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, full_name, email, role, active, can_view_records, can_edit_records, can_add_records")
      .eq("id", authData.session.user.id)
      .single();

    if (profileError || !profileData) {
      setError(profileError?.message || "Your user profile could not be loaded. Run the attendance access migration in Supabase.");
      setLoading(false);
      return;
    }

    const currentProfile = profileData as UserProfile;
    if (!currentProfile.active) {
      await supabase.auth.signOut();
      router.replace("/");
      return;
    }
    setProfile(currentProfile);

    if (!currentProfile.can_view_records && currentProfile.role !== "Super Admin") {
      setStudents([]);
      setSessions([]);
      setRecords([]);
      setLoading(false);
      return;
    }

    try {
      const since = format(subMonths(new Date(), 12), "yyyy-MM-dd");
      const [loadedStudents, loadedSessions] = await Promise.all([
        fetchAllPages<Student>(async (start, end) => await supabase
          .from("students")
          .select("id, registration_number, full_name, ministry, phone, guardian_name, guardian_phone, contacts, active")
          .eq("active", true)
          .order("full_name")
          .range(start, end)),
        fetchAllPages<AttendanceSession>(async (start, end) => await supabase
          .from("attendance_sessions")
          .select("id, title, session_date, session_type, notes")
          .gte("session_date", since)
          .order("session_date", { ascending: false })
          .range(start, end)),
      ]);

      const loadedRecords: AttendanceRecord[] = [];
      for (let index = 0; index < loadedSessions.length; index += 100) {
        const sessionIds = loadedSessions.slice(index, index + 100).map((session) => session.id);
        const pageRecords = await fetchAllPages<AttendanceRecord>(async (start, end) => await supabase
          .from("attendance_records")
          .select("id, session_id, student_id, status")
          .in("session_id", sessionIds)
          .range(start, end));
        loadedRecords.push(...pageRecords);
      }

      setStudents(loadedStudents);
      setSessions(loadedSessions);
      setRecords(loadedRecords);
      setLoading(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Attendance data could not be loaded.");
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const isAdmin = profile?.role === "Super Admin";
  const canView = Boolean(isAdmin || profile?.can_view_records);
  const navigation = useMemo(() => {
    const items: { label: DashboardSection; icon: typeof LayoutDashboard }[] = [
      { label: "Overview", icon: LayoutDashboard },
    ];
    if (canView) {
      items.push(
        { label: "Students", icon: Users },
        { label: "Attendance", icon: ClipboardCheck },
        { label: "Reports", icon: BarChart3 },
      );
    }
    if (isAdmin) {
      items.push(
        { label: "Invitations", icon: KeyRound },
        { label: "Users", icon: UserRoundCog },
      );
    }
    return items;
  }, [canView, isAdmin]);

  useEffect(() => {
    if ((active === "Users" || active === "Invitations") && !isAdmin) setActive("Overview");
    if ((active === "Students" || active === "Attendance" || active === "Reports") && !canView) setActive("Overview");
  }, [active, canView, isAdmin]);

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/");
  }

  function openProfile() {
    setPasswordError("");
    setPasswordSuccess("");
    setProfileDialogOpen(true);
  }

  function closeProfile() {
    if (changingPassword) return;
    setProfileDialogOpen(false);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setPasswordSuccess("");
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    if (newPassword.length < 8) {
      setPasswordError("Use at least 8 characters for your new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The passwords do not match.");
      return;
    }

    setChangingPassword(true);
    try {
      const supabase = createClient();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);
      if (!session) throw new Error("Your sign-in has expired. Sign in again before changing your password.");
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw new Error(updateError.message);
      setPasswordSuccess("Your password has been changed.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (updateError) {
      setPasswordError(updateError instanceof Error ? updateError.message : "Could not change your password.");
    } finally {
      setChangingPassword(false);
    }
  }

  if (loading) {
    return <main className="portal-loading">Loading your attendance records…</main>;
  }
  if (error || !profile) {
    return <main className="portal-loading"><div className="portal-error">{error || "Your account profile is unavailable."}</div><button className="small-primary" onClick={() => { setLoading(true); void loadData(); }}>Try again</button></main>;
  }

  const initials = profile.full_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  return (
    <main className="app-shell" data-theme={dark ? "dark" : "light"}>
      <aside className={mobileNav ? "sidebar open" : "sidebar"}>
        <div className="sidebar-brand">
          <span className="sidebar-symbol">N</span>
          <div><strong>NLS</strong><small>ATTENDANCE MIS</small></div>
          <button className="sidebar-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={17} /></button>
        </div>
        <nav>
          <span className="nav-label">WORKSPACE</span>
          {navigation.map(({ label, icon: Icon }) => (
            <button key={label} className={active === label ? "nav-item active" : "nav-item"} onClick={() => { setActive(label); setMobileNav(false); }}>
              <Icon size={16} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <button className="sidebar-profile" onClick={openProfile} aria-label="Open profile and change password">
            <span className="avatar">{initials}</span>
            <span className="sidebar-profile-info"><strong>{profile.full_name}</strong><small>{profile.role} · Profile</small></span>
          </button>
          <button onClick={logout} aria-label="Sign out"><LogOut size={15} /></button>
        </div>
      </aside>

      <section className="app-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav((value) => !value)} aria-label="Open menu"><Menu size={19} /></button>
          <div className="portal-title"><span>NLS CHRISTIAN FELLOWSHIP</span><strong>Attendance MIS</strong></div>
          <div className="top-actions">
            <span className="top-date">{format(new Date(), "EEE, d MMM yyyy")}</span>
            <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button className="mobile-profile" onClick={openProfile} aria-label="Open profile and change password"><UserRoundCog size={17} /></button>
          </div>
        </header>

        <div className="dashboard">
          <div className="page-heading">
            <div><span>{format(new Date(), "EEEE, d MMMM yyyy").toUpperCase()}</span><h1>{active}</h1></div>
            {active === "Overview" && canView && <button className="primary-action" onClick={() => setActive("Attendance")}><ClipboardCheck size={14} /> Take attendance</button>}
          </div>

          {!canView && !isAdmin
            ? <section className="panel no-access"><h2>Record access not assigned</h2><p>Your Super Admin needs to grant you access to attendance records.</p></section>
            : active === "Overview"
              ? <Overview students={students} sessions={sessions} records={records} />
              : active === "Students"
                ? <StudentsPanel profile={profile} students={students} onChanged={loadData} />
                : active === "Attendance"
                  ? <AttendancePanel profile={profile} students={students} sessions={sessions} records={records} onChanged={loadData} />
                  : active === "Reports"
                    ? <ReportsPanel students={students} sessions={sessions} records={records} />
                    : active === "Invitations"
                      ? <InvitationsPanel currentUser={profile} />
                      : <UsersPanel currentUser={profile} />}
          {active !== "Users" && error && <div className="portal-inline-error">{error}</div>}
        </div>
      </section>
      <nav className="mobile-tabbar" aria-label="Main navigation">
        {navigation.map(({ label, icon: Icon }) => (
          <button key={label} className={active === label ? "mobile-tab active" : "mobile-tab"} onClick={() => setActive(label)}>
            <Icon size={17} /><span>{label}</span>
          </button>
        ))}
      </nav>
      {profileDialogOpen && (
        <Dialog title="Your profile" onClose={closeProfile}>
          <div className="profile-dialog-body">
            <div className="profile-identity">
              <span className="avatar">{initials}</span>
              <div><strong>{profile.full_name}</strong><span>{profile.email}</span><small>{profile.role}</small></div>
            </div>
            {passwordSuccess ? (
              <div className="dialog-form">
                <p className="profile-password-success" role="status">{passwordSuccess}</p>
                <div className="dialog-actions"><button className="small-primary" onClick={closeProfile}>Done</button></div>
              </div>
            ) : (
              <form className="dialog-form" onSubmit={changePassword}>
                <div className="profile-password-heading"><KeyRound size={15} /><strong>Change password</strong></div>
                <p className="dialog-description">Choose a new password with at least 8 characters.</p>
                <label>New password
                  <div className="password-field profile-password-field">
                    <input type={showNewPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                    <button type="button" onClick={() => setShowNewPassword((value) => !value)} aria-label={showNewPassword ? "Hide new password" : "Show new password"}>{showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                </label>
                <label>Confirm new password
                  <div className="password-field profile-password-field">
                    <input type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                    <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? "Hide password confirmation" : "Show password confirmation"}>{showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                </label>
                {passwordError && <p className="inline-error" role="alert">{passwordError}</p>}
                <div className="dialog-actions">
                  <button type="button" className="secondary-button" onClick={closeProfile}>Cancel</button>
                  <button type="submit" className="small-primary" disabled={changingPassword}>{changingPassword ? "Updating..." : "Update password"}</button>
                </div>
              </form>
            )}
          </div>
        </Dialog>
      )}
    </main>
  );
}
