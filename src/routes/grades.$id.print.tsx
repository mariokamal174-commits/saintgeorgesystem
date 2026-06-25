import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer } from "lucide-react";
import { formatAge } from "@/lib/age";

export const Route = createFileRoute("/grades/$id/print")({
  head: () => ({ meta: [{ title: "طباعة بيانات الصف" }] }),
  component: PrintGrade,
});

const FIELDS: { key: string; label: string; format?: (value: unknown, student: Record<string, unknown>) => string }[] = [
  { key: "full_name", label: "اسم الطالب" },
  { key: "student_code", label: "كود الطالب" },
  { key: "national_id", label: "الرقم القومي" },
  { key: "birth_date", label: "تاريخ الميلاد" },
  { key: "_age", label: "السن (1/10)", format: (_value, student) => formatAge(student.birth_date as string | null) },
  { key: "phone", label: "الهاتف 1" },
  { key: "phone2", label: "الهاتف 2" },
  { key: "guardian_name", label: "ولي الأمر" },
  { key: "total_due", label: "إجمالي المستحق", format: (value) => formatAmount(value) },
  { key: "total_paid", label: "إجمالي المدفوع", format: (value) => formatAmount(value) },
  { key: "remaining_balance", label: "المتبقي", format: (value) => formatAmount(value) },
  { key: "payment_status", label: "حالة السداد", format: (value) => paymentStatusLabel(value) },
  { key: "is_transferred_in", label: "محول للمدرسة", format: (value) => (value ? "نعم" : "لا") },
];

function formatAmount(value: unknown) {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat("ar-EG").format(num);
}

function paymentStatusLabel(value: unknown) {
  switch (String(value)) {
    case "paid":
      return "مسدد بالكامل";
    case "partial":
      return "مدفوع جزئيًا";
    case "unpaid":
      return "غير مسدد";
    default:
      return "—";
  }
}

function PrintGrade() {
  const { id } = Route.useParams();
  const [grade, setGrade] = useState<Record<string, unknown> | null>(null);
  const [students, setStudents] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(FIELDS.map((f) => f.key)));

  useEffect(() => {
    const gradeQuery = supabase.from("grades").select("*").eq("id", id).maybeSingle();
    const studentsQuery = supabase
      .from("students")
      .select(
        "*, classes(name), grades(name), total_due, total_paid, remaining_balance, payment_status, is_transferred_in"
      )
      .eq("grade_id", id)
      .order("full_name");

    Promise.all([gradeQuery, studentsQuery]).then(([gradeRes, studentsRes]) => {
      setGrade(gradeRes.data as Record<string, unknown> | null);
      setStudents((studentsRes.data ?? []) as Record<string, unknown>[]);
    });
  }, [id]);

  const visibleFields = useMemo(() => FIELDS.filter((field) => selected.has(field.key)), [selected]);

  const totals = useMemo(() => {
    return students.reduce(
      (acc, student) => {
        acc.totalDue += Number(student.total_due ?? 0) || 0;
        acc.totalPaid += Number(student.total_paid ?? 0) || 0;
        acc.remaining += Number(student.remaining_balance ?? 0) || 0;
        return acc;
      },
      { totalDue: 0, totalPaid: 0, remaining: 0 },
    );
  }, [students]);

  if (!grade) return <div className="text-center text-muted-foreground py-12">جاري التحميل...</div>;

  const gradeName = String(grade.name ?? "الصف");

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <div>
          <h1 className="text-2xl font-bold">طباعة بيانات الصف</h1>
          <p className="text-sm text-muted-foreground">{gradeName}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSelected(new Set(FIELDS.map((f) => f.key)))}>اختر الكل</Button>
          <Button variant="outline" onClick={() => setSelected(new Set())}>تفريغ</Button>
          <Button onClick={() => window.print()}><Printer className="ml-2 h-4 w-4" />طباعة / حفظ PDF</Button>
        </div>
      </div>

      <Card className="no-print">
        <CardHeader><CardTitle>اختر أعمدة الطلاب المراد طباعتها</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {FIELDS.map((field) => (
            <label key={field.key} className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={selected.has(field.key)} onCheckedChange={() => toggle(field.key)} />
              <span className="text-sm">{field.label}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <div className="print-area bg-white text-black p-8 rounded-[28px] border border-slate-200 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="mb-6">
          <div className="text-center mb-4">
            <img src="/school-logo.png" alt="Saint George International Schools" className="mx-auto mb-4 h-24 w-auto object-contain" />
            <h2 className="text-2xl font-bold">{gradeName}</h2>
            <p className="text-sm text-slate-500">مدرسة سانت جورج الدولية</p>
            <p className="text-sm text-slate-500">طباعة بيانات الصف</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">عدد الطلاب</div>
              <div className="font-semibold">{students.length}</div>
            </div>
            <div>
              <div className="text-muted-foreground">إجمالي المستحق</div>
              <div className="font-semibold">{formatAmount(totals.totalDue)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">إجمالي المدفوع</div>
              <div className="font-semibold">{formatAmount(totals.totalPaid)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">المتبقي</div>
              <div className="font-semibold">{formatAmount(totals.remaining)}</div>
            </div>
          </div>
        </div>

        {students.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">لا يوجد طلاب مسجلين في هذا الصف.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm table-fixed">
              <thead>
                <tr>
                  {visibleFields.map((field) => (
                    <th key={field.key} className="text-right py-2 px-3 bg-gray-100 border border-gray-200">{field.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={String(student.id ?? Math.random())} className="border-b last:border-b-0">
                    {visibleFields.map((field) => {
                      const raw = field.key === "_age" ? undefined : student[field.key];
                      const value = field.key === "_age"
                        ? field.format?.(raw, student)
                        : field.format
                          ? field.format(raw, student)
                          : raw == null || raw === ""
                            ? "—"
                            : String(raw);
                      return (
                        <td key={field.key} className="py-2 px-3 border border-gray-200 align-top">{value}</td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-area { 
            border: 1px solid #CBD5E1 !important; 
            box-shadow: none !important; 
            padding: 8px !important;
            margin: 0 auto !important;
            max-width: 100% !important;
          }
          .print-area table { width: 100% !important; min-width: unset !important; border-collapse: collapse !important; table-layout: fixed !important; }
          .print-area th, .print-area td { padding: 4px 6px !important; border: 1px solid #E5E7EB !important; word-break: break-word !important; }
          .print-area thead th { background: #F3F4F6 !important; }
          /* avoid rows being split across pages */
          .print-area tr { page-break-inside: avoid; break-inside: avoid-column; }
          /* Use landscape to fit many columns */
          @page { margin: 1.2cm; size: A4 landscape; }
        }
        @media screen {
          .print-area table { table-layout: fixed; }
        }
      `}</style>
    </div>
  );
}
