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
type TrendPoint = { month_key: string; month_label: string; content_completions: number; assessment_attempts: number; certificates: number };

const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

export default function LearningChartReport({ token }: { token: string }) {
  const [rows, setRows] = useState<LearningRow[]>([]), [trend, setTrend] = useState<TrendPoint[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    const options = { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal };
    Promise.all([fetch(`${API}/reports/learning-detail`, options), fetch(`${API}/reports/learning-trend`, options)])
      .then(async responses => { if (responses.some(response => !response.ok)) throw new Error("Unable to load learning chart data"); return Promise.all(responses.map(response => response.json())); })
      .then(([detailData, trendData]) => { setRows(Array.isArray(detailData) ? detailData : []); setTrend(Array.isArray(trendData) ? trendData : []); })
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
  const overallProgress = rows.length ? rows.reduce((sum, row) => sum + Number(row.progress_percentage), 0) / rows.length : 0;
  const progressLabel = overallProgress > 0 && overallProgress < 1 ? overallProgress.toFixed(2) : overallProgress.toFixed(1);
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
      <ReportCard eyebrow="PROGRESS" title="Overall learning progress" summary={`${progressLabel}% average`} note={`${(completed + inProgress).toLocaleString()} started assignments · ${uniqueLearners.toLocaleString()} learners · ${courses.length} courses`} onExport={format => exportData(format, "Overall learning progress", ["Metric", "Value"], [["Average progress", `${progressLabel}%`], ["Started assignments", completed + inProgress], ["Learners", uniqueLearners], ["Course assignments", rows.length], ["Courses", courses.length]])}>
        <div className="chart-gauge" style={{ background: `conic-gradient(#6554dc ${overallProgress}%,#ebe9fb 0)` }}><div><strong>{progressLabel}%</strong><span>Average progress</span><small>{completed + inProgress} assignments started</small></div></div>
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
      <ReportCard eyebrow="12-MONTH TREND" title="Learning activity trend" summary={`${trend.reduce((sum, point) => sum + Number(point.content_completions), 0).toLocaleString()} completions`} note="Actual monthly content completions, assessment attempts and certificates" onExport={format => exportData(format, "Learning activity trend", ["Month", "Content Completions", "Assessment Attempts", "Certificates"], trend.map(point => [point.month_key, point.content_completions, point.assessment_attempts, point.certificates]))}>
        <LineTrend points={trend} />
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
  const started = items[0].value + items[1].value, completedShare = started ? items[0].value / started * 100 : 0;
  return <div className="status-donut-layout"><div className="status-donut" style={{ background: gradient }}><div className="started-donut" style={{ background: `conic-gradient(#20a36f ${completedShare}%,#f0aa32 0)` }}><span><b>{started}</b>Started</span></div></div><div>{items.map(item => <p key={item.name}><i style={{ background: item.color }} /><span>{item.name}</span><b>{item.value}<small>{(item.value / total * 100).toFixed(item.value && item.value / total < .01 ? 2 : 1)}%</small></b></p>)}</div></div>;
}
function CourseBars({ courses }: { courses: CourseMetric[] }) {
  return <div className="course-progress-bars">{courses.map(course => <div key={course.code}><span title={course.name}>{course.name}</span><i><b style={{ width: `${course.progress}%` }} /></i><strong>{course.progress}%</strong></div>)}</div>;
}
function StackedCourses({ courses }: { courses: CourseMetric[] }) {
  return <div className="course-stacks">{courses.map(course => <div key={course.code}><span title={course.name}>{course.code}</span><i>{course.completed > 0 && <b className="done" style={{ width: `max(${course.completed / course.assignments * 100}%,3px)` }} />}{course.inProgress > 0 && <b className="doing" style={{ width: `max(${course.inProgress / course.assignments * 100}%,3px)` }} />}{course.notStarted > 0 && <b className="waiting" style={{ flex: 1 }} />}</i><strong>{course.assignments}</strong></div>)}<aside><span><i />Completed</span><span><i />In Progress</span><span><i />Not Started</span></aside></div>;
}
function LollipopChart({ items }: { items: NamedMetric[] }) {
  return <div className="department-lollipops">{items.map(item => <div key={item.name}><span title={item.name}>{item.name}</span><i><b style={{ width: `${item.value}%` }}><em /></b></i><strong>{item.value}%</strong></div>)}</div>;
}
function Histogram({ items }: { items: { name: string; value: number }[] }) {
  const peak = Math.max(1, ...items.map(item => item.value));
  return <div className="score-histogram">{items.map(item => <div key={item.name}><strong>{item.value}</strong><i style={{ height: `${Math.max(4, item.value / peak * 100)}%` }} /><span>{item.name}</span></div>)}</div>;
}

function LineTrend({ points }: { points: TrendPoint[] }) {
  const width = 620, height = 188, left = 34, right = 12, top = 14, bottom = 28, plotWidth = width - left - right, plotHeight = height - top - bottom;
  const peak = Math.max(1, ...points.flatMap(point => [Number(point.content_completions), Number(point.assessment_attempts), Number(point.certificates)]));
  const x = (index: number) => left + index * plotWidth / Math.max(1, points.length - 1), y = (value: number) => top + plotHeight - value / peak * plotHeight;
  const line = (key: "content_completions" | "assessment_attempts" | "certificates") => points.map((point, index) => `${x(index)},${y(Number(point[key]))}`).join(" ");
  return <div className="learning-trend"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Twelve month learning activity line chart">{[0,.25,.5,.75,1].map(step => <line key={step} x1={left} x2={width-right} y1={top+plotHeight*step} y2={top+plotHeight*step} className="trend-grid" />)}<polyline points={line("content_completions")} className="trend-line completions"/><polyline points={line("assessment_attempts")} className="trend-line attempts"/><polyline points={line("certificates")} className="trend-line certificates"/>{points.map((point,index)=><text key={point.month_key} x={x(index)} y={height-7} textAnchor="middle">{point.month_label}</text>)}</svg><aside><span><i/>Content completions</span><span><i/>Assessment attempts</span><span><i/>Certificates</span></aside></div>;
}
