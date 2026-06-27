import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/receipts/")({
  head: () => ({ meta: [{ title: "الإيصالات" }] }),
  component: () => <AppShell><ReceiptsList /></AppShell>,
});

function ReceiptsList() {
  const { isFinance, isAdmin } = useAuth();
  const { data, refetch } = useQuery({
    queryKey: ["receipts"],
    queryFn: async () => {
      const { data } = await supabase.from("receipts")
        .select("*, students(full_name, student_code)")
        .is("students.archived_year", null)
        .order("created_at", { ascending: false }).limit(100);
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("receipts-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "receipts" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  async function setStatus(id: string, status: "approved" | "rejected") {
    const { error } = await supabase.from("receipts").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else toast.success(status === "approved" ? "تم اعتماد الإيصال" : "تم رفض الإيصال");
  }

  const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n));
  const canManage = isFinance || isAdmin;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold">الإيصالات</h1>
        {canManage && (
          <Link to="/receipts/new"><Button><Plus className="ml-2 h-4 w-4" />إيصال جديد</Button></Link>
        )}
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-right">رقم الإيصال</th>
                <th className="px-4 py-3 text-right">الطالب</th>
                <th className="px-4 py-3 text-right">التاريخ</th>
                <th className="px-4 py-3 text-right">المبلغ</th>
                <th className="px-4 py-3 text-right">الحالة</th>
                <th className="px-4 py-3 text-right">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد إيصالات</td></tr>}
              {data?.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{r.receipt_number ?? r.id.slice(0,8)}</td>
                  <td className="px-4 py-3">
                    <Link to="/students/$id" params={{ id: r.student_id }} className="hover:text-primary">
                      {r.students?.full_name ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.receipt_date ?? "—"}</td>
                  <td className="px-4 py-3 font-bold">{fmt(Number(r.amount))}</td>
                  <td className="px-4 py-3">
                    {r.status === "approved" && <Badge className="bg-success text-success-foreground">معتمد</Badge>}
                    {r.status === "pending" && <Badge variant="outline">قيد المراجعة</Badge>}
                    {r.status === "rejected" && <Badge variant="destructive">مرفوض</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    {canManage && r.status === "pending" && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => setStatus(r.id, "approved")}>اعتماد</Button>
                        <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "rejected")}>رفض</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
