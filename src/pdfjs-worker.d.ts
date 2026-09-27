// pdfjs-dist ships no types for its worker entry; the server only needs the handler it exports.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
