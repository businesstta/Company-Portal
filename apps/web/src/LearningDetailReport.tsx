import { useEffect, useMemo, useState } from "react";
import "./learning-detail-report.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

type LearningRow = {
  employee_id: string; employee_no: string; employee_name: string; department: string | null; organization: string | null; project_location: string | null; position: string | null;
  course_code: string; course_title: string; course_status: string; total_contents: number; completed_contents: number;
  progress_percentage: number; final_attempts: number; best_score: number | null;
  learning_status: "not_started" | "in_progress" | "completed";
};

const statusLabel = (status: LearningRow["learning_status"]) =>
  status === "not_started" ? "Not Started" : status === "in_progress" ? "In Progress" : "Completed";

export default function LearningDetailReport({ token }: { token: string }) {
  const [rows, setRows] = useState<LearningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ search: "", department: "", course: "", status: "" });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch(`${API}/reports/learning-detail`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Unable to load the learning report"); return response.json(); })
      .then(data => setRows(Array.isArray(data) ? data : []))
      .catch(reason => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "Unable to load the learning report"); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [token]);

  const departments = useMemo(() => [...new Set(rows.map(row => row.department).filter(Boolean) as string[])].sort(), [rows]);
  const courses = useMemo(() => [...new Map(rows.map(row => [row.course_code, row.course_title])).entries()], [rows]);
  const filtered = useMemo(() => rows.filter(row => {
    const search = filters.search.trim().toLowerCase();
    return (!search || `${row.employee_no} ${row.employee_name} ${row.position ?? ""}`.toLowerCase().includes(search)) &&
      (!filters.department || row.department === filters.department) && (!filters.course || row.course_code === filters.course) &&
      (!filters.status || row.learning_status === filters.status);
  }), [rows, filters]);

  const employees = new Set(filtered.map(row => row.employee_id)).size;
  const completed = filtered.filter(row => row.learning_status === "completed").length;
  const inProgress = filtered.filter(row => row.learning_status === "in_progress").length;
  const notStarted = filtered.filter(row => row.learning_status === "not_started").length;
  const averageProgress = filtered.length ? Math.round(filtered.reduce((sum, row) => sum + Number(row.progress_percentage), 0) / filtered.length) : 0;
  const scored = filtered.filter(row => row.best_score !== null);
  const averageScore = scored.length ? Math.round(scored.reduce((sum, row) => sum + Number(row.best_score), 0) / scored.length) : 0;
  const charts = [
    { title: "Learning progress", value: averageProgress, note: "Average completion", tone: "purple" },
    { title: "Completion mix", value: filtered.length ? Math.round(completed / filtered.length * 100) : 0, note: `${completed} completed assignments`, tone: "green" },
    { title: "Learner activity", value: filtered.length ? Math.round((completed + inProgress) / filtered.length * 100) : 0, note: `${inProgress} currently in progress`, tone: "blue" },
    { title: "Assessment performance", value: averageScore, note: "Average best final score", tone: "orange" },
  ];
  const counts: [string, number][] = [["Employees", employees], ["Course Assignments", filtered.length], ["Completed", completed], ["In Progress", inProgress], ["Not Started", notStarted]];

  return <div className="learning-detail-report">
    <div className="page-title learning-report-title"><div><p>HUMAN RESOURCES · LEARNING MANAGEMENT</p><h1>L&amp;D Detail Report</h1><span>Monitor employee learning progress, completion and assessment performance.</span></div></div>
    <section className="learning-chart-grid" aria-label="Learning charts">{charts.map(chart => <article key={chart.title} className={`learning-chart-card ${chart.tone}`}><header><div><small>OVERVIEW</small><h2>{chart.title}</h2></div><b>{chart.value}%</b></header><div className="learning-chart-visual"><div className="learning-chart-track"><i style={{ width: `${chart.value}%` }} /></div><div className="learning-chart-columns">{[52, 67, 44, 78, 62, chart.value].map((height, index) => <i key={index} style={{ height: `${Math.max(12, height)}%` }} />)}</div></div><p>{chart.note}</p></article>)}</section>
    <section className="learning-count-grid" aria-label="Learning counts">{counts.map(([title, value], index) => <article key={title}><span>{index + 1}</span><div><b>{value.toLocaleString()}</b><small>{title}</small></div></article>)}</section>
    <section className="learning-report-filters"><header><div><small>REPORT CONTROLS</small><h2>Filter employee learning data</h2></div><button type="button" onClick={() => setFilters({ search: "", department: "", course: "", status: "" })}>Clear filters</button></header><div>
      <label>Employee<input value={filters.search} placeholder="ID, name or position" onChange={event => setFilters({ ...filters, search: event.target.value })} /></label>
      <label>Department<select value={filters.department} onChange={event => setFilters({ ...filters, department: event.target.value })}><option value="">All departments</option>{departments.map(department => <option key={department}>{department}</option>)}</select></label>
      <label>Course<select value={filters.course} onChange={event => setFilters({ ...filters, course: event.target.value })}><option value="">All courses</option>{courses.map(([code, title]) => <option key={code} value={code}>{code} · {title}</option>)}</select></label>
      <label>Learning Status<select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option><option value="not_started">Not Started</option><option value="in_progress">In Progress</option><option value="completed">Completed</option></select></label>
    </div></section>
    <section className="learning-report-table"><header><div><small>EMPLOYEE DATA</small><h2>Learning Management details</h2></div><span>{filtered.length.toLocaleString()} records</span></header><div className="learning-table-scroll"><table><thead><tr><th>Employee ID</th><th>Employee</th><th>Department</th><th>Organization</th><th>Project Location</th><th>Position</th><th>Course</th><th>Progress</th><th>Final Attempts</th><th>Best Score</th><th>Status</th></tr></thead><tbody>{filtered.map(row => <tr key={`${row.employee_id}-${row.course_code}`}><td><b>{row.employee_no}</b></td><td>{row.employee_name}</td><td>{row.department ?? "—"}</td><td>{row.organization ?? "—"}</td><td>{row.project_location ?? "—"}</td><td>{row.position ?? "—"}</td><td><b>{row.course_title}</b><small>{row.course_code}</small></td><td><div className="learning-progress"><span><i style={{ width: `${row.progress_percentage}%` }} /></span><b>{row.progress_percentage}%</b></div></td><td>{row.final_attempts}</td><td>{row.best_score === null ? "—" : `${row.best_score}%`}</td><td><span className={`learning-status ${row.learning_status}`}>{statusLabel(row.learning_status)}</span></td></tr>)}</tbody></table></div>
      {loading && <div className="learning-report-state">Loading learning report…</div>}{!loading && error && <div className="learning-report-state error">{error}</div>}{!loading && !error && !filtered.length && <div className="learning-report-state">No learning records match the selected filters.</div>}
    </section>
  </div>;
}
