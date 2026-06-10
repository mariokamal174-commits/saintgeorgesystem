import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/students/")({
  head: () => ({ meta: [{ title: "الطلاب | نظام إدارة المدرسة" }] }),
  component: () => <AppShell><StudentsList /></AppShell>,
});

function StudentsList() {
  const { isStudentAffairs, isAdmin } = useAuth();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const PAGE = 25;

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["students", q, page],
    queryFn: async () => {
      let qb = supabase.from("students").select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (q.trim()) {
        const term = `%${q.trim()}%`;
        qb = qb.or(`full_name.ilike.${term},student_code.ilike.${term},national_id.ilike.${term}`);
      }
      const { data, count } = await qb;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  useEffect(() => {
    const ch = supabase.channel("students-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n));
  const pages = useMemo(() => Math.max(1, Math.ceil((data?.total ?? 0) / PAGE)), [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">الطلاب</h1>
          <p className="text-muted-foreground mt-1">إجمالي {fmt(data?.total ?? 0)} طالب</p>
        </div>
        {(isStudentAffairs || isAdmin) && (
          <Link to="/students/new">
            <Button><Plus className="ml-2 h-4 w-4" />طالب جديد</Button>
          </Link>
        )}
      </div>

      <Card className="p-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="ابحث بالاسم أو الكود أو الرقم القومي..." className="pr-10" />
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-right">الاسم</th>
                <th className="px-4 py-3 text-right">الكود</th>
                <th className="px-4 py-3 text-right">المستحق</th>
                <th className="px-4 py-3 text-right">المدفوع</th>
                <th className="px-4 py-3 text-right">المتبقي</th>
                <th className="px-4 py-3 text-right">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>}
              {!isLoading && data?.rows.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">لا يوجد طلاب</td></tr>}
              {data?.rows.map((s) => (
                <tr key={s.id} className="border-t hover:bg-muted/50 cursor-pointer">
                  <td className="px-4 py-3">
                    <Link to="/students/$id" params={{ id: s.id }} className="font-medium hover:text-primary">{s.full_name}</Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.student_code ?? "—"}</td>
                  <td className="px-4 py-3">{fmt(Number(s.total_due))}</td>
                  <td className="px-4 py-3 text-success">{fmt(Number(s.total_paid))}</td>
                  <td className="px-4 py-3 font-medium">{fmt(Number(s.remaining_balance))}</td>
                  <td className="px-4 py-3">
                    {s.payment_status === "paid" && <Badge className="bg-success text-success-foreground">مسدد بالكامل</Badge>}
                    {s.payment_status === "partial" && <Badge className="bg-warning text-warning-foreground">دفعة جزئية</Badge>}
                    {s.payment_status === "unpaid" && <Badge variant="destructive">غير مسدد</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>السابق</Button>
            <span className="text-sm text-muted-foreground">{page + 1} / {pages}</span>
            <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>التالي</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
