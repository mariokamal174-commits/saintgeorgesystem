import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowRight, Receipt, FileCheck2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { logActivity } from "@/lib/audit";

export const Route = createFileRoute("/students/$id")({
  head: () => ({ meta: [{ title: "ملف الطالب" }] }),
  component: () => <AppShell><StudentDetail /></AppShell>,
});

function StudentDetail() {
  const { id } = Route.useParams();
  const { isFinance, isAdmin, isStudentAffairs } = useAuth();
  const canEditInstallments = isFinance || isAdmin;
  const canEditDelivery = isStudentAffairs || isAdmin;
  const { data, refetch } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const [s, inst, rec, del] = await Promise.all([
        supabase.from("students").select("*").eq("id", id).maybeSingle(),
        supabase.from("installments").select("*").eq("student_id", id).order("due_date"),
        supabase.from("receipts").select("*").eq("student_id", id).order("created_at", { ascending: false }),
        supabase.from("delivery_tracking").select("*").eq("student_id", id).eq("item", "ملف الطالب").maybeSingle(),
      ]);
      return { student: s.data, installments: inst.data ?? [], receipts: rec.data ?? [], delivery: del.data };
    },
  });

  useEffect(() => {
    const ch = supabase.channel(`student-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "students", filter: `id=eq.${id}` }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "receipts", filter: `student_id=eq.${id}` }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "installments", filter: `student_id=eq.${id}` }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_tracking", filter: `student_id=eq.${id}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, refetch]);

  if (!data?.student) return <div className="text-center text-muted-foreground py-12">جاري التحميل...</div>;
  const s = data.student;
  const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to="/students"><Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold">{s.full_name}</h1>
            <p className="text-sm text-muted-foreground">{s.student_code ?? "بدون كود"} · {s.national_id ?? "بدون رقم قومي"}</p>
          </div>
        </div>
        {(isFinance || isAdmin) && (
          <Link to="/receipts/new" search={{ studentId: id }}>
            <Button><Receipt className="ml-2 h-4 w-4" />إضافة إيصال</Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="إجمالي المستحق" value={fmt(Number(s.total_due))} />
        <StatCard label="إجمالي المدفوع" value={fmt(Number(s.total_paid))} tone="success" />
        <StatCard label="المتبقي" value={fmt(Number(s.remaining_balance))} tone={Number(s.remaining_balance) > 0 ? "warning" : "success"} />
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground mb-2">الحالة</div>
          {s.payment_status === "paid" && <Badge className="bg-success text-success-foreground text-base">مسدد بالكامل</Badge>}
          {s.payment_status === "partial" && <Badge className="bg-warning text-warning-foreground text-base">دفعة جزئية</Badge>}
          {s.payment_status === "unpaid" && <Badge variant="destructive" className="text-base">غير مسدد</Badge>}
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>تفاصيل الأقساط</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="القسط الأول" value={fmt(Number(s.first_installment))} />
            <Row label="القسط الثاني" value={fmt(Number(s.second_installment))} />
            <Row label="أقساط سنوات سابقة" value={fmt(Number(s.previous_installments))} />
            <Row label="رسوم أخرى" value={fmt(Number(s.other_fees))} />
            <div className="border-t pt-2 mt-2 flex justify-between font-bold">
              <span>الإجمالي</span><span>{fmt(Number(s.total_due))}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>الإيصالات</CardTitle></CardHeader>
          <CardContent>
            {data.receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد إيصالات بعد</p>
            ) : (
              <div className="space-y-2">
                {data.receipts.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                    <div>
                      <div className="font-medium text-sm">إيصال #{r.receipt_number ?? r.id.slice(0,8)}</div>
                      <div className="text-xs text-muted-foreground">{r.receipt_date ?? "—"}</div>
                    </div>
                    <div className="text-left">
                      <div className="font-bold">{fmt(Number(r.amount))}</div>
                      {r.status === "approved" && <Badge variant="outline" className="text-success border-success">معتمد</Badge>}
                      {r.status === "pending" && <Badge variant="outline">قيد المراجعة</Badge>}
                      {r.status === "rejected" && <Badge variant="destructive">مرفوض</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>أقساط مفصلة</CardTitle></CardHeader>
        <CardContent>
          {data.installments.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد أقساط مسجلة</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-right">القسط</th>
                    <th className="px-3 py-2 text-right">المبلغ</th>
                    <th className="px-3 py-2 text-right">تاريخ الاستحقاق</th>
                    <th className="px-3 py-2 text-right">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {data.installments.map((i) => (
                    <tr key={i.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{i.label}</td>
                      <td className="px-3 py-2">{fmt(Number(i.amount))}</td>
                      <td className="px-3 py-2 text-muted-foreground">{i.due_date ?? "—"}</td>
                      <td className="px-3 py-2">
                        {canEditInstallments ? (
                          <Select
                            value={i.status}
                            onValueChange={async (v) => {
                              const { error } = await supabase.from("installments")
                                .update({ status: v as "paid" | "partial" | "unpaid" })
                                .eq("id", i.id);
                              if (error) toast.error(error.message);
                              else {
                                toast.success("تم تحديث حالة القسط");
                                logActivity("update", "installment", i.id, { status: v });
                                refetch();
                              }
                            }}
                          >
                            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="paid">مدفوع</SelectItem>
                              <SelectItem value="partial">جزئي</SelectItem>
                              <SelectItem value="unpaid">غير مدفوع</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <>
                            {i.status === "paid" && <Badge className="bg-success text-success-foreground">مدفوع</Badge>}
                            {i.status === "partial" && <Badge className="bg-warning text-warning-foreground">جزئي</Badge>}
                            {i.status === "unpaid" && <Badge variant="destructive">غير مدفوع</Badge>}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" }) {
  const cls = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "";
  return <Card><CardContent className="p-4">
    <div className="text-sm text-muted-foreground">{label}</div>
    <div className={`text-2xl font-bold mt-1 ${cls}`}>{value}</div>
  </CardContent></Card>;
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}
