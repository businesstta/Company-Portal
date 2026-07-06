import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import "./App.css";
import "./responsive.css";
import "./employee-detail.css";
import "./item-master.css";
import "./employee-list.css";
import "./users-roles.css";
import "./settings-management.css";
import "./navigation-enhancements.css";

const nav = [
  "Overview",
  "Approvals",
  "Announcements",
  "Notification",
  "Human Resource",
  "Corporate",
  "Fleet Management",
  "Information Technology",
  "Admin",
  "Reports",
  "Users & Roles",
  "General Setting",
];
const humanResourceSubmenus = [
  "Employees",
  "Attendance",
  "Leave",
  "Overtime",
  "Appraisals",
];
const corporateSubmenus = [
  "Payment Request Form",
  "Advance Clearance Request Form",
  "Material Request Form",
  "Service Request Form",
  "Stationary Request Form",
  "Vehicle Request Form",
];
const fleetSubmenus = ["Vehicle Management"];
const approvalSubmenus = [
  "Leave Approval",
  "Overtime Approval",
  "Request Check In/Out Approval",
  "Request Late In/Out Approval",
  "Travelling Request Approval",
  "Payment Request Approval",
  "Advance Clearance Request Approval",
  "Material Request Approval",
  "Service Request Approval",
  "Stationary Request Approval",
  "Vehicle Request Approval",
];
const reportGroups = [
  {
    name: "HR Management",
    reports: [
      "Attendance Report",
      "Leave Report",
      "Overtime Report",
      "Appraisals Report",
      "Travelling Request Report",
    ],
  },
  {
    name: "Asset Management",
    reports: ["Admin Asset Report", "IT Asset Report"],
  },
  {
    name: "Corporate Services",
    reports: [
      "Payment Request Report",
      "Advance Clearance Report",
      "Service Request Report",
      "Material Request Report",
      "Stationary Request Report",
      "Vehicle Request Report",
    ],
  },
];
const reportSubmenus = reportGroups.flatMap((group) => group.reports);
const permissionMenuItems = [
  { key: "Overview", level: 0 },
  { key: "Approvals", level: 0 },
  ...approvalSubmenus.map((key) => ({ key, level: 1 })),
  { key: "Announcements", level: 0 },
  { key: "Notification", level: 0 },
  { key: "Human Resource", level: 0 },
  ...humanResourceSubmenus.map((key) => ({ key, level: 1 })),
  { key: "Corporate", level: 0 },
  ...corporateSubmenus.map((key) => ({ key, level: 1 })),
  { key: "Fleet Management", level: 0 },
  ...fleetSubmenus.map((key) => ({ key, level: 1 })),
  { key: "Information Technology", level: 0 },
  { key: "Admin", level: 0 },
  { key: "Reports", level: 0 },
  ...reportGroups.flatMap((group) => [
    { key: group.name, level: 1 },
    ...group.reports.map((key) => ({ key, level: 2 })),
  ]),
  { key: "Users & Roles", level: 0 },
  { key: "Role Access Control", level: 1 },
  { key: "Approval Setup", level: 1 },
  { key: "General Setting", level: 0 },
  { key: "Item Master", level: 1 },
  { key: "Banner", level: 1 },
  { key: "Settings", level: 1 },
  { key: "My Requests", level: 0 },
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
type Branding = { iconText: string; title: string; subtitle: string; iconColor: string; logoUrl?: string };

type ApproverUser = Record<string, unknown>;

function SearchableApproverSelect({
  name,
  users,
  defaultValue,
}: {
  name: string;
  users: ApproverUser[];
  defaultValue: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(defaultValue);

  useEffect(() => setSelected(defaultValue), [defaultValue]);
  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  const selectedUser = users.find((user) => String(user.id) === selected);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = users
    .filter((user) =>
      [user.employee_name, user.employee_no, user.username, user.role]
        .map((value) => String(value ?? "").toLowerCase())
        .some((value) => value.includes(normalizedQuery)),
    )
    .slice(0, 50);
  const selectedLabel = selectedUser
    ? String(selectedUser.employee_name || selectedUser.username || "Selected approver")
    : "Select approver";

  return (
    <div className={`approver-search-select${open ? " open" : ""}`} ref={rootRef}>
      <input type="hidden" name={name} value={selected} />
      <button
        type="button"
        className="approver-select-trigger"
        onClick={() => {
          setOpen((value) => !value);
          setQuery("");
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selectedLabel}</span><i>⌄</i>
      </button>
      {open && (
        <div className="approver-select-menu">
          <input
            autoFocus
            className="approver-select-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, Employee ID or username..."
          />
          <div className="approver-option-list" role="listbox">
            <button type="button" className="approver-option" onClick={() => { setSelected(""); setOpen(false); }}>
              <span>Select approver</span><small>Clear selection</small>
            </button>
            {filteredUsers.map((user) => (
              <button
                type="button"
                className={`approver-option${String(user.id) === selected ? " selected" : ""}`}
                key={String(user.id)}
                onClick={() => { setSelected(String(user.id)); setOpen(false); }}
              >
                <span>{String(user.employee_name || user.username || "Unnamed user")}</span>
                <small>{[user.employee_no, user.username, user.role].filter(Boolean).map(String).join(" · ")}</small>
              </button>
            ))}
            {!filteredUsers.length && <p className="approver-empty">No matching user found.</p>}
          </div>
          {users.length > 50 && !normalizedQuery && <p className="approver-search-hint">Type to search all {users.length} users.</p>}
        </div>
      )}
    </div>
  );
}

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
    "Human Resource":
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M16 11h6",
    Announcements: "M3 11v2M6 9v6l11 4V5L6 9H3v6h3M8 15l1 5h3l-1-4",
    Notification: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
    Reports: "M4 19V9M10 19V5M16 19v-7M22 19H2",
    "Users & Roles": "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10M9 12l2 2 4-4",
    Corporate: "M3 21h18M5 21V7l7-4 7 4v14M9 10h1M14 10h1M9 14h1M14 14h1",
    "Fleet Management":
      "M3 17h2M19 17h2M5 17l1.5-6h11L19 17M7 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0M8 11l2-4h4l2 4",
    "Information Technology":
      "M4 4h16v12H4zM8 20h8M12 16v4M8 9h2M14 9h2M8 12h8",
    Admin:
      "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10M9 12l2 2 4-4",
    Settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19 12a7 7 0 0 0-.12-1.3l2-1.55-2-3.46-2.45 1a7 7 0 0 0-2.25-1.3L13.8 3h-4l-.38 2.39a7 7 0 0 0-2.25 1.3l-2.45-1-2 3.46 2 1.55A7 7 0 0 0 4.6 12c0 .44.04.87.12 1.3l-2 1.55 2 3.46 2.45-1a7 7 0 0 0 2.25 1.3L9.8 21h4l.38-2.39a7 7 0 0 0 2.25-1.3l2.45 1 2-3.46-2-1.55c.08-.43.12-.86.12-1.3",
    "My Requests": "M4 4h16v16H4zM8 9h8M8 13h5M8 17h3M15 16l2 2 3-4",
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

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m6.5 8 3.5 3.5L13.5 8" />
    </svg>
  );
}

function numberToEnglishWords(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "Zero";
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  const underThousand = (number: number): string => {
    const parts: string[] = [];
    if (number >= 100) { parts.push(`${ones[Math.floor(number / 100)]} Hundred`); number %= 100; }
    if (number >= 20) { parts.push(tens[Math.floor(number / 10)]); number %= 10; }
    if (number > 0) parts.push(ones[number]);
    return parts.join(" ");
  };
  const groups: [number,string][] = [[1_000_000_000_000,"Trillion"],[1_000_000_000,"Billion"],[1_000_000,"Million"],[1_000,"Thousand"]];
  let remaining = Math.floor(Math.abs(value)); const result: string[] = [];
  for (const [size,label] of groups) if (remaining >= size) { result.push(`${underThousand(Math.floor(remaining/size))} ${label}`); remaining %= size; }
  if (remaining) result.push(underThousand(remaining));
  return result.join(" ");
}

function numberToMyanmarWords(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "သုည";
  const digits = ["","တစ်","နှစ်","သုံး","လေး","ငါး","ခြောက်","ခုနစ်","ရှစ်","ကိုး"];
  const underLakh = (number: number): string => {
    const places: [number,string][] = [[10_000,"သောင်း"],[1_000,"ထောင်"],[100,"ရာ"],[10,"ဆယ်"]];
    let remaining=Math.floor(number); let result="";
    for(const [size,label] of places){const count=Math.floor(remaining/size);if(count){result+=`${size===10&&count===1?"":digits[count]}${label}`;remaining%=size;}}
    if(remaining) result+=digits[remaining];
    return result;
  };
  const integer=Math.floor(Math.abs(value));const lakhs=Math.floor(integer/100_000);const remainder=integer%100_000;
  return `${lakhs?`${underLakh(lakhs)}သိန်း`:""}${remainder?underLakh(remainder):""}`;
}

function formatDateDDMMYYYY(date: Date): string {
  const day=String(date.getDate()).padStart(2,"0");
  const month=String(date.getMonth()+1).padStart(2,"0");
  return `${day}/${month}/${date.getFullYear()}`;
}

function formatDateTimeDDMMYYYY(date: Date): string {
  const hours=String(date.getHours()).padStart(2,"0");
  const minutes=String(date.getMinutes()).padStart(2,"0");
  return `${formatDateDDMMYYYY(date)} ${hours}:${minutes}`;
}

// Keep every rendered portal date consistent, including legacy table cells.
Date.prototype.toLocaleDateString=function(){return Number.isNaN(this.getTime())?'—':formatDateDDMMYYYY(this)};
Date.prototype.toLocaleString=function(){return Number.isNaN(this.getTime())?'—':formatDateTimeDDMMYYYY(this)};

function DataPage({
  page,
  token,
  role,
  onNotificationsChanged,
  onRequestsChanged,
  onBrandingChanged,
  onNavigate,
}: {
  page: string;
  token: string;
  role: string;
  onNotificationsChanged?: () => void;
  onRequestsChanged?: () => void;
  onBrandingChanged?: (branding: Branding) => void;
  onNavigate?: (page: string) => void;
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
  const [selectedCorporateRequest, setSelectedCorporateRequest] = useState<Record<string, unknown> | null>(null);
  const [corporateConfirmation, setCorporateConfirmation] = useState<Confirmation | null>(null);
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
  const [paymentProfile, setPaymentProfile] = useState<Record<string, unknown>>({});
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentAmountText, setPaymentAmountText] = useState("");
  const [paymentTypeValue, setPaymentTypeValue] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState("MMK");
  const [showPaymentSubmitConfirmation, setShowPaymentSubmitConfirmation] = useState(false);
  const paymentRequestFormRef = useRef<HTMLFormElement | null>(null);
  const paymentSubmitConfirmedRef = useRef(false);
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
  const approvalType: Record<string, string> = {
    "Leave Approval": "leave",
    "Overtime Approval": "overtime",
    "Request Check In/Out Approval": "attendance_correction",
    "Request Late In/Out Approval": "late_in",
    "Travelling Request Approval": "travelling",
    "Payment Request Approval": "payment",
    "Advance Clearance Request Approval": "advance_clearance",
    "Material Request Approval": "material",
    "Service Request Approval": "service",
    "Stationary Request Approval": "stationary",
    "Vehicle Request Approval": "vehicle",
  };
  const corporateApprovalType: Record<string, string> = {
    "Payment Request Approval": "payment",
    "Advance Clearance Request Approval": "advance_clearance",
  };
  const employeeApproval = page === "My Requests" || ((page === "Approvals" || Boolean(approvalType[page])) && role === "employee");
  const endpoint =
    page === "Employees"
      ? "employees"
      : page === "Attendance"
        ? "attendance"
        : page === "Approvals"
          ? "requests?status=pending"
          : corporateApprovalType[page]
            ? `corporate-requests?type=${corporateApprovalType[page]}`
          : approvalType[page]
            ? `requests?status=pending&type=${approvalType[page]}`
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
                    : page === "My Requests"
                      ? "my-requests"
                    : page === "Reports"
                      ? "reports/summary"
                        : page === "Users & Roles"
                          ? "users"
                          : page === "Approval Setup"
                            ? "approval-setup"
                            : page === "Banner"
                              ? "branding"
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
    if (page === "Employees" || page === "Item Master" || page === "Payment Request Form")
      fetch(`${API}/item-master`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => setMasterItems(Array.isArray(data) ? data : []));
  }, [page, token]);
  useEffect(() => {
    if (page !== "Payment Request Form") return;
    fetch(`${API}/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.json())
      .then((profile) => setPaymentProfile(profile ?? {}));
  }, [page, token]);
  useEffect(() => {
    if(page!=="My Requests"||!selectedCorporateRequest)return;
    const frame=window.requestAnimationFrame(()=>{
      const header=document.querySelector<HTMLElement>(".my-request-detail>header");
      if(!header||header.querySelector(".detail-print-button"))return;
      const button=document.createElement("button");button.type="button";button.className="detail-print-button";button.textContent="Print View";button.onclick=()=>window.print();
      const closeButton=header.querySelector("button");header.insertBefore(button,closeButton);
    });
    return()=>window.cancelAnimationFrame(frame);
  },[page,selectedCorporateRequest]);
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
    const savedRecords=[];for (const [key, value] of [
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
      {const response=await fetch(`${API}/settings/${key}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(value),
      });if(!response.ok){setRoleSaveNotice({type:'error',message:'Unable to save system settings.'});return}savedRecords.push(await response.json())}
    localStorage.setItem("portal_language", language);
    document.documentElement.lang = language === "Myanmar" ? "my" : "en";
    setRows(savedRecords);setRoleSaveNotice({type:'success',message:language === "Myanmar" ? "ဆက်တင်များ သိမ်းပြီးပါပြီ" : "System settings saved successfully."});window.setTimeout(()=>setRoleSaveNotice(null),2600)
  };
  const saveBanner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();const form=new FormData(event.currentTarget);let logoUrl=form.get('removeLogo')==='on'?'':String(form.get('existingLogo')??'');const logo=form.get('logo');if(logo instanceof File&&logo.size){const upload=new FormData();upload.append('logo',logo);const uploadResponse=await fetch(`${API}/branding/logo`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:upload});if(!uploadResponse.ok){setRoleSaveNotice({type:'error',message:(await uploadResponse.json()).error??'Unable to upload company logo.'});return}logoUrl=(await uploadResponse.json()).logoUrl}const branding:Branding={iconText:String(form.get('iconText')??'CP').trim().slice(0,3).toUpperCase(),title:String(form.get('title')??'Company Portal').trim(),subtitle:String(form.get('subtitle')??'People & Operations').trim(),iconColor:String(form.get('iconColor')??'#6d5ce7'),logoUrl};const response=await fetch(`${API}/settings/banner`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(branding)});setRoleSaveNotice(response.ok?{type:'success',message:'Navigation banner saved successfully.'}:{type:'error',message:'Unable to save navigation banner.'});if(response.ok){onBrandingChanged?.(branding);setRows(branding)}window.setTimeout(()=>setRoleSaveNotice(null),2600)
  };
  const saveApprovalWorkflow = async (event: FormEvent<HTMLFormElement>, requestType: "payment" | "advance_clearance") => {
    event.preventDefault();const form=new FormData(event.currentTarget);const names=['Department Head Approver','Finance Approver','Cashier'];const steps=names.map((stepName,index)=>({stepOrder:index+1,stepName,approverUserId:String(form.get(`step-${index+1}`)??'')||null}));const response=await fetch(`${API}/approval-setup/${requestType}`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({steps})});setRoleSaveNotice(response.ok?{type:'success',message:`${requestType==='payment'?'Payment Request':'Advance Clearance'} workflow saved successfully.`}:{type:'error',message:'Unable to save approval workflow.'});window.setTimeout(()=>setRoleSaveNotice(null),2600);if(response.ok)load()
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
    const isPayment = page === "Payment Request Form";
    if (isPayment && !paymentSubmitConfirmedRef.current) {
      paymentRequestFormRef.current = e.currentTarget;
      setShowPaymentSubmitConfirmation(true);
      return;
    }
    paymentSubmitConfirmedRef.current = false;
    const f = new FormData(e.currentTarget);
    if (isPayment) {
      f.set("requestType", "payment");
      f.set("purpose", String(f.get("description") ?? ""));
      f.set("payee", String(f.get("payTo") ?? ""));
      f.set("amount", String(f.get("totalAmount") ?? "0"));
      f.set("currency", String(f.get("currencyType") ?? "MMK"));
      f.set("details", JSON.stringify({
        requestFromDepartment: f.get("requestFromDepartment"),
        businessUnit: f.get("businessUnit"),
        paymentType: f.get("paymentType"),
        paymentMethod: f.get("paymentMethod"),
        remark: f.get("remark"),
      }));
    }
    const r = await fetch(`${API}/corporate-requests`, {
      method: "POST",
      headers: isPayment ? { Authorization: `Bearer ${token}` } : {
        Authorization: `Bearer ${token}`, "Content-Type": "application/json",
      },
      body: isPayment ? f : JSON.stringify({
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
  const selectCorporateRequest = async (id: unknown) => {
    const response = await fetch(`${API}/corporate-requests/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) setSelectedCorporateRequest(await response.json());
  };
  const selectMyRequest = async (row: Record<string,unknown>) => {
    if (row.source === 'corporate') return selectCorporateRequest(row.id);
    setSelectedCorporateRequest({request:row,steps:[],attachments:[],canAct:false});
  };
  const actCorporateRequest = async () => {
    if (!corporateConfirmation) return;
    const response=await fetch(`${API}/corporate-requests/${corporateConfirmation.id}/action`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action:corporateConfirmation.action})});
    if(response.ok){setCorporateConfirmation(null);await selectCorporateRequest(corporateConfirmation.id);load();onNotificationsChanged?.();onRequestsChanged?.()}else{alert((await response.json()).error??'Unable to update request')}
  };
  const openCorporateAttachment = async (requestId: unknown, attachment: Record<string,unknown>) => {
    const response=await fetch(`${API}/corporate-requests/${requestId}/attachments/${attachment.id}`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)return alert('Unable to open attachment');const url=URL.createObjectURL(await response.blob());window.open(url,'_blank','noopener,noreferrer');window.setTimeout(()=>URL.revokeObjectURL(url),60000)
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
  if(page==="My Requests"){
    const detail=selectedCorporateRequest as {request?:Record<string,unknown>;steps?:(Record<string,unknown>&{acted_at?:string|null})[];attachments?:Record<string,unknown>[]} | null;const request=detail?.request;const steps=(detail?.steps??[]).map(step=>String(request?.status)==='rejected'&&!step.action&&Number(step.step_order)>Number(request?.current_step)?{...step,action:'Process Terminated'}:step);const details=(request?.details??{}) as Record<string,unknown>;
    return <><div className="page-title"><div><p>REQUEST HISTORY</p><h1>My Requests</h1><span>Track every request you have submitted and review its current approval status.</span></div></div><section className="data-card my-request-list"><table><thead><tr><th>Request ID</th><th>Submission Date</th><th>Request Type</th><th>Description</th><th>Status</th></tr></thead><tbody>{listRows.map((row,index)=><tr key={String(row.id??index)} className={String(request?.id)===String(row.id)?'selected':''} onClick={()=>selectMyRequest(row)}><td><b>{String(row.request_id)}</b></td><td>{new Date(String(row.created_at)).toLocaleDateString()}</td><td>{String(row.request_type).replaceAll('_',' ')}</td><td>{String(row.description??row.title??'—')}</td><td><span className={`pill ${String(row.status)}`}>{String(row.status)}</span></td></tr>)}</tbody></table>{!loading&&!listRows.length&&<div className="loading">You have not submitted any requests yet.</div>}</section>{request&&<section className="my-request-detail"><header><div><p>{String(request.request_type).replaceAll('_',' ').toUpperCase()} DETAILS</p><h2>{String(request.reference_no??request.request_id??request.id)}</h2></div><button onClick={()=>setSelectedCorporateRequest(null)}>×</button></header><div className="my-request-summary"><div><small>Request ID</small><b>{String(request.reference_no??request.request_id??request.id)}</b></div><div><small>Submission Date</small><b>{new Date(String(request.request_date??request.created_at)).toLocaleDateString()}</b></div><div><small>Requestor Name</small><b>{String(request.employee_name??`${request.first_name??''} ${request.last_name??''}`)}</b></div><div><small>Request Status</small><b className={`status-text ${String(request.status)}`}>{String(request.status)}</b></div><div><small>Department</small><b>{String(request.employee_department??request.department??'—')}</b></div><div><small>Business Units</small><b>{String(request.business_units??'—')}</b></div>{String(request.request_type)==='payment'&&<><div><small>Payment Type</small><b>{String(details.paymentType??'—')}</b></div><div><small>Payment Transfer Type</small><b>{String(details.paymentMethod??'—')}</b></div><div><small>Pay To</small><b>{String(request.payee??'—')}</b></div><div><small>Currency Type</small><b>{String(request.currency??'—')}</b></div><div><small>Total Amount</small><b>{Number(request.amount??0).toLocaleString()}</b></div></>}<div className="description"><small>Description</small><b>{String(request.purpose??request.description??request.reason??request.title??'—')}</b></div></div>{steps.length>0&&<div className="my-request-status-cards">{steps.map(step=><article key={String(step.step_order)}><h3>{String(step.step_name)} Status</h3><strong className={step.action?String(step.action):Number(step.step_order)===Number(request.current_step)?'pending':'upcoming'}>{step.action?String(step.action):Number(step.step_order)===Number(request.current_step)?'Pending':'Waiting'}</strong><h4>{String(step.step_name)} Name</h4><p>{String(step.approver_name??'Not assigned')}</p>{step.acted_at&&<small>{new Date(String(step.acted_at)).toLocaleString()}</small>}</article>)}</div>}{Boolean(detail.attachments?.length)&&<div className="my-request-files"><h3>Attachments</h3>{detail.attachments?.map(file=><button key={String(file.id)} onClick={()=>openCorporateAttachment(request.id,file)}>↗ {String(file.original_name)}</button>)}</div>}</section>}</>
  }
  if (corporateApprovalType[page]) {
    const detail=selectedCorporateRequest as {request?:(Record<string,unknown>&{details?:never});steps?:(Record<string,unknown>&{acted_at?:string|null})[];attachments?:Record<string,unknown>[];canAct?:boolean} | null;
    const request=detail?.request;const steps=detail?.steps??[];const currentStep=Number(request?.current_step??1);
    return <>
      <div className="page-title"><div><p>CORPORATE APPROVAL</p><h1>{page}</h1><span>Select a request to view its details and approval journey.</span></div></div>
      <div className={`corporate-approval-layout${detail?' detail-open':''}`}>
        <section className="data-card corporate-approval-list"><table><thead><tr><th>Reference</th><th>Employee</th><th>Request</th><th>Amount</th><th>Status</th></tr></thead><tbody>{listRows.map((row,index)=><tr key={String(row.id??index)} className={String(request?.id)===String(row.id)?'selected':''} onClick={()=>selectCorporateRequest(row.id)}><td><b>{String(row.reference_no)}</b><small>{new Date(String(row.created_at)).toLocaleDateString()}</small></td><td>{String(row.employee_name)}</td><td>{String(row.purpose)}</td><td>{Number(row.amount).toLocaleString()} {String(row.currency)}</td><td><span className={`pill ${String(row.status)}`}>{String(row.status)}</span></td></tr>)}</tbody></table>{!loading&&!listRows.length&&<div className="loading">No payment requests assigned to you or submitted by you.</div>}</section>
        {detail&&request&&<aside className="corporate-request-detail">
          <header><div><p>REQUEST DETAILS</p><h2>{String(request.reference_no)}</h2><span>{String(request.employee_name)} · {String(request.employee_no)}</span></div><button onClick={()=>setSelectedCorporateRequest(null)}>×</button></header>
          <div className="request-detail-grid">
            <div><small>Submission Date</small><b>{new Date(String(request.request_date)).toLocaleDateString()}</b></div><div><small>Status</small><b className={`status-text ${String(request.status)}`}>{String(request.status)}</b></div><div><small>Department</small><b>{String(request.employee_department??'—')}</b></div><div><small>Business Units</small><b>{String(request.business_units??'—')}</b></div><div><small>Pay To</small><b>{String(request.payee??'—')}</b></div><div><small>Total Amount</small><b>{Number(request.amount).toLocaleString()} {String(request.currency)}</b></div><div className="wide"><small>Description</small><b>{String(request.purpose)}</b></div>
            {request.details&&Object.entries(request.details as Record<string,unknown>).map(([key,value])=><div key={key}><small>{key.replace(/([A-Z])/g,' $1')}</small><b>{String(value??'—')}</b></div>)}
          </div>
          <section className="approval-journey"><h3>Approval journey</h3>{steps.map((step,index)=>{const order=Number(step.step_order);const state=step.action?String(step.action):order===currentStep&&request.status==='pending'?'current':order>currentStep?'upcoming':'completed';return <article className={state} key={order}><i>{step.action==='approved'?'✓':step.action==='rejected'?'×':order}</i><div><b>{String(step.step_name)}</b><span>{String(step.approver_name??'Approver not assigned')}</span>{step.acted_at&&<small>{new Date(String(step.acted_at)).toLocaleString()}</small>}</div><em>{state==='current'?'Waiting for approval':state==='upcoming'?'Next approver':String(step.action??'Completed')}</em>{index<steps.length-1&&<u/>}</article>})}</section>
          {Boolean(detail.attachments?.length)&&<section className="detail-attachments"><h3>Attachments</h3>{detail.attachments?.map(file=><button type="button" key={String(file.id)} onClick={()=>openCorporateAttachment(request.id,file)}><span>↗</span><div><b>{String(file.original_name)}</b><small>{String(file.mime_type)} · {(Number(file.file_size)/1024).toFixed(1)} KB</small></div></button>)}</section>}
          {detail.canAct&&<footer className="corporate-approval-actions"><button className="reject" onClick={()=>setCorporateConfirmation({id:String(request.id),action:'rejected',name:String(request.reference_no)})}>Reject</button><button className="approve" onClick={()=>setCorporateConfirmation({id:String(request.id),action:'approved',name:String(request.reference_no)})}>Approve</button></footer>}
        </aside>}
      </div>
      {corporateConfirmation&&<ConfirmDialog confirmation={corporateConfirmation} onCancel={()=>setCorporateConfirmation(null)} onConfirm={actCorporateRequest}/>}
    </>
  }
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
          page === "Payment Request Form" ? (
          <form className="employee-form payment-request-form" onSubmit={createCorporate}>
            <div className="payment-form-heading"><div><p>PAYMENT REQUEST</p><h2>New Payment Request</h2><span>Complete the required payment information and submit it for approval.</span></div><button type="button" onClick={() => setShowForm(false)}>×</button></div>
            <fieldset><legend>Requester information</legend><div className="form-grid">
              <label>Submission Date<input value={formatDateDDMMYYYY(new Date())} readOnly /></label>
              <label>Employee ID<input value={String(paymentProfile.employee_no??"")} readOnly /></label>
              <label>Employee Name<input value={`${String(paymentProfile.first_name??"")} ${String(paymentProfile.last_name??"")}`.trim()} readOnly /></label>
              <label>Employee Department<input value={String(paymentProfile.department??"")} readOnly /></label>
              <label>Business Units *<select key={`${String(paymentProfile.project_location??'')}-${masterItems.length}`} name="businessUnit" defaultValue={String(paymentProfile.project_location??"")} required><option value="">Select business unit</option>{masterItems.filter(item=>item.item_type==='project_location').map(item=><option key={String(item.id)} value={String(item.name)}>{String(item.name)}</option>)}</select></label>
              <label>Request From Department *<select name="requestFromDepartment" defaultValue={String(paymentProfile.department??"")} required><option value="">Select department</option>{masterItems.filter(item=>item.item_type==='department').map(item=><option key={String(item.id)}>{String(item.name)}</option>)}</select></label>
            </div></fieldset>
            <fieldset><legend>Payment information</legend><div className="form-grid">
              <label>Payment Type *<select name="paymentType" value={paymentTypeValue} onChange={event=>setPaymentTypeValue(event.target.value)} required><option value="">Select payment type</option><option>Payment</option><option>Advance</option><option>Taxi Charge</option><option>Patty Cash</option><option>Patty Cash Topup</option></select></label>
              <label>Payment Method *<select name="paymentMethod" key={paymentTypeValue} required disabled={!paymentTypeValue}><option value="">Select payment method</option>{(paymentTypeValue==='Payment'?['Cash','Bank Transfer','Internal Offset']:['Cash']).map(method=><option key={method}>{method}</option>)}</select></label>
              <label>Pay To *<input name="payTo" required /></label>
              <label>Currency Type *<select name="currencyType" value={paymentCurrency} onChange={event=>setPaymentCurrency(event.target.value)} required><option>USD</option><option>EURO</option><option>CNY</option><option>MMK</option><option>THB</option></select></label>
              <label className="amount-field">Total Amount *<input type="text" inputMode="decimal" value={paymentAmountText} onChange={event=>{const clean=event.target.value.replace(/[^0-9.]/g,"");const [whole="",...decimalParts]=clean.split(".");const decimal=decimalParts.join("").slice(0,2);const numeric=Number(`${whole||0}${decimalParts.length?`.${decimal}`:""}`)||0;setPaymentAmount(numeric);setPaymentAmountText(`${whole?Number(whole).toLocaleString("en-US"):""}${decimalParts.length?`.${decimal}`:""}`)}} required /><input type="hidden" name="totalAmount" value={paymentAmount}/><small className="amount-preview">{paymentAmount>0?(localStorage.getItem("portal_language")==="Myanmar"&&paymentCurrency==="MMK"?`${numberToMyanmarWords(paymentAmount)}ကျပ်တိတိ`:`${numberToEnglishWords(paymentAmount)} ${({USD:"US Dollars",EURO:"Euros",CNY:"Chinese Yuan",MMK:"Kyat",THB:"Thai Baht"} as Record<string,string>)[paymentCurrency]}`):"Enter the total amount"}</small></label>
              <label className="wide">Description *<textarea name="description" rows={4} required /></label>
              <label className="wide">Remark<textarea name="remark" rows={3} /></label>
              <label className="wide payment-attachments">Attachments<input name="attachments" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" /><small>Up to 5 files, maximum 10 MB each.</small></label>
            </div></fieldset>
            <div className="payment-approval-note"><b>Approval workflow</b><span>Department Head Approver → Finance Approver → Cashier</span><small>Approvers are assigned from Users & Roles → Approval Setup.</small></div>
            <div className="form-footer"><button type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary">Submit Payment Request</button></div>
          </form>
          ) : (
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
          )
        )}
        <section className="data-card">
          {loading ? (
            <div className="loading">Loading…</div>
          ) : (
            <table className="payment-request-list-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Submission Date</th>
                  <th>Requestor Name</th>
                  <th>Pay To</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {listRows.map((r, i) => (
                  <tr key={String(r.id ?? i)}>
                    <td>
                      <b>{String(r.reference_no)}</b>
                    </td>
                    <td>{new Date(String(r.request_date)).toLocaleDateString()}</td>
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
        {showPaymentSubmitConfirmation&&<div className="confirm-backdrop" onMouseDown={()=>setShowPaymentSubmitConfirmation(false)}><div className="confirm-dialog" onMouseDown={event=>event.stopPropagation()}><div className="confirm-icon approve">✓</div><h2>Submit payment request?</h2><p>Please confirm that the payment request information is correct before submitting it for approval.</p><div><button type="button" onClick={()=>setShowPaymentSubmitConfirmation(false)}>Cancel</button><button type="button" className="confirm-approve" onClick={()=>{setShowPaymentSubmitConfirmation(false);paymentSubmitConfirmedRef.current=true;paymentRequestFormRef.current?.requestSubmit()}}>Yes, submit</button></div></div></div>}
      </>
    );
  if(page==="Banner"){
    const banner=(!Array.isArray(rows)&&rows&&typeof rows==='object'?rows:{}) as Record<string,unknown>;const logoUrl=String(banner.logoUrl??'');return <><div className="page-title"><div><p>GENERAL SETTING</p><h1>Navigation Banner</h1><span>Customize the company logo and text displayed at the top of the navigation.</span></div></div><section className="banner-settings-layout"><form className="banner-settings-card" onSubmit={saveBanner}><h2>Banner content</h2><input type="hidden" name="existingLogo" value={logoUrl}/><label>Company logo<input className="banner-file-input" name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"/><small>PNG, JPG, WEBP or GIF · maximum 10 MB</small></label><label>Icon / Logo text<input name="iconText" maxLength={3} defaultValue={String(banner.iconText??'CP')} required /><small>Used when no company logo is uploaded.</small></label><label>Portal title<input name="title" maxLength={50} defaultValue={String(banner.title??'Company Portal')} required /></label><label>Subtitle<input name="subtitle" maxLength={80} defaultValue={String(banner.subtitle??'People & Operations')} required /></label><label>Icon color<input name="iconColor" type="color" defaultValue={String(banner.iconColor??'#6d5ce7')} /></label>{logoUrl&&<label className="banner-remove-logo"><input name="removeLogo" type="checkbox"/> Remove current company logo</label>}<div><button className="primary">Save banner</button></div></form><section className="banner-preview-card"><p>LIVE PREVIEW</p><div className="banner-preview">{logoUrl?<span className="logo-image"><img src={`${API}${logoUrl}`} alt="Company logo"/></span>:<span style={{background:String(banner.iconColor??'#6d5ce7')}}>{String(banner.iconText??'CP')}</span>}<div><b>{String(banner.title??'Company Portal')}</b><small>{String(banner.subtitle??'People & Operations')}</small></div></div></section></section>{roleSaveNotice&&<div className={`role-save-popup ${roleSaveNotice.type}`}><span>{roleSaveNotice.type==='success'?'✓':'!'}</span><div><b>{roleSaveNotice.type==='success'?'Saved successfully':'Save failed'}</b><small>{roleSaveNotice.message}</small></div><button onClick={()=>setRoleSaveNotice(null)}>×</button></div>}</>
  }
  if(page==="Approval Setup"){
    const setup=(!Array.isArray(rows)&&rows&&typeof rows==='object'?rows:{}) as {steps?:Record<string,unknown>[];users?:Record<string,unknown>[]};const workflows:["payment"|"advance_clearance",string][]=[["payment","Payment Request Form"],["advance_clearance","Advance Clearance Request"]];const names=['Department Head Approver','Finance Approver','Cashier'];return <><div className="page-title"><div><p>USERS & ROLES</p><h1>Approval Setup</h1><span>Assign approvers for each corporate request workflow.</span></div></div><div className="approval-setup-grid">{workflows.map(([type,title])=><form className="approval-workflow-card" key={type} onSubmit={(event)=>saveApprovalWorkflow(event,type)}><header><span>{type==='payment'?'PAY':'ADV'}</span><div><h2>{title}</h2><p>Three-step approval workflow</p></div></header><div className="workflow-steps">{names.map((name,index)=>{const step=setup.steps?.find(item=>item.request_type===type&&Number(item.step_order)===index+1);return <label key={name}><i>{index+1}</i><div><b>{name}</b><SearchableApproverSelect name={`step-${index+1}`} users={setup.users??[]} defaultValue={String(step?.approver_user_id??'')} /></div>{index<2&&<em>›</em>}</label>})}</div><footer><button className="primary">Save workflow</button></footer></form>)}</div>{roleSaveNotice&&<div className={`role-save-popup ${roleSaveNotice.type}`}><span>{roleSaveNotice.type==='success'?'✓':'!'}</span><div><b>{roleSaveNotice.type==='success'?'Saved successfully':'Save failed'}</b><small>{roleSaveNotice.message}</small></div><button onClick={()=>setRoleSaveNotice(null)}>×</button></div>}</>
  }
  if (page === "Role Access Control") {
    const roles = ["admin", "hr", "manager", "approver", "employee"];
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
              {permissionMenuItems.map((menu) => (
                <tr key={menu.key} className={`permission-level-${menu.level}`}>
                  <td>
                    <b>{menu.key}</b>
                  </td>
                  {roles.map((role) => {
                    const entry = listRows.find(
                      (row) => row.role === role && row.menu_key === menu.key,
                    );
                    const draftKey = `${role}::${menu.key}`;
                    const checked = role === "admin" || (draftKey in permissionDraft ? permissionDraft[draftKey] : Boolean(entry?.allowed));
                    return (
                      <td key={role}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={role === "admin"}
                          onChange={(e) =>
                            updatePermission(role, menu.key, e.target.checked)
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
                onClick={() => { if (!r.read_at) void markRead(r.id); if (r.resource_type === 'corporate_request') onNavigate?.('My Requests'); }}
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
        {roleSaveNotice&&<div className={`role-save-popup ${roleSaveNotice.type}`} role="status"><span>{roleSaveNotice.type==='success'?'✓':'!'}</span><div><b>{roleSaveNotice.type==='success'?'Saved successfully':'Save failed'}</b><small>{roleSaveNotice.message}</small></div><button onClick={()=>setRoleSaveNotice(null)}>×</button></div>}
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
  const [fleetOpen, setFleetOpen] = useState(false);
  const [humanResourceOpen, setHumanResourceOpen] = useState(false);
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [reportGroupOpen, setReportGroupOpen] = useState<string | null>(null);
  const [usersOpen, setUsersOpen] = useState(false);
  const [generalOpen, setGeneralOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [overviewConfirmation, setOverviewConfirmation] =
    useState<Confirmation | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [branding, setBranding] = useState<Branding>({iconText:'CP',title:'Company Portal',subtitle:'People & Operations',iconColor:'#6d5ce7'});
  const language = localStorage.getItem("portal_language") ?? "English";
  const menuLabels: Record<string, string> = {
    "Human Resource": "လူ့စွမ်းအားအရင်းအမြစ်",
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
  useEffect(()=>{fetch(`${API}/branding`).then(response=>response.ok?response.json():null).then(value=>{if(value)setBranding(value)}).catch(()=>undefined)},[]);
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
          <div className={`login-logo ${branding.logoUrl?'has-image':''}`} style={branding.logoUrl?undefined:{background:branding.iconColor}}>{branding.logoUrl?<img src={`${API}${branding.logoUrl}`} alt="Company logo"/>:branding.iconText}</div>
          <p>{branding.title.toUpperCase()}</p>
          <h1>Welcome back</h1>
          <span>{branding.subtitle}</span>
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
    item === "Human Resource"
      ? can(item) || humanResourceSubmenus.some(can)
      : item === "Approvals"
        ? can(item) || approvalSubmenus.some(can)
      : item === "Fleet Management"
        ? can(item) || fleetSubmenus.some(can)
      : item === "Corporate"
      ? can(item) || corporateSubmenus.some(can)
      : item === "Reports"
        ? can(item) || reportGroups.some((group)=>can(group.name)||group.reports.some(can))
      : item === "Users & Roles"
        ? can(item) || can("Role Access Control") || can("Approval Setup")
      : item === "General Setting"
        ? can(item) || can("Item Master") || can("Banner") || can("Settings")
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
          {branding.logoUrl?<span className="brand-logo-image"><img src={`${API}${branding.logoUrl}`} alt="Company logo"/></span>:<span style={{background:branding.iconColor}}>{branding.iconText}</span>}
          <div>
            {branding.title}<small>{branding.subtitle}</small>
          </div>
        </div>
        <nav>
          {visibleNav.map((item) =>
            item === "Human Resource" ? (
              <div className="nav-group" key={item}>
                <button
                  className={humanResourceSubmenus.includes(active) ? "active" : ""}
                  onClick={() => setHumanResourceOpen((open) => !open)}
                >
                  <i><NavIcon name="Human Resource" /></i>
                  {label("Human Resource")}
                  <span className={`chevron ${humanResourceOpen ? "open" : ""}`}><ChevronIcon /></span>
                </button>
                {humanResourceOpen && (
                  <div className="sub-menu">
                    {humanResourceSubmenus.filter(can).map((submenu) => (
                      <button
                        key={submenu}
                        className={active === submenu ? "active" : ""}
                        onClick={() => navigate(submenu)}
                      >
                        {label(submenu)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : item === "Corporate" ? (
              <div className="nav-group" key={item}>
                <button
                  className={corporateSubmenus.includes(active) ? "active" : ""}
                  onClick={() => setCorporateOpen((open) => !open)}
                >
                  <i>
                    <NavIcon name="Corporate" />
                  </i>
                  {label("Corporate")}
                  <span className={`chevron ${corporateOpen ? "open" : ""}`}>
                    <ChevronIcon />
                    ⌄
                  </span>
                </button>
                {corporateOpen && (
                  <div className="sub-menu">
                    {can("Payment Request Form") && (
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
                    {can("Advance Clearance Request Form") && (
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
                    {["Material Request Form", "Service Request Form", "Stationary Request Form", "Vehicle Request Form"].filter(can).map((submenu) => (
                      <button
                        key={submenu}
                        className={active === submenu ? "active" : ""}
                        onClick={() => navigate(submenu)}
                      >
                        {submenu}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : item === "Fleet Management" ? (
              <div className="nav-group" key={item}>
                <button
                  className={fleetSubmenus.includes(active) ? "active" : ""}
                  onClick={() => setFleetOpen((open) => !open)}
                >
                  <i><NavIcon name="Fleet Management" /></i>
                  Fleet Management
                  <span className={`chevron ${fleetOpen ? "open" : ""}`}><ChevronIcon /></span>
                </button>
                {fleetOpen && (
                  <div className="sub-menu">
                    {fleetSubmenus.filter(can).map((submenu) => (
                      <button
                        key={submenu}
                        className={active === submenu ? "active" : ""}
                        onClick={() => navigate(submenu)}
                      >
                        {submenu}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : item === "Approvals" ? (
              <div className="nav-group" key={item}>
                <button
                  className={active === "Approvals" || approvalSubmenus.includes(active) ? "active" : ""}
                  onClick={() => setApprovalsOpen((open) => !open)}
                >
                  <i><NavIcon name="Approvals" /></i>
                  {label("Approvals")}
                  <b>{currentRole === "employee" ? employeePending.length : (dashboard?.stats.pendingApprovals ?? 0)}</b>
                  <span className={`chevron ${approvalsOpen ? "open" : ""}`}><ChevronIcon /></span>
                </button>
                {approvalsOpen && (
                  <div className="sub-menu approval-sub-menu">
                    {approvalSubmenus.filter(can).map((submenu) => (
                      <button
                        key={submenu}
                        className={active === submenu ? "active" : ""}
                        onClick={() => navigate(submenu)}
                      >
                        {submenu}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : item === "Reports" ? (
              <div className="nav-group" key={item}>
                <button
                  className={active === "Reports" || reportSubmenus.includes(active) ? "active" : ""}
                  onClick={() => setReportsOpen((open) => !open)}
                >
                  <i><NavIcon name="Reports" /></i>
                  {label("Reports")}
                  <span className={`chevron ${reportsOpen ? "open" : ""}`}><ChevronIcon /></span>
                </button>
                {reportsOpen && (
                  <div className="sub-menu report-category-menu">
                    {reportGroups.filter((group)=>can(group.name)||group.reports.some(can)).map((group) => {
                      const groupOpen = reportGroupOpen === group.name;
                      const groupActive = group.reports.includes(active);
                      return (
                        <div className="report-nav-group" key={group.name}>
                          <button
                            className={`report-category${groupActive ? " active" : ""}`}
                            onClick={() => setReportGroupOpen(groupOpen ? null : group.name)}
                          >
                            <span>{group.name}</span>
                            <span className={`chevron ${groupOpen ? "open" : ""}`}><ChevronIcon /></span>
                          </button>
                          {groupOpen && (
                            <div className="report-leaf-menu">
                              {group.reports.filter(can).map((report) => (
                                <button
                                  key={report}
                                  className={active === report ? "active" : ""}
                                  onClick={() => navigate(report)}
                                >
                                  {report}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : item === "Users & Roles" ? (
              <div className="nav-group" key={item}>
                <button
                  className={
                    ["Users & Roles", "Role Access Control", "Approval Setup"].includes(active)
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
                    <ChevronIcon />
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
                    {can("Role Access Control") && (
                      <button
                        className={
                          active === "Role Access Control" ? "active" : ""
                        }
                        onClick={() => navigate("Role Access Control")}
                      >
                        Role Access Control
                      </button>
                    )}
                    {can("Approval Setup") && (
                      <button className={active === "Approval Setup" ? "active" : ""} onClick={() => navigate("Approval Setup")}>Approval Setup</button>
                    )}
                  </div>
                )}
              </div>
            ) : item === "General Setting" ? (
              <div className="nav-group" key={item}>
                <button
                  className={["Item Master","Banner","Settings"].includes(active) ? "active" : ""}
                  onClick={() => setGeneralOpen((open) => !open)}
                >
                  <i>
                    <NavIcon name="General Setting" />
                  </i>
                  {label("General Setting")}
                  <span className={`chevron ${generalOpen ? "open" : ""}`}>
                    <ChevronIcon />
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
                    {can("Banner") && (
                      <button className={active === "Banner" ? "active" : ""} onClick={() => navigate("Banner")}>Banner</button>
                    )}
                    {can("Settings") && (
                      <button className={active === "Settings" ? "active" : ""} onClick={() => navigate("Settings")}>Settings</button>
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
          {can("My Requests")&&<button className={active === "My Requests" ? "active" : ""} onClick={() => navigate("My Requests")}>
            <i><NavIcon name="My Requests" /></i><span>My Requests</span>
          </button>}
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
              onBrandingChanged={setBranding}
              onNavigate={navigate}
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
