import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { importFeesFromExcel } from "@/lib/fees-import.functions";
import { Loader2, Upload as UploadIcon, CheckCircle2 } from "lucide-react";
import { logActivity } from "@/lib/audit";

interface FeeRow {
  grade_name: string;
  first_installment: number;
  second_installment: number;
  golden_batch_fees: number;
  golden_first_installment?: number;
  golden_second_installment?: number;
  red_text_student_names?: string[];
}

export const Route = createFileRoute("/finance/import-fees")({
  head: () => ({ meta: [{ title: "استيراد الرسوم من الاكسيل" }] }),
  component: () => <AppShell><FinanceImportFees /></AppShell>,
});

function FinanceImportFees() {
  const navigate = useNavigate();
  const { isFinance, isAdmin } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const importFn = useServerFn(importFeesFromExcel);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (!(isFinance || isAdmin)) {
    return <div className="text-center text-muted-foreground py-12">هذه الصفحة متاحة للشؤون المالية فقط</div>;
  }

  async function handleFileSelect(f: File | null) {
    setSelectedFile(f);
    setFees([]);
    if (!f) return;

    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64 = (e.target?.result as string).split(",")[1];
          const result = await importFn({ data: { fileBase64: base64 } });
          
          if (result.success && result.fees) {
            setFees(result.fees);
            setPreviewOpen(true);
            toast.success(`تم قراءة ${result.count} صف من الملف`);
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "فشل في قراءة الملف");
          setSelectedFile(null);
          setFees([]);
        } finally {
          setLoading(false);
        }
      };
      reader.readAsDataURL(f);
    } catch (err) {
      toast.error("خطأ في معالجة الملف");
      setLoading(false);
    }
  }

  async function applyFees() {
    if (fees.length === 0) return;
    
    setApplying(true);
    try {
      let successCount = 0;
      let gradeNotFoundCount = 0;

      for (const fee of fees) {
        // البحث عن الـ grade
        const { data: gradeData } = await supabase
          .from("grades")
          .select("id")
          .ilike("name", `%${fee.grade_name}%`)
          .maybeSingle();

        if (!gradeData) {
          gradeNotFoundCount++;
          continue;
        }

        // تحديث جميع الطلاب في هذا الفصل بالأقساط العادية
        const { error: updateError } = await supabase
          .from("students")
          .update({
            first_installment: fee.first_installment,
            second_installment: fee.second_installment,
          })
          .eq("grade_id", gradeData.id)
          .is("archived_year", null);

        // إذا كانت هناك دفعة ذهبية وأسماء محددة بالأحمر، طبقها على تلك الأسماء فقط
        if (fee.golden_batch_fees > 0 && fee.red_text_student_names && fee.red_text_student_names.length > 0) {
          // تحديث الطلاب المحددين بالدفعة الذهبية
          for (const studentName of fee.red_text_student_names) {
            await supabase
              .from("students")
              .update({
                golden_batch_fees: fee.golden_batch_fees,
                first_installment: fee.golden_first_installment || fee.first_installment,
                second_installment: fee.golden_second_installment || fee.second_installment,
              })
              .eq("grade_id", gradeData.id)
              .ilike("name", `%${studentName.trim()}%`)
              .is("archived_year", null);
          }
        }

        if (!updateError) {
          successCount++;
        }
      }

      setApplying(false);
      
      await logActivity("إنشاء", "استيراد_رسوم", null, {
        total_rows: fees.length,
        success_count: successCount,
        not_found: gradeNotFoundCount,
      });

      if (successCount > 0) {
        toast.success(`تم تحديث ${successCount} فصل بنجاح`);
      }
      if (gradeNotFoundCount > 0) {
        toast.warning(`${gradeNotFoundCount} فصل لم يتم العثور عليه`);
      }

      navigate({ to: "/finance/installments" });
    } catch (err) {
      setApplying(false);
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n));

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">استيراد جدول الرسوم</h1>
        <p className="text-muted-foreground mt-1">رفع ملف اكسيل يحتوي على الرسوم حسب الفصول</p>
      </div>

      {fees.length === 0 ? (
        <Card>
          <CardHeader><CardTitle>رفع الملف</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
              />
              
              <Button 
                variant="outline" 
                size="lg" 
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                    جاري القراءة...
                  </>
                ) : (
                  <>
                    <UploadIcon className="ml-2 h-5 w-5" />
                    اختر ملف الاكسيل
                  </>
                )}
              </Button>

              {selectedFile && !loading && (
                <p className="mt-4 text-sm text-muted-foreground">
                  ✓ {selectedFile.name}
                </p>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">📋 تنسيق الملف المتوقع:</h3>
              <ul className="text-sm text-blue-900 space-y-1 list-disc list-inside">
                <li>جدول بسيط بأعمدة: الفصل | القسط الأول | القسط الثاني | الدفعة الذهبية</li>
                <li>الصف الأول يحتوي على رؤوس الأعمدة</li>
                <li>كل صف يمثل فصل واحد فقط</li>
                <li>يتم تجاهل الصفوف الفارغة والصفوف الخاصة (total, كشوفات، إلخ)</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>معاينة البيانات</CardTitle>
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-right">الفصل</th>
                    <th className="px-4 py-2 text-right">القسط الأول</th>
                    <th className="px-4 py-2 text-right">القسط الثاني</th>
                    <th className="px-4 py-2 text-right">الدفعة الذهبية</th>
                    <th className="px-4 py-2 text-right">قسط ذهبي أول</th>
                    <th className="px-4 py-2 text-right">قسط ذهبي ثاني</th>
                  </tr>
                </thead>
                <tbody>
                  {fees.map((fee, idx) => (
                    <>
                      <tr key={idx} className="border-t hover:bg-muted/50">
                        <td className="px-4 py-2 font-medium">{fee.grade_name}</td>
                        <td className="px-4 py-2">{fmt(fee.first_installment)}</td>
                        <td className="px-4 py-2">{fmt(fee.second_installment)}</td>
                        <td className="px-4 py-2">
                          {fee.golden_batch_fees > 0 ? (
                            <Badge variant="destructive">{fmt(fee.golden_batch_fees)}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {fee.golden_first_installment ? fmt(fee.golden_first_installment) : "—"}
                        </td>
                        <td className="px-4 py-2">
                          {fee.golden_second_installment ? fmt(fee.golden_second_installment) : "—"}
                        </td>
                      </tr>
                      {fee.red_text_student_names && fee.red_text_student_names.length > 0 && (
                        <tr className="bg-red-50 border-t">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="space-y-3">
                              <div>
                                <p className="text-sm font-semibold text-red-900 mb-2">👥 الطلاب باللون الأحمر (يطبق عليهم الدفعة الذهبية):</p>
                                <div className="flex flex-wrap gap-2 mb-3">
                                  {fee.red_text_student_names.map((name, idx) => (
                                    <Badge key={idx} variant="outline" className="text-red-700 border-red-300">
                                      {name}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              {(fee.golden_batch_fees > 0 || fee.golden_first_installment > 0 || fee.golden_second_installment > 0) && (
                                <div className="bg-white border border-red-200 rounded p-3">
                                  <p className="text-xs font-semibold text-red-800 mb-2">💰 الدفعات الذهبية الخاصة بهم:</p>
                                  <div className="grid grid-cols-3 gap-2">
                                    {fee.golden_batch_fees > 0 && (
                                      <div className="text-center">
                                        <p className="text-xs text-red-700">الإجمالي</p>
                                        <p className="text-sm font-bold text-red-900">{fmt(fee.golden_batch_fees)}</p>
                                      </div>
                                    )}
                                    {fee.golden_first_installment > 0 && (
                                      <div className="text-center">
                                        <p className="text-xs text-red-700">قسط ذهبي أول</p>
                                        <p className="text-sm font-bold text-red-900">{fmt(fee.golden_first_installment)}</p>
                                      </div>
                                    )}
                                    {fee.golden_second_installment > 0 && (
                                      <div className="text-center">
                                        <p className="text-xs text-red-700">قسط ذهبي ثاني</p>
                                        <p className="text-sm font-bold text-red-900">{fmt(fee.golden_second_installment)}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-900">
                ⚠️ سيتم تحديث جميع الطلاب في كل فصل بالرسوم المحددة. الطلاب المحفوظين لن يتأثروا.
              </p>
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={applyFees} 
                disabled={applying}
                className="flex-1"
              >
                {applying ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    جاري التحديث...
                  </>
                ) : (
                  "تطبيق الرسوم على الطلاب"
                )}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setFees([]);
                  setSelectedFile(null);
                  setPreviewOpen(false);
                }}
              >
                ملف آخر
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
