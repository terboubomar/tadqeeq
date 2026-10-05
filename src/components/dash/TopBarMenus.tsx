import { Link } from "@tanstack/react-router";
import { Bell, ChevronDown, CreditCard, LogOut, ShieldCheck, Users, type LucideIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface AppNotice {
  id: string;
  icon: LucideIcon;
  tone: "info" | "warning" | "critical";
  title: string;
  body?: string;
  to?: string;
}

const noticeTone: Record<AppNotice["tone"], string> = {
  info: "bg-secondary text-primary-text",
  warning: "bg-warning/10 text-warning",
  critical: "bg-destructive-soft text-destructive",
};

/** Bell with a count of notices that need action; opens a short list linking to where to act. */
export function NotificationBell({ notices }: { notices: AppNotice[] }) {
  const urgent = notices.filter((n) => n.tone !== "info").length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={urgent ? `التنبيهات (${urgent})` : "التنبيهات"}
          className="relative grid size-8 shrink-0 place-items-center rounded-[7px] border border-input bg-card text-foreground/80 transition-colors hover:bg-muted"
        >
          <Bell className="size-4" />
          {urgent ? (
            <span className="num absolute -end-1.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-[18px] text-white">
              {urgent}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" dir="rtl">
        <p className="border-b border-border px-4 py-3 text-sm font-bold">التنبيهات</p>
        {notices.length ? (
          <ul className="max-h-96 overflow-y-auto py-1">
            {notices.map((n) => {
              const row = (
                <>
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", noticeTone[n.tone])}>
                    <n.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium leading-5">{n.title}</span>
                    {n.body ? <span className="block text-[11.5px] leading-5 text-muted-foreground">{n.body}</span> : null}
                  </span>
                </>
              );
              return (
                <li key={n.id}>
                  {n.to ? (
                    <Link to={n.to} className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60">
                      {row}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3 px-4 py-2.5">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">لا توجد تنبيهات — كل شيء على ما يرام.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Avatar, name and role, opening account links and sign-out. */
export function UserMenu({
  name,
  email,
  role,
  workspace,
  planLine,
  canManageUsers,
  onSignOut,
}: {
  name: string;
  email: string | null;
  role: string;
  workspace: string;
  planLine: string | null;
  canManageUsers: boolean;
  onSignOut: () => void;
}) {
  const initial = (name || email || "?").trim().slice(0, 1).toUpperCase();
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex shrink-0 items-center gap-2 rounded-[9px] px-1.5 py-1 text-start transition-colors hover:bg-muted">
          <span className="grid size-8 place-items-center rounded-full bg-ink text-[13px] font-bold text-primary">{initial}</span>
          <span className="hidden min-w-0 leading-tight md:block">
            <span className="block max-w-[150px] truncate text-[13px] font-semibold">{name}</span>
            <span className="block max-w-[150px] truncate text-[11px] text-muted-foreground">{role}</span>
          </span>
          <ChevronDown className="hidden size-3.5 text-muted-foreground md:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold">{name}</p>
          {email ? <p className="truncate text-xs text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>{email}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {role} · {workspace}
          </p>
          {planLine ? <p className="mt-0.5 text-xs text-muted-foreground">{planLine}</p> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {canManageUsers ? (
          <DropdownMenuItem asChild>
            <Link to="/team">
              <Users className="size-4" /> المستخدمون والصلاحيات
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link to="/security">
            <ShieldCheck className="size-4" /> أمان الحساب والتحقق بخطوتين
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/subscribe">
            <CreditCard className="size-4" /> الباقة والاشتراك
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} className="text-destructive focus:text-destructive">
          <LogOut className="size-4" /> تسجيل الخروج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
