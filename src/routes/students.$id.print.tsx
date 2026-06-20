import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer, ArrowRight, Pencil } from "lucide-react";
import { formatAge } from "@/lib/age";

export const Route = createFileRoute("/students/$id/print")({
  head: () => ({ meta: [{ title: "طباعة بيانات الطالب" }] }),
  component: PrintStudent,
});

const FIELDS: { key: string; label: string; format?: (v: unknown, s: Record<string, unknown>) => string }[] = [
  { key: "full_name", label: "اسم الطالب" },
  { key: "student_code", label: "كود الطالب" },
  { key: "national_id", label: "الرقم القومي للطالب" },
  { key: "birth_date", label: "تاريخ الميلاد" },
  { key: "_age", label: "السن (1/10)", format: (_v, s) => formatAge(s.birth_date as string | null) },
  { key: "birth_place", label: "محل الميلاد" },
  { key: "gender", label: "النوع" },
  { key: "religion", label: "الديانة" },
  { key: "mother_name", label: "اسم الأم" },
  { key: "mother_national_id", label: "الرقم القومي للأم" },
  { key: "father_national_id", label: "الرقم القومي للأب" },
  { key: "guardian_name", label: "ولي الأمر" },
  { key: "guardian_job", label: "وظيفة ولي الأمر" },
  { key: "address", label: "العنوان" },
  { key: "phone", label: "الهاتف 1" },
  { key: "phone2", label: "الهاتف 2" },
  { key: "first_installment", label: "القسط الأول" },
  { key: "second_installment", label: "القسط الثاني" },
  { key: "previous_installments", label: "أقساط سابقة" },
  { key: "other_fees", label: "رسوم أخرى" },
  { key: "total_due", label: "إجمالي المستحق" },
  { key: "total_paid", label: "إجمالي المدفوع" },
  { key: "remaining_balance", label: "المتبقي" },
  { key: "is_transferred_in", label: "محول للمدرسة", format: (v) => (v ? "نعم" : "لا") },
];

function PrintStudent() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState<Record<string, unknown> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(FIELDS.map(f => f.key)));

  useEffect(() => {
    supabase.from("students").select("*").eq("id", id).maybeSingle()
      .then(({ data }) => setStudent(data as Record<string, unknown> | null));
  }, [id]);

  const rows = useMemo(() => {
    if (!student) return [];
    return FIELDS.filter(f => selected.has(f.key)).map(f => {
      const raw = student[f.key];
      const val = f.format ? f.format(raw, student) : (raw == null || raw === "" ? "—" : String(raw));
      return { label: f.label, val };
    });
  }, [student, selected]);

  if (!student) return <div className="text-center text-muted-foreground py-12">جاري التحميل...</div>;

  function toggle(key: string) {
    const next = new Set(selected);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelected(next);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <div className="flex items-center gap-3">
          <Link to="/students/$id" params={{ id }}><Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4" /></Button></Link>
          <h1 className="text-2xl font-bold">طباعة بيانات الطالب</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/students/$id/edit" params={{ id }} search={{ from: "print" }}>
            <Button variant="outline"><Pencil className="ml-2 h-4 w-4" />تعديل البيانات</Button>
          </Link>
          <Button variant="outline" onClick={() => setSelected(new Set(FIELDS.map(f => f.key)))}>اختر الكل</Button>
          <Button variant="outline" onClick={() => setSelected(new Set())}>تفريغ</Button>
          <Button onClick={() => window.print()}><Printer className="ml-2 h-4 w-4" />طباعة / حفظ PDF</Button>
        </div>
      </div>

      <Card className="no-print">
        <CardHeader><CardTitle>اختر البيانات المراد طباعتها</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {FIELDS.map(f => (
            <label key={f.key} className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={selected.has(f.key)} onCheckedChange={() => toggle(f.key)} />
              <span className="text-sm">{f.label}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <div className="print-area bg-white text-black p-8 rounded-lg border">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold">{String(student.full_name ?? "")}</h2>
          <p className="text-sm">طباعة بيانات الطالب</p>
        </div>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b">
                <th className="text-right py-2 px-3 bg-gray-100 w-1/3">{r.label}</th>
                <td className="py-2 px-3">{r.val}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-area { border: none !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>
    </div>
  );
}
