import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/activity/")({
  head: () => ({ meta: [{ title: "سجل النشاط" }] }),
  component: () => <AppShell><Activity /></AppShell>,
});

const ACTION_LABELS: Record<string, string> = {
  create: "إنشاء", update: "تعديل", delete: "حذف",
  import: "استيراد", approve: "اعتماد", reject: "رفض", login: "دخول",
};
const ENTITY_LABELS: Record<string, string> = {
  student: "طالب", receipt: "إيصال", installment: "قسط",
  import: "استيراد", profile: "مستخدم", delivery: "تسليم ملف",
};
const ACTION_TONE: Record<string, string> = {
  create: "bg-success/15 text-success border-success/30",
  update: "bg-primary/15 text-primary border-primary/30",
  delete: "bg-destructive/15 text-destructive border-destructive/30",
  approve: "bg-success/15 text-success border-success/30",
  reject: "bg-destructive/15 text-destructive border-destructive/30",
  import: "bg-warning/15 text-warning border-warning/30",
};
const STATUS_LABELS: Record<string, string> = {
  paid: "مدفوع", partial: "جزئي", unpaid: "غير مدفوع",
  approved: "معتمد", pending: "قيد المراجعة", rejected: "مرفوض",
};

function describe(l: { action: string; entity: string; after: Record<string, unknown> | null }): string {
  const a = (l.after ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (a.student_name) parts.push(`الطالب: ${a.student_name}`);
  if (a.receipt_number) parts.push(`إيصال #${a.receipt_number}`);
  if (a.kind) parts.push(String(a.kind));
  if (typeof a.amount === "number") parts.push(`المبلغ: ${new Intl.NumberFormat("ar-EG").format(Math.round(a.amount))}`);
  if (a.status) parts.push(`الحالة: ${STATUS_LABELS[String(a.status)] ?? String(a.status)}`);
  if (a.delivered !== undefined) parts.push(`تسليم الملف: ${a.delivered ? "تم" : "لم يتم"}`);
  if (a.item) parts.push(String(a.item));
  if (parts.length === 0 && l.entity === "import" && a.count) parts.push(`عدد السجلات: ${a.count}`);
  return parts.join(" · ");
}

function Activity() {
  const { data, refetch } = useQuery({
    queryKey: ["activity"],
    queryFn: async () => {
      const { data: logs } = await supabase.from("audit_logs")
        .select("*").order("created_at", { ascending: false }).limit(300);
      const ids = Array.from(new Set((logs ?? []).map(l => l.user_id).filter(Boolean))) as string[];
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, department").in("id", ids);
        names = Object.fromEntries((profs ?? []).map(p => [p.id, `${p.full_name ?? "—"}${p.department ? ` (${p.department === "finance" ? "مالية" : p.department === "student_affairs" ? "شؤون طلاب" : "مدير"})` : ""}`]));
      }
      return (logs ?? []).map(l => ({ ...l, user_name: l.user_id ? (names[l.user_id] ?? "—") : "النظام" }));
    },
  });

  useEffect(() => {
    const ch = supabase.channel("activity-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  const fmtDate = (d: string) => new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(d));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">سجل النشاط</h1>
        <p className="text-muted-foreground mt-1">سجل تفصيلي لكل العمليات في النظام</p>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-right">التاريخ والوقت</th>
                <th className="px-4 py-3 text-right">المستخدم</th>
                <th className="px-4 py-3 text-right">الإجراء</th>
                <th className="px-4 py-3 text-right">النوع</th>
                <th className="px-4 py-3 text-right">التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {(!data || data.length === 0) && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد عمليات بعد</td></tr>
              )}
              {data?.map(l => (
                <tr key={l.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(l.created_at)}</td>
                  <td className="px-4 py-3 font-medium">{l.user_name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={ACTION_TONE[l.action] ?? ""}>
                      {ACTION_LABELS[l.action] ?? l.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{ENTITY_LABELS[l.entity] ?? l.entity}</td>
                  <td className="px-4 py-3">{describe(l as never) || <span className="text-muted-foreground">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
