import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/students/$id/edit")({
  head: () => ({ meta: [{ title: "تعديل الطالب" }] }),
  component: EditStudent,
});

function EditStudent() {
  const { id } = Route.useParams();
  const { isStudentAffairs, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<Record<string, string>>({});
  const [isTransferredIn, setIsTransferredIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
      if (error || !data) { toast.error("تعذر تحميل الطالب"); return; }
      const stringify = (v: unknown) => v == null ? "" : String(v);
      setForm({
        full_name: data.full_name ?? "",
        student_code: stringify(data.student_code),
        national_id: stringify(data.national_id),
        birth_date: stringify(data.birth_date),
        birth_place: stringify(data.birth_place),
        gender: stringify(data.gender),
        religion: stringify(data.religion),
        mother_name: stringify(data.mother_name),
        mother_national_id: stringify(data.mother_national_id),
        father_national_id: stringify(data.father_national_id),
        guardian_name: stringify(data.guardian_name),
        guardian_job: stringify(data.guardian_job),
        address: stringify(data.address),
        phone: stringify(data.phone),
        phone2: stringify(data.phone2),
        first_installment: stringify(data.first_installment),
        second_installment: stringify(data.second_installment),
        previous_installments: stringify(data.previous_installments),
        other_fees: stringify(data.other_fees),
      });
      setIsTransferredIn(!!data.is_transferred_in);
      setLoaded(true);
    })();
  }, [id]);

  if (!(isStudentAffairs || isAdmin)) return <div className="text-center text-muted-foreground py-12">التعديل متاح لشؤون الطلاب فقط</div>;
  if (!loaded) return <div className="text-center text-muted-foreground py-12">جاري التحميل...</div>;

  const upd = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const payload = {
      full_name: form.full_name.trim(),
      student_code: form.student_code || null,
      national_id: form.national_id || null,
      birth_date: form.birth_date || null,
      birth_place: form.birth_place || null,
      gender: form.gender || null,
      religion: form.religion || null,
      mother_name: form.mother_name || null,
      mother_national_id: form.mother_national_id || null,
      father_national_id: form.father_national_id || null,
      guardian_name: form.guardian_name || null,
      guardian_job: form.guardian_job || null,
      address: form.address || null,
      phone: form.phone || null,
      phone2: form.phone2 || null,
      first_installment: Number(form.first_installment) || 0,
      second_installment: Number(form.second_installment) || 0,
      previous_installments: Number(form.previous_installments) || 0,
      other_fees: Number(form.other_fees) || 0,
      is_transferred_in: isTransferredIn,
    };
    const { error } = await supabase.from("students").update(payload).eq("id", id);
    setLoading(false);
    if (error) return toast.error(error.message);
    const { logActivity } = await import("@/lib/audit");
    await logActivity("update", "student", id, { full_name: payload.full_name });
    toast.success("تم حفظ التعديلات");
    navigate({ to: "/students/$id", params: { id } });
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link to="/students/$id" params={{ id }}><Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4" /></Button></Link>
        <h1 className="text-3xl font-bold">تعديل بيانات الطالب</h1>
      </div>
      <form onSubmit={submit}>
        <Card>
          <CardHeader><CardTitle>بيانات الطالب</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2"><Label>الاسم الكامل *</Label><Input value={form.full_name} onChange={upd("full_name")} required /></div>
            <div className="space-y-2"><Label>كود الطالب</Label><Input value={form.student_code} onChange={upd("student_code")} /></div>
            <div className="space-y-2"><Label>الرقم القومي للطالب</Label><Input value={form.national_id} onChange={upd("national_id")} /></div>
            <div className="space-y-2"><Label>تاريخ الميلاد</Label><Input type="date" value={form.birth_date} onChange={upd("birth_date")} /></div>
            <div className="space-y-2"><Label>محل الميلاد</Label><Input value={form.birth_place} onChange={upd("birth_place")} /></div>
            <div className="space-y-2"><Label>النوع</Label><Input value={form.gender} onChange={upd("gender")} /></div>
            <div className="space-y-2"><Label>الديانة</Label><Input value={form.religion} onChange={upd("religion")} /></div>
            <div className="space-y-2 sm:col-span-2 flex items-center gap-3 pt-4">
              <Checkbox id="trin" checked={isTransferredIn} onCheckedChange={(v) => setIsTransferredIn(!!v)} />
              <Label htmlFor="trin" className="cursor-pointer">الطالب محول إلى المدرسة</Label>
            </div>
          </CardContent>
        </Card>
        <Card className="mt-4">
          <CardHeader><CardTitle>الأسرة وولي الأمر</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>اسم الأم</Label><Input value={form.mother_name} onChange={upd("mother_name")} /></div>
            <div className="space-y-2"><Label>الرقم القومي للأم</Label><Input value={form.mother_national_id} onChange={upd("mother_national_id")} /></div>
            <div className="space-y-2"><Label>الرقم القومي للأب</Label><Input value={form.father_national_id} onChange={upd("father_national_id")} /></div>
            <div className="space-y-2"><Label>اسم ولي الأمر</Label><Input value={form.guardian_name} onChange={upd("guardian_name")} /></div>
            <div className="space-y-2"><Label>وظيفة ولي الأمر</Label><Input value={form.guardian_job} onChange={upd("guardian_job")} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>العنوان</Label><Input value={form.address} onChange={upd("address")} /></div>
            <div className="space-y-2"><Label>الهاتف 1</Label><Input value={form.phone} onChange={upd("phone")} /></div>
            <div className="space-y-2"><Label>الهاتف 2</Label><Input value={form.phone2} onChange={upd("phone2")} /></div>
          </CardContent>
        </Card>
        <Card className="mt-4">
          <CardHeader><CardTitle>البيانات المالية</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>القسط الأول</Label><Input type="number" step="0.01" value={form.first_installment} onChange={upd("first_installment")} /></div>
            <div className="space-y-2"><Label>القسط الثاني</Label><Input type="number" step="0.01" value={form.second_installment} onChange={upd("second_installment")} /></div>
            <div className="space-y-2"><Label>أقساط سنوات سابقة</Label><Input type="number" step="0.01" value={form.previous_installments} onChange={upd("previous_installments")} /></div>
            <div className="space-y-2"><Label>رسوم أخرى</Label><Input type="number" step="0.01" value={form.other_fees} onChange={upd("other_fees")} /></div>
          </CardContent>
        </Card>
        <div className="flex gap-3 mt-6">
          <Button type="submit" disabled={loading}>حفظ التعديلات</Button>
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/students/$id", params: { id } })}>إلغاء</Button>
        </div>
      </form>
    </div>
  );
}
