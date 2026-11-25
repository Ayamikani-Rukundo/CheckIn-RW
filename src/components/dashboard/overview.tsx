"use client";

import { useMemo } from "react";
import { format, isSameDay, isSameMonth, parseISO, subWeeks } from "date-fns";
import { CalendarDays, Users, UserCheck, TrendingUp } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import type { AttendanceRecord, AttendanceSession, Student } from "@/lib/dashboard-types";

const PIE_COLORS: Record<string, string> = {
  Present: "#0755b8",
  Absent: "#d92735",
  Late: "#e7a839",
  Excused: "#91a0b5",
};

export function Overview({
  students,
  sessions,
  records,
}: {
  students: Student[];
  sessions: AttendanceSession[];
  records: AttendanceRecord[];
}) {
  const summaries = useMemo(() => sessions.map((session) => {
    const sessionRecords = records.filter((record) => record.session_id === session.id);
    const counts = sessionRecords.reduce<Record<string, number>>((totals, record) => {
      totals[record.status] = (totals[record.status] || 0) + 1;
      return totals;
    }, {});
    const attended = (counts.present || 0) + (counts.late || 0);
    return {
      ...session,
      present: counts.present || 0,
      late: counts.late || 0,
      absent: counts.absent || 0,
      excused: counts.excused || 0,
      attended,
      total: sessionRecords.length,
      rate: sessionRecords.length
        ? Math.round((attended / sessionRecords.length) * 100)
        : 0,
    };
  }), [records, sessions]);

  const now = new Date();
  const todaySessions = summaries.filter((session) => isSameDay(parseISO(session.session_date), now));
  const todayPresent = todaySessions.reduce((total, session) => total + session.attended, 0);
  const monthSessions = summaries.filter((session) => isSameMonth(parseISO(session.session_date), now));
  const measuredSummaries = summaries.filter((session) => session.total > 0);
  const average = measuredSummaries.length
    ? Math.round(measuredSummaries.reduce((total, session) => total + session.rate, 0) / measuredSummaries.length)
    : 0;
  const chartData = measuredSummaries.slice(0, 8).reverse().map((session) => ({
    name: format(parseISO(session.session_date), "d MMM"),
    Present: session.present,
    Late: session.late,
    Absent: session.absent,
    Excused: session.excused,
  }));
  const statusTotals = records
    .filter((record) => {
      const session = sessions.find((item) => item.id === record.session_id);
      return session && parseISO(session.session_date) >= subWeeks(now, 8);
    })
    .reduce<Record<string, number>>((totals, record) => {
      totals[record.status] = (totals[record.status] || 0) + 1;
      return totals;
    }, {});
  const pieData = [
    { name: "Present", value: statusTotals.present || 0 },
    { name: "Absent", value: statusTotals.absent || 0 },
    { name: "Late", value: statusTotals.late || 0 },
    { name: "Excused", value: statusTotals.excused || 0 },
  ].filter((item) => item.value > 0);

  const cards = [
    { label: "Active students", value: students.length.toLocaleString(), detail: "Current register", icon: Users, tone: "blue" },
    { label: "Present / late today", value: todayPresent.toLocaleString(), detail: `${todaySessions.length} attendance session${todaySessions.length === 1 ? "" : "s"}`, icon: UserCheck, tone: "green" },
    { label: "Sessions this month", value: monthSessions.length.toLocaleString(), detail: format(now, "MMMM yyyy"), icon: CalendarDays, tone: "violet" },
    { label: "Average attendance", value: `${average}%`, detail: "Across recorded sessions", icon: TrendingUp, tone: "red" },
  ];

  return (
    <>
      <div className="stat-grid">
        {cards.map(({ label, value, detail, icon: Icon, tone }) => (
          <article className="stat-card" key={label}>
            <div className={`stat-icon ${tone}`}><Icon size={16} /></div>
            <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel analytics-panel">
          <div className="panel-heading"><div><h2>Attendance by session</h2><p>Present, late, absent and excused · latest sessions</p></div></div>
          {chartData.length ? (
            <div className="chart-area">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 6, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9edf3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#8290a3" }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#8290a3" }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="Present" fill="#0755b8" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Late" fill="#e7a839" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Absent" fill="#d9e2ef" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Excused" fill="#91a0b5" radius={[3, 3, 0, 0]} />
                  <Legend wrapperStyle={{ fontSize: 9, paddingTop: 1 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="chart-empty">Attendance charts will appear when sessions have been recorded.</div>}
        </section>
        <section className="panel analytics-panel">
          <div className="panel-heading"><div><h2>Attendance breakdown</h2><p>Recorded marks · last 8 weeks</p></div></div>
          {pieData.length ? (
            <div className="pie-layout">
              <div className="pie-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={2}>
                      {pieData.map((entry) => <Cell key={entry.name} fill={PIE_COLORS[entry.name]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="pie-legend">
                {pieData.map((item) => <div key={item.name}><i style={{ background: PIE_COLORS[item.name] }} /><span>{item.name}</span><strong>{item.value}</strong></div>)}
              </div>
            </div>
          ) : <div className="chart-empty">No attendance marks recorded yet.</div>}
        </section>
      </div>
      <section className="panel recent-panel">
        <div className="panel-heading"><div><h2>Recent sessions</h2><p>Attendance results from your database</p></div></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Session</th><th>Date</th><th>Attended</th><th>Attendance</th></tr></thead>
            <tbody>
              {summaries.slice(0, 6).map((session) => (
                <tr key={session.id}><td>{session.title}</td><td>{format(parseISO(session.session_date), "d MMM yyyy")}</td><td>{session.attended} / {session.total}</td><td><span className="rate-pill">{session.rate}%</span></td></tr>
              ))}
              {!summaries.length && <tr><td className="empty-row" colSpan={4}>No sessions recorded yet. Create an attendance session to begin.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
