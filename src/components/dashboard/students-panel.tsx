"use client";

import { useMemo, useState } from "react";
import { Check, ContactRound, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Dialog } from "@/components/dashboard/dialog";
import { createClient } from "@/lib/supabase/client";
import type { Student, StudentContact, UserProfile } from "@/lib/dashboard-types";

type Props = {
  profile: UserProfile;
  students: Student[];
  onChanged: () => Promise<void>;
};

const blankForm = { full_name: "", ministry: "Sunday School" };
const blankContact: StudentContact = { type: "Phone number", value: "" };

export function StudentsPanel({ profile, students, onChanged }: Props) {
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(blankForm);
  const [editing, setEditing] = useState<Student | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [viewingContacts, setViewingContacts] = useState<Student | null>(null);
  const [wantsContacts, setWantsContacts] = useState(false);
  const [contactDraft, setContactDraft] = useState<StudentContact[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isAdmin = profile.role === "Super Admin";
  const canEdit = isAdmin || profile.can_edit_records;
  const canAdd = isAdmin || profile.can_add_records;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter((student) =>
      !query || [student.full_name, student.ministry, student.registration_number]
        .some((value) => value?.toLowerCase().includes(query)),
    );
  }, [search, students]);

  function openAdd() {
    setForm(blankForm);
    setEditing(null);
    setContactDraft([]);
    setWantsContacts(false);
    setError("");
    setAdding(true);
  }

  function openEdit(student: Student) {
    setForm({ full_name: student.full_name, ministry: student.ministry || "Sunday School" });
    const savedContacts = student.contacts || [];
    setContactDraft(savedContacts.map((contact) => ({ ...contact })));
    setWantsContacts(savedContacts.length > 0);
    setEditing(student);
    setAdding(false);
    setError("");
  }

  function closeForm() {
    setAdding(false);
    setEditing(null);
    setError("");
  }

  async function saveStudent(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!form.full_name.trim()) {
      setError("Enter the student's name.");
      return;
    }
    const contacts = wantsContacts
      ? contactDraft.map((contact) => ({
        ...contact,
        value: contact.value.trim(),
        ...(contact.type === "Other" ? { label: contact.label?.trim() || "" } : {}),
      }))
      : [];
    if (contacts.some((contact) => !contact.value || (contact.type === "Other" && !contact.label))) {
      setError("Complete each contact detail or remove the empty contact.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const values = {
      full_name: form.full_name.trim(),
      ministry: form.ministry.trim() || "Sunday School",
      contacts,
      updated_at: new Date().toISOString(),
    };
    const result = editing
      ? await supabase.from("students").update(values).eq("id", editing.id).select("id").single()
      : await supabase.from("students").insert({ ...values, created_by: profile.id }).select("id").single();
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    closeForm();
    await onChanged();
  }

  async function deleteStudent() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    const { error: deleteError } = await createClient()
      .from("students")
      .delete()
      .eq("id", deleting.id)
      .select("id")
      .single();
    setBusy(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setDeleting(null);
    await onChanged();
  }

  return (
    <section className="panel records-panel">
      <div className="records-toolbar">
        <div className="record-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a student" /></div>
        {canAdd && <button className="small-primary" onClick={openAdd}><Plus size={14} /> Add student</button>}
      </div>
      {error && !adding && !editing && !deleting && <p className="inline-error">{error}</p>}
      <div className="table-wrap">
        <table className="data-table student-table">
          <thead><tr><th>Student</th><th>Group / ministry</th><th className="student-actions-heading">Actions</th></tr></thead>
          <tbody>
            {filtered.map((student) => (
              <tr key={student.id}>
                <td className="name-cell">{student.full_name}</td>
                <td>{student.ministry || "Sunday School"}</td>
                <td className="student-actions">
                  <button className="view-contacts-button" onClick={() => setViewingContacts(student)}><ContactRound size={13} /><span>View contacts</span></button>
                  {canEdit && <button className="icon-action" onClick={() => openEdit(student)} aria-label={`Edit ${student.full_name}`} title="Edit student"><Pencil size={14} /></button>}
                  {isAdmin && <button className="icon-action delete-action" onClick={() => { setDeleting(student); setError(""); }} aria-label={`Delete ${student.full_name}`} title="Delete student"><Trash2 size={14} /></button>}
                </td>
              </tr>
            ))}
          {!filtered.length && <tr><td className="empty-row" colSpan={3}>{students.length ? "No students match your search." : "No student records yet."}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="table-footer">{filtered.length} student{filtered.length === 1 ? "" : "s"}</div>

      {(adding || editing) && (
        <Dialog title={editing ? "Edit student" : "Add student"} onClose={closeForm} className="student-dialog">
          <form className="dialog-form" onSubmit={saveStudent}>
            <p className="dialog-description">{editing ? "Change the student's name, group, or optional contacts." : "Just the details needed to take attendance."}</p>
            {error && <p className="inline-error">{error}</p>}
            <label>Student name<input autoFocus value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} placeholder="Enter full name" required /></label>
            <label>Group / ministry <span className="optional-label">optional</span><input value={form.ministry} onChange={(event) => setForm({ ...form, ministry: event.target.value })} placeholder="Sunday School" /></label>
            <fieldset className="contact-question">
              <legend>Would you like to add parent/guardian contacts? <span>Optional</span></legend>
              <div className="contact-choice">
                <button type="button" className={wantsContacts ? "selected" : ""} onClick={() => setWantsContacts(true)}>Yes</button>
                <button type="button" className={!wantsContacts ? "selected" : ""} onClick={() => { setWantsContacts(false); setContactDraft([]); }}>No</button>
              </div>
            </fieldset>
            {wantsContacts && (
              <div className="contact-editor">
                {contactDraft.map((contact, index) => (
                  <div className="contact-entry" key={index}>
                    <div className="contact-entry-heading"><strong>Contact {index + 1}</strong><button type="button" onClick={() => setContactDraft(contactDraft.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove contact ${index + 1}`}><X size={14} /></button></div>
                    <label>Contact type<select value={contact.type} onChange={(event) => {
                      const next = [...contactDraft];
                      next[index] = { ...contact, type: event.target.value as StudentContact["type"] };
                      setContactDraft(next);
                    }}><option>Phone number</option><option>WhatsApp</option><option>Email</option><option>Other</option></select></label>
                    {contact.type === "Other" && <label>Contact name<input value={contact.label || ""} onChange={(event) => {
                      const next = [...contactDraft];
                      next[index] = { ...contact, label: event.target.value };
                      setContactDraft(next);
                    }} placeholder="For example: Telegram" /></label>}
                    <label>{contact.type === "Email" ? "Email address" : contact.type === "Other" ? "Contact detail" : "Phone number"}<input type={contact.type === "Email" ? "email" : "text"} value={contact.value} onChange={(event) => {
                      const next = [...contactDraft];
                      next[index] = { ...contact, value: event.target.value };
                      setContactDraft(next);
                    }} placeholder={contact.type === "Email" ? "name@example.com" : contact.type === "Other" ? "Enter contact detail" : "+1 234 567 890"} /></label>
                  </div>
                ))}
                <button type="button" className="add-contact-button" onClick={() => setContactDraft([...contactDraft, { ...blankContact }])}><Plus size={14} /> Add another contact</button>
              </div>
            )}
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={closeForm}>Cancel</button>
              <button className="small-primary" type="submit" disabled={busy}><Check size={14} /> {busy ? "Saving..." : editing ? "Save changes" : "Add student"}</button>
            </div>
          </form>
        </Dialog>
      )}

      {viewingContacts && (
        <Dialog title={`${viewingContacts.full_name} · Contacts`} onClose={() => setViewingContacts(null)}>
          <div className="student-contacts-view">
            {(() => {
              const contacts = [...(viewingContacts.contacts || [])];
              if (viewingContacts.guardian_phone && !contacts.some((contact) => contact.value === viewingContacts.guardian_phone)) {
                contacts.push({
                  type: "Phone number",
                  value: viewingContacts.guardian_phone,
                  label: viewingContacts.guardian_name || "Parent/guardian",
                });
              }
              return contacts.length
                ? contacts.map((contact, index) => (
                <div className="student-contact-row" key={`${contact.type}-${contact.value}-${index}`}>
                  <span>{contact.label ? `${contact.label} · ${contact.type}` : contact.type}</span>
                  <strong>{contact.value}</strong>
                </div>
              ))
                : <p className="dialog-description">No contact details have been added for this student.</p>;
            })()}
            <div className="dialog-actions"><button className="secondary-button" onClick={() => setViewingContacts(null)}>Close</button></div>
          </div>
        </Dialog>
      )}

      {deleting && (
        <Dialog title="Delete student?" onClose={() => setDeleting(null)}>
          <div className="dialog-form">
            <p className="dialog-description">Delete <strong>{deleting.full_name}</strong> and remove their attendance marks? This cannot be undone.</p>
            {error && <p className="inline-error">{error}</p>}
            <div className="dialog-actions">
              <button className="secondary-button" onClick={() => setDeleting(null)}>Cancel</button>
              <button className="danger-button" onClick={deleteStudent} disabled={busy}><Trash2 size={14} /> {busy ? "Deleting..." : "Delete student"}</button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
