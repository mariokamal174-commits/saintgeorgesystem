import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { type ChangeEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { logActivity } from "@/lib/audit";
import { Upload, FileUp, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/finance/installments")({
  head: () => ({ meta: [{ title: "أقساط الفصول" }] }),
  component: () => <AppShell><FinanceInstallments /></AppShell>,
});

// satisfy unused import
void Outlet;

type S = { id: string; full_name: string; student_code: string | null; grade_name: string | null;
  first_installment: number; second_installment: number; previous_installments: number; other_fees: number;
  activity_fees: number;
  total_due: number | null; total_paid: number; payment_status: string; archived_year: string | null };

function FinanceInstallments() {
  const { isFinance, isAdmin } = useAuth();
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tpl, setTpl] = useState({ first_installment: "", second_installment: "", previous_installments: "", other_fees: "", activity_fees: "" });
  const [saving, setSaving] = useState(false);
  const [resetWarningOpen, setResetWarningOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resettingData, setResettingData] = useState(false);

  const { data: gradeRows } = useQuery({
    queryKey: ["finance-installment-grades"],
    queryFn: async () => {
      const { data, error } = await supabase.from("grades").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data, refetch } = useQuery<{ rows: S[]; supportsStudentFeeColumns: boolean }>({
    queryKey: ["finance-students", q, grade],
    queryFn: async () => {
      const columns = "id,full_name,student_code,grade_id,first_installment,second_installment,previous_installments,other_fees,activity_fees,total_due,total_paid,payment_status,archived_year,grades(name)";
      const fallbackColumns = "id,full_name,student_code,grade_id,first_installment,second_installment,previous_installments,other_fees,total_due,total_paid,payment_status,archived_year,grades(name)";

      const buildQuery = (selectCols: string) => {
        let qb = supabase.from("students").select(selectCols).is("archived_year", null).order("full_name").limit(500);
        if (q) qb = qb.ilike("full_name", `%${q}%`);
        if (grade) qb = qb.eq("grade_id", grade);
        return qb;
      };

      const mapRows = (data: any): S[] => ((data ?? []) as any[]).map((r) => ({
        id: r.id as string,
        full_name: r.full_name as string,
        student_code: (r.student_code as string | null) ?? null,
        grade_name: ((r.grades as { name?: string } | null)?.name ?? null),
        first_installment: Number(r.first_installment) || 0,
        second_installment: Number(r.second_installment) || 0,
        previous_installments: Number(r.previous_installments) || 0,
        other_fees: Number(r.other_fees) || 0,
        activity_fees: Number(r.activity_fees) || 0,
        total_due: r.total_due as number | null,
        total_paid: Number(r.total_paid) || 0,
        payment_status: r.payment_status as string,
        archived_year: r.archived_year as string | null,
      }));

      const { data: studentData, error } = await buildQuery(columns);
      if (error) {
        if (/activity_fees/i.test(error.message ?? "")) {
          const { data: fallbackData, error: fallbackError } = await buildQuery(fallbackColumns);
          if (fallbackError) throw fallbackError;
          return { rows: mapRows(fallbackData), supportsStudentFeeColumns: false };
        }
        throw error;
      }

      return { rows: mapRows(studentData), supportsStudentFeeColumns: true };
    },
  });

  const students = data?.rows ?? [];
  const supportsStudentFeeColumns = data?.supportsStudentFeeColumns ?? true;

  if (!(isFinance || isAdmin)) return <div className="text-center text-muted-foreground py-12">هذه الصفحة متاحة للشؤون المالية فقط</div>;

  function toggle(id: string) {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  }
  function toggleAll() {
    if (students.length === 0) return;
    if (selected.size === students.length) setSelected(new Set());
    else setSelected(new Set(students.map(s => s.id)));
  }

  async function applyTemplate() {
    if (selected.size === 0) return toast.error("اختر طلاب أولاً");
    setSaving(true);
    const payload: { first_installment?: number; second_installment?: number; previous_installments?: number; other_fees?: number; activity_fees?: number } = {};
    if (tpl.first_installment !== "") payload.first_installment = Number(tpl.first_installment) || 0;
    if (tpl.second_installment !== "") payload.second_installment = Number(tpl.second_installment) || 0;
    if (tpl.previous_installments !== "") payload.previous_installments = Number(tpl.previous_installments) || 0;
    if (tpl.other_fees !== "") payload.other_fees = Number(tpl.other_fees) || 0;
    if (supportsStudentFeeColumns && tpl.activity_fees !== "") payload.activity_fees = Number(tpl.activity_fees) || 0;
    if (Object.keys(payload).length === 0) { setSaving(false); return toast.error("أدخل قيمة واحدة على الأقل"); }
    const { error } = await supabase.from("students").update(payload).in("id", Array.from(selected));
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`تم تحديث ${selected.size} طالب`);
      await logActivity("تحديث", "أقساط_جماعية", null, { count: selected.size, fields: Object.keys(payload) });
    refetch();
  }

  async function saveRow(s: S) {
    const updatePayload: Record<string, number> = {
      first_installment: s.first_installment,
      second_installment: s.second_installment,
      previous_installments: s.previous_installments,
      other_fees: s.other_fees,
    };
    if (supportsStudentFeeColumns) {
      updatePayload.activity_fees = s.activity_fees;
    }
    const { error } = await supabase.from("students").update(updatePayload).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    refetch();
  }

  async function resetAllSystemData() {
    if (resetPassword !== "SaintGeorge2026") {
      toast.error("كلمة المرور غير صحيحة");
      return;
    }
    setResettingData(true);
    try {
      // حذف جميع الإيصالات
      const { error: receiptError } = await supabase.from("receipts").delete().gt("id", "");
      if (receiptError) throw receiptError;

      // حذف جميع الأقساط
      const { error: installmentError } = await supabase.from("installments").delete().gt("id", "");
      if (installmentError) throw installmentError;

      // إعادة تعيين بيانات جميع الطلاب
      const { error: resetError } = await supabase.from("students").update({
        first_installment: 0,
        second_installment: 0,
        previous_installments: 0,
        other_fees: 0,
        activity_fees: 0,
        payment_status: "unpaid"
      }).gt("id", "");
      if (resetError) throw resetError;

      // تسجيل النشاط
      await logActivity("إعادة_تعيين", "بيانات_مالية", "نظام", { نوع: "إعادة_تعيين_بيانات_مالية_جميع_الطلاب" });

      toast.success("تم مسح جميع البيانات المالية بنجاح");
      setResetDialogOpen(false);
      setResetPassword("");
      setResetWarningOpen(false);
      refetch();
    } catch (error) {
      toast.error("حدث خطأ: " + (error instanceof Error ? error.message : "فشل المسح"));
    } finally {
      setResettingData(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">أقساط الفصول</h1>
          <p className="text-muted-foreground mt-1">إدارة بيانات الأقساط لكل طالب أو فصل دفعة واحدة</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/finance/import-fees">
            <Button variant="outline"><FileUp className="ml-2 h-4 w-4" />استيراد من اكسيل</Button>
          </Link>
          <Link to="/finance/receipt-upload">
            <Button><Upload className="ml-2 h-4 w-4" />رفع إيصالات</Button>
          </Link>
          {(isFinance || isAdmin) && (
            <Button
              variant="outline"
              className="border-red-300 hover:bg-red-50 text-red-700"
              onClick={() => setResetWarningOpen(true)}
            >
              <RotateCcw className="ml-2 h-4 w-4" />
              مسح كل البيانات المالية
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>تطبيق قيم على فصل أو دفعة طلاب</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <div><Label>القسط الأول</Label><Input type="number" value={tpl.first_installment} onChange={(e) => setTpl({ ...tpl, first_installment: e.target.value })} /></div>
            <div><Label>القسط الثاني</Label><Input type="number" value={tpl.second_installment} onChange={(e) => setTpl({ ...tpl, second_installment: e.target.value })} /></div>
            <div><Label>أقساط سابقة</Label><Input type="number" value={tpl.previous_installments} onChange={(e) => setTpl({ ...tpl, previous_installments: e.target.value })} /></div>
            <div><Label>رسوم أخرى</Label><Input type="number" value={tpl.other_fees} onChange={(e) => setTpl({ ...tpl, other_fees: e.target.value })} /></div>
            {supportsStudentFeeColumns && (
              <div><Label>رسوم النشاط</Label><Input type="number" value={tpl.activity_fees} onChange={(e) => setTpl({ ...tpl, activity_fees: e.target.value })} /></div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-48">
              <Label>الفصل / المرحلة</Label>
              <select className="w-full rounded-md border bg-background p-2 text-sm outline-none" value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="">اختر الفصل أو المرحلة</option>
                {(gradeRows ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-48">
              <Label>بحث بالاسم</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم الطالب" />
            </div>
            <Button onClick={applyTemplate} disabled={saving || selected.size === 0}>
              تطبيق على المحددين ({selected.size})
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>الطلاب ({students.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-2 py-2"><Checkbox checked={students.length > 0 && selected.size === students.length} onCheckedChange={toggleAll} /></th>
                  <th className="px-2 py-2 text-right">الاسم</th>
                  <th className="px-2 py-2 text-right">الفصل</th>
                  <th className="px-2 py-2 text-right">قسط 1</th>
                  <th className="px-2 py-2 text-right">قسط 2</th>
                  <th className="px-2 py-2 text-right">سابقة</th>
                  <th className="px-2 py-2 text-right">أخرى</th>
                  {supportsStudentFeeColumns && <th className="px-2 py-2 text-right">نشاط</th>}
                  <th className="px-2 py-2 text-right">إجمالي</th>
                  <th className="px-2 py-2 text-right">حفظ</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <Row key={s.id} s={s} selected={selected.has(s.id)} onToggle={() => toggle(s.id)} onSave={saveRow} supportsStudentFeeColumns={supportsStudentFeeColumns} />
                ))}
                {students.length === 0 && <tr><td colSpan={supportsStudentFeeColumns ? 10 : 8} className="text-center py-8 text-muted-foreground">لا يوجد طلاب</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={resetWarningOpen} onOpenChange={setResetWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">⚠️ تحذير - مسح البيانات المالية</AlertDialogTitle>
            <AlertDialogDescription className="text-base mt-4">
              <div className="space-y-3 text-right">
                <p className="font-bold">هذا سيحذف:</p>
                <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                  <li>جميع الإيصالات من جميع الطلاب</li>
                  <li>جميع الأقساط من جميع الطلاب</li>
                  <li>إعادة تعيين جميع الرسوم إلى صفر</li>
                  <li>إعادة تعيين حالة السداد لجميع الطلاب إلى "غير مسدد"</li>
                </ul>
                <p className="text-red-600 font-bold mt-4">⚠️ هذا الإجراء نهائي ولا يمكن التراجع عنه!</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => setResetDialogOpen(true)} className="bg-red-600 hover:bg-red-700">
              متابعة (أدخل كلمة المرور)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">أدخل كلمة المرور</DialogTitle>
            <DialogDescription>
              أدخل كلمة المرور لتأكيد مسح جميع البيانات المالية
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="system-reset-password">كلمة المرور</Label>
              <Input
                id="system-reset-password"
                type="password"
                placeholder="أدخل كلمة المرور..."
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && resetPassword) {
                    resetAllSystemData();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetDialogOpen(false); setResetPassword(""); }}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={resetAllSystemData}
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

function Row({ s, selected, onToggle, onSave, supportsStudentFeeColumns }: { s: S; selected: boolean; onToggle: () => void; onSave: (s: S) => void; supportsStudentFeeColumns: boolean }) {
  const [r, setR] = useState(s);
  const upd = (k: keyof S) => (e: ChangeEvent<HTMLInputElement>) => setR({ ...r, [k]: Number(e.target.value) || 0 });
  const total = (r.first_installment || 0) + (r.second_installment || 0) + (r.previous_installments || 0) + (r.other_fees || 0) + (supportsStudentFeeColumns ? (r.activity_fees || 0) : 0);
  return (
    <tr className="border-t">
      <td className="px-2 py-1.5"><Checkbox checked={selected} onCheckedChange={onToggle} /></td>
      <td className="px-2 py-1.5 font-medium">{r.full_name}</td>
      <td className="px-2 py-1.5 text-muted-foreground">{r.grade_name ?? "—"}</td>
      <td className="px-2 py-1.5"><Input type="number" className="h-8 w-24" value={r.first_installment} onChange={upd("first_installment")} /></td>
      <td className="px-2 py-1.5"><Input type="number" className="h-8 w-24" value={r.second_installment} onChange={upd("second_installment")} /></td>
      <td className="px-2 py-1.5"><Input type="number" className="h-8 w-24" value={r.previous_installments} onChange={upd("previous_installments")} /></td>
      <td className="px-2 py-1.5"><Input type="number" className="h-8 w-24" value={r.other_fees} onChange={upd("other_fees")} /></td>
      {supportsStudentFeeColumns && <td className="px-2 py-1.5"><Input type="number" className="h-8 w-24" value={r.activity_fees} onChange={upd("activity_fees")} /></td>}
      <td className="px-2 py-1.5 font-bold">{new Intl.NumberFormat("ar-EG").format(total)}</td>
      <td className="px-2 py-1.5"><Button size="sm" variant="outline" onClick={() => onSave(r)}>حفظ</Button></td>
    </tr>
  );
}
