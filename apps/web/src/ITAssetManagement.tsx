import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import "./it-asset-management.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
const assetTypes = ["Laptop", "PC", "Printer", "Scanner", "Copier", "Router", "Switch", "Access Point", "Monitor", "Rack"];
const assetCategories = ["Hardware", "Software"];
const assetTagPrefixes: Record<string, string> = { Laptop: "LAP", PC: "PC", Printer: "PRT", Scanner: "SCN", Copier: "COP", Router: "RTR", Switch: "STH", "Access Point": "AP", Monitor: "MNR", Rack: "RCK" };
const assetStatuses = ["In Stock", "Assigned", "Under Maintenance", "Retired", "Disposed"];
const blankAsset = {
  assetName: "", assetTagCode: "", category: "Hardware", brandManufacturer: "", modelName: "", serialNumber: "", assetType: "Laptop",
  processorCpu: "", ramMemory: "", storage: "", gpu: "", operatingSystem: "", status: "In Stock", officeLocation: "",
  currentAssignedUser: "", department: "", purchaseDate: "", purchasePrice: "", vendorSupplier: "", invoicePoNumber: "",
  warrantyExpiryDate: "",
};
type AssetForm = typeof blankAsset;
type AssetRow = Record<string, unknown>;
type PrintableLabel = { asset: AssetRow; barcodeSource: string; qrSource: string };

const tableColumns: [string, string][] = [
  ["Image", "image_file"], ["Asset Name", "asset_name"], ["Asset Tag/Code", "asset_tag_code"], ["Category", "category"], ["Brand/Manufacturer", "brand_manufacturer"],
  ["Model Name", "model_name"], ["Serial Number", "serial_number"], ["Type", "asset_type"], ["Processor (CPU)", "processor_cpu"],
  ["RAM (Memory)", "ram_memory"], ["Storage", "storage"], ["GPU", "gpu"], ["Operating System", "operating_system"], ["Status", "status"],
  ["Office Location", "office_location"], ["Current Assigned User", "current_assigned_user"], ["Department", "department"], ["Purchase Date", "purchase_date"],
  ["Purchase Price", "purchase_price"], ["Depreciation Rate", "depreciation_rate"], ["Current Book Value", "current_book_value"], ["Vendor/Supplier", "vendor_supplier"], ["Invoice/PO Number", "invoice_po_number"],
  ["Warranty Expiry Date", "warranty_expiry_date"], ["Barcode", "barcode"], ["QR Code", "qr_code"],
];

const text = (value: unknown) => String(value ?? "").trim() || "—";
const dateText = (value: unknown) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString() : "—";

const depreciation = (asset: AssetRow) => {
  const rate = String(asset.category ?? "Hardware") === "Software" ? 1 / 3 : 1 / 5;
  const price = Number(asset.purchase_price);
  const purchased = asset.purchase_date ? new Date(`${String(asset.purchase_date).slice(0, 10)}T00:00:00`) : null;
  if (!Number.isFinite(price) || price < 0 || !purchased || Number.isNaN(purchased.valueOf())) return { rate, bookValue: null };
  const years = Math.max(0, (Date.now() - purchased.valueOf()) / (365.25 * 24 * 60 * 60 * 1000));
  return { rate, bookValue: Math.max(0, price - Math.min(price, price * rate * years)) };
};

function AssetImage({ asset, token, large = false, onOpen }: { asset: AssetRow; token: string; large?: boolean; onOpen?: () => void }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    if (!asset.image_file) { setSource(""); return; }
    let active = true; let objectUrl = "";
    void fetch(`${API}/it-assets/${asset.id}/image`, { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => {
      if (!response.ok || !active) return;
      objectUrl = URL.createObjectURL(await response.blob());
      if (active) setSource(objectUrl);
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset.id, asset.image_file, token]);
  if (!source) return <span className={large ? "it-asset-image-placeholder large" : "it-asset-image-placeholder"}>No image</span>;
  const image = <img className={large ? "it-asset-image large" : "it-asset-image"} src={source} alt={String(asset.asset_name ?? "IT asset")} />;
  return onOpen ? <button type="button" className="it-asset-image-button" onClick={onOpen} aria-label={`View ${String(asset.asset_name ?? "asset")} image`}>{image}<i>View</i></button> : image;
}

function AssetImageViewer({ asset, token, onClose }: { asset: AssetRow; token: string; onClose: () => void }) {
  const [source, setSource] = useState("");
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true; let objectUrl = "";
    void fetch(`${API}/it-assets/${asset.id}/image`, { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => {
      if (!response.ok) throw new Error("Unable to load image");
      const blob = await response.blob(); if (!active) return;
      objectUrl = URL.createObjectURL(blob); setImageBlob(blob); setSource(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset.id, token]);
  const download = () => {
    if (!source || !imageBlob) return;
    const extension = imageBlob.type === "image/png" ? "png" : imageBlob.type === "image/webp" ? "webp" : "jpg";
    const fileName = String(asset.asset_tag_code ?? "it-asset").replace(/[^a-z0-9_-]+/gi, "-");
    const anchor = document.createElement("a"); anchor.href = source; anchor.download = `${fileName}-image.${extension}`; anchor.click();
  };
  return <div className="it-asset-image-viewer-backdrop" onMouseDown={onClose}><section className="it-asset-image-viewer" onMouseDown={(event) => event.stopPropagation()}><header><div><p>ASSET IMAGE</p><h2>{text(asset.asset_name)}</h2><span>{text(asset.asset_tag_code)}</span></div><button onClick={onClose}>×</button></header><div className="it-asset-image-viewer-body">{source ? <img src={source} alt={String(asset.asset_name ?? "IT asset")} /> : failed ? <p>Unable to load this asset image.</p> : <p>Loading image…</p>}</div><footer><span>Original uploaded image</span><button disabled={!source} onClick={download}>Download image</button></footer></section></div>;
}

function PrintableAssetLabel({ asset, barcodeSource, qrSource }: { asset: AssetRow; barcodeSource: string; qrSource: string }) {
  const location = text(asset.office_location) !== "—" ? text(asset.office_location) : text(asset.category);
  return (
    <article className="batch-asset-label">
      <header>
        <div className="batch-asset-title-row">
          <h2>{text(asset.asset_name)}</h2>
          <b>IT Asset</b>
        </div>
        <div>
          <strong>{text(asset.asset_tag_code)}</strong>
          <span>{text(asset.asset_type)}</span>
          <span>{location}</span>
        </div>
      </header>
      <main>
        <img src={barcodeSource} alt="Barcode" />
        <img src={qrSource} alt="QR Code" />
      </main>
    </article>
  );
}

export default function ITAssetManagement({ token, onNavigate }: { token: string; onNavigate?: (page: string) => void }) {
  const headers = { Authorization: `Bearer ${token}` };
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AssetRow | null>(null);
  const [form, setForm] = useState<AssetForm>(blankAsset);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [step, setStep] = useState(1);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [deleteAsset, setDeleteAsset] = useState<AssetRow | null>(null);
  const [codeAsset, setCodeAsset] = useState<AssetRow | null>(null);
  const [labelQuantity, setLabelQuantity] = useState(1);
  const [printMode, setPrintMode] = useState<"single" | "bartender">("single");
  const [barcodeSource, setBarcodeSource] = useState("");
  const [qrSource, setQrSource] = useState("");
  const [batchPrintLabels, setBatchPrintLabels] = useState<PrintableLabel[]>([]);
  const [imageAsset, setImageAsset] = useState<AssetRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showWriteOff, setShowWriteOff] = useState(false);
  const [writingOff, setWritingOff] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [spreadsheetBusy, setSpreadsheetBusy] = useState("");
  const barcodeRef = useRef<SVGSVGElement>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!imageFile) { setImagePreview(""); return; }
    const objectUrl = URL.createObjectURL(imageFile); setImagePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`${API}/it-assets`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const rows: AssetRow[] = response.ok ? await response.json() : [];
    setAssets(rows);
    const activeIds = new Set(rows.map((row) => String(row.id)));
    setSelectedAssetIds((current) => current.filter((id) => activeIds.has(id)));
    if (!response.ok) setNotice({ type: "error", message: "Unable to load IT asset records." });
    setLoading(false);
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!codeAsset || !barcodeRef.current || !qrRef.current) return;
    const barcodeValue = String(codeAsset.barcode ?? codeAsset.asset_tag_code ?? "");
    const qrValue = String(codeAsset.qr_code ?? `IT-ASSET:${barcodeValue}`);
    JsBarcode(barcodeRef.current, barcodeValue, { format: "CODE128", width: 2, height: 72, margin: 12, fontSize: 16, background: "#ffffff", lineColor: "#172033" });
    setBarcodeSource(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(barcodeRef.current))}`);
    void QRCode.toCanvas(qrRef.current, qrValue, { width: 224, margin: 2, errorCorrectionLevel: "M", color: { dark: "#172033", light: "#ffffff" } });
    void QRCode.toDataURL(qrValue, { width: 224, margin: 2, errorCorrectionLevel: "M", color: { dark: "#172033", light: "#ffffff" } }).then(setQrSource);
  }, [codeAsset]);
  useEffect(() => { const reset = () => { setPrintMode("single"); setBatchPrintLabels([]); }; window.addEventListener("afterprint", reset); return () => window.removeEventListener("afterprint", reset); }, []);
  useEffect(() => { document.body.classList.toggle("bartender-printing", printMode === "bartender"); return () => document.body.classList.remove("bartender-printing"); }, [printMode]);

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return assets.filter((asset) => {
      const searchable = tableColumns.map(([, key]) => String(asset[key] ?? "")).join(" ").toLowerCase();
      return (!query || searchable.includes(query)) && (!categoryFilter || asset.category === categoryFilter) &&
        (!typeFilter || asset.asset_type === typeFilter) && (!statusFilter || asset.status === statusFilter);
    });
  }, [assets, categoryFilter, search, statusFilter, typeFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedAssets = filteredAssets.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const filteredAssetIds = filteredAssets.map((asset) => String(asset.id));
  const allFilteredAssetsSelected = filteredAssetIds.length > 0 && filteredAssetIds.every((id) => selectedAssetIds.includes(id));
  const selectedAssets = assets.filter((asset) => selectedAssetIds.includes(String(asset.id)));

  const update = (key: keyof AssetForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const openNew = () => { setEditing(null); setImageFile(null); setForm(blankAsset); setStep(1); setShowForm(true); };
  const openEdit = (asset: AssetRow) => {
    setEditing(asset);
    setForm({
      assetName: String(asset.asset_name ?? ""), assetTagCode: String(asset.asset_tag_code ?? ""), category: String(asset.category ?? "Hardware"),
      brandManufacturer: String(asset.brand_manufacturer ?? ""), modelName: String(asset.model_name ?? ""), serialNumber: String(asset.serial_number ?? ""), assetType: String(asset.asset_type ?? "Laptop"),
      processorCpu: String(asset.processor_cpu ?? ""), ramMemory: String(asset.ram_memory ?? ""), storage: String(asset.storage ?? ""), gpu: String(asset.gpu ?? ""), operatingSystem: String(asset.operating_system ?? ""),
      status: String(asset.status ?? "In Stock"), officeLocation: String(asset.office_location ?? ""), currentAssignedUser: String(asset.current_assigned_user ?? ""), department: String(asset.department ?? ""),
      purchaseDate: String(asset.purchase_date ?? "").slice(0, 10), purchasePrice: String(asset.purchase_price ?? ""), vendorSupplier: String(asset.vendor_supplier ?? ""), invoicePoNumber: String(asset.invoice_po_number ?? ""),
      warrantyExpiryDate: String(asset.warranty_expiry_date ?? "").slice(0, 10),
    });
    setImageFile(null); setStep(1); setShowForm(true);
  };
  const next = () => {
    if (step === 1 && (!form.assetName.trim() || !form.category || !form.assetType || !form.status)) {
      setNotice({ type: "error", message: "Complete all required Basic Info fields before continuing." }); return;
    }
    setStep((current) => Math.min(3, current + 1));
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step < 3) {
      next();
      return;
    }
    if (!form.assetName.trim()) return setNotice({ type: "error", message: "Asset Name is required." });
    const response = await fetch(`${API}/it-assets${editing ? `/${editing.id}` : ""}`, {
      method: editing ? "PUT" : "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, purchaseDate: form.purchaseDate || null, purchasePrice: form.purchasePrice === "" ? null : Number(form.purchasePrice), warrantyExpiryDate: form.warrantyExpiryDate || null }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return setNotice({ type: "error", message: String(result.error ?? result.details?.[0]?.message ?? "Unable to save IT asset.") });
    let savedAsset = result as AssetRow;
    if (imageFile) {
      const imageBody = new FormData(); imageBody.append("image", imageFile);
      const imageResponse = await fetch(`${API}/it-assets/${result.id}/image`, { method: "POST", headers, body: imageBody });
      const imageResult = await imageResponse.json().catch(() => ({}));
      if (!imageResponse.ok) { setShowForm(false); setImageFile(null); setEditing(null); setNotice({ type: "error", message: `Asset was saved, but the image upload failed: ${String(imageResult.error ?? "Please edit the asset and try again.")}` }); await load(); return; }
      savedAsset = imageResult as AssetRow;
    }
    setShowForm(false); setCodeAsset(savedAsset); setImageFile(null); setEditing(null); setForm(blankAsset); setNotice({ type: "success", message: editing ? "IT asset updated successfully. Barcode and QR Code are ready." : "IT asset added successfully. Barcode and QR Code were generated automatically." }); await load();
  };
  const remove = async () => {
    if (!deleteAsset || deleting) return;
    setDeleting(true);
    const response = await fetch(`${API}/it-assets/${deleteAsset.id}`, { method: "DELETE", headers });
    if (response.ok) { setDeleteAsset(null); setNotice({ type: "success", message: "IT asset deleted successfully." }); await load(); }
    else setNotice({ type: "error", message: "Unable to delete IT asset." });
    setDeleting(false);
  };
  const removeSelected = async () => {
    if (!selectedAssetIds.length || deleting) return;
    setDeleting(true);
    const response = await fetch(`${API}/it-assets`, { method: "DELETE", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ ids: selectedAssetIds }) });
    const result = await response.json().catch(() => ({}));
    if (response.ok) { const removed = Number(result.removed ?? selectedAssetIds.length); setShowBulkDelete(false); setSelectedAssetIds([]); setNotice({ type: "success", message: `${removed} IT asset${removed === 1 ? "" : "s"} deleted successfully.` }); await load(); }
    else setNotice({ type: "error", message: String(result.error ?? "Unable to delete selected IT assets.") });
    setDeleting(false);
  };
  const writeOffSelected = async () => {
    if (!selectedAssetIds.length || writingOff) return;
    setWritingOff(true);
    const response = await fetch(`${API}/it-assets/write-off`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ ids: selectedAssetIds }) });
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      const count = Number(result.writtenOff ?? selectedAssetIds.length);
      setShowWriteOff(false); setSelectedAssetIds([]); setNotice({ type: "success", message: `${count} IT asset${count === 1 ? "" : "s"} written off successfully.` }); await load();
    } else setNotice({ type: "error", message: String(result.error ?? "Unable to write off the selected IT assets.") });
    setWritingOff(false);
  };
  const clearFilters = () => { setSearch(""); setCategoryFilter(""); setTypeFilter(""); setStatusFilter(""); setPage(1); };
  const downloadSpreadsheet = async (kind: "template" | "export") => {
    setSpreadsheetBusy(kind);
    const params = new URLSearchParams(); if (kind === "export") { if (search.trim()) params.set("search", search.trim()); if (categoryFilter) params.set("category", categoryFilter); if (typeFilter) params.set("type", typeFilter); if (statusFilter) params.set("status", statusFilter); }
    const response = await fetch(`${API}/it-assets/${kind}${params.size ? `?${params}` : ""}`, { headers });
    if (!response.ok) { setNotice({ type: "error", message: `Unable to download the IT asset ${kind}.` }); setSpreadsheetBusy(""); return; }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = kind === "template" ? "it-assets-template.xlsx" : `it-assets-${new Date().toISOString().slice(0, 10)}.xlsx`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0); setSpreadsheetBusy("");
  };
  const importSpreadsheet = async (file: File | null) => {
    if (!file) return;
    setSpreadsheetBusy("import"); const body = new FormData(); body.append("file", file); const response = await fetch(`${API}/it-assets/import`, { method: "POST", headers, body }); const result = await response.json().catch(() => ({}));
    if (!response.ok) setNotice({ type: "error", message: String(result.error ?? "Unable to import IT assets.") });
    else { const firstError = result.errors?.[0] ? ` First issue: Row ${result.errors[0].row}: ${result.errors[0].message}` : ""; setNotice({ type: result.skipped ? "error" : "success", message: `Imported ${result.imported}, updated ${result.updated}, skipped ${result.skipped}.${firstError}` }); await load(); }
    setSpreadsheetBusy(""); if (importInputRef.current) importInputRef.current.value = "";
  };
  const assetFileName = () => String(codeAsset?.asset_tag_code ?? "it-asset").replace(/[^a-z0-9_-]+/gi, "-");
  const downloadBarcode = () => {
    if (!barcodeRef.current) return;
    const source = new XMLSerializer().serializeToString(barcodeRef.current);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${assetFileName()}-barcode.svg`; anchor.click(); URL.revokeObjectURL(url);
  };
  const downloadQr = () => qrRef.current?.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${assetFileName()}-qr.png`; anchor.click(); URL.revokeObjectURL(url);
  }, "image/png");
  const printLabels = (mode: "single" | "bartender") => {
    setBatchPrintLabels([]);
    setPrintMode(mode);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()));
  };
  const printSelectedLabels = async () => {
    const selectedAssets = assets.filter((asset) => selectedAssetIds.includes(String(asset.id)));
    if (!selectedAssets.length) return;
    try {
      const labels = await Promise.all(selectedAssets.map(async (asset) => {
        const barcodeValue = String(asset.barcode ?? asset.asset_tag_code ?? "");
        const qrValue = String(asset.qr_code ?? `IT-ASSET:${barcodeValue}`);
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        JsBarcode(svg, barcodeValue, { format: "CODE128", width: 2, height: 72, margin: 12, fontSize: 16, background: "#ffffff", lineColor: "#172033" });
        return { asset, barcodeSource: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`, qrSource: await QRCode.toDataURL(qrValue, { width: 224, margin: 2, errorCorrectionLevel: "M", color: { dark: "#172033", light: "#ffffff" } }) };
      }));
      setBatchPrintLabels(labels); setPrintMode("bartender");
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()));
    } catch { setNotice({ type: "error", message: "Unable to prepare the selected asset labels." }); }
  };
  const bartenderLabels: PrintableLabel[] = batchPrintLabels.length ? batchPrintLabels : codeAsset && barcodeSource && qrSource ? Array.from({ length: labelQuantity }, () => ({ asset: codeAsset, barcodeSource, qrSource })) : [];

  return <div className="it-asset-page">
    <div className="page-title"><div><p>INFORMATION TECHNOLOGY</p><h1>IT Asset Management</h1><span>Register, assign and track technology assets through their full lifecycle.</span></div><div className="it-asset-page-actions"><button disabled={Boolean(spreadsheetBusy)} onClick={() => void downloadSpreadsheet("template")}>{spreadsheetBusy === "template" ? "Preparing…" : "⇩ Excel template"}</button><button disabled={Boolean(spreadsheetBusy)} onClick={() => importInputRef.current?.click()}>{spreadsheetBusy === "import" ? "Importing…" : "⇧ Import Excel"}</button><button disabled={Boolean(spreadsheetBusy)} onClick={() => void downloadSpreadsheet("export")}>{spreadsheetBusy === "export" ? "Exporting…" : "↗ Export Excel"}</button><button className="primary" onClick={openNew}>+ Add IT Asset</button><input ref={importInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void importSpreadsheet(event.target.files?.[0] ?? null)} /></div></div>
    {notice && <div className={`it-asset-notice ${notice.type}`}><span>{notice.type === "success" ? "✓" : "!"}</span><p>{notice.message}</p><button onClick={() => setNotice(null)}>×</button></div>}
    <section className="employee-filter-card it-asset-filter"><div className="employee-filter-heading"><div><h2>Filter IT assets</h2><p>Search by asset, tag, serial number, assigned user, department or supplier.</p></div><button onClick={clearFilters}>Clear filters</button></div><div className="it-asset-filter-grid">
      <label>Search<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Asset, tag, serial, user..." /></label>
      <label>Category<select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}><option value="">All categories</option>{assetCategories.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Type<select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }}><option value="">All types</option>{assetTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="">All statuses</option>{assetStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
    </div></section>
    <section className="data-card it-asset-table-card">{loading ? <div className="loading">Loading IT assets…</div> : <>{selectedAssetIds.length > 0 && <div className="it-asset-bulk-toolbar"><span><b>{selectedAssetIds.length}</b> selected</span><div><button onClick={() => setSelectedAssetIds([])}>Clear selection</button><button className="workflow" onClick={() => setShowWriteOff(true)}>IT Asset Write-Off Form</button><button className="workflow" onClick={() => onNavigate?.("IT Asset Transfer Form")}>IT Asset Transfer Form</button><button onClick={() => void printSelectedLabels()}>Print selected labels</button><button className="danger" onClick={() => setShowBulkDelete(true)}>Delete selected</button></div></div>}<div className="it-asset-table-scroll"><table><thead><tr><th className="it-asset-select-cell"><input type="checkbox" aria-label="Select all filtered IT assets" checked={allFilteredAssetsSelected} onChange={(event) => setSelectedAssetIds((current) => event.target.checked ? Array.from(new Set([...current, ...filteredAssetIds])) : current.filter((id) => !filteredAssetIds.includes(id)))} /></th>{tableColumns.map(([label]) => <th key={label}>{label}</th>)}<th>Action</th></tr></thead><tbody>{pagedAssets.map((asset) => { const id = String(asset.id); const selected = selectedAssetIds.includes(id); const depreciationValues = depreciation(asset); return <tr key={id} className={selected ? "selected" : ""}><td className="it-asset-select-cell"><input type="checkbox" aria-label={`Select ${String(asset.asset_name ?? "IT asset")}`} checked={selected} onChange={(event) => setSelectedAssetIds((current) => event.target.checked ? Array.from(new Set([...current, id])) : current.filter((value) => value !== id))} /></td>{tableColumns.map(([, key]) => <td key={key}>{key === "image_file" ? <AssetImage asset={asset} token={token} onOpen={asset.image_file ? () => setImageAsset(asset) : undefined} /> : key === "status" ? <span className={`it-asset-status ${String(asset.status ?? "").toLowerCase().replace(/\s+/g, "-")}`}>{text(asset[key])}</span> : key === "barcode" ? <code className="it-asset-code-value">{text(asset[key])}</code> : key === "qr_code" ? <button className="it-asset-view-code" onClick={() => setCodeAsset(asset)}>View QR</button> : key === "depreciation_rate" ? `${(depreciationValues.rate * 100).toFixed(2)}% / year` : key === "current_book_value" ? depreciationValues.bookValue === null ? "—" : depreciationValues.bookValue.toLocaleString(undefined, { maximumFractionDigits: 2 }) : key.includes("date") ? dateText(asset[key]) : key === "purchase_price" && asset[key] !== null ? Number(asset[key]).toLocaleString() : text(asset[key])}</td>)}<td className="it-asset-actions"><button onClick={() => setCodeAsset(asset)}>Codes</button><button onClick={() => openEdit(asset)}>Edit</button><button className="danger" onClick={() => setDeleteAsset(asset)}>Delete</button></td></tr>; })}</tbody></table>{!filteredAssets.length && <div className="loading">No IT assets match the selected filters.</div>}</div></>}
      {!loading && filteredAssets.length > 0 && <div className="employee-pagination"><div>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredAssets.length)} of {filteredAssets.length} assets</div><div className="pagination-controls"><label>Rows<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option>10</option><option>25</option><option>50</option><option>100</option></select></label><button disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><span>Page {currentPage} of {totalPages}</span><button disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</button></div></div>}
    </section>
    {showForm && <div className="it-asset-modal-backdrop" onMouseDown={() => setShowForm(false)}><section className="it-asset-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><p>IT ASSET</p><h2>{editing ? "Edit IT asset" : "Register IT asset"}</h2><span>Complete the three steps below. You can return to an earlier step without losing entered data.</span></div><button onClick={() => setShowForm(false)}>×</button></header>
      <div className="it-asset-steps">{["Basic Info", "Tech Specs", "Purchase Details"].map((label, index) => <button type="button" key={label} className={`${step === index + 1 ? "active" : ""}${step > index + 1 ? " complete" : ""}`} onClick={() => step > index + 1 && setStep(index + 1)}><i>{step > index + 1 ? "✓" : index + 1}</i><span><small>STEP {index + 1}</small><b>{label}</b></span></button>)}</div>
      <form onSubmit={save}>{step === 1 && <div className="it-asset-form-grid"><label>Asset Name *<input value={form.assetName} onChange={(event) => update("assetName", event.target.value)} required /></label><label>Asset Tag/Code (Auto-generated)<input value={form.assetTagCode} placeholder={`${assetTagPrefixes[form.assetType]}-xxxxxx`} readOnly /><small>{editing ? "Asset Tag/Code remains fixed when editing." : `Generated automatically from Type when saved, e.g. ${assetTagPrefixes[form.assetType]}-000001.`}</small></label><label>Category *<select value={form.category} onChange={(event) => update("category", event.target.value)}>{assetCategories.map((value) => <option key={value}>{value}</option>)}</select></label><label>Brand/Manufacturer<input value={form.brandManufacturer} onChange={(event) => update("brandManufacturer", event.target.value)} /></label><label>Model Name<input value={form.modelName} onChange={(event) => update("modelName", event.target.value)} /></label><label>Serial Number<input value={form.serialNumber} onChange={(event) => update("serialNumber", event.target.value)} /></label><label>Type *<select value={form.assetType} onChange={(event) => update("assetType", event.target.value)}>{assetTypes.map((value) => <option key={value}>{value}</option>)}</select></label><label>Status *<select value={form.status} onChange={(event) => update("status", event.target.value)}>{assetStatuses.map((value) => <option key={value}>{value}</option>)}</select></label><label>Office Location<input value={form.officeLocation} onChange={(event) => update("officeLocation", event.target.value)} /></label><label>Current Assigned User<input value={form.currentAssignedUser} onChange={(event) => update("currentAssignedUser", event.target.value)} /></label><label>Department<input value={form.department} onChange={(event) => update("department", event.target.value)} /></label><label className="it-asset-image-field">Asset Image<div className="it-asset-upload-preview">{imagePreview ? <img src={imagePreview} alt="Selected asset preview" /> : editing?.image_file ? <AssetImage asset={editing} token={token} large /> : <span><b>Upload asset photo</b><small>JPG, PNG or WebP · Maximum 5 MB</small></span>}</div><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && file.size > 5 * 1024 * 1024) { event.target.value = ""; setImageFile(null); setNotice({ type: "error", message: "Asset image must be 5 MB or smaller." }); return; } setImageFile(file); }} /></label></div>}
        {step === 2 && <><div className="it-asset-step-note"><b>{form.assetType === "Laptop" || form.assetType === "PC" ? `${form.assetType} technical specifications` : "Optional technical specifications"}</b><span>CPU, memory, storage, GPU and operating system are most relevant for Laptop and PC assets.</span></div><div className="it-asset-form-grid tech"><label>Processor (CPU)<input value={form.processorCpu} onChange={(event) => update("processorCpu", event.target.value)} placeholder="e.g. Intel Core i7-1365U" /></label><label>RAM (Memory)<input value={form.ramMemory} onChange={(event) => update("ramMemory", event.target.value)} placeholder="e.g. 16 GB DDR5" /></label><label>Storage<input value={form.storage} onChange={(event) => update("storage", event.target.value)} placeholder="e.g. 512 GB NVMe SSD" /></label><label>GPU<input value={form.gpu} onChange={(event) => update("gpu", event.target.value)} placeholder="e.g. Intel Iris Xe" /></label><label>Operating System<input value={form.operatingSystem} onChange={(event) => update("operatingSystem", event.target.value)} placeholder="e.g. Windows 11 Pro" /></label></div></>}
        {step === 3 && <><div className="it-asset-form-grid"><label>Purchase Date<input type="date" value={form.purchaseDate} onChange={(event) => update("purchaseDate", event.target.value)} /></label><label>Purchase Price<input type="number" min="0" step="0.01" value={form.purchasePrice} onChange={(event) => update("purchasePrice", event.target.value)} /></label><label>Vendor/Supplier<input value={form.vendorSupplier} onChange={(event) => update("vendorSupplier", event.target.value)} /></label><label>Invoice/PO Number<input value={form.invoicePoNumber} onChange={(event) => update("invoicePoNumber", event.target.value)} /></label><label>Warranty Expiry Date<input type="date" value={form.warrantyExpiryDate} onChange={(event) => update("warrantyExpiryDate", event.target.value)} /></label></div><div className="it-asset-auto-code-note"><span>▥</span><div><b>Asset Tag, Barcode and QR Code will be generated automatically</b><p>The new asset will use <strong>{form.assetTagCode || `${assetTagPrefixes[form.assetType]}-xxxxxx`}</strong>. A preview will open after the asset is saved.</p></div></div></>}
        <footer><button type="button" onClick={() => setShowForm(false)}>Cancel</button>{step > 1 && <button type="button" onClick={() => setStep((current) => current - 1)}>Back</button>}{step < 3 ? <button type="submit" className="primary">Continue</button> : <button type="submit" className="primary">{editing ? "Save changes" : "Register asset"}</button>}</footer></form>
    </section></div>}
    {showWriteOff && <div className="it-asset-writeoff-backdrop" onMouseDown={() => !writingOff && setShowWriteOff(false)}><section className="it-asset-writeoff-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><p>IT ASSET WRITE-OFF</p><h2>Write off selected assets</h2><span>Review the locked asset details before confirming this write-off.</span></div><button type="button" onClick={() => setShowWriteOff(false)}>×</button></header><form onSubmit={(event) => { event.preventDefault(); void writeOffSelected(); }}><div className="it-asset-writeoff-summary"><b>{selectedAssets.length}</b><span>selected asset{selectedAssets.length === 1 ? "" : "s"}</span><small>Submitting changes Status to Disposed and records a permanent write-off snapshot.</small></div><div className="it-asset-writeoff-list">{selectedAssets.map((asset, index) => <fieldset disabled key={String(asset.id)}><legend>Asset {index + 1}</legend><div className="it-asset-writeoff-grid">{[["Asset Name","asset_name"],["Asset Tag/Code","asset_tag_code"],["Category","category"],["Brand/Manufacturer","brand_manufacturer"],["Model Name","model_name"],["Serial Number","serial_number"],["Type","asset_type"],["Status","status"],["Current Assigned User","current_assigned_user"],["Department","department"],["Office Location","office_location"]].map(([label,key]) => <label key={key}>{label}<input value={String(asset[key] ?? "")} readOnly /></label>)}</div></fieldset>)}</div><footer><button type="button" disabled={writingOff} onClick={() => setShowWriteOff(false)}>Cancel</button><button type="submit" className="primary" disabled={writingOff}>{writingOff ? "Submitting…" : `Confirm write-off (${selectedAssets.length})`}</button></footer></form></section></div>}
    {imageAsset && <AssetImageViewer asset={imageAsset} token={token} onClose={() => setImageAsset(null)} />}
    {codeAsset && <div className={`it-asset-code-backdrop ${printMode === "bartender" ? "bartender-print-mode" : ""}`} onMouseDown={() => setCodeAsset(null)}><section className="it-asset-code-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><p>IT ASSET LABEL</p><h2>{text(codeAsset.asset_name)}</h2><div className="it-asset-label-meta"><span>Asset Tag: {text(codeAsset.asset_tag_code)}</span><b>{text(codeAsset.asset_type)}</b><em>{text(codeAsset.office_location) !== "—" ? text(codeAsset.office_location) : text(codeAsset.category)}</em></div></div><button onClick={() => setCodeAsset(null)}>×</button></header><div className="it-asset-code-previews"><article><h3>Barcode</h3><div className="barcode-canvas"><svg ref={barcodeRef} /></div><button onClick={downloadBarcode}>Download SVG</button></article><article><h3>QR Code</h3><div className="qr-canvas"><canvas ref={qrRef} /></div><button onClick={downloadQr}>Download PNG</button></article></div><footer><p><span className="label-screen-note">Single label: <b>100 × 60 mm</b></span><span className="label-print-note"><strong>{text(codeAsset.asset_tag_code)}</strong></span></p><div className="bartender-print-controls"><label>Quantity<input type="number" min="1" max="500" value={labelQuantity} onChange={(event) => setLabelQuantity(Math.min(500, Math.max(1, Number(event.target.value) || 1)))} /></label><small>BarTender Letter sheet · 10 labels per page · 101.6 × 50.8 mm</small><button onClick={() => printLabels("single")}>Print single</button><button className="primary" onClick={() => printLabels("bartender")}>Print BarTender sheet</button></div></footer></section></div>}
    {bartenderLabels.length > 0 && createPortal(<div className={`it-asset-bartender-sheet ${printMode === "bartender" ? "active" : ""}`}>{Array.from({ length: Math.ceil(bartenderLabels.length / 10) }, (_, pageIndex) => <section className="bartender-sheet-page" key={pageIndex}>{bartenderLabels.slice(pageIndex * 10, pageIndex * 10 + 10).map((label, labelIndex) => <PrintableAssetLabel key={`${pageIndex}-${labelIndex}-${String(label.asset.id)}`} asset={label.asset} barcodeSource={label.barcodeSource} qrSource={label.qrSource} />)}</section>)}</div>, document.body)}
    {deleteAsset && <div className="it-asset-confirm-backdrop" onMouseDown={() => !deleting && setDeleteAsset(null)}><section role="alertdialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><i>!</i><h2>Delete IT asset?</h2><p>Delete <b>{text(deleteAsset.asset_name)}</b> ({text(deleteAsset.asset_tag_code)}) from the active asset list?</p><div><button disabled={deleting} onClick={() => setDeleteAsset(null)}>Cancel</button><button className="danger" disabled={deleting} onClick={() => void remove()}>{deleting ? "Deleting…" : "Yes, delete"}</button></div></section></div>}
    {showBulkDelete && <div className="it-asset-confirm-backdrop" onMouseDown={() => !deleting && setShowBulkDelete(false)}><section role="alertdialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><i>!</i><h2>Delete selected IT assets?</h2><p>Are you sure you want to delete <b>{selectedAssetIds.length}</b> selected IT asset{selectedAssetIds.length === 1 ? "" : "s"}?</p><div><button disabled={deleting} onClick={() => setShowBulkDelete(false)}>Cancel</button><button className="danger" disabled={deleting} onClick={() => void removeSelected()}>{deleting ? "Deleting…" : "Yes, delete"}</button></div></section></div>}
  </div>;
}
