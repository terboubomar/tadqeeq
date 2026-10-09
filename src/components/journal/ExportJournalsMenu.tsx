import { ChevronDown, Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  ACCOUNTING_SYSTEMS,
  exportJournalsFor,
  hasCostCenters,
  missingCodes,
  nonNumericCostCenters,
  type AccountingSystem,
} from "./accounting-formats";
import type { BranchJournal } from "./journal-export";

/** Export button that asks which accounting system the file is for, then downloads it in that system's import layout. */
export function ExportJournalsMenu({
  title,
  journals,
  firstNumber = 1,
  label,
  variant = "default",
  onExcel,
}: {
  title: string;
  journals: BranchJournal[];
  firstNumber?: number;
  label: string;
  variant?: "default" | "outline";
  /** Replaces the Excel (Tadqeeq) layout, e.g. for a single entry. */
  onExcel?: () => void;
}) {
  function run(system: AccountingSystem) {
    const target = ACCOUNTING_SYSTEMS.find((item) => item.key === system)!;
    try {
      if (system === "excel" && onExcel) onExcel();
      else exportJournalsFor(system, title, journals, firstNumber);
      const warnings: string[] = [];
      if (target.needsCodes && missingCodes(journals)) {
        warnings.push(target.label + " يطابق الحسابات برمزها. بعض الحسابات بلا رمز فكُتب اسمها بدلاً منه؛ أضف الرموز من «حساباتي» ثم صدّر مرة أخرى.");
      }
      if (target.costCenter === "none" && hasCostCenters(journals)) {
        warnings.push("استيراد " + target.label + " لا يقبل مراكز التكلفة، فلم تُكتب في الملف؛ أضفها على القيود بعد الاستيراد.");
      }
      if (target.costCenter === "numeric" && nonNumericCostCenters(journals)) {
        warnings.push("Odoo يأخذ مركز التكلفة برقم الحساب التحليلي (مثل 12). مراكز التكلفة غير الرقمية تُركت فارغة في الملف.");
      }
      if (warnings.length) toast.warning(warnings.join(" "), { duration: 10_000 });
      else toast.success("تم تجهيز ملف " + target.label);
    } catch (error) {
      toast.error("تعذّر تصدير الملف: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant={variant} className="gap-1.5" disabled={!journals.length}>
          <Download className="size-4" />
          {label}
          <ChevronDown className="size-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-[12px] text-muted-foreground">صدّر لنظامك المحاسبي</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACCOUNTING_SYSTEMS.map((system) => (
          <DropdownMenuItem key={system.key} onSelect={() => run(system.key)} className="flex flex-col items-start gap-0.5">
            <span className="font-medium">{system.label}</span>
            <span className="text-[11.5px] leading-5 text-muted-foreground">{system.hint}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
