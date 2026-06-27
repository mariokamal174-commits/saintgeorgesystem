import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { logActivity } from "@/lib/audit";

export const Route = createFileRoute("/finance/installments")({
  head: () => ({ meta: [{ title: "أقساط الفصول" }] }),
  component: () => <AppShell><FinanceInstallments /></AppShell>,
});

// satisfy unused import
void Outlet;

type S = { id: string; full_name: string; student_code: string | null; grade_name: string | null;
  first_installment: number; second_installment: number; previous_installments: number; other_fees: number;
  activity_fees: number; education_fees: number;
  total_due: number | null; total_paid: number; payment_status: string; archived_year: string | null };

function FinanceInstallments() {
  const { isFinance, isAdmin } = useAuth();
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tpl, setTpl] = useState({ first_installment: "", second_installment: "", previous_installments: "", other_fees: "", activity_fees: "", education_fees: "" });
  const [saving, setSaving] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["finance-students", q, grade],
    queryFn: async () => {
      let qb = supabase.from("students").select("id,full_name,student_code,first_installment,second_installment,previous_installments,other_fees,activity_fees,education_fees,total_due,total_paid,payment_status,archived_year,grades(name)").is("archived_year", null).order("full_name").limit(500);
      if (q) qb = qb.ilike("full_name", `%${q}%`);
      const { data, error } = await qb;
      if (error) throw error;
      const rows: S[] = (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string, full_name: r.full_name as string, student_code: (r.student_code as string | null) ?? null,
        grade_name: ((r.grades as { name?: string } | null)?.name ?? null),
        first_installment: Number(r.first_installment) || 0, second_installment: Number(r.second_installment) || 0,
        previous_installments: Number(r.previous_installments) || 0, other_fees: Number(r.other_fees) || 0,
        activity_fees: Number(r.activity_fees) || 0, education_fees: Number(r.education_fees) || 0,
        total_due: r.total_due as number | null, total_paid: Number(r.total_paid) || 0,
        payment_status: r.payment_status as string, archived_year: r.archived_year as string | null,
      }));
      if (grade) {
        const uniqueGrades = Array.from(new Set(rows.map(r => r.grade_name).filter(Boolean))) as string[];
        const hasExact = uniqueGrades.includes(grade);
        return rows.filter(r => {
          const gn = r.grade_name ?? "";
          if (hasExact) {
            return gn === grade;
          }
          const regex = new RegExp(`\\b${grade}\\b`, 'i');
          return regex.test(gn) || gn.includes(grade);
        });
      }
      return rows;
    },
  });

  const grades = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach(s => s.grade_name && set.add(s.grade_name));
    return Array.from(set).sort();
  }, [data]);

  if (!(isFinance || isAdmin)) return <div className="text-center text-muted-foreground py-12">هذه الصفحة متاحة للشؤون المالية فقط</div>;

  function toggle(id: string) {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  }
  function toggleAll() {
    if (!data) return;
    if (selected.size === data.length) setSelected(new Set());
    else setSelected(new Set(data.map(s => s.id)));
  }

  async function applyTemplate() {
    if (selected.size === 0) return toast.error("اختر طلاب أولاً");
    setSaving(true);
    const payload: { first_installment?: number; second_installment?: number; previous_installments?: number; other_fees?: number; activity_fees?: number; education_fees?: number } = {};
    if (tpl.first_installment !== "") payload.first_installment = Number(tpl.first_installment) || 0;
    if (tpl.second_installment !== "") payload.second_installment = Number(tpl.second_installment) || 0;
    if (tpl.previous_installments !== "") payload.previous_installments = Number(tpl.previous_installments) || 0;
    if (tpl.other_fees !== "") payload.other_fees = Number(tpl.other_fees) || 0;
    if (tpl.activity_fees !== "") payload.activity_fees = Number(tpl.activity_fees) || 0;
    if (tpl.education_fees !== "") payload.education_fees = Number(tpl.education_fees) || 0;
    if (Object.keys(payload).length === 0) { setSaving(false); return toast.error("أدخل قيمة واحدة على الأقل"); }
    const { error } = await supabase.from("students").update(payload).in("id", Array.from(selected));
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`تم تحديث ${selected.size} طالب`);
    await logActivity("update", "bulk_installments", null, { count: selected.size, fields: Object.keys(payload) });
    refetch();
  }

  async function saveRow(s: S) {
    const { error } = await supabase.from("students").update({
      first_installment: s.first_installment, second_installment: s.second_installment,
      previous_installments: s.previous_installments, other_fees: s.other_fees,
      education_fees: s.education_fees, activity_fees: s.activity_fees,
    }).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    refetch();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">أقساط الفصول</h1>
        <p className="text-muted-foreground mt-1">إدارة بيانات الأقساط لكل طالب أو فصل دفعة واحدة</p>
      </div>

      <Card>
        <CardHeader><CardTitle>تطبيق قيم على فصل أو دفعة طلاب</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <div><Label>القسط الأول</Label><Input type="number" value={tpl.first_installment} onChange={(e) => setTpl({ ...tpl, first_installment: e.target.value })} /></div>
            <div><Label>القسط الثاني</Label><Input type="number" value={tpl.second_installment} onChange={(e) => setTpl({ ...tpl, second_installment: e.target.value })} /></div>
            <div><Label>أقساط سابقة</Label><Input type="number" value={tpl.previous_installments} onChange={(e) => setTpl({ ...tpl, previous_installments: e.target.value })} /></div>
            <div><Label>رسوم أخرى</Label><Input type="number" value={tpl.other_fees} onChange={(e) => setTpl({ ...tpl, other_fees: e.target.value })} /></div>
            <div><Label>رسوم التعليم</Label><Input type="number" value={tpl.education_fees} onChange={(e) => setTpl({ ...tpl, education_fees: e.target.value })} /></div>
            <div><Label>رسوم النشاط</Label><Input type="number" value={tpl.activity_fees} onChange={(e) => setTpl({ ...tpl, activity_fees: e.target.value })} /></div>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-48">
              <Label>الفصل / المرحلة</Label>
              <Input list="grade-list" placeholder="مثال: الصف الأول" value={grade} onChange={(e) => setGrade(e.target.value)} />
              <datalist id="grade-list">{grades.map(g => <option key={g} value={g} />)}</datalist>
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
        <CardHeader><CardTitle>الطلاب ({data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-2 py-2"><Checkbox checked={!!data && data.length > 0 && selected.size === data.length} onCheckedChange={toggleAll} /></th>
                  <th className="px-2 py-2 text-right">الاسم</th>
                  <th className="px-2 py-2 text-right">الفصل</th>
                  <th className="px-2 py-2 text-right">قسط 1</th>
                  <th className="px-2 py-2 text-right">قسط 2</th>
                  <th className="px-2 py-2 text-right">سابقة</th>
                  <th className="px-2 py-2 text-right">أخرى</th>
                  <th className="px-2 py-2 text-right">تعليم</th>
                  <th className="px-2 py-2 text-right">نشاط</th>
                  <th className="px-2 py-2 text-right">إجمالي</th>
                  <th className="px-2 py-2 text-right">حفظ</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((s) => (
                  <Row key={s.id} s={s} selected={selected.has(s.id)} onToggle={() => toggle(s.id)} onSave={saveRow} />
                ))}
                {(data ?? []).length === 0 && <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">لا يوجد طلاب</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ s, selected, onToggle, onSave }: { s: S; selected: boolean; onToggle: () => void; onSave: (s: S) => void }) {
  const [r, setR] = useState(s);
  const upd = (k: keyof S) => (e: React.ChangeEvent<HTMLInputElement>) => setR({ ...r, [k]: Number(e.target.value) || 0 });
  const total = (r.first_installment || 0) + (r.second_installment || 0) + (r.previous_installments || 0) + (r.other_fees || 0) + (r.education_fees || 0) + (r.activity_fees || 0);
  return (
    <tr className="border-t">
      <td className="px-2 py-1.5"><Checkbox checked={selected} onCheckedChange={onToggle} /></td>
      <td className="px-2 py-1.5 font-medium">{r.full_name}</td>
      <td className="px-2 py-1.5 text-muted-foreground">{r.grade_name ?? "—"}</td>
      <td className="px-2 py-1.5"><Input type="number" className="h-8 w-24" value={r.first_installment} onChange={upd("first_installment")} /></td>
      <td className="px-2 py-1.5"><Input type="number" className="h-8 w-24" value={r.second_installment} onChange={upd("second_installment")} /></td>
      <td className="px-2 py-1.5"><Input type="number" className="h-8 w-24" value={r.previous_installments} onChange={upd("previous_installments")} /></td>
      <td className="px-2 py-1.5"><Input type="number" className="h-8 w-24" value={r.other_fees} onChange={upd("other_fees")} /></td>
      <td className="px-2 py-1.5"><Input type="number" className="h-8 w-24" value={r.education_fees} onChange={upd("education_fees")} /></td>
      <td className="px-2 py-1.5"><Input type="number" className="h-8 w-24" value={r.activity_fees} onChange={upd("activity_fees")} /></td>
      <td className="px-2 py-1.5 font-bold">{new Intl.NumberFormat("ar-EG").format(total)}</td>
      <td className="px-2 py-1.5"><Button size="sm" variant="outline" onClick={() => onSave(r)}>حفظ</Button></td>
    </tr>
  );
}
