import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import "./ferry-management.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
const townships = [
  "Ahlone", "Botahtaung", "Dagon Seikkan", "Dawbon", "East Dagon (Dagon Myothit East)",
  "Hlaing", "Hlaingthaya", "Hmawbi", "Insein", "Kamayut", "Kyauktada", "Kyimyindaing",
  "Lanmadaw", "Latha", "Mayangone", "Mingala Taungnyunt", "Mingaladon",
  "North Dagon (Dagon Myothit North)", "North Okkalapa", "Sanchaung", "Shwepyitha",
  "South Dagon (Dagon Myothit South)", "South Okkalapa", "Tamwe", "Thaketa", "Thingangyun", "Yankin",
];
const blankForm = {
  employeeId: "", employeeNo: "", contactPhoneNumber: "", vehicleNumber: "", ferryPoint: "",
  ferryPickupPoint: "", pickupLatitude: "", pickupLongitude: "", ferryDropPoint: "",
  dropLatitude: "", dropLongitude: "", township: "", address: "", pickupTime: "", dropTime: "",
  officeAddress: "", officeLatitude: "", officeLongitude: "", driverName: "", driverPhoneNumber: "",
  way: "", point: "", arrivalTime: "", remark: "",
};
const blankVehicle = { vehicleName: "", vehicleType: "", vehicleNumber: "", driverName: "", driverPhoneNumber: "" };
type FerryForm = typeof blankForm;
type FerryVehicleForm = typeof blankVehicle;
type Row = Record<string, unknown>;
type SearchOption = { value: string; primary: string; secondary?: string };
type DeleteConfirmation = { title: string; message: string; action: () => Promise<void> };
type StatusDialog = { type: "success" | "error"; title: string; message: string };
type FerryFilterKey = "employee_name_myanmar" | "employee_name_english" | "employee_no" | "department" | "business_units" | "vehicle_number" | "township" | "point";
const ferryFilterFields: { value: FerryFilterKey; label: string }[] = [
  {value:"employee_name_myanmar",label:"Employee Name (Myanmar)"},
  {value:"employee_name_english",label:"Employee Name (English)"},
  {value:"employee_no",label:"Employee ID"},
  {value:"department",label:"Department"},
  {value:"business_units",label:"Business Units"},
  {value:"vehicle_number",label:"Vehicle Number"},
  {value:"township",label:"Township"},
  {value:"point",label:"Point"},
];
const emptyFerryFilters:Record<FerryFilterKey,string>={employee_name_myanmar:"",employee_name_english:"",employee_no:"",department:"",business_units:"",vehicle_number:"",township:"",point:""};
const columns: [string, string][] = [
  ["Employee Name (Myanmar)", "employee_name_myanmar"], ["Employee Name (English)", "employee_name_english"],
  ["Employee ID", "employee_no"], ["Business Units", "business_units"], ["Department", "department"],
  ["Contact Phone Number", "contact_phone_number"], ["Vehicle Number", "vehicle_number"], ["Ferry Point", "ferry_point"],
  ["Ferry Pickup Point", "ferry_pickup_point"], ["Lattitude (Ferry Pickup Point)", "pickup_latitude"],
  ["Longitude (Ferry Pickup Point)", "pickup_longitude"], ["Ferry Drop Point", "ferry_drop_point"],
  ["Lattitude (Drop Point)", "drop_latitude"], ["Longitude (Drop Point)", "drop_longitude"],
  ["Township", "township"], ["Address", "address"], ["Office Address", "office_address"],
  ["Office Lattitude", "office_latitude"], ["Office Longitude", "office_longitude"],
  ["Driver Name", "driver_name"], ["Driver Phone Number", "driver_phone_number"],
  ["Pickup Time", "pickup_time"], ["Drop Time", "drop_time"],
  ["Way", "way"], ["Point", "point"], ["Arrival Time", "arrival_time"], ["Remark", "remark"],
];
const displayFerryValue=(key:string,raw:unknown)=>{
  const text=String(raw??"");
  if(["pickup_time","drop_time","arrival_time"].includes(key)){
    const match=text.match(/^(\d{1,2}):(\d{2})/);if(!match)return text||"—";
    const hour=Number(match[1]);return `${String(hour%12||12).padStart(2,"0")}:${match[2]} ${hour>=12?"PM":"AM"}`;
  }
  return text||"—";
};

function SearchableFerrySelect({label,value,placeholder,options,onChange}:{label:string;value:string;placeholder:string;options:SearchOption[];onChange:(value:string)=>void}) {
  const root=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  useEffect(()=>{const close=(event:MouseEvent)=>{if(!root.current?.contains(event.target as Node)){setOpen(false);setQuery("")}};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close)},[]);
  const selected=options.find((option)=>option.value===value);
  const normalized=query.trim().toLowerCase();
  const filtered=options.filter((option)=>`${option.primary} ${option.secondary??""}`.toLowerCase().includes(normalized));
  return <div className={`ferry-search-select${open?" open":""}`} ref={root}>
    <label>{label}<div className="ferry-search-control"><input role="combobox" aria-label={label.replace(" *","")} aria-expanded={open} value={open?query:(selected?.primary??"")} placeholder={placeholder} onFocus={()=>{setOpen(true);setQuery("")}} onChange={(event)=>{setQuery(event.target.value);setOpen(true)}} autoComplete="off"/><button type="button" tabIndex={-1} aria-label={`Toggle ${label}`} onClick={()=>{setOpen((current)=>!current);setQuery("")}}><span aria-hidden="true"/></button></div></label>
    {open&&<div className="ferry-search-options" role="listbox" aria-label={`${label} options`}>{filtered.length?filtered.map((option)=><button key={option.value} type="button" role="option" aria-selected={option.value===value} className={option.value===value?"selected":""} onClick={()=>{onChange(option.value);setOpen(false);setQuery("")}}><strong>{option.primary}</strong>{option.secondary&&<span>{option.secondary}</span>}</button>):<div className="ferry-search-empty">No matching options</div>}</div>}
  </div>;
}

export default function FerryManagement({ token }: { token: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Row[]>([]);
  const [ferryVehicles, setFerryVehicles] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<FerryForm>(blankForm);
  const [filters, setFilters] = useState<Record<FerryFilterKey,string>>(emptyFerryFilters);
  const [sortKey, setSortKey] = useState<FerryFilterKey>("employee_name_english");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [notice, setNotice] = useState("");
  const [showFerryVehicles, setShowFerryVehicles] = useState(false);
  const [editingFerryVehicle, setEditingFerryVehicle] = useState<Row | null>(null);
  const [ferryVehicleForm, setFerryVehicleForm] = useState<FerryVehicleForm>(blankVehicle);
  const [ferryVehicleNotice, setFerryVehicleNotice] = useState("");
  const [selectedFerryRecordIds, setSelectedFerryRecordIds] = useState<string[]>([]);
  const [selectedFerryVehicleIds, setSelectedFerryVehicleIds] = useState<string[]>([]);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);
  const [statusDialog, setStatusDialog] = useState<StatusDialog | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const fileInput = useRef<HTMLInputElement>(null);
  const ferryVehicleFileInput = useRef<HTMLInputElement>(null);
  const headers = { Authorization: `Bearer ${token}` };
  const load = useCallback(async () => {
    setLoading(true);
    const [recordsResponse, employeesResponse, vehiclesResponse] = await Promise.all([
      fetch(`${API}/ferries`, { headers: { Authorization: `Bearer ${token}` }, cache:"no-store" }),
      fetch(`${API}/ferries/employees`, { headers: { Authorization: `Bearer ${token}` }, cache:"no-store" }),
      fetch(`${API}/ferry-vehicles`, { headers: { Authorization: `Bearer ${token}` }, cache:"no-store" }),
    ]);
    setRows(recordsResponse.ok ? await recordsResponse.json() : []);
    setEmployees(employeesResponse.ok ? await employeesResponse.json() : []);
    setFerryVehicles(vehiclesResponse.ok ? await vehiclesResponse.json() : []);
    setLoading(false);
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  const selectedEmployee = employees.find((employee) => String(employee.id) === form.employeeId);
  const vehicleNumberFilterOptions = useMemo(() => Array.from(new Set([
    ...rows.map((row) => String(row.vehicle_number ?? "").trim()),
    ...ferryVehicles.map((vehicle) => String(vehicle.vehicle_number ?? "").trim()),
  ].filter(Boolean))).sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })), [rows, ferryVehicles]);
  const townshipFilterOptions = useMemo(() => Array.from(new Set([
    ...townships,
    ...rows.map((row) => String(row.township ?? "").trim()),
  ].filter(Boolean))).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" })), [rows]);
  const filteredRows = useMemo(() => {
    const matching = rows.filter((row)=>ferryFilterFields.every(({value})=>{const query=filters[value].trim().toLowerCase();return !query||String(row[value]??"").toLowerCase().includes(query)}));
    return matching.sort((left,right)=>{
      const result=String(left[sortKey]??"").localeCompare(String(right[sortKey]??""),undefined,{numeric:true,sensitivity:"base"});
      return sortDirection==="asc"?result:-result;
    });
  }, [rows, filters, sortKey, sortDirection]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const currentPageRecordIds = pagedRows.map((row)=>String(row.id));
  const update = (key: keyof FerryForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const chooseEmployee = (employeeId: string) => {
    const employee = employees.find((item) => String(item.id) === employeeId);
    setForm((current) => ({
      ...current,
      employeeId: employee ? String(employee.id) : "",
      employeeNo: employee ? String(employee.employee_no) : "",
      contactPhoneNumber: employee && (!current.contactPhoneNumber || current.employeeId !== String(employee.id))
        ? String(employee.contact_phone_number ?? "")
        : current.contactPhoneNumber,
    }));
  };
  const chooseFerryVehicle = (vehicleNumber: string) => {
    const vehicle=ferryVehicles.find((item)=>String(item.vehicle_number)===vehicleNumber);
    setForm((current)=>({...current,vehicleNumber,driverName:vehicle?String(vehicle.driver_name??""):current.driverName,driverPhoneNumber:vehicle?String(vehicle.driver_phone_number??""):current.driverPhoneNumber}));
  };
  const openNew = () => { setEditing(null); setForm(blankForm); setShowForm(true); };
  const updateFerryVehicle = (key: keyof FerryVehicleForm, value: string) => setFerryVehicleForm((current) => ({ ...current, [key]: value }));
  const startNewFerryVehicle = () => { setEditingFerryVehicle(null); setFerryVehicleForm(blankVehicle); };
  const startEditFerryVehicle = (vehicle: Row) => {
    setEditingFerryVehicle(vehicle);
    setFerryVehicleForm({vehicleName:String(vehicle.vehicle_name??""),vehicleType:String(vehicle.vehicle_type??""),vehicleNumber:String(vehicle.vehicle_number??""),driverName:String(vehicle.driver_name??""),driverPhoneNumber:String(vehicle.driver_phone_number??"")});
  };
  const saveFerryVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response=await fetch(`${API}/ferry-vehicles${editingFerryVehicle?`/${editingFerryVehicle.id}`:""}`,{method:editingFerryVehicle?"PUT":"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(ferryVehicleForm)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)return setFerryVehicleNotice(String(result.error??"Unable to save ferry vehicle."));
    setFerryVehicleNotice(editingFerryVehicle?"Ferry vehicle updated successfully.":"Ferry vehicle added successfully.");startNewFerryVehicle();await load();
  };
  const removeFerryVehicle = async (vehicle: Row) => {
    const response=await fetch(`${API}/ferry-vehicles/${vehicle.id}`,{method:"DELETE",headers});
    if(!response.ok)return setFerryVehicleNotice("Unable to remove ferry vehicle.");
    setFerryVehicleNotice("Ferry vehicle removed successfully.");if(String(editingFerryVehicle?.id)===String(vehicle.id))startNewFerryVehicle();await load();
  };
  const removeSelectedFerryVehicles = async (ids: string[]) => {
    if(!ids.length)return;
    const response=await fetch(`${API}/ferry-vehicles`,{method:"DELETE",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({ids})});const result=await response.json().catch(()=>({}));
    if(!response.ok)return setFerryVehicleNotice(String(result.error??"Unable to remove selected ferry vehicles."));
    setFerryVehicleNotice(`${result.removed??ids.length} ferry vehicle${Number(result.removed??ids.length)===1?"":"s"} removed successfully.`);setSelectedFerryVehicleIds([]);startNewFerryVehicle();await load();
  };
  const downloadFerryVehicleExcel = async (kind:"template"|"export") => {
    const response=await fetch(`${API}/ferry-vehicles/${kind}`,{headers});
    if(!response.ok)return setFerryVehicleNotice(`Ferry vehicle Excel ${kind} failed.`);
    const url=URL.createObjectURL(await response.blob());const anchor=document.createElement("a");anchor.href=url;anchor.download=kind==="template"?"ferry-vehicle-import-template.xlsx":`ferry-vehicles-${new Date().toISOString().slice(0,10)}.xlsx`;anchor.click();URL.revokeObjectURL(url)
  };
  const importFerryVehicles = async (file?:File) => {
    if(!file)return;const data=new FormData();data.append("file",file);setFerryVehicleNotice("Importing ferry vehicles…");const response=await fetch(`${API}/ferry-vehicles/import`,{method:"POST",headers,body:data});const result=await response.json().catch(()=>({}));
    if(!response.ok)setFerryVehicleNotice(String(result.error??"Ferry vehicle import failed."));
    else{const details=Array.isArray(result.errors)?result.errors.slice(0,5).map((error:{row:number;message:string})=>`Row ${error.row}: ${error.message}`).join(" · "):"";setFerryVehicleNotice(`Imported ${result.imported}, updated ${result.updated}, skipped ${result.skipped}${details?` — ${details}`:""}`);await load()}
    if(ferryVehicleFileInput.current)ferryVehicleFileInput.current.value="";
  };
  const openEdit = (row: Row) => {
    setEditing(row);
    setForm({
      employeeId: String(row.employee_id ?? ""), employeeNo: String(row.employee_no ?? ""),
      contactPhoneNumber: String(row.contact_phone_number ?? ""), vehicleNumber: String(row.vehicle_number ?? ""),
      ferryPoint: String(row.ferry_point ?? ""), ferryPickupPoint: String(row.ferry_pickup_point ?? ""),
      pickupLatitude: String(row.pickup_latitude ?? ""), pickupLongitude: String(row.pickup_longitude ?? ""),
      ferryDropPoint: String(row.ferry_drop_point ?? ""), dropLatitude: String(row.drop_latitude ?? ""),
      dropLongitude: String(row.drop_longitude ?? ""), township: String(row.township ?? ""),
      address: String(row.address ?? ""), pickupTime: String(row.pickup_time ?? ""), dropTime: String(row.drop_time ?? ""),
      officeAddress: String(row.office_address ?? ""), officeLatitude: String(row.office_latitude ?? ""), officeLongitude: String(row.office_longitude ?? ""),
      driverName: String(row.driver_name ?? ""), driverPhoneNumber: String(row.driver_phone_number ?? ""),
      way: String(row.way ?? ""), point: String(row.point ?? ""), arrivalTime: String(row.arrival_time ?? ""),
      remark: String(row.remark ?? ""),
    });
    setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing && !selectedEmployee) return setStatusDialog({type:"error",title:"Unable to save record",message:"Please search and select a valid Employee ID."});
    if ((!editing || form.township!==String(editing.township??"")) && !townships.includes(form.township)) return setStatusDialog({type:"error",title:"Unable to save record",message:"Please search and select a valid Township."});
    const fullPayload:Record<string,unknown> = {
      ...form,
      pickupLatitude: form.pickupLatitude || null, pickupLongitude: form.pickupLongitude || null,
      dropLatitude: form.dropLatitude || null, dropLongitude: form.dropLongitude || null,
      officeLatitude: form.officeLatitude || null, officeLongitude: form.officeLongitude || null,
      pickupTime: form.pickupTime || null, dropTime: form.dropTime || null, arrivalTime: form.arrivalTime || null,
    };
    delete fullPayload.employeeNo;
    const rowKeys:Record<string,string>={employeeId:"employee_id",contactPhoneNumber:"contact_phone_number",vehicleNumber:"vehicle_number",ferryPoint:"ferry_point",ferryPickupPoint:"ferry_pickup_point",pickupLatitude:"pickup_latitude",pickupLongitude:"pickup_longitude",ferryDropPoint:"ferry_drop_point",dropLatitude:"drop_latitude",dropLongitude:"drop_longitude",township:"township",address:"address",officeAddress:"office_address",officeLatitude:"office_latitude",officeLongitude:"office_longitude",driverName:"driver_name",driverPhoneNumber:"driver_phone_number",pickupTime:"pickup_time",dropTime:"drop_time",way:"way",point:"point",arrivalTime:"arrival_time",remark:"remark"};
    const normalizeComparison=(value:unknown)=>String(value??"").trim();
    const payload=editing?Object.fromEntries(Object.entries(fullPayload).filter(([key,value])=>normalizeComparison(value)!==normalizeComparison(editing[rowKeys[key]]))):fullPayload;
    const response = await fetch(`${API}/ferries${editing ? `/${editing.id}` : ""}`, {
      method: editing ? "PUT" : "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return setStatusDialog({type:"error",title:editing?"Update failed":"Save failed",message:String(result.error ?? "Unable to save ferry record.")});
    setStatusDialog({type:"success",title:editing?"Record updated":"Record created",message:editing?"Your changes were saved successfully. Unchanged data was preserved.":"The ferry record was created successfully."});
    setShowForm(false); setEditing(null); setForm(blankForm); await load();
  };
  const remove = async (row: Row) => {
    const response = await fetch(`${API}/ferries/${row.id}`, { method: "DELETE", headers });
    if (!response.ok) return setNotice("Unable to delete ferry record.");
    setNotice("Ferry record deleted successfully."); await load();
  };
  const removeSelectedFerryRecords = async (ids:string[]) => {
    if(!ids.length)return;
    const response=await fetch(`${API}/ferries`,{method:"DELETE",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({ids})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)return setNotice(String(result.error??"Unable to delete selected ferry records."));
    setNotice(`${result.removed??ids.length} ferry record${Number(result.removed??ids.length)===1?"":"s"} deleted successfully.`);setSelectedFerryRecordIds([]);await load();
  };
  const confirmDelete = async () => {
    if (!deleteConfirmation || deleting) return;
    setDeleting(true);
    try { await deleteConfirmation.action(); setDeleteConfirmation(null); }
    finally { setDeleting(false); }
  };
  const download = async (kind: "template" | "export") => {
    const params=new URLSearchParams();
    const hasActiveFilters=kind==="export"&&ferryFilterFields.some(({value})=>filters[value].trim());
    if(kind==="export"){ferryFilterFields.forEach(({value})=>{const query=filters[value].trim();if(query)params.set(value,query)});params.set("sortKey",sortKey);params.set("sortDirection",sortDirection)}
    const queryString=params.toString();const response = await fetch(`${API}/ferries/${kind}${queryString?`?${queryString}`:""}`, { headers });
    if (!response.ok) return setNotice(`Excel ${kind} failed.`);
    const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = kind === "template" ? "ferry-record-import-template.xlsx" : `ferry-records${hasActiveFilters?"-filtered":""}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    anchor.click(); URL.revokeObjectURL(url);
  };
  const importExcel = async (file?: File) => {
    if (!file) return; const data = new FormData(); data.append("file", file); setNotice("Importing ferry records…");
    const response = await fetch(`${API}/ferries/import`, { method: "POST", headers, body: data });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setNotice(String(result.error ?? "Ferry record import failed."));
    else {
      const issues=(Array.isArray(result.errors)?result.errors:[]).slice(0,5).map((issue:{row:number;message:string})=>`Row ${issue.row}: ${issue.message}`).join(" · ");
      const nameSummary=Number(result.namesFromExcel??0)>0||Number(result.namesFilledFromEmployee??0)>0?`, names from Excel ${result.namesFromExcel??0}, names filled ${result.namesFilledFromEmployee??0}`:"";
      setNotice(`Imported ${result.imported}, updated ${result.updated??0}, skipped ${result.skipped??0}${nameSummary}${issues?` — ${issues}`:""}`);setFilters(emptyFerryFilters);setPage(1);setSelectedFerryRecordIds([]);await load();
    }
    if (fileInput.current) fileInput.current.value = "";
  };
  return <div className={`ferry-management-page${showForm ? " has-form" : ""}`}>
    <div className="page-title">
      <div><p>FLEET MANAGEMENT</p><h1>Ferry Management</h1><span>Manage employee ferry routes, pickup points and schedules.</span></div>
      <div className="ferry-actions">
        <button onClick={() => void download("template")}>⇩ Excel template</button>
        <button onClick={() => fileInput.current?.click()}>⇧ Import Excel</button>
        <button onClick={() => void download("export")}>↗ Export Excel</button>
        <div className="ferry-primary-actions">
          <button className="primary" onClick={() => { setShowFerryVehicles(true); setFerryVehicleNotice(""); setSelectedFerryVehicleIds([]); startNewFerryVehicle(); }}>+ Add New Ferry</button>
          <button className="primary" onClick={openNew}>+ New record</button>
        </div>
        <input ref={fileInput} hidden type="file" accept=".xlsx" onChange={(event) => void importExcel(event.target.files?.[0])} />
      </div>
    </div>
    {notice && <div className="import-result">{notice}<button onClick={() => setNotice("")}>×</button></div>}
    {statusDialog&&<div className="ferry-status-backdrop" onMouseDown={()=>setStatusDialog(null)}><section className={`ferry-status-dialog ${statusDialog.type}`} role="alertdialog" aria-modal="true" aria-labelledby="ferry-status-title" onMouseDown={(event)=>event.stopPropagation()}><div className="ferry-status-icon" aria-hidden="true">{statusDialog.type==="success"?"✓":"!"}</div><h2 id="ferry-status-title">{statusDialog.title}</h2><p>{statusDialog.message}</p><button type="button" onClick={()=>setStatusDialog(null)}>OK</button></section></div>}
    {showForm && <form className="employee-form ferry-form" onSubmit={save}>
      <div className="vehicle-form-heading"><div><p>FERRY RECORD</p><h2>{editing ? "Edit record" : "New record"}</h2><span>Search an employee and complete the ferry route information.</span></div><button type="button" onClick={() => setShowForm(false)}>×</button></div>
      <fieldset><legend>Employee information</legend><div className="form-grid">
        <SearchableFerrySelect label="Employee ID *" value={form.employeeId} placeholder="Search Employee ID or name" options={employees.map((employee)=>({value:String(employee.id),primary:String(employee.employee_no),secondary:[employee.employee_name_english,employee.employee_name_myanmar].filter(Boolean).map(String).join(" · ")}))} onChange={chooseEmployee}/>
        <label>Employee Name (Myanmar)<input value={String(selectedEmployee?.employee_name_myanmar ?? "")} readOnly /></label>
        <label>Employee Name (English)<input value={String(selectedEmployee?.employee_name_english ?? "")} readOnly /></label>
        <label>Business Units<input value={String(selectedEmployee?.business_units ?? "")} readOnly /></label>
        <label>Department<input value={String(selectedEmployee?.department ?? "")} readOnly /></label>
        <label>Contact Phone Number<input value={form.contactPhoneNumber} onChange={(event) => update("contactPhoneNumber", event.target.value)} /></label>
      </div></fieldset>
      <fieldset><legend>Ferry route information</legend><div className="form-grid">
        <SearchableFerrySelect label="Vehicle Number" value={form.vehicleNumber} placeholder="Search Ferry Vehicle" options={ferryVehicles.map((vehicle)=>({value:String(vehicle.vehicle_number),primary:String(vehicle.vehicle_number),secondary:[vehicle.vehicle_name,vehicle.vehicle_type,vehicle.driver_name].filter(Boolean).map(String).join(" · ")}))} onChange={chooseFerryVehicle}/>
        <label>Driver Name<input value={form.driverName} onChange={(event) => update("driverName", event.target.value)} /></label>
        <label>Driver Phone Number<input value={form.driverPhoneNumber} onChange={(event) => update("driverPhoneNumber", event.target.value)} /></label>
        <label>Ferry Point<input value={form.ferryPoint} onChange={(event) => update("ferryPoint", event.target.value)} /></label>
        <label>Ferry Pickup Point<input value={form.ferryPickupPoint} onChange={(event) => update("ferryPickupPoint", event.target.value)} /></label>
        <label>Lattitude (Ferry Pickup Point)<input type="number" step="any" value={form.pickupLatitude} onChange={(event) => update("pickupLatitude", event.target.value)} /></label>
        <label>Longitude (Ferry Pickup Point)<input type="number" step="any" value={form.pickupLongitude} onChange={(event) => update("pickupLongitude", event.target.value)} /></label>
        <label>Ferry Drop Point<input value={form.ferryDropPoint} onChange={(event) => update("ferryDropPoint", event.target.value)} /></label>
        <label>Lattitude (Drop Point)<input type="number" step="any" value={form.dropLatitude} onChange={(event) => update("dropLatitude", event.target.value)} /></label>
        <label>Longitude (Drop Point)<input type="number" step="any" value={form.dropLongitude} onChange={(event) => update("dropLongitude", event.target.value)} /></label>
        <SearchableFerrySelect label="Township *" value={form.township} placeholder="Search Township" options={townships.map((township)=>({value:township,primary:township}))} onChange={(value)=>update("township",value)}/>
        <label className="ferry-wide">Address<textarea value={form.address} onChange={(event) => update("address", event.target.value)} /></label>
        <label className="ferry-wide">Office Address<textarea value={form.officeAddress} onChange={(event) => update("officeAddress", event.target.value)} /></label>
        <label>Office Lattitude<input type="number" step="any" value={form.officeLatitude} onChange={(event) => update("officeLatitude", event.target.value)} /></label>
        <label>Office Longitude<input type="number" step="any" value={form.officeLongitude} onChange={(event) => update("officeLongitude", event.target.value)} /></label>
        <label>Pickup Time<input type="time" value={form.pickupTime} onChange={(event) => update("pickupTime", event.target.value)} /></label>
        <label>Drop Time<input type="time" value={form.dropTime} onChange={(event) => update("dropTime", event.target.value)} /></label>
        <label>Way<input value={form.way} onChange={(event) => update("way", event.target.value)} /></label>
        <label>Point<input value={form.point} onChange={(event) => update("point", event.target.value)} /></label>
        <label>Arrival Time<input type="time" value={form.arrivalTime} onChange={(event) => update("arrivalTime", event.target.value)} /></label>
        <label className="ferry-wide">Remark<textarea value={form.remark} onChange={(event) => update("remark", event.target.value)} /></label>
      </div></fieldset>
      <div className="form-footer"><button type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary">{editing ? "Save changes" : "Save record"}</button></div>
    </form>}
    <section className="employee-filter-card ferry-filter"><div className="ferry-filter-heading"><div><h2>Filter ferry records</h2><p>Search ferry records by employee, organization, vehicle, township or point.</p></div><button type="button" onClick={()=>{setFilters(emptyFerryFilters);setPage(1)}}>Clear filters</button></div><div className="ferry-filter-grid">{ferryFilterFields.map((field)=>field.value==="vehicle_number"?<SearchableFerrySelect key={field.value} label={field.label} value={filters.vehicle_number} placeholder="Select or search Vehicle Number" options={[{value:"",primary:"All Vehicle Numbers"},...vehicleNumberFilterOptions.map((value)=>({value,primary:value}))]} onChange={(value)=>{setFilters((current)=>({...current,vehicle_number:value}));setPage(1)}}/>:field.value==="township"?<SearchableFerrySelect key={field.value} label={field.label} value={filters.township} placeholder="Select or search Township" options={[{value:"",primary:"All Townships"},...townshipFilterOptions.map((value)=>({value,primary:value}))]} onChange={(value)=>{setFilters((current)=>({...current,township:value}));setPage(1)}}/>:<label key={field.value}>{field.label}<input type="search" value={filters[field.value]} onChange={(event)=>{setFilters((current)=>({...current,[field.value]:event.target.value}));setPage(1)}} placeholder={`Search ${field.label}`}/></label>)}<label>Sort by<select value={sortKey} onChange={(event)=>{setSortKey(event.target.value as FerryFilterKey);setPage(1)}}>{ferryFilterFields.map((field)=><option key={field.value} value={field.value}>{field.label}</option>)}</select></label><label>Sort order<button type="button" className="ferry-sort-direction" onClick={()=>{setSortDirection((current)=>current==="asc"?"desc":"asc");setPage(1)}}>{sortDirection==="asc"?"Ascending (A → Z)":"Descending (Z → A)"}</button></label></div></section>
    <section className="data-card ferry-table-card">{loading?<div className="loading">Loading ferry records…</div>:<>{selectedFerryRecordIds.length>0&&<div className="ferry-record-bulk-toolbar"><span><b>{selectedFerryRecordIds.length}</b> selected</span><div><button onClick={()=>setSelectedFerryRecordIds([])}>Clear selection</button><button className="danger" onClick={()=>{const ids=[...selectedFerryRecordIds];setDeleteConfirmation({title:"Delete selected ferry records?",message:`Are you sure you want to delete ${ids.length} selected ferry record${ids.length===1?"":"s"}?`,action:()=>removeSelectedFerryRecords(ids)})}}>Delete selected</button></div></div>}<div className="ferry-table-scroll"><table><thead><tr><th className="ferry-record-check"><input type="checkbox" aria-label="Select all ferry records on this page" checked={currentPageRecordIds.length>0&&currentPageRecordIds.every((id)=>selectedFerryRecordIds.includes(id))} onChange={(event)=>setSelectedFerryRecordIds((current)=>event.target.checked?Array.from(new Set([...current,...currentPageRecordIds])):current.filter((id)=>!currentPageRecordIds.includes(id)))}/></th>{columns.map(([label])=><th key={label}>{label}</th>)}<th>Action</th></tr></thead><tbody>{pagedRows.map((row)=><tr key={String(row.id)} className={selectedFerryRecordIds.includes(String(row.id))?"ferry-record-selected":""}><td className="ferry-record-check"><input type="checkbox" aria-label={`Select ferry record for ${String(row.employee_name_english||row.employee_name_myanmar||row.employee_no||"employee")}`} checked={selectedFerryRecordIds.includes(String(row.id))} onChange={(event)=>setSelectedFerryRecordIds((current)=>event.target.checked?Array.from(new Set([...current,String(row.id)])):current.filter((id)=>id!==String(row.id)))}/></td>{columns.map(([,key])=><td key={key}>{displayFerryValue(key,row[key])}</td>)}<td className="ferry-row-actions"><button onClick={()=>openEdit(row)}>Edit</button><button className="danger" onClick={()=>setDeleteConfirmation({title:"Delete ferry record?",message:`Are you sure you want to delete the ferry record for ${String(row.employee_name_english||row.employee_name_myanmar||row.employee_no||"this employee")}?`,action:()=>remove(row)})}>Delete</button></td></tr>)}</tbody></table>{!filteredRows.length&&<div className="ferry-record-empty"><div>↔</div><strong>No ferry records found</strong><span>Add a new record or adjust your search filters.</span></div>}</div></>}
      {!loading && <div className="ferry-pagination"><span>Showing {filteredRows.length?(currentPage-1)*pageSize+1:0}–{Math.min(currentPage*pageSize,filteredRows.length)} of {filteredRows.length}</span><label>Rows <select value={pageSize} onChange={(event)=>{setPageSize(Number(event.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option><option>500</option><option>1000</option></select></label><button disabled={currentPage===1} onClick={()=>setPage((value)=>Math.max(1,value-1))}>Previous</button><span>Page {currentPage} of {totalPages}</span><button disabled={currentPage===totalPages} onClick={()=>setPage((value)=>Math.min(totalPages,value+1))}>Next</button></div>}
    </section>
    {showFerryVehicles&&<div className="ferry-modal-backdrop" onMouseDown={()=>setShowFerryVehicles(false)}><section className="ferry-modal" onMouseDown={(event)=>event.stopPropagation()}>
      <header><div><p>FERRY VEHICLES</p><h2>Ferry List</h2><span>Add, edit or remove ferry vehicles used by employee records.</span></div><button onClick={()=>setShowFerryVehicles(false)}>×</button></header>
      {ferryVehicleNotice&&<div className="ferry-vehicle-notice">{ferryVehicleNotice}<button onClick={()=>setFerryVehicleNotice("")}>×</button></div>}
      <form className="ferry-vehicle-form" onSubmit={saveFerryVehicle}>
        <div className="ferry-vehicle-form-title"><strong>{editingFerryVehicle?"Update ferry vehicle":"Add a ferry vehicle"}</strong><span>Enter the vehicle and assigned driver information below.</span></div>
        <label>Vehicle Name *<input required value={ferryVehicleForm.vehicleName} onChange={(event)=>updateFerryVehicle("vehicleName",event.target.value)}/></label>
        <label>Vehicle Type<input value={ferryVehicleForm.vehicleType} onChange={(event)=>updateFerryVehicle("vehicleType",event.target.value)}/></label>
        <label>Vehicle Number *<input required value={ferryVehicleForm.vehicleNumber} onChange={(event)=>updateFerryVehicle("vehicleNumber",event.target.value)}/></label>
        <label>Driver Name<input value={ferryVehicleForm.driverName} onChange={(event)=>updateFerryVehicle("driverName",event.target.value)}/></label>
        <label>Driver Phone Number<input value={ferryVehicleForm.driverPhoneNumber} onChange={(event)=>updateFerryVehicle("driverPhoneNumber",event.target.value)}/></label>
        <div className="ferry-vehicle-form-actions"><button type="button" onClick={startNewFerryVehicle}>{editingFerryVehicle?"Cancel edit":"Clear fields"}</button><button className="primary">{editingFerryVehicle?"Save changes":"+ Add Ferry"}</button></div>
      </form>
      <div className="ferry-vehicle-list-heading"><div><h3>Registered Ferry Vehicles</h3><p>Vehicles added here are available in Ferry Management records.</p></div><div className="ferry-vehicle-excel-actions"><button onClick={()=>void downloadFerryVehicleExcel("template")}>⇩ Template</button><button onClick={()=>ferryVehicleFileInput.current?.click()}>⇧ Import Excel</button><button onClick={()=>void downloadFerryVehicleExcel("export")}>↗ Export Excel</button><span>{ferryVehicles.length} vehicle{ferryVehicles.length===1?"":"s"}</span><input ref={ferryVehicleFileInput} hidden type="file" accept=".xlsx" onChange={(event)=>void importFerryVehicles(event.target.files?.[0])}/></div></div>
      {selectedFerryVehicleIds.length>0&&<div className="ferry-vehicle-bulk-toolbar"><span><b>{selectedFerryVehicleIds.length}</b> selected</span><div><button onClick={()=>setSelectedFerryVehicleIds([])}>Clear selection</button><button className="danger" onClick={()=>{const ids=[...selectedFerryVehicleIds];setDeleteConfirmation({title:"Delete selected vehicles?",message:`Are you sure you want to delete ${ids.length} selected vehicle${ids.length===1?"":"s"}?`,action:()=>removeSelectedFerryVehicles(ids)})}}>Remove selected</button></div></div>}
      <div className="ferry-vehicle-list"><table><thead><tr><th className="ferry-vehicle-check"><input aria-label="Select all ferry vehicles" type="checkbox" checked={ferryVehicles.length>0&&ferryVehicles.every((vehicle)=>selectedFerryVehicleIds.includes(String(vehicle.id)))} onChange={(event)=>setSelectedFerryVehicleIds(event.target.checked?ferryVehicles.map((vehicle)=>String(vehicle.id)):[])}/></th><th>Vehicle Name</th><th>Vehicle Type</th><th>Vehicle Number</th><th>Driver Name</th><th>Driver Phone Number</th><th>Action</th></tr></thead><tbody>{ferryVehicles.map((vehicle)=><tr key={String(vehicle.id)} className={selectedFerryVehicleIds.includes(String(vehicle.id))?"selected":""}><td className="ferry-vehicle-check"><input aria-label={`Select ${String(vehicle.vehicle_number)}`} type="checkbox" checked={selectedFerryVehicleIds.includes(String(vehicle.id))} onChange={(event)=>setSelectedFerryVehicleIds((current)=>event.target.checked?Array.from(new Set([...current,String(vehicle.id)])):current.filter((id)=>id!==String(vehicle.id)))}/></td><td><b>{String(vehicle.vehicle_name)}</b></td><td>{String(vehicle.vehicle_type)||"—"}</td><td><span className="ferry-number-chip">{String(vehicle.vehicle_number)}</span></td><td>{String(vehicle.driver_name)||"—"}</td><td>{String(vehicle.driver_phone_number)||"—"}</td><td><button onClick={()=>startEditFerryVehicle(vehicle)}>Edit</button><button className="danger" onClick={()=>setDeleteConfirmation({title:"Delete ferry vehicle?",message:`Are you sure you want to delete vehicle ${String(vehicle.vehicle_number)}?`,action:()=>removeFerryVehicle(vehicle)})}>Remove</button></td></tr>)}</tbody></table>{!ferryVehicles.length&&<div className="ferry-vehicle-empty"><div>▣</div><strong>No ferry vehicles yet</strong><span>Complete the form above to add your first ferry vehicle.</span></div>}</div>
    </section></div>}
    {deleteConfirmation&&<div className="ferry-confirm-backdrop" onMouseDown={()=>!deleting&&setDeleteConfirmation(null)}><section className="ferry-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ferry-confirm-title" aria-describedby="ferry-confirm-message" onMouseDown={(event)=>event.stopPropagation()}><div className="ferry-confirm-icon" aria-hidden="true">!</div><h2 id="ferry-confirm-title">{deleteConfirmation.title}</h2><p id="ferry-confirm-message">{deleteConfirmation.message}</p><div className="ferry-confirm-actions"><button type="button" disabled={deleting} onClick={()=>setDeleteConfirmation(null)}>Cancel</button><button type="button" className="danger" disabled={deleting} onClick={()=>void confirmDelete()}>{deleting?"Deleting…":"Yes, delete"}</button></div></section></div>}
  </div>;
}
