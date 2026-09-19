import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  CalendarDays,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Upload,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useSelectedPeriod } from "@/lib/use-period";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "اللوحة التنفيذية", icon: LayoutDashboard },
  { to: "/invoice-check", label: "مطابقة الفاتورة", icon: ReceiptText },
  { to: "/branches", label: "تقرير الفروع", icon: Building2 },
  { to: "/daily", label: "التقرير اليومي", icon: CalendarDays },
  { to: "/breakdown", label: "تفصيل البنود", icon: BarChart3 },
  { to: "/import", label: "رفع البيانات", icon: Upload },
  { to: "/history", label: "الفترات السابقة", icon: FileSpreadsheet },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { periods, selected, select } = useSelectedPeriod();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="grain-bg min-h-screen bg-background">
      <div className="mx-auto flex max-w-[1600px]">
        <aside
          className={cn(
            "fixed inset-y-0 right-0 z-40 w-64 shrink-0 border-l border-border bg-surface p-4 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
            open ? "translate-x-0" : "translate-x-full",
          )}
        >
          <Link to="/dashboard" className="flex items-center gap-2.5 px-2 py-3">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-lg font-black text-primary-foreground">
              ت
            </span>
            <span>
              <span className="block font-display text-lg font-black leading-none gold-text">
                تدقيق
              </span>
              <span className="block text-[11px] text-muted-foreground">مراجعة فواتير التوصيل</span>
            </span>
          </Link>

          <nav className="mt-5 space-y-1">
            {NAV.map((item) => {
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Button
            variant="ghost"
            onClick={signOut}
            className="absolute bottom-4 start-4 end-4 justify-start gap-3 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="size-4" />
            تسجيل الخروج
          </Button>
        </aside>

        {open ? (
          <button
            aria-label="إغلاق القائمة"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 bg-background/70 lg:hidden"
          />
        ) : null}

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-md sm:px-6">
            <Button
              variant="outline"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen((value) => !value)}
              aria-label="القائمة"
            >
              <Menu className="size-4" />
            </Button>

            <div className="min-w-0 flex-1">
              {periods.length > 0 ? (
                <Select value={selected?.id ?? ""} onValueChange={select}>
                  <SelectTrigger className="h-10 w-full max-w-sm">
                    <SelectValue placeholder="اختر الفترة" />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((period) => (
                      <SelectItem key={period.id} value={period.id}>
                        {period.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  لا توجد بيانات بعد — ابدأ من صفحة رفع البيانات.
                </p>
              )}
            </div>

            <Button asChild size="sm">
              <Link to="/import">
                <Upload className="size-4" />
                رفع بيانات
              </Link>
            </Button>
          </header>

          <div className="px-4 py-6 sm:px-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel mx-auto mt-10 max-w-lg p-10 text-center">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <Button asChild className="mt-6">
        <Link to="/import">
          <Upload className="size-4" />
          رفع ملفات الفترة
        </Link>
      </Button>
    </div>
  );
}
