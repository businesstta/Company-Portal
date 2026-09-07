import { useEffect, useMemo, useState, type ReactNode } from "react";
import { exportExcel, exportPdf, type ExportCell } from "./learning-report-export";
import "./learning-chart-report.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
type LearningStatus = "not_started" | "in_progress" | "completed";
type LearningRow = {
  employee_id: string; employee_no: string; employee_name: string; department: string | null; organization: string | null;
  project_location: string | null; position: string | null; course_code: string; course_title: string; course_status: string;
  total_contents: number; completed_contents: number; progress_percentage: number; final_attempts: number; best_score: number | null;
  certificate_earned: boolean; learning_status: LearningStatus;
};
type CourseMetric = { code: string; name: string; assignments: number; progress: number; score: number | null; completed: number; inProgress: number; notStarted: number; certificates: number };
type NamedMetric = { name: string; value: number; count: number };

const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

export default function LearningChartReport({ token }: { token: string }) {
  const [rows, setRows] = useState<LearningRow[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    fetch(`${API}/reports/learning-detail`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Unable to load learning chart data"); return response.json(); })
      .then(data => setRows(Array.isArray(data) ? data : []))
      .catch(reason => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "Unable to load learning chart data"); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [token]);

  const courses = useMemo<CourseMetric[]>(() => {
    const groups = new Map<string, LearningRow[]>();
    rows.forEach(row => groups.set(row.course_code, [...(groups.get(row.course_code) ?? []), row]));
    return [...groups.entries()].map(([code, items]) => ({
      code, name: items[0].course_title, assignments: items.length, progress: average(items.map(item => Number(item.progress_percentage))),
      score: items.some(item => item.best_score !== null) ? average(items.filter(item => item.best_score !== null).map(item => Number(item.best_score))) : null,
      completed: items.filter(item => item.learning_status === "completed").length, inProgress: items.filter(item => item.learning_status === "in_progress").length,
      notStarted: items.filter(item => item.learning_status === "not_started").length, certificates: items.filter(item => item.certificate_earned).length,
    })).sort((a, b) => b.progress - a.progress || a.name.localeCompare(b.name));
  }, [rows]);
  const departments = useMemo(() => groupAverage(rows, "department"), [rows]);
  const completed = rows.filter(row => row.learning_status === "completed").length, inProgress = rows.filter(row => row.learning_status === "in_progress").length, notStarted = rows.length - completed - inProgress;
  const overallProgress = average(rows.map(row => Number(row.progress_percentage)));
  const uniqueLearners = new Set(rows.map(row => row.employee_id)).size;
  const statusItems = [{ name: "Completed", value: completed, color: "#20a36f" }, { name: "In Progress", value: inProgress, color: "#f0aa32" }, { name: "Not Started", value: notStarted, color: "#a8b1bf" }];
  const scored = rows.filter(row => row.best_score !== null).map(row => Number(row.best_score));
  const scoreBuckets = [
    { name: "Below 60", min: 0, max: 59 }, { name: "60–69", min: 60, max: 69 }, { name: "70–79", min: 70, max: 79 },
    { name: "80–89", min: 80, max: 89 }, { name: "90–100", min: 90, max: 100 },
  ].map(bucket => ({ name: bucket.name, value: scored.filter(score => score >= bucket.min && score <= bucket.max).length }));
  const exportData = (format: "excel" | "pdf", title: string, headers: string[], exportRows: ExportCell[][]) => {
    if (format === "excel") void exportExcel(title, headers, exportRows, token).catch(reason => window.alert(reason instanceof Error ? reason.message : "Unable to export Excel")); else exportPdf(title, headers, exportRows);
  };
  const courseRows = courses.map(course => [course.code, course.name, course.assignments, `${course.progress}%`, course.score === null ? "—" : `${course.score}%`]);

  return <div className="learning-chart-report">
    <div className="page-title chart-report-title"><div><p>HUMAN RESOURCES · LEARNING MANAGEMENT</p><h1>L&amp;D Chart Report</h1><span>Visual analysis of active employee course assignments, progress, assessment and certification.</span></div><aside><b>{rows.length.toLocaleString()}</b><small>Course assignments</small></aside></div>
    {loading && <div className="chart-report-state">Loading verified learning data…</div>}
    {!loading && error && <div className="chart-report-state error">{error}</div>}
    {!loading && !error && !rows.length && <div className="chart-report-state">No learning assignments are available.</div>}
    {!loading && !error && rows.length > 0 && <section className="chart-report-grid" aria-label="Learning management chart reports">
      <ReportCard eyebrow="PROGRESS" title="Overall learning progress" summary={`${overallProgress}% average`} note={`${uniqueLearners.toLocaleString()} learners across ${courses.length} courses`} onExport={format => exportData(format, "Overall learning progress", ["Metric", "Value"], [["Average progress", `${overallProgress}%`], ["Learners", uniqueLearners], ["Course assignments", rows.length], ["Courses", courses.length]])}>
        <div className="chart-gauge" style={{ background: `conic-gradient(#6554dc ${overallProgress}%,#ebe9fb 0)` }}><div><strong>{overallProgress}%</strong><span>Average progress</span></div></div>
      </ReportCard>
      <ReportCard eyebrow="STATUS" title="Assignment status mix" summary={`${completed.toLocaleString()} completed`} note="Every assigned employee-course combination is counted once" onExport={format => exportData(format, "Learning assignment status", ["Status", "Assignments", "Share"], statusItems.map(item => [item.name, item.value, `${Math.round(item.value / rows.length * 100)}%`]))}>
        <DonutChart items={statusItems} total={rows.length} />
      </ReportCard>
      <ReportCard eyebrow="COURSES" title="Average progress by course" summary={`${courses.length} courses`} note="Sorted by assignment-weighted course progress" onExport={format => exportData(format, "Average progress by course", ["Course Code", "Course", "Assignments", "Average Progress", "Average Score"], courseRows)}>
        <CourseBars courses={courses.slice(0, 7)} />
      </ReportCard>
      <ReportCard eyebrow="ENGAGEMENT" title="Course engagement profile" summary={`${inProgress.toLocaleString()} active`} note="Status composition within each course" onExport={format => exportData(format, "Course engagement profile", ["Course Code", "Course", "Completed", "In Progress", "Not Started"], courses.map(course => [course.code, course.name, course.completed, course.inProgress, course.notStarted]))}>
        <StackedCourses courses={courses.slice(0, 6)} />
      </ReportCard>
      <ReportCard eyebrow="DEPARTMENTS" title="Department learning progress" summary={`${departments[0]?.value ?? 0}% highest`} note={`${departments[0]?.name ?? "No department"} currently leads`} onExport={format => exportData(format, "Department learning progress", ["Department", "Assignments", "Average Progress"], departments.map(item => [item.name, item.count, `${item.value}%`]))}>
        <LollipopChart items={departments.slice(0, 7)} />
      </ReportCard>
      <ReportCard eyebrow="ASSESSMENT" title="Assessment score distribution" summary={`${average(scored)}% average`} note={`${scored.length.toLocaleString()} assignments with a recorded best score`} onExport={format => exportData(format, "Assessment score distribution", ["Score Range", "Assignments"], scoreBuckets.map(item => [item.name, item.value]))}>
        <Histogram items={scoreBuckets} />
      </ReportCard>
    </section>}
  </div>;
}

function groupAverage(rows: LearningRow[], key: "department" | "organization"): NamedMetric[] {
  const groups = new Map<string, number[]>();
  rows.forEach(row => { const name = row[key] || "Unassigned"; groups.set(name, [...(groups.get(name) ?? []), Number(row.progress_percentage)]); });
  return [...groups.entries()].map(([name, values]) => ({ name, value: average(values), count: values.length })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

function ReportCard({ eyebrow, title, summary, note, children, onExport }: { eyebrow: string; title: string; summary: string; note: string; children: ReactNode; onExport: (format: "excel" | "pdf") => void }) {
  return <article className="chart-report-card"><header><div><small>{eyebrow}</small><h2>{title}</h2></div><div><b>{summary}</b><span><button type="button" title={`Export ${title} to Excel`} onClick={() => onExport("excel")}>Excel</button><button type="button" title={`Export ${title} to PDF`} onClick={() => onExport("pdf")}>PDF</button></span></div></header><div className="chart-report-visual">{children}</div><footer>{note}</footer></article>;
}

function DonutChart({ items, total }: { items: { name: string; value: number; color: string }[]; total: number }) {
  let cursor = 0; const gradient = `conic-gradient(${items.map(item => { const start = cursor; cursor += item.value / total * 100; return `${item.color} ${start}% ${cursor}%`; }).join(",")})`;
  return <div className="status-donut-layout"><div className="status-donut" style={{ background: gradient }}><span><b>{total}</b>Assignments</span></div><div>{items.map(item => <p key={item.name}><i style={{ background: item.color }} /><span>{item.name}</span><b>{item.value}</b></p>)}</div></div>;
}
function CourseBars({ courses }: { courses: CourseMetric[] }) {
  return <div className="course-progress-bars">{courses.map(course => <div key={course.code}><span title={course.name}>{course.name}</span><i><b style={{ width: `${course.progress}%` }} /></i><strong>{course.progress}%</strong></div>)}</div>;
}
function StackedCourses({ courses }: { courses: CourseMetric[] }) {
  return <div className="course-stacks">{courses.map(course => <div key={course.code}><span title={course.name}>{course.code}</span><i>{course.completed > 0 && <b className="done" style={{ width: `${course.completed / course.assignments * 100}%` }} />}{course.inProgress > 0 && <b className="doing" style={{ width: `${course.inProgress / course.assignments * 100}%` }} />}{course.notStarted > 0 && <b className="waiting" style={{ width: `${course.notStarted / course.assignments * 100}%` }} />}</i><strong>{course.assignments}</strong></div>)}<aside><span><i />Completed</span><span><i />In Progress</span><span><i />Not Started</span></aside></div>;
}
function LollipopChart({ items }: { items: NamedMetric[] }) {
  return <div className="department-lollipops">{items.map(item => <div key={item.name}><span title={item.name}>{item.name}</span><i><b style={{ width: `${item.value}%` }}><em /></b></i><strong>{item.value}%</strong></div>)}</div>;
}
function Histogram({ items }: { items: { name: string; value: number }[] }) {
  const peak = Math.max(1, ...items.map(item => item.value));
  return <div className="score-histogram">{items.map(item => <div key={item.name}><strong>{item.value}</strong><i style={{ height: `${Math.max(4, item.value / peak * 100)}%` }} /><span>{item.name}</span></div>)}</div>;
}
