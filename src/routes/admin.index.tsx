import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "إدارة المستخدمين" }] }),
  component: () => <AppShell><Admin /></AppShell>,
});

function Admin() {
  const { isAdmin } = useAuth();
  const { data, refetch } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("profiles-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  if (!isAdmin) {
    return <div className="text-center py-12 text-muted-foreground">هذه الصفحة للمسؤولين فقط</div>;
  }

  async function setStatus(id: string, status: "approved" | "rejected") {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else toast.success(status === "approved" ? "تم تفعيل الحساب" : "تم رفض الحساب");
  }

  const depLabel = (d: string) => d === "admin" ? "مسؤول" : d === "finance" ? "الشؤون المالية" : "شؤون الطلاب";

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">إدارة المستخدمين</h1>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-right">الاسم</th>
                <th className="px-4 py-3 text-right">المستخدم</th>
                <th className="px-4 py-3 text-right">القسم</th>
                <th className="px-4 py-3 text-right">الحالة</th>
                <th className="px-4 py-3 text-right">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {data?.map(p => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{p.full_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.username}</td>
                  <td className="px-4 py-3">{depLabel(p.department)}</td>
                  <td className="px-4 py-3">
                    {p.status === "approved" && <Badge className="bg-success text-success-foreground">مفعّل</Badge>}
                    {p.status === "pending" && <Badge variant="outline">بانتظار</Badge>}
                    {p.status === "rejected" && <Badge variant="destructive">مرفوض</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    {p.status !== "approved" && <Button size="sm" onClick={() => setStatus(p.id, "approved")}>تفعيل</Button>}
                    {p.status === "pending" && <Button size="sm" variant="outline" className="mr-2" onClick={() => setStatus(p.id, "rejected")}>رفض</Button>}
                  </td>
                </tr>
              ))}
              {(data ?? []).length === 0 && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">لا يوجد مستخدمون</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">ملاحظة: لتعيين أول مستخدم كمسؤول، فعّل حسابه أولاً ثم أضِف دور "admin" له من قاعدة البيانات.</p>
      <DangerZone />
    </div>
  );
}

function DangerZone() {
  async function wipeAll() {
    const { error } = await supabase.from("students").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) toast.error(error.message); else toast.success("تم مسح جميع بيانات الطلاب");
  }
  async function wipeArchived() {
    const { error } = await supabase.from("students").delete().not("archived_year", "is", null);
    if (error) toast.error(error.message); else toast.success("تم مسح بيانات السنوات المؤرشفة");
  }
  async function wipeCurrent() {
    const { error } = await supabase.from("students").delete().is("archived_year", null);
    if (error) toast.error(error.message); else toast.success("تم مسح بيانات السنة الحالية");
  }
  return (
    <Card className="p-6 border-destructive/40">
      <div className="space-y-3">
        <h2 className="text-xl font-bold text-destructive">منطقة الخطر — مسح البيانات</h2>
        <p className="text-sm text-muted-foreground">عمليات لا يمكن التراجع عنها. استخدمها بحذر.</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <ConfirmBtn label="مسح بيانات السنة الحالية" onConfirm={wipeCurrent} />
          <ConfirmBtn label="مسح بيانات السنوات المؤرشفة" onConfirm={wipeArchived} />
          <ConfirmBtn label="مسح كل بيانات الطلاب" onConfirm={wipeAll} />
        </div>
      </div>
    </Card>
  );
}

function ConfirmBtn({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  return (
    <Button variant="destructive" onClick={() => {
      if (window.confirm(`هل أنت متأكد؟\n${label}\nلا يمكن التراجع.`)) onConfirm();
    }}>{label}</Button>
  );
}
