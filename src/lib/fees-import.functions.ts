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
      
      const fees: FeesData[] = [];
      
      // معالجة كل ورقة في المصنف
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as (string | number)[][];
        
        if (!jsonData || jsonData.length < 2) continue;
        
        // الصف الأول يحتوي على معلومات الفصل والرسوم
        const firstRow = jsonData[0];
        if (!firstRow || firstRow.length === 0) continue;
        
        // ادمج جميع خلايا الصف الأول كنص واحد
        const firstRowText = firstRow.map(r => String(r || "")).join(" ");
        
        // ابحث عن اسم الفصل (KG1, G1, Grade 1, 1، إلخ)
        const gradeMatch = firstRowText.match(/(KG\d+|G\d+|Grade\s*\d+|\d+)\b/i);
        if (!gradeMatch) continue;
        
        const gradeName = gradeMatch[1];
        
        // ابحث عن الأرقام مع كلمات القسط والإجمالي
        let firstInstall = 0;
        let secondInstall = 0;
        let goldenBatch = 0;
        
        // قسط أول (مع معالجة الصيغ المختلفة)
        const firstMatch = firstRowText.match(/قسط\s*(?:اول|أول|اولى|أولى|اوله|أوله)\s*[:\-\s]*(\d+)/i);
        if (firstMatch) firstInstall = parseFloat(firstMatch[1]) || 0;
        
        // قسط ثاني
        const secondMatch = firstRowText.match(/قسط\s*(?:تاني|ثاني|تانى|ثانى|تانية|ثانية)\s*[:\-\s]*(\d+)/i);
        if (secondMatch) secondInstall = parseFloat(secondMatch[1]) || 0;
        
        // دفعة ذهبية / إجمالي (الاجمالى هو الدفعة الذهبية)
        const goldenMatch = firstRowText.match(/(?:اجمال|إجمال|دفعة\s*ذهب|ذهبية)\s*[:\-\s]*(\d+)/i);
        if (goldenMatch) goldenBatch = parseFloat(goldenMatch[1]) || 0;
        
        // إذا وجدنا رسوم، أضفها
        if (firstInstall > 0 || secondInstall > 0 || goldenBatch > 0) {
          fees.push({
            grade_name: gradeName,
            first_installment: firstInstall,
            second_installment: secondInstall,
            golden_batch_fees: goldenBatch,
          });
        }
      }
      
      if (fees.length === 0) {
        throw new Error("لم يتم العثور على بيانات. تأكد من أن الملف يحتوي على أسماء الفصول والرسوم");
      }
      
      return { success: true, fees, count: fees.length };
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "فشل في قراءة الملف");
    }
  });
