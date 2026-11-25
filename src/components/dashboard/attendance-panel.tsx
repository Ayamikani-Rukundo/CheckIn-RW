"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Check, Plus, Trash2 } from "lucide-react";
import { Dialog } from "@/components/dashboard/dialog";
import { createClient } from "@/lib/supabase/client";
import type { AttendanceRecord, AttendanceSession, Student, UserProfile } from "@/lib/dashboard-types";

type Props = {
  profile: UserProfile;
  students: Student[];
  sessions: AttendanceSession[];
  records: AttendanceRecord[];
  onChanged: () => Promise<void>;
};

const today = () => format(new Date(), "yyyy-MM-dd");
const statuses = ["present", "absent", "late", "excused"] as const;

export function AttendancePanel({ profile, students, sessions, records, onChanged }: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [deleting, setDeleting] = useState<AttendanceSession | null>(null);
  const [title, setTitle] = useState("Sunday Service");
  const [sessionType, setSessionType] = useState("Sunday Service");
  const [date, setDate] = useState(today);
  const [draft, setDraft] = useState<Record<string, AttendanceRecord["status"]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canEdit = profile.role === "Super Admin" || profile.can_edit_records;
  const canAdd = profile.role === "Super Admin" || profile.can_add_records;
  const isAdmin = profile.role === "Super Admin";
  const orderedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.session_date.localeCompare(a.session_date)),
    [sessions],
  );
  const selectedSession = orderedSessions.find((session) => session.id === selectedId) || orderedSessions[0];
  const sessionRecords = records.filter((record) => record.session_id === selectedSession?.id);

  function chooseSession(id: string) {
    setSelectedId(id);
    setError("");
    const nextDraft: Record<string, AttendanceRecord["status"]> = {};
    for (const record of records) {
      if (record.session_id === id) nextDraft[record.student_id] = record.status;
    }
    setDraft(nextDraft);
  }

  async function createSession(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!title.trim() || !date) {
      setError("Enter a session name and date.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { data: session, error: sessionError } = await supabase
      .from("attendance_sessions")
      .insert({
        title: title.trim(),
        session_date: date,
        session_type: sessionType,
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      setBusy(false);
      setError(sessionError?.message || "Could not create the attendance session.");
      return;
    }
    if (students.length) {
      const { error: recordsError } = await supabase.from("attendance_records").insert(
        students.map((student) => ({
          session_id: session.id,
          student_id: student.id,
          status: "absent",
          recorded_by: profile.id,
        })),
      );
      if (recordsError) {
        setBusy(false);
        setError(`Session created, but its attendance list could not be initialized: ${recordsError.message}`);
        await onChanged();
        return;
      }
    }
    setBusy(false);
    setShowNew(false);
    setSelectedId(session.id);
    await onChanged();
  }

  async function deleteSession() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    const { error: deleteError } = await createClient()
      .from("attendance_sessions")
      .delete()
      .eq("id", deleting.id)
      .select("id")
      .single();
    setBusy(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    if (selectedId === deleting.id) {
      setSelectedId("");
      setDraft({});
    }
    setDeleting(null);
    await onChanged();
  }

  async function initializeRecords() {
    if (!selectedSession || !students.length) return;
    setBusy(true);
    setError("");
    const existing = new Set(sessionRecords.map((record) => record.student_id));
    const missing = students.filter((student) => !existing.has(student.id));
    if (missing.length) {
      const { error: insertError } = await createClient().from("attendance_records").insert(
        missing.map((student) => ({
          session_id: selectedSession.id,
          student_id: student.id,
          status: "absent",
          recorded_by: profile.id,
        })),
      );
      if (insertError) {
        setBusy(false);
        setError(insertError.message);
        return;
      }
    }
    setBusy(false);
    await onChanged();
  }

  async function saveAttendance() {
    setBusy(true);
    setError("");
    const changed = sessionRecords.filter((record) => draft[record.student_id] && draft[record.student_id] !== record.status);
    const results = await Promise.all(changed.map((record) =>
      createClient()
        .from("attendance_records")
        .update({ status: draft[record.student_id], updated_at: new Date().toISOString() })
        .eq("id", record.id)
        .select("id")
        .single(),
    ));
    const failed = results.find((result) => result.error);
    setBusy(false);
    if (failed?.error) {
      setError(failed.error.message);
      return;
    }
    await onChanged();
  }

  return (
    <div className="attendance-layout">
      <section className="panel records-panel session-list-panel">
        <div className="panel-heading"><div><h2>Attendance sessions</h2><p>{sessions.length} recorded</p></div>
          {canAdd && <button className="small-primary" onClick={() => { setShowNew(true); setError(""); }}><Plus size={14} /> New session</button>}
        </div>
        <div className="session-list">
          {orderedSessions.map((session) => (
            <div className="session-select-row" key={session.id}>
              <button className={selectedSession?.id === session.id ? "session-select active" : "session-select"} onClick={() => chooseSession(session.id)}>
                <span><strong>{session.title}</strong><small>{session.session_type}</small></span>
                <time>{format(parseISO(session.session_date), "d MMM yyyy")}</time>
              </button>
              {isAdmin && <button className="icon-action delete-action session-delete" onClick={() => { setDeleting(session); setError(""); }} aria-label={`Delete ${session.title}`} title="Delete session"><Trash2 size={13} /></button>}
            </div>
          ))}
          {!orderedSessions.length && <p className="empty-note">No sessions yet. Create one to start taking attendance.</p>}
        </div>
      </section>

      <section className="panel records-panel mark-panel">
        <div className="panel-heading"><div><h2>{selectedSession?.title || "Attendance register"}</h2><p>{selectedSession ? format(parseISO(selectedSession.session_date), "EEEE, d MMMM yyyy") : "Select or create a session"}</p></div>
          {canEdit && selectedSession && sessionRecords.length > 0 && <button className="small-primary" onClick={saveAttendance} disabled={busy}><Check size={14} /> {busy ? "Saving..." : "Save marks"}</button>}
        </div>
        {error && <p className="inline-error mark-error">{error}</p>}
        {selectedSession && sessionRecords.length < students.length && canAdd && students.length > 0 && (
          <div className="initialize-callout"><span>Some students are not on this register.</span><button onClick={initializeRecords} disabled={busy}>Add missing students</button></div>
        )}
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Student</th><th>Group</th><th>Status</th></tr></thead>
            <tbody>
              {sessionRecords.map((record) => {
                const student = students.find((item) => item.id === record.student_id);
                if (!student) return null;
                const status = draft[record.student_id] || record.status;
                return <tr key={record.id}><td className="name-cell">{student.full_name}</td><td>{student.ministry}</td><td>
                  {canEdit
                    ? <select className={`status-select status-${status}`} value={status} onChange={(event) => setDraft({ ...draft, [record.student_id]: event.target.value as AttendanceRecord["status"] })}>{statuses.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select>
                    : <span className={`status-tag status-${status}`}>{status}</span>}
                </td></tr>;
              })}
              {selectedSession && !sessionRecords.length && <tr><td className="empty-row" colSpan={3}>This session has no attendance list yet.</td></tr>}
              {!selectedSession && <tr><td className="empty-row" colSpan={3}>Create or select an attendance session.</td></tr>}
              {selectedSession && sessionRecords.length > 0 && <tr className="table-summary"><td colSpan={3}>{sessionRecords.filter((record) => (draft[record.student_id] || record.status) === "present" || (draft[record.student_id] || record.status) === "late").length} present or late · {sessionRecords.length} students marked</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {showNew && (
        <Dialog title="New attendance session" onClose={() => setShowNew(false)} className="student-dialog">
          <form className="dialog-form" onSubmit={createSession}>
            <p className="dialog-description">Choose the gathering and date. The register will include all active students.</p>
            {error && <p className="inline-error">{error}</p>}
            <label>Session name<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
            <label>Gathering type<select value={sessionType} onChange={(event) => { setSessionType(event.target.value); setTitle(event.target.value); }}><option>Sunday Service</option><option>Sunday School</option><option>Bible Study</option><option>Other</option></select></label>
            <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setShowNew(false)}>Cancel</button>
              <button className="small-primary" type="submit" disabled={busy}><Check size={14} /> {busy ? "Creating..." : "Create session"}</button>
            </div>
          </form>
        </Dialog>
      )}
      {deleting && (
        <Dialog title="Delete attendance session?" onClose={() => setDeleting(null)}>
          <div className="dialog-form">
            <p className="dialog-description">Delete <strong>{deleting.title}</strong> and all attendance marks recorded for it? This cannot be undone.</p>
            {error && <p className="inline-error">{error}</p>}
            <div className="dialog-actions">
              <button className="secondary-button" onClick={() => setDeleting(null)}>Cancel</button>
              <button className="danger-button" onClick={deleteSession} disabled={busy}><Trash2 size={14} /> {busy ? "Deleting..." : "Delete session"}</button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
