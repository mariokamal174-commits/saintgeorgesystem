import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ArrowRight, Receipt, FileCheck2, Pencil, Trash2, Printer, RotateCcw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { logActivity } from "@/lib/audit";
import { formatAge } from "@/lib/age";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/students/$id/")({
  head: () => ({ meta: [{ title: "ملف الطالب" }] }),
  component: StudentDetail,
});

function StudentDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { isFinance, isAdmin, isStudentAffairs } = useAuth();
  const canEditInstallments = isFinance || isAdmin;
  const canEditDelivery = isStudentAffairs || isAdmin;
  const canEditStudent = isStudentAffairs || isAdmin;
  const [savingPayment, setSavingPayment] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferType, setTransferType] = useState<"transfer" | "withdrawal">("transfer");
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transferSchool, setTransferSchool] = useState<string>("");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [pendingPaymentChange, setPendingPaymentChange] = useState<boolean | null>(null);
  const [lastPaymentStatus, setLastPaymentStatus] = useState<boolean | null>(null);
  const [undoTimeoutId, setUndoTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<(typeof data.receipts[0]) | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resettingData, setResettingData] = useState(false);

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

  useEffect(() => {
    if (!data?.student) {
      setTransferSchool("");
      return;
    }
    setTransferSchool(String(data.student.transfer_out_school ?? ""));
  }, [data?.student?.transfer_out_school]);

  if (!data?.student) return <div className="text-center text-muted-foreground py-12">جاري التحميل...</div>;
  const s = data.student;
  const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n));
  const activityFees = data.receipts.reduce((sum, r) => sum + Number(r.activity_fees ?? 0), 0);
  const allInstallmentsPaid = data.installments.length > 0 && data.installments.every((i) => i.status === "paid" || Number(i.amount) === 0);
  const effectivePaid = s.payment_status === "paid" || allInstallmentsPaid;
  const installmentStatus = (label: string) => {
    const match = data.installments.find((i) => i.label === label);
    return match ? match.status : undefined;
  };

  async function setStudentPaid(nextPaid: boolean) {
    setSavingPayment(true);
    try {
      const { error } = await supabase.rpc("set_student_payment_status", { _student_id: id, _paid: nextPaid });
      setSavingPayment(false);
      if (error) return toast.error(error.message);
      
      setLastPaymentStatus(!nextPaid);
      setPaymentDialogOpen(false);
      
      const message = nextPaid ? "تم تغيير الحالة إلى مسدد بالكامل" : "تم تغيير الحالة إلى غير مسدد";
      const undoMsg = nextPaid ? "غير مسدد" : "مسدد بالكامل";
      
      // Clear previous timeout if exists
      if (undoTimeoutId) clearTimeout(undoTimeoutId);
      
      // Show toast with undo option
      toast.success(message, {
        action: {
          label: `إرجاع إلى ${undoMsg}`,
          onClick: () => undoPaymentChange(),
        },
        duration: 10000,
      });
      
      await logActivity("تحديث", "سداد_الطالب", id, { student_name: s.full_name, status: nextPaid ? "مسدد" : "غير_مسدد", amount: Number(s.total_due) || 0 });
      
      // Auto-undo after 10 seconds if not manually cancelled
      const timeout = setTimeout(() => {
        undoPaymentChange();
      }, 10000);
      setUndoTimeoutId(timeout);
      
      refetch();
    } catch (err) {
      setSavingPayment(false);
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    }
  }

  async function undoPaymentChange() {
    if (lastPaymentStatus === null) return;
    setSavingPayment(true);
    try {
      if (undoTimeoutId) clearTimeout(undoTimeoutId);
      const { error } = await supabase.rpc("set_student_payment_status", { _student_id: id, _paid: lastPaymentStatus });
      setSavingPayment(false);
      if (error) return toast.error(error.message);
      
      setLastPaymentStatus(null);
      const message = lastPaymentStatus ? "تم الإرجاع إلى مسدد بالكامل" : "تم الإرجاع إلى غير مسدد";
      toast.success(message);
      await logActivity("تحديث", "سداد_الطالب", id, { student_name: s.full_name, status: lastPaymentStatus ? "مسدد" : "غير_مسدد", amount: Number(s.total_due) || 0, action: "تراجع" });
      refetch();
    } catch (err) {
      setSavingPayment(false);
      toast.error(err instanceof Error ? err.message : "فشل الإرجاع");
    }
  }

  function handlePaymentStatusClick(nextPaid: boolean) {
    setPendingPaymentChange(nextPaid);
    setPaymentDialogOpen(true);
  }

  async function resetAllFinancialData() {
    if (resetPassword !== "SaintGeorge2026") {
      toast.error("كلمة المرور غير صحيحة");
      return;
    }

    setResettingData(true);
    try {
      // حذف جميع الإيصالات
      const { error: deleteReceiptsError } = await supabase
        .from("receipts")
        .delete()
        .eq("student_id", id);
      
      if (deleteReceiptsError) throw deleteReceiptsError;

      // حذف جميع الأقساط
      const { error: deleteInstallmentsError } = await supabase
        .from("installments")
        .delete()
        .eq("student_id", id);
      
      if (deleteInstallmentsError) throw deleteInstallmentsError;

      // إعادة تعيين البيانات المالية للطالب
      const { error: updateStudentError } = await supabase
        .from("students")
        .update({
          first_installment: 0,
          second_installment: 0,
          previous_installments: 0,
          other_fees: 0,
          activity_fees: 0,
          education_fees: 0,
          total_paid: 0,
          payment_status: "unpaid",
        })
        .eq("id", id);

      if (updateStudentError) throw updateStudentError;

      setResetDialogOpen(false);
      setResetPassword("");
      setResettingData(false);

      await logActivity("إعادة_تعيين", "بيانات_مالية_الطالب", id, {
        student_name: s.full_name,
        message: "تم مسح جميع البيانات المالية",
      });

      toast.success("تم مسح جميع البيانات المالية بنجاح ✓");
      refetch();
    } catch (err) {
      setResettingData(false);
      toast.error(err instanceof Error ? err.message : "فشل مسح البيانات");
    }
  }

  async function deleteStudent() {
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await logActivity("حذف", "طالب", id, { full_name: s.full_name });
    toast.success("تم حذف الطالب");
    navigate({ to: "/students" });
  }

  async function confirmTransferOut() {
    if (transferType === "transfer" && !transferSchool.trim()) {
      toast.error("يرجى كتابة اسم المدرسة المحول إليها");
      return;
    }

    const { error } = await supabase.from("students").update({
      transfer_out_type: transferType,
      transfer_out_date: transferDate,
      transfer_out_school: transferType === "transfer" ? transferSchool.trim() : null,
    }).eq("id", id);
    if (error) return toast.error(error.message);
    await logActivity("تحديث", "تحويل_الطالب", id, { student_name: s.full_name, type: transferType, date: transferDate, school: transferType === "تحويل" ? transferSchool.trim() : null });
    toast.success(transferType === "transfer" ? "تم تسجيله كمحول" : "تم تسجيله كمسحوب");
    setTransferDialogOpen(false);
    refetch();
  }

  async function clearTransferOut() {
    const { error } = await supabase.from("students").update({ transfer_out_type: null, transfer_out_date: null, transfer_out_school: null }).eq("id", id);
    if (error) return toast.error(error.message);
    await logActivity("تحديث", "إلغاء_تحويل_الطالب", id, { student_name: s.full_name });
    toast.success("تم إلغاء حالة السحب");
    refetch();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to="/students"><Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold">{s.full_name}</h1>
            <p className="text-sm text-muted-foreground">
              {s.student_code ?? "بدون كود"} · {s.national_id ?? "بدون رقم قومي"} · السن: {formatAge(s.birth_date)}
            </p>
            <div className="flex gap-2 mt-1">
              {s.is_transferred_in && <Badge variant="outline">محول إلى المدرسة</Badge>}
              {s.transfer_out_type === "transfer" && <Badge className="bg-warning text-warning-foreground">محول (سُحب الملف)</Badge>}
              {s.transfer_out_type === "withdrawal" && <Badge variant="destructive">مسحوب</Badge>}
              {s.archived_year && <Badge variant="secondary">مؤرشف: {s.archived_year}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/students/$id/print" params={{ id }}>
            <Button variant="outline"><Printer className="ml-2 h-4 w-4" />طباعة الطالب</Button>
          </Link>
          {s.class_id && (
            <Link to="/classes/$id/print" params={{ id: s.class_id }}>
              <Button variant="outline"><Printer className="ml-2 h-4 w-4" />طباعة الفصل</Button>
            </Link>
          )}
          {canEditStudent && (
            <Link to="/students/$id/edit" params={{ id }}>
              <Button variant="outline"><Pencil className="ml-2 h-4 w-4" />تعديل</Button>
            </Link>
          )}
          {canEditStudent && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive"><Trash2 className="ml-2 h-4 w-4" />حذف</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>حذف الطالب نهائيًا؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتم حذف بيانات الطالب ({s.full_name}) وجميع الإيصالات والأقساط المرتبطة به. لا يمكن التراجع.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteStudent}>حذف نهائيًا</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {(isFinance || isAdmin) && (
            <Button
              variant="outline"
              className="border-orange-300 hover:bg-orange-50 text-orange-700"
              onClick={() => setResetDialogOpen(true)}
            >
              <RotateCcw className="ml-2 h-4 w-4" />
              مسح البيانات المالية
            </Button>
          )}
          {(isFinance || isAdmin) && (
            <Link to="/finance/receipt-upload" search={{ studentId: id }}>
              <Button><Receipt className="ml-2 h-4 w-4" />إضافة إيصال</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="إجمالي المستحق" value={fmt(Number(s.total_due))} />
        <StatCard label="إجمالي المدفوع" value={fmt(Number(s.total_paid))} tone="success" />
        <StatCard label="المتبقي" value={fmt(Number(s.remaining_balance))} tone={Number(s.remaining_balance) > 0 ? "warning" : "success"} />
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground mb-2">الحالة</div>
          <div className="flex items-center justify-between gap-3">
            {effectivePaid
              ? <Badge className="bg-success text-success-foreground text-base">مسدد بالكامل</Badge>
              : <Badge variant="destructive" className="text-base">غير مسدد</Badge>}
            {canEditInstallments && (
              <Switch checked={effectivePaid} disabled={savingPayment} onCheckedChange={handlePaymentStatusClick} aria-label="تغيير حالة السداد" />
            )}
          </div>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>تفاصيل الأقساط</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="القسط الأول (مع الرسوم)" value={fmt(Number(s.first_installment))} status={installmentStatus("القسط الأول")} />
            <Row label="رسوم النشاط" value={fmt(activityFees)} />
            <Row label="القسط الثاني" value={fmt(Number(s.second_installment))} status={installmentStatus("القسط الثاني")} />
            <Row label="أقساط سنوات سابقة" value={fmt(Number(s.previous_installments))} status={installmentStatus("أقساط سنوات سابقة")} />
            <Row label="رسوم أخرى" value={fmt(Number(s.other_fees))} />
            <div className="border-t pt-2 mt-2 flex justify-between font-bold">
              <span>الإجمالي مع الرسوم</span><span>{fmt(Number(s.first_installment) + Number(s.second_installment) + Number(s.previous_installments) + Number(s.other_fees) + activityFees)}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>الإيصالات</CardTitle></CardHeader>
          <CardContent>
            {data.receipts.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد إيصالات بعد</p> : (
              <div className="space-y-2">
                {data.receipts.map(r => (
                  <div
                    key={r.id}
                    onClick={() => setSelectedReceipt(r)}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
                  >
                    <div>
                      <div className="font-medium text-sm">إيصال #{r.receipt_number ?? r.id.slice(0, 8)}</div>
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
        <CardHeader><CardTitle>بيانات الطالب التفصيلية</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <Row label="تاريخ الميلاد" value={s.birth_date ?? "—"} />
          <Row label="السن في 1/10" value={formatAge(s.birth_date)} />
          <Row label="محل الميلاد" value={s.birth_place ?? "—"} />
          <Row label="النوع" value={s.gender ?? "—"} />
          <Row label="الديانة" value={s.religion ?? "—"} />
          {s.transfer_out_type === "transfer" && (
            <Row label="المدرسة المحول إليها" value={s.transfer_out_school ?? "—"} />
          )}
          <Row label="اسم الأم" value={s.mother_name ?? "—"} />
          <Row label="الرقم القومي للأم" value={s.mother_national_id ?? "—"} />
          <Row label="الرقم القومي للأب" value={s.father_national_id ?? "—"} />
          <Row label="ولي الأمر" value={s.guardian_name ?? "—"} />
          <Row label="وظيفة ولي الأمر" value={s.guardian_job ?? "—"} />
          <Row label="العنوان" value={s.address ?? "—"} />
          <Row label="هاتف 1" value={s.phone ?? "—"} />
          <Row label="هاتف 2" value={s.phone2 ?? "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>أقساط مفصلة</CardTitle></CardHeader>
        <CardContent>
          {data.installments.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد أقساط مسجلة</p> : (
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
                          <div className="flex items-center gap-2">
                            <Switch checked={i.status === "paid"}
                              onCheckedChange={async (checked) => {
                                const next = checked ? "paid" : "unpaid";
                                const { error } = await supabase.from("installments")
                                  .update({ status: next, paid_amount: checked ? Number(i.amount) : 0 })
                                  .eq("id", i.id);
                                if (error) toast.error(error.message);
                                else {
                                  toast.success("تم تحديث حالة القسط");
                                  logActivity("تحديث", "قسط", i.id, { student_name: s.full_name, item: i.label, status: next, amount: Number(i.amount) });
                                  refetch();
                                }
                              }} />
                            <span className="text-sm">{i.status === "paid" ? "مدفوع" : "غير مدفوع"}</span>
                          </div>
                        ) : (i.status === "paid"
                          ? <Badge className="bg-success text-success-foreground">مدفوع</Badge>
                          : <Badge variant="destructive">غير مدفوع</Badge>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <DeliveryCard
        studentId={id}
        studentName={s.full_name}
        delivery={data.delivery as { id: string; delivered: boolean; delivered_at: string | null } | null}
        canEdit={canEditDelivery}
        hasTransferOut={!!s.transfer_out_type}
        onDelivered={() => setTransferDialogOpen(true)}
        onClearTransfer={clearTransferOut}
        onChange={refetch}
      />

      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تم تسليم الملف — هل الطالب محول أم مسحوب؟</DialogTitle>
            <DialogDescription>اختر نوع الإخلاء وتاريخه ليُسجل في كشف المحولين/المسحوبين.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <RadioGroup value={transferType} onValueChange={(v) => setTransferType(v as never)}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="transfer" id="t-tr" />
                <Label htmlFor="t-tr">محول لمدرسة أخرى</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="withdrawal" id="t-wd" />
                <Label htmlFor="t-wd">مسحوب من المدرسة</Label>
              </div>
            </RadioGroup>
            <div className="space-y-2">
              <Label>تاريخ سحب الملف</Label>
              <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
            </div>
            {transferType === "transfer" && (
              <div className="space-y-2">
                <Label>اسم المدرسة المحول إليها</Label>
                <Input
                  type="text"
                  placeholder="اكتب اسم المدرسة..."
                  value={transferSchool}
                  onChange={(e) => setTransferSchool(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>تخطي</Button>
            <Button onClick={confirmTransferOut}>تأكيد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد تغيير حالة السداد</DialogTitle>
            <DialogDescription>
              هل تريد حقاً تغيير حالة السداد من {effectivePaid ? "مسدد بالكامل" : "غير مسدد"} إلى {effectivePaid ? "غير مسدد" : "مسدد بالكامل"}؟
              <br />
              سيكون بإمكانك الإرجاع من خلال زر "Undo" في الإخطار.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>إلغاء</Button>
            <Button onClick={() => pendingPaymentChange !== null && setStudentPaid(pendingPaymentChange)} disabled={savingPayment}>
              {savingPayment ? "جاري الحفظ..." : "تأكيد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedReceipt} onOpenChange={(open) => !open && setSelectedReceipt(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تفاصيل الإيصال</DialogTitle>
          </DialogHeader>
          {selectedReceipt && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">رقم الإيصال</p>
                  <p className="font-bold text-lg">{selectedReceipt.receipt_number ?? selectedReceipt.id.slice(0, 8)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">التاريخ</p>
                  <p className="font-bold text-lg">{selectedReceipt.receipt_date ?? "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">المبلغ الإجمالي</p>
                  <p className="font-bold text-lg text-success">{fmt(Number(selectedReceipt.amount))}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">الحالة</p>
                  <div>
                    {selectedReceipt.status === "approved" && <Badge className="bg-success text-success-foreground">معتمد</Badge>}
                    {selectedReceipt.status === "pending" && <Badge variant="outline">قيد المراجعة</Badge>}
                    {selectedReceipt.status === "rejected" && <Badge variant="destructive">مرفوض</Badge>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">رسوم النشاط</p>
                  <p className="font-semibold">{fmt(Number(selectedReceipt.activity_fees ?? 0))}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">رسوم التعليم</p>
                  <p className="font-semibold">{fmt(Number(selectedReceipt.education_fees ?? 0))}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">اسم الدافع</p>
                  <p className="font-semibold">{selectedReceipt.payer_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">درجة الثقة (OCR)</p>
                  <p className="font-semibold">{selectedReceipt.ocr_confidence ? `${selectedReceipt.ocr_confidence}%` : "—"}</p>
                </div>
              </div>

              {selectedReceipt.image_url && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-3">صورة الإيصال</p>
                  <div className="max-h-96 overflow-auto rounded-md border">
                    <img
                      src={`${process.env.VITE_SUPABASE_URL}/storage/v1/object/public/receipt-images/${selectedReceipt.image_url}`}
                      alt="صورة الإيصال"
                      className="w-full h-auto"
                    />
                  </div>
                </div>
              )}

              {selectedReceipt.ocr_raw && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-2">بيانات استخراج النص (JSON)</p>
                  <div className="bg-muted p-3 rounded-md text-xs overflow-auto max-h-40">
                    <pre>{JSON.stringify(selectedReceipt.ocr_raw, null, 2)}</pre>
                  </div>
                </div>
              )}

              <div className="border-t pt-4 text-xs text-muted-foreground">
                <p>معرف الإيصال: {selectedReceipt.id}</p>
                <p>تم الإنشاء: {new Date(selectedReceipt.created_at).toLocaleString("ar-EG")}</p>
                {selectedReceipt.updated_at && <p>آخر تحديث: {new Date(selectedReceipt.updated_at).toLocaleString("ar-EG")}</p>}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedReceipt(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">⚠️ مسح جميع البيانات المالية</DialogTitle>
            <DialogDescription className="text-base mt-2">
              <div className="space-y-3 text-right">
                <p>سيتم حذف <strong>جميع الإيصالات والأقساط والرسوم</strong> للطالب:</p>
                <p className="font-bold text-lg">{s.full_name}</p>
                <p className="text-red-600">⚠️ هذا الإجراء نهائي ولا يمكن التراجع عنه!</p>
                <p>أدخل كلمة المرور للمتابعة:</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reset-password">كلمة المرور</Label>
              <Input
                id="reset-password"
                type="password"
                placeholder="أدخل كلمة المرور..."
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && resetPassword) {
                    resetAllFinancialData();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetDialogOpen(false); setResetPassword(""); }}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={resetAllFinancialData}
              disabled={!resetPassword || resettingData}
            >
              {resettingData ? "جاري المسح..." : "تأكيد المسح"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DeliveryCard({ studentId, studentName, delivery, canEdit, hasTransferOut, onDelivered, onClearTransfer, onChange }: {
  studentId: string; studentName: string;
  delivery: { id: string; delivered: boolean; delivered_at: string | null } | null;
  canEdit: boolean; hasTransferOut: boolean;
  onDelivered: () => void; onClearTransfer: () => void; onChange: () => void;
}) {
  const delivered = !!delivery?.delivered;
  async function toggle(next: boolean) {
    let error;
    if (delivery?.id) {
      ({ error } = await supabase.from("delivery_tracking")
        .update({ delivered: next, delivered_at: next ? new Date().toISOString() : null })
        .eq("id", delivery.id));
    } else {
      ({ error } = await supabase.from("delivery_tracking").insert({
        student_id: studentId, item: "ملف الطالب", delivered: next,
        delivered_at: next ? new Date().toISOString() : null,
      } as never));
    }
    if (error) return toast.error(error.message);
    toast.success(next ? "تم تسجيل تسليم الملف" : "تم إلغاء تسليم الملف");
    logActivity("تحديث", "توصيل", delivery?.id ?? null, { student_name: studentName, item: "ملف الطالب", delivered: next });
    onChange();
    if (next && !hasTransferOut) onDelivered();
    if (!next && hasTransferOut) onClearTransfer();
  }
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5" />تسليم الملف</CardTitle></CardHeader>
      <CardContent className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          {delivered
            ? <Badge className="bg-success text-success-foreground text-base">تم تسليم الملف</Badge>
            : <Badge variant="destructive" className="text-base">الملف لم يُسلَّم</Badge>}
          {delivery?.delivered_at && delivered && (
            <p className="text-xs text-muted-foreground">بتاريخ {new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(new Date(delivery.delivered_at))}</p>
          )}
          {!canEdit && <p className="text-xs text-muted-foreground">شؤون الطلاب هي المسؤولة عن تحديث هذه الحالة</p>}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">تم التسليم</span>
            <Switch checked={delivered} onCheckedChange={toggle} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" }) {
  const cls = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "";
  return <Card><CardContent className="p-4">
    <div className="text-sm text-muted-foreground">{label}</div>
    <div className={`text-2xl font-bold mt-1 ${cls}`}>{value}</div>
  </CardContent></Card>;
}
function Row({ label, value, status }: { label: string; value: string; status?: string }) {
  return <div className="flex justify-between items-center gap-2"><span className="text-muted-foreground flex items-center gap-2">
    {label}
    {status ? (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase">
        {status === "paid" ? "مدفوع" : "غير مدفوع"}
      </span>
    ) : null}
  </span><span>{value}</span></div>;
}
