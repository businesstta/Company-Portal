import { useEffect, useState } from "react";
import "./hr-item-master.css";
const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
const sections = [["main_category", "Main Category", "Main Category"], ["employee_level", "Employee Level", "Level"], ["training_type", "Training Type", "Type"], ["course_category", "Course Category", "Course"]] as const;
type Row = { id?: string; key: string; item_type: string; code: string; name: string; dirty?: boolean };
export default function HRItemMaster({ token }: { token: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch(`${API}/hr-item-master`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Unable to load HR Item Master"); return response.json(); })
      .then((data: Row[]) => setRows(data.map(row => ({ ...row, key: row.id! }))))
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, retry]);
  async function save(row: Row) {
    setSaving(row.key); setError(""); setMessage("");
    try {
      const response = await fetch(`${API}/hr-item-master`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, itemType: row.item_type, code: row.code.trim(), name: row.name.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save item");
      setRows(current => current.map(item => item.key === row.key ? { ...data, key: row.key, dirty: false } : item));
      setMessage("Item saved successfully.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save item"); }
    finally { setSaving(null); }
  }
  async function remove(row: Row) {
    if (saving) return;
    if (row.id && !window.confirm(`Remove "${row.code} — ${row.name}"? This permanently deletes this master item.`)) return;
    setError(""); setMessage("");
    if (!row.id) {
      setRows(current => current.filter(item => item.key !== row.key));
      return;
    }
    setSaving(row.key); setRemoving(true);
    try {
      const response = await fetch(`${API}/hr-item-master/${encodeURIComponent(row.id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Unable to remove item"); }
      setRows(current => current.filter(item => item.key !== row.key));
      setMessage("Item removed successfully.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to remove item"); }
    finally { setSaving(null); setRemoving(false); }
  }
  return <div className="hr-course-master">
    <div className="page-title"><div><p>GENERAL SETTING</p><h1>HR Item Master</h1><span>Manage course codes and categories. Save each row after editing.</span></div></div>
    {error && <p role="alert">{error} <button disabled={!!saving} onClick={() => setRetry(value => value + 1)}>Reload</button></p>}
    {message && <p role="status">{message}</p>}
    {loading ? <p role="status">Loading HR Item Master…</p> : <div className="hr-course-master-grid">{sections.map(([type, title, label]) => <section key={type} aria-label={title}>
      <header><h2>{title}</h2><button type="button" disabled={!!saving} aria-label={`Add ${title} row`} onClick={() => setRows(current => [...current, { key: crypto.randomUUID(), item_type: type, code: "", name: "", dirty: true }])}>+ Add row</button></header>
      <div className="hr-course-master-labels"><span>Code</span><span>{label}</span><span>Action</span></div>
      {rows.filter(row => row.item_type === type).map((row, index) => <form key={row.key} onSubmit={event => { event.preventDefault(); void save(row); }}>
        <input aria-label={`${title} code ${index + 1}`} required maxLength={50} value={row.code} disabled={!!saving} onChange={event => setRows(current => current.map(item => item.key === row.key ? { ...item, code: event.target.value, dirty: true } : item))} />
        <input aria-label={`${label} name ${index + 1}`} required maxLength={180} value={row.name} disabled={!!saving} onChange={event => setRows(current => current.map(item => item.key === row.key ? { ...item, name: event.target.value, dirty: true } : item))} />
        <div className="hr-master-row-actions">
          <button disabled={!!saving || !row.dirty || !row.code.trim() || !row.name.trim()}>{saving === row.key && !removing ? "Saving…" : row.dirty ? "Save" : "Saved"}</button>
          <button type="button" className="hr-master-remove" aria-label={`Remove ${title} row ${index + 1}`} disabled={!!saving} onClick={() => void remove(row)}>{saving === row.key && removing ? "Removing…" : "Remove"}</button>
        </div>
      </form>)}
      {!rows.some(row => row.item_type === type) && <p>No items yet. Use + Add row to get started.</p>}
    </section>)}</div>}
  </div>;
}
