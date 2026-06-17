import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useState } from "react";
import { useDropzone } from "react-dropzone";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";

export const Route = createFileRoute("/imports/")({
  head: () => ({ meta: [{ title: "استيراد ملفات Excel" }] }),
  component: () => <AppShell><Imports /></AppShell>,
});

type RowMap = Record<string, unknown>;
interface Preview {
  rows: RowMap[];
  toInsert: number;
  toUpdate: number;
  errors: string[];
}

const COL_ALIASES: Record<string, string[]> = {
  full_name: ["الاسم","اسم الطالب","name","student_name","fullname"],
  student_code: ["كود","الكود","كود الطالب","student_code","code"],
  national_id: ["الرقم القومي للطالب","الرقم القومي","رقم قومي","national_id","nid"],
  birth_date: ["تاريخ الميلاد","birth_date","dob"],
  birth_place: ["محل الميلاد","birth_place"],
  gender: ["النوع","gender"],
  religion: ["الديانة","religion"],
  mother_name: ["اسم الأم","mother_name"],
  mother_national_id: ["الرقم القومى للام","الرقم القومي للأم","mother_national_id"],
  father_national_id: ["الرقم القومي للأب","الرقم القومى للاب","father_national_id"],
  guardian_job: ["وظيفة ولي الأمر","guardian_job"],
  guardian_name: ["اسم ولي الأمر","guardian_name"],
  address: ["العنوان","address"],
  phone: ["رقم الموبايل","الهاتف","phone","mobile"],
  first_installment: ["القسط الأول","قسط اول","first_installment"],
  second_installment: ["القسط الثاني","قسط ثاني","second_installment"],
  previous_installments: ["أقساط سابقة","أقساط سنوات سابقة","previous_installments"],
  other_fees: ["رسوم أخرى","رسوم اخرى","other_fees"],
};

function parseBirthDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // Try M/D/YYYY or D/M/YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]), y = Number(m[3].length === 2 ? "20" + m[3] : m[3]);
    // Assume M/D/Y as in sample (12/20/2020)
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    const d = new Date(y, month - 1, day);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function normalize(row: RowMap): RowMap {
  const out: RowMap = {};
  for (const [field, aliases] of Object.entries(COL_ALIASES)) {
    for (const key of Object.keys(row)) {
      const k = key.toString().trim().toLowerCase();
      if (aliases.some(a => a.toLowerCase() === k)) { out[field] = row[key]; break; }
    }
  }
  return out;
}

import { useAuth } from "@/hooks/use-auth";
function Imports() {
  const { isStudentAffairs, isAdmin } = useAuth();
  if (!(isStudentAffairs || isAdmin)) return <div className="text-center text-muted-foreground py-12">هذه الصفحة متاحة لشؤون الطلاب فقط</div>;
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importing, setImporting] = useState(false);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"], "application/vnd.ms-excel": [".xls"] },
    maxFiles: 1,
    onDrop: async (files) => {
      const file = files[0]; if (!file) return;
      setParsing(true); setPreview(null);
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<RowMap>(ws);
        const rows = raw.map(normalize).filter(r => r.full_name || r.student_code || r.national_id);
        if (rows.length === 0) { toast.error("لم يتم العثور على أعمدة معروفة"); setParsing(false); return; }
        const codes = rows.map(r => r.student_code).filter(Boolean) as string[];
        const nids = rows.map(r => r.national_id).filter(Boolean) as string[];
        const existing = new Set<string>();
        if (codes.length) {
          const { data } = await supabase.from("students").select("student_code").in("student_code", codes);
          (data ?? []).forEach(d => d.student_code && existing.add(`c:${d.student_code}`));
        }
        if (nids.length) {
          const { data } = await supabase.from("students").select("national_id").in("national_id", nids);
          (data ?? []).forEach(d => d.national_id && existing.add(`n:${d.national_id}`));
        }
        let toUpdate = 0, toInsert = 0;
        rows.forEach(r => {
          const key = r.student_code ? `c:${r.student_code}` : r.national_id ? `n:${r.national_id}` : "";
          if (key && existing.has(key)) toUpdate++; else toInsert++;
        });
        setPreview({ rows, toInsert, toUpdate, errors: [] });
        toast.success(`تم تحليل ${rows.length} صف`);
      } catch (err) {
        toast.error("فشل قراءة الملف"); console.error(err);
      } finally { setParsing(false); }
    },
  });

  async function confirmImport() {
    if (!preview) return;
    setImporting(true);
    let inserted = 0, updated = 0, skipped = 0;
    for (const r of preview.rows) {
      const payload = {
        full_name: String(r.full_name ?? "").trim() || "بدون اسم",
        student_code: r.student_code ? String(r.student_code) : null,
        national_id: r.national_id ? String(r.national_id) : null,
        first_installment: Number(r.first_installment ?? 0) || 0,
        second_installment: Number(r.second_installment ?? 0) || 0,
        previous_installments: Number(r.previous_installments ?? 0) || 0,
        other_fees: Number(r.other_fees ?? 0) || 0,
      };
      let existing: { id: string } | null = null;
      if (payload.student_code) {
        const { data } = await supabase.from("students").select("id").eq("student_code", payload.student_code).maybeSingle();
        existing = data;
      }
      if (!existing && payload.national_id) {
        const { data } = await supabase.from("students").select("id").eq("national_id", payload.national_id).maybeSingle();
        existing = data;
      }
      if (existing) {
        const { error } = await supabase.from("students").update(payload).eq("id", existing.id);
        if (error) skipped++; else updated++;
      } else {
        const { error } = await supabase.from("students").insert(payload);
        if (error) skipped++; else inserted++;
      }
    }
    await supabase.from("student_imports").insert({
      rows_total: preview.rows.length, rows_inserted: inserted, rows_updated: updated, rows_skipped: skipped,
    });
    const { logActivity } = await import("@/lib/audit");
    await logActivity("import", "import", null, { inserted, updated, skipped, total: preview.rows.length });
    setImporting(false); setPreview(null);
    toast.success(`تم: ${inserted} إضافة · ${updated} تحديث · ${skipped} تخطي`);
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">استيراد ملفات Excel</h1>
        <p className="text-muted-foreground mt-1">رفع ملفات الأقساط (XLSX/XLS) — مطابقة تلقائية بالكود أو الرقم القومي</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
            <input {...getInputProps()} />
            {parsing ? <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" /> : <Upload className="h-10 w-10 mx-auto text-muted-foreground" />}
            <p className="mt-3 font-medium">اسحب الملف هنا أو اضغط للاختيار</p>
            <p className="text-sm text-muted-foreground mt-1">XLSX، XLS</p>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />معاينة الاستيراد</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-3 mb-4 flex-wrap">
              <Badge className="bg-success text-success-foreground">جديد: {preview.toInsert}</Badge>
              <Badge className="bg-warning text-warning-foreground">تحديث: {preview.toUpdate}</Badge>
              <Badge variant="outline">إجمالي: {preview.rows.length}</Badge>
            </div>
            <div className="border rounded-md overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0"><tr>
                  <th className="px-2 py-2 text-right">الاسم</th><th className="px-2 py-2 text-right">الكود</th>
                  <th className="px-2 py-2 text-right">قسط 1</th><th className="px-2 py-2 text-right">قسط 2</th>
                  <th className="px-2 py-2 text-right">سابقة</th><th className="px-2 py-2 text-right">أخرى</th>
                </tr></thead>
                <tbody>
                  {preview.rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1.5">{String(r.full_name ?? "—")}</td>
                      <td className="px-2 py-1.5">{String(r.student_code ?? "—")}</td>
                      <td className="px-2 py-1.5">{String(r.first_installment ?? 0)}</td>
                      <td className="px-2 py-1.5">{String(r.second_installment ?? 0)}</td>
                      <td className="px-2 py-1.5">{String(r.previous_installments ?? 0)}</td>
                      <td className="px-2 py-1.5">{String(r.other_fees ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 mt-4">
              <Button onClick={confirmImport} disabled={importing}>
                {importing && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}تأكيد الاستيراد
              </Button>
              <Button variant="outline" onClick={() => setPreview(null)} disabled={importing}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
