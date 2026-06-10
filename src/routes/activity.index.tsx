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
  student: "طالب", receipt: "إيصال", import: "استيراد", profile: "مستخدم",
};

function Activity() {
  const { data, refetch } = useQuery({
    queryKey: ["activity"],
    queryFn: async () => {
      const { data: logs } = await supabase.from("audit_logs")
        .select("*").order("created_at", { ascending: false }).limit(200);
      const ids = Array.from(new Set((logs ?? []).map(l => l.user_id).filter(Boolean))) as string[];
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        names = Object.fromEntries((profs ?? []).map(p => [p.id, p.full_name ?? "—"]));
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
        <p className="text-muted-foreground mt-1">من قام بأي إجراء ومتى</p>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-right">المستخدم</th>
                <th className="px-4 py-3 text-right">الإجراء</th>
                <th className="px-4 py-3 text-right">العنصر</th>
                <th className="px-4 py-3 text-right">التاريخ والوقت</th>
              </tr>
            </thead>
            <tbody>
              {(!data || data.length === 0) && (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">لا توجد عمليات بعد</td></tr>
              )}
              {data?.map(l => (
                <tr key={l.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{l.user_name}</td>
                  <td className="px-4 py-3"><Badge variant="outline">{ACTION_LABELS[l.action] ?? l.action}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground">{ENTITY_LABELS[l.entity] ?? l.entity}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
