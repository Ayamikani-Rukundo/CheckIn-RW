"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { Dialog } from "@/components/dashboard/dialog";
import { APP_ROLES, type AccessLevel, type InvitationCode, type UserProfile } from "@/lib/dashboard-types";
import { createClient } from "@/lib/supabase/client";

type Props = { currentUser: UserProfile };
type InvitationForm = { role: string; access: AccessLevel; maxUses: string; expiresOn: string };

const accessOptions: { value: AccessLevel; label: string }[] = [
  { value: "view", label: "View only" },
  { value: "edit", label: "View and edit" },
  { value: "add", label: "View, edit and add" },
];

function accessLabel(invitation: InvitationCode) {
  if (invitation.can_add_records) return "View, edit and add";
  if (invitation.can_edit_records) return "View and edit";
  return "View only";
}

function accessPermissions(access: AccessLevel) {
  return {
    can_view_records: true,
    can_edit_records: access === "edit" || access === "add",
    can_add_records: access === "add",
  };
}

function accessLevel(invitation: InvitationCode): AccessLevel {
  if (invitation.can_add_records) return "add";
  if (invitation.can_edit_records) return "edit";
  return "view";
}

function newInvitationCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const value = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `NLS-${value.slice(0, 4)}-${value.slice(4)}`;
}

function dateInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function invitationStatus(invitation: InvitationCode) {
  if (!invitation.active) return "Disabled";
  if (invitation.expires_at && new Date(invitation.expires_at).getTime() <= Date.now()) return "Expired";
  if (invitation.uses >= invitation.max_uses) return "Used up";
  return "Active";
}

export function InvitationsPanel({ currentUser }: Props) {
  const [invitations, setInvitations] = useState<InvitationCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InvitationCode | null>(null);
  const [deleting, setDeleting] = useState<InvitationCode | null>(null);
  const [form, setForm] = useState<InvitationForm>({
    role: "Viewer",
    access: "view",
    maxUses: "1",
    expiresOn: "",
  });

  const loadInvitations = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await createClient()
      .from("invitation_codes")
      .select("id, code, role, can_view_records, can_edit_records, can_add_records, created_by, expires_at, max_uses, uses, active, created_at")
      .order("created_at", { ascending: false });
    if (loadError) {
      setError(loadError.message);
    } else {
      setInvitations((data || []) as InvitationCode[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  function startCreate() {
    setEditing(null);
    setForm({ role: "Viewer", access: "view", maxUses: "1", expiresOn: "" });
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  function startEdit(invitation: InvitationCode) {
    setEditing(invitation);
    setForm({
      role: invitation.role,
      access: accessLevel(invitation),
      maxUses: String(invitation.max_uses),
      expiresOn: dateInputValue(invitation.expires_at),
    });
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  async function saveInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const maxUses = Number(form.maxUses);
    if (!Number.isInteger(maxUses) || maxUses < Math.max(1, editing?.uses || 0)) {
      setError("The maximum uses must be a whole number and cannot be less than uses already claimed.");
      return;
    }

    const expiresAt = form.expiresOn ? new Date(`${form.expiresOn}T23:59:59`) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      setError("Choose a valid expiration date.");
      return;
    }

    setBusyId(editing?.id || "new");
    setError("");
    setNotice("");
    const payload = {
      role: form.role,
      ...accessPermissions(form.access),
      max_uses: maxUses,
      expires_at: expiresAt?.toISOString() || null,
    };

    if (editing) {
      const { error: saveError } = await createClient()
        .from("invitation_codes")
        .update(payload)
        .eq("id", editing.id);
      if (saveError) {
        setError(saveError.message);
        setBusyId("");
        return;
      }
      setNotice("Invitation updated. New signups will receive the updated role and access.");
    } else {
      const { data, error: saveError } = await createClient()
        .from("invitation_codes")
        .insert({ ...payload, code: newInvitationCode(), created_by: currentUser.id })
        .select("code")
        .single();
      if (saveError) {
        setError(saveError.message);
        setBusyId("");
        return;
      }
      setNotice(`Created code ${data.code}. Copy it from the list to share with the new member.`);
    }

    setBusyId("");
    setFormOpen(false);
    await loadInvitations();
  }

  async function toggleActive(invitation: InvitationCode) {
    setBusyId(invitation.id);
    setError("");
    setNotice("");
    const { error: updateError } = await createClient()
      .from("invitation_codes")
      .update({ active: !invitation.active })
      .eq("id", invitation.id);
    setBusyId("");
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setInvitations((existing) => existing.map((item) => item.id === invitation.id ? { ...item, active: !item.active } : item));
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setNotice(`Copied ${code}.`);
      setError("");
    } catch (copyError) {
      setError(copyError instanceof Error ? `Could not copy the code: ${copyError.message}` : "Could not copy the invitation code.");
    }
  }

  async function deleteInvitation() {
    if (!deleting) return;
    setBusyId(deleting.id);
    setError("");
    const { error: deleteError } = await createClient()
      .from("invitation_codes")
      .delete()
      .eq("id", deleting.id);
    setBusyId("");
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setInvitations((existing) => existing.filter((item) => item.id !== deleting.id));
    setNotice(`Deleted code ${deleting.code}.`);
    setDeleting(null);
  }

  if (currentUser.role !== "Super Admin") {
    return <section className="panel no-access"><h2>Admin access required</h2><p>Only a Super Admin can manage signup invitations.</p></section>;
  }

  return (
    <section className="panel records-panel invitation-panel">
      <div className="panel-heading">
        <div><h2>Signup invitations</h2><p>Create and manage codes and the access new members receive</p></div>
        <button className="small-primary" onClick={startCreate}><Plus size={14} /> New code</button>
      </div>
      <div className="invitation-intro"><KeyRound size={14} /><span>Share a code with a new member. It applies the selected role and record access at signup.</span><span className="admin-chip"><Shield size={12} /> Super Admin</span></div>
      {error && <p className="inline-error mark-error">{error}</p>}
      {notice && <p className="invitation-notice" role="status">{notice}</p>}
      {loading ? <p className="loading-note">Loading invitations...</p> : (
        <div className="invitation-list">
          {invitations.map((invitation) => {
            const status = invitationStatus(invitation);
            return (
              <article className="invitation-card" key={invitation.id}>
                <div className="invitation-card-top">
                  <div className="invitation-code-group">
                    <code>{invitation.code}</code>
                    <span className={`invitation-status ${status.toLowerCase().replace(" ", "-")}`}>{status}</span>
                  </div>
                  <div className="invitation-card-actions">
                    <button className="secondary-button invite-action" onClick={() => void copyCode(invitation.code)}><Copy size={13} /> Copy</button>
                    <button className="secondary-button invite-action" onClick={() => startEdit(invitation)}><Pencil size={13} /> Edit</button>
                    <button className={invitation.active ? "account-state active" : "account-state"} disabled={busyId === invitation.id} onClick={() => void toggleActive(invitation)}>{invitation.active ? "Disable" : "Enable"}</button>
                    <button className="danger-button invite-action" disabled={busyId === invitation.id} onClick={() => { setDeleting(invitation); setError(""); }}><Trash2 size={13} /> Delete</button>
                  </div>
                </div>
                <div className="invitation-card-meta">
                  <span>{invitation.role}</span>
                  <span>{accessLabel(invitation)}</span>
                  <span>{invitation.uses} / {invitation.max_uses} uses</span>
                  <span>{invitation.expires_at ? `Expires ${new Date(invitation.expires_at).toLocaleDateString()}` : "No expiry"}</span>
                </div>
              </article>
            );
          })}
          {!invitations.length && <p className="empty-note">No invitation codes yet. Create one to let a new member sign up.</p>}
        </div>
      )}

      {formOpen && (
        <Dialog title={editing ? "Edit invitation" : "Create invitation"} onClose={() => setFormOpen(false)}>
          <form className="dialog-form" onSubmit={saveInvitation}>
            <p className="dialog-description">{editing ? "Changes apply to future signups using this code; existing accounts are unchanged." : "Choose the role and record permissions this code grants at signup."}</p>
            <label>Role
              <select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}>
                {APP_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>
            <label>Record access
              <select value={form.access} onChange={(event) => setForm((current) => ({ ...current, access: event.target.value as AccessLevel }))}>
                {accessOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>Maximum signups
              <input type="number" min={Math.max(1, editing?.uses || 0)} step="1" required value={form.maxUses} onChange={(event) => setForm((current) => ({ ...current, maxUses: event.target.value }))} />
            </label>
            <label>Expiration date <span className="optional-label">(optional)</span>
              <input type="date" value={form.expiresOn} onChange={(event) => setForm((current) => ({ ...current, expiresOn: event.target.value }))} />
            </label>
            {error && <p className="inline-error">{error}</p>}
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Cancel</button>
              <button type="submit" className="small-primary" disabled={busyId !== ""}>{busyId ? "Saving..." : editing ? "Save changes" : "Create code"}</button>
            </div>
          </form>
        </Dialog>
      )}

      {deleting && (
        <Dialog title="Delete invitation?" onClose={() => setDeleting(null)}>
          <div className="dialog-form">
            <p className="dialog-description">Permanently delete <strong>{deleting.code}</strong>? Anyone who has not used it will no longer be able to sign up with this code.</p>
            {error && <p className="inline-error">{error}</p>}
            <div className="dialog-actions">
              <button className="secondary-button" onClick={() => setDeleting(null)}>Cancel</button>
              <button className="danger-button" disabled={busyId === deleting.id} onClick={() => void deleteInvitation()}><Trash2 size={14} /> {busyId === deleting.id ? "Deleting..." : "Delete code"}</button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
