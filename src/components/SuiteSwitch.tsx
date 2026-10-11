import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, HandCoins } from "lucide-react";

import { MizanMark } from "@/components/brand/SuiteMarks";

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
          <SuiteIcon suite={current} />
          {SUITES[current].name}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 text-start">
        <DropdownMenuLabel className="text-xs text-muted-foreground">المنصات</DropdownMenuLabel>
        {SUITE_ORDER.map((key) => (
          <DropdownMenuItem key={key} asChild className="gap-2.5 py-2">
            <Link to={SUITES[key].path}>
              <span className={key === "mizan" ? "grid size-8 shrink-0 place-items-center rounded-lg bg-ink text-ink-foreground" : "grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"}>
                <SuiteIcon suite={key} large />
              </span>
              <span className="min-w-0 flex-1">
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

function SuiteIcon({ suite, large = false }: { suite: SuiteKey; large?: boolean }) {
  return suite === "mizan" ? (
    <MizanMark className={large ? "size-6" : "size-4 text-ink"} />
  ) : (
    <HandCoins className={large ? "size-4" : "size-3.5 text-primary-text"} />
  );
}
