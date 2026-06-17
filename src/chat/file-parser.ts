import * as XLSX from "xlsx";

export interface ParsedFile {
  name: string;
  text: string;
  raw: Buffer;
  type: "text" | "pdf" | "excel";
}

function padCol(i: number): string {
  let s = "";
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s;
  return s;
}

function formatExcelValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function parseExcel(buffer: Buffer): string {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const parts: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const ref = ws["!ref"];
    if (!ref) {
      parts.push(`[Sheet: ${sheetName}]\n(empty)\n`);
      continue;
    }
    const range = XLSX.utils.decode_range(ref);
    const rows: string[][] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        row.push(cell ? formatExcelValue(cell.v) : "");
      }
      rows.push(row);
    }
    const colWidths: number[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      let maxW = padCol(c).length;
      for (const row of rows) maxW = Math.max(maxW, row[c - range.s.c].length);
      colWidths.push(Math.min(maxW, 40));
    }
    const lines: string[] = [`[Sheet: ${sheetName}]`];
    const hdr = rows[0].map((v, i) => v.padEnd(colWidths[i])).join(" | ");
    lines.push(`| ${hdr} |`);
    const sep = colWidths.map((w) => "-".repeat(w)).join("-|-");
    lines.push(`|-${sep}-|`);
    for (let r = 1; r < rows.length; r++) {
      const vals = rows[r].map((v, i) => v.padEnd(colWidths[i])).join(" | ");
      lines.push(`| ${vals} |`);
    }
    parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  const pages = result.pages.map((p) => `[Page ${p.num}]\n${p.text}`);
  parser.destroy();
  return pages.join("\n\n");
}

export async function parseFile(fileName: string, content: string | Buffer, encoding?: string): Promise<ParsedFile> {
  const ext = fileName.toLowerCase().split(".").pop() || "";
  const isBinary = encoding === "base64" || ext === "pdf" || ext === "xlsx" || ext === "xls";

  let buffer: Buffer;
  if (isBinary && typeof content === "string") {
    buffer = Buffer.from(content, "base64");
  } else if (typeof content === "string") {
    buffer = Buffer.from(content, "utf-8");
  } else {
    buffer = content;
  }

  if (ext === "pdf") {
    return { name: fileName, text: await parsePdf(buffer), raw: buffer, type: "pdf" };
  }

  if (ext === "xlsx" || ext === "xls") {
    return { name: fileName, text: parseExcel(buffer), raw: buffer, type: "excel" };
  }

  return { name: fileName, text: buffer.toString("utf-8"), raw: buffer, type: "text" };
}

export interface ExcelCellEdit {
  cell: string;
  value: string;
}

export function applyExcelEdits(buffer: Buffer, edits: ExcelCellEdit[]): Buffer {
  const wb = XLSX.read(buffer, { type: "buffer" });
  for (const edit of edits) {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) continue;
    XLSX.utils.sheet_add_aoa(sheet, [[edit.value]], {
      origin: edit.cell,
    });
  }
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}
