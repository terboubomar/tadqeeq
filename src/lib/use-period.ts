import { useQuery } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";

import { listPeriods, recallPeriod, rememberPeriod, type StoredPeriod } from "./periods";

let selectedId: string | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  if (!hydrated) {
    hydrated = true;
    selectedId = recallPeriod();
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSelectedPeriodId(id: string | null) {
  selectedId = id;
  if (id) rememberPeriod(id);
  emit();
}

export function latestPeriod(periods: StoredPeriod[]): StoredPeriod | null {
  return (
    [...periods].sort((left, right) => {
      const endCompare = (right.period_end ?? "").localeCompare(left.period_end ?? "");
      if (endCompare !== 0) return endCompare;
      return right.created_at.localeCompare(left.created_at);
    })[0] ?? null
  );
}

export function usePeriods() {
  return useQuery({ queryKey: ["periods"], queryFn: listPeriods });
}

export function useSelectedPeriod() {
  const { data: periods = [], isLoading, error } = usePeriods();
  const stored = useSyncExternalStore(
    subscribe,
    () => selectedId,
    () => null,
  );

  const selected: StoredPeriod | null =
    periods.find((period) => period.id === stored) ?? latestPeriod(periods);

  const select = useCallback((id: string) => setSelectedPeriodId(id), []);

  return { periods, selected, select, isLoading, error: error as Error | null };
}
