import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { extractReceiptData } from "@/lib/ai-receipt.functions";
import { Loader2, Sparkles, Upload as UploadIcon } from "lucide-react";

interface Search { studentId?: string }

export const Route = createFileRoute("/receipts/new")({
  head: () => ({ meta: [{ title: "إضافة إيصال" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({ studentId: typeof s.studentId === "string" ? s.studentId : undefined }),
  component: () => <AppShell><NewReceipt /></AppShell>,
});

function NewReceipt() {
  const { studentId } = Route.useSearch();
  const navigate = useNavigate();
  const { isFinance, isAdmin } = useAuth();
  const extractFn = useServerFn(extractReceiptData);
  const fileRef = useRef<HTMLInputElement>(null);
  const [students, setStudents] = useState<{ id: string; full_name: string; student_code: string | null }[]>([]);
  const [receiptCount, setReceiptCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    student_id: studentId ?? "",
    receipt_number: "",
    receipt_date: new Date().toISOString().slice(0, 10),
    amount: "",
    activity_fees: "",
    education_fees: "",
    payer_name: "",
  });

  useEffect(() => {
    supabase.from("students").select("id, full_name, student_code").order("full_name").limit(500)
      .then(({ data }) => setStudents(data ?? []));
  }, []);

  useEffect(() => {
    if (!form.student_id) { setReceiptCount(null); return; }
    supabase.from("receipts").select("id", { count: "exact", head: true }).eq("student_id", form.student_id)
      .then(({ count }) => setReceiptCount(count ?? 0));
  }, [form.student_id]);

  const isFirst = receiptCount === 0;

  const computedAmount = useMemo(() => {
    if (!isFirst) return Number(form.amount) || 0;
    return (Number(form.activity_fees) || 0) + (Number(form.education_fees) || 0);
  }, [isFirst, form.amount, form.activity_fees, form.education_fees]);

  if (!(isFinance || isAdmin)) {
    return <div className="text-center text-muted-foreground py-12">إضافة إيصالات متاحة للشؤون المالية فقط</div>;
  }

  async function handleImageChange(f: File | null) {
    setImageFile(f);
    if (!f) { setImagePreview(null); return; }
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(f);
  }

  async function runExtraction() {
    if (!imageFile) return toast.error("ارفع صورة الإيصال أولاً");
    if (receiptCount === null) return toast.error("اختر الطالب أولاً");
    setExtracting(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const s = r.result as string;
          resolve(s.split(",")[1] ?? "");
        };
        r.onerror = reject;
        r.readAsDataURL(imageFile);
      });
      const result = await extractFn({ data: { imageBase64: base64, mimeType: imageFile.type || "image/jpeg", isFirst } });
      const r = result as Record<string, string | number | null>;
      setForm((prev) => ({
        ...prev,
        receipt_number: r.receipt_number != null ? String(r.receipt_number) : prev.receipt_number,
        receipt_date: r.receipt_date ? String(r.receipt_date) : prev.receipt_date,
        amount: r.amount != null ? String(r.amount) : prev.amount,
        activity_fees: r.activity_fees != null ? String(r.activity_fees) : prev.activity_fees,
        education_fees: r.education_fees != null ? String(r.education_fees) : prev.education_fees,
      }));
      toast.success("تم استخراج البيانات من الصورة");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل استخراج البيانات");
    } finally {
      setExtracting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.student_id) return toast.error("اختر الطالب");
    if (!form.receipt_number.trim()) return toast.error("أدخل رقم الإيصال");
    if (computedAmount <= 0) return toast.error("المبلغ يجب أن يكون أكبر من صفر");

    setLoading(true);
    let image_url: string | null = null;
    if (imageFile) {
      const ext = imageFile.name.split(".").pop() || "jpg";
      const path = `${form.student_id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("receipt-images").upload(path, imageFile, { contentType: imageFile.type });
      if (upErr) { setLoading(false); return toast.error("فشل رفع الصورة: " + upErr.message); }
      image_url = path;
    }

    const payload: Record<string, unknown> = isFirst
      ? {
          student_id: form.student_id,
          receipt_number: form.receipt_number.trim(),
          receipt_date: new Date().toISOString().slice(0, 10),
          activity_fees: Number(form.activity_fees) || 0,
          education_fees: Number(form.education_fees) || 0,
          amount: computedAmount,
          payer_name: form.payer_name || null,
          status: "pending",
          image_url,
        }
      : {
          student_id: form.student_id,
          receipt_number: form.receipt_number.trim(),
          receipt_date: form.receipt_date || null,
          amount: Number(form.amount) || 0,
          payer_name: form.payer_name || null,
          status: "pending",
          image_url,
        };

    const { data, error } = await supabase.from("receipts").insert(payload as never).select("id").maybeSingle();
    setLoading(false);
    if (error) return toast.error(error.message);
    const { logActivity } = await import("@/lib/audit");
    await logActivity("create", "receipt", data?.id, { amount: computedAmount, first: isFirst });
    toast.success("تم إنشاء الإيصال — بانتظار الاعتماد");
    navigate({ to: "/receipts" });
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold">إضافة إيصال جديد</h1>
      <form onSubmit={submit}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>بيانات الإيصال</span>
              {receiptCount !== null && (
                isFirst
                  ? <Badge className="bg-primary text-primary-foreground">أول إيصال</Badge>
                  : <Badge variant="outline">قسط رقم {receiptCount + 1}</Badge>
              )}
            </CardTitle>
          </CardHeader>
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

            {isFirst ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>رقم الإيصال *</Label><Input value={form.receipt_number} onChange={(e) => setForm({ ...form, receipt_number: e.target.value })} required /></div>
                <div className="space-y-2"><Label>رسوم التعليم *</Label><Input type="number" step="0.01" value={form.education_fees} onChange={(e) => setForm({ ...form, education_fees: e.target.value })} /></div>
                <div className="space-y-2"><Label>رسوم النشاط *</Label><Input type="number" step="0.01" value={form.activity_fees} onChange={(e) => setForm({ ...form, activity_fees: e.target.value })} /></div>
                <div className="space-y-2"><Label>الإجمالي (تلقائي)</Label><Input value={computedAmount} readOnly className="bg-muted font-bold" /></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>تاريخ الإيصال *</Label><Input type="date" value={form.receipt_date} onChange={(e) => setForm({ ...form, receipt_date: e.target.value })} required /></div>
                <div className="space-y-2"><Label>رقم الإيصال *</Label><Input value={form.receipt_number} onChange={(e) => setForm({ ...form, receipt_number: e.target.value })} required /></div>
                <div className="space-y-2 sm:col-span-2"><Label>المبلغ *</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
              </div>
            )}

            <div className="space-y-2"><Label>اسم الدافع</Label><Input value={form.payer_name} onChange={(e) => setForm({ ...form, payer_name: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground">سيتم احتساب المبلغ في حساب الطالب فور اعتماد الإيصال.</p>
          </CardContent>
        </Card>
        <div className="flex gap-3 mt-6">
          <Button type="submit" disabled={loading || !form.student_id}>حفظ</Button>
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/receipts" })}>إلغاء</Button>
        </div>
      </form>
    </div>
  );
}
