import type { ContractVersionRecord } from "./contract-rulebook";

/**
 * Whether a contract still has an approved version in force today. Contracts often carry a discounted rate for a
 * fixed period; once the last approved version ends, uploads after that date have no terms to check against and the
 * platform may be back on its base rate. Display only.
 */
export type ContractValidity =
  | { kind: "expired"; endedOn: string }
  | { kind: "ending"; endsOn: string; daysLeft: number }
  | null;

const DAY = 86_400_000;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);

export function contractValidity(versions: Pick<ContractVersionRecord, "status" | "effectiveFrom" | "effectiveTo">[], today: string, warnDays = 30): ContractValidity {
  const approved = versions.filter((version) => version.status === "approved");
  if (!approved.length) return null;
  const now = dayNumber(today);
  const inForce = approved.filter(
    (version) => dayNumber(version.effectiveFrom) <= now && (version.effectiveTo == null || dayNumber(version.effectiveTo) >= now),
  );
  if (!inForce.length) {
    const ended = approved.filter((version) => version.effectiveTo != null && dayNumber(version.effectiveTo) < now);
    if (!ended.length) return null;
    // A version that starts later is already lined up: nothing to warn about yet.
    if (approved.some((version) => dayNumber(version.effectiveFrom) > now)) return null;
    const endedOn = ended.map((version) => version.effectiveTo!).sort().at(-1)!;
    return { kind: "expired", endedOn };
  }
  if (inForce.some((version) => version.effectiveTo == null)) return null;
  const endsOn = inForce.map((version) => version.effectiveTo!).sort().at(-1)!;
  // A later version taking over the day after is already approved.
  if (approved.some((version) => dayNumber(version.effectiveFrom) === dayNumber(endsOn) + 1)) return null;
  const daysLeft = dayNumber(endsOn) - now;
  return daysLeft <= warnDays ? { kind: "ending", endsOn, daysLeft } : null;
}

interface DatedVersion {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/**
 * The approved version that applies to a period. A contract stays in force until a newer version is uploaded:
 * the version that started on or before the period's first day applies even after its own end date. When none had
 * started by then, the first version starting inside the period applies. The note says when either happened.
 */
export function versionForPeriod<T extends DatedVersion>(
  approved: T[],
  periodStart: string,
  periodEnd: string,
): { version: T; note: string | null } | null {
  const sorted = [...approved].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const started = sorted.filter((version) => version.effectiveFrom <= periodStart).at(-1);
  const inside = sorted.filter((version) => version.effectiveFrom > periodStart && version.effectiveFrom <= periodEnd);

  if (started) {
    const notes: string[] = [];
    if (started.effectiveTo && started.effectiveTo < periodEnd) {
      notes.push(`انتهت مدة هذه النسخة في ${started.effectiveTo} وتبقى مستخدمة حتى تُرفع نسخة جديدة.`);
    }
    if (inside[0]) {
      notes.push(`نسخة أحدث تبدأ في ${inside[0].effectiveFrom} داخل الفترة؛ استُخدمت النسخة السارية في أول يوم من الفترة.`);
    }
    return { version: started, note: notes.join(" ") || null };
  }
  if (inside[0]) {
    return {
      version: inside[0],
      note: `يبدأ العقد في ${inside[0].effectiveFrom} داخل الفترة، فالأيام قبله فُحصت بشروطه أيضاً.`,
    };
  }
  return null;
}

/** The approved version in force on a date: the latest one that had started by then. */
export function versionOnDate<T extends DatedVersion>(approved: T[], onDate: string): T | null {
  return [...approved].filter((version) => version.effectiveFrom <= onDate).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1) ?? null;
}
