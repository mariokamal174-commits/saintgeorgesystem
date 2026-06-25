import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
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
  gender?: string | null;
  religion?: string | null;
  grades?: { name: string; level: number | null } | null;
};

function Dashboard() {
  const { data, refetch } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [students, receipts] = await Promise.all([
        supabase.from("students").select("total_due, total_paid, remaining_balance, payment_status, grade_id, grades(name, level), gender, religion").is("archived_year", null),
        supabase.from("receipts").select("id, status, students(archived_year)").eq("status", "pending"),
      ]);
      const list = (students.data ?? []) as unknown as StudentRow[];
      const pendingReceipts = (receipts.data ?? []).filter((receipt: any) => receipt.students?.archived_year === null).length;
      return {
        rows: list,
        totalStudents: list.length,
        totalDue: list.reduce((s, x) => s + Number(x.total_due ?? 0), 0),
        totalPaid: list.reduce((s, x) => s + Number(x.total_paid ?? 0), 0),
        remaining: list.reduce((s, x) => s + Number(x.remaining_balance ?? 0), 0),
        outstandingCount: list.filter(x => x.payment_status !== "paid").length,
        pendingReceipts,
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

  function stageOf(level: number) {
    if (level <= 2) return "رياض الأطفال";
    if (level <= 8) return "المرحلة الابتدائية";
    if (level <= 11) return "المرحلة الإعدادية";
    return "المرحلة الثانوية";
  }

  const { isStudentAffairs } = useAuth();

  const studentsByGenderReligion = useMemo(() => {
    const totals = { boys: 0, girls: 0, muslims: 0, christians: 0 };
    (data?.rows ?? []).forEach((r) => {
      const gender = String(r.gender ?? "").trim();
      const religion = String(r.religion ?? "").trim();
      if (/^(?:ولد|boy|male)$/i.test(gender)) totals.boys++;
      if (/^(?:بنت|girl|female)$/i.test(gender)) totals.girls++;
      if (/^(?:مسلم|muslim)$/i.test(religion)) totals.muslims++;
      if (/^(?:مسيحي|christian)$/i.test(religion)) totals.christians++;
    });
    return totals;
  }, [data?.rows]);

  const stageTotals = useMemo(() => {
    const totals = new Map<string, { boys: number; girls: number; muslims: number; christians: number }>();
    (data?.rows ?? []).forEach((r) => {
      const stage = stageOf(Number(r.grades?.level ?? 999));
      const current = totals.get(stage) ?? { boys: 0, girls: 0, muslims: 0, christians: 0 };
      const gender = String(r.gender ?? "").trim();
      const religion = String(r.religion ?? "").trim();
      if (/^(?:ولد|boy|male)$/i.test(gender)) current.boys++;
      if (/^(?:بنت|girl|female)$/i.test(gender)) current.girls++;
      if (/^(?:مسلم|muslim)$/i.test(religion)) current.muslims++;
      if (/^(?:مسيحي|christian)$/i.test(religion)) current.christians++;
      totals.set(stage, current);
    });
    return totals;
  }, [data?.rows]);

  const cards = [
    { label: "إجمالي الطلاب", value: fmt(data?.totalStudents ?? 0), icon: Users, color: "text-primary", bg: "bg-primary/10" },
    ...(isStudentAffairs
      ? [
          { label: "ولد", value: fmt(studentsByGenderReligion.boys), icon: Users, color: "text-foreground", bg: "bg-muted" },
          { label: "بنت", value: fmt(studentsByGenderReligion.girls), icon: Users, color: "text-foreground", bg: "bg-muted" },
          { label: "مسلم", value: fmt(studentsByGenderReligion.muslims), icon: Users, color: "text-foreground", bg: "bg-muted" },
          { label: "مسيحي", value: fmt(studentsByGenderReligion.christians), icon: Users, color: "text-foreground", bg: "bg-muted" },
        ]
      : [
          { label: "إجمالي المستحق", value: fmt(data?.totalDue ?? 0), icon: DollarSign, color: "text-foreground", bg: "bg-muted" },
          { label: "إجمالي المدفوع", value: fmt(data?.totalPaid ?? 0), icon: TrendingUp, color: "text-success", bg: "bg-success/10" },
          { label: "المتبقي", value: fmt(data?.remaining ?? 0), icon: AlertCircle, color: "text-warning", bg: "bg-warning/10" },
          { label: "طلاب لديهم رصيد", value: fmt(data?.outstandingCount ?? 0), icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10" },
        ]),
    ...(isStudentAffairs ? [] : [{ label: "إيصالات بانتظار المراجعة", value: fmt(data?.pendingReceipts ?? 0), icon: Receipt, color: "text-primary", bg: "bg-primary/10" }]),
  ];

  // Per-class breakdown
  const byGrade = new Map<string, {
    name: string; level: number; count: number; paid: number; unpaid: number;
    totalDue: number; totalPaid: number; remaining: number;
    boys: number; girls: number; muslims: number; christians: number;
  }>();
  (data?.rows ?? []).forEach((r) => {
    const key = r.grade_id ?? "—";
    const name = r.grades?.name ?? "بدون صف";
    const level = r.grades?.level ?? 999;
    const cur = byGrade.get(key) ?? {
      name, level, count: 0, paid: 0, unpaid: 0, totalDue: 0, totalPaid: 0, remaining: 0,
      boys: 0, girls: 0, muslims: 0, christians: 0,
    };
    const gender = String(r.gender ?? "").trim();
    const religion = String(r.religion ?? "").trim();
    if (/^(?:ولد|boy|male)$/i.test(gender)) cur.boys += 1;
    if (/^(?:بنت|girl|female)$/i.test(gender)) cur.girls += 1;
    if (/^(?:مسلم|muslim)$/i.test(religion)) cur.muslims += 1;
    if (/^(?:مسيحي|christian)$/i.test(religion)) cur.christians += 1;
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
          boys: a.boys + r.boys, girls: a.girls + r.girls, muslims: a.muslims + r.muslims, christians: a.christians + r.christians,
        }), { count: 0, paid: 0, unpaid: 0, totalDue: 0, totalPaid: 0, remaining: 0, boys: 0, girls: 0, muslims: 0, christians: 0 });
        const stageCount = stageTotals.get(stage) ?? { boys: 0, girls: 0, muslims: 0, christians: 0 };
        return (
          <Card key={stage} style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader>
              <CardTitle className="flex flex-col gap-2">
                <span>{stage}</span>
                {isStudentAffairs ? (
                  <span className="text-sm text-muted-foreground font-normal">
                    ولد {fmt(stageCount.boys)} · بنت {fmt(stageCount.girls)} · مسلم {fmt(stageCount.muslims)} · مسيحي {fmt(stageCount.christians)}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground font-normal">
                    {fmt(tot.count)} طالب · مسدد {fmt(tot.paid)} · غير مسدد {fmt(tot.unpaid)}
                  </span>
                )}
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
                      {isStudentAffairs ? (
                        <>
                          <th className="px-3 py-2 text-right">ولد</th>
                          <th className="px-3 py-2 text-right">بنت</th>
                          <th className="px-3 py-2 text-right">مسلم</th>
                          <th className="px-3 py-2 text-right">مسيحي</th>
                        </>
                      ) : (
                        <>
                          <th className="px-3 py-2 text-right">المستحق</th>
                          <th className="px-3 py-2 text-right">المدفوع</th>
                          <th className="px-3 py-2 text-right">المتبقي</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((g) => (
                      <tr key={g.name} className="border-t">
                        <td className="px-3 py-2 font-medium">{g.name}</td>
                        <td className="px-3 py-2">{fmt(g.count)}</td>
                        <td className="px-3 py-2"><Badge className="bg-success text-success-foreground">{fmt(g.paid)}</Badge></td>
                        <td className="px-3 py-2">{g.unpaid > 0 ? <Badge variant="destructive">{fmt(g.unpaid)}</Badge> : <span className="text-muted-foreground">0</span>}</td>
                        {isStudentAffairs ? (
                          <>
                            <td className="px-3 py-2">{fmt(g.boys)}</td>
                            <td className="px-3 py-2">{fmt(g.girls)}</td>
                            <td className="px-3 py-2">{fmt(g.muslims)}</td>
                            <td className="px-3 py-2">{fmt(g.christians)}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2">{fmt(g.totalDue)}</td>
                            <td className="px-3 py-2 text-success">{fmt(g.totalPaid)}</td>
                            <td className="px-3 py-2 font-medium">{fmt(g.remaining)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/40 font-bold">
                      <td className="px-3 py-2">الإجمالي</td>
                      <td className="px-3 py-2">{fmt(tot.count)}</td>
                      <td className="px-3 py-2">{fmt(tot.paid)}</td>
                      <td className="px-3 py-2">{fmt(tot.unpaid)}</td>
                      {isStudentAffairs ? (
                        <>
                          <td className="px-3 py-2">{fmt(tot.boys)}</td>
                          <td className="px-3 py-2">{fmt(tot.girls)}</td>
                          <td className="px-3 py-2">{fmt(tot.muslims)}</td>
                          <td className="px-3 py-2">{fmt(tot.christians)}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2">{fmt(tot.totalDue)}</td>
                          <td className="px-3 py-2">{fmt(tot.totalPaid)}</td>
                          <td className="px-3 py-2">{fmt(tot.remaining)}</td>
                        </>
                      )}
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
