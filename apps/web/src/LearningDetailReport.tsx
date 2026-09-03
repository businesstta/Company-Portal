import { useEffect, useMemo, useState, type ReactNode } from "react";
import "./learning-detail-report.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
const PAGE_SIZE = 25;

type LearningRow = {
  employee_id: string; employee_no: string; employee_name: string; department: string | null; organization: string | null;
  project_location: string | null; position: string | null; course_code: string; course_title: string; course_status: string;
  total_contents: number; completed_contents: number; progress_percentage: number; final_attempts: number; best_score: number | null;
  certificate_earned: boolean; learning_status: "not_started" | "in_progress" | "completed";
};
type NamedValue = { name: string; value: number };

const statusLabel = (status: LearningRow["learning_status"]) => status === "not_started" ? "Not Started" : status === "in_progress" ? "In Progress" : "Completed";
const uniqueValues = (rows: LearningRow[], key: "department" | "organization" | "project_location") => [...new Set(rows.map(row => row[key]).filter(Boolean) as string[])].sort();
const groupedAverage = (rows: LearningRow[], key: "department" | "organization") => {
  const groups = new Map<string, { total: number; count: number }>();
  rows.forEach(row => { const name = row[key] || "Unassigned"; const current = groups.get(name) ?? { total: 0, count: 0 }; current.total += Number(row.progress_percentage); current.count += 1; groups.set(name, current); });
  return [...groups.entries()].map(([name, item]) => ({ name, value: Math.round(item.total / item.count) })).sort((a, b) => b.value - a.value);
};

export default function LearningDetailReport({ token }: { token: string }) {
  const [rows, setRows] = useState<LearningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: "", department: "", organization: "", projectLocation: "", course: "", status: "" });

  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    fetch(`${API}/reports/learning-detail`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Unable to load the learning report"); return response.json(); })
      .then(data => setRows(Array.isArray(data) ? data : []))
      .catch(reason => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "Unable to load the learning report"); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [token]);

  const departments = useMemo(() => uniqueValues(rows, "department"), [rows]);
  const organizations = useMemo(() => uniqueValues(rows, "organization"), [rows]);
  const projectLocations = useMemo(() => uniqueValues(rows, "project_location"), [rows]);
  const courses = useMemo(() => [...new Map(rows.map(row => [row.course_code, row.course_title])).entries()], [rows]);
  const filtered = useMemo(() => rows.filter(row => {
    const search = filters.search.trim().toLowerCase();
    return (!search || `${row.employee_no} ${row.employee_name} ${row.position ?? ""}`.toLowerCase().includes(search)) &&
      (!filters.department || row.department === filters.department) && (!filters.organization || row.organization === filters.organization) &&
      (!filters.projectLocation || row.project_location === filters.projectLocation) && (!filters.course || row.course_code === filters.course) &&
      (!filters.status || row.learning_status === filters.status);
  }), [rows, filters]);
  useEffect(() => setPage(1), [filters]);

  const employeeProgress = useMemo(() => {
    const employees = new Map<string, { name: string; total: number; count: number }>();
    filtered.forEach(row => { const item = employees.get(row.employee_id) ?? { name: row.employee_name, total: 0, count: 0 }; item.total += Number(row.progress_percentage); item.count += 1; employees.set(row.employee_id, item); });
    return [...employees.values()].map(item => ({ name: item.name, value: Math.round(item.total / item.count) })).sort((a, b) => b.value - a.value);
  }, [filtered]);
  const departmentProgress = useMemo(() => groupedAverage(filtered, "department"), [filtered]);
  const organizationProgress = useMemo(() => groupedAverage(filtered, "organization"), [filtered]);
  const completed = filtered.filter(row => row.learning_status === "completed").length;
  const inProgress = filtered.filter(row => row.learning_status === "in_progress").length;
  const notStarted = filtered.filter(row => row.learning_status === "not_started").length;
  const scored = filtered.filter(row => row.best_score !== null);
  const averageScore = scored.length ? Math.round(scored.reduce((sum, row) => sum + Number(row.best_score), 0) / scored.length) : 0;
  const passed = scored.filter(row => Number(row.best_score) >= 80).length;
  const counts: [string, number][] = [["Employees", employeeProgress.length], ["Course Assignments", filtered.length], ["Completed", completed], ["In Progress", inProgress], ["Not Started", notStarted]];
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageStart = Math.max(1, Math.min(Math.max(1, pageCount - 4), currentPage - 2));
  const visiblePages = Array.from({ length: Math.min(5, pageCount) }, (_, index) => pageStart + index);
  const pieColors = ["#6554dc", "#20a36f", "#328bc8", "#e29532", "#e56578", "#94a0b1"];
  const pieTotal = departmentProgress.reduce((sum, item) => sum + item.value, 0) || 1;
  let pieCursor = 0;
  const pieGradient = departmentProgress.length ? `conic-gradient(${departmentProgress.map((item, index) => { const start = pieCursor; pieCursor += item.value / pieTotal * 100; return `${pieColors[index % pieColors.length]} ${start}% ${pieCursor}%`; }).join(",")})` : "#edf0f5";
  const clearFilters = () => setFilters({ search: "", department: "", organization: "", projectLocation: "", course: "", status: "" });
  const selectFilter = (key: keyof typeof filters, value: string) => setFilters(current => ({ ...current, [key]: value }));

  return <div className="learning-detail-report">
    <div className="page-title learning-report-title"><div><p>HUMAN RESOURCES · LEARNING MANAGEMENT</p><h1>L&amp;D Detail Report</h1><span>Monitor employee learning progress, completion and assessment performance.</span></div></div>
    <section className="learning-chart-grid" aria-label="Learning charts">
      <ChartCard title="Employee learning progress" value={`${employeeProgress.length} learners`} tone="purple" note="Progress changes with the selected filters"><VerticalBars items={employeeProgress} /></ChartCard>
      <ChartCard title="Learning by department" value={`${departmentProgress[0]?.value ?? 0}%`} tone="green" note={`${departmentProgress[0]?.name ?? "No department"} has the highest average progress`}><div className="learning-pie-layout"><div className="learning-pie" style={{ background: pieGradient }}><span>{departmentProgress.length}</span></div><div className="learning-pie-legend">{departmentProgress.slice(0, 5).map((item, index) => <span key={item.name}><i style={{ background: pieColors[index] }} />{item.name}<b>{item.value}%</b></span>)}</div></div></ChartCard>
      <ChartCard title="Learning by organization" value={`${organizationProgress[0]?.value ?? 0}%`} tone="blue" note={`${organizationProgress[0]?.name ?? "No organization"} has the highest average progress`}><HorizontalBars items={organizationProgress} /></ChartCard>
      <ChartCard title="Assessment performance" value={`${averageScore}%`} tone="orange" note={`${passed} of ${scored.length} assessed assignments passed`}><div className="assessment-ring" style={{ background: `conic-gradient(#e29532 ${averageScore}%,#f2f3f6 0)` }}><span><b>{averageScore}%</b><small>Avg. score</small></span></div><div className="assessment-legend"><span><i className="passed" />Passed <b>{passed}</b></span><span><i />Below 80% <b>{Math.max(0, scored.length - passed)}</b></span></div></ChartCard>
    </section>
    <section className="learning-count-grid" aria-label="Learning counts">{counts.map(([title, value], index) => <article key={title}><span>{index + 1}</span><div><b>{value.toLocaleString()}</b><small>{title}</small></div></article>)}</section>
    <section className="learning-report-filters"><header><div><small>REPORT CONTROLS</small><h2>Filter employee learning data</h2></div><button type="button" onClick={clearFilters}>Clear filters</button></header><div>
      <label>Employee<input value={filters.search} placeholder="ID, name or position" onChange={event => selectFilter("search", event.target.value)} /></label>
      <label>Department<select value={filters.department} onChange={event => selectFilter("department", event.target.value)}><option value="">All departments</option>{departments.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Organization<select value={filters.organization} onChange={event => selectFilter("organization", event.target.value)}><option value="">All organizations</option>{organizations.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Project Location<select value={filters.projectLocation} onChange={event => selectFilter("projectLocation", event.target.value)}><option value="">All project locations</option>{projectLocations.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Course<select value={filters.course} onChange={event => selectFilter("course", event.target.value)}><option value="">All courses</option>{courses.map(([code, title]) => <option key={code} value={code}>{code} · {title}</option>)}</select></label>
      <label>Learning Status<select value={filters.status} onChange={event => selectFilter("status", event.target.value)}><option value="">All statuses</option><option value="not_started">Not Started</option><option value="in_progress">In Progress</option><option value="completed">Completed / Certified</option></select></label>
    </div></section>
    <section className="learning-report-table"><header><div><small>EMPLOYEE DATA</small><h2>Learning Management details</h2></div><span>{filtered.length.toLocaleString()} records</span></header><div className="learning-table-scroll"><table><thead><tr><th>Employee ID</th><th>Employee</th><th>Department</th><th>Organization</th><th>Project Location</th><th>Position</th><th>Course</th><th>Progress</th><th>Final Attempts</th><th>Best Score</th><th>Status</th></tr></thead><tbody>{pageRows.map(row => <tr key={`${row.employee_id}-${row.course_code}`}><td><b>{row.employee_no}</b></td><td>{row.employee_name}</td><td>{row.department ?? "—"}</td><td>{row.organization ?? "—"}</td><td>{row.project_location ?? "—"}</td><td>{row.position ?? "—"}</td><td><b>{row.course_title}</b><small>{row.course_code}</small></td><td><div className="learning-progress"><span><i style={{ width: `${row.progress_percentage}%` }} /></span><b>{row.progress_percentage}%</b></div></td><td>{row.final_attempts}</td><td>{row.best_score === null ? "—" : `${row.best_score}%`}</td><td><span className={`learning-status ${row.learning_status}`}>{row.certificate_earned ? "Completed · Certified" : statusLabel(row.learning_status)}</span></td></tr>)}</tbody></table></div>
      {loading && <div className="learning-report-state">Loading learning report…</div>}{!loading && error && <div className="learning-report-state error">{error}</div>}{!loading && !error && !filtered.length && <div className="learning-report-state">No learning records match the selected filters.</div>}
      {!loading && !error && filtered.length > 0 && <footer className="learning-pagination"><span>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()}</span><div><button disabled={currentPage === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Prev</button>{visiblePages.map(number => <button key={number} className={number === currentPage ? "active" : ""} onClick={() => setPage(number)}>{number}</button>)}<button disabled={currentPage === pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>Next</button></div></footer>}
    </section>
  </div>;
}

function ChartCard({ title, value, tone, note, children }: { title: string; value: string; tone: string; note: string; children: ReactNode }) {
  return <article className={`learning-chart-card ${tone}`}><header><div><small>OVERVIEW</small><h2>{title}</h2></div><b>{value}</b></header><div className="learning-chart-visual">{children}</div><p>{note}</p></article>;
}
function VerticalBars({ items }: { items: NamedValue[] }) {
  return <div className="employee-bar-chart">{items.length ? items.map(item => <div key={item.name} title={`${item.name}: ${item.value}%`}><span>{item.value}%</span><i style={{ height: `${Math.max(3, item.value)}%` }} /><small>{item.name.split(" ")[0]}</small></div>) : <em>No learner data</em>}</div>;
}
function HorizontalBars({ items }: { items: NamedValue[] }) {
  return <div className="organization-bars">{items.slice(0, 5).map(item => <div key={item.name}><span>{item.name}</span><i><b style={{ width: `${item.value}%` }} /></i><strong>{item.value}%</strong></div>)}{!items.length && <em>No organization data</em>}</div>;
}
