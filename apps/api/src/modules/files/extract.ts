import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { HttpError } from "../../http.js";

const require = createRequire(import.meta.url);

const EXTENSIONS = new Map([
  ["pdf", "application/pdf"],
  ["txt", "text/plain"],
  ["md", "text/markdown"],
  ["csv", "text/csv"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
]);

export function safeFilename(original: string): { filename: string; extension: string; contentType: string } {
  const base = original.split(/[/\\]/).pop()?.replace(/[^\w.\- ]+/g, "").trim() || "upload";
  const extension = base.split(".").pop()?.toLowerCase() ?? "";
  const contentType = EXTENSIONS.get(extension);
  if (!contentType) {
    throw new HttpError(415, "unsupported_media_type", "Upload a pdf, docx, txt, md, or csv file");
  }
  return { filename: base.slice(0, 180), extension, contentType };
}

export async function extractText(filename: string, buffer: Buffer): Promise<string> {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "txt" || extension === "md" || extension === "csv") {
    if (buffer.includes(0)) throw new HttpError(400, "invalid_file", "Text file contains binary data");
    return buffer.toString("utf8");
  }
  if (extension === "pdf") {
    if (!buffer.subarray(0, 5).toString("utf8").startsWith("%PDF")) {
      throw new HttpError(400, "invalid_file", "File is not a PDF");
    }
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs") as typeof import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
    ).href;
    const document = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: true,
    }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    await document.destroy();
    return pages.join("\n");
  }
  if (extension === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  throw new HttpError(415, "unsupported_media_type", "Upload a pdf, docx, txt, md, or csv file");
}
