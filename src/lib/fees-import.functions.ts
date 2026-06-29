import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as XLSX from "xlsx";

interface FeesData {
  grade_name: string;
  first_installment: number;
  second_installment: number;
  golden_batch_fees: number;
  other_fees?: number;
}

export const importFeesFromExcel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { fileBase64: string };
    if (!i?.fileBase64) throw new Error("Missing file");
    return i;
  })
  .handler(async ({ data }) => {
    try {
      // تحويل base64 إلى Buffer
      const binaryString = Buffer.from(data.fileBase64, "base64").toString("binary");
      
      // قراءة الملف
      const workbook = XLSX.read(binaryString, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // قراءة البيانات
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as (string | number)[][];
      
      const fees: FeesData[] = [];
      
      // البحث عن رؤوس الأعمدة
      let gradeCol = -1, firstInstallCol = -1, secondInstallCol = -1, goldenCol = -1;
      
      // البحث عن الـ header row
      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(10, jsonData.length); i++) {
        const row = jsonData[i];
        if (!row) continue;
        
        // ابحث عن كلمات مثل "الفصل" أو "grade" في هذا الصف
        const rowStr = row.join(" ").toLowerCase();
        if (rowStr.includes("فصل") || rowStr.includes("grade")) {
          headerRowIdx = i;
          break;
        }
      }
      
      // إذا وجدنا الـ header
      if (headerRowIdx >= 0 && headerRowIdx < jsonData.length) {
        const headerRow = jsonData[headerRowIdx];
        
        // ابحث عن الأعمدة
        headerRow.forEach((header, idx) => {
          const h = String(header).toLowerCase().trim();
          if (h.includes("فصل") || h.includes("grade")) gradeCol = idx;
          if (h.includes("قسط") && h.includes("أول")) firstInstallCol = idx;
          if (h.includes("قسط") && h.includes("ثاني")) secondInstallCol = idx;
          if (h.includes("ذهب") || h.includes("دفعة")) goldenCol = idx;
        });
        
        // إذا لم نجد أعمدة معينة، استنتجها من الموضع النسبي
        if (gradeCol === -1) gradeCol = 0;
        if (firstInstallCol === -1) firstInstallCol = 1;
        if (secondInstallCol === -1) secondInstallCol = 2;
        if (goldenCol === -1) goldenCol = 3;
        
        // معالجة الصفوف بعد الـ header
        for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;
          
          const gradeName = String(row[gradeCol] || "").trim();
          if (!gradeName) continue;
          
          // تجاهل الصفوف الخاصة (total, كشف، خزينة، sheet)
          const lowerGrade = gradeName.toLowerCase();
          if (
            lowerGrade === "total" ||
            lowerGrade.includes("كشف") ||
            lowerGrade.includes("خزينة") ||
            lowerGrade.includes("sheet") ||
            lowerGrade.length < 2
          ) {
            continue;
          }
          
          // قراءة الأرقام
          const first = parseFloat(String(row[firstInstallCol] || 0).replace(/[^0-9.-]/g, "")) || 0;
          const second = parseFloat(String(row[secondInstallCol] || 0).replace(/[^0-9.-]/g, "")) || 0;
          const golden = parseFloat(String(row[goldenCol] || 0).replace(/[^0-9.-]/g, "")) || 0;
          
          // أضف فقط إذا كان هناك أرقام صحيحة
          if (first > 0 || second > 0 || golden > 0) {
            fees.push({
              grade_name: gradeName,
              first_installment: first,
              second_installment: second,
              golden_batch_fees: golden,
            });
          }
        }
      }
      
      if (fees.length === 0) {
        throw new Error("لم يتم العثور على بيانات صحيحة في الملف. تأكد من وجود جدول بأسماء الفصول والرسوم");
      }
      
      return { success: true, fees, count: fees.length };
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "فشل في قراءة الملف");
    }
  });
