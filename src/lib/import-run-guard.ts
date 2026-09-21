export interface ImportRunLock {
  current: boolean;
}

export function acquireImportRun(lock: ImportRunLock): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseImportRun(lock: ImportRunLock): void {
  lock.current = false;
}
