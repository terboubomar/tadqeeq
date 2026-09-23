/**
 * Server-side PDF text extraction for authoritative audit analysis.
 *
 * Uses PDF.js' Node-compatible legacy build. Raw PDF bytes stay inside the
 * trusted server import boundary and are not sent to the AI layer.
 */
export async function extractPdfTextServer(
  file: ArrayBuffer,
  maxPages = 3,
): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({ data: new Uint8Array(file) });
  const doc = await loadingTask.promise;

  try {
    const pages = Math.min(doc.numPages, maxPages);
    const chunks: string[] = [];

    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      chunks.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" "),
      );
      page.cleanup();
    }

    return chunks.join("\n");
  } finally {
    await loadingTask.destroy();
  }
}
