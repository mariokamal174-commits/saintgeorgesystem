import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, DollarSign, Receipt, AlertCircle, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "لوحة التحكم | نظام إدارة المدرسة" }] }),
  component: () => <AppShell><Dashboard /></AppShell>,
});

type StudentRow = {
  total_due: number | string | null;
  total_paid: number | string | null;
  remaining_balance: number | string | null;
  payment_status: "paid" | "unpaid" | "partial" | null;
  grade_id: string | null;
  grades?: { name: string; level: number | null } | null;
};

function Dashboard() {
  const { data, refetch } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [students, receipts] = await Promise.all([
        supabase.from("students").select("total_due, total_paid, remaining_balance, payment_status, grade_id, grades(name, level)"),
        supabase.from("receipts").select("id, status").eq("status", "pending"),
      ]);
      const list = (students.data ?? []) as unknown as StudentRow[];
      return {
        rows: list,
        totalStudents: list.length,
        totalDue: list.reduce((s, x) => s + Number(x.total_due ?? 0), 0),
        totalPaid: list.reduce((s, x) => s + Number(x.total_paid ?? 0), 0),
        remaining: list.reduce((s, x) => s + Number(x.remaining_balance ?? 0), 0),
        outstandingCount: list.filter(x => x.payment_status !== "paid").length,
        pendingReceipts: receipts.data?.length ?? 0,
      };
    },
  });

  useEffect(() => {
    const ch = supabase.channel("dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "receipts" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n));

  const cards = [
    { label: "إجمالي الطلاب", value: fmt(data?.totalStudents ?? 0), icon: Users, color: "text-primary", bg: "bg-primary/10" },
    { label: "إجمالي المستحق", value: fmt(data?.totalDue ?? 0), icon: DollarSign, color: "text-foreground", bg: "bg-muted" },
    { label: "إجمالي المدفوع", value: fmt(data?.totalPaid ?? 0), icon: TrendingUp, color: "text-success", bg: "bg-success/10" },
    { label: "المتبقي", value: fmt(data?.remaining ?? 0), icon: AlertCircle, color: "text-warning", bg: "bg-warning/10" },
    { label: "طلاب لديهم رصيد", value: fmt(data?.outstandingCount ?? 0), icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10" },
    { label: "إيصالات بانتظار المراجعة", value: fmt(data?.pendingReceipts ?? 0), icon: Receipt, color: "text-primary", bg: "bg-primary/10" },
  ];

  // Per-class breakdown
  const byGrade = new Map<string, {
    name: string; level: number; count: number; paid: number; unpaid: number;
    totalDue: number; totalPaid: number; remaining: number;
  }>();
  (data?.rows ?? []).forEach((r) => {
    const key = r.grade_id ?? "—";
    const name = r.grades?.name ?? "بدون صف";
    const level = r.grades?.level ?? 999;
    const cur = byGrade.get(key) ?? { name, level, count: 0, paid: 0, unpaid: 0, totalDue: 0, totalPaid: 0, remaining: 0 };
    cur.count += 1;
    if (r.payment_status === "paid") cur.paid += 1; else cur.unpaid += 1;
    cur.totalDue += Number(r.total_due ?? 0);
    cur.totalPaid += Number(r.total_paid ?? 0);
    cur.remaining += Number(r.remaining_balance ?? 0);
    byGrade.set(key, cur);
  });
  const gradeRows = Array.from(byGrade.values()).sort((a, b) => a.level - b.level);

  function stageOf(level: number) {
    if (level <= 2) return "رياض الأطفال";
    if (level <= 8) return "المرحلة الابتدائية";
    if (level <= 11) return "المرحلة الإعدادية";
    return "المرحلة الثانوية";
  }
  const stages = ["رياض الأطفال", "المرحلة الابتدائية", "المرحلة الإعدادية", "المرحلة الثانوية"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">لوحة التحكم</h1>
        <p className="text-muted-foreground mt-1">نظرة عامة على المؤشرات المالية وحالة الطلاب</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Card key={c.label} style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <div className={`p-2 rounded-lg ${c.bg}`}><c.icon className={`h-4 w-4 ${c.color}`} /></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {stages.map((stage) => {
        const rows = gradeRows.filter((g) => stageOf(g.level) === stage);
        if (rows.length === 0) return null;
        const tot = rows.reduce((a, r) => ({
          count: a.count + r.count, paid: a.paid + r.paid, unpaid: a.unpaid + r.unpaid,
          totalDue: a.totalDue + r.totalDue, totalPaid: a.totalPaid + r.totalPaid, remaining: a.remaining + r.remaining,
        }), { count: 0, paid: 0, unpaid: 0, totalDue: 0, totalPaid: 0, remaining: 0 });
        return (
          <Card key={stage} style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                <span>{stage}</span>
                <span className="text-sm text-muted-foreground font-normal">
                  {fmt(tot.count)} طالب · مسدد {fmt(tot.paid)} · غير مسدد {fmt(tot.unpaid)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-right">الصف</th>
                      <th className="px-3 py-2 text-right">عدد الطلاب</th>
                      <th className="px-3 py-2 text-right">مسدد</th>
                      <th className="px-3 py-2 text-right">غير مسدد</th>
                      <th className="px-3 py-2 text-right">المستحق</th>
                      <th className="px-3 py-2 text-right">المدفوع</th>
                      <th className="px-3 py-2 text-right">المتبقي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((g) => (
                      <tr key={g.name} className="border-t">
                        <td className="px-3 py-2 font-medium">{g.name}</td>
                        <td className="px-3 py-2">{fmt(g.count)}</td>
                        <td className="px-3 py-2"><Badge className="bg-success text-success-foreground">{fmt(g.paid)}</Badge></td>
                        <td className="px-3 py-2">{g.unpaid > 0 ? <Badge variant="destructive">{fmt(g.unpaid)}</Badge> : <span className="text-muted-foreground">0</span>}</td>
                        <td className="px-3 py-2">{fmt(g.totalDue)}</td>
                        <td className="px-3 py-2 text-success">{fmt(g.totalPaid)}</td>
                        <td className="px-3 py-2 font-medium">{fmt(g.remaining)}</td>
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/40 font-bold">
                      <td className="px-3 py-2">الإجمالي</td>
                      <td className="px-3 py-2">{fmt(tot.count)}</td>
                      <td className="px-3 py-2">{fmt(tot.paid)}</td>
                      <td className="px-3 py-2">{fmt(tot.unpaid)}</td>
                      <td className="px-3 py-2">{fmt(tot.totalDue)}</td>
                      <td className="px-3 py-2">{fmt(tot.totalPaid)}</td>
                      <td className="px-3 py-2">{fmt(tot.remaining)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
