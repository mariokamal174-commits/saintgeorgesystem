import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/students/new")({
  head: () => ({ meta: [{ title: "طالب جديد" }] }),
  component: () => <AppShell><NewStudent /></AppShell>,
});

const schema = z.object({
  full_name: z.string().trim().min(2).max(120),
  student_code: z.string().trim().max(50).optional().or(z.literal("")),
  national_id: z.string().trim().max(30).optional().or(z.literal("")),
  guardian_name: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  first_installment: z.coerce.number().min(0),
  second_installment: z.coerce.number().min(0),
  previous_installments: z.coerce.number().min(0),
  other_fees: z.coerce.number().min(0),
});

function NewStudent() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "", student_code: "", national_id: "", guardian_name: "", phone: "",
    first_installment: "0", second_installment: "0", previous_installments: "0", other_fees: "0",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) return toast.error("راجع البيانات المدخلة");
    setLoading(true);
    const { error } = await supabase.from("students").insert({
      ...parsed.data,
      student_code: parsed.data.student_code || null,
      national_id: parsed.data.national_id || null,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
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
            <div className="space-y-2"><Label>الرقم القومي</Label><Input value={form.national_id} onChange={upd("national_id")} /></div>
            <div className="space-y-2"><Label>اسم ولي الأمر</Label><Input value={form.guardian_name} onChange={upd("guardian_name")} /></div>
            <div className="space-y-2"><Label>الهاتف</Label><Input value={form.phone} onChange={upd("phone")} /></div>
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
