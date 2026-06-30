import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { extractReceiptData } from "@/lib/ai-receipt.functions";
import { Loader2, Sparkles, Upload as UploadIcon } from "lucide-react";
import { logActivity } from "@/lib/audit";

interface Search { studentId?: string }

type ReceiptType = "installment" | "activity_fees";

export const Route = createFileRoute("/finance/receipt-upload")({
  head: () => ({ meta: [{ title: "رفع إيصالات الأقساط والرسوم" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({ studentId: typeof s.studentId === "string" ? s.studentId : undefined }),
  component: () => <AppShell><FinanceReceiptUpload /></AppShell>,
});

const RECEIPT_TYPE_LABELS: Record<ReceiptType, string> = {
  installment: "قسط",
  activity_fees: "رسوم النشاط",
};

function FinanceReceiptUpload() {
  const { studentId } = Route.useSearch();
  const navigate = useNavigate();
  const { isFinance, isAdmin } = useAuth();
  const extractFn = useServerFn(extractReceiptData);
  const fileRef1 = useRef<HTMLInputElement>(null);
  const fileRef2 = useRef<HTMLInputElement>(null);
  
  const [students, setStudents] = useState<{ id: string; full_name: string; student_code: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [imageFile1, setImageFile1] = useState<File | null>(null);
  const [imagePreview1, setImagePreview1] = useState<string | null>(null);
  const [imageFile2, setImageFile2] = useState<File | null>(null);
  const [imagePreview2, setImagePreview2] = useState<string | null>(null);
  
  const [form, setForm] = useState({
    student_id: studentId ?? "",
    receipt_type: "installment" as ReceiptType,
    installment_type: "first" as "first" | "second" | "both",
    receipt_number: "",
    receipt_date: new Date().toISOString().slice(0, 10),
    amount: "",
    activity_fees: "",
    education_fees: "",
    payer_name: "",
  });
  
  const [studentQuery, setStudentQuery] = useState("");
  const [activeStudentQuery, setActiveStudentQuery] = useState("");
  const [selectOpen, setSelectOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const selectedStudent = students.find((s) => s.id === form.student_id);
  const studentOptions = useMemo(() => {
    const query = activeStudentQuery.trim().toLowerCase();
    if (!query) return students;
    return students.filter((s) => {
      const name = s.full_name.toLowerCase();
      const code = String(s.student_code ?? "").toLowerCase();
      return name.includes(query) || code.includes(query);
    });
  }, [students, activeStudentQuery]);

  useEffect(() => {
    if (selectOpen) {
      searchInputRef.current?.focus();
    }
  }, [selectOpen]);

  useEffect(() => {
    supabase.from("students").select("id, full_name, student_code").is("archived_year", null).order("full_name").limit(500)
      .then(({ data }) => setStudents(data ?? []));
  }, []);

  if (!(isFinance || isAdmin)) {
    return <div className="text-center text-muted-foreground py-12">رفع الإيصالات متاح للشؤون المالية فقط</div>;
  }

  async function handleImageChange1(f: File | null) {
    setImageFile1(f);
    if (!f) { setImagePreview1(null); return; }
    const reader = new FileReader();
    reader.onload = () => setImagePreview1(reader.result as string);
    reader.readAsDataURL(f);
  }

  async function handleImageChange2(f: File | null) {
    setImageFile2(f);
    if (!f) { setImagePreview2(null); return; }
    const reader = new FileReader();
    reader.onload = () => setImagePreview2(reader.result as string);
    reader.readAsDataURL(f);
  }

  async function extractFromFile(file: File, rType: typeof form.receipt_type) {
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(((r.result as string).split(",")[1]) ?? "");
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    
    const result = await extractFn({ 
      data: { 
        imageBase64: base64, 
        mimeType: file.type || "image/jpeg", 
        extractInstallmentType: rType === "installment",
        receiptType: rType,
      } 
    });
    return result as Record<string, string | number | null>;
  }

  async function runExtraction() {
    if (!imageFile1 && !imageFile2) return toast.error("ارفع صورة إيصال واحدة على الأقل");
    setExtracting(true);
    try {
      const promises: Promise<Record<string, string | number | null>>[] = [];
      if (imageFile1) {
        promises.push(extractFromFile(imageFile1, form.receipt_type));
      }
      if (imageFile2) {
        promises.push(extractFromFile(imageFile2, form.receipt_type));
      }

      const results = await Promise.all(promises);

      if (results.length === 1) {
        const r = results[0];
        setForm((prev) => ({
          ...prev,
          receipt_number: r.receipt_number != null ? String(r.receipt_number) : prev.receipt_number,
          receipt_date: r.receipt_date ? String(r.receipt_date) : prev.receipt_date,
          amount: r.amount != null ? String(Number(r.amount) || 0) : prev.amount,
          activity_fees: r.activity_fees != null ? String(r.activity_fees) : prev.activity_fees,
          education_fees: r.education_fees != null ? String(r.education_fees) : prev.education_fees,
          installment_type: (r.installment_type === "second" ? "second" : r.installment_type === "both" ? "both" : "first") as "first" | "second" | "both",
        }));
      } else if (results.length === 2) {
        const r1 = results[0];
        const r2 = results[1];

        // رقم الإيصال
        const num1 = r1.receipt_number != null ? String(r1.receipt_number).trim() : "";
        const num2 = r2.receipt_number != null ? String(r2.receipt_number).trim() : "";
        const combinedNumber = num1 && num2 ? `${num1} + ${num2}` : (num1 || num2);

        // التاريخ
        const date1 = r1.receipt_date ? String(r1.receipt_date) : "";
        const date2 = r2.receipt_date ? String(r2.receipt_date) : "";
        const combinedDate = date1 && date2 ? (date1 > date2 ? date1 : date2) : (date1 || date2);

        // المبالغ
        const amt1 = Number(r1.amount) || 0;
        const amt2 = Number(r2.amount) || 0;
        const combinedAmount = String(amt1 + amt2);

        // رسوم النشاط ورسوم التعليم
        const act1 = Number(r1.activity_fees) || 0;
        const act2 = Number(r2.activity_fees) || 0;
        const combinedActivity = String(act1 + act2);

        const edu1 = Number(r1.education_fees) || 0;
        const edu2 = Number(r2.education_fees) || 0;
        const combinedEducation = String(edu1 + edu2);

        // نوع القسط
        const instType = (r1.installment_type === "both" || r2.installment_type === "both") 
          ? "both" 
          : (r1.installment_type === "second" || r2.installment_type === "second") 
            ? "second" 
            : "first";

        setForm((prev) => ({
          ...prev,
          receipt_number: combinedNumber || prev.receipt_number,
          receipt_date: combinedDate || prev.receipt_date,
          amount: combinedAmount,
          activity_fees: combinedActivity || prev.activity_fees,
          education_fees: combinedEducation || prev.education_fees,
          installment_type: instType as "first" | "second" | "both",
        }));
      }
      
      toast.success("تم استخراج البيانات من الصور بنجاح ودمجها");
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
    const amt = Number(form.amount) || 0;
    if (amt <= 0) return toast.error("أدخل المبلغ");

    setLoading(true);
    try {
      let image_url: string | null = null;
      const uploadedPaths: string[] = [];

      if (imageFile1) {
        const ext = imageFile1.name.split(".").pop() || "jpg";
        const typeFolder = form.receipt_type === "installment" ? "installments" : "activity-fees";
        const path = `${typeFolder}/${form.student_id}/${Date.now()}_1.${ext}`;
        const { error: upErr } = await supabase.storage.from("receipt-images").upload(path, imageFile1, { contentType: imageFile1.type });
        if (upErr) throw new Error("فشل رفع الصورة الأولى: " + upErr.message);
        uploadedPaths.push(path);
      }

      if (imageFile2) {
        const ext = imageFile2.name.split(".").pop() || "jpg";
        const typeFolder = form.receipt_type === "installment" ? "installments" : "activity-fees";
        const path = `${typeFolder}/${form.student_id}/${Date.now()}_2.${ext}`;
        const { error: upErr } = await supabase.storage.from("receipt-images").upload(path, imageFile2, { contentType: imageFile2.type });
        if (upErr) throw new Error("فشل رفع الصورة الثانية: " + upErr.message);
        uploadedPaths.push(path);
      }

      if (uploadedPaths.length > 0) {
        image_url = uploadedPaths.join(",");
      }

      // حفظ الإيصال
      const activityFees = form.receipt_type === "installment" ? (Number(form.activity_fees) || 0) : (form.receipt_type === "activity_fees" ? amt : 0);
      const totalInstallmentAmount = form.receipt_type === "installment" ? (amt - activityFees - (Number(form.education_fees) || 0)) : (form.receipt_type === "activity_fees" ? 0 : amt);
      const payload: Record<string, unknown> = {
        student_id: form.student_id,
        receipt_number: form.receipt_number.trim(),
        receipt_date: form.receipt_date || null,
        amount: amt,
        activity_fees: activityFees,
        education_fees: form.receipt_type === "installment" ? (Number(form.education_fees) || 0) : 0,
        payer_name: form.payer_name || null,
        status: "approved",
        image_url,
      };

      const { data: receiptData, error: receiptError } = await supabase.from("receipts").insert(payload as never).select("id").maybeSingle();
      if (receiptError) throw receiptError;

      // ملاحظة: لا يجب تحديث first_installment/second_installment/activity_fees من هنا
      // هذه الحقول تمثل المبلغ المستحق (total_due) وتُحدَّث من صفحة إدارة الأقساط فقط.
      // الإيصال المعتمد يُحدَّث total_paid تلقائياً عبر الـ trigger في قاعدة البيانات.
      const student = students.find(s => s.id === form.student_id);

      setLoading(false);
      const studentName = student?.full_name ?? "—";
      const typeText = RECEIPT_TYPE_LABELS[form.receipt_type];
      const installmentText = form.receipt_type === "installment" 
        ? (form.installment_type === "both" ? "الأول والثاني" : form.installment_type === "second" ? "الثاني" : "الأول")
        : "";
      
      await logActivity("إنشاء", "إيصال", receiptData?.id, {
        amount: amt,
        type: typeText,
        installment_info: installmentText,
        receipt_number: form.receipt_number.trim(),
        student_name: studentName,
        has_image: !!image_url,
      });
      
      toast.success("تم حفظ الإيصال وتحديث البيانات");
      navigate({ to: "/finance/installments" });
    } catch (err) {
      setLoading(false);
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">رفع الإيصالات والرسوم</h1>
        <p className="text-muted-foreground mt-1">رفع صور الإيصالات (أقساط، رسوم تعليم، رسوم نشاط) وتحديث البيانات تلقائياً</p>
      </div>
      
      <form onSubmit={submit}>
        <Card>
          <CardHeader><CardTitle>بيانات الإيصال والقسط</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>الطالب *</Label>
              <Select
                value={form.student_id}
                onValueChange={(v) => setForm({ ...form, student_id: v })}
                open={selectOpen}
                onOpenChange={setSelectOpen}
              >
                <SelectTrigger><SelectValue placeholder="اختر الطالب" /></SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-2">
                    <Input
                      ref={searchInputRef}
                      value={studentQuery}
                      onChange={(e) => setStudentQuery(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") {
                          e.preventDefault();
                          setActiveStudentQuery(studentQuery.trim());
                        }
                      }}
                      onKeyUp={(e) => e.stopPropagation()}
                      onKeyPress={(e) => e.stopPropagation()}
                      onBlur={() => setActiveStudentQuery(studentQuery.trim())}
                      placeholder="ابحث عن طالب..."
                      className="w-full"
                    />
                  </div>
                  <div className="border-t border-muted/30" />
                  {studentOptions.length > 0 ? studentOptions.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name} {s.student_code && `(${s.student_code})`}</SelectItem>
                  )) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">لا يوجد نتائج</div>
                  )}
                </SelectContent>
              </Select>
              {selectedStudent && (
                <div className="text-sm text-muted-foreground">الطالب المحدد: {selectedStudent.full_name}{selectedStudent.student_code ? ` (${selectedStudent.student_code})` : ""}</div>
              )}
            </div>

            <div className="space-y-2">
              <Label>نوع الإيصال *</Label>
              <Select value={form.receipt_type} onValueChange={(v) => setForm({ ...form, receipt_type: v as ReceiptType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="installment">قسط (مع الرسوم)</SelectItem>
                  <SelectItem value="activity_fees">رسوم النشاط</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.receipt_type === "installment" && (
              <div className="space-y-2">
                <Label>نوع القسط *</Label>
                <Select value={form.installment_type} onValueChange={(v) => setForm({ ...form, installment_type: v as typeof form.installment_type })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first">القسط الأول</SelectItem>
                    <SelectItem value="second">القسط الثاني</SelectItem>
                    <SelectItem value="both">القسط الأول والثاني معاً</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">يمكن استخراج النوع تلقائياً من الصورة</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded-lg p-4 bg-muted/30">
              <div className="space-y-2 border rounded-lg p-3 bg-background">
                <Label>صورة الإيصال الأول *</Label>
                <input
                  ref={fileRef1}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageChange1(e.target.files?.[0] ?? null)}
                />
                <div className="flex flex-wrap gap-2 items-center">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef1.current?.click()}>
                    <UploadIcon className="ml-2 h-4 w-4" />
                    {imageFile1 ? "تغيير الصورة" : "اختر صورة"}
                  </Button>
                  {imageFile1 && (
                    <Button type="button" variant="ghost" size="sm" className="text-red-500 h-8" onClick={() => handleImageChange1(null)}>
                      حذف
                    </Button>
                  )}
                  {imageFile1 && <span className="text-xs text-muted-foreground truncate max-w-[150px]">{imageFile1.name}</span>}
                </div>
                {imagePreview1 && (
                  <img src={imagePreview1} alt="معاينة الإيصال الأول" className="mt-2 max-h-40 object-contain rounded border w-full bg-slate-50" />
                )}
              </div>

              <div className="space-y-2 border rounded-lg p-3 bg-background">
                <Label>صورة الإيصال الثاني (اختياري)</Label>
                <input
                  ref={fileRef2}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageChange2(e.target.files?.[0] ?? null)}
                />
                <div className="flex flex-wrap gap-2 items-center">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef2.current?.click()}>
                    <UploadIcon className="ml-2 h-4 w-4" />
                    {imageFile2 ? "تغيير الصورة" : "اختر صورة"}
                  </Button>
                  {imageFile2 && (
                    <Button type="button" variant="ghost" size="sm" className="text-red-500 h-8" onClick={() => handleImageChange2(null)}>
                      حذف
                    </Button>
                  )}
                  {imageFile2 && <span className="text-xs text-muted-foreground truncate max-w-[150px]">{imageFile2.name}</span>}
                </div>
                {imagePreview2 && (
                  <img src={imagePreview2} alt="معاينة الإيصال الثاني" className="mt-2 max-h-40 object-contain rounded border w-full bg-slate-50" />
                )}
              </div>

              <div className="md:col-span-2 flex justify-center pt-2">
                <Button 
                  type="button" 
                  size="sm" 
                  disabled={(!imageFile1 && !imageFile2) || extracting} 
                  onClick={runExtraction}
                  className="w-full sm:w-auto"
                >
                  {extracting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Sparkles className="ml-2 h-4 w-4" />}
                  استخراج البيانات بالذكاء الاصطناعي ودمجها
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>رقم الإيصال *</Label><Input value={form.receipt_number} onChange={(e) => setForm({ ...form, receipt_number: e.target.value })} required /></div>
              <div className="space-y-2"><Label>تاريخ الإيصال *</Label><Input type="date" value={form.receipt_date} onChange={(e) => setForm({ ...form, receipt_date: e.target.value })} required /></div>
              <div className="space-y-2"><Label>المبلغ *</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
              <div className="space-y-2"><Label>اسم الدافع</Label><Input value={form.payer_name} onChange={(e) => setForm({ ...form, payer_name: e.target.value })} /></div>
            </div>

            {form.receipt_type === "installment" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-2"><Label>رسوم التعليم</Label><Input type="number" step="0.01" value={form.education_fees} onChange={(e) => setForm({ ...form, education_fees: e.target.value })} /></div>
                <div className="space-y-2"><Label>رسوم النشاط</Label><Input type="number" step="0.01" value={form.activity_fees} onChange={(e) => setForm({ ...form, activity_fees: e.target.value })} /></div>
              </div>
            )}

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900">💡 <strong>ملاحظة:</strong> سيتم حفظ الصورة في قسم الحسابات وتحديث البيانات تلقائياً</p>
            </div>
          </CardContent>
        </Card>
        <div className="flex gap-3 mt-6">
          <Button type="submit" disabled={loading || !form.student_id}>حفظ الإيصال</Button>
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/finance/installments" })}>إلغاء</Button>
        </div>
      </form>
    </div>
  );
}
