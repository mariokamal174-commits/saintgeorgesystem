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

function sanitizeString(s: string): string {
  if (!s) return "";
  return s
    .toString()
    // Remove zero-width spaces, RTL/LTR marks, control chars, and non-breaking spaces
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u00A0]/g, "")
    // Trim and lowercase
    .trim()
    .toLowerCase()
    // Normalize Hamzas: أ, إ, آ => ا
    .replace(/[أإآ]/g, "ا")
    // Normalize Alef Maksura: ى => ي
    .replace(/ى/g, "ي")
    // Normalize Teh Marbuta: ة => ه
    .replace(/ة/g, "ه")
    // Strip Arabic Tashkeel (diacritics)
    .replace(/[\u064B-\u0652]/g, "");
}

function normalize(row: RowMap): RowMap {
  const out: RowMap = {};
  for (const [field, aliases] of Object.entries(COL_ALIASES)) {
    for (const key of Object.keys(row)) {
      const sanitizedKey = sanitizeString(key);
      if (aliases.some(alias => sanitizeString(alias) === sanitizedKey)) {
        out[field] = row[key];
        break;
      }
    }
  }
  return out;
}

import { useAuth } from "@/hooks/use-auth";
function Imports() {
  const { isStudentAffairs, isAdmin } = useAuth();
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importing, setImporting] = useState(false);
  const [errorDetails, setErrorDetails] = useState<{
    sheets: string[];
    bestSheet?: string;
    foundHeaders: string[];
    maxMatches: number;
  } | null>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"], "application/vnd.ms-excel": [".xls"] },
    maxFiles: 1,
    onDrop: async (files) => {
      const file = files[0]; if (!file) return;
      setParsing(true); setPreview(null); setErrorDetails(null);
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        if (wb.SheetNames.length === 0) {
          toast.error("الملف لا يحتوي على أي صفحات");
          setParsing(false);
          return;
        }

        // Flatten all aliases for match counting
        const allAliasSet = new Set(
          Object.values(COL_ALIASES).flat().map(a => sanitizeString(a))
        );

        // Find the sheet and the row that contains the maximum number of matches with our aliases
        let ws = wb.Sheets[wb.SheetNames[0]];
        let bestSheetName = wb.SheetNames[0];
        let overallMaxMatches = 0;
        let bestHeaderIdx = 0;
        let bestRawRows: unknown[][] = [];

        for (const name of wb.SheetNames) {
          const sheet = wb.Sheets[name];
          const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
          if (rawRows.length === 0) continue;

          // Scan the first 20 rows of this sheet
          const scanLimit = Math.min(rawRows.length, 20);
          for (let i = 0; i < scanLimit; i++) {
            const row = rawRows[i];
            if (!Array.isArray(row)) continue;
            let matches = 0;
            for (const cell of row) {
              if (cell != null) {
                const cleaned = sanitizeString(String(cell));
                if (allAliasSet.has(cleaned)) {
                  matches++;
                }
              }
            }
            if (matches > overallMaxMatches) {
              overallMaxMatches = matches;
              bestHeaderIdx = i;
              ws = sheet;
              bestSheetName = name;
              bestRawRows = rawRows;
            }
          }
        }

        // If no matches found in any sheet, fall back to first sheet's first row
        if (overallMaxMatches === 0) {
          const firstSheet = wb.Sheets[wb.SheetNames[0]];
          bestRawRows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1 });
          ws = firstSheet;
          bestSheetName = wb.SheetNames[0];
          bestHeaderIdx = 0;
        }

        // Get the header values from the best header row
        const headers = (bestRawRows[bestHeaderIdx] || []) as unknown[];

        // Convert rows after the header row into objects
        const rawObjects: RowMap[] = [];
        for (let i = bestHeaderIdx + 1; i < bestRawRows.length; i++) {
          const row = bestRawRows[i];
          if (!Array.isArray(row) || row.every(cell => cell == null || cell === "")) continue;

          const obj: RowMap = {};
          for (let j = 0; j < headers.length; j++) {
            const headerName = String(headers[j] ?? "").trim();
            if (headerName) {
              obj[headerName] = row[j];
            }
          }
          rawObjects.push(obj);
        }

        const rows = rawObjects.map(normalize).filter(r => r.full_name || r.student_code || r.national_id);
        if (rows.length === 0) {
          setErrorDetails({
            sheets: wb.SheetNames,
            bestSheet: bestSheetName,
            foundHeaders: headers.map(h => String(h ?? "")),
            maxMatches: overallMaxMatches,
          });
          toast.error("لم يتم العثور على أعمدة معروفة. تأكد من أن أسماء الأعمدة في الملف مطابقة للأسماء المطلوبة.");
          setParsing(false);
          return;
        }

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

  if (!(isStudentAffairs || isAdmin)) return <div className="text-center text-muted-foreground py-12">هذه الصفحة متاحة لشؤون الطلاب فقط</div>;

  async function confirmImport() {
    if (!preview) return;
    setImporting(true);
    let inserted = 0, updated = 0, skipped = 0;
    for (const r of preview.rows) {
      const payload = {
        full_name: String(r.full_name ?? "").trim() || "بدون اسم",
        student_code: r.student_code ? String(r.student_code) : null,
        national_id: r.national_id ? String(r.national_id) : null,
        birth_date: parseBirthDate(r.birth_date),
        birth_place: r.birth_place ? String(r.birth_place) : null,
        gender: r.gender ? String(r.gender) : null,
        religion: r.religion ? String(r.religion) : null,
        mother_name: r.mother_name ? String(r.mother_name) : null,
        mother_national_id: r.mother_national_id ? String(r.mother_national_id) : null,
        father_national_id: r.father_national_id ? String(r.father_national_id) : null,
        guardian_name: r.guardian_name ? String(r.guardian_name) : null,
        guardian_job: r.guardian_job ? String(r.guardian_job) : null,
        address: r.address ? String(r.address) : null,
        phone: r.phone ? String(r.phone) : null,
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

      {errorDetails && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive text-lg font-bold flex items-center gap-2">
              ⚠️ تفاصيل الخطأ في مطابقة الأعمدة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm" dir="rtl">
            <p className="text-muted-foreground">
              لم نستطع العثور على أعمدة أساسية (مثل: اسم الطالب أو الرقم القومي) في الملف المرفوع. إليك التفاصيل الفنية لمساعدتك في تعديل الملف:
            </p>
            <div className="space-y-2 bg-background p-4 rounded-lg border text-right">
              <div>
                <strong>الصفحات المتوفرة في الملف:</strong>{" "}
                <span className="font-mono">{errorDetails.sheets.join(" · ")}</span>
              </div>
              {errorDetails.bestSheet && (
                <div>
                  <strong>الصفحة التي تم تحليلها:</strong>{" "}
                  <span className="font-mono text-primary font-bold">{errorDetails.bestSheet}</span>
                </div>
              )}
              <div>
                <strong>أكبر عدد أعمدة متطابقة في سطر واحد:</strong>{" "}
                <span className="font-mono font-bold text-destructive">{errorDetails.maxMatches} عمود</span>
              </div>
              <div>
                <strong>عناوين الأعمدة المقروءة في السطر المحدد:</strong>
                <div className="mt-1 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-muted rounded font-mono text-xs">
                  {errorDetails.foundHeaders.length > 0 ? (
                    errorDetails.foundHeaders.map((h, i) => (
                      <Badge key={i} variant="outline" className="bg-background">
                        {h || "—"}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground">لا توجد عناوين أعمدة مقروءة</span>
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              💡 نصيحة: تأكد من أن الملف يحتوي على عمود باسم <strong>"اسم الطالب"</strong> أو <strong>"الرقم القومي للطالب"</strong> أو <strong>"الاسم"</strong> في رأس الجدول بشكل واضح.
            </p>
          </CardContent>
        </Card>
      )}

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
