"use client";

import { useEffect, useState } from "react";
import { Check, Shield, Trash2, UserCog } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Dialog } from "@/components/dashboard/dialog";
import { APP_ROLES, type UserProfile } from "@/lib/dashboard-types";

type Props = { currentUser: UserProfile };
type UserDraft = Pick<UserProfile, "role" | "active" | "can_view_records" | "can_edit_records" | "can_add_records">;

const accessOptions: { value: string; label: string; permissions: Pick<UserDraft, "can_view_records" | "can_edit_records" | "can_add_records"> }[] = [
  { value: "none", label: "No record access", permissions: { can_view_records: false, can_edit_records: false, can_add_records: false } },
  { value: "view", label: "View only", permissions: { can_view_records: true, can_edit_records: false, can_add_records: false } },
  { value: "edit", label: "View and edit", permissions: { can_view_records: true, can_edit_records: true, can_add_records: false } },
  { value: "add", label: "View, edit and add", permissions: { can_view_records: true, can_edit_records: true, can_add_records: true } },
];

function accessValue(user: UserDraft) {
  if (!user.can_view_records) return "none";
  if (user.can_add_records) return "add";
  if (user.can_edit_records) return "edit";
  return "view";
}

export function UsersPanel({ currentUser }: Props) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<UserProfile | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await createClient()
      .from("user_profiles")
      .select("id, full_name, email, role, active, can_view_records, can_edit_records, can_add_records")
      .order("full_name");
    if (loadError) {
      setError(loadError.message);
    } else {
      setUsers((data || []) as UserProfile[]);
    }
    setLoading(false);
  }

  useEffect(() => { void loadUsers(); }, []);

  function updateDraft(id: string, updates: Partial<UserDraft>) {
    const user = users.find((item) => item.id === id);
    if (!user) return;
    setDrafts((existing) => ({
      ...existing,
      [id]: { ...user, ...existing[id], ...updates },
    }));
  }

  function chooseAccess(id: string, value: string) {
    const option = accessOptions.find((item) => item.value === value);
    if (option) updateDraft(id, option.permissions);
  }

  async function saveUser(user: UserProfile) {
    const draft = drafts[user.id];
    if (!draft) return;
    setBusyId(user.id);
    setError("");
    const { error: saveError } = await createClient()
      .from("user_profiles")
      .update({ ...draft, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select("id")
      .single();
    setBusyId("");
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setDrafts((existing) => {
      const next = { ...existing };
      delete next[user.id];
      return next;
    });
    await loadUsers();
  }

  async function deleteUser() {
    if (!deleting) return;
    setBusyId(deleting.id);
    setError("");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setBusyId("");
      setError("Your sign-in has expired. Sign in again to manage accounts.");
      return;
    }
    try {
      const response = await fetch("/api/admin/users/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: deleting.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete the account.");
      setUsers((existing) => existing.filter((user) => user.id !== deleting.id));
      setDrafts((existing) => {
        const next = { ...existing };
        delete next[deleting.id];
        return next;
      });
      setDeleting(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the account.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="panel records-panel">
      <div className="panel-heading"><div><h2>Church users</h2><p>Set each person’s role and record access</p></div><span className="admin-chip"><Shield size={13} /> Super Admin</span></div>
      {error && <p className="inline-error mark-error">{error}</p>}
      {loading ? <p className="loading-note">Loading users...</p> : (
        <>
          <div className="table-wrap desktop-user-list">
            <table className="data-table user-table">
              <thead><tr><th>User</th><th>Role</th><th>Record access</th><th>Account</th><th>Actions</th></tr></thead>
              <tbody>
                {users.map((user) => {
                  const draft = drafts[user.id] || user;
                  const isSelf = user.id === currentUser.id;
                  return <tr key={user.id}>
                    <td><span className="name-cell">{user.full_name}</span><small className="sub-cell">{user.email}</small></td>
                    <td><RoleSelect user={user} draft={draft} disabled={isSelf} onChange={(role) => updateDraft(user.id, { role })} /></td>
                    <td><AccessSelect draft={draft} disabled={isSelf} onChange={(value) => chooseAccess(user.id, value)} /></td>
                    <td><button className={draft.active ? "account-state active" : "account-state"} disabled={isSelf} onClick={() => updateDraft(user.id, { active: !draft.active })}>{draft.active ? "Active" : "Disabled"}</button></td>
                    <td><UserActions user={user} self={isSelf} changed={Boolean(drafts[user.id])} busy={busyId === user.id} onSave={() => saveUser(user)} onDelete={() => { setDeleting(user); setError(""); }} /></td>
                  </tr>;
                })}
                {!users.length && <tr><td className="empty-row" colSpan={5}>No users found.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mobile-user-list">
            {users.map((user) => {
              const draft = drafts[user.id] || user;
              const isSelf = user.id === currentUser.id;
              return <article className="mobile-user-card" key={user.id}>
                <div className="mobile-user-heading">
                  <div><strong>{user.full_name}</strong><small>{user.email}</small></div>
                </div>
                <label>Role<RoleSelect user={user} draft={draft} disabled={isSelf} onChange={(role) => updateDraft(user.id, { role })} /></label>
                <label>Record access<AccessSelect draft={draft} disabled={isSelf} onChange={(value) => chooseAccess(user.id, value)} /></label>
                <div className="mobile-user-footer">
                  <button className={draft.active ? "account-state active" : "account-state"} disabled={isSelf} onClick={() => updateDraft(user.id, { active: !draft.active })}>{draft.active ? "Active" : "Disabled"}</button>
                  <UserActions user={user} self={isSelf} changed={Boolean(drafts[user.id])} busy={busyId === user.id} onSave={() => saveUser(user)} onDelete={() => { setDeleting(user); setError(""); }} />
                </div>
              </article>;
            })}
            {!users.length && <p className="empty-note">No users found.</p>}
          </div>
        </>
      )}
      {deleting && (
        <Dialog title="Delete account?" onClose={() => setDeleting(null)}>
          <div className="dialog-form">
            <p className="dialog-description">Permanently delete <strong>{deleting.full_name}</strong> ({deleting.email}) and their sign-in account? Attendance records stay; the account will be removed. This cannot be undone.</p>
            {error && <p className="inline-error">{error}</p>}
            <div className="dialog-actions">
              <button className="secondary-button" onClick={() => setDeleting(null)}>Cancel</button>
              <button className="danger-button" onClick={deleteUser} disabled={busyId === deleting.id}><Trash2 size={14} /> {busyId === deleting.id ? "Deleting..." : "Delete account"}</button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}

function RoleSelect({
  user,
  draft,
  disabled,
  onChange,
}: {
  user: UserProfile;
  draft: UserDraft;
  disabled: boolean;
  onChange: (role: string) => void;
}) {
  return (
    <select className="compact-select" value={draft.role} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {user.role === "Super Admin" && <option value="Super Admin">Super Admin</option>}
      {APP_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
    </select>
  );
}

function AccessSelect({
  draft,
  disabled,
  onChange,
}: {
  draft: UserDraft;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select className="compact-select" value={accessValue(draft)} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {accessOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function UserActions({
  user,
  self,
  changed,
  busy,
  onSave,
  onDelete,
}: {
  user: UserProfile;
  self: boolean;
  changed: boolean;
  busy: boolean;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="user-actions">
      {!self && changed && <button className="icon-action save-user" disabled={busy} onClick={onSave} aria-label={`Save ${user.full_name}`} title="Save changes"><Check size={15} /></button>}
      {!self && <button className="icon-action delete-action" disabled={busy} onClick={onDelete} aria-label={`Delete ${user.full_name}`} title="Delete account"><Trash2 size={14} /></button>}
      {self && <span className="self-label"><UserCog size={13} /> You</span>}
    </div>
  );
}
