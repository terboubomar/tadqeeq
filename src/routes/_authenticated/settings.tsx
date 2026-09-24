import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteRegistryBranch,
  listBranchRegistry,
  saveRegistryBranch,
  type BranchInput,
} from "@/lib/branch-registry";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "إعدادات الفروع · تدقيق" },
      { name: "description", content: "اسم موحّد لكل فرع ومعرّفه في هنقرستيشن وكيتا وجاهز." },
      { property: "og:title", content: "إعدادات الفروع · تدقيق" },
      { property: "og:description", content: "اسم موحّد لكل فرع ومعرّفه في كل منصة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const EMPTY: BranchInput = { name: "", hungerstation_id: "", keeta_id: "", jahez_id: "" };
const FIELDS = [
  { key: "hungerstation_id", label: "معرّف هنقرستيشن (HS Branch ID)" },
  { key: "keeta_id", label: "معرّف كيتا (Store ID)" },
  { key: "jahez_id", label: "اسم/معرّف الفرع في جاهز" },
] as const;

function SettingsPage() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["branch-registry"], queryFn: listBranchRegistry });
  const [form, setForm] = useState<BranchInput>(EMPTY);

  const save = useMutation({
    mutationFn: saveRegistryBranch,
    onSuccess: () => {
      toast.success("تم حفظ الفرع");
      setForm(EMPTY);
      qc.invalidateQueries({ queryKey: ["branch-registry"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: deleteRegistryBranch,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branch-registry"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="audit-heading">إعدادات الفروع</h1>
        <p className="audit-subtitle">اسم واحد لكل فرع، مع معرّفه في كل منصة — يظهر هذا الاسم في كل التقارير.</p>
      </header>

      <form
        className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-5 md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
      >
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">اسم الفرع الموحّد</span>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        {FIELDS.map((f) => (
          <label key={f.key} className="space-y-1 text-sm">
            <span className="text-muted-foreground">{f.label}</span>
            <Input dir="ltr" value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
          </label>
        ))}
        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending} className="flex-1">
            {form.id ? <Save className="size-4" /> : <Plus className="size-4" />}
            {form.id ? "حفظ" : "إضافة"}
          </Button>
          {form.id && (
            <Button type="button" variant="ghost" onClick={() => setForm(EMPTY)} aria-label="إلغاء">
              <X className="size-4" />
            </Button>
          )}
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="p-3 text-start">الفرع</th>
              <th className="p-3 text-start">هنقرستيشن</th>
              <th className="p-3 text-start">كيتا</th>
              <th className="p-3 text-start">جاهز</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">جارٍ التحميل…</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لم تُضف فروع بعد.</td></tr>
            ) : (
              data.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="p-3 font-medium">{b.name}</td>
                  <td className="p-3" dir="ltr">{b.hungerstation_id ?? "—"}</td>
                  <td className="p-3" dir="ltr">{b.keeta_id ?? "—"}</td>
                  <td className="p-3" dir="ltr">{b.jahez_id ?? "—"}</td>
                  <td className="p-3 text-end whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setForm({ ...b })} aria-label="تعديل">
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="حذف"
                      onClick={() => window.confirm(`حذف ${b.name}؟`) && remove.mutate(b.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
