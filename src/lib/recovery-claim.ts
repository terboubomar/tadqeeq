export interface RecoveryDocumentRecord {
  id: string;
  periodId: string;
  exceptionId: string;
  originalName: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
}
