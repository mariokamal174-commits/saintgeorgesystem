import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/students/new")({
  head: () => ({ meta: [{ title: "طالب جديد" }] }),
  component: () => <AppShell><NewStudent /></AppShell>,
});

const schema = z.object({
  full_name: z.string().trim().min(2).max(120),
  student_code: z.string().trim().max(50).optional().or(z.literal("")),
  national_id: z.string().trim().max(30).optional().or(z.literal("")),
  birth_date: z.string().optional().or(z.literal("")),
  birth_place: z.string().trim().max(120).optional().or(z.literal("")),
  gender: z.string().optional().or(z.literal("")),
  religion: z.string().optional().or(z.literal("")),
  mother_name: z.string().trim().max(120).optional().or(z.literal("")),
  mother_national_id: z.string().trim().max(30).optional().or(z.literal("")),
  father_national_id: z.string().trim().max(30).optional().or(z.literal("")),
  guardian_name: z.string().trim().max(120).optional().or(z.literal("")),
  guardian_job: z.string().trim().max(120).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  phone2: z.string().trim().max(30).optional().or(z.literal("")),
  first_installment: z.coerce.number().min(0),
  second_installment: z.coerce.number().min(0),
  previous_installments: z.coerce.number().min(0),
  other_fees: z.coerce.number().min(0),
});

function NewStudent() {
  const { isStudentAffairs, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isTransferredIn, setIsTransferredIn] = useState(false);
  const [isNewStudent, setIsNewStudent] = useState(false);
  const [form, setForm] = useState({
    full_name: "", student_code: "", national_id: "",
    birth_date: "", birth_place: "", gender: "", religion: "",
    mother_name: "", mother_national_id: "", father_national_id: "",
    guardian_name: "", guardian_job: "", address: "", phone: "", phone2: "",
    first_installment: "0", second_installment: "0", previous_installments: "0", other_fees: "0",
  });
  if (!(isStudentAffairs || isAdmin)) return <div className="text-center text-muted-foreground py-12">إضافة طلاب متاحة لشؤون الطلاب فقط</div>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) return toast.error("راجع البيانات المدخلة");
    setLoading(true);
    const payload = {
      ...parsed.data,
      student_code: parsed.data.student_code || null,
      national_id: parsed.data.national_id || null,
      birth_date: parsed.data.birth_date || null,
      is_transferred_in: isTransferredIn,
      is_new_student: isNewStudent,
    };
    const { data, error } = await supabase.from("students").insert(payload).select("id").maybeSingle();
    setLoading(false);
    if (error) return toast.error(error.message);
    const { logActivity } = await import("@/lib/audit");
    await logActivity("إنشاء", "طالب", data?.id, { full_name: parsed.data.full_name });
    toast.success("تم إضافة الطالب");
    navigate({ to: "/students" });
  }

  const upd = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold">إضافة طالب جديد</h1>
      <form onSubmit={submit}>
        <Card>
          <CardHeader><CardTitle>بيانات الطالب</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2"><Label>الاسم الكامل *</Label><Input value={form.full_name} onChange={upd("full_name")} required /></div>
            <div className="space-y-2"><Label>كود الطالب</Label><Input value={form.student_code} onChange={upd("student_code")} /></div>
            <div className="space-y-2"><Label>الرقم القومي للطالب</Label><Input value={form.national_id} onChange={upd("national_id")} /></div>
            <div className="space-y-2"><Label>تاريخ الميلاد</Label><Input type="date" value={form.birth_date} onChange={upd("birth_date")} /></div>
            <div className="space-y-2"><Label>محل الميلاد</Label><Input value={form.birth_place} onChange={upd("birth_place")} /></div>
            <div className="space-y-2"><Label>النوع</Label><Input value={form.gender} onChange={upd("gender")} placeholder="ولد / بنت" /></div>
            <div className="space-y-2"><Label>الديانة</Label><Input value={form.religion} onChange={upd("religion")} /></div>
            <div className="space-y-2 sm:col-span-2 flex flex-wrap gap-6 pt-4">
              <div className="flex items-center gap-3">
                <Checkbox id="trin" checked={isTransferredIn} onCheckedChange={(v) => setIsTransferredIn(!!v)} />
                <Label htmlFor="trin" className="cursor-pointer">الطالب محول إلى المدرسة</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox id="isnew" checked={isNewStudent} onCheckedChange={(v) => setIsNewStudent(!!v)} />
                <Label htmlFor="isnew" className="cursor-pointer">طالب جديد</Label>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="mt-4">
          <CardHeader><CardTitle>بيانات الأسرة وولي الأمر</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>اسم الأم</Label><Input value={form.mother_name} onChange={upd("mother_name")} /></div>
            <div className="space-y-2"><Label>الرقم القومي للأم</Label><Input value={form.mother_national_id} onChange={upd("mother_national_id")} /></div>
            <div className="space-y-2"><Label>الرقم القومي للأب</Label><Input value={form.father_national_id} onChange={upd("father_national_id")} /></div>
            <div className="space-y-2"><Label>اسم ولي الأمر</Label><Input value={form.guardian_name} onChange={upd("guardian_name")} /></div>
            <div className="space-y-2"><Label>وظيفة ولي الأمر</Label><Input value={form.guardian_job} onChange={upd("guardian_job")} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>العنوان</Label><Input value={form.address} onChange={upd("address")} /></div>
            <div className="space-y-2"><Label>رقم الموبايل 1</Label><Input value={form.phone} onChange={upd("phone")} /></div>
            <div className="space-y-2"><Label>رقم الموبايل 2</Label><Input value={form.phone2} onChange={upd("phone2")} /></div>
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
          <Button type="submit" disabled={loading}>حفظ الطالب</Button>
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/students" })}>إلغاء</Button>
        </div>
      </form>
    </div>
  );
}
