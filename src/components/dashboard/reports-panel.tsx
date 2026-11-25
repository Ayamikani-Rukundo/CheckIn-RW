"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Download, Eye, FileSpreadsheet, FileText } from "lucide-react";
import { Dialog } from "@/components/dashboard/dialog";
import type { AttendanceRecord, AttendanceSession, Student } from "@/lib/dashboard-types";

type Props = {
  students: Student[];
  sessions: AttendanceSession[];
  records: AttendanceRecord[];
};
type DownloadFormat = "pdf" | "xlsx" | "csv";
type ReportTarget = {
  key: string;
  layout: "register" | "summary";
  sessionId: string | "all";
  title: string;
  subtitle: string;
};
type SummaryRow = {
  session: AttendanceSession;
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  attended: number;
  rate: number;
};

function summarize(session: AttendanceSession, records: AttendanceRecord[]): SummaryRow {
  const marks = records.filter((record) => record.session_id === session.id);
  const count = (status: AttendanceRecord["status"]) => marks.filter((record) => record.status === status).length;
  const present = count("present");
  const late = count("late");
  const attended = present + late;
  return {
    session,
    total: marks.length,
    present,
    late,
    absent: count("absent"),
    excused: count("excused"),
    attended,
    rate: marks.length ? Math.round((attended / marks.length) * 100) : 0,
  };
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReportsPanel({ students, sessions, records }: Props) {
  const [formatRequest, setFormatRequest] = useState<{ target: ReportTarget; action: "preview" | "download" } | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<DownloadFormat | "">("");
  const [preview, setPreview] = useState<{ target: ReportTarget; format: DownloadFormat } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const allSummaries = useMemo(
    () => sessions.map((session) => summarize(session, records)),
    [records, sessions],
  );
  const reportTargets = useMemo<ReportTarget[]>(() => [
    {
      key: "all-summary",
      layout: "summary",
      sessionId: "all",
      title: "Attendance summary",
      subtitle: "Combined attendance results from all recorded sessions",
    },
    ...sessions.map((session) => ({
      key: session.id,
      layout: "register" as const,
      sessionId: session.id,
      title: `${session.title} register`,
      subtitle: `${session.session_type} · ${format(parseISO(session.session_date), "d MMMM yyyy")}`,
    })),
  ], [sessions]);

  function requestReport(target: ReportTarget, action: "preview" | "download") {
    setError("");
    setSelectedFormat("");
    setFormatRequest({ target, action });
  }

  const previewData = useMemo(() => {
    if (!preview) return null;
    if (preview.target.layout === "summary") {
      const summaries = preview.target.sessionId === "all"
        ? allSummaries
        : allSummaries.filter((summary) => summary.session.id === preview.target.sessionId);
      return {
        headers: ["Date", "Session", "Gathering", "Marked", "Present", "Late", "Absent", "Excused", "Rate"],
        rows: summaries.map((summary) => [
          format(parseISO(summary.session.session_date), "d MMM yyyy"),
          summary.session.title,
          summary.session.session_type,
          summary.total,
          summary.present,
          summary.late,
          summary.absent,
          summary.excused,
          `${summary.rate}%`,
        ]),
      };
    }

    const targetSession = sessions.find((session) => session.id === preview.target.sessionId);
    const studentById = new Map(students.map((student) => [student.id, student]));
    const registerRows = records
      .filter((record) => record.session_id === targetSession?.id)
      .flatMap((record, index) => {
        const student = studentById.get(record.student_id);
        return student ? [[
          index + 1,
          student.full_name,
          student.ministry || "Sunday School",
          student.registration_number || "—",
          record.status,
        ] as (string | number)[]] : [];
      })
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    return {
      headers: ["No.", "Student", "Group / ministry", "Registration no.", "Attendance"],
      rows: registerRows.map((row, index) => [index + 1, ...row.slice(1)]),
    };
  }, [allSummaries, preview, records, sessions, students]);

  async function downloadReport(target: ReportTarget, fileFormat: DownloadFormat) {
    setDownloading(true);
    setError("");
    const session = sessions.find((item) => item.id === target.sessionId);
    const summaryRows = target.layout === "summary"
      ? target.sessionId === "all"
        ? allSummaries
        : allSummaries.filter((summary) => summary.session.id === target.sessionId)
      : [];
    const studentById = new Map(students.map((student) => [student.id, student]));
    const rows = target.layout === "register"
      ? records
        .filter((record) => record.session_id === session?.id)
        .flatMap((record, index) => {
          const student = studentById.get(record.student_id);
          return student ? [{
            number: index + 1,
            name: student.full_name,
            group: student.ministry || "Sunday School",
            registration: student.registration_number || "—",
            status: record.status,
          }] : [];
        })
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((row, index) => [index + 1, row.name, row.group, row.registration, row.status] as (string | number)[])
      : summaryRows.map((summary) => [
        format(parseISO(summary.session.session_date), "d MMM yyyy"),
        summary.session.title,
        summary.session.session_type,
        summary.total,
        summary.present,
        summary.late,
        summary.absent,
        summary.excused,
        `${summary.rate}%`,
      ] as (string | number)[]);
    const headers = target.layout === "register"
      ? ["No.", "Student", "Group / ministry", "Registration no.", "Attendance"]
      : ["Date", "Session", "Gathering", "Marked", "Present", "Late", "Absent", "Excused", "Rate"];
    const fileBase = `nls-${target.layout === "register" ? "attendance-register" : "attendance-summary"}-${target.sessionId === "all" ? "all-sessions" : format(parseISO(session!.session_date), "yyyy-MM-dd")}`;

    try {
      if (fileFormat === "csv") {
        const content = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
        saveBlob(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }), `${fileBase}.csv`);
      } else if (fileFormat === "xlsx") {
        const { default: ExcelJS } = await import("exceljs");
        const workbook = new ExcelJS.Workbook();
        workbook.creator = "NLS Christian Fellowship";
        const sheet = workbook.addWorksheet("Attendance");
        sheet.addRow(["NLS CHRISTIAN FELLOWSHIP"]);
        sheet.addRow([target.title]);
        sheet.addRow([target.subtitle]);
        sheet.addRow([]);
        const header = sheet.addRow(headers);
        header.font = { bold: true, color: { argb: "FFFFFFFF" } };
        header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF092B63" } };
        rows.forEach((row) => sheet.addRow(row));
        sheet.columns = headers.map((headerText, index) => ({
          width: Math.min(34, rows.reduce(
            (widest, row) => Math.max(widest, String(row[index] ?? "").length + 2),
            headerText.length + 3,
          )),
        }));
        const buffer = await workbook.xlsx.writeBuffer();
        saveBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileBase}.xlsx`);
      } else {
        const [{ jsPDF }, { default: autoTable }] = await Promise.all([
          import("jspdf"),
          import("jspdf-autotable"),
        ]);
        const doc = new jsPDF({ orientation: target.layout === "summary" ? "landscape" : "portrait", unit: "pt" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(9, 43, 99);
        doc.text("NLS CHRISTIAN FELLOWSHIP", 40, 40);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(55, 65, 81);
        doc.text(target.title, 40, 59);
        doc.setFontSize(8);
        doc.setTextColor(110, 120, 135);
        doc.text(target.subtitle, 40, 74);
        autoTable(doc, {
          startY: 88,
          head: [headers],
          body: rows,
          styles: { font: "helvetica", fontSize: target.layout === "summary" ? 7 : 9, cellPadding: 5 },
          headStyles: { fillColor: [9, 43, 99], textColor: [255, 255, 255] },
          alternateRowStyles: { fillColor: [245, 248, 252] },
          margin: { left: 40, right: 40 },
        });
        doc.save(`${fileBase}.pdf`);
      }
      setFormatRequest(null);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "The report could not be downloaded.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="reports-page">
      <section className="report-list">
        <div className="reports-intro">
          <div><h2>Available reports</h2><p>Choose a report, then preview it or download it in your preferred format.</p></div>
          <span>{reportTargets.length} reports</span>
        </div>
        <article className="report-list-item report-summary-item">
          <div className="report-type-icon"><FileSpreadsheet size={17} /></div>
          <div className="report-list-copy"><strong>Attendance summary</strong><small>Combined totals and attendance rates across all sessions</small></div>
          <div className="report-list-actions">
            <button className="secondary-button" onClick={() => requestReport(reportTargets[0], "preview")}><Eye size={14} /> Preview</button>
            <button className="small-primary" onClick={() => requestReport(reportTargets[0], "download")}><Download size={14} /> Download</button>
          </div>
        </article>
        {sessions.map((session) => {
          const target = reportTargets.find((report) => report.sessionId === session.id);
          if (!target) return null;
          const total = records.filter((record) => record.session_id === session.id).length;
          return (
            <article className="report-list-item" key={session.id}>
              <div className="report-type-icon session"><FileText size={17} /></div>
              <div className="report-list-copy">
                <strong>{session.title} attendance register</strong>
                <small>{format(parseISO(session.session_date), "d MMM yyyy")} · {session.session_type} · {total} students marked</small>
              </div>
              <div className="report-list-actions">
                <button className="secondary-button" onClick={() => requestReport(target, "preview")}><Eye size={14} /> Preview</button>
                <button className="small-primary" onClick={() => requestReport(target, "download")}><Download size={14} /> Download</button>
              </div>
            </article>
          );
        })}
        {!sessions.length && <div className="reports-empty">No attendance sessions yet. Create a session first and its report will appear here.</div>}
      </section>

      {error && <div className="portal-inline-error">{error}</div>}

      {formatRequest && (
        <Dialog
          title={formatRequest.action === "preview" ? "Preview report" : "Download report"}
          onClose={() => setFormatRequest(null)}
          className="format-dialog"
        >
          <div className="dialog-form">
            <p className="dialog-description"><strong>{formatRequest.target.title}</strong><br />{formatRequest.target.subtitle}<br /><br />Choose the report format to continue.</p>
            <div className="format-options">
              {([
                ["pdf", "PDF", "Best for printing and sharing", FileText],
                ["xlsx", "Excel", "Open and edit in a spreadsheet", FileSpreadsheet],
                ["csv", "CSV", "Simple spreadsheet data", FileSpreadsheet],
              ] as const).map(([value, name, description, Icon]) => (
                <button
                  type="button"
                  className={selectedFormat === value ? "format-option selected" : "format-option"}
                  onClick={() => setSelectedFormat(value)}
                  key={value}
                >
                  <Icon size={16} /><span><strong>{name}</strong><small>{description}</small></span><i />
                </button>
              ))}
            </div>
            {error && <p className="inline-error">{error}</p>}
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setFormatRequest(null)}>Cancel</button>
              {formatRequest.action === "preview"
                ? <button className="small-primary" disabled={!selectedFormat} onClick={() => {
                  if (selectedFormat) {
                    setPreview({ target: formatRequest.target, format: selectedFormat });
                    setFormatRequest(null);
                  }
                }}><Eye size={14} /> Preview {selectedFormat ? selectedFormat.toUpperCase() : ""}</button>
                : <button className="small-primary" disabled={!selectedFormat || downloading} onClick={() => {
                  if (selectedFormat) void downloadReport(formatRequest.target, selectedFormat);
                }}><Download size={14} /> {downloading ? "Preparing..." : `Download ${selectedFormat ? selectedFormat.toUpperCase() : ""}`}</button>}
            </div>
          </div>
        </Dialog>
      )}

      {preview && previewData && (
        <Dialog title="Report preview" onClose={() => setPreview(null)} className="preview-dialog">
          <div className="preview-dialog-toolbar">
            <div><strong>{preview.target.title}</strong><small>{preview.target.subtitle} · {preview.format.toUpperCase()} layout</small></div>
            <button className="small-primary" onClick={() => {
              const target = preview.target;
              setPreview(null);
              requestReport(target, "download");
            }}><Download size={14} /> Download</button>
          </div>
          <article className="report-paper modal-report-paper">
            <header className="report-paper-header">
              <div className="report-emblem">N</div>
              <div><strong>NLS CHRISTIAN FELLOWSHIP</strong><small>ATTENDANCE MANAGEMENT INFORMATION SYSTEM</small></div>
              <time>{format(new Date(), "d MMM yyyy")}</time>
            </header>
            <div className="report-paper-title"><h2>{preview.target.title}</h2><p>{preview.target.subtitle}</p></div>
            <div className="table-wrap">
              <table className="data-table report-table">
                <thead><tr>{previewData.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
                <tbody>
                  {previewData.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => (
                    <td className={cellIndex === 1 ? "name-cell" : ""} key={cellIndex}>
                      {preview.target.layout === "register" && cellIndex === 4
                        ? <span className={`status-tag status-${cell}`}>{cell}</span>
                        : cell}
                    </td>
                  ))}</tr>)}
                  {!previewData.rows.length && <tr><td className="empty-row" colSpan={previewData.headers.length}>No records in this report yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <footer className="report-paper-footer"><span>NLS Attendance MIS</span><span>{previewData.rows.length} {preview.target.layout === "register" ? "students" : "sessions"}</span></footer>
          </article>
        </Dialog>
      )}
    </div>
  );
}
