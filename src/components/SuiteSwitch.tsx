import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, LayoutGrid } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { SUITE_ORDER, SUITES, suiteAccess, type SuiteKey } from "@/lib/suites";

/** Header switch between «ميزان» and «استرداد», for subscribed clients who can open both. */
export function SuiteSwitch({ current }: { current: SuiteKey }) {
  const { context, can } = useWorkspaceAccess();
  const access = suiteAccess({ ...context, can });
  if (!access.subscribed || !access.mizan || !access.istirdad) return null;

  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-card px-2.5 font-semibold" aria-label="تبديل المنصة">
          <LayoutGrid className="size-3.5 text-primary-text" />
          {SUITES[current].name}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 text-start">
        <DropdownMenuLabel className="text-xs text-muted-foreground">المنصات</DropdownMenuLabel>
        {SUITE_ORDER.map((key) => (
          <DropdownMenuItem key={key} asChild className="justify-between gap-2 py-2">
            <Link to={SUITES[key].path}>
              <span className="min-w-0">
                <span className="block font-semibold">{SUITES[key].name}</span>
                <span className="block text-[11px] text-muted-foreground">{SUITES[key].descriptor}</span>
              </span>
              {key === current ? <Check className="size-4 shrink-0 text-primary" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
