import * as XLSX from "xlsx";

export interface ParsedFile {
  name: string;
  text: string;
  raw: Buffer;
  type: "text" | "pdf" | "excel" | "image";
  base64?: string;
}

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

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

let tesseractWorker: any = null;

async function getTesseract(): Promise<{ worker: any; recognize(buf: Buffer): Promise<string> }> {
  if (!tesseractWorker) {
    const { createWorker } = await import("tesseract.js");
    tesseractWorker = await createWorker("eng");
  }
  return {
    worker: tesseractWorker,
    async recognize(buf: Buffer): Promise<string> {
      const { data } = await tesseractWorker.recognize(buf);
      return (data.text || "").trim();
    },
  };
}

export async function shutdownTesseract(): Promise<void> {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
  }
}

async function ocrImage(buffer: Buffer): Promise<string> {
  try {
    console.log(`[OCR] Starting image OCR, buffer size: ${buffer.length} bytes`);
    const tess = await getTesseract();
    const text = await tess.recognize(buffer);
    console.log(`[OCR] Done, text length: ${text.length}`);
    return text || "(no text found in image)";
  } catch (e: any) {
    console.error(`[OCR] Image OCR failed: ${e?.message ?? e}`);
    return "(OCR failed)";
  }
}

async function ocrPdf(buffer: Buffer): Promise<string> {
  try {
    console.log(`[OCR] Starting PDF OCR, buffer size: ${buffer.length} bytes`);
    const tess = await getTesseract();
    const pdfjsMod = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const canvasMod = await import("canvas");
    const { getDocument } = pdfjsMod;
    const { createCanvas, Image } = canvasMod;

    const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
    const pageTexts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext("2d") as any;
      const orig = ctx.drawImage.bind(ctx);
      ctx.drawImage = function (img: any, ...args: any) {
        if (img && typeof img.toBuffer === "function" && !(img instanceof Image)) {
          const pngBuf = img.toBuffer("image/png");
          if (pngBuf && pngBuf.length > 0) {
            const img2 = new Image();
            img2.src = pngBuf;
            return orig(img2, ...args);
          }
        }
        return orig(img, ...args);
      };
      await (page.render as any)({ canvasContext: ctx, viewport }).promise;
      const png = canvas.toBuffer("image/png");
      const text = await tess.recognize(png);
      pageTexts.push(`[Page ${i}]\n${text || "(no text found)"}`);
      console.log(`[OCR] PDF page ${i}/${doc.numPages}, text length: ${text.length}`);
    }
    return pageTexts.join("\n\n");
  } catch (e: any) {
    console.error(`[OCR] PDF OCR failed: ${e?.message ?? e}`);
    return "(PDF OCR failed)";
  }
}

export async function parseFile(fileName: string, content: string | Buffer, encoding?: string, ocr?: boolean): Promise<ParsedFile> {
  const ext = fileName.toLowerCase().split(".").pop() || "";
  const isBinary = encoding === "base64" || ext === "pdf" || ext === "xlsx" || ext === "xls" || IMAGE_EXTS.has(ext);

  let buffer: Buffer;
  let base64Str: string | undefined;
  if (isBinary && typeof content === "string") {
    buffer = Buffer.from(content, "base64");
    base64Str = content;
  } else if (typeof content === "string") {
    buffer = Buffer.from(content, "utf-8");
  } else {
    buffer = content;
  }

  if (IMAGE_EXTS.has(ext)) {
    const text = ocr ? await ocrImage(buffer) : `[Image: ${fileName}]`;
    return { name: fileName, text, raw: buffer, type: "image", base64: base64Str };
  }

  if (ext === "pdf") {
    let text = await parsePdf(buffer);
    if (ocr && text.replace(/\[Page \d+\]/g, "").trim().length < 5) {
      console.log(`[OCR] PDF text too short (${text.length} chars), falling back to render+OCR`);
      text = await ocrPdf(buffer);
    }
    return { name: fileName, text, raw: buffer, type: "pdf" };
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
