import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, DollarSign, Receipt, AlertCircle, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "لوحة التحكم | نظام إدارة المدرسة" }] }),
  component: () => <AppShell><Dashboard /></AppShell>,
});

function Dashboard() {
  const { data: stats, refetch } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [students, receipts] = await Promise.all([
        supabase.from("students").select("total_due, total_paid, remaining_balance, payment_status"),
        supabase.from("receipts").select("id, status").eq("status", "pending"),
      ]);
      const list = students.data ?? [];
      return {
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
    { label: "إجمالي الطلاب", value: fmt(stats?.totalStudents ?? 0), icon: Users, color: "text-primary", bg: "bg-primary/10" },
    { label: "إجمالي المستحق", value: fmt(stats?.totalDue ?? 0), icon: DollarSign, color: "text-foreground", bg: "bg-muted" },
    { label: "إجمالي المدفوع", value: fmt(stats?.totalPaid ?? 0), icon: TrendingUp, color: "text-success", bg: "bg-success/10" },
    { label: "المتبقي", value: fmt(stats?.remaining ?? 0), icon: AlertCircle, color: "text-warning", bg: "bg-warning/10" },
    { label: "طلاب لديهم رصيد", value: fmt(stats?.outstandingCount ?? 0), icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10" },
    { label: "إيصالات بانتظار المراجعة", value: fmt(stats?.pendingReceipts ?? 0), icon: Receipt, color: "text-primary", bg: "bg-primary/10" },
  ];

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
    </div>
  );
}
