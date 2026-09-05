export type ExportCell = string | number | null | undefined;

const safeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
const pdfEscape = (value: ExportCell) => String(value ?? "—").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7e]/g, "-");
const download = (blob: Blob, filename: string) => { const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = filename; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0); };

export async function exportExcel(title: string, headers: string[], rows: ExportCell[][], token: string) {
  const response = await fetch(`${API}/reports/learning-export`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ title, headers, rows }) });
  if (!response.ok) throw new Error("Unable to export the Excel workbook");
  download(await response.blob(), `${safeName(title)}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportPdf(title: string, headers: string[], rows: ExportCell[][]) {
  const width = 842, height = 595, margin = 28, tableWidth = width - margin * 2, detail = headers.length > 6, rowHeight = detail ? 17 : 23, tableTop = 472, rowsPerPage = Math.max(1, Math.floor((tableTop - 48) / rowHeight));
  const pages: ExportCell[][][] = []; for (let index = 0; index < Math.max(1, rows.length); index += rowsPerPage) pages.push(rows.slice(index, index + rowsPerPage));
  const samples = [headers, ...rows.slice(0, 250).map(row => row.map(value => String(value ?? "")))];
  const weights = headers.map((header, column) => Math.min(detail ? 1.55 : 2.4, Math.max(detail ? .7 : 1, Math.max(header.length, ...samples.map(row => String(row[column] ?? "").length)) / (detail ? 15 : 18))));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0), columnWidths = weights.map(value => tableWidth * value / weightTotal);
  const text = (value: ExportCell, x: number, y: number, size: number, maxWidth: number, bold = false, color = "0.12 0.19 0.34") => { const limit = Math.max(2, Math.floor(maxWidth / (size * .53))), raw = pdfEscape(value), clipped = raw.length > limit ? `${raw.slice(0, Math.max(1, limit - 3))}...` : raw; return `BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${clipped}) Tj ET`; };
  const rect = (x: number, y: number, w: number, h: number, fill: string, stroke = fill) => `${fill} rg ${stroke} RG ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re B`;
  const streams = pages.map((pageRows, pageIndex) => {
    const commands = [rect(0, height - 72, width, 72, "0.027 0.106 0.31"), rect(margin, height - 26, 44, 4, "1 0.796 0.212"), text("COMPANY PORTAL", margin, height - 45, 9, 180, true, "1 1 1"), text(title, margin, height - 63, 18, 560, true, "1 1 1"), text(`L&D DETAIL REPORT  |  ${rows.length.toLocaleString()} RECORDS`, width - 265, height - 47, 8, 235, true, "0.86 0.89 0.96"), text(`Generated ${new Date().toLocaleString()}`, width - 265, height - 61, 7, 235, false, "0.75 0.8 0.9"), text("Learning Management reporting export", margin, 495, 9, 400, true), text(`Page ${pageIndex + 1} of ${pages.length}`, width - 110, 495, 8, 80, true, "0.32 0.27 0.72")];
    let x = margin; headers.forEach((header, column) => { commands.push(rect(x, tableTop, columnWidths[column], rowHeight, "0.396 0.329 0.863", "0.32 0.26 0.75"), text(header, x + 4, tableTop + rowHeight / 2 - 2, detail ? 5.6 : 8, columnWidths[column] - 8, true, "1 1 1")); x += columnWidths[column]; });
    pageRows.forEach((row, rowIndex) => { const y = tableTop - (rowIndex + 1) * rowHeight, fill = rowIndex % 2 ? "0.969 0.973 0.988" : "1 1 1"; let cellX = margin; headers.forEach((_header, column) => { commands.push(rect(cellX, y, columnWidths[column], rowHeight, fill, "0.88 0.9 0.94"), text(row[column], cellX + 4, y + rowHeight / 2 - 2, detail ? 5.3 : 7.7, columnWidths[column] - 8)); cellX += columnWidths[column]; }); });
    commands.push(rect(margin, 22, tableWidth, 2, "1 0.796 0.212"), text("Company Portal  |  People & Operations", margin, 9, 7, 300, false, "0.35 0.42 0.54")); return commands.join("\n");
  });
  const objects: string[] = ["", "<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
  const pageIds: number[] = [];
  streams.forEach(stream => { const pageId = objects.length, contentId = pageId + 1; pageIds.push(pageId); objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`); objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`); });
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n", offsets = [0]; for (let id = 1; id < objects.length; id++) { offsets[id] = pdf.length; pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`; } const xref = pdf.length; pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  download(new Blob([pdf], { type: "application/pdf" }), `${safeName(title)}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
