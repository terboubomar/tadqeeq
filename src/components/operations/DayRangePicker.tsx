import { arSA } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DayRange {
  /** YYYY-MM-DD */
  from: string;
  to: string;
}

const toDate = (iso: string) => new Date(`${iso}T00:00:00`);
const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const shortDate = (iso: string) => toDate(iso).toLocaleDateString("ar-SA-u-nu-latn-ca-gregory", { day: "numeric", month: "short" });

/**
 * A range of uploaded days, after 21st.dev's «Range Calendar With Presets» (sean0205), rebuilt on the app's own
 * calendar and popover in Tadqeeq's style and RTL: quick picks on the side, a calendar where only uploaded days can be
 * chosen. `days` are the uploaded days, oldest first.
 */
export function DayRangePicker({ days, value, onChange }: { days: string[]; value: DayRange; onChange: (range: DayRange) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  const uploaded = new Set(days);
  const last = days[days.length - 1];
  const lastN = (n: number): DayRange | null => (last ? { from: days[Math.max(0, days.length - n)]!, to: last } : null);
  const presets: { label: string; range: DayRange | null }[] = [
    { label: "آخر يوم مرفوع", range: last ? { from: last, to: last } : null },
    { label: "آخر 7 أيام مرفوعة", range: lastN(7) },
    { label: "آخر 14 يوماً مرفوعة", range: lastN(14) },
    { label: "كل أيام الشهر", range: days.length ? { from: days[0]!, to: last! } : null },
  ];
  const label = value.from === value.to ? shortDate(value.from) : `${shortDate(value.from)} ← ${shortDate(value.to)}`;

  function pick(range: DayRange) {
    onChange(range);
    setDraft(undefined);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setDraft(undefined);
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 bg-card text-[12.5px] font-medium" aria-label={`الأيام: ${label}`}>
          <CalendarDays className="size-3.5 text-primary-text" />
          <span>{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={12} className="w-auto max-w-[calc(100vw-24px)] p-0" dir="rtl">
        <div className="flex flex-col sm:flex-row">
          <ul className="flex w-0 min-w-full gap-1 overflow-x-auto border-b border-border p-2 sm:w-40 sm:min-w-0 sm:flex-col sm:border-b-0 sm:border-e">
            {presets.map((preset) => {
              const active = preset.range && preset.range.from === value.from && preset.range.to === value.to;
              return (
                <li key={preset.label}>
                  <button
                    type="button"
                    disabled={!preset.range}
                    onClick={() => preset.range && pick(preset.range)}
                    className={cn(
                      "w-full whitespace-nowrap rounded-md px-2.5 py-1.5 text-start text-[12.5px] transition-colors hover:bg-muted disabled:opacity-40",
                      active && "bg-secondary font-semibold text-primary-text",
                    )}
                  >
                    {preset.label}
                  </button>
                </li>
              );
            })}
          </ul>
          <Calendar
            mode="range"
            locale={arSA}
            dir="rtl"
            numberOfMonths={1}
            defaultMonth={toDate(value.to)}
            selected={draft ?? { from: toDate(value.from), to: toDate(value.to) }}
            onSelect={(range) => {
              setDraft(range);
              if (range?.from && range.to && toIso(range.from) !== toIso(range.to)) pick({ from: toIso(range.from), to: toIso(range.to) });
            }}
            onDayClick={(day, modifiers) => {
              // A second click on the same day picks just that day.
              if (draft?.from && !draft.to && toIso(draft.from) === toIso(day) && !modifiers["disabled"]) pick({ from: toIso(day), to: toIso(day) });
            }}
            disabled={(date) => !uploaded.has(toIso(date))}
            className="[--cell-size:2.1rem]"
          />
        </div>
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">الأيام الباهتة لم تُرفع لها ملفات. اضغط يوماً مرتين لاختياره وحده.</p>
      </PopoverContent>
    </Popover>
  );
}
