import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { z } from "zod";

interface Search { studentId?: string }

export const Route = createFileRoute("/receipts/new")({
  head: () => ({ meta: [{ title: "إضافة إيصال" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({ studentId: typeof s.studentId === "string" ? s.studentId : undefined }),
  component: () => <AppShell><NewReceipt /></AppShell>,
});

const schema = z.object({
  student_id: z.string().uuid(),
  receipt_number: z.string().trim().max(60).optional().or(z.literal("")),
  receipt_date: z.string().optional().or(z.literal("")),
  amount: z.coerce.number().positive(),
  payer_name: z.string().trim().max(120).optional().or(z.literal("")),
});

function NewReceipt() {
  const { studentId } = Route.useSearch();
  const navigate = useNavigate();
  const [students, setStudents] = useState<{ id: string; full_name: string; student_code: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    student_id: studentId ?? "",
    receipt_number: "",
    receipt_date: new Date().toISOString().slice(0, 10),
    amount: "",
    payer_name: "",
  });

  useEffect(() => {
    supabase.from("students").select("id, full_name, student_code").order("full_name").limit(500)
      .then(({ data }) => setStudents(data ?? []));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) return toast.error("راجع البيانات");
    setLoading(true);
    const { error } = await supabase.from("receipts").insert({
      ...parsed.data,
      receipt_number: parsed.data.receipt_number || null,
      receipt_date: parsed.data.receipt_date || null,
      status: "pending",
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("تم إنشاء الإيصال — بانتظار الاعتماد");
    navigate({ to: "/receipts" });
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold">إضافة إيصال جديد</h1>
      <form onSubmit={submit}>
        <Card>
          <CardHeader><CardTitle>بيانات الإيصال</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>الطالب *</Label>
              <Select value={form.student_id} onValueChange={(v) => setForm({ ...form, student_id: v })}>
                <SelectTrigger><SelectValue placeholder="اختر الطالب" /></SelectTrigger>
                <SelectContent>
                  {students.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name} {s.student_code && `(${s.student_code})`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>رقم الإيصال</Label><Input value={form.receipt_number} onChange={(e) => setForm({ ...form, receipt_number: e.target.value })} /></div>
              <div className="space-y-2"><Label>تاريخ الإيصال</Label><Input type="date" value={form.receipt_date} onChange={(e) => setForm({ ...form, receipt_date: e.target.value })} /></div>
              <div className="space-y-2"><Label>المبلغ *</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
              <div className="space-y-2"><Label>اسم الدافع</Label><Input value={form.payer_name} onChange={(e) => setForm({ ...form, payer_name: e.target.value })} /></div>
            </div>
            <p className="text-xs text-muted-foreground">سيتم احتساب المبلغ في حساب الطالب فور اعتماد الإيصال.</p>
          </CardContent>
        </Card>
        <div className="flex gap-3 mt-6">
          <Button type="submit" disabled={loading}>حفظ</Button>
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/receipts" })}>إلغاء</Button>
        </div>
      </form>
    </div>
  );
}
