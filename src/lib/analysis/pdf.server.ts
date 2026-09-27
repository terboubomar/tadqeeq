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
  const [{ getDocument }, worker] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ]);
  // On the server PDF.js runs its worker in-process ("fake worker"). By default it loads
  // pdf.worker.mjs with a runtime import that the Cloudflare Worker bundle cannot resolve
  // ("No such module _libs/pdf.worker.mjs"), so register the bundled handler up front.
  const pdfjsGlobal = globalThis as typeof globalThis & { pdfjsWorker?: { WorkerMessageHandler: unknown } };
  pdfjsGlobal.pdfjsWorker ??= { WorkerMessageHandler: worker.WorkerMessageHandler };

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
