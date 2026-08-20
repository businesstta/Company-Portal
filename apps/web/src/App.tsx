import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import "./App.css";
import "./responsive.css";
import "./employee-detail.css";
import "./item-master.css";
import "./employee-list.css";
import "./users-roles.css";
import "./settings-management.css";
import "./navigation-enhancements.css";
import "./payment-report-monthly.css";
import "./vehicle-management.css";
import "./approval-workflow.css";
import "./assigned-vehicle.css";
import FerryManagement from "./FerryManagement";
import ITAssetManagement from "./ITAssetManagement";
import LearningManagement from "./LearningManagement";
import "./select-design.css";
import "./theme.css";

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
  "Learning Management",
];
const corporateSubmenus = [
  "Payment Request Form",
  "Advance Clearance Request Form",
  "Material Request Form",
  "Service Request Form",
  "Stationary Request Form",
  "Vehicle Request Form",
];
const fleetSubmenus = ["Vehicle Management (Internal)", "Vehicle Management (Maintenance)", "Ferry Management"];
const informationTechnologySubmenus = ["IT Asset Management", "IT Asset Transfer Form", "IT Asset Write Out Form"];
const vehicleManagementPages = ["Vehicle Management (Internal)", "Vehicle Management (Maintenance)"];
const isVehicleManagementPage = (value: string) => vehicleManagementPages.includes(value);
const vehicleCategoryForPage = (value: string) => value === "Vehicle Management (Maintenance)" ? "maintenance" : "internal";
const approvalSubmenus:string[]=[];
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
  ...informationTechnologySubmenus.map((key) => ({ key, level: 1 })),
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
const vehicleTimeOptions = Array.from({ length: 48 }, (_, index) => {
  const hour24 = Math.floor(index / 2);
  const minutes = index % 2 === 0 ? "00" : "30";
  const hour12 = hour24 % 12 || 12;
  const suffix = hour24 < 12 ? "AM" : "PM";
  return {
    value: `${hour24.toString().padStart(2, "0")}:${minutes}`,
    label: `${hour12}:${minutes} ${suffix}`,
  };
});
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

function AnnouncementThumbnail({announcementId,attachment,token}:{announcementId:unknown;attachment:Record<string,unknown>;token:string}){
  const [url,setUrl]=useState("");const isImage=String(attachment.mimeType??"").startsWith("image/")
  useEffect(()=>{if(!isImage)return;let objectUrl="";fetch(`${API}/dashboard/announcements/${announcementId}/attachments/${attachment.id}`,{headers:{Authorization:`Bearer ${token}`}}).then(response=>response.ok?response.blob():Promise.reject()).then(blob=>{objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}).catch(()=>{});return()=>{if(objectUrl)URL.revokeObjectURL(objectUrl)}},[announcementId,attachment.id,isImage,token])
  const open=async()=>{const response=await fetch(`${API}/dashboard/announcements/${announcementId}/attachments/${attachment.id}`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)return;const objectUrl=URL.createObjectURL(await response.blob());window.open(objectUrl,"_blank","noopener,noreferrer");window.setTimeout(()=>URL.revokeObjectURL(objectUrl),60000)}
  return <button className={`announcement-thumbnail ${isImage?"image":"file"}`} onClick={open}>{isImage&&url?<img src={url} alt={String(attachment.name??"Announcement attachment")}/>:<><span>{String(attachment.mimeType).includes("pdf")?"PDF":"FILE"}</span><small>{String(attachment.name??"Attachment")}</small></>}</button>
}
type MasterConfirmation = {
  mode: "add" | "remove";
  itemType: string;
  name: string;
  id?: string;
};
type RoleOption = {
  role_key: string;
  role_name: string;
  is_system?: boolean;
};
const defaultRoleOptions: RoleOption[] = [
  { role_key: "admin", role_name: "Admin", is_system: true },
  { role_key: "hr", role_name: "HR", is_system: true },
  { role_key: "manager", role_name: "Manager", is_system: true },
  { role_key: "approver", role_name: "Approver", is_system: true },
  { role_key: "employee", role_name: "Employee", is_system: true },
];
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
type VehicleFilters = {
  vehicleName: string;
  vehicleType: string;
  plateNumber: string;
  department: string;
  driverName: string;
  phoneNo: string;
  status: string;
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

function VehicleDeleteDialog({
  count,
  onCancel,
  onConfirm,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="confirm-backdrop" onMouseDown={onCancel}>
      <section className="confirm-dialog vehicle-delete-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="confirm-icon reject">!</div>
        <h2>Delete selected vehicles?</h2>
        <p>Are you sure you want to delete {count} selected vehicle{count > 1 ? "s" : ""}?</p>
        <div>
          <button onClick={onCancel}>Cancel</button>
          <button className="confirm-reject" onClick={onConfirm}>Yes, delete</button>
        </div>
      </section>
    </div>
  );
}

function EmployeeDeleteDialog({ count, deleting, onCancel, onConfirm }: { count: number; deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="confirm-backdrop" onMouseDown={() => !deleting && onCancel()}>
      <section className="confirm-dialog vehicle-delete-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="confirm-icon reject">!</div>
        <h2>Delete selected employees?</h2>
        <p>Are you sure you want to delete {count} selected employee{count === 1 ? "" : "s"}?</p>
        <div><button disabled={deleting} onClick={onCancel}>Cancel</button><button className="confirm-reject" disabled={deleting} onClick={onConfirm}>{deleting ? "Deleting…" : "Yes, delete"}</button></div>
      </section>
    </div>
  );
}

function EmployeeFullSyncDialog({ fileName, importing, onCancel, onConfirm }: { fileName: string; importing: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="confirm-backdrop" onMouseDown={() => !importing && onCancel()}><section className="confirm-dialog employee-sync-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="confirm-icon reject">!</div><h2>Run Full Employee Sync?</h2><p><b>{fileName}</b> will become the active employee list. Existing UUIDs and approval links will be preserved. Employees missing from the file may be made inactive, except protected approvers, managers and your signed-in account.</p><div><button disabled={importing} onClick={onCancel}>Cancel</button><button className="confirm-approve" disabled={importing} onClick={onConfirm}>{importing ? "Syncing…" : "Yes, run full sync"}</button></div></section></div>;
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
  ["Probation Date", "probation_date", "probationDate", "date"],
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
      "probation_date",
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
      <path d="m6 8 4 4 4-4" />
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

function formatDateTimeAMPM(date:Date):string{
  if(Number.isNaN(date.getTime()))return "â€”";
  const hours=date.getHours(),minutes=String(date.getMinutes()).padStart(2,"0");
  return `${formatDateDDMMYYYY(date)} ${String(hours%12||12).padStart(2,"0")}:${minutes} ${hours>=12?"PM":"AM"}`;
}

function requestFormName(type:unknown):string{
  const key=String(type??"").toLowerCase();
  const names:Record<string,string>={
    payment:"Payment Request Form",advance_clearance:"Advance Clearance Request Form",
    vehicle_request:"Vehicle Request Form",
    leave:"Leave Request Form",overtime:"Overtime Request Form",attendance_correction:"Check In/Out Request Form",
    late_in:"Late In Request Form",early_out:"Early Out Request Form",travelling:"Travelling Request Form",
    material:"Material Request Form",service:"Service Request Form",stationary:"Stationary Request Form",
    vehicle:"Vehicle Request Form",appraisal:"Appraisal Request Form"
  };
  return names[key]??`${key.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase())} Request Form`;
}

function corporateRequestId(request: Record<string, unknown> | null | undefined, fallbackType = ""): string {
  const raw = textValue(request?.reference_no ?? request?.request_id ?? request?.id);
  const requestType = String(request?.request_type ?? request?.requestType ?? fallbackType).toLowerCase();
  return requestType === "vehicle_request"
    ? raw.replace(/^[A-Z]+-/, "VRF-")
    : raw;
}

function textValue(value: unknown, fallback = "—"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function requestDetails(request: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const raw = request?.details;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return {};
}

function paymentRequestDetailFields(request: Record<string, unknown> | null | undefined) {
  const details = requestDetails(request);
  const employeeName = textValue(
    request?.employee_name ??
      `${String(request?.first_name ?? "").trim()} ${String(request?.last_name ?? "").trim()}`.trim(),
  );
  return [
    { label: "Employee ID", value: textValue(request?.employee_no ?? request?.employee_id) },
    { label: "Employee Name", value: employeeName },
    { label: "Employee Department", value: textValue(request?.employee_department ?? request?.department) },
    { label: "Business Unit", value: textValue(request?.business_units ?? details.businessUnit) },
    { label: "Submission Date", value: request?.request_date || request?.created_at ? new Date(String(request.request_date ?? request.created_at)).toLocaleDateString() : "—" },
    { label: "Request from Department", value: textValue(details.requestFromDepartment ?? request?.request_from_department ?? request?.employee_department ?? request?.department) },
    { label: "Payment Type", value: textValue(details.paymentType ?? request?.payment_type) },
    { label: "Payment Method", value: textValue(details.paymentMethod ?? request?.payment_method) },
    { label: "Pay To", value: textValue(request?.payee ?? request?.pay_to) },
    { label: "Currency Type", value: textValue(request?.currency ?? request?.currency_type) },
    { label: "Total Amount", value: request?.amount != null ? Number(request.amount).toLocaleString() : "—" },
    { label: "Description", value: textValue(request?.purpose ?? request?.description ?? request?.reason ?? request?.title), className: "description" },
    { label: "Remark", value: textValue(details.remark ?? request?.remark), className: "description" },
  ];
}

function vehicleRequestDetailFields(request: Record<string, unknown> | null | undefined) {
  const details = requestDetails(request);
  const assigned = ((details.assignedVehicle ?? {}) as Record<string, unknown>) || {};
  const employeeName = textValue(
    request?.employee_name ??
      `${String(request?.first_name ?? "").trim()} ${String(request?.last_name ?? "").trim()}`.trim(),
  );
  const storedDate = (value: unknown) => {
    const raw = String(value ?? "").slice(0, 10);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : textValue(value);
  };
  const fields = [
    { label: "Employee ID", value: textValue(request?.employee_no ?? request?.employee_id) },
    { label: "Employee Name", value: employeeName },
    { label: "Employee Department", value: textValue(request?.employee_department ?? request?.department) },
    { label: "Business Unit", value: textValue(request?.business_units ?? details.businessUnit ?? request?.project_location) },
    { label: "Submission Date", value: request?.request_date || request?.created_at ? new Date(String(request.request_date ?? request.created_at)).toLocaleDateString() : "—" },
    { label: "Request From Department", value: textValue(details.requestFromDepartment ?? request?.employee_department ?? request?.department) },
    { label: "Number of Passengers", value: textValue(details.numberOfPassengers) },
    { label: "Go", value: storedDate(details.goDate) },
    { label: "Return", value: storedDate(details.returnDate) },
    { label: "Out", value: textValue(details.outTime) },
    { label: "In", value: textValue(details.inTime) },
    { label: "Activities (Destination)", value: textValue(details.activities ?? request?.purpose), className: "description" },
    { label: "Requested Vehicle Type", value: textValue(details.requestedVehicleType ?? request?.payee) },
    { label: "Remark", value: textValue(details.remark), className: "description" },
  ];
  if (assigned.id) {
    fields.push(
      { label: "Assigned Vehicle", value: textValue(assigned.vehicleName), className: "assigned-vehicle" },
      { label: "Vehicle Plate Number", value: textValue(assigned.vehiclePlateNumber), className: "assigned-vehicle" },
      { label: "Driver Name", value: textValue(assigned.driverName), className: "assigned-vehicle" },
      { label: "Driver Phone Number", value: textValue(assigned.phoneNo), className: "assigned-vehicle" },
    );
  }
  return fields;
}

function corporateRequestDetailFields(request: Record<string, unknown> | null | undefined) {
  return String(request?.request_type ?? "") === "vehicle_request"
    ? vehicleRequestDetailFields(request)
    : paymentRequestDetailFields(request);
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
  selectedAnnouncementId,
}: {
  page: string;
  token: string;
  role: string;
  onNotificationsChanged?: () => void;
  onRequestsChanged?: () => void;
  onBrandingChanged?: (branding: Branding) => void;
  onNavigate?: (page: string) => void;
  selectedAnnouncementId?: string;
}) {
  const [rows, setRows] = useState<unknown>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [pendingEmployee, setPendingEmployee] = useState<Record<
    string,
    FormDataEntryValue
  > | null>(null);
  const [pendingEmployeeAttachments, setPendingEmployeeAttachments] = useState<File[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [selectedCorporateRequest, setSelectedCorporateRequest] = useState<Record<string, unknown> | null>(null);
  const [corporateComment, setCorporateComment] = useState("");
  const [availableVehicles, setAvailableVehicles] = useState<Record<string, unknown>[]>([]);
  const [selectedAssignmentVehicleId, setSelectedAssignmentVehicleId] = useState("");
  const [selectedAssignmentVehicleLabel, setSelectedAssignmentVehicleLabel] = useState("");
  const [vehicleAssignmentSearch, setVehicleAssignmentSearch] = useState("");
  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);
  const [assignmentNotice, setAssignmentNotice] = useState("");
  const [assigningVehicle, setAssigningVehicle] = useState(false);
  const [selectedAnnouncement,setSelectedAnnouncement]=useState<Record<string,unknown>|null>(null);
  const [corporateConfirmation, setCorporateConfirmation] = useState<Confirmation | null>(null);
  const [editingEmployee, setEditingEmployee] = useState(false);
  const [masterItems, setMasterItems] = useState<Record<string, unknown>[]>([]);
  const [masterConfirmation, setMasterConfirmation] =
    useState<MasterConfirmation | null>(null);
  const [importResult, setImportResult] = useState("");
  const [employeeImportMode, setEmployeeImportMode] = useState<"merge" | "full_sync">("merge");
  const [pendingEmployeeImportFile, setPendingEmployeeImportFile] = useState<File | null>(null);
  const [employeeImporting, setEmployeeImporting] = useState(false);
  const [employeeFilters, setEmployeeFilters] = useState<EmployeeFilters>({
    employeeNo: "", name: "", position: "", department: "",
    organization: "", projectLocation: "", reportTo: "", sort: "newer",
  });
  const [employeePage, setEmployeePage] = useState(1);
  const [employeePageSize, setEmployeePageSize] = useState(25);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [showEmployeeDeleteConfirmation, setShowEmployeeDeleteConfirmation] = useState(false);
  const [deletingEmployees, setDeletingEmployees] = useState(false);
  const [employeeNotice, setEmployeeNotice] = useState("");
  const [resetUser, setResetUser] = useState<Record<string, unknown> | null>(null);
  const [resetMessage, setResetMessage] = useState("");
  const [roleSaveNotice, setRoleSaveNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [userFilters, setUserFilters] = useState<UserFilters>({
    employeeNo: "", name: "", position: "", department: "",
    organization: "", projectLocation: "", reportTo: "", role: "",
  });
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(25);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>(defaultRoleOptions);
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [pendingRoleName, setPendingRoleName] = useState("");
  const [permissionDraft, setPermissionDraft] = useState<Record<string, boolean>>({});
  const [permissionDirty, setPermissionDirty] = useState(false);
  const [permissionNotice, setPermissionNotice] = useState("");
  const [paymentProfile, setPaymentProfile] = useState<Record<string, unknown>>({});
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentAmountText, setPaymentAmountText] = useState("");
  const [paymentTypeValue, setPaymentTypeValue] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState("MMK");
  const [paymentReportFilters,setPaymentReportFilters]=useState({from:"",to:"",status:"",department:"",search:""});
  const [paymentReportPage, setPaymentReportPage] = useState(1);
  const [paymentReportPageSize, setPaymentReportPageSize] = useState(25);
  const [vehicleFilters, setVehicleFilters] = useState<VehicleFilters>({
    vehicleName: "",
    vehicleType: "",
    plateNumber: "",
    department: "",
    driverName: "",
    phoneNo: "",
    status: "",
  });
  const [vehiclePage, setVehiclePage] = useState(1);
  const [vehiclePageSize, setVehiclePageSize] = useState(25);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [showVehicleDeleteConfirmation, setShowVehicleDeleteConfirmation] = useState(false);
  const [vehicleNotice, setVehicleNotice] = useState("");
  const [internalVehicles, setInternalVehicles] = useState<Record<string, unknown>[]>([]);
  const [editingVehicle, setEditingVehicle] = useState<Record<string, unknown> | null>(null);
  const [showPaymentSubmitConfirmation, setShowPaymentSubmitConfirmation] = useState(false);
  const paymentRequestFormRef = useRef<HTMLFormElement | null>(null);
  const paymentSubmitConfirmedRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const vehicleFileInput = useRef<HTMLInputElement>(null);
  const requestVersion = useRef(0);
  const requestType: Record<string, string> = {
    Leave: "leave",
    Overtime: "overtime",
    Appraisals: "appraisal",
  };
  const corporateType: Record<string, string> = {
    "Payment Request Form": "payment",
    "Advance Clearance Request Form": "advance_clearance",
    "Vehicle Request Form": "vehicle_request",
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
          ? "approvals/all"
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
                    : isVehicleManagementPage(page)
                      ? `vehicles?category=${vehicleCategoryForPage(page)}`
                    : page === "Reports"
                      ? "reports/summary"
                    : page === "Payment Request Report"
                      ? "reports/payment-requests"
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
  const canManageAnnouncements = ["admin", "hr"].includes(role);
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
  const filteredEmployeeIds = page === "Employees" ? displayRows.map((row) => String(row.id)).filter(Boolean) : [];
  const allFilteredEmployeesSelected = filteredEmployeeIds.length > 0 && filteredEmployeeIds.every((id) => selectedEmployeeIds.includes(id));
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
  const userTotalPages = Math.max(1, Math.ceil(filteredUserRows.length / userPageSize));
  const currentUserPage = Math.min(userPage, userTotalPages);
  const pagedUserRows = page === "Users & Roles"
    ? filteredUserRows.slice((currentUserPage - 1) * userPageSize, currentUserPage * userPageSize)
    : filteredUserRows;
  const filteredVehicleRows = isVehicleManagementPage(page)
    ? listRows.filter((row) => {
        const includes = (value: unknown, search: string) =>
          String(value ?? "").toLowerCase().includes(search.trim().toLowerCase());
        const showVehicleStatus = vehicleCategoryForPage(page) === "internal";
        return includes(row.vehicle_name, vehicleFilters.vehicleName) &&
          includes(row.vehicle_type, vehicleFilters.vehicleType) &&
          includes(row.vehicle_plate_number, vehicleFilters.plateNumber) &&
          (!showVehicleStatus || includes(row.driver_name, vehicleFilters.driverName)) &&
          (!showVehicleStatus || includes(row.phone_no, vehicleFilters.phoneNo)) &&
          (showVehicleStatus || includes(row.department, vehicleFilters.department)) &&
          (!showVehicleStatus || includes(row.status, vehicleFilters.status));
      })
    : [];
  const vehicleTotalPages = Math.max(1, Math.ceil(filteredVehicleRows.length / vehiclePageSize));
  const currentVehiclePage = Math.min(vehiclePage, vehicleTotalPages);
  const pagedVehicleRows = isVehicleManagementPage(page)
    ? filteredVehicleRows.slice((currentVehiclePage - 1) * vehiclePageSize, currentVehiclePage * vehiclePageSize)
    : filteredVehicleRows;
  const updateUserFilter = (key: keyof UserFilters, value: string) => {
    setUserFilters((current) => ({ ...current, [key]: value }));
    setUserPage(1);
  };
  const updatePaymentReportFilter = (patch: Partial<typeof paymentReportFilters>) => {
    setPaymentReportFilters((current) => ({ ...current, ...patch }));
    setPaymentReportPage(1);
  };
  const updateEmployeeFilter = (key: keyof EmployeeFilters, value: string) => {
    setEmployeeFilters((current) => ({ ...current, [key]: value }));
    setEmployeePage(1);
  };
  const updateVehicleFilter = (key: keyof VehicleFilters, value: string) => {
    setVehicleFilters((current) => ({ ...current, [key]: value }));
    setVehiclePage(1);
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
  const roleLabel = (roleKey: unknown) =>
    roleOptions.find((item) => item.role_key === String(roleKey))?.role_name ??
    String(roleKey ?? "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const loadRoles = useCallback(async () => {
    if (!token || role !== "admin") return;
    const response = await fetch(`${API}/roles`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      const data = await response.json();
      setRoleOptions(Array.isArray(data) && data.length ? data : defaultRoleOptions);
    }
  }, [role, token]);
  useEffect(load, [endpoint, token]);
  useEffect(() => {
    if (page === "Users & Roles" || page === "Role Access Control") void loadRoles();
  }, [loadRoles, page]);
  useEffect(() => {
    setSelectedVehicleIds([]);
    setShowVehicleDeleteConfirmation(false);
    setVehicleNotice("");
    setVehiclePage(1);
  }, [page]);
  useEffect(() => {
    setSelectedEmployeeIds([]); setShowEmployeeDeleteConfirmation(false); setEmployeeNotice(""); setEmployeePage(1);
  }, [page]);
  useEffect(()=>{if(page!=="Announcements"||!selectedAnnouncementId||!Array.isArray(rows))return;const match=(rows as Record<string,unknown>[]).find(row=>String(row.id)===selectedAnnouncementId);if(match)setSelectedAnnouncement(match)},[page,rows,selectedAnnouncementId]);
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
    setEditingVehicle(null);
    setImportResult("");
  }, [page]);
  useEffect(() => {
    if (page === "Employees" || page === "Item Master" || page === "Payment Request Form" || page === "Vehicle Request Form")
      fetch(`${API}/item-master`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => setMasterItems(Array.isArray(data) ? data : []));
  }, [page, token]);
  useEffect(() => {
    if (page !== "Payment Request Form" && page !== "Vehicle Request Form") return;
    fetch(`${API}/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.json())
      .then((profile) => setPaymentProfile(profile ?? {}));
  }, [page, token]);
  useEffect(() => {
    if (page !== "Vehicle Request Form") return;
    fetch(`${API}/vehicles?category=internal`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.json())
      .then((vehicles) => setInternalVehicles(Array.isArray(vehicles) ? vehicles : []))
      .catch(() => setInternalVehicles([]));
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
  const employeeFilesFromForm = (form: FormData) => {
    const files = form.getAll("attachments").filter((value): value is File => value instanceof File && value.size > 0);
    if (files.length > 10) { alert("Select no more than 10 employee documents at a time."); return null; }
    const tooLarge = files.find((file) => file.size > 20 * 1024 * 1024);
    if (tooLarge) { alert(`${tooLarge.name} is larger than the 20 MB file limit.`); return null; }
    const allowed = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|rtf|odt|ods|odp|jpe?g|png|webp|gif|bmp|tiff?|heic|eml|msg|zip|rar|7z)$/i;
    const unsupported = files.find((file) => !allowed.test(file.name));
    if (unsupported) { alert(`${unsupported.name} is not a supported employee document type.`); return null; }
    return files;
  };
  const createEmployee = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const attachments = employeeFilesFromForm(form);if (!attachments) return;
    setPendingEmployee(Object.fromEntries(Array.from(form.entries()).filter(([key]) => key !== "attachments")));
    setPendingEmployeeAttachments(attachments);
  };
  const uploadEmployeeAttachments = async (employeeId: unknown, files: File[]) => {
    if (!files.length) return true;
    const body = new FormData();
    files.forEach((file) => body.append("attachments", file));
    const response = await fetch(`${API}/employees/${employeeId}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      alert(String(result.error ?? "Employee was saved, but the documents could not be uploaded."));
      return false;
    }
    return true;
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
      const employee = await r.json();
      await uploadEmployeeAttachments(employee.id, pendingEmployeeAttachments);
      setPendingEmployee(null);
      setPendingEmployeeAttachments([]);
      setShowForm(false);
      load();
    } else {
      const result = await r.json();
      setPendingEmployee(null);
      setPendingEmployeeAttachments([]);
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
    const form = new FormData(e.currentTarget);
    const attachments = employeeFilesFromForm(form);if (!attachments) return;
    const body = Object.fromEntries(Array.from(form.entries()).filter(([key]) => key !== "attachments"));
    const r = await fetch(`${API}/employees/${id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      await uploadEmployeeAttachments(id, attachments);
      await selectEmployee(id);
      setEditingEmployee(false);
      load();
    } else alert((await r.json()).error ?? "Unable to update employee");
  };
  const openEmployeeAttachment = async (employeeId: unknown, attachmentId: unknown) => {
    const response = await fetch(`${API}/employees/${employeeId}/attachments/${attachmentId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return alert("Unable to download employee document");
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const fallbackName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
    const name = encodedName ? decodeURIComponent(encodedName) : fallbackName ?? "employee-document";
    const url = URL.createObjectURL(await response.blob());const anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),0);
  };
  const removeEmployeeAttachment = async (employeeId: unknown, attachmentId: unknown) => {
    if (!window.confirm("Remove this employee document?")) return;
    const response = await fetch(`${API}/employees/${employeeId}/attachments/${attachmentId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return alert("Unable to remove employee document");
    await selectEmployee(employeeId);
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
      ? { type: "success", message: `Role updated to ${roleLabel(role)} successfully.` }
      : { type: "error", message: "Unable to update role. Please try again." });
    window.setTimeout(() => setRoleSaveNotice(null), 2600);
    load();
  };
  const askCreateRole = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const roleName = String(new FormData(event.currentTarget).get("roleName") ?? "").trim();
    if (!roleName) return;
    setPendingRoleName(roleName);
  };
  const confirmCreateRole = async () => {
    const response = await fetch(`${API}/roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ roleName: pendingRoleName }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      setRoleSaveNotice({ type: "success", message: `${String(result.role_name ?? pendingRoleName)} role created successfully.` });
      setShowCreateRole(false);
      setPendingRoleName("");
      await loadRoles();
      if (page === "Role Access Control") load();
    } else {
      setRoleSaveNotice({ type: "error", message: String(result.error ?? "Unable to create role. Please try again.") });
      setPendingRoleName("");
    }
    window.setTimeout(() => setRoleSaveNotice(null), 2600);
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
  const saveApprovalWorkflow = async (event: FormEvent<HTMLFormElement>, requestType: "payment" | "advance_clearance" | "vehicle_request", stepNames: string[]) => {
    event.preventDefault();const form=new FormData(event.currentTarget);const steps=stepNames.map((stepName,index)=>({stepOrder:index+1,stepName,approverUserId:String(form.get(`step-${index+1}`)??'')||null}));const response=await fetch(`${API}/approval-setup/${requestType}`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({steps})});const labels:{[key:string]:string}={payment:'Payment Request',advance_clearance:'Advance Clearance',vehicle_request:'Vehicle Request'};setRoleSaveNotice(response.ok?{type:'success',message:`${labels[requestType]} workflow saved successfully.`}:{type:'error',message:'Unable to save approval workflow.'});window.setTimeout(()=>setRoleSaveNotice(null),2600);if(response.ok)load()
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
  const importExcel = async (file?: File, mode: "merge" | "full_sync" = "merge") => {
    if (!file) return;
    const form = new FormData(); form.append("file", file);
    setEmployeeImporting(true); setImportResult(mode === "full_sync" ? "Running safe full sync…" : "Importing…");
    const r = await fetch(`${API}/employees/import?mode=${mode}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    const result = await r.json();
    if (!r.ok) { setImportResult(result.error ?? "Import failed"); setEmployeeImporting(false); return; }
    const errorDetails = Array.isArray(result.errors) ? result.errors.slice(0, 8).map((error: { row: number; message: string }) => `Row ${error.row}: ${error.message}`).join("\n") : "";
    const syncSummary = mode === "full_sync" ? result.syncSkipped ? "\nFull Sync safety stop: missing employees were not deactivated because the file was empty or contained row errors." : `\nDeactivated ${result.deactivated ?? 0}; protected ${result.protected ?? 0}.` : "";
    const protectedDetails = Array.isArray(result.protectedEmployees) && result.protectedEmployees.length ? `\nProtected: ${result.protectedEmployees.slice(0, 8).map((employee: { employeeNo: string; reason: string }) => `${employee.employeeNo} (${employee.reason})`).join(", ")}` : "";
    setImportResult(`Mode: ${mode === "full_sync" ? "Full Sync" : "Merge / Update"}\nImported ${result.imported}, updated ${result.updated}, reactivated ${result.reactivated ?? 0}, skipped ${result.skipped}${syncSummary}${protectedDetails}${errorDetails ? `\n${errorDetails}` : ""}`);
    load(); setPendingEmployeeImportFile(null); setEmployeeImporting(false); if (fileInput.current) fileInput.current.value = "";
  };
  const downloadVehicleTemplate = async () => {
    const category = vehicleCategoryForPage(page);
    const r = await fetch(`${API}/vehicles/template?category=${category}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return alert("Vehicle template download failed");
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${category}-vehicle-import-template.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportVehicles = async () => {
    const category = vehicleCategoryForPage(page);
    const params = new URLSearchParams({ category });
    if (vehicleFilters.vehicleName.trim()) params.set("vehicleName", vehicleFilters.vehicleName.trim());
    if (vehicleFilters.vehicleType.trim()) params.set("vehicleType", vehicleFilters.vehicleType.trim());
    if (vehicleFilters.plateNumber.trim()) params.set("plateNumber", vehicleFilters.plateNumber.trim());
    if (vehicleFilters.department.trim()) params.set("department", vehicleFilters.department.trim());
    if (vehicleFilters.driverName.trim()) params.set("driverName", vehicleFilters.driverName.trim());
    if (vehicleFilters.phoneNo.trim()) params.set("phoneNo", vehicleFilters.phoneNo.trim());
    if (vehicleFilters.status.trim()) params.set("status", vehicleFilters.status.trim());
    const r = await fetch(`${API}/vehicles/export?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return alert("Vehicle export failed");
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${category}-vehicles-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importVehicles = async (file?: File) => {
    if (!file) return;
    const category = vehicleCategoryForPage(page);
    const form = new FormData();
    form.append("file", file);
    form.append("vehicleCategory", category);
    setImportResult("Importing vehicles…");
    const r = await fetch(`${API}/vehicles/import?category=${category}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const result = await r.json().catch(() => ({ error: "Vehicle import failed" }));
    if (!r.ok) {
      setImportResult(result.error ?? "Vehicle import failed");
      return;
    }
    const errorDetails = Array.isArray(result.errors)
      ? result.errors.slice(0, 8).map((error: { row: number; message: string }) => `Row ${error.row}: ${error.message}`).join("\n")
      : "";
    setImportResult(`Imported ${result.imported}, updated ${result.updated}, skipped ${result.skipped}${errorDetails ? `\n${errorDetails}` : ""}`);
    load();
    if (vehicleFileInput.current) vehicleFileInput.current.value = "";
  };
  const createCorporate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const isPayment = page === "Payment Request Form";
    const isVehicleRequest = page === "Vehicle Request Form";
    if ((isPayment || isVehicleRequest) && !paymentSubmitConfirmedRef.current) {
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
    if (isVehicleRequest) {
      f.set("requestType", "vehicle_request");
      f.set("purpose", String(f.get("activities") ?? ""));
      f.set("payee", String(f.get("requestedVehicleType") ?? "Any"));
      f.set("amount", "0");
      f.set("currency", "MMK");
      f.set("details", JSON.stringify({
        numberOfPassengers: f.get("numberOfPassengers"),
        goDate: f.get("goDate"),
        returnDate: f.get("returnDate"),
        outTime: f.get("outTime"),
        inTime: f.get("inTime"),
        activities: f.get("activities"),
        requestedVehicleType: f.get("requestedVehicleType"),
        remark: f.get("remark"),
        requesterName: `${String(paymentProfile.first_name ?? "")} ${String(paymentProfile.last_name ?? "")}`.trim(),
        employeeNo: paymentProfile.employee_no,
        department: paymentProfile.department,
      }));
    }
    const usesMultipart = isPayment || isVehicleRequest;
    const r = await fetch(`${API}/corporate-requests?type=${isPayment?'payment':corporateType[page]}`, {
      method: "POST",
      headers: usesMultipart ? { Authorization: `Bearer ${token}` } : {
        Authorization: `Bearer ${token}`, "Content-Type": "application/json",
      },
      body: usesMultipart ? f : JSON.stringify({
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
  const saveVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const vehicleCategory = vehicleCategoryForPage(page);
    const body = {
      vehicleName: String(form.get("vehicleName") ?? "").trim(),
      vehicleType: String(form.get("vehicleType") ?? "").trim(),
      vehiclePlateNumber: String(form.get("vehiclePlateNumber") ?? "").trim(),
      department: vehicleCategory === "maintenance" ? String(form.get("department") ?? "").trim() : "",
      driverName: vehicleCategory === "internal" ? String(form.get("driverName") ?? "").trim() : "",
      phoneNo: vehicleCategory === "internal" ? String(form.get("phoneNo") ?? "").trim() : "",
      status: vehicleCategory === "internal" ? String(form.get("status") ?? "Free") : "Free",
      vehicleCategory,
    };
    const response = await fetch(
      `${API}/vehicles${editingVehicle ? `/${editingVehicle.id}` : ""}`,
      {
        method: editingVehicle ? "PUT" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Unable to save vehicle" }));
      alert(payload.error ?? "Unable to save vehicle");
      return;
    }
    setShowForm(false);
    setEditingVehicle(null);
    load();
  };
  const deleteSelectedVehicles = async () => {
    const category = vehicleCategoryForPage(page);
    const response = await fetch(`${API}/vehicles`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: selectedVehicleIds, vehicleCategory: category }),
    });
    const payload = await response.json().catch(() => ({ error: "Unable to delete vehicles" }));
    setShowVehicleDeleteConfirmation(false);
    if (!response.ok) {
      alert(payload.error ?? "Unable to delete vehicles");
      return;
    }
    setSelectedVehicleIds([]);
    setVehicleNotice(`${payload.deleted ?? selectedVehicleIds.length} vehicle${Number(payload.deleted ?? selectedVehicleIds.length) > 1 ? "s" : ""} deleted successfully.`);
    load();
  };
  const deleteSelectedEmployees = async () => {
    if (!selectedEmployeeIds.length || deletingEmployees) return;
    setDeletingEmployees(true);
    const response = await fetch(`${API}/employees`, { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ids: selectedEmployeeIds }) });
    const payload = await response.json().catch(() => ({ error: "Unable to delete employees" }));
    if (!response.ok) setEmployeeNotice(String(payload.error ?? "Unable to delete selected employees."));
    else { const removed = Number(payload.removed ?? selectedEmployeeIds.length); setEmployeeNotice(`${removed} employee${removed === 1 ? "" : "s"} deleted successfully.${payload.skippedSelf ? " Your own account was kept active." : ""}`); setSelectedEmployeeIds([]); setShowEmployeeDeleteConfirmation(false); load(); }
    setDeletingEmployees(false);
  };
  const selectCorporateRequest = async (id: unknown) => {
    setCorporateComment("");
    setAssignmentNotice("");
    setAvailableVehicles([]);
    setSelectedAssignmentVehicleId("");
    setSelectedAssignmentVehicleLabel("");
    setVehicleAssignmentSearch("");
    setVehiclePickerOpen(false);
    const response = await fetch(`${API}/corporate-requests/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return;
    const payload = await response.json();
    setSelectedCorporateRequest(payload);
    const request = (payload.request ?? {}) as Record<string, unknown>;
    const details = (request.details ?? {}) as Record<string, unknown>;
    const assignedVehicle = (details.assignedVehicle ?? {}) as Record<string, unknown>;
    setSelectedAssignmentVehicleId(String(assignedVehicle.id ?? ""));
    setSelectedAssignmentVehicleLabel(
      [assignedVehicle.vehiclePlateNumber, assignedVehicle.vehicleName]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join(" · "),
    );
    if (payload.canAssignVehicle) {
      const vehiclesResponse = await fetch(`${API}/corporate-requests/${id}/available-vehicles`, { headers: { Authorization: `Bearer ${token}` } });
      if (vehiclesResponse.ok) setAvailableVehicles(await vehiclesResponse.json());
    }
  };
  const selectMyRequest = async (row: Record<string,unknown>) => {
    if (row.source === 'corporate') return selectCorporateRequest(row.id);
    setSelectedCorporateRequest({request:row,steps:[],attachments:[],canAct:page==="Approvals"&&String(row.status)==="pending"});
  };
  const actCorporateRequest = async () => {
    if (!corporateConfirmation) return;
    const response=await fetch(`${API}/corporate-requests/${corporateConfirmation.id}/action`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action:corporateConfirmation.action,comment:corporateComment.trim()||undefined})});
    if(response.ok){
      setCorporateConfirmation(null);
      setSelectedCorporateRequest(null);
      setCorporateComment("");
      setAvailableVehicles([]);
      setSelectedAssignmentVehicleId("");
      setSelectedAssignmentVehicleLabel("");
      setVehicleAssignmentSearch("");
      setVehiclePickerOpen(false);
      await load();
      onNotificationsChanged?.();
      onRequestsChanged?.();
    }else{
      setCorporateConfirmation(null);
      const payload=await response.json().catch(()=>({error:'Unable to update request'}));
      alert(payload.error??'Unable to update request')
    }
  };
  const assignVehicleToRequest = async () => {
    const detail = selectedCorporateRequest as { request?: Record<string, unknown> } | null;
    const requestId = String(detail?.request?.id ?? "");
    if (!requestId || !selectedAssignmentVehicleId) {
      setAssignmentNotice("Please select a free vehicle.");
      return;
    }
    setAssigningVehicle(true);
    setAssignmentNotice("");
    const response = await fetch(`${API}/corporate-requests/${requestId}/assign-vehicle`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId: selectedAssignmentVehicleId }),
    });
    const payload = await response.json().catch(() => ({ error: "Unable to assign vehicle" }));
    if (!response.ok) {
      setAssignmentNotice(payload.error ?? "Unable to assign vehicle");
      setAssigningVehicle(false);
      return;
    }
    await selectCorporateRequest(requestId);
    setVehiclePickerOpen(false);
    setAssignmentNotice("Vehicle assigned successfully.");
    await load();
    onNotificationsChanged?.();
    onRequestsChanged?.();
    setAssigningVehicle(false);
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
  const markRead = async (id: unknown, refreshList = true) => {
    await fetch(`${API}/notifications/${id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (refreshList) load();
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
            : key === "branch"
              ? "branch"
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
  if (page === "Ferry Management") return <FerryManagement token={token} />;
  if (page === "IT Asset Management") return <ITAssetManagement token={token} onNavigate={onNavigate} />;
  if (page === "Learning Management") return <LearningManagement token={token} role={role} />;
  if (!endpoint)
    return (
      <div className="empty-page">
        <div>◇</div>
        <h2>{page}</h2>
        <p>This module is next in the implementation queue.</p>
      </div>
    );
  if (isVehicleManagementPage(page)) {
    const closeVehicleForm = () => {
      setShowForm(false);
      setEditingVehicle(null);
    };
    const showVehicleStatus = vehicleCategoryForPage(page) === "internal";
    const visibleVehicleIds = pagedVehicleRows.map((vehicle) => String(vehicle.id)).filter(Boolean);
    const allVisibleVehiclesSelected = visibleVehicleIds.length > 0 && visibleVehicleIds.every((id) => selectedVehicleIds.includes(id));
    const toggleVehicleSelection = (id: string, checked: boolean) =>
      setSelectedVehicleIds((current) => checked ? Array.from(new Set([...current, id])) : current.filter((value) => value !== id));
    const toggleAllVisibleVehicles = (checked: boolean) =>
      setSelectedVehicleIds((current) => checked ? Array.from(new Set([...current, ...visibleVehicleIds])) : current.filter((id) => !visibleVehicleIds.includes(id)));
    return (
      <div className={`vehicle-management-page${showForm || editingVehicle ? " has-form" : ""}`}>
        <div className="page-title">
          <div>
            <p>FLEET MANAGEMENT</p>
            <h1>{page}</h1>
            <span>Add, edit and search company vehicle records.</span>
          </div>
          <div className="vehicle-page-actions">
            <button type="button" onClick={downloadVehicleTemplate}>⇩ Excel template</button>
            <button type="button" onClick={() => vehicleFileInput.current?.click()}>⇧ Import Excel</button>
            <button type="button" onClick={exportVehicles}>⇩ Export Excel</button>
            <button className="primary" onClick={() => { setEditingVehicle(null); setShowForm(true); }}>
              + New vehicle
            </button>
            <input ref={vehicleFileInput} type="file" accept=".xlsx" hidden onChange={(e) => importVehicles(e.target.files?.[0])} />
          </div>
        </div>
        {importResult && (
          <div className={`import-result ${importResult.includes("failed") || importResult.includes("Missing") || importResult.includes("Row ") ? "error" : ""}`}>
            {importResult}
            <button onClick={() => setImportResult("")}>×</button>
          </div>
        )}
        {vehicleNotice && (
          <div className="import-result vehicle-success-notice">
            {vehicleNotice}
            <button onClick={() => setVehicleNotice("")}>Ã—</button>
          </div>
        )}
        {(showForm || editingVehicle) && (
          <form className="employee-form vehicle-form" onSubmit={saveVehicle}>
            <div className="vehicle-form-heading">
              <div>
                <p>VEHICLE RECORD</p>
                <h2>{editingVehicle ? "Edit vehicle" : "New vehicle"}</h2>
                <span>Complete the vehicle information used by Fleet Management.</span>
              </div>
              <button type="button" onClick={closeVehicleForm}>×</button>
            </div>
            <div className="form-grid">
              <label>Vehicle Name *<input name="vehicleName" defaultValue={String(editingVehicle?.vehicle_name ?? "")} required /></label>
              <label>Vehicle Type<input name="vehicleType" defaultValue={String(editingVehicle?.vehicle_type ?? "")} /></label>
              <label>Vehicle Plate Number *<input name="vehiclePlateNumber" defaultValue={String(editingVehicle?.vehicle_plate_number ?? "")} required /></label>
              {showVehicleStatus ? <>
                <label>Driver Name<input name="driverName" defaultValue={String(editingVehicle?.driver_name ?? "")} /></label>
                <label>Phone No<input name="phoneNo" defaultValue={String(editingVehicle?.phone_no ?? "")} /></label>
                <label className="vehicle-status-field">Status<select name="status" defaultValue={String(editingVehicle?.status ?? "Free")}><option>Free</option><option>Busy</option></select></label>
              </> : <label>Department<input name="department" defaultValue={String(editingVehicle?.department ?? "")} /></label>}
            </div>
            <div className="form-footer">
              <button type="button" onClick={closeVehicleForm}>Cancel</button>
              <button className="primary">{editingVehicle ? "Save changes" : "Save vehicle"}</button>
            </div>
          </form>
        )}
        <section className="employee-filter-card vehicle-filter-card">
          <div className="employee-filter-heading">
            <div><h2>Filter vehicles</h2><p>Search fleet records by vehicle, plate number{showVehicleStatus ? ", driver or phone" : " or department"}.</p></div>
            <button type="button" onClick={() => { setVehicleFilters({ vehicleName: "", vehicleType: "", plateNumber: "", department: "", driverName: "", phoneNo: "", status: "" }); setVehiclePage(1); }}>Clear filters</button>
          </div>
          <div className="employee-filter-grid vehicle-filter-grid">
            <label>Vehicle Name<input value={vehicleFilters.vehicleName} onChange={(e) => updateVehicleFilter("vehicleName", e.target.value)} /></label>
            <label>Vehicle Type<input value={vehicleFilters.vehicleType} onChange={(e) => updateVehicleFilter("vehicleType", e.target.value)} /></label>
            <label>Vehicle Plate Number<input value={vehicleFilters.plateNumber} onChange={(e) => updateVehicleFilter("plateNumber", e.target.value)} /></label>
            {showVehicleStatus ? <>
              <label>Driver Name<input value={vehicleFilters.driverName} onChange={(e) => updateVehicleFilter("driverName", e.target.value)} /></label>
              <label>Phone No<input value={vehicleFilters.phoneNo} onChange={(e) => updateVehicleFilter("phoneNo", e.target.value)} /></label>
              <label className="vehicle-status-field">Status<select value={vehicleFilters.status} onChange={(e) => updateVehicleFilter("status", e.target.value)}><option value="">All statuses</option><option>Free</option><option>Busy</option></select></label>
            </> : <label>Department<input value={vehicleFilters.department} onChange={(e) => updateVehicleFilter("department", e.target.value)} /></label>}
          </div>
        </section>
        <section className="data-card vehicle-list-card">
          {selectedVehicleIds.length > 0 && (
            <div className="vehicle-bulk-toolbar">
              <span>{selectedVehicleIds.length} selected</span>
              <button type="button" onClick={() => setSelectedVehicleIds([])}>Clear selection</button>
              <button type="button" className="danger" onClick={() => setShowVehicleDeleteConfirmation(true)}>Delete selected</button>
            </div>
          )}
          <div className="vehicle-table-scroll">
            {loading ? (
              <div className="loading">Loading vehicle records…</div>
            ) : (
              <table>
              <thead><tr><th className="vehicle-select-cell"><input aria-label="Select all vehicles" type="checkbox" checked={allVisibleVehiclesSelected} onChange={(event) => toggleAllVisibleVehicles(event.target.checked)} /></th><th>Vehicle Name</th><th>Vehicle Type</th><th>Vehicle Plate Number</th>{showVehicleStatus ? <><th>Driver Name</th><th>Phone No</th><th>Status</th></> : <th>Department</th>}<th>Action</th></tr></thead>
              <tbody>
                {pagedVehicleRows.map((vehicle, index) => (
                  <tr key={String(vehicle.id ?? index)}>
                    <td className="vehicle-select-cell"><input aria-label={`Select ${String(vehicle.vehicle_name ?? "vehicle")}`} type="checkbox" checked={selectedVehicleIds.includes(String(vehicle.id))} onChange={(event) => toggleVehicleSelection(String(vehicle.id), event.target.checked)} /></td>
                    <td><b>{String(vehicle.vehicle_name ?? "—")}</b></td>
                    <td>{String(vehicle.vehicle_type ?? "") || "—"}</td>
                    <td>{String(vehicle.vehicle_plate_number ?? "—")}</td>
                    {showVehicleStatus ? <>
                      <td>{String(vehicle.driver_name ?? "") || "—"}</td>
                      <td>{String(vehicle.phone_no ?? "") || "—"}</td>
                      <td><span className={`vehicle-status ${String(vehicle.status ?? "Free").toLowerCase()}`}>{String(vehicle.status ?? "Free")}</span></td>
                    </> : <td>{String(vehicle.department ?? "") || "—"}</td>}
                    <td><button type="button" className="vehicle-edit-button" onClick={() => { setEditingVehicle(vehicle); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
              </table>
            )}
            {!loading && filteredVehicleRows.length === 0 && <div className="loading">No vehicle records match the selected filters.</div>}
          </div>
          {!loading && filteredVehicleRows.length > 0 && (
            <div className="employee-pagination">
              <div>
                Showing {(currentVehiclePage - 1) * vehiclePageSize + 1}–{Math.min(currentVehiclePage * vehiclePageSize, filteredVehicleRows.length)} of {filteredVehicleRows.length} vehicles
              </div>
              <div className="pagination-controls">
                <label>
                  Rows
                  <select value={vehiclePageSize} onChange={(event) => { setVehiclePageSize(Number(event.target.value)); setVehiclePage(1); }}>
                    <option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option>
                  </select>
                </label>
                <button type="button" disabled={currentVehiclePage === 1} onClick={() => setVehiclePage((value) => Math.max(1, value - 1))}>Previous</button>
                <span>Page</span>
                <input aria-label="Vehicle page number" type="number" min="1" max={vehicleTotalPages} value={currentVehiclePage} onChange={(event) => setVehiclePage(Math.min(vehicleTotalPages, Math.max(1, Number(event.target.value) || 1)))} />
                <span>of {vehicleTotalPages}</span>
                <button type="button" disabled={currentVehiclePage === vehicleTotalPages} onClick={() => setVehiclePage((value) => Math.min(vehicleTotalPages, value + 1))}>Next</button>
              </div>
            </div>
          )}
        </section>
        {showVehicleDeleteConfirmation && <VehicleDeleteDialog count={selectedVehicleIds.length} onCancel={() => setShowVehicleDeleteConfirmation(false)} onConfirm={deleteSelectedVehicles} />}
      </div>
    );
  }
  if(page==="My Requests"){
    const detail=selectedCorporateRequest as {request?:Record<string,unknown>;steps?:(Record<string,unknown>&{acted_at?:string|null})[];attachments?:Record<string,unknown>[]} | null;
    const request=detail?.request;
    const steps=(detail?.steps??[]).map(step=>String(request?.status)==='rejected'&&!step.action&&Number(step.step_order)>Number(request?.current_step)?{...step,action:'Process Terminated'}:step);
    const detailFields=corporateRequestDetailFields(request);
    return <>
      <div className="page-title"><div><p>REQUEST HISTORY</p><h1>My Requests</h1><span>Track every request you have submitted and review its current approval status.</span></div></div>
      <section className="data-card my-request-list"><table><thead><tr><th>Request ID</th><th>Submission Date</th><th>Type</th><th>Description</th><th>Status</th></tr></thead><tbody>{listRows.map((row,index)=><tr key={String(row.id??index)} className={String(request?.id)===String(row.id)?'selected':''} onClick={()=>selectMyRequest(row)}><td><b>{corporateRequestId(row)}</b></td><td>{new Date(String(row.created_at)).toLocaleDateString()}</td><td>{requestFormName(row.request_type)}</td><td>{String(row.description??row.title??'—')}</td><td><span className={`pill ${String(row.status)}`}>{String(row.status)==="pending"&&row.pending_with?`Pending with ${String(row.pending_with)}`:String(row.status)}</span></td></tr>)}</tbody></table>{!loading&&!listRows.length&&<div className="loading">You have not submitted any requests yet.</div>}</section>
      {request&&<section className="my-request-detail"><header><div><p>{requestFormName(request.request_type).toUpperCase()} DETAILS</p><h2>{corporateRequestId(request)}</h2></div><button onClick={()=>setSelectedCorporateRequest(null)}>×</button></header><div className="my-request-summary">{detailFields.filter(field=>field.className!=="assigned-vehicle").map(field=><div key={field.label} className={field.className}><small>{field.label}</small><b>{field.value}</b></div>)}{detailFields.some(field=>field.className==="assigned-vehicle")&&<section className="assigned-vehicle-information"><h3>Assigned Vehicle Information</h3><div className="assigned-vehicle-grid">{detailFields.filter(field=>field.className==="assigned-vehicle").map(field=><div key={field.label}><small>{field.label}</small><b>{field.value}</b></div>)}</div></section>}</div>{steps.length>0&&<div className="my-request-status-cards">{steps.map(step=><article key={String(step.step_order)}><h3>{String(step.step_name)} Status</h3><strong className={step.action?String(step.action):Number(step.step_order)===Number(request.current_step)?'pending':'upcoming'}>{step.action?String(step.action):Number(step.step_order)===Number(request.current_step)?'Pending':'Waiting'}</strong><h4>{String(step.step_name)} Name</h4><p>{String(step.approver_name??'Not assigned')}</p>{step.acted_at&&<small>{new Date(String(step.acted_at)).toLocaleString()}</small>}{Boolean(step.comment)&&<div className="approval-step-comment"><small>Comment</small><p>{String(step.comment)}</p></div>}</article>)}</div>}{Boolean(detail.attachments?.length)&&<div className="my-request-files"><h3>Attachments</h3>{detail.attachments?.map(file=><button key={String(file.id)} onClick={()=>openCorporateAttachment(request.id,file)}>↗ {String(file.original_name)}</button>)}</div>}</section>}
    </>
  }
  if (corporateApprovalType[page]) {
    const detail=selectedCorporateRequest as {request?:(Record<string,unknown>&{details?:never});steps?:(Record<string,unknown>&{acted_at?:string|null})[];attachments?:Record<string,unknown>[];canAct?:boolean} | null;
    const request=detail?.request;const steps=detail?.steps??[];const currentStep=Number(request?.current_step??1);const detailFields=corporateRequestDetailFields(request);
    return <>
      <div className="page-title"><div><p>CORPORATE APPROVAL</p><h1>{page}</h1><span>Select a request to view its details and approval journey.</span></div></div>
      <div className={`corporate-approval-layout${detail?' detail-open':''}`}>
        <section className="data-card corporate-approval-list"><table><thead><tr><th>Reference</th><th>Employee</th><th>Request</th><th>Amount</th><th>Status</th></tr></thead><tbody>{listRows.map((row,index)=><tr key={String(row.id??index)} className={String(request?.id)===String(row.id)?'selected':''} onClick={()=>selectCorporateRequest(row.id)}><td><b>{corporateRequestId(row)}</b><small>{new Date(String(row.created_at)).toLocaleDateString()}</small></td><td>{String(row.employee_name)}</td><td>{String(row.purpose)}</td><td>{Number(row.amount).toLocaleString()} {String(row.currency)}</td><td><span className={`pill ${String(row.status)}`}>{String(row.status)}</span></td></tr>)}</tbody></table>{!loading&&!listRows.length&&<div className="loading">No payment requests assigned to you or submitted by you.</div>}</section>
        {detail&&request&&<aside className="corporate-request-detail">
          <header><div><p>REQUEST DETAILS</p><h2>{corporateRequestId(request)}</h2><span>{String(request.employee_name)} · {String(request.employee_no)}</span></div><button onClick={()=>setSelectedCorporateRequest(null)}>×</button></header>
          <div className="request-detail-grid">
            {detailFields.map(field=><div key={field.label} className={field.className==="description"?"wide":undefined}><small>{field.label}</small><b>{field.value}</b></div>)}
          </div>
          <section className="approval-journey"><h3>Approval journey</h3>{steps.map((step,index)=>{const order=Number(step.step_order);const state=step.action?String(step.action):order===currentStep&&request.status==='pending'?'current':order>currentStep?'upcoming':'completed';return <article className={state} key={order}><i>{step.action==='approved'?'✓':step.action==='rejected'?'×':order}</i><div><b>{String(step.step_name)}</b><span>{String(step.approver_name??'Approver not assigned')}</span>{step.acted_at&&<small>{new Date(String(step.acted_at)).toLocaleString()}</small>}{Boolean(step.comment)&&<small className="approval-step-comment">Comment: {String(step.comment)}</small>}</div><em>{state==='current'?'Waiting for approval':state==='upcoming'?'Next approver':String(step.action??'Completed')}</em>{index<steps.length-1&&<u/>}</article>})}</section>
          {Boolean(detail.attachments?.length)&&<section className="detail-attachments"><h3>Attachments</h3>{detail.attachments?.map(file=><button type="button" key={String(file.id)} onClick={()=>openCorporateAttachment(request.id,file)}><span>↗</span><div><b>{String(file.original_name)}</b><small>{String(file.mime_type)} · {(Number(file.file_size)/1024).toFixed(1)} KB</small></div></button>)}</section>}
          {detail.canAct&&<footer className="corporate-approval-actions"><button className="reject" onClick={()=>setCorporateConfirmation({id:String(request.id),action:'rejected',name:corporateRequestId(request)})}>Reject</button><button className="approve" onClick={()=>setCorporateConfirmation({id:String(request.id),action:'approved',name:corporateRequestId(request)})}>Approve</button></footer>}
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
          <form ref={paymentRequestFormRef} className="employee-form payment-request-form" onSubmit={createCorporate}>
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
            <div className="form-footer"><button type="button" onClick={() => setShowForm(false)}>Cancel</button><button type="button" className="primary" onClick={(event)=>{const form=event.currentTarget.form;if(!form?.reportValidity())return;paymentRequestFormRef.current=form;setShowPaymentSubmitConfirmation(true)}}>Submit Payment Request</button></div>
          </form>
          ) : page === "Vehicle Request Form" ? (
          <div className="vehicle-request-layout">
            <form ref={paymentRequestFormRef} className="employee-form payment-request-form vehicle-request-form" onSubmit={createCorporate}>
              <div className="payment-form-heading"><div><p>VEHICLE REQUEST</p><h2>New Vehicle Request</h2><span>Complete the required trip information and submit it for approval.</span></div><button type="button" onClick={() => setShowForm(false)}>×</button></div>
              <fieldset><legend>Requester information</legend><div className="form-grid vehicle-requester-grid">
                <label>Submission Date<input value={formatDateDDMMYYYY(new Date())} readOnly /></label>
                <label>Requester Name<input value={`${String(paymentProfile.first_name ?? "")} ${String(paymentProfile.last_name ?? "")}`.trim()} readOnly /></label>
                <label>Employee ID<input value={String(paymentProfile.employee_no ?? "")} readOnly /></label>
                <label>Department<input value={String(paymentProfile.department ?? "")} readOnly /></label>
              </div></fieldset>
              <fieldset><legend>Trip information</legend><div className="form-grid vehicle-trip-grid">
                <label>Number of Passengers *<input name="numberOfPassengers" type="number" min="1" step="1" required /></label>
                <label>Go *<input name="goDate" type="date" required /></label>
                <label>Return *<input name="returnDate" type="date" required /></label>
                <label>Out *<select name="outTime" required><option value="">Select time</option>{vehicleTimeOptions.map((time) => <option key={time.value} value={time.value}>{time.label}</option>)}</select></label>
                <label>In *<select name="inTime" required><option value="">Select time</option>{vehicleTimeOptions.map((time) => <option key={time.value} value={time.value}>{time.label}</option>)}</select></label>
                <label>Requested Vehicle Type *<select name="requestedVehicleType" required><option value="">Select vehicle type</option><option>Any</option><option>Saloon</option></select></label>
                <label className="span-2">Activities (Destination) *<textarea name="activities" rows={5} required /></label>
                <label>Remark<textarea name="remark" rows={5} /></label>
                <label className="wide payment-attachments">Attachments<input name="attachments" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" /><small>Up to 5 files, maximum 10 MB each.</small></label>
              </div></fieldset>
              <div className="payment-approval-note"><b>Approval workflow</b><span>Department Head Approver → Transportation Supervisor</span><small>Department Head is auto assigned from requester Report To.</small></div>
              <div className="form-footer"><button type="button" onClick={() => setShowForm(false)}>Cancel</button><button type="button" className="primary" onClick={(event)=>{const form=event.currentTarget.form;if(!form?.reportValidity())return;paymentRequestFormRef.current=form;setShowPaymentSubmitConfirmation(true)}}>Submit Vehicle Request</button></div>
            </form>
            <aside className="vehicle-request-side-list">
              <div><p>INTERNAL VEHICLES</p><h3>Vehicle Management (Internal)</h3><span>Reference list for requester visibility.</span></div>
              <div className="vehicle-request-vehicle-table">
                {internalVehicles.length ? internalVehicles.map((vehicle, index) => (
                  <article key={String(vehicle.id ?? index)}>
                    <div><b>{String(vehicle.vehicle_name ?? "—")}</b><small>{String(vehicle.vehicle_plate_number ?? "—")} · {String(vehicle.vehicle_type ?? "—")}</small></div>
                    <span className={`vehicle-status ${String(vehicle.status ?? "Free").toLowerCase()}`}>{String(vehicle.status ?? "Free")}</span>
                  </article>
                )) : <div className="loading">No internal vehicles found.</div>}
              </div>
            </aside>
          </div>
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
                {page === "Vehicle Request Form" ? (
                  <tr>
                    <th>Request ID</th>
                    <th>Submission Date</th>
                    <th>Requester Name</th>
                    <th>Department</th>
                    <th>Go</th>
                    <th>Return</th>
                    <th>Out</th>
                    <th>In</th>
                    <th>Activities (Destination)</th>
                    <th>Status</th>
                  </tr>
                ) : (
                  <tr>
                    <th>Request ID</th>
                    <th>Submission Date</th>
                    <th>Requestor Name</th>
                    <th>Pay To</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {listRows.map((r, i) => (
                  <tr key={String(r.id ?? i)}>
                    {page === "Vehicle Request Form" ? (
                      <>
                        <td><b>{corporateRequestId(r, "vehicle_request")}</b></td>
                        <td>{formatDateDDMMYYYY(new Date(String(r.request_date ?? r.submission_date ?? r.created_at)))}</td>
                        <td>{String(r.employee_name ?? r.requester_name ?? "—")}</td>
                        <td>{String(r.employee_department ?? r.department ?? "—")}</td>
                        <td>{textValue(requestDetails(r).goDate)}</td>
                        <td>{textValue(requestDetails(r).returnDate)}</td>
                        <td>{textValue(requestDetails(r).outTime)}</td>
                        <td>{textValue(requestDetails(r).inTime)}</td>
                        <td className="request-description-cell">{String(r.purpose ?? "—")}</td>
                        <td><span className={`pill ${String(r.status)}`}>{String(r.status)==="pending"&&r.pending_with?`Pending with ${String(r.pending_with)}`:String(r.status)}</span></td>
                      </>
                    ) : (
                      <>
                    <td>
                      <b>{String(r.reference_no)}</b>
                    </td>
                    <td>{formatDateDDMMYYYY(new Date(String(r.request_date ?? r.submission_date ?? r.created_at)))}</td>
                    <td>{String(r.employee_name ?? r.requester_name ?? "—")}</td>
                    <td>{String(r.payee ?? "—")}</td>
                    <td>{String(r.purpose)}</td>
                    <td>
                      {Number(r.amount).toLocaleString()} {String(r.currency)}
                    </td>
                    <td>
                      <span className={`pill ${String(r.status)}`}>
                        {String(r.status)==="pending"&&r.pending_with?`Pending with ${String(r.pending_with)}`:String(r.status)}
                      </span>
                    </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        {showPaymentSubmitConfirmation&&<div className="confirm-backdrop" onMouseDown={()=>setShowPaymentSubmitConfirmation(false)}><div className="confirm-dialog" onMouseDown={event=>event.stopPropagation()}><div className="confirm-icon approve">✓</div><h2>{page==="Vehicle Request Form"?"Submit vehicle request?":"Submit payment request?"}</h2><p>{page==="Vehicle Request Form"?"Please confirm that the vehicle request information is correct before submitting it for approval.":"Please confirm that the payment request information is correct before submitting it for approval."}</p><div><button type="button" onClick={()=>setShowPaymentSubmitConfirmation(false)}>Cancel</button><button type="button" className="confirm-approve" onClick={()=>{setShowPaymentSubmitConfirmation(false);paymentSubmitConfirmedRef.current=true;paymentRequestFormRef.current?.requestSubmit()}}>Yes, submit</button></div></div></div>}
      </>
    );
  if(page==="Banner"){
    const banner=(!Array.isArray(rows)&&rows&&typeof rows==='object'?rows:{}) as Record<string,unknown>;const logoUrl=String(banner.logoUrl??'');return <><div className="page-title"><div><p>GENERAL SETTING</p><h1>Navigation Banner</h1><span>Customize the company logo and text displayed at the top of the navigation.</span></div></div><section className="banner-settings-layout"><form className="banner-settings-card" onSubmit={saveBanner}><h2>Banner content</h2><input type="hidden" name="existingLogo" value={logoUrl}/><label>Company logo<input className="banner-file-input" name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"/><small>PNG, JPG, WEBP or GIF · maximum 10 MB</small></label><label>Icon / Logo text<input name="iconText" maxLength={3} defaultValue={String(banner.iconText??'CP')} required /><small>Used when no company logo is uploaded.</small></label><label>Portal title<input name="title" maxLength={50} defaultValue={String(banner.title??'Company Portal')} required /></label><label>Subtitle<input name="subtitle" maxLength={80} defaultValue={String(banner.subtitle??'People & Operations')} required /></label><label>Icon color<input name="iconColor" type="color" defaultValue={String(banner.iconColor??'#6d5ce7')} /></label>{logoUrl&&<label className="banner-remove-logo"><input name="removeLogo" type="checkbox"/> Remove current company logo</label>}<div><button className="primary">Save banner</button></div></form><section className="banner-preview-card"><p>LIVE PREVIEW</p><div className="banner-preview">{logoUrl?<span className="logo-image"><img src={`${API}${logoUrl}`} alt="Company logo"/></span>:<span style={{background:String(banner.iconColor??'#6d5ce7')}}>{String(banner.iconText??'CP')}</span>}<div><b>{String(banner.title??'Company Portal')}</b><small>{String(banner.subtitle??'People & Operations')}</small></div></div></section></section>{roleSaveNotice&&<div className={`role-save-popup ${roleSaveNotice.type}`}><span>{roleSaveNotice.type==='success'?'✓':'!'}</span><div><b>{roleSaveNotice.type==='success'?'Saved successfully':'Save failed'}</b><small>{roleSaveNotice.message}</small></div><button onClick={()=>setRoleSaveNotice(null)}>×</button></div>}</>
  }
  if(page==="Approval Setup"){
    const setup=(!Array.isArray(rows)&&rows&&typeof rows==='object'?rows:{}) as {steps?:Record<string,unknown>[];users?:Record<string,unknown>[]};
    const workflows:{type:"payment"|"advance_clearance"|"vehicle_request";title:string;short:string;steps:string[]}[]=[
      {type:"payment",title:"Payment Request Form",short:"PAY",steps:["Department Head Approver","Finance Approver","Cashier"]},
      {type:"advance_clearance",title:"Advance Clearance Request",short:"ADV",steps:["Department Head Approver","Finance Approver","Cashier"]},
      {type:"vehicle_request",title:"Vehicle Request Form",short:"VEH",steps:["Department Head Approver","Transportation Supervisor"]},
    ];
    return <><div className="page-title"><div><p>USERS & ROLES</p><h1>Approval Setup</h1><span>Assign approvers for each corporate request workflow.</span></div></div><div className="approval-setup-grid">{workflows.map((workflow)=><form className="approval-workflow-card" key={workflow.type} onSubmit={(event)=>saveApprovalWorkflow(event,workflow.type,workflow.steps)}><header><span>{workflow.short}</span><div><h2>{workflow.title}</h2><p>{workflow.steps.length}-step approval workflow</p></div></header><div className="workflow-steps">{workflow.steps.map((name,index)=>{const step=setup.steps?.find(item=>item.request_type===workflow.type&&Number(item.step_order)===index+1);const isDynamicDepartmentHead=name==="Department Head Approver"&&index===0;return <label key={name}><i>{index+1}</i><div><b>{name}</b>{isDynamicDepartmentHead?<><input type="hidden" name={`step-${index+1}`} value=""/><span className="dynamic-approver-badge">Auto from requester Report To</span></>:<SearchableApproverSelect name={`step-${index+1}`} users={setup.users??[]} defaultValue={String(step?.approver_user_id??'')} />}</div>{index<workflow.steps.length-1&&<em>›</em>}</label>})}</div><footer><button className="primary">Save workflow</button></footer></form>)}</div>{roleSaveNotice&&<div className={`role-save-popup ${roleSaveNotice.type}`}><span>{roleSaveNotice.type==='success'?'✓':'!'}</span><div><b>{roleSaveNotice.type==='success'?'Saved successfully':'Save failed'}</b><small>{roleSaveNotice.message}</small></div><button onClick={()=>setRoleSaveNotice(null)}>×</button></div>}</>
  }
  if (page === "Role Access Control") {
    const roles = roleOptions;
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
                  <th key={role.role_key}>{role.role_name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissionMenuItems.map((menu) => (
                <tr key={menu.key} className={`permission-level-${menu.level}`}>
                  <td>
                    <b>{menu.key}</b>
                  </td>
                  {roles.map((roleOption) => {
                    const role = roleOption.role_key;
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
      ["branch", "Branch"],
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
                onClick={() => {
                  const opensMyRequests = r.resource_type === "corporate_request";
                  if (!r.read_at) void markRead(r.id, !opensMyRequests);
                  if (opensMyRequests) onNavigate?.("My Requests");
                }}
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
                  <button onClick={(event) => { event.stopPropagation(); void markRead(r.id); }}>Mark as read</button>
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
          {canManageAnnouncements && (
            <button className="primary" onClick={() => setShowForm(true)}>
              ＋ New announcement
            </button>
          )}
        </div>
        {showForm && canManageAnnouncements && (
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
              <article key={String(r.id ?? i)} onClick={()=>setSelectedAnnouncement(r)}>
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
        {selectedAnnouncement&&<div className="announcement-detail-backdrop" onMouseDown={()=>setSelectedAnnouncement(null)}><section className="announcement-detail-dialog" onMouseDown={event=>event.stopPropagation()}><header><div><small>ANNOUNCEMENT</small><h2>{String(selectedAnnouncement.title)}</h2><p>Published {formatDateTimeAMPM(new Date(String(selectedAnnouncement.published_at??selectedAnnouncement.created_at)))}</p></div><button onClick={()=>setSelectedAnnouncement(null)}>×</button></header><div className="announcement-detail-content"><p>{String(selectedAnnouncement.body)}</p>{Array.isArray(selectedAnnouncement.attachments)&&selectedAnnouncement.attachments.length>0&&<div className="announcement-detail-files">{(selectedAnnouncement.attachments as Record<string,unknown>[]).map(file=><AnnouncementThumbnail key={String(file.id)} announcementId={selectedAnnouncement.id} attachment={file} token={token}/>)}</div>}</div></section></div>}
      </>
    );
  if(page==="Payment Request Report"){
    const departments=[...new Set(listRows.map(row=>String(row.department??"")).filter(Boolean))].sort();
    const filtered=listRows.filter(row=>{
      const created=String(row.submission_date??"").slice(0,10),search=paymentReportFilters.search.trim().toLowerCase();
      return (!paymentReportFilters.from||created>=paymentReportFilters.from)&&(!paymentReportFilters.to||created<=paymentReportFilters.to)&&
        (!paymentReportFilters.status||String(row.status)===paymentReportFilters.status)&&(!paymentReportFilters.department||String(row.department)===paymentReportFilters.department)&&
        (!search||[row.reference_no,row.employee_no,row.requestor_name,row.pay_to,row.description].some(value=>String(value??"").toLowerCase().includes(search)));
    });
    const paymentReportTotalPages=Math.max(1,Math.ceil(filtered.length/paymentReportPageSize));
    const currentPaymentReportPage=Math.min(paymentReportPage,paymentReportTotalPages);
    const pagedPaymentReportRows=filtered.slice((currentPaymentReportPage-1)*paymentReportPageSize,currentPaymentReportPage*paymentReportPageSize);
    const totalAmount=filtered.reduce((sum,row)=>sum+Number(row.amount??0),0);
    const statusCount=(status:string)=>filtered.filter(row=>String(row.status)===status).length;
    const paymentReportStatusLabel=(row:Record<string,unknown>)=>{
      const status=String(row.status);
      if(status==="approved")return "Completed";
      if(status==="pending")return `Pending with ${String(row.pending_with??"Not assigned")}`;
      return status.charAt(0).toUpperCase()+status.slice(1);
    };
    const paymentReportStatusClass=(row:Record<string,unknown>)=>String(row.status)==="approved"?"approved":String(row.status);
    const chartColors=["#6755dc","#25a77d","#e7942f","#3380d8","#de5f73","#8b67d8"];
    type PaymentChartItem={name:string;count:number;amount:number};
    const aggregateBy=(key:"payment_type"|"department"):PaymentChartItem[]=>{
      const groups:Record<string,PaymentChartItem>={};
      for(const row of filtered){const name=String(row[key]??"Unknown")||"Unknown";const item=groups[name]??{name,count:0,amount:0};item.count+=1;item.amount+=Number(row.amount??0);groups[name]=item}
      return Object.values(groups).sort((a,b)=>b.count-a.count||b.amount-a.amount);
    };
    const paymentTypeChart=aggregateBy("payment_type"),departmentChart=aggregateBy("department");
    const monthLabels=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const monthlyPaymentTypes=monthLabels.map((label,index)=>{
      const rows=filtered.filter(row=>{const date=new Date(String(row.submission_date));return !Number.isNaN(date.getTime())&&date.getMonth()===index});
      const paymentRows=rows.filter(row=>String(row.payment_type??"").toLowerCase()==="payment");
      const advanceRows=rows.filter(row=>String(row.payment_type??"").toLowerCase()==="advance");
      return {label,paymentCount:paymentRows.length,advanceCount:advanceRows.length,paymentAmount:paymentRows.reduce((sum,row)=>sum+Number(row.amount??0),0),advanceAmount:advanceRows.reduce((sum,row)=>sum+Number(row.amount??0),0)};
    });
    const maxMonthlyPaymentType=Math.max(1,...monthlyPaymentTypes.flatMap(item=>[item.paymentCount,item.advanceCount]));
    const paymentTypeTotals={
      payment:paymentTypeChart.find(item=>item.name.toLowerCase()==="payment")??{name:"Payment",count:0,amount:0},
      advance:paymentTypeChart.find(item=>item.name.toLowerCase()==="advance")??{name:"Advance",count:0,amount:0},
    };
    const currentMonth=new Date();
    const currentMonthRows=filtered.filter(row=>{const date=new Date(String(row.submission_date));return !Number.isNaN(date.getTime())&&date.getFullYear()===currentMonth.getFullYear()&&date.getMonth()===currentMonth.getMonth()});
    const aggregateAmount=(rows:Record<string,unknown>[],nameOf:(row:Record<string,unknown>)=>string)=>{
      const groups:Record<string,{name:string;count:number;amount:number;currency:string}>={};
      for(const row of rows){const currency=String(row.currency??"MMK");const name=nameOf(row);const key=`${name}::${currency}`;const item=groups[key]??{name,count:0,amount:0,currency};item.count+=1;item.amount+=Number(row.amount??0);groups[key]=item}
      return Object.values(groups).sort((a,b)=>b.amount-a.amount||b.count-a.count);
    };
    const currentMonthCurrencyTotals=aggregateAmount(currentMonthRows,row=>String(row.currency??"MMK"));
    const currentMonthTypeTotals=aggregateAmount(currentMonthRows,row=>String(row.payment_type??"Unknown")||"Unknown");
    let chartProgress=0;
    const donutGradient=paymentTypeChart.length?paymentTypeChart.map((item,index)=>{const start=chartProgress;chartProgress+=item.count/Math.max(filtered.length,1)*100;return `${chartColors[index%chartColors.length]} ${start}% ${chartProgress}%`}).join(","):"#e8ebf1 0 100%";
    const departmentMax=Math.max(...departmentChart.map(item=>item.count),1);
    return <>
      <div className="page-title payment-report-title"><div><p>CORPORATE SERVICES</p><h1>Payment Request Report</h1><span>Review payment requests, approval progress and financial totals.</span></div><button className="primary" onClick={()=>downloadReport("payment_requests")}>Export Excel ↓</button></div>
      <section className="payment-report-charts">
        <article className="current-month-amount-card"><header><div><h2>This Month Total Amount</h2><p>By currency and payment type</p></div></header><div className="current-month-amount"><div className="amount-head"><i>$</i><div><small>{currentMonth.toLocaleString("en-US",{month:"long",year:"numeric"})}</small><strong>{currentMonthRows.length} requests</strong></div></div><div className="amount-breakdown"><h3>Currency Type</h3>{currentMonthCurrencyTotals.length?currentMonthCurrencyTotals.map(item=><div key={`${item.name}-${item.currency}`}><span>{item.currency}</span><b>{item.amount.toLocaleString()} {item.currency}</b></div>):<p>No amount this month.</p>}</div><div className="amount-breakdown"><h3>Payment Type</h3>{currentMonthTypeTotals.length?currentMonthTypeTotals.slice(0,5).map(item=><div key={`${item.name}-${item.currency}`}><span>{item.name}</span><b>{item.amount.toLocaleString()} {item.currency}</b></div>):<p>No payment type data.</p>}</div></div></article>
        <article className="monthly-type-card"><header><div><h2>Monthly Payment Type</h2><p>Payment and Advance requests by submission month</p></div></header><div className="payment-month-chart"><div className="payment-month-plot">{monthlyPaymentTypes.map(item=><div className="payment-month-column" key={item.label}><div className="payment-month-bars"><span className="payment" title={`${item.label} Payment: ${item.paymentCount} requests · ${item.paymentAmount.toLocaleString()}`} style={{height:`${item.paymentCount?Math.max(12,item.paymentCount/maxMonthlyPaymentType*100):0}%`}}/><span className="advance" title={`${item.label} Advance: ${item.advanceCount} requests · ${item.advanceAmount.toLocaleString()}`} style={{height:`${item.advanceCount?Math.max(12,item.advanceCount/maxMonthlyPaymentType*100):0}%`}}/></div><small>{item.label}</small></div>)}</div><div className="payment-month-legend"><div><i className="payment"/><span><b>Payment</b><small>{paymentTypeTotals.payment.count} requests · {paymentTypeTotals.payment.amount.toLocaleString()}</small></span></div><div><i className="advance"/><span><b>Advance</b><small>{paymentTypeTotals.advance.count} requests · {paymentTypeTotals.advance.amount.toLocaleString()}</small></span></div></div></div></article>
        <article><header><div><h2>Requests by Payment Type</h2><p>Distribution of submitted payment requests</p></div></header><div className="payment-type-chart"><div className="payment-donut" style={{background:`conic-gradient(${donutGradient})`}}><span><b>{filtered.length}</b><small>Requests</small></span></div><div className="payment-chart-legend">{paymentTypeChart.map((item,index)=><div key={item.name}><i style={{background:chartColors[index%chartColors.length]}}/><span><b>{item.name}</b><small>{item.count} requests · {item.amount.toLocaleString()}</small></span><strong>{filtered.length?Math.round(item.count/filtered.length*100):0}%</strong></div>)}</div></div></article>
        <article><header><div><h2>Top Requesting Departments</h2><p>Departments ranked by number of requests</p></div></header><div className="department-chart">{departmentChart.slice(0,6).map((item,index)=><div key={item.name}><div><span><i>{index+1}</i><b>{item.name}</b></span><strong>{item.count} requests</strong></div><div className="department-chart-track"><i style={{width:`${item.count/departmentMax*100}%`,background:chartColors[index%chartColors.length]}}/></div><small>{item.amount.toLocaleString()} total amount</small></div>)}{!departmentChart.length&&<p className="chart-empty">No payment request data available.</p>}</div></article>
      </section>
      <div className="payment-report-summary">
        <article><small>Total Requests</small><strong>{filtered.length}</strong><span>Filtered records</span></article>
        <article><small>Pending</small><strong>{statusCount("pending")}</strong><span>Awaiting approval</span></article>
        <article><small>Completed</small><strong>{statusCount("approved")}</strong><span>Finished approvals</span></article>
        <article><small>Rejected</small><strong>{statusCount("rejected")}</strong><span>Declined requests</span></article>
        <article><small>Total Amount</small><strong>{totalAmount.toLocaleString()}</strong><span>Across currencies</span></article>
      </div>
      <section className="payment-report-filters"><div><h2>Filter report</h2><button onClick={()=>{setPaymentReportFilters({from:"",to:"",status:"",department:"",search:""});setPaymentReportPage(1)}}>Clear filters</button></div>
        <div className="payment-report-filter-grid">
          <label>From Date<input type="date" value={paymentReportFilters.from} onChange={e=>updatePaymentReportFilter({from:e.target.value})}/></label>
          <label>To Date<input type="date" value={paymentReportFilters.to} onChange={e=>updatePaymentReportFilter({to:e.target.value})}/></label>
          <label>Status<select value={paymentReportFilters.status} onChange={e=>updatePaymentReportFilter({status:e.target.value})}><option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
          <label>Department<select value={paymentReportFilters.department} onChange={e=>updatePaymentReportFilter({department:e.target.value})}><option value="">All departments</option>{departments.map(department=><option key={department}>{department}</option>)}</select></label>
          <label className="report-search">Search<input placeholder="Request ID, employee, pay to or description" value={paymentReportFilters.search} onChange={e=>updatePaymentReportFilter({search:e.target.value})}/></label>
        </div>
      </section>
      <section className="data-card payment-report-table"><table><thead><tr><th>Request ID</th><th>Submission Date</th><th>Requestor</th><th>Department</th><th>Business Unit</th><th>Payment Type</th><th>Pay To</th><th>Amount</th><th>Currency Type</th><th>Status</th></tr></thead><tbody>{pagedPaymentReportRows.map(row=><tr key={String(row.id)}><td><b>{String(row.reference_no)}</b></td><td>{new Date(String(row.submission_date)).toLocaleDateString()}</td><td><b>{String(row.requestor_name)}</b><small>{String(row.employee_no)}</small></td><td>{String(row.department??"—")}</td><td>{String(row.business_unit??"—")}</td><td>{String(row.payment_type??"—")}</td><td>{String(row.pay_to??"—")}</td><td><b>{Number(row.amount??0).toLocaleString()}</b></td><td>{String(row.currency??"—")}</td><td><span className={`pill ${paymentReportStatusClass(row)}`}>{paymentReportStatusLabel(row)}</span></td></tr>)}</tbody></table>{!loading&&!filtered.length&&<div className="loading">No payment requests match the selected filters.</div>}{filtered.length>0&&<div className="employee-pagination"><div>Showing {(currentPaymentReportPage-1)*paymentReportPageSize+1}–{Math.min(currentPaymentReportPage*paymentReportPageSize,filtered.length)} of {filtered.length} requests</div><div className="pagination-controls"><label>Rows<select value={paymentReportPageSize} onChange={event=>{setPaymentReportPageSize(Number(event.target.value));setPaymentReportPage(1)}}><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label><button disabled={currentPaymentReportPage===1} onClick={()=>setPaymentReportPage(value=>Math.max(1,value-1))}>Previous</button><span>Page</span><input aria-label="Payment report page number" type="number" min="1" max={paymentReportTotalPages} value={currentPaymentReportPage} onChange={event=>setPaymentReportPage(Math.min(paymentReportTotalPages,Math.max(1,Number(event.target.value)||1)))}/><span>of {paymentReportTotalPages}</span><button disabled={currentPaymentReportPage===paymentReportTotalPages} onClick={()=>setPaymentReportPage(value=>Math.min(paymentReportTotalPages,value+1))}>Next</button></div></div>}</section>
    </>;
  }
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
        <div className="page-title users-management-title">
          <div>
            <p>ACCESS CONTROL</p>
            <h1>Users & Roles</h1>
            <span>Manage system access and permissions</span>
          </div>
          <button type="button" className="primary create-role-button" onClick={() => setShowCreateRole(true)}>
            + Create New User Role
          </button>
        </div>
        <section className="employee-filter-card users-filter-card">
          <div className="employee-filter-heading">
            <div><h2>Filter users</h2><p>Search user accounts by employee information and role.</p></div>
            <button type="button" onClick={() => { setUserFilters({ employeeNo: "", name: "", position: "", department: "", organization: "", projectLocation: "", reportTo: "", role: "" }); setUserPage(1); }}>Clear filters</button>
          </div>
          <div className="employee-filter-grid">
            <label>Employee ID<input value={userFilters.employeeNo} onChange={(event) => updateUserFilter("employeeNo", event.target.value)} /></label>
            <label>Employee Name<input value={userFilters.name} onChange={(event) => updateUserFilter("name", event.target.value)} /></label>
            <label>Position<input value={userFilters.position} onChange={(event) => updateUserFilter("position", event.target.value)} /></label>
            <label>Department<input value={userFilters.department} onChange={(event) => updateUserFilter("department", event.target.value)} /></label>
            <label>Organization<input value={userFilters.organization} onChange={(event) => updateUserFilter("organization", event.target.value)} /></label>
            <label>Project Location<input value={userFilters.projectLocation} onChange={(event) => updateUserFilter("projectLocation", event.target.value)} /></label>
            <label>Report To<input value={userFilters.reportTo} onChange={(event) => updateUserFilter("reportTo", event.target.value)} /></label>
            <label>Role<select value={userFilters.role} onChange={(event) => updateUserFilter("role", event.target.value)}><option value="">All roles</option>{roleOptions.map((option) => <option key={option.role_key} value={option.role_key}>{option.role_name}</option>)}</select></label>
          </div>
        </section>
        <section className="data-card users-role-card">
          <div className="users-role-table-scroll">
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
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pagedUserRows.map((r, i) => (
                <tr key={String(r.id ?? r.username ?? i)}>
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
                      {!roleOptions.some((option) => option.role_key === String(r.role)) && (
                        <option value={String(r.role)}>{roleLabel(r.role)}</option>
                      )}
                      {roleOptions.map((option) => (
                        <option key={option.role_key} value={option.role_key}>{option.role_name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="username-cell">{String(r.username ?? "—")}</td>
                  <td><button className="reset-password-button" onClick={() => { setResetMessage(""); setResetUser(r); }}>Reset password</button></td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          {filteredUserRows.length > 0 && (
            <div className="employee-pagination">
              <div>
                Showing {(currentUserPage - 1) * userPageSize + 1}–{Math.min(currentUserPage * userPageSize, filteredUserRows.length)} of {filteredUserRows.length} users
              </div>
              <div className="pagination-controls">
                <label>
                  Rows
                  <select value={userPageSize} onChange={(event) => { setUserPageSize(Number(event.target.value)); setUserPage(1); }}>
                    <option value="25">25</option><option value="50">50</option><option value="100">100</option>
                  </select>
                </label>
                <button disabled={currentUserPage === 1} onClick={() => setUserPage((value) => Math.max(1, value - 1))}>Previous</button>
                <span>Page</span>
                <input aria-label="Users page number" type="number" min="1" max={userTotalPages} value={currentUserPage} onChange={(event) => setUserPage(Math.min(userTotalPages, Math.max(1, Number(event.target.value) || 1)))} />
                <span>of {userTotalPages}</span>
                <button disabled={currentUserPage === userTotalPages} onClick={() => setUserPage((value) => Math.min(userTotalPages, value + 1))}>Next</button>
              </div>
            </div>
          )}
        </section>
        {resetUser && (
          <div className="confirm-backdrop" onMouseDown={() => setResetUser(null)}>
            <form className="password-reset-dialog" onSubmit={resetUserPassword} onMouseDown={(event) => event.stopPropagation()}>
              <div className="password-reset-icon">↻</div>
              <h2>Reset Password</h2>
              <p>{String(resetUser.first_name ?? "")} {String(resetUser.last_name ?? "")} · {String(resetUser.username ?? "")}</p>
              <label>New Password<input name="newPassword" type="password" required /></label>
              <label>Confirm Password<input name="confirmPassword" type="password" required /></label>
              {resetMessage && <div className={resetMessage.includes("successfully") ? "reset-success" : "reset-error"}>{resetMessage}</div>}
              <div className="password-reset-actions">
                <button type="button" onClick={() => setResetUser(null)}>Cancel</button>
                <button className="primary">Reset Password</button>
              </div>
            </form>
          </div>
        )}
        {showCreateRole && (
          <div className="confirm-backdrop" onMouseDown={() => setShowCreateRole(false)}>
            <form className="role-create-dialog" onSubmit={askCreateRole} onMouseDown={(event) => event.stopPropagation()}>
              <div className="role-create-icon">+</div>
              <h2>Create New User Role</h2>
              <p>Create a reusable role for Users & Roles and Role Access Control.</p>
              <label>
                Role name
                <input name="roleName" placeholder="e.g. Supervisor" maxLength={80} autoFocus required />
                <small>This role will appear automatically in role dropdowns and access control.</small>
              </label>
              <div className="role-create-actions">
                <button type="button" onClick={() => setShowCreateRole(false)}>Cancel</button>
                <button className="primary">Create</button>
              </div>
            </form>
          </div>
        )}
        {pendingRoleName && (
          <div className="confirm-backdrop role-confirm-backdrop">
            <div className="role-confirm-dialog">
              <div className="role-create-icon">✓</div>
              <h2>Create role?</h2>
              <p>Are you sure you want to create <b>{pendingRoleName}</b> role?</p>
              <div className="role-create-actions">
                <button type="button" onClick={() => setPendingRoleName("")}>No</button>
                <button type="button" className="primary" onClick={confirmCreateRole}>Yes, create</button>
              </div>
            </div>
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
  const approvalDetail=page==="Approvals"?selectedCorporateRequest as {request?:Record<string,unknown>;steps?:Record<string,unknown>[];attachments?:Record<string,unknown>[];canAct?:boolean;canAssignVehicle?:boolean}|null:null;
  const approvalRequest=approvalDetail?.request;
  const approvalDetailFields=corporateRequestDetailFields(approvalRequest);
  const approvalRequestData=requestDetails(approvalRequest);
  const approvalAssignedVehicle=(approvalRequestData.assignedVehicle??{}) as Record<string,unknown>;
  const approvalNeedsVehicle=Boolean(approvalDetail?.canAssignVehicle)&&!approvalAssignedVehicle.id;
  const assignmentVehicleOptions=availableVehicles.filter(vehicle=>{
    const query=vehicleAssignmentSearch.trim().toLowerCase();
    if(!query)return true;
    return [vehicle.vehicle_plate_number,vehicle.vehicle_name,vehicle.driver_name,vehicle.phone_no,vehicle.vehicle_type]
      .some(value=>String(value??"").toLowerCase().includes(query));
  });
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
            <label className="employee-import-mode">Import mode<select value={employeeImportMode} disabled={employeeImporting} onChange={(event) => setEmployeeImportMode(event.target.value as "merge" | "full_sync")}><option value="merge">Merge / Update (Safe)</option><option value="full_sync">Full Sync</option></select></label>
            <button
              onClick={() =>
                downloadExcel("template", "employee-import-template.xlsx")
              }
            >
              ⇩ Excel template
            </button>
            <button disabled={employeeImporting} onClick={() => fileInput.current?.click()}>
              {employeeImporting ? "Importing…" : "⇧ Import Excel"}
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
              onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; if (employeeImportMode === "full_sync") setPendingEmployeeImportFile(file); else void importExcel(file, "merge"); }}
            />
          </div>
        )}
      </div>
      {pendingEmployeeImportFile && <EmployeeFullSyncDialog fileName={pendingEmployeeImportFile.name} importing={employeeImporting} onCancel={() => { setPendingEmployeeImportFile(null); if (fileInput.current) fileInput.current.value = ""; }} onConfirm={() => void importExcel(pendingEmployeeImportFile, "full_sync")} />}
      {importResult && (
        <div
          className={`import-result ${importResult.includes("failed") || importResult.includes("Missing") || importResult.includes("Row ") || importResult.includes("safety stop") ? "error" : ""}`}
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
                Probation Date
                <input name="probationDate" type="date" />
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
                <select name="branch">
                  <option value="">Select Branch</option>
                  {masterItems
                    .filter((item) => item.item_type === "branch")
                    .map((item) => (
                      <option key={String(item.id)}>{String(item.name)}</option>
                    ))}
                </select>
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
          <fieldset>
            <legend>Employee documents</legend>
            <div className="employee-document-grid">
              <label className="employee-document-upload">
                Attachments
                <input
                  name="attachments"
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods,.odp,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.heic,.eml,.msg,.zip,.rar,.7z"
                />
                <small>PDF, Office, OpenDocument, text, CSV, images, email and archive files. Up to 10 files, maximum 20 MB each.</small>
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
      {page === "Employees" && employeeNotice && <div className={`employee-bulk-notice ${employeeNotice.includes("successfully") ? "success" : "error"}`}><span>{employeeNotice}</span><button onClick={() => setEmployeeNotice("")}>×</button></div>}
      <section className={`data-card ${page === "Employees" ? "employee-list-card" : ""}`}>
        {loading ? (
          <div className="loading">Loading database records…</div>
        ) : (
          <>
          {page === "Employees" && selectedEmployeeIds.length > 0 && <div className="employee-bulk-toolbar"><span><b>{selectedEmployeeIds.length}</b> selected</span><div><button onClick={() => setSelectedEmployeeIds([])}>Clear selection</button><button className="danger" onClick={() => setShowEmployeeDeleteConfirmation(true)}>Delete selected</button></div></div>}
          <div className={page === "Employees" ? "employee-table-scroll" : ""}>
          <table>
            <thead>
              <tr>
                {page === "Employees" ? (
                  <>
                    <th className="employee-select-cell"><input type="checkbox" aria-label="Select all filtered employees" checked={allFilteredEmployeesSelected} onChange={(event) => setSelectedEmployeeIds((current) => event.target.checked ? Array.from(new Set([...current, ...filteredEmployeeIds])) : current.filter((id) => !filteredEmployeeIds.includes(id)))} /></th>
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
                  page==="Approvals"?(
                    <>
                      <th>Type</th>
                      <th>Request ID</th>
                      <th>Submission Date</th>
                      <th>Requester Name</th>
                      <th>Department</th>
                      <th>Description</th>
                      <th>Status</th>
                    </>
                  ):(
                    <>
                      <th>Employee</th>
                      <th>Type</th>
                      <th>Request / Description</th>
                      <th>Date</th>
                      <th>{employeeApproval ? "Status" : "Actions"}</th>
                    </>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r, i) => (
                <tr
                  key={String(r.id ?? i)}
                  className={page === "Employees" ? `employee-row${selectedEmployeeIds.includes(String(r.id)) ? " selected" : ""}` : ""}
                  onClick={page === "Employees"?()=>selectEmployee(r.id):page==="Approvals"?()=>selectMyRequest(r):undefined}
                >
                  {page === "Employees" ? (
                    <>
                      <td className="employee-select-cell"><input type="checkbox" aria-label={`Select ${String(r.first_name ?? "")} ${String(r.last_name ?? "")}`} checked={selectedEmployeeIds.includes(String(r.id))} onClick={(event) => event.stopPropagation()} onChange={(event) => { const id = String(r.id); setSelectedEmployeeIds((current) => event.target.checked ? Array.from(new Set([...current, id])) : current.filter((value) => value !== id)); }} /></td>
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
                      {page==="Approvals"?(
                        <>
                          <td>{requestFormName(r.request_type)}</td>
                          <td><b>{String(r.source)==="corporate"?corporateRequestId(r):String(r.reference_no??r.id)}</b></td>
                          <td>{new Date(String(r.request_date??r.created_at)).toLocaleDateString()}</td>
                          <td><b>{String(r.first_name)} {String(r.last_name)}</b><small>{String(r.employee_no)}</small></td>
                          <td>{String(r.employee_department??r.department??"—")}</td>
                          <td className="approval-request-description"><b>{String(r.description??r.title??"—")}</b></td>
                        </>
                      ):(
                        <>
                          <td>
                            <b>
                              {String(r.first_name)} {String(r.last_name)}
                            </b>
                            <small>{String(r.employee_no)}</small>
                          </td>
                          <td><b>{String(r.request_type).replaceAll("_", " ")}</b></td>
                          <td><b>{String(r.title)}</b>{Boolean(r.description)&&String(r.description)!==String(r.title)&&<small>{String(r.description)}</small>}</td>
                          <td>
                            {new Date(String(r.created_at)).toLocaleDateString()}
                          </td>
                        </>
                      )}
                      <td className="table-actions">
                        {employeeApproval || page==="Approvals" ? (
                          <span className={`pill ${String(r.status)}`}>
                            {page==="Approvals"&&String(r.status)==="pending"&&r.pending_with?`Pending with ${String(r.pending_with)}`:String(r.status)}
                          </span>
                        ) : (
                          <>
                            <button onClick={(event) =>{event.stopPropagation();if(String(r.source)==="corporate")setCorporateConfirmation({id:String(r.id),action:"rejected",name:String(r.reference_no??r.title)});else setConfirmation({id:String(r.id),action:"rejected",name:`${String(r.first_name)} ${String(r.last_name)}`})}}>
                              Reject
                            </button>
                            <button onClick={(event) =>{event.stopPropagation();if(String(r.source)==="corporate")setCorporateConfirmation({id:String(r.id),action:"approved",name:String(r.reference_no??r.title)});else setConfirmation({id:String(r.id),action:"approved",name:`${String(r.first_name)} ${String(r.last_name)}`})}}>
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
          </div>
          {page === "Employees" && (
            <div className="employee-pagination">
              <div>
                Showing {(currentEmployeePage - 1) * employeePageSize + (displayRows.length ? 1 : 0)}–{Math.min(currentEmployeePage * employeePageSize, displayRows.length)} of {displayRows.length} employees
              </div>
              <div className="pagination-controls">
                <label>
                  Rows
                  <select value={employeePageSize} onChange={(event) => { setEmployeePageSize(Number(event.target.value)); setEmployeePage(1); }}>
                    <option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="500">500</option><option value="1000">1000</option>
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
      {showEmployeeDeleteConfirmation && <EmployeeDeleteDialog count={selectedEmployeeIds.length} deleting={deletingEmployees} onCancel={() => setShowEmployeeDeleteConfirmation(false)} onConfirm={() => void deleteSelectedEmployees()} />}
      {approvalDetail&&approvalRequest&&<div className="approval-detail-backdrop" onMouseDown={()=>setSelectedCorporateRequest(null)}><section className="approval-detail-modal" onMouseDown={event=>event.stopPropagation()}>
        <header><div><p>APPROVAL REQUEST DETAILS</p><h2>{String(approvalRequest.reference_no??approvalRequest.title??approvalRequest.id)}</h2><span>{String(approvalRequest.first_name??approvalRequest.employee_name??"")} {String(approvalRequest.last_name??"")} · {String(approvalRequest.employee_no??"")}</span></div><button onClick={()=>setSelectedCorporateRequest(null)}>×</button></header>
        <div className={`approval-detail-summary ${String(approvalRequest.request_type)==="payment"?"payment-summary-standard":""}`}>
          <div><small>Request Type</small><b>{requestFormName(approvalRequest.request_type)}</b></div>
          <div><small>Status</small><b className={`status-text ${String(approvalRequest.status)}`}>{String(approvalRequest.status)}</b></div>
          {approvalDetailFields.map(field=><div key={field.label} className={field.className==="description"?"wide":undefined}><small>{field.label}</small><b>{field.value}</b></div>)}
        </div>
        {Boolean(approvalDetail.steps?.length)&&<section className="approval-detail-journey"><h3>Approval Journey</h3>{approvalDetail.steps?.map((step,index)=><article key={String(step.step_order)}><i>{step.action==="approved"?"✓":step.action==="rejected"?"×":index+1}</i><div><b>{String(step.step_name)}</b><span>{String(step.approver_name??"Approver not assigned")}</span>{Boolean(step.acted_at)&&<small>{new Date(String(step.acted_at)).toLocaleString()}</small>}{Boolean(step.comment)&&<small className="approval-step-comment">Comment: {String(step.comment)}</small>}</div><strong className={String(step.action??(Number(step.step_order)===Number(approvalRequest.current_step)?"pending":"upcoming"))}>{String(step.action??(Number(step.step_order)===Number(approvalRequest.current_step)?"Waiting for approval":"Next approver"))}</strong></article>)}</section>}
        {Boolean(approvalDetail.canAssignVehicle)&&<section className="vehicle-assignment-panel">
          <h3>Assign Vehicle</h3>
          <p>Search and select a free internal vehicle before approving this request.</p>
          <div className="vehicle-assignment-controls">
            <div className="vehicle-picker">
              <label htmlFor="vehicle-assignment-search">Search vehicle</label>
              <input id="vehicle-assignment-search" type="search" value={vehiclePickerOpen?vehicleAssignmentSearch:selectedAssignmentVehicleLabel} onFocus={()=>{setVehicleAssignmentSearch("");setVehiclePickerOpen(true)}} onClick={()=>setVehiclePickerOpen(true)} onChange={event=>{setVehicleAssignmentSearch(event.target.value);setVehiclePickerOpen(true)}} placeholder="Search plate number, vehicle, driver or phone" autoComplete="off" role="combobox" aria-expanded={vehiclePickerOpen} aria-controls="vehicle-assignment-results"/>
              {vehiclePickerOpen&&<div id="vehicle-assignment-results" className="vehicle-picker-results" role="listbox" aria-label="Free vehicles">
                {assignmentVehicleOptions.length?assignmentVehicleOptions.map(vehicle=>{
                  const selected=String(vehicle.id)===selectedAssignmentVehicleId;
                  return <button key={String(vehicle.id)} type="button" role="option" aria-selected={selected} className={`vehicle-picker-option${selected?" selected":""}`} onClick={()=>{setSelectedAssignmentVehicleId(String(vehicle.id));setSelectedAssignmentVehicleLabel([vehicle.vehicle_plate_number,vehicle.vehicle_name].map(value=>String(value??"").trim()).filter(Boolean).join(" · "));setVehicleAssignmentSearch("");setVehiclePickerOpen(false)}}>
                    <span className="vehicle-option-primary"><b>{String(vehicle.vehicle_plate_number??"No plate number")}</b><span>{String(vehicle.vehicle_name??"Unnamed vehicle")}</span></span>
                    <span className="vehicle-option-secondary"><span>Driver: {String(vehicle.driver_name??"-")}</span><span>Phone: {String(vehicle.phone_no??"-")}</span></span>
                  </button>;
                }):<div className="vehicle-picker-empty">No free vehicles match your search.</div>}
              </div>}
            </div>
            <button type="button" className="assign-vehicle-button" disabled={!selectedAssignmentVehicleId||assigningVehicle} onClick={assignVehicleToRequest}>{assigningVehicle?"Assigning…":"Assign Vehicle"}</button>
          </div>
          {assignmentNotice&&<small className="assignment-notice">{assignmentNotice}</small>}
        </section>}
        {Boolean(approvalDetail.attachments?.length)&&<section className="approval-detail-attachments"><h3>Attachments</h3>{approvalDetail.attachments?.map(file=><button key={String(file.id)} onClick={()=>openCorporateAttachment(approvalRequest.id,file)}>↗ <span><b>{String(file.original_name)}</b><small>{String(file.mime_type)} · {(Number(file.file_size)/1024).toFixed(1)} KB</small></span></button>)}</section>}
        {Boolean(approvalDetail.canAct)&&<label className="approval-comment-field"><span>Approver Comment</span><textarea rows={3} value={corporateComment} onChange={event=>setCorporateComment(event.target.value)} placeholder="Add a comment (optional)"/></label>}
        {(approvalDetail.canAct||(!employeeApproval&&String(approvalRequest.status)==="pending"))&&<footer><button className="reject" onClick={()=>String(approvalRequest.source??(approvalRequest.reference_no?"corporate":"hr"))==="corporate"?setCorporateConfirmation({id:String(approvalRequest.id),action:"rejected",name:String(approvalRequest.reference_no)}):setConfirmation({id:String(approvalRequest.id),action:"rejected",name:String(approvalRequest.title)})}>Reject</button><button className="approve" disabled={approvalNeedsVehicle} title={approvalNeedsVehicle?"Assign a vehicle before approving":undefined} onClick={()=>String(approvalRequest.source??(approvalRequest.reference_no?"corporate":"hr"))==="corporate"?setCorporateConfirmation({id:String(approvalRequest.id),action:"approved",name:String(approvalRequest.reference_no)}):setConfirmation({id:String(approvalRequest.id),action:"approved",name:String(approvalRequest.title)})}>Approve</button></footer>}
      </section></div>}
      {confirmation && (
        <ConfirmDialog
          confirmation={confirmation}
          onCancel={() => setConfirmation(null)}
          onConfirm={decide}
        />
      )}{" "}
      {corporateConfirmation&&<ConfirmDialog confirmation={corporateConfirmation} onCancel={()=>setCorporateConfirmation(null)} onConfirm={actCorporateRequest}/>} 
      {pendingEmployee && (
        <SaveEmployeeDialog
          name={String(pendingEmployee.nameEng ?? pendingEmployee.employeeNo)}
          onCancel={() => { setPendingEmployee(null); setPendingEmployeeAttachments([]); }}
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
                <fieldset>
                  <legend>Employee documents</legend>
                  <div className="employee-document-grid">
                    <label className="employee-document-upload">
                      Add attachments
                      <input
                        name="attachments"
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods,.odp,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.heic,.eml,.msg,.zip,.rar,.7z"
                      />
                      <small>Up to 10 files, maximum 20 MB each.</small>
                    </label>
                  </div>
                </fieldset>
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
                <section className="employee-document-list">
                  <header><div><small>EMPLOYEE DOCUMENTS</small><h3>Attachments</h3></div><span>{Array.isArray(selectedEmployee.attachments) ? selectedEmployee.attachments.length : 0} files</span></header>
                  {Array.isArray(selectedEmployee.attachments) && selectedEmployee.attachments.length ? (
                    <div>{(selectedEmployee.attachments as Record<string, unknown>[]).map((file) => (
                      <article key={String(file.id)}><button type="button" onClick={() => void openEmployeeAttachment(selectedEmployee.id, file.id)}><span>↧</span><div><b>{String(file.original_name)}</b><small>{String(file.mime_type || "Document")} · {(Number(file.file_size) / 1024).toFixed(1)} KB</small></div></button>{["admin", "hr"].includes(role) && <button type="button" className="employee-document-remove" aria-label={`Remove ${String(file.original_name)}`} onClick={() => void removeEmployeeAttachment(selectedEmployee.id, file.id)}>×</button>}</article>
                    ))}</div>
                  ) : <p>No employee documents uploaded.</p>}
                </section>
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
  const [overviewAnnouncements,setOverviewAnnouncements]=useState<Record<string,unknown>[]>([]);
  const [announcementSlide,setAnnouncementSlide]=useState(0);
  const [announcementTargetId,setAnnouncementTargetId]=useState("");
  const [loginError, setLoginError] = useState("");
  const [active, setActive] = useState("Overview");
  const [notice, setNotice] = useState("");
  const [allowedMenus, setAllowedMenus] = useState<string[]>([]);
  const [currentRole, setCurrentRole] = useState("");
  const [isWorkflowApprover, setIsWorkflowApprover] = useState(false);
  const [currentName, setCurrentName] = useState("");
  const [corporateOpen, setCorporateOpen] = useState(false);
  const [fleetOpen, setFleetOpen] = useState(false);
  const [informationTechnologyOpen, setInformationTechnologyOpen] = useState(false);
  const [humanResourceOpen, setHumanResourceOpen] = useState(false);
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
    "Learning Management": "သင်ယူမှု စီမံခန့်ခွဲရေး",
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
    const [dashboardResponse, requestsResponse, notificationResponse,announcementsResponse] = await Promise.all([
      all || allowedMenus.includes("Overview") ? fetch(`${API}/dashboard`, { headers }) : Promise.resolve(null),
      all || allowedMenus.includes("Approvals") || isWorkflowApprover ? fetch(`${API}/approvals/all`, { headers }) : Promise.resolve(null),
      all || allowedMenus.includes("Notification") ? fetch(`${API}/notifications/unread-count`, { headers }) : Promise.resolve(null),
      all || allowedMenus.includes("Overview") ? fetch(`${API}/dashboard/announcements`,{headers}) : Promise.resolve(null),
    ]);
    if (dashboardResponse?.ok) setDashboard(await dashboardResponse.json());
    if (requestsResponse?.ok) {
      const pending = await requestsResponse.json();
      if (currentRole === "employee") setEmployeePending(pending);
      else setApprovals(pending);
    }
    if (notificationResponse?.ok) setNotificationCount((await notificationResponse.json()).count);
    if(announcementsResponse?.ok){setOverviewAnnouncements(await announcementsResponse.json());setAnnouncementSlide(0)}
  }, [token, allowedMenus, currentRole, isWorkflowApprover]);

  useEffect(()=>{if(overviewAnnouncements.length<2)return;const timer=window.setInterval(()=>setAnnouncementSlide(current=>(current+1)%overviewAnnouncements.length),6000);return()=>window.clearInterval(timer)},[overviewAnnouncements.length]);

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
        setIsWorkflowApprover(Boolean(navigation.isWorkflowApprover));
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
        if (all || menus.includes("Approvals") || navigation.isWorkflowApprover) {
          const r = await fetch(`${API}/approvals/all`, { headers });
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
                defaultValue="admin"
                autoCapitalize="none"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                placeholder="Enter a temporary password"
                required
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
  const hasApprovalAccess =
    currentRole === "employee" ? isWorkflowApprover : can("Approvals");
  const visibleNav = nav.filter((item) =>
    item === "Human Resource"
      ? can(item) || humanResourceSubmenus.some(can)
      : item === "Approvals"
        ? hasApprovalAccess
      : item === "Fleet Management"
        ? can(item) || fleetSubmenus.some(can)
      : item === "Information Technology"
        ? can(item) || informationTechnologySubmenus.some(can)
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
    if (page === "Approvals" && !hasApprovalAccess) {
      setActive("My Requests");
      setSidebarOpen(false);
      return;
    }
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
            ) : item === "Information Technology" ? (
              <div className="nav-group" key={item}>
                <button
                  className={informationTechnologySubmenus.includes(active) ? "active" : ""}
                  onClick={() => setInformationTechnologyOpen((open) => !open)}
                >
                  <i><NavIcon name="Information Technology" /></i>
                  Information Technology
                  <span className={`chevron ${informationTechnologyOpen ? "open" : ""}`}><ChevronIcon /></span>
                </button>
                {informationTechnologyOpen && (
                  <div className="sub-menu">
                    {informationTechnologySubmenus.filter(can).map((submenu) => (
                      <button key={submenu} className={active === submenu ? "active" : ""} onClick={() => navigate(submenu)}>
                        {submenu}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : item === "Approvals" ? (
                <button key={item} className={active === "Approvals" ? "active" : ""} onClick={() => navigate("Approvals")}>
                  <i><NavIcon name="Approvals" /></i>
                  {label("Approvals")}
                  <b>{currentRole === "employee" ? employeePending.length : (dashboard?.stats.pendingApprovals ?? 0)}</b>
                </button>
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
                  {language === "Myanmar" ? label("Users & Roles") : "Users Management"}
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
              selectedAnnouncementId={announcementTargetId}
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

              <section className="overview-announcements card">
                <div className="card-head"><div><h2>Announcements</h2><p>Latest company updates</p></div><div className="announcement-head-actions">{overviewAnnouncements.length>1&&<><button aria-label="Previous announcement" onClick={()=>setAnnouncementSlide(current=>(current-1+overviewAnnouncements.length)%overviewAnnouncements.length)}>‹</button><button aria-label="Next announcement" onClick={()=>setAnnouncementSlide(current=>(current+1)%overviewAnnouncements.length)}>›</button></>}{can("Announcements")&&<button className="announcement-view-all" onClick={()=>navigate("Announcements")}>View all <span>&rarr;</span></button>}</div></div>
                {overviewAnnouncements.length?<><div className="overview-announcement-slider">{overviewAnnouncements.map((announcement,index)=>{const attachments=(announcement.attachments??[]) as Record<string,unknown>[];const hero=attachments.find(file=>String(file.mimeType??"").startsWith("image/"))??attachments[0];return <article key={String(announcement.id)} className={index===announcementSlide?"active":""} onClick={()=>{setAnnouncementTargetId(String(announcement.id));navigate("Announcements")}}><div className="announcement-hero">{hero?<AnnouncementThumbnail announcementId={announcement.id} attachment={hero} token={token}/>:<div className="announcement-hero-empty"><span>📣</span><small>No image attachment</small></div>}</div><div className="announcement-copy"><h3>{String(announcement.title)}</h3><small>Published {formatDateTimeAMPM(new Date(String(announcement.published_at)))}</small><p>{String(announcement.body)}</p><span className="announcement-read-more">View announcement <b>&rarr;</b></span></div></article>})}</div><div className="announcement-dots">{overviewAnnouncements.map((announcement,index)=><button key={String(announcement.id)} className={index===announcementSlide?"active":""} aria-label={`Show announcement ${index+1}`} onClick={()=>setAnnouncementSlide(index)}/>)}</div></>:<div className="overview-announcement-empty">No published announcements yet.</div>}
              </section>

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
