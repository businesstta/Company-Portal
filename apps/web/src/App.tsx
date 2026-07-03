import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import "./App.css";
import "./responsive.css";
import "./employee-detail.css";
import "./item-master.css";
import "./employee-list.css";
import "./users-roles.css";

const nav = [
  "Overview",
  "Employees",
  "Attendance",
  "Approvals",
  "Leave",
  "Overtime",
  "Appraisals",
  "Announcements",
  "Notification",
  "Reports",
  "Users & Roles",
  "Corporate",
  "General Setting",
];
const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
type Dashboard = {
  stats: {
    totalEmployees: number;
    presentToday: number;
    lateToday: number;
    pendingApprovals: number;
  };
  departments: {
    name: string;
    employees: number;
    present: number;
    rate: number;
  }[];
};
type Approval = {
  id: string;
  first_name: string;
  last_name: string;
  request_type: string;
  title: string;
  created_at: string;
};
type Confirmation = {
  id: string;
  action: "approved" | "rejected";
  name?: string;
};
type MasterConfirmation = {
  mode: "add" | "remove";
  itemType: string;
  name: string;
  id?: string;
};
type EmployeeFilters = {
  employeeNo: string;
  name: string;
  position: string;
  department: string;
  organization: string;
  projectLocation: string;
  reportTo: string;
  sort: "newer" | "older";
};
type UserFilters = {
  employeeNo: string;
  name: string;
  position: string;
  department: string;
  organization: string;
  projectLocation: string;
  reportTo: string;
  role: string;
};

function ConfirmDialog({
  confirmation,
  onCancel,
  onConfirm,
}: {
  confirmation: Confirmation;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const approve = confirmation.action === "approved";
  return (
    <div className="confirm-backdrop" onMouseDown={onCancel}>
      <section
        className="confirm-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={`confirm-icon ${approve ? "approve" : "reject"}`}>
          {approve ? "✓" : "!"}
        </div>
        <h2>{approve ? "Approve request?" : "Reject request?"}</h2>
        <p>
          {confirmation.name
            ? `Are you sure you want to ${approve ? "approve" : "reject"} ${confirmation.name}'s request?`
            : `Are you sure you want to ${approve ? "approve" : "reject"} this request?`}
        </p>
        <div>
          <button onClick={onCancel}>Cancel</button>
          <button
            className={approve ? "confirm-approve" : "confirm-reject"}
            onClick={onConfirm}
          >
            {approve ? "Yes, approve" : "Yes, reject"}
          </button>
        </div>
      </section>
    </div>
  );
}
function SaveEmployeeDialog({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="confirm-backdrop" onMouseDown={onCancel}>
      <section
        className="confirm-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="confirm-icon save">♙</div>
        <h2>Save employee?</h2>
        <p>
          Confirm that you want to save <b>{name}</b> to the employee database.
        </p>
        <div>
          <button onClick={onCancel}>Go back</button>
          <button className="confirm-save" onClick={onConfirm}>
            Yes, save employee
          </button>
        </div>
      </section>
    </div>
  );
}
function MasterConfirmDialog({
  item,
  onCancel,
  onConfirm,
}: {
  item: MasterConfirmation;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const adding = item.mode === "add";
  return (
    <div className="confirm-backdrop" onMouseDown={onCancel}>
      <section
        className="confirm-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={`confirm-icon ${adding ? "save" : "reject"}`}>
          {adding ? "+" : "!"}
        </div>
        <h2>{adding ? "Add master value?" : "Remove master value?"}</h2>
        <p>
          {adding ? "Add" : "Remove"} <b>{item.name}</b>{" "}
          {adding ? "to" : "from"} {item.itemType.replace("_", " ")} values?
        </p>
        <div>
          <button onClick={onCancel}>Cancel</button>
          <button
            className={adding ? "confirm-save" : "confirm-reject"}
            onClick={onConfirm}
          >
            {adding ? "Yes, add value" : "Yes, remove"}
          </button>
        </div>
      </section>
    </div>
  );
}

const employeeFields: [string, string, string, string?][] = [
  ["Employee ID", "employee_no", "employeeNo"],
  ["Employee Name (Eng)", "first_name", "nameEng"],
  ["Employee Name (MM)", "name_mm", "nameMm"],
  ["Position", "position", "position"],
  ["Department", "department", "department"],
  ["Organization", "organization", "organization"],
  ["Project Location", "project_location", "projectLocation"],
  ["NRC No (MM)", "nrc_no_mm", "nrcNoMm"],
  ["NRC No (Eng)", "nrc_no_eng", "nrcNoEng"],
  ["DOB (Eng)", "date_of_birth", "dob", "date"],
  ["Age", "age", "age", "number"],
  ["Join Date", "joined_on", "joinDate", "date"],
  ["Permanent Date", "permanent_date", "permanentDate", "date"],
  ["Service Year", "service_year", "serviceYear", "number"],
  ["Gender", "gender", "gender"],
  ["Blood Type", "blood_type", "bloodType"],
  ["Father Name", "father_name", "fatherName"],
  ["Marital Status", "marital_status", "maritalStatus"],
  ["Has Children", "has_children", "hasChildren"],
  ["Number of Children", "number_of_children", "numberOfChildren", "number"],
  ["Nationality", "nationality", "nationality"],
  ["Education", "education", "education"],
  ["Other Qualification", "other_qualification", "otherQualification"],
  ["Personal Phone No", "phone", "personalPhone"],
  ["Business Phone No", "business_phone_no", "businessPhone"],
  ["Business Email", "business_email", "businessEmail", "email"],
  ["Current Address", "current_address", "currentAddress"],
  ["Employment Type", "employment_type", "employmentType"],
  ["Branch", "branch", "branch"],
  [
    "Resign / Retired / Terminate Date",
    "separation_date",
    "separationDate",
    "date",
  ],
  ["Report To", "report_to", "reportTo"],
  ["Shift", "shift_required", "shiftRequired"],
  [
    "Bank Account / Pay Number",
    "bank_account_pay_number",
    "bankAccountPayNumber",
  ],
];
const employeeFieldGroups = [
  {
    title: "Employment information",
    keys: [
      "employee_no",
      "first_name",
      "name_mm",
      "position",
      "department",
      "organization",
      "project_location",
      "joined_on",
      "permanent_date",
      "service_year",
      "employment_type",
      "branch",
      "separation_date",
      "report_to",
      "shift_required",
    ],
  },
  {
    title: "Personal information",
    keys: [
      "nrc_no_mm",
      "nrc_no_eng",
      "date_of_birth",
      "age",
      "gender",
      "blood_type",
      "father_name",
      "marital_status",
      "has_children",
      "number_of_children",
      "nationality",
    ],
  },
  {
    title: "Qualifications, contact & payment",
    keys: [
      "education",
      "other_qualification",
      "phone",
      "business_phone_no",
      "business_email",
      "current_address",
      "bank_account_pay_number",
    ],
  },
];

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    Overview: "M3 12l9-9 9 9M5 10v10h14V10M9 20v-6h6v6",
    Employees:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    Attendance: "M12 8v4l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9",
    Approvals:
      "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
    Leave: "M6 2v4M18 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2",
    Overtime: "M12 6v6l4 2M22 12a10 10 0 1 1-10-10",
    Appraisals:
      "M12 15l-3.5 2 1-4-3-2.7 4-.3L12 6l1.5 3.7 4 .3-3 2.7 1 4zM4 4h4M6 2v4M18 18h4M20 16v4",
    Announcements: "M3 11v2M6 9v6l11 4V5L6 9H3v6h3M8 15l1 5h3l-1-4",
    Notification: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
    Reports: "M4 19V9M10 19V5M16 19v-7M22 19H2",
    "Users & Roles": "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10M9 12l2 2 4-4",
    Corporate: "M3 21h18M5 21V7l7-4 7 4v14M9 10h1M14 10h1M9 14h1M14 14h1",
    "General Setting":
      "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 3.67-.09-.03a1.7 1.7 0 0 0-1.8.24l-.3.18a1.7 1.7 0 0 0-.82 1.6V22H10v-.4a1.7 1.7 0 0 0-.82-1.6l-.3-.18a1.7 1.7 0 0 0-1.8-.24l-.09.03-2.12-3.67.06-.06A1.7 1.7 0 0 0 5.27 15l-.17-.3a1.7 1.7 0 0 0-1.48-.84H3.5V9.62h.12A1.7 1.7 0 0 0 5.1 8.78l.17-.3a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-3.67.09.03a1.7 1.7 0 0 0 1.8-.24l.3-.18A1.7 1.7 0 0 0 10 0.88V.5h4.24v.38a1.7 1.7 0 0 0 .82 1.6l.3.18a1.7 1.7 0 0 0 1.8.24l.09-.03 2.12 3.67-.06.06a1.7 1.7 0 0 0-.34 1.88l.17.3a1.7 1.7 0 0 0 1.48.84h.12v4.24h-.12a1.7 1.7 0 0 0-1.48.84z",
    "My Profile": "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10",
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name] ?? paths.Overview} />
    </svg>
  );
}

function DataPage({
  page,
  token,
  role,
  onNotificationsChanged,
  onRequestsChanged,
}: {
  page: string;
  token: string;
  role: string;
  onNotificationsChanged?: () => void;
  onRequestsChanged?: () => void;
}) {
  const [rows, setRows] = useState<unknown>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [pendingEmployee, setPendingEmployee] = useState<Record<
    string,
    FormDataEntryValue
  > | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [editingEmployee, setEditingEmployee] = useState(false);
  const [masterItems, setMasterItems] = useState<Record<string, unknown>[]>([]);
  const [masterConfirmation, setMasterConfirmation] =
    useState<MasterConfirmation | null>(null);
  const [importResult, setImportResult] = useState("");
  const [employeeFilters, setEmployeeFilters] = useState<EmployeeFilters>({
    employeeNo: "", name: "", position: "", department: "",
    organization: "", projectLocation: "", reportTo: "", sort: "newer",
  });
  const [employeePage, setEmployeePage] = useState(1);
  const [employeePageSize, setEmployeePageSize] = useState(25);
  const [resetUser, setResetUser] = useState<Record<string, unknown> | null>(null);
  const [resetMessage, setResetMessage] = useState("");
  const [roleSaveNotice, setRoleSaveNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [userFilters, setUserFilters] = useState<UserFilters>({
    employeeNo: "", name: "", position: "", department: "",
    organization: "", projectLocation: "", reportTo: "", role: "",
  });
  const [permissionDraft, setPermissionDraft] = useState<Record<string, boolean>>({});
  const [permissionDirty, setPermissionDirty] = useState(false);
  const [permissionNotice, setPermissionNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const requestVersion = useRef(0);
  const requestType: Record<string, string> = {
    Leave: "leave",
    Overtime: "overtime",
    Appraisals: "appraisal",
  };
  const corporateType: Record<string, string> = {
    "Payment Request Form": "payment",
    "Advance Clearance Request Form": "advance_clearance",
  };
  const employeeApproval = page === "Approvals" && role === "employee";
  const endpoint =
    page === "Employees"
      ? "employees"
      : page === "Attendance"
        ? "attendance"
        : page === "Approvals"
          ? "requests?status=pending"
          : requestType[page]
            ? `requests?status=all&type=${requestType[page]}`
            : corporateType[page]
              ? `corporate-requests?type=${corporateType[page]}`
              : page === "Announcements"
                ? "announcements"
                : page === "Notification"
                  ? "notifications"
                  : page === "My Profile"
                    ? "profile"
                    : page === "Reports"
                      ? "reports/summary"
                      : page === "Users & Roles"
                        ? "users"
                        : page === "Role Access Control"
                          ? "permissions"
                          : page === "Item Master"
                            ? "item-master"
                            : page === "Settings"
                              ? "settings"
                              : "";
  const listRows = Array.isArray(rows)
    ? (rows as Record<string, unknown>[])
    : [];
  const displayRows = page === "Employees"
    ? [...listRows].filter((row) => {
        const includes = (value: unknown, search: string) => String(value ?? "").toLowerCase().includes(search.trim().toLowerCase());
        const name = `${String(row.first_name ?? "")} ${String(row.last_name ?? "")}`;
        return includes(row.employee_no, employeeFilters.employeeNo) && includes(name, employeeFilters.name) &&
          includes(row.position, employeeFilters.position) && includes(row.department, employeeFilters.department) &&
          includes(row.organization, employeeFilters.organization) && includes(row.project_location, employeeFilters.projectLocation) &&
          includes(row.report_to, employeeFilters.reportTo);
      }).sort((a, b) => {
        const left = new Date(String(a.created_at ?? 0)).getTime();
        const right = new Date(String(b.created_at ?? 0)).getTime();
        return employeeFilters.sort === "newer" ? right - left : left - right;
      })
    : listRows;
  const employeeTotalPages = Math.max(1, Math.ceil(displayRows.length / employeePageSize));
  const currentEmployeePage = Math.min(employeePage, employeeTotalPages);
  const tableRows = page === "Employees"
    ? displayRows.slice((currentEmployeePage - 1) * employeePageSize, currentEmployeePage * employeePageSize)
    : displayRows;
  const filteredUserRows = page === "Users & Roles"
    ? listRows.filter((row) => {
        const includes = (value: unknown, search: string) => String(value ?? "").toLowerCase().includes(search.trim().toLowerCase());
        const name = `${String(row.first_name ?? "")} ${String(row.last_name ?? "")}`;
        return includes(row.employee_no, userFilters.employeeNo) && includes(name, userFilters.name) &&
          includes(row.position, userFilters.position) && includes(row.department, userFilters.department) &&
          includes(row.organization, userFilters.organization) && includes(row.project_location, userFilters.projectLocation) &&
          includes(row.report_to, userFilters.reportTo) && includes(row.role, userFilters.role);
      })
    : listRows;
  const updateUserFilter = (key: keyof UserFilters, value: string) =>
    setUserFilters((current) => ({ ...current, [key]: value }));
  const updateEmployeeFilter = (key: keyof EmployeeFilters, value: string) => {
    setEmployeeFilters((current) => ({ ...current, [key]: value }));
    setEmployeePage(1);
  };
  const load = () => {
    if (!endpoint) return;
    const version = ++requestVersion.current;
    setLoading(true);
    setRows(endpoint === "reports/summary" ? {} : []);
    fetch(`${API}/${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Unable to load data");
        return r.json();
      })
      .then((data) => {
        if (version === requestVersion.current) setRows(data);
      })
      .catch(() => {
        if (version === requestVersion.current)
          setRows(endpoint === "reports/summary" ? {} : []);
      })
      .finally(() => {
        if (version === requestVersion.current) setLoading(false);
      });
  };
  useEffect(load, [endpoint, token]);
  useEffect(() => {
    if (page !== "Role Access Control" || !Array.isArray(rows)) return;
    const draft: Record<string, boolean> = {};
    for (const row of rows as Record<string, unknown>[])
      draft[`${String(row.role)}::${String(row.menu_key)}`] = Boolean(row.allowed);
    setPermissionDraft(draft);
    setPermissionDirty(false);
  }, [page, rows]);
  useEffect(() => {
    setShowForm(false);
    setImportResult("");
  }, [page]);
  useEffect(() => {
    if (page === "Employees" || page === "Item Master")
      fetch(`${API}/item-master`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => setMasterItems(Array.isArray(data) ? data : []));
  }, [page, token]);
  const createEmployee = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPendingEmployee(Object.fromEntries(new FormData(e.currentTarget)));
  };
  const confirmCreateEmployee = async () => {
    if (!pendingEmployee) return;
    const r = await fetch(`${API}/employees`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pendingEmployee),
    });
    if (r.ok) {
      setPendingEmployee(null);
      setShowForm(false);
      load();
    } else {
      const result = await r.json();
      setPendingEmployee(null);
      alert(
        result.error ??
          result.details?.[0]?.message ??
          "Unable to create employee",
      );
    }
  };
  const selectEmployee = async (id: unknown) => {
    const r = await fetch(`${API}/employees/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) {
      setSelectedEmployee(await r.json());
      setEditingEmployee(false);
    }
  };
  const saveEmployeeEdit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    const id = selectedEmployee.id;
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const r = await fetch(`${API}/employees/${id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      await selectEmployee(id);
      setEditingEmployee(false);
      load();
    } else alert((await r.json()).error ?? "Unable to update employee");
  };
  const decide = async () => {
    if (!confirmation) return;
    await fetch(`${API}/requests/${confirmation.id}/action`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: confirmation.action }),
    });
    setConfirmation(null);
    load();
  };
  const createRequest = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      requestType: requestType[page],
      title: f.get("title"),
      reason: f.get("reason"),
      startAt: new Date(String(f.get("startAt"))).toISOString(),
      endAt: new Date(String(f.get("endAt"))).toISOString(),
    };
    const r = await fetch(`${API}/requests`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setShowForm(false);
      load();
      onRequestsChanged?.();
      onNotificationsChanged?.();
    } else alert((await r.json()).error ?? "Unable to save request");
  };
  const createAnnouncement = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await fetch(`${API}/announcements`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: f.get("title"),
        body: f.get("body"),
        publish: true,
      }),
    });
    if (!r.ok) return alert((await r.json()).error ?? "Unable to publish");
    const announcement = await r.json();
    const files = f
      .getAll("files")
      .filter((value) => value instanceof File && value.size) as File[];
    if (files.length) {
      const upload = new FormData();
      files.forEach((file) => upload.append("files", file));
      await fetch(`${API}/announcements/${announcement.id}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: upload,
      });
    }
    setShowForm(false);
    load();
  };
  const updateUser = async (id: unknown, role: string) => {
    const response = await fetch(`${API}/users/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role }),
    });
    setRoleSaveNotice(response.ok
      ? { type: "success", message: `Role updated to ${role} successfully.` }
      : { type: "error", message: "Unable to update role. Please try again." });
    window.setTimeout(() => setRoleSaveNotice(null), 2600);
    load();
  };
  const resetUserPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetUser) return;
    setResetMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${API}/users/${resetUser.id}/reset-password`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: form.get("newPassword"), confirmPassword: form.get("confirmPassword") }),
    });
    const result = await response.json();
    setResetMessage(response.ok ? "Password reset successfully." : (result.error ?? "Unable to reset password."));
    if (response.ok) event.currentTarget.reset();
  };
  const saveSettings = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const language = String(f.get("language") ?? "English");
    for (const [key, value] of [
      [
        "company",
        { name: f.get("companyName"), timezone: f.get("timezone"), language },
      ],
      [
        "attendance",
        {
          startTime: f.get("startTime"),
          lateAfter: f.get("lateAfter"),
          gpsRequired: f.get("gpsRequired") === "on",
        },
      ],
    ])
      await fetch(`${API}/settings/${key}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(value),
      });
    localStorage.setItem("portal_language", language);
    document.documentElement.lang = language === "Myanmar" ? "my" : "en";
    alert(
      language === "Myanmar" ? "ဆက်တင်များ သိမ်းပြီးပါပြီ" : "Settings saved",
    );
    window.location.reload();
  };
  const downloadExcel = async (path: string, filename: string) => {
    const r = await fetch(`${API}/employees/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return alert("Download failed");
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  const downloadReport = async (type: string) => {
    const r = await fetch(`${API}/reports/export?type=${type}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return alert("Report generation failed");
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importExcel = async (file?: File) => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    setImportResult("Importing…");
    const r = await fetch(`${API}/employees/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const result = await r.json();
    if (!r.ok) {
      setImportResult(result.error ?? "Import failed");
      return;
    }
    const errorDetails = Array.isArray(result.errors)
      ? result.errors.slice(0, 8).map((error: { row: number; message: string }) => `Row ${error.row}: ${error.message}`).join("\n")
      : "";
    setImportResult(
      `Imported ${result.imported}, updated ${result.updated}, skipped ${result.skipped}${errorDetails ? `\n${errorDetails}` : ""}`,
    );
    load();
    if (fileInput.current) fileInput.current.value = "";
  };
  const createCorporate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await fetch(`${API}/corporate-requests`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestType: corporateType[page],
        payee: f.get("payee"),
        purpose: f.get("purpose"),
        amount: f.get("amount"),
        currency: f.get("currency"),
      }),
    });
    if (r.ok) {
      setShowForm(false);
      load();
    } else alert((await r.json()).error ?? "Unable to submit request");
  };
  const updatePermission = (
    role: string,
    menuKey: string,
    allowed: boolean,
  ) => {
    setPermissionDraft((current) => ({ ...current, [`${role}::${menuKey}`]: allowed }));
    setPermissionDirty(true);
    setPermissionNotice("");
  };
  const savePermissions = async () => {
    setPermissionNotice("Saving changes…");
    const changes = Object.entries(permissionDraft).filter(([key]) => !key.startsWith("admin::"));
    const responses = await Promise.all(changes.map(([key, allowed]) => {
      const [role, menuKey] = key.split("::");
      return fetch(`${API}/permissions`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role, menuKey, allowed }),
      });
    }));
    if (responses.some((response) => !response.ok)) {
      setPermissionNotice("Some permissions could not be saved. Please try again.");
      return;
    }
    setPermissionDirty(false);
    setPermissionNotice("Role access permissions saved successfully.");
    load();
  };
  const downloadAttachment = async (
    announcementId: unknown,
    attachmentId: unknown,
    name: string,
  ) => {
    const r = await fetch(
      `${API}/announcements/${announcementId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) return;
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };
  const markRead = async (id: unknown) => {
    await fetch(`${API}/notifications/${id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
    onNotificationsChanged?.();
  };
  const markAllRead = async () => {
    await fetch(`${API}/notifications/read-all`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
    onNotificationsChanged?.();
  };
  const confirmMasterAction = async () => {
    if (!masterConfirmation) return;
    if (masterConfirmation.mode === "add") {
      await fetch(`${API}/item-master`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemType: masterConfirmation.itemType,
          name: masterConfirmation.name,
        }),
      });
    } else
      await fetch(
        `${API}/item-master/${masterConfirmation.itemType}/${masterConfirmation.id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
    setMasterConfirmation(null);
    const r = await fetch(`${API}/item-master`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) {
      const data = await r.json();
      setMasterItems(data);
      setRows(data);
    }
  };
  const calculateAge = (date: string) => {
    if (!date) return "";
    const birth = new Date(`${date}T00:00:00`),
      today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    if (
      today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() &&
        today.getDate() < birth.getDate())
    )
      age--;
    return age >= 0 ? String(age) : "";
  };
  const calculateService = (date: string) => {
    if (!date) return "";
    const start = new Date(`${date}T00:00:00`),
      today = new Date();
    if (start > today) return "";
    const clampedDate = (year: number, month: number) =>
      new Date(
        year,
        month,
        Math.min(start.getDate(), new Date(year, month + 1, 0).getDate()),
      );
    let years = today.getFullYear() - start.getFullYear();
    let yearCursor = clampedDate(start.getFullYear() + years, start.getMonth());
    if (yearCursor > today) {
      years--;
      yearCursor = clampedDate(start.getFullYear() + years, start.getMonth());
    }
    let months = 0;
    let monthCursor = yearCursor;
    while (months < 11) {
      const next = clampedDate(
        start.getFullYear() + years,
        start.getMonth() + months + 1,
      );
      if (next > today) break;
      months++;
      monthCursor = next;
    }
    const days = Math.floor(
      (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
        monthCursor.getTime()) /
        (24 * 60 * 60 * 1000),
    );
    return `${years} years ${months} months ${days} days`;
  };
  const updateCalculated = (
    form: HTMLFormElement | null,
    targetName: string,
    value: string,
  ) => {
    if (!form) return;
    const target = form.elements.namedItem(
      targetName,
    ) as HTMLInputElement | null;
    if (target) target.value = value;
  };
  const renderEditField = (field: [string, string, string, string?]) => {
    if (!selectedEmployee) return null;
    const [label, key, name, type] = field;
    const raw =
      key === "age"
        ? calculateAge(String(selectedEmployee.date_of_birth ?? "").slice(0, 10))
        : key === "service_year"
          ? calculateService(String(selectedEmployee.joined_on ?? "").slice(0, 10))
          : selectedEmployee[key];
    const value =
      typeof raw === "boolean"
        ? raw
          ? "Yes"
          : "No"
        : type === "date" && raw
          ? String(raw).slice(0, 10)
          : String(raw ?? "");
    if (key === "service_year")
      return (
        <label key={key}>
          {label}
          <input
            name="serviceYearDisplay"
            value={value}
            readOnly
            className="calculated-field"
          />
          <input name="serviceYear" type="hidden" value="" />
        </label>
      );
    const masterType =
      key === "department"
        ? "department"
        : key === "organization"
          ? "organization"
          : key === "project_location"
            ? "project_location"
            : "";
    if (masterType)
      return (
        <label key={key}>
          {label}
          <select name={name} defaultValue={value}>
            <option value="">Select {label}</option>
            {masterItems
              .filter((item) => item.item_type === masterType)
              .map((item) => (
                <option key={String(item.id)}>{String(item.name)}</option>
              ))}
          </select>
        </label>
      );
    const options: Record<string, string[]> = {
      gender: ["Male", "Female", "Other"],
      blood_type: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
      marital_status: ["Single", "Married", "Divorced", "Widowed"],
      has_children: ["Yes", "No"],
      employment_type: ["Probation", "Permanent"],
      shift_required: ["Yes", "No"],
    };
    if (options[key])
      return (
        <label key={key}>
          {label}
          <select name={name} defaultValue={value}>
            <option value="">Select</option>
            {options[key].map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      );
    return (
      <label key={key}>
        {label}
        <input
          name={name}
          type={type ?? "text"}
          defaultValue={value}
          readOnly={key === "age" || key === "service_year"}
          className={
            key === "age" || key === "service_year" ? "calculated-field" : ""
          }
          required={name === "employeeNo" || name === "nameEng"}
          onChange={
            key === "date_of_birth"
              ? (e) =>
                  updateCalculated(
                    e.currentTarget.form,
                    "age",
                    calculateAge(e.target.value),
                  )
              : key === "joined_on"
                ? (e) =>
                    updateCalculated(
                      e.currentTarget.form,
                      "serviceYearDisplay",
                      calculateService(e.target.value),
                    )
                : undefined
          }
        />
      </label>
    );
  };
  if (!endpoint)
    return (
      <div className="empty-page">
        <div>◇</div>
        <h2>{page}</h2>
        <p>This module is next in the implementation queue.</p>
      </div>
    );
  if (corporateType[page])
    return (
      <>
        <div className="page-title">
          <div>
            <p>CORPORATE WORKFLOW</p>
            <h1>{page}</h1>
            <span>Submit and track corporate finance requests</span>
          </div>
          <button className="primary" onClick={() => setShowForm(true)}>
            ＋ New request
          </button>
        </div>
        {showForm && (
          <form
            className="employee-form corporate-form"
            onSubmit={createCorporate}
          >
            <h2>New {page}</h2>
            <div className="form-grid">
              <label>
                Payee / Recipient
                <input name="payee" />
              </label>
              <label>
                Amount
                <input
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Currency
                <select name="currency" defaultValue="MMK">
                  <option>MMK</option>
                  <option>USD</option>
                  <option>THB</option>
                </select>
              </label>
              <label className="wide">
                Purpose
                <input name="purpose" required />
              </label>
            </div>
            <div>
              <button type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button className="primary">Submit request</button>
            </div>
          </form>
        )}
        <section className="data-card">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Employee</th>
                  <th>Payee</th>
                  <th>Purpose</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {listRows.map((r, i) => (
                  <tr key={String(r.id ?? i)}>
                    <td>
                      <b>{String(r.reference_no)}</b>
                      <small>
                        {new Date(String(r.request_date)).toLocaleDateString()}
                      </small>
                    </td>
                    <td>{String(r.employee_name)}</td>
                    <td>{String(r.payee ?? "—")}</td>
                    <td>{String(r.purpose)}</td>
                    <td>
                      {Number(r.amount).toLocaleString()} {String(r.currency)}
                    </td>
                    <td>
                      <span className={`pill ${String(r.status)}`}>
                        {String(r.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </>
    );
  if (page === "Role Access Control") {
    const roles = ["admin", "hr", "manager", "approver", "employee"];
    const menus = [
      "Overview",
      "Employees",
      "Attendance",
      "Approvals",
      "Leave",
      "Overtime",
      "Appraisals",
      "Announcements",
      "Notification",
      "Reports",
      "Users & Roles",
      "Corporate",
      "Payment Request",
      "Advance Clearance",
      "Permission",
      "Item Master",
      "Settings",
    ];
    return (
      <>
        <div className="page-title">
          <div>
            <p>GENERAL SETTING</p>
            <h1>Role Access Control</h1>
            <span>Choose which navigation modules each role can access</span>
          </div>
        </div>
        <section className="permission-card">
          <table>
            <thead>
              <tr>
                <th>Menu</th>
                {roles.map((role) => (
                  <th key={role}>{role}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {menus.map((menu) => (
                <tr key={menu}>
                  <td>
                    <b>{menu}</b>
                  </td>
                  {roles.map((role) => {
                    const entry = listRows.find(
                      (row) => row.role === role && row.menu_key === menu,
                    );
                    const draftKey = `${role}::${menu}`;
                    const checked = role === "admin" || (draftKey in permissionDraft ? permissionDraft[draftKey] : Boolean(entry?.allowed));
                    return (
                      <td key={role}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={role === "admin"}
                          onChange={(e) =>
                            updatePermission(role, menu, e.target.checked)
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="permission-save-bar">
            <span className={permissionNotice.includes("successfully") ? "success" : permissionNotice.includes("could not") ? "error" : ""}>
              {permissionNotice || (permissionDirty ? "You have unsaved permission changes." : "All permission changes are saved.")}
            </span>
            <button type="button" disabled={!permissionDirty} onClick={savePermissions}>
              Save changes
            </button>
          </div>
        </section>
      </>
    );
  }
  if (page === "Item Master") {
    const categories: [string, string][] = [
      ["department", "Department"],
      ["organization", "Organization"],
      ["project_location", "Project Location"],
    ];
    return (
      <>
        <div className="page-title">
          <div>
            <p>GENERAL SETTING / HR</p>
            <h1>Item Master</h1>
            <span>Manage reusable values used in employee forms</span>
          </div>
        </div>
        <section className="master-section">
          <div className="master-heading">
            <div>
              <span>HR</span>
              <div>
                <h2>Employee master values</h2>
                <p>Updates appear immediately in New Employee combo boxes.</p>
              </div>
            </div>
          </div>
          <div className="master-grid">
            {categories.map(([type, label]) => (
              <article className="master-card" key={type}>
                <h3>{label}</h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    const name = String(form.get("name") ?? "").trim();
                    if (name) {
                      setMasterConfirmation({
                        mode: "add",
                        itemType: type,
                        name,
                      });
                      e.currentTarget.reset();
                    }
                  }}
                >
                  <input name="name" required placeholder={`New ${label}`} />
                  <button>＋ Add</button>
                </form>
                <div>
                  {masterItems
                    .filter((item) => item.item_type === type)
                    .map((item) => (
                      <span key={String(item.id)}>
                        {String(item.name)}
                        <button
                          title="Remove"
                          onClick={() =>
                            setMasterConfirmation({
                              mode: "remove",
                              itemType: type,
                              name: String(item.name),
                              id: String(item.id),
                            })
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                </div>
              </article>
            ))}
          </div>
        </section>
        {masterConfirmation && (
          <MasterConfirmDialog
            item={masterConfirmation}
            onCancel={() => setMasterConfirmation(null)}
            onConfirm={confirmMasterAction}
          />
        )}
      </>
    );
  }
  if (page === "Notification") {
    const unread = listRows.filter((row) => !row.read_at).length;
    return (
      <>
        <div className="page-title">
          <div>
            <p>INBOX</p>
            <h1>Notifications</h1>
            <span>
              {unread} unread notification{unread === 1 ? "" : "s"}
            </span>
          </div>
          {unread > 0 && (
            <button className="mark-all-button" onClick={markAllRead}>
              ✓ Mark all as read
            </button>
          )}
        </div>
        <section className="notification-list">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : listRows.length ? (
            listRows.map((r, i) => (
              <article
                className={r.read_at ? "read" : ""}
                key={String(r.id ?? i)}
                onClick={() => { if (!r.read_at) markRead(r.id); }}
              >
                <i>
                  <NavIcon name="Notification" />
                </i>
                <div>
                  <b>{String(r.title)}</b>
                  <p>{String(r.message)}</p>
                  <small>
                    {new Date(String(r.created_at)).toLocaleString()}
                  </small>
                </div>
                {!r.read_at && (
                  <button onClick={() => markRead(r.id)}>Mark as read</button>
                )}
              </article>
            ))
          ) : (
            <div className="loading">No notifications yet.</div>
          )}
        </section>
      </>
    );
  }
  if (page === "My Profile") {
    const profile = (
      !Array.isArray(rows) && rows && typeof rows === "object" ? rows : {}
    ) as Record<string, unknown>;
    return (
      <>
        <div className="page-title">
          <div>
            <p>ACCOUNT</p>
            <h1>My Profile</h1>
            <span>Your employee and account information</span>
          </div>
        </div>
        <section className="web-profile">
          <div className="profile-hero">
            <span>
              {String(profile.first_name ?? "").slice(0, 1)}
              {String(profile.last_name ?? "").slice(0, 1)}
            </span>
            <div>
              <h2>
                {String(profile.first_name ?? "")}{" "}
                {String(profile.last_name ?? "")}
              </h2>
              <p>{String(profile.position ?? "Employee")}</p>
            </div>
          </div>
          <div className="profile-grid">
            {[
              ["Employee ID", profile.employee_no],
              ["Email", profile.email],
              ["Department", profile.department],
              ["Position", profile.position],
              ["Work Location", profile.work_location],
              ["Manager", profile.manager],
              ["Role", profile.role],
              ["Status", profile.employment_status],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <small>{String(label)}</small>
                <b>{String(value ?? "—")}</b>
              </div>
            ))}
          </div>
        </section>
      </>
    );
  }
  if (requestType[page])
    return (
      <>
        <div className="page-title">
          <div>
            <p>EMPLOYEE WORKFLOW</p>
            <h1>{page}</h1>
            <span>Submitted requests and approval status</span>
          </div>
          <button className="primary" onClick={() => setShowForm(true)}>
            ＋ New {page === "Appraisals" ? "appraisal" : "request"}
          </button>
        </div>
        {showForm && (
          <form
            className="employee-form workflow-form"
            onSubmit={createRequest}
          >
            <h2>New {page} request</h2>
            <div className="form-grid">
              <label>
                Title
                <input name="title" required placeholder={`${page} request`} />
              </label>
              <label>
                Start
                <input name="startAt" type="datetime-local" required />
              </label>
              <label>
                End
                <input name="endAt" type="datetime-local" required />
              </label>
              <label className="wide">
                Reason
                <input name="reason" required />
              </label>
            </div>
            <div>
              <button type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button className="primary">Submit request</button>
            </div>
          </form>
        )}
        <section className="data-card">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Request</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {listRows.map((r, i) => (
                  <tr key={String(r.id ?? i)}>
                    <td>
                      <b>
                        {String(r.first_name)} {String(r.last_name)}
                      </b>
                      <small>{String(r.employee_no)}</small>
                    </td>
                    <td>
                      <b>{String(r.title)}</b>
                      <small>{String(r.reason)}</small>
                    </td>
                    <td>
                      {r.start_at
                        ? new Date(String(r.start_at)).toLocaleDateString()
                        : "—"}{" "}
                      →{" "}
                      {r.end_at
                        ? new Date(String(r.end_at)).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>
                      <span className={`pill ${String(r.status)}`}>
                        {String(r.status)}
                      </span>
                    </td>
                    <td>
                      {new Date(String(r.created_at)).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </>
    );
  if (page === "Announcements")
    return (
      <>
        <div className="page-title">
          <div>
            <p>COMMUNICATIONS</p>
            <h1>Announcements</h1>
            <span>Company news with images, PDFs and documents</span>
          </div>
          <button className="primary" onClick={() => setShowForm(true)}>
            ＋ New announcement
          </button>
        </div>
        {showForm && (
          <form className="employee-form" onSubmit={createAnnouncement}>
            <h2>Publish announcement</h2>
            <div className="form-grid announcement-form">
              <label>
                Title
                <input name="title" required />
              </label>
              <label>
                Message
                <input name="body" required />
              </label>
              <label>
                Attachments (up to 5)
                <input
                  name="files"
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  multiple
                />
              </label>
            </div>
            <div>
              <button type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button className="primary">Publish now</button>
            </div>
          </form>
        )}
        <div className="announcement-list">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : (
            listRows.map((r, i) => (
              <article key={String(r.id ?? i)}>
                <div>📣</div>
                <section>
                  <small>
                    {r.published_at ? "PUBLISHED" : "DRAFT"} ·{" "}
                    {new Date(String(r.created_at)).toLocaleDateString()}
                  </small>
                  <h2>{String(r.title)}</h2>
                  <p>{String(r.body)}</p>
                  {Array.isArray(r.attachments) && r.attachments.length > 0 && (
                    <div className="attachment-list">
                      {(r.attachments as Record<string, unknown>[]).map(
                        (file) => (
                          <button
                            key={String(file.id)}
                            onClick={() =>
                              downloadAttachment(
                                r.id,
                                file.id,
                                String(file.name),
                              )
                            }
                          >
                            📎 {String(file.name)}
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </section>
              </article>
            ))
          )}
        </div>
      </>
    );
  if (page === "Reports") {
    const summary = (
      !Array.isArray(rows) && rows && typeof rows === "object" ? rows : {}
    ) as Record<string, number>;
    return (
      <>
        <div className="page-title">
          <div>
            <p>LIVE REPORTING</p>
            <h1>Reports</h1>
            <span>
              Current operational totals and downloadable Excel reports
            </span>
          </div>
        </div>
        {loading ? (
          <div className="loading">Loading reports…</div>
        ) : (
          <>
            <div className="report-grid">
              {Object.entries(summary).map(([key, value]) => (
                <article key={key}>
                  <small>{key.replaceAll("_", " ")}</small>
                  <strong>{value}</strong>
                  <span>Live database total</span>
                </article>
              ))}
            </div>
            <section className="report-downloads">
              <div>
                <h2>Detailed reports</h2>
                <p>Generate a current Excel workbook from PostgreSQL.</p>
              </div>
              {[
                [
                  "attendance",
                  "Attendance report",
                  "Daily check-in, check-out and status",
                ],
                ["leave", "Leave report", "Leave periods and approval status"],
                [
                  "overtime",
                  "Overtime report",
                  "Overtime requests and decisions",
                ],
                [
                  "approvals",
                  "Approval report",
                  "All workflow decisions and status",
                ],
              ].map(([type, title, description]) => (
                <article key={type}>
                  <i>▤</i>
                  <div>
                    <b>{title}</b>
                    <small>{description}</small>
                  </div>
                  <button onClick={() => downloadReport(type)}>
                    Download Excel ↓
                  </button>
                </article>
              ))}
            </section>
          </>
        )}
      </>
    );
  }
  if (page === "Users & Roles")
    return (
      <>
        <div className="page-title">
          <div>
            <p>ACCESS CONTROL</p>
            <h1>Users & Roles</h1>
            <span>Manage system access and permissions</span>
          </div>
        </div>
        <section className="employee-filter-card users-filter-card">
          <div className="employee-filter-heading">
            <div><h2>Filter users</h2><p>Search user accounts by employee information and role.</p></div>
            <button type="button" onClick={() => setUserFilters({ employeeNo: "", name: "", position: "", department: "", organization: "", projectLocation: "", reportTo: "", role: "" })}>Clear filters</button>
          </div>
          <div className="employee-filter-grid">
            <label>Employee ID<input value={userFilters.employeeNo} onChange={(event) => updateUserFilter("employeeNo", event.target.value)} /></label>
            <label>Employee Name<input value={userFilters.name} onChange={(event) => updateUserFilter("name", event.target.value)} /></label>
            <label>Position<input value={userFilters.position} onChange={(event) => updateUserFilter("position", event.target.value)} /></label>
            <label>Department<input value={userFilters.department} onChange={(event) => updateUserFilter("department", event.target.value)} /></label>
            <label>Organization<input value={userFilters.organization} onChange={(event) => updateUserFilter("organization", event.target.value)} /></label>
            <label>Project Location<input value={userFilters.projectLocation} onChange={(event) => updateUserFilter("projectLocation", event.target.value)} /></label>
            <label>Report To<input value={userFilters.reportTo} onChange={(event) => updateUserFilter("reportTo", event.target.value)} /></label>
            <label>Role<select value={userFilters.role} onChange={(event) => updateUserFilter("role", event.target.value)}><option value="">All roles</option><option value="admin">Admin</option><option value="hr">HR</option><option value="manager">Manager</option><option value="approver">Approver</option><option value="employee">Employee</option></select></label>
          </div>
        </section>
        <section className="data-card users-role-card">
          <table>
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Employee Name</th>
                <th>Position</th>
                <th>Department</th>
                <th>Organization</th>
                <th>Project Location</th>
                <th>Report To</th>
                <th>Role</th>
                <th>User Name</th>
                <th>Password</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUserRows.map((r, i) => (
                <tr key={String(r.id ?? i)}>
                  <td>{String(r.employee_no ?? "—")}</td>
                  <td>
                    <b>
                      {String(r.first_name ?? "")} {String(r.last_name ?? "")}
                    </b>
                  </td>
                  <td>{String(r.position ?? "—")}</td>
                  <td>{String(r.department ?? "—")}</td>
                  <td>{String(r.organization ?? "—")}</td>
                  <td>{String(r.project_location ?? "—")}</td>
                  <td>{String(r.report_to ?? "—")}</td>
                  <td>
                    <select
                      className="role-select"
                      value={String(r.role)}
                      onChange={(e) => updateUser(r.id, e.target.value)}
                    >
                      {["admin", "hr", "manager", "approver", "employee"].map(
                        (role) => (
                          <option key={role}>{role}</option>
                        ),
                      )}
                    </select>
                  </td>
                  <td className="username-cell">{String(r.username ?? "—")}</td>
                  <td className="password-cell">{String(r.password_mask ?? "********")}</td>
                  <td><button className="reset-password-button" onClick={() => { setResetMessage(""); setResetUser(r); }}>Reset password</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {resetUser && (
          <div className="confirm-backdrop" onMouseDown={() => setResetUser(null)}>
            <form className="password-reset-dialog" onSubmit={resetUserPassword} onMouseDown={(event) => event.stopPropagation()}>
              <div className="password-reset-icon">↻</div>
              <h2>Reset Password</h2>
              <p>{String(resetUser.first_name ?? "")} {String(resetUser.last_name ?? "")} · {String(resetUser.username ?? "")}</p>
              <label>New Password<input name="newPassword" type="password" minLength={8} required /></label>
              <label>Confirm Password<input name="confirmPassword" type="password" minLength={8} required /></label>
              {resetMessage && <div className={resetMessage.includes("successfully") ? "reset-success" : "reset-error"}>{resetMessage}</div>}
              <div className="password-reset-actions">
                <button type="button" onClick={() => setResetUser(null)}>Cancel</button>
                <button className="primary">Reset Password</button>
              </div>
            </form>
          </div>
        )}
        {roleSaveNotice && (
          <div className={`role-save-popup ${roleSaveNotice.type}`} role="status">
            <span>{roleSaveNotice.type === "success" ? "✓" : "!"}</span>
            <div>
              <b>{roleSaveNotice.type === "success" ? "Saved successfully" : "Save failed"}</b>
              <small>{roleSaveNotice.message}</small>
            </div>
            <button onClick={() => setRoleSaveNotice(null)}>×</button>
          </div>
        )}
      </>
    );
  if (page === "Settings") {
    const values = Object.fromEntries(
      listRows.map((r) => [String(r.setting_key), r.setting_value]),
    ) as Record<string, Record<string, unknown>>;
    return (
      <>
        <div className="page-title">
          <div>
            <p>CONFIGURATION</p>
            <h1>System Settings</h1>
            <span>Company, language and attendance rules</span>
          </div>
        </div>
        <form className="settings-card" onSubmit={saveSettings}>
          <section>
            <h2>Company settings</h2>
            <label>
              Company name
              <input
                name="companyName"
                defaultValue={String(
                  values.company?.name ?? "Than Toe Aung Company",
                )}
              />
            </label>
            <label>
              Timezone
              <select
                name="timezone"
                defaultValue={String(values.company?.timezone ?? "Asia/Yangon")}
              >
                <option>Asia/Yangon</option>
                <option>Asia/Bangkok</option>
                <option>Asia/Singapore</option>
              </select>
            </label>
            <label>
              System language
              <select
                name="language"
                defaultValue={String(
                  values.company?.language ??
                    localStorage.getItem("portal_language") ??
                    "English",
                )}
              >
                <option>English</option>
                <option>Myanmar</option>
              </select>
            </label>
          </section>
          <section>
            <h2>Attendance rules</h2>
            <label>
              Work starts
              <input
                name="startTime"
                type="time"
                defaultValue={String(values.attendance?.startTime ?? "09:00")}
              />
            </label>
            <label>
              Late after
              <input
                name="lateAfter"
                type="time"
                defaultValue={String(values.attendance?.lateAfter ?? "09:00")}
              />
            </label>
            <label className="check-label">
              <input
                name="gpsRequired"
                type="checkbox"
                defaultChecked={values.attendance?.gpsRequired !== false}
              />{" "}
              Require GPS for mobile attendance
            </label>
          </section>
          <button className="primary">Save settings</button>
        </form>
      </>
    );
  }
  return (
    <>
      <div className="page-title">
        <div>
          <p>COMPANY PORTAL</p>
          <h1>{page}</h1>
          <span>Live records from PostgreSQL</span>
        </div>
        {page === "Employees" && (
          <div className="employee-tools">
            <button
              onClick={() =>
                downloadExcel("template", "employee-import-template.xlsx")
              }
            >
              ⇩ Excel template
            </button>
            <button onClick={() => fileInput.current?.click()}>
              ⇧ Import Excel
            </button>
            <button
              onClick={() =>
                downloadExcel(
                  "export",
                  `employees-${new Date().toISOString().slice(0, 10)}.xlsx`,
                )
              }
            >
              ⇩ Export
            </button>
            <button className="primary" onClick={() => setShowForm(true)}>
              ＋ Add employee
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx"
              hidden
              onChange={(e) => importExcel(e.target.files?.[0])}
            />
          </div>
        )}
      </div>
      {importResult && (
        <div
          className={`import-result ${importResult.includes("failed") || importResult.includes("Missing") || importResult.includes("Row ") ? "error" : ""}`}
        >
          {importResult}
          <button onClick={() => setImportResult("")}>×</button>
        </div>
      )}
      {showForm && (
        <form
          className="employee-form employee-full-form"
          onSubmit={createEmployee}
        >
          <div className="form-heading">
            <div>
              <h2>New employee</h2>
              <p>
                Complete employee profile · Sr No is generated automatically
              </p>
            </div>
            <button type="button" onClick={() => setShowForm(false)}>
              ×
            </button>
          </div>
          <fieldset>
            <legend>Employment information</legend>
            <div className="full-form-grid">
              <label>
                Employee ID *
                <input name="employeeNo" required placeholder="EMP-0006" />
              </label>
              <label>
                Employee Name (Eng) *<input name="nameEng" required />
              </label>
              <label>
                Employee Name (MM)
                <input name="nameMm" />
              </label>
              <label>
                Position
                <input name="position" />
              </label>
              <label>
                Department
                <select name="department">
                  <option value="">Select Department</option>
                  {masterItems
                    .filter((item) => item.item_type === "department")
                    .map((item) => (
                      <option key={String(item.id)}>{String(item.name)}</option>
                    ))}
                </select>
              </label>
              <label>
                Organization
                <select name="organization">
                  <option value="">Select Organization</option>
                  {masterItems
                    .filter((item) => item.item_type === "organization")
                    .map((item) => (
                      <option key={String(item.id)}>{String(item.name)}</option>
                    ))}
                </select>
              </label>
              <label>
                Project Location
                <select name="projectLocation">
                  <option value="">Select Project Location</option>
                  {masterItems
                    .filter((item) => item.item_type === "project_location")
                    .map((item) => (
                      <option key={String(item.id)}>{String(item.name)}</option>
                    ))}
                </select>
              </label>
              <label>
                Join Date
                <input
                  name="joinDate"
                  type="date"
                  onChange={(e) =>
                    updateCalculated(
                      e.currentTarget.form,
                      "serviceYearDisplay",
                      calculateService(e.target.value),
                    )
                  }
                />
              </label>
              <label>
                Permanent Date
                <input name="permanentDate" type="date" />
              </label>
              <label>
                Service Year
                <input
                  name="serviceYearDisplay"
                  readOnly
                  className="calculated-field"
                />
                <input name="serviceYear" type="hidden" value="" />
              </label>
              <label>
                Probation/Permanent
                <select name="employmentType">
                  <option value="">Select</option>
                  <option>Probation</option>
                  <option>Permanent</option>
                </select>
              </label>
              <label>
                Branch
                <input name="branch" />
              </label>
              <label>
                Resign / Retired / Terminate Date
                <input name="separationDate" type="date" />
              </label>
              <label>
                Report To
                <input name="reportTo" placeholder="Employee ID or name" />
              </label>
              <label>
                Shift
                <select name="shiftRequired">
                  <option value="">Select</option>
                  <option>Yes</option>
                  <option>No</option>
                </select>
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Personal information</legend>
            <div className="full-form-grid">
              <label>
                NRC No (MM)
                <input name="nrcNoMm" />
              </label>
              <label>
                NRC No (Eng)
                <input name="nrcNoEng" />
              </label>
              <label>
                DOB (Eng)
                <input
                  name="dob"
                  type="date"
                  onChange={(e) =>
                    updateCalculated(
                      e.currentTarget.form,
                      "age",
                      calculateAge(e.target.value),
                    )
                  }
                />
              </label>
              <label>
                Age
                <input
                  name="age"
                  type="number"
                  min="0"
                  max="100"
                  readOnly
                  className="calculated-field"
                />
              </label>
              <label>
                Gender
                <select name="gender">
                  <option value="">Select</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </label>
              <label>
                Blood Type
                <select name="bloodType">
                  <option value="">Select</option>
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Father Name
                <input name="fatherName" />
              </label>
              <label>
                Marital Status
                <select name="maritalStatus">
                  <option value="">Select</option>
                  <option>Single</option>
                  <option>Married</option>
                  <option>Divorced</option>
                  <option>Widowed</option>
                </select>
              </label>
              <label>
                Has Children
                <select name="hasChildren">
                  <option value="">Select</option>
                  <option>Yes</option>
                  <option>No</option>
                </select>
              </label>
              <label>
                Number of Children
                <input name="numberOfChildren" type="number" min="0" />
              </label>
              <label>
                Nationality
                <input name="nationality" defaultValue="Myanmar" />
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Qualifications, contact & payment</legend>
            <div className="full-form-grid">
              <label>
                Education
                <input name="education" />
              </label>
              <label>
                Other Qualification
                <input name="otherQualification" />
              </label>
              <label>
                Personal Phone No
                <input name="personalPhone" />
              </label>
              <label>
                Business Phone No
                <input name="businessPhone" />
              </label>
              <label>
                Business Email
                <input name="businessEmail" type="email" />
              </label>
              <label className="span-2">
                Current Address
                <textarea name="currentAddress" rows={2} />
              </label>
              <label>
                Bank Account / Pay Number
                <input name="bankAccountPayNumber" />
              </label>
            </div>
          </fieldset>
          <div className="form-footer">
            <button type="button" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button className="primary">Save employee</button>
          </div>
        </form>
      )}
      {page === "Employees" && !showForm && (
        <section className="employee-filter-card">
          <div className="employee-filter-heading">
            <div><h2>Filter employees</h2><p>Search the employee directory using one or more fields.</p></div>
            <button type="button" onClick={() => { setEmployeeFilters({ employeeNo: "", name: "", position: "", department: "", organization: "", projectLocation: "", reportTo: "", sort: "newer" }); setEmployeePage(1); }}>Clear filters</button>
          </div>
          <div className="employee-filter-grid">
            <label>Employee ID<input value={employeeFilters.employeeNo} onChange={(e) => updateEmployeeFilter("employeeNo", e.target.value)} /></label>
            <label>Employee Name<input value={employeeFilters.name} onChange={(e) => updateEmployeeFilter("name", e.target.value)} /></label>
            <label>Position<input value={employeeFilters.position} onChange={(e) => updateEmployeeFilter("position", e.target.value)} /></label>
            <label>Department<input value={employeeFilters.department} onChange={(e) => updateEmployeeFilter("department", e.target.value)} /></label>
            <label>Organization<input value={employeeFilters.organization} onChange={(e) => updateEmployeeFilter("organization", e.target.value)} /></label>
            <label>Project Location<input value={employeeFilters.projectLocation} onChange={(e) => updateEmployeeFilter("projectLocation", e.target.value)} /></label>
            <label>Report To<input value={employeeFilters.reportTo} onChange={(e) => updateEmployeeFilter("reportTo", e.target.value)} /></label>
            <label>Sorting<select value={employeeFilters.sort} onChange={(e) => updateEmployeeFilter("sort", e.target.value)}><option value="newer">Newer First</option><option value="older">Older First</option></select></label>
          </div>
        </section>
      )}
      <section className={`data-card ${page === "Employees" ? "employee-list-card" : ""}`}>
        {loading ? (
          <div className="loading">Loading database records…</div>
        ) : (
          <>
          <table>
            <thead>
              <tr>
                {page === "Employees" ? (
                  <>
                    <th>Employee ID</th>
                    <th>Employee Name</th>
                    <th>Position</th>
                    <th>Department</th>
                    <th>Organization</th>
                    <th>Project Location</th>
                    <th>Report To</th>
                  </>
                ) : page === "Attendance" ? (
                  <>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Check in</th>
                    <th>Check out</th>
                    <th>Status</th>
                  </>
                ) : (
                  <>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>Request</th>
                    <th>Date</th>
                    <th>{employeeApproval ? "Status" : "Actions"}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r, i) => (
                <tr
                  key={String(r.id ?? i)}
                  className={page === "Employees" ? "employee-row" : ""}
                  onClick={
                    page === "Employees"
                      ? () => selectEmployee(r.id)
                      : undefined
                  }
                >
                  {page === "Employees" ? (
                    <>
                      <td>{String(r.employee_no)}</td>
                      <td>
                        <b>
                          {String(r.first_name)} {String(r.last_name)}
                        </b>
                        <small className="employee-username">{String(r.username ?? "—")}</small>
                      </td>
                      <td>{String(r.position ?? "—")}</td>
                      <td>{String(r.department ?? "Unassigned")}</td>
                      <td>{String(r.organization ?? "—")}</td>
                      <td>{String(r.project_location ?? "—")}</td>
                      <td>{String(r.report_to ?? "—")}</td>
                    </>
                  ) : page === "Attendance" ? (
                    <>
                      <td>
                        <b>
                          {String(r.first_name)} {String(r.last_name)}
                        </b>
                        <small>{String(r.employee_no)}</small>
                      </td>
                      <td>
                        {new Date(String(r.work_date)).toLocaleDateString()}
                      </td>
                      <td>
                        {r.check_in
                          ? new Date(String(r.check_in)).toLocaleTimeString(
                              [],
                              { hour: "2-digit", minute: "2-digit" },
                            )
                          : "—"}
                      </td>
                      <td>
                        {r.check_out
                          ? new Date(String(r.check_out)).toLocaleTimeString(
                              [],
                              { hour: "2-digit", minute: "2-digit" },
                            )
                          : "—"}
                      </td>
                      <td>
                        <span className={`pill ${String(r.status)}`}>
                          {String(r.status)}
                        </span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <b>
                          {String(r.first_name)} {String(r.last_name)}
                        </b>
                        <small>{String(r.employee_no)}</small>
                      </td>
                      <td>{String(r.request_type).replace("_", " ")}</td>
                      <td>{String(r.title)}</td>
                      <td>
                        {new Date(String(r.created_at)).toLocaleDateString()}
                      </td>
                      <td className="table-actions">
                        {employeeApproval ? (
                          <span className={`pill ${String(r.status)}`}>
                            {String(r.status)}
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() =>
                                setConfirmation({
                                  id: String(r.id),
                                  action: "rejected",
                                  name: `${String(r.first_name)} ${String(r.last_name)}`,
                                })
                              }
                            >
                              Reject
                            </button>
                            <button
                              onClick={() =>
                                setConfirmation({
                                  id: String(r.id),
                                  action: "approved",
                                  name: `${String(r.first_name)} ${String(r.last_name)}`,
                                })
                              }
                            >
                              Approve
                            </button>
                          </>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {page === "Employees" && (
            <div className="employee-pagination">
              <div>
                Showing {(currentEmployeePage - 1) * employeePageSize + (displayRows.length ? 1 : 0)}–{Math.min(currentEmployeePage * employeePageSize, displayRows.length)} of {displayRows.length} employees
              </div>
              <div className="pagination-controls">
                <label>
                  Rows
                  <select value={employeePageSize} onChange={(event) => { setEmployeePageSize(Number(event.target.value)); setEmployeePage(1); }}>
                    <option value="25">25</option><option value="50">50</option><option value="100">100</option>
                  </select>
                </label>
                <button disabled={currentEmployeePage === 1} onClick={() => setEmployeePage((value) => Math.max(1, value - 1))}>Previous</button>
                <span>Page</span>
                <input aria-label="Page number" type="number" min="1" max={employeeTotalPages} value={currentEmployeePage} onChange={(event) => setEmployeePage(Math.min(employeeTotalPages, Math.max(1, Number(event.target.value) || 1)))} />
                <span>of {employeeTotalPages}</span>
                <button disabled={currentEmployeePage === employeeTotalPages} onClick={() => setEmployeePage((value) => Math.min(employeeTotalPages, value + 1))}>Next</button>
              </div>
            </div>
          )}
          </>
        )}
      </section>
      {confirmation && (
        <ConfirmDialog
          confirmation={confirmation}
          onCancel={() => setConfirmation(null)}
          onConfirm={decide}
        />
      )}{" "}
      {pendingEmployee && (
        <SaveEmployeeDialog
          name={String(pendingEmployee.nameEng ?? pendingEmployee.employeeNo)}
          onCancel={() => setPendingEmployee(null)}
          onConfirm={confirmCreateEmployee}
        />
      )}{" "}
      {selectedEmployee && (
        <>
          <button
            className="detail-backdrop"
            aria-label="Close employee detail"
            onClick={() => setSelectedEmployee(null)}
          />
          <aside className="employee-detail-panel">
            <header>
              <div>
                <small>EMPLOYEE PROFILE</small>
                <h2>
                  {String(selectedEmployee.first_name ?? "")}{" "}
                  {String(selectedEmployee.last_name ?? "")}
                </h2>
                <p>{String(selectedEmployee.employee_no ?? "")}</p>
              </div>
              <button onClick={() => setSelectedEmployee(null)}>×</button>
            </header>
            {editingEmployee ? (
              <form className="detail-edit-form" onSubmit={saveEmployeeEdit}>
                {employeeFieldGroups.map((group) => (
                  <fieldset key={group.title}>
                    <legend>{group.title}</legend>
                    <div>
                      {employeeFields
                        .filter(([, key]) => group.keys.includes(key))
                        .map(renderEditField)}
                    </div>
                  </fieldset>
                ))}
                <footer>
                  <button
                    type="button"
                    onClick={() => setEditingEmployee(false)}
                  >
                    Cancel
                  </button>
                  <button className="primary">Save changes</button>
                </footer>
              </form>
            ) : (
              <>
                <div className="detail-summary">
                  <span>
                    {String(selectedEmployee.first_name ?? "").slice(0, 1)}
                    {String(selectedEmployee.last_name ?? "").slice(0, 1)}
                  </span>
                  <div>
                    <b>{String(selectedEmployee.position ?? "Employee")}</b>
                    <small>
                      {String(selectedEmployee.department ?? "Unassigned")}
                    </small>
                  </div>
                  <button onClick={() => setEditingEmployee(true)}>
                    ✎ Edit
                  </button>
                </div>
                <div className="detail-fields">
                  {employeeFields.map(([label, key]) => {
                    const raw =
                      key === "service_year"
                        ? calculateService(
                            String(selectedEmployee.joined_on ?? "").slice(0, 10),
                          )
                        : selectedEmployee[key];
                    const value =
                      typeof raw === "boolean" ? (raw ? "Yes" : "No") : raw;
                    return (
                      <div key={key}>
                        <small>{label}</small>
                        <b>{value ? String(value) : "—"}</b>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </aside>
        </>
      )}
    </>
  );
}

function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem("portal_token") ?? "",
  );
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [employeePending, setEmployeePending] = useState<Approval[]>([]);
  const [loginError, setLoginError] = useState("");
  const [active, setActive] = useState("Overview");
  const [notice, setNotice] = useState("");
  const [allowedMenus, setAllowedMenus] = useState<string[]>([]);
  const [currentRole, setCurrentRole] = useState("");
  const [currentName, setCurrentName] = useState("");
  const [corporateOpen, setCorporateOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [generalOpen, setGeneralOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [overviewConfirmation, setOverviewConfirmation] =
    useState<Confirmation | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const language = localStorage.getItem("portal_language") ?? "English";
  const menuLabels: Record<string, string> = {
    Overview: "ခြုံငုံကြည့်ရှုမှု",
    Employees: "ဝန်ထမ်းများ",
    Attendance: "တက်ရောက်မှု",
    Approvals: "အတည်ပြုချက်များ",
    Leave: "ခွင့်",
    Overtime: "အချိန်ပို",
    Appraisals: "အကဲဖြတ်မှု",
    Announcements: "ကြေညာချက်များ",
    Notification: "အသိပေးချက်များ",
    Reports: "အစီရင်ခံစာများ",
    "Users & Roles": "အသုံးပြုသူနှင့် ရာထူးများ",
    Corporate: "ကော်ပိုရိတ်",
    "General Setting": "အထွေထွေဆက်တင်",
    Settings: "ဆက်တင်များ",
  };
  const label = (key: string) =>
    language === "Myanmar" ? (menuLabels[key] ?? key) : key;

  const act = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  };
  const refreshLiveIndicators = useCallback(async () => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const all = allowedMenus.includes("*");
    const [dashboardResponse, requestsResponse, notificationResponse] = await Promise.all([
      all || allowedMenus.includes("Overview") ? fetch(`${API}/dashboard`, { headers }) : Promise.resolve(null),
      all || allowedMenus.includes("Approvals") ? fetch(`${API}/requests?status=pending`, { headers }) : Promise.resolve(null),
      all || allowedMenus.includes("Notification") ? fetch(`${API}/notifications/unread-count`, { headers }) : Promise.resolve(null),
    ]);
    if (dashboardResponse?.ok) setDashboard(await dashboardResponse.json());
    if (requestsResponse?.ok) {
      const pending = await requestsResponse.json();
      if (currentRole === "employee") setEmployeePending(pending);
      else setApprovals(pending);
    }
    if (notificationResponse?.ok) setNotificationCount((await notificationResponse.json()).count);
  }, [token, allowedMenus, currentRole]);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API}/me/navigation`, { headers }),
      fetch(`${API}/profile`, { headers }),
    ])
      .then(async ([navigationResponse, profileResponse]) => {
        if (navigationResponse.status === 401) {
          localStorage.removeItem("portal_token");
          setToken("");
          return;
        }
        const navigation = await navigationResponse.json();
        const profile = await profileResponse.json();
        const menus: string[] = navigation.menus;
        setAllowedMenus(menus);
        setCurrentRole(navigation.role);
        setCurrentName(`${profile.first_name} ${profile.last_name}`.trim());
        const all = menus.includes("*");
        setActive((current) =>
          !all && !menus.includes(current)
            ? menus.includes("Attendance")
              ? "Attendance"
              : (menus[0] ?? "Announcements")
            : current,
        );
        if (all || menus.includes("Overview")) {
          const d = await fetch(`${API}/dashboard`, { headers });
          if (d.ok) setDashboard(await d.json());
        }
        if (all || menus.includes("Approvals")) {
          const r = await fetch(`${API}/requests?status=pending`, { headers });
          if (r.ok) {
            const pending = await r.json();
            if (navigation.role === "employee") setEmployeePending(pending);
            else setApprovals(pending);
          }
        }
        if (all || menus.includes("Notification")) {
          const n = await fetch(`${API}/notifications/unread-count`, {
            headers,
          });
          if (n.ok) setNotificationCount((await n.json()).count);
        }
      })
      .catch(() => act("API connection unavailable"));
  }, [token]);
  useEffect(() => {
    if (!token || !allowedMenus.length) return;
    const timer = window.setInterval(refreshLiveIndicators, 5000);
    return () => window.clearInterval(timer);
  }, [token, allowedMenus, currentRole, refreshLiveIndicators]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
      }),
    });
    if (!response.ok) {
      setLoginError("Login failed. Check the API and credentials.");
      return;
    }
    const data = await response.json();
    localStorage.setItem("portal_token", data.token);
    setToken(data.token);
  };

  const decide = async () => {
    if (!overviewConfirmation) return;
    const { id, action, name } = overviewConfirmation;
    const response = await fetch(`${API}/requests/${id}/action`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action }),
    });
    if (response.ok) {
      setApprovals((items) => items.filter((item) => item.id !== id));
      setDashboard((d) =>
        d
          ? {
              ...d,
              stats: {
                ...d.stats,
                pendingApprovals: Math.max(0, d.stats.pendingApprovals - 1),
              },
            }
          : d,
      );
      act(`${name}'s request ${action}`);
    }
    setOverviewConfirmation(null);
  };
  const logout = () => {
    localStorage.removeItem("portal_token");
    setToken("");
    setAccountOpen(false);
    setDashboard(null);
    setAllowedMenus([]);
  };
  const changePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordMessage("");
    const f = new FormData(e.currentTarget);
    if (f.get("newPassword") !== f.get("confirmPassword")) {
      setPasswordMessage("New passwords do not match");
      return;
    }
    const r = await fetch(`${API}/auth/change-password`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: f.get("currentPassword"),
        newPassword: f.get("newPassword"),
      }),
    });
    const result = await r.json();
    if (!r.ok) {
      setPasswordMessage(result.error ?? "Unable to change password");
      return;
    }
    setPasswordMessage("Password changed successfully");
    e.currentTarget.reset();
  };

  if (!token)
    return (
      <div className="login-page">
        <section className="login-card">
          <div className="login-logo">CP</div>
          <p>COMPANY PORTAL</p>
          <h1>Welcome back</h1>
          <span>Sign in to manage your people and operations.</span>
          <form onSubmit={login}>
            <label>
              User name
              <input
                name="username"
                type="text"
                defaultValue="kyaw thu"
                autoCapitalize="none"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                defaultValue="Admin@123"
                required
                minLength={8}
              />
            </label>
            {loginError && <div className="login-error">{loginError}</div>}
            <button>Sign in securely →</button>
          </form>
          <small>Local development environment</small>
        </section>
      </div>
    );

  const stats = [
    {
      label: "Total employees",
      value: String(dashboard?.stats.totalEmployees ?? "—"),
      note: "Active employees",
      tone: "blue",
      icon: "👥",
    },
    {
      label: "Present today",
      value: String(dashboard?.stats.presentToday ?? "—"),
      note: "Live from PostgreSQL",
      tone: "green",
      icon: "✓",
    },
    {
      label: "Late arrivals",
      value: String(dashboard?.stats.lateToday ?? "—"),
      note: "Today",
      tone: "amber",
      icon: "◷",
    },
    {
      label:
        currentRole === "employee"
          ? "My pending requests"
          : "Pending approvals",
      value: String(
        currentRole === "employee"
          ? employeePending.length
          : (dashboard?.stats.pendingApprovals ?? "—"),
      ),
      note:
        currentRole === "employee"
          ? "Awaiting approval"
          : "Needs your attention",
      tone: "red",
      icon: "!",
    },
  ];
  const can = (menu: string) =>
    allowedMenus.includes("*") || allowedMenus.includes(menu);
  const visibleNav = nav.filter((item) =>
    item === "Corporate"
      ? can("Corporate")
      : item === "Users & Roles"
        ? can("Users & Roles") || can("Permission")
      : item === "General Setting"
        ? can("Item Master")
        : can(item),
  );
  const navigate = (page: string) => {
    setActive(page);
    setSidebarOpen(false);
  };
  const refreshNotificationCount = async () => {
    const r = await fetch(`${API}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) setNotificationCount((await r.json()).count);
  };

  return (
    <div className="shell">
      <aside className={`sidebar ${sidebarOpen ? "mobile-open" : ""}`}>
        <div className="brand">
          <span>CP</span>
          <div>
            Company Portal<small>People & Operations</small>
          </div>
        </div>
        <nav>
          {visibleNav.map((item) =>
            item === "Corporate" ? (
              <div className="nav-group" key={item}>
                <button
                  className={active.includes("Request Form") ? "active" : ""}
                  onClick={() => setCorporateOpen((open) => !open)}
                >
                  <i>
                    <NavIcon name="Corporate" />
                  </i>
                  {label("Corporate")}
                  <span className={`chevron ${corporateOpen ? "open" : ""}`}>
                    ⌄
                  </span>
                </button>
                {corporateOpen && (
                  <div className="sub-menu">
                    {can("Payment Request") && (
                      <button
                        className={
                          active === "Payment Request Form" ? "active" : ""
                        }
                        onClick={() => navigate("Payment Request Form")}
                      >
                        {language === "Myanmar"
                          ? "ငွေပေးချေမှု တောင်းခံလွှာ"
                          : "Payment Request Form"}
                      </button>
                    )}
                    {can("Advance Clearance") && (
                      <button
                        className={
                          active === "Advance Clearance Request Form"
                            ? "active"
                            : ""
                        }
                        onClick={() =>
                          navigate("Advance Clearance Request Form")
                        }
                      >
                        {language === "Myanmar"
                          ? "ကြိုတင်ငွေ ရှင်းတမ်း"
                          : "Advance Clearance Form"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : item === "Users & Roles" ? (
              <div className="nav-group" key={item}>
                <button
                  className={
                    ["Users & Roles", "Role Access Control"].includes(active)
                      ? "active"
                      : ""
                  }
                  onClick={() => setUsersOpen((open) => !open)}
                >
                  <i>
                    <NavIcon name="Users & Roles" />
                  </i>
                  {label("Users & Roles")}
                  <span className={`chevron ${usersOpen ? "open" : ""}`}>
                    ⌄
                  </span>
                </button>
                {usersOpen && (
                  <div className="sub-menu">
                    {can("Users & Roles") && (
                      <button
                        className={active === "Users & Roles" ? "active" : ""}
                        onClick={() => navigate("Users & Roles")}
                      >
                        Users & Roles
                      </button>
                    )}
                    {can("Permission") && (
                      <button
                        className={
                          active === "Role Access Control" ? "active" : ""
                        }
                        onClick={() => navigate("Role Access Control")}
                      >
                        Role Access Control
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : item === "General Setting" ? (
              <div className="nav-group" key={item}>
                <button
                  className={active === "Item Master" ? "active" : ""}
                  onClick={() => setGeneralOpen((open) => !open)}
                >
                  <i>
                    <NavIcon name="General Setting" />
                  </i>
                  {label("General Setting")}
                  <span className={`chevron ${generalOpen ? "open" : ""}`}>
                    ⌄
                  </span>
                </button>
                {generalOpen && (
                  <div className="sub-menu">
                    {can("Item Master") && (
                      <button
                        className={active === "Item Master" ? "active" : ""}
                        onClick={() => navigate("Item Master")}
                      >
                        Item Master
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button
                key={item}
                className={active === item ? "active" : ""}
                onClick={() => navigate(item)}
              >
                <i>
                  <NavIcon name={item} />
                </i>
                {label(item)}
                {item === "Approvals" && (
                  <b>{currentRole === "employee" ? employeePending.length : (dashboard?.stats.pendingApprovals ?? 0)}</b>
                )}
                {item === "Notification" && notificationCount > 0 && (
                  <b>{notificationCount > 99 ? "99+" : notificationCount}</b>
                )}
              </button>
            ),
          )}
        </nav>
        <div className="sidebar-bottom">
          {can("Settings") && (
            <button onClick={() => navigate("Settings")}>
              ⚙ <span>{label("Settings")}</span>
            </button>
          )}
          <div className="account-wrap">
            <div className="user">
              <div className="avatar">
                {currentName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <div>
                {currentName || "User"}
                <small>{currentRole || "Loading…"}</small>
              </div>
              <button
                className="account-trigger"
                onClick={() => setAccountOpen((open) => !open)}
              >
                ⋮
              </button>
            </div>
            {accountOpen && (
              <div className="account-menu">
                <button
                  onClick={() => {
                    navigate("My Profile");
                    setAccountOpen(false);
                  }}
                >
                  <span>♙</span>
                  {language === "Myanmar"
                    ? "ကျွန်ုပ်၏ ကိုယ်ရေးအချက်အလက်"
                    : "My Profile"}
                </button>
                <button
                  onClick={() => {
                    setChangePasswordOpen(true);
                    setAccountOpen(false);
                    setPasswordMessage("");
                  }}
                >
                  <span>⌘</span>
                  {language === "Myanmar"
                    ? "စကားဝှက်ပြောင်းရန်"
                    : "Change Password"}
                </button>
                <div />
                <button className="logout" onClick={logout}>
                  <span>↪</span>
                  {language === "Myanmar" ? "ထွက်ရန်" : "Logout"}
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main>
        <header>
          <div className="header-left">
            <button
              className="menu-toggle"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>
            <div className="crumb">
              Workspace <span>/</span> {active}
            </div>
          </div>
          <div className="head-actions">
            <button className="search">
              ⌕ <span>Search anything...</span>
              <kbd>⌘ K</kbd>
            </button>
            {can("Notification") && (
              <button className="bell" onClick={() => navigate("Notification")}>
                ♢
                {notificationCount > 0 && (
                  <em>{notificationCount > 99 ? "99+" : notificationCount}</em>
                )}
              </button>
            )}
            <div className="header-avatar">
              {currentName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)}
            </div>
          </div>
        </header>
        <section className="content">
          {active !== "Overview" ? (
            <DataPage
              page={active}
              token={token}
              role={currentRole}
              onNotificationsChanged={refreshNotificationCount}
              onRequestsChanged={refreshLiveIndicators}
            />
          ) : (
            <>
              <div className="welcome">
                <div>
                  <p>THURSDAY, JULY 2</p>
                  <h1>Good morning, {currentName || "User"}</h1>
                  <span>
                    Here’s what’s happening across your company today.
                  </span>
                </div>
              </div>

              <div className="stats">
                {stats.map((s) => (
                  <article key={s.label}>
                    <div className={`stat-icon ${s.tone}`}>{s.icon}</div>
                    <div>
                      <p>{s.label}</p>
                      <strong>{s.value}</strong>
                      <small>{s.note}</small>
                    </div>
                  </article>
                ))}
              </div>

              <div className="grid">
                <section className="card attendance">
                  <div className="card-head">
                    <div>
                      <h2>Today’s attendance</h2>
                      <p>Live workforce status</p>
                    </div>
                    <button onClick={() => setActive("Attendance")}>
                      View details →
                    </button>
                  </div>
                  <div className="attendance-body">
                    <div className="donut">
                      <div>
                        <strong>89%</strong>
                        <span>Present</span>
                      </div>
                    </div>
                    <div className="legend">
                      <p>
                        <i className="present" />
                        Present <b>221</b>
                      </p>
                      <p>
                        <i className="late" />
                        Late <b>12</b>
                      </p>
                      <p>
                        <i className="leave" />
                        On leave <b>9</b>
                      </p>
                      <p>
                        <i className="absent" />
                        Absent <b>6</b>
                      </p>
                    </div>
                  </div>
                  <div className="hours">
                    <div>
                      <span>Average check-in</span>
                      <b>8:47 AM</b>
                    </div>
                    <div>
                      <span>On-time rate</span>
                      <b>94.8%</b>
                    </div>
                    <div>
                      <span>Expected today</span>
                      <b>248</b>
                    </div>
                  </div>
                </section>

                <section className="card approvals">
                  <div className="card-head">
                    <div>
                      <h2>
                        {currentRole === "employee"
                          ? "My pending requests"
                          : "Pending approvals"}
                      </h2>
                      <p>
                        {currentRole === "employee"
                          ? `${employeePending.length} requests awaiting approval`
                          : `${approvals.length} requests awaiting review`}
                      </p>
                    </div>
                    <button onClick={() => navigate("Approvals")}>
                      View all →
                    </button>
                  </div>
                  <div className="approval-list">
                    {currentRole === "employee"
                      ? employeePending.slice(0, 5).map((a, i) => (
                          <button
                            className="employee-request-row"
                            key={a.id}
                            onClick={() => navigate("Approvals")}
                          >
                            <div
                              className="mini-avatar"
                              style={{
                                background: [
                                  "#7c5cfc",
                                  "#179c78",
                                  "#df8c22",
                                  "#2674d8",
                                ][i % 4],
                              }}
                            >
                              {a.request_type.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="request">
                              <b>{a.title}</b>
                              <span>
                                {a.request_type.replace("_", " ")} · Submitted{" "}
                                {new Date(a.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <span className="pill pending">Pending</span>
                            <b className="request-arrow">›</b>
                          </button>
                        ))
                      : approvals.map((a, i) => {
                          const name = `${a.first_name} ${a.last_name}`;
                          return (
                            <div className="approval-row" key={a.id}>
                              <div
                                className="mini-avatar"
                                style={{
                                  background: [
                                    "#7c5cfc",
                                    "#179c78",
                                    "#df8c22",
                                    "#2674d8",
                                  ][i % 4],
                                }}
                              >
                                {a.first_name[0]}
                                {a.last_name[0]}
                              </div>
                              <div className="request">
                                <b>{name}</b>
                                <span>
                                  {a.request_type.replace("_", " ")} · {a.title}
                                </span>
                              </div>
                              <small>
                                {new Date(a.created_at).toLocaleDateString()}
                              </small>
                              <div className="row-actions">
                                <button
                                  title="Reject"
                                  onClick={() =>
                                    setOverviewConfirmation({
                                      id: a.id,
                                      action: "rejected",
                                      name,
                                    })
                                  }
                                >
                                  ×
                                </button>
                                <button
                                  title="Approve"
                                  onClick={() =>
                                    setOverviewConfirmation({
                                      id: a.id,
                                      action: "approved",
                                      name,
                                    })
                                  }
                                >
                                  ✓
                                </button>
                              </div>
                            </div>
                          );
                        })}
                  </div>
                </section>
              </div>

              <section className="card team">
                <div className="card-head">
                  <div>
                    <h2>Department overview</h2>
                    <p>Attendance across teams today</p>
                  </div>
                  <button onClick={() => setActive("Employees")}>
                    All departments →
                  </button>
                </div>
                <div className="department-grid">
                  {(dashboard?.departments ?? []).map((d, i) => {
                    const color = ["#7c5cfc", "#179c78", "#2674d8", "#df8c22"][
                      i % 4
                    ];
                    return (
                      <div className="dept" key={d.name}>
                        <div className="dept-title">
                          <span style={{ background: color }}>{d.name[0]}</span>
                          <div>
                            <b>{d.name}</b>
                            <small>{d.employees} employees</small>
                          </div>
                          <strong>{d.rate}%</strong>
                        </div>
                        <div className="bar">
                          <i
                            style={{ width: `${d.rate}%`, background: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </section>
      </main>
      {notice && <div className="toast">✓ {notice}</div>}
      {overviewConfirmation && (
        <ConfirmDialog
          confirmation={overviewConfirmation}
          onCancel={() => setOverviewConfirmation(null)}
          onConfirm={decide}
        />
      )}
      {changePasswordOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setChangePasswordOpen(false)}
        >
          <form
            className="password-modal"
            onSubmit={changePassword}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div>
              <h2>Change Password</h2>
              <button
                type="button"
                onClick={() => setChangePasswordOpen(false)}
              >
                ×
              </button>
            </div>
            <p>Use at least 8 characters for your new password.</p>
            <label>
              Current password
              <input
                name="currentPassword"
                type="password"
                required
                minLength={8}
              />
            </label>
            <label>
              New password
              <input
                name="newPassword"
                type="password"
                required
                minLength={8}
              />
            </label>
            <label>
              Confirm new password
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={8}
              />
            </label>
            {passwordMessage && (
              <span
                className={passwordMessage.includes("success") ? "success" : ""}
              >
                {passwordMessage}
              </span>
            )}
            <footer>
              <button
                type="button"
                onClick={() => setChangePasswordOpen(false)}
              >
                Cancel
              </button>
              <button className="primary">Update password</button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
