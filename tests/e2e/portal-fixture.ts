import type { Page, Route } from "@playwright/test";

export const learningRows = [
  { employee_id: "1", employee_no: "EMP-001", employee_name: "Responsive Tester", department: "Information Technology", organization: "Corporate Office", project_location: "Head Office", position: "Engineer", course_code: "LDR-001", course_title: "Workplace Communications", course_date: "2026-09-01", course_status: "active", total_contents: 4, completed_contents: 3, progress_percentage: 75, test_score: 72, test_passed: false, final_attempts: 2, final_attempt_history: [{ attempt_no: 1, score: 65, passed: false, submitted_at: "2026-09-02T08:00:00Z" }, { attempt_no: 2, score: 86, passed: true, submitted_at: "2026-09-03T08:00:00Z" }], best_score: 86, final_pass_score: 86, certificate_earned: false, learning_status: "in_progress" },
  { employee_id: "2", employee_no: "EMP-002", employee_name: "Visual Tester", department: "Human Resources", organization: "Corporate Office", project_location: "Head Office", position: "HR Officer", course_code: "LDR-002", course_title: "Data Privacy Awareness", course_date: "2026-09-02", course_status: "active", total_contents: 3, completed_contents: 3, progress_percentage: 100, test_score: 90, test_passed: true, final_attempts: 1, final_attempt_history: [{ attempt_no: 1, score: 92, passed: true, submitted_at: "2026-09-03T09:00:00Z" }], best_score: 92, final_pass_score: 92, certificate_earned: true, learning_status: "completed" },
];

const users = [
  { id: "10000000-0000-4000-8000-000000000001", employee_no: "EMP-001", first_name: "Responsive", last_name: "Tester", position: "Engineer", department: "Information Technology", organization: "Corporate Office", project_location: "Head Office", report_to: "Manager One", role: "employee", username: "0001", is_active: true, last_login_at: "2026-09-08T01:00:00Z" },
  { id: "10000000-0000-4000-8000-000000000002", employee_no: "EMP-002", first_name: "Visual", last_name: "Tester", position: "HR Officer", department: "Human Resources", organization: "Corporate Office", project_location: "Head Office", report_to: "Manager Two", role: "hr", username: "0002", is_active: true, last_login_at: null },
];

const dashboard = {
  stats: { totalEmployees: 1033, presentToday: 900, pendingApprovals: 0, onLeave: 3 },
  attendance: { present: 900, absent: 100, leave: 33 }, departments: [], recentRequests: [],
};

export async function mockPortalApi(page: Page, options: { trendStatus?: number } = {}) {
  await page.addInitScript(() => localStorage.setItem("portal_token", "e2e-token"));
  await page.route("**/api/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path.endsWith("/me/navigation")) body = { menus: ["*"], role: "admin", isWorkflowApprover: true };
    else if (path.endsWith("/profile")) body = { first_name: "Responsive", last_name: "Tester" };
    else if (path.endsWith("/dashboard")) body = dashboard;
    else if (path.endsWith("/notifications/unread-count")) body = { count: 0 };
    else if (path.endsWith("/branding")) body = { iconText: "CP", title: "Company Portal", subtitle: "People & Operations", iconColor: "#6d5ce7" };
    else if (path.endsWith("/users/export")) return route.fulfill({ status: 200, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: "PK\u0003\u0004mock-xlsx" });
    else if (path.endsWith("/users")) body = users;
    else if (path.endsWith("/roles")) body = [{ role_key: "admin", role_name: "Administrator" }, { role_key: "hr", role_name: "HR" }, { role_key: "employee", role_name: "Employee" }];
    else if (path.endsWith("/reports/learning-detail")) body = learningRows;
    else if (path.endsWith("/reports/learning-trend") && options.trendStatus && options.trendStatus >= 400) return route.fulfill({ status: options.trendStatus, contentType: "application/json", body: JSON.stringify({ error: "Trend unavailable" }) });
    else if (path.endsWith("/reports/learning-trend")) body = [
      { month_key: "2026-07", month_label: "Jul", content_completions: 1, assessment_attempts: 0, certificates: 0 },
      { month_key: "2026-08", month_label: "Aug", content_completions: 3, assessment_attempts: 1, certificates: 0 },
      { month_key: "2026-09", month_label: "Sep", content_completions: 4, assessment_attempts: 2, certificates: 1 },
    ];
    else if (path.endsWith("/reports/learning-export")) return route.fulfill({ status: 200, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: "PK\u0003\u0004mock-xlsx" });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}
