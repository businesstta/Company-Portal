import type { Page, Route } from "@playwright/test";

export const learningRows = [
  { employee_id: "1", employee_no: "EMP-001", employee_name: "Responsive Tester", department: "Information Technology", organization: "Corporate Office", project_location: "Head Office", position: "Engineer", course_code: "LDR-001", course_title: "Workplace Communications", course_status: "active", total_contents: 4, completed_contents: 3, progress_percentage: 75, final_attempts: 1, best_score: 86, certificate_earned: false, learning_status: "in_progress" },
  { employee_id: "2", employee_no: "EMP-002", employee_name: "Visual Tester", department: "Human Resources", organization: "Corporate Office", project_location: "Head Office", position: "HR Officer", course_code: "LDR-002", course_title: "Data Privacy Awareness", course_status: "active", total_contents: 3, completed_contents: 3, progress_percentage: 100, final_attempts: 1, best_score: 92, certificate_earned: true, learning_status: "completed" },
];

const dashboard = {
  stats: { totalEmployees: 1033, presentToday: 900, pendingApprovals: 0, onLeave: 3 },
  attendance: { present: 900, absent: 100, leave: 33 }, departments: [], recentRequests: [],
};

export async function mockPortalApi(page: Page) {
  await page.addInitScript(() => localStorage.setItem("portal_token", "e2e-token"));
  await page.route("**/api/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path.endsWith("/me/navigation")) body = { menus: ["*"], role: "admin", isWorkflowApprover: true };
    else if (path.endsWith("/profile")) body = { first_name: "Responsive", last_name: "Tester" };
    else if (path.endsWith("/dashboard")) body = dashboard;
    else if (path.endsWith("/notifications/unread-count")) body = { count: 0 };
    else if (path.endsWith("/branding")) body = { iconText: "CP", title: "Company Portal", subtitle: "People & Operations", iconColor: "#6d5ce7" };
    else if (path.endsWith("/reports/learning-detail")) body = learningRows;
    else if (path.endsWith("/reports/learning-export")) return route.fulfill({ status: 200, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: "PK\u0003\u0004mock-xlsx" });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}
