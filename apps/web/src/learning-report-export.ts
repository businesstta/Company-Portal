export type ExportCell = string | number | null | undefined;

const safeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const xmlEscape = (value: ExportCell) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pdfEscape = (value: ExportCell) => String(value ?? "—").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7e]/g, "-");
const download = (blob: Blob, filename: string) => { const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = filename; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0); };

export function exportExcel(title: string, headers: string[], rows: ExportCell[][]) {
  const cells = (values: ExportCell[], header = false) => `<Row>${values.map(value => `<Cell${header ? ' ss:StyleID="Header"' : ""}><Data ss:Type="${typeof value === "number" ? "Number" : "String"}">${xmlEscape(value)}</Data></Cell>`).join("")}</Row>`;
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#6554DC" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="Report"><Table>${cells(headers, true)}${rows.map(row => cells(row)).join("")}</Table></Worksheet></Workbook>`;
  download(new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" }), `${safeName(title)}-${new Date().toISOString().slice(0, 10)}.xls`);
}

export function exportPdf(title: string, headers: string[], rows: ExportCell[][]) {
  const lines = [title, `Generated: ${new Date().toLocaleString()}`, "", headers.join(" | "), ...rows.map(row => row.map(value => String(value ?? "—")).join(" | "))];
  const pages: string[][] = []; for (let index = 0; index < lines.length; index += 44) pages.push(lines.slice(index, index + 44));
  const objects: string[] = ["", "<< /Type /Catalog /Pages 2 0 R >>", ""];
  const pageIds: number[] = [];
  pages.forEach(page => { const pageId = objects.length, contentId = pageId + 1; pageIds.push(pageId); objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${contentId + 1} 0 R >> >> /Contents ${contentId} 0 R >>`); const stream = `BT /F1 8 Tf 28 565 Td 11 TL ${page.map((line, index) => `${index ? "T* " : ""}(${pdfEscape(line).slice(0, 155)}) Tj`).join(" ")} ET`; objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`); objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"); });
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n", offsets = [0]; for (let id = 1; id < objects.length; id++) { offsets[id] = pdf.length; pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`; } const xref = pdf.length; pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  download(new Blob([pdf], { type: "application/pdf" }), `${safeName(title)}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
